// 블록 대전 — 떨어지는 블록으로 줄을 지워 상대에게 방해 줄을 보낸다.
// 낙하 블록 장르의 표준 규칙: 네 칸짜리 7가지 모양, 가로 10칸 × 세로 20칸, 7개씩 섞어 나오는 순서,
// 표준 회전과 벽차기, 고스트, 바로 떨구기, 보관, 다음 블록 5개, 바닥에 닿은 뒤 잠깐 움직일 시간(이동하면 다시 늘어남).

import { startVersus } from "./versus.js?v=4";
import { label } from "./kit.js?v=3";

const COLS = 10, ROWS = 20, HID = 6, TR = ROWS + HID;      // 보이는 판 위로 숨은 6줄
// 첫 모양(n×n 상자 안). 나머지 방향은 상자째 시계 방향으로 돌려서 만든다.
const BASE = [
  { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]], name: "I" },   // 일자
  { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]], name: "O" },   // 네모
  { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]], name: "T" },   // ㅗ
  { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]], name: "S" },   // 계단
  { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]], name: "Z" },   // 반대 계단
  { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]], name: "J" },   // ㄴ
  { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]], name: "L" },   // 반대 ㄴ
];
const rotCW = (c, n) => c.map(([x, y]) => [n - 1 - y, x]);
const SHAPES = BASE.map((b) => { const r = [b.c]; for (let k = 1; k < 4; k++) r.push(rotCW(r[k - 1], b.n)); return { n: b.n, r, name: b.name }; });
const T_ID = 2;

// 벽차기 (표준 표). 표는 y 가 위쪽이 + 라서 쓸 때 뒤집는다. 방향: 0 처음, 1 오른쪽, 2 뒤집힘, 3 왼쪽
const K_JLSTZ = {
  "01": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], "10": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "12": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], "21": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "23": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], "32": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "30": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], "03": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const K_I = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], "10": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], "21": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], "32": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "30": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], "03": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// 우리 오락실 색 (블록마다 하나씩, 9 는 방해 줄)
const PAL = ["", "#ff7a90", "#ffc93c", "#7ddc7a", "#6ec6ff", "#b79cff", "#ff9f5a", "#5fe0c8", "#ff8fd0", "#8f93b8"];
const PAL_D = ["", "#d94f68", "#d99a12", "#48ac4a", "#3a94d9", "#8463dd", "#dd7428", "#2fae97", "#dd5aa6", "#62668c"];
const colorOf = (id) => id + 1;

// 공격량: 지운 줄 수, T스핀, 콤보, 연속 보너스
const ATK = [0, 0, 1, 2, 4];
const ATK_T = [0, 2, 4, 6];
const COMBO = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const LOCK_DELAY = 0.5, LOCK_RESETS = 15, MAX_LEVEL = 10;
const gravity = (lv) => Math.pow(0.8 - (lv - 1) * 0.007, lv - 1);      // 한 칸 내려오는 데 걸리는 초 (레벨 1 = 1초)

function hits(g, c, x, y) {
  for (const [cx, cy] of c) {
    const X = x + cx, Y = y + cy;
    if (X < 0 || X >= COLS || Y < 0 || Y >= TR) return true;
    if (g[Y * COLS + X]) return true;
  }
  return false;
}
const cells = (p) => SHAPES[p.id].r[p.r];

function fill(b) {
  while (b.next.length < 6) {
    if (!b.bag.length) {
      b.bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = b.bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b.bag[i], b.bag[j]] = [b.bag[j], b.bag[i]]; }
    }
    b.next.push(b.bag.pop());
  }
}

function spawn(b, keep) {
  fill(b);
  let id = keep;
  if (id == null) { id = b.next.shift(); fill(b); b.held = false; }
  const n = SHAPES[id].n;
  b.cur = { id, r: 0, x: n === 2 ? 4 : 3, y: HID - 1 };      // 한 칸 내려오면 보이는 판 맨 윗줄에 온전히 보인다
  const p = b.cur;
  if (hits(b.g, cells(p), p.x, p.y)) { b.alive = false; b.cur = null; return; }
  if (!hits(b.g, cells(p), p.x, p.y + 1)) p.y++;      // 나오자마자 한 칸 내려온다
  b.seq++; b.fallT = 0; b.lockT = 0; b.lockMoves = 0; b.lowY = p.y; b.lastRot = false; b.kick = 0;
}

function create() {
  const b = { g: new Uint8Array(COLS * TR), cur: null, next: [], bag: [], alive: true, out: 0, pending: 0, ev: [], soft: false, fallT: 0, lockT: 0, lockMoves: 0, lowY: 0, time: 0, combo: -1, b2b: false, seq: 0, flash: 0, hold: -1, held: false, lines: 0, lastRot: false, kick: 0, tx: "", txT: 0 };
  spawn(b);
  return b;
}
// 대전이라 줄을 많이 지운 사람만 빨라지면 불공평하다 → 시간이 지나면 모두 똑같이 빨라진다 (30초마다 한 레벨)
const level = (b) => Math.min(MAX_LEVEL, 1 + Math.floor(b.time / 30));

// 바닥에 닿은 채로 움직이면 굳는 시간이 다시 늘어난다 (블록 하나에 15번까지)
function moved(b) {
  const p = b.cur;
  if (p.y > b.lowY) { b.lowY = p.y; b.lockMoves = 0; }
  if (hits(b.g, cells(p), p.x, p.y + 1) && b.lockMoves < LOCK_RESETS) { b.lockT = 0; b.lockMoves++; }
}

function act(b, a) {
  const p = b.cur;
  if (!b.alive || !p) return false;
  if (a === "L" || a === "R") {
    const dx = a === "L" ? -1 : 1;
    if (hits(b.g, cells(p), p.x + dx, p.y)) return false;
    p.x += dx; b.lastRot = false; moved(b); return true;
  }
  if (a === "rot" || a === "rot2") {
    if (SHAPES[p.id].n === 2) return false;
    const to = (p.r + (a === "rot" ? 1 : 3)) % 4, nc = SHAPES[p.id].r[to], table = p.id === 0 ? K_I : K_JLSTZ;
    const kicks = table["" + p.r + to];
    for (let k = 0; k < kicks.length; k++) {
      const kx = kicks[k][0], ky = -kicks[k][1];
      if (!hits(b.g, nc, p.x + kx, p.y + ky)) {
        p.x += kx; p.y += ky; p.r = to; b.lastRot = true; b.kick = k;
        b.ev.push("rot"); moved(b); return true;
      }
    }
    return false;
  }
  if (a === "hold") {
    // 보관: 지금 블록을 넣어 두고 보관해 둔 블록(없으면 다음 블록)을 꺼낸다. 블록 하나에 한 번만.
    if (b.held) return false;
    const prev = b.hold; b.hold = p.id;
    spawn(b, prev >= 0 ? prev : undefined);
    b.held = true; b.ev.push("rot"); return true;
  }
  if (a === "drop") {
    let d = 0;
    while (!hits(b.g, cells(p), p.x, p.y + 1)) { p.y++; d++; }
    if (d) b.lastRot = false;
    lock(b); return true;
  }
  return false;
}

// T 블록이 돌아서 들어갔는지: 마지막 동작이 회전이고, 3×3 상자의 네 모서리 중 셋 이상이 막혀 있으면
function tspin(b) {
  const p = b.cur;
  if (p.id !== T_ID || !b.lastRot) return 0;
  const filled = (x, y) => x < 0 || x >= COLS || y >= TR || (y >= 0 && b.g[y * COLS + x]);
  const corners = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([cx, cy]) => filled(p.x + cx, p.y + cy));
  if (corners.filter(Boolean).length < 3) return 0;
  // 앞쪽 두 모서리가 다 막혔거나, 마지막 벽차기(5번째)로 들어갔으면 제대로 된 T스핀, 아니면 미니
  const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.r];
  return (corners[front[0]] && corners[front[1]]) || b.kick === 4 ? 2 : 1;
}

function say(b, text) { b.tx = text; b.txT = 1.1; }

function lock(b) {
  const p = b.cur, g = b.g, col = colorOf(p.id), ts = tspin(b);
  let allAbove = true;
  for (const [cx, cy] of cells(p)) {
    const X = p.x + cx, Y = p.y + cy;
    if (Y >= HID) allAbove = false;
    g[Y * COLS + X] = col;
  }
  b.ev.push("lock");
  // 줄 지우기
  let n = 0;
  for (let y = TR - 1; y >= 0; y--) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!g[y * COLS + x]) { full = false; break; }
    if (!full) continue;
    g.copyWithin(COLS, 0, y * COLS); g.fill(0, 0, COLS);
    n++; y++;
  }
  if (n > 0) {
    b.lines += n; b.combo++; b.flash = 0.25;
    const big = n === 4 || ts > 0, wasB2B = b.b2b;
    let atk = ts === 2 ? ATK_T[n] : ts === 1 ? Math.max(ATK[n], n - 1) : ATK[n];
    if (big && wasB2B) atk += 1;
    atk += COMBO[Math.min(b.combo, COMBO.length - 1)];
    const clear = !g.some((v) => v);
    if (clear) atk += 10;
    b.b2b = big;
    const name = ts === 2 ? `T스핀 ${["", "싱글", "더블", "트리플"][n]}!` : ts === 1 ? "T스핀 미니!" : n === 4 ? "4줄!" : n >= 2 ? n + "줄!" : "";
    if (clear) say(b, "판을 싹 비웠다!"); else if (name) say(b, (big && wasB2B ? "연속 " : "") + name);
    const use = Math.min(b.pending, atk); b.pending -= use; atk -= use;   // 받을 방해부터 지운다
    b.out += atk;
    b.ev.push("c" + n);
  } else {
    if (ts === 2) say(b, "T스핀!");
    b.combo = -1;
    if (allAbove) { b.alive = false; b.cur = null; return; }
    if (b.pending > 0) {
      // 방해 줄: 한 번에 최대 8줄, 같은 번에 올라오는 줄은 구멍 자리가 같다
      const rows = Math.min(b.pending, 8), hole = (Math.random() * COLS) | 0; b.pending -= rows;
      for (let i = 0; i < rows * COLS; i++) if (g[i]) { b.alive = false; }   // 위로 밀려 넘치면 끝
      g.copyWithin(0, rows * COLS);
      for (let r = 0; r < rows; r++) { const y = TR - rows + r; for (let x = 0; x < COLS; x++) g[y * COLS + x] = x === hole ? 0 : 9; }
      b.ev.push("garbage");
      if (!b.alive) { b.cur = null; return; }
    }
  }
  spawn(b);
}

function step(b, dt) {
  if (b.txT > 0) b.txT -= dt;
  if (!b.alive || !b.cur) return;
  b.time += dt; if (b.flash > 0) b.flash -= dt;
  const p = b.cur, g = gravity(level(b)), iv = b.soft ? Math.min(g, 0.033) : g;
  b.fallT += dt;
  while (b.fallT >= iv) {
    b.fallT -= iv;
    if (!hits(b.g, cells(p), p.x, p.y + 1)) { p.y++; b.lastRot = false; if (p.y > b.lowY) { b.lowY = p.y; b.lockMoves = 0; } }
    else { b.fallT = 0; break; }
  }
  if (hits(b.g, cells(p), p.x, p.y + 1)) { b.lockT += dt; if (b.lockT >= LOCK_DELAY || b.lockMoves >= LOCK_RESETS && b.lockT >= 0.1) lock(b); } else b.lockT = 0;
}

// ── 보기용 판 ──
function view(b) {
  let g = "";
  for (let i = HID * COLS; i < TR * COLS; i++) g += b.g[i];
  let c = null, gh = null;
  if (b.cur) {
    const p = b.cur; let gy = p.y;
    while (!hits(b.g, cells(p), p.x, gy + 1)) gy++;
    c = [colorOf(p.id)]; gh = [];
    for (const [cx, cy] of cells(p)) { c.push(p.x + cx, p.y + cy - HID); gh.push(p.x + cx, gy + cy - HID); }
  }
  const top = g.search(/[1-9]/);
  return { g, c, gh, al: b.alive, fl: b.flash > 0, dg: top >= 0 && top < 4 * COLS, cb: b.flash > 0 && b.combo > 0 ? b.combo : 0, tx: b.txT > 0 ? b.tx : "" };
}
const encode = (v) => JSON.stringify({ g: v.g, c: v.c, al: v.al });
const decode = (s) => JSON.parse(s);
const blank = () => ({ g: "0".repeat(COLS * ROWS), c: null, al: true });

function block(ctx, x, y, s, ci, mini) {
  ctx.fillStyle = PAL_D[ci]; ctx.fillRect(x, y, s, s);
  if (mini) { ctx.fillStyle = PAL[ci]; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); return; }
  const r = s * 0.22;
  ctx.fillStyle = PAL[ci];
  ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, s - 3, s - 4.5, r); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.beginPath(); ctx.ellipse(x + s * 0.32, y + s * 0.28, s * 0.16, s * 0.09, -0.5, 0, 7); ctx.fill();
}

function draw(ctx, v, x, y, cell, t, mini) {
  for (let i = 0; i < v.g.length; i++) {
    const ci = +v.g[i];
    if (ci) block(ctx, x + (i % COLS) * cell, y + ((i / COLS) | 0) * cell, cell, ci, mini);
  }
  if (v.gh && !mini) {      // 고스트: 떨어질 자리
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2;
    for (let i = 0; i < v.gh.length; i += 2) if (v.gh[i + 1] >= 0) { ctx.fillRect(x + v.gh[i] * cell + 2, y + v.gh[i + 1] * cell + 2, cell - 4, cell - 4); ctx.strokeRect(x + v.gh[i] * cell + 2, y + v.gh[i + 1] * cell + 2, cell - 4, cell - 4); }
  }
  if (v.c) for (let i = 1; i < v.c.length; i += 2) if (v.c[i + 1] >= 0) block(ctx, x + v.c[i] * cell, y + v.c[i + 1] * cell, cell, v.c[0], mini);
  if (v.fl) { ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(x, y, COLS * cell, ROWS * cell); }
  if (v.dg && !mini && v.al) {       // 많이 쌓이면 위쪽이 빨갛게 깜빡인다
    ctx.fillStyle = `rgba(255,93,115,${0.12 + 0.12 * Math.sin(t * 9)})`; ctx.fillRect(x, y, COLS * cell, 4 * cell);
    ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x, y + 4 * cell); ctx.lineTo(x + COLS * cell, y + 4 * cell); ctx.stroke(); ctx.setLineDash([]);
  }
  if (!mini) {
    if (v.tx) label(ctx, v.tx, x + (COLS * cell) / 2, y + ROWS * cell * 0.36, v.tx.length > 7 ? 26 : 34, "#ffd24a", "#2b2d6e");
    if (v.cb) label(ctx, v.cb + "콤보!", x + (COLS * cell) / 2, y + ROWS * cell * 0.46, 28, "#7ddc7a", "#2b2d6e");
  }
}

// 오른쪽 칸: 다음 블록 5개, 보관함, 레벨·줄
function piece(ctx, id, x, y, s, alpha = 1) {
  const sh = SHAPES[id], c = sh.r[0], minX = Math.min(...c.map((p) => p[0])), maxX = Math.max(...c.map((p) => p[0])), minY = Math.min(...c.map((p) => p[1])), maxY = Math.max(...c.map((p) => p[1]));
  const ox = x + ((4 - (maxX - minX + 1)) * s) / 2, oy = y + ((2 - (maxY - minY + 1)) * s) / 2;
  ctx.globalAlpha = alpha;
  for (const [cx, cy] of c) block(ctx, ox + (cx - minX) * s, oy + (cy - minY) * s, s, colorOf(id), false);
  ctx.globalAlpha = 1;
}
function drawNext(ctx, b, x, y, cell) {
  for (let i = 0; i < 5; i++) {
    const id = b.next[i]; if (id == null) continue;
    const s = i === 0 ? cell * 0.9 : cell * 0.66;
    piece(ctx, id, x, y + (i === 0 ? 0 : cell * 0.6 + i * cell * 1.75), s);
  }
  // 보관함
  const hy = y + cell * 10.6;
  label(ctx, "보관", x + cell * 1.6, hy, 16, "#2b2d6e", null);
  ctx.strokeStyle = "rgba(43,45,110,.35)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(x - 2, hy + 8, cell * 3.7, cell * 2.4); ctx.setLineDash([]);
  if (b.hold >= 0) piece(ctx, b.hold, x + 1, hy + 8 + cell * 0.45, cell * 0.8, b.held ? 0.4 : 1);
  label(ctx, `레벨 ${level(b)}`, x + cell * 1.7, hy + cell * 3.9, 15, "#2b2d6e", null);
  label(ctx, `${b.lines}줄`, x + cell * 1.7, hy + cell * 5, 14, "#6b6480", null);
}

// ── 봇: 모든 자리를 놓아 보고 가장 좋은 곳을 고른다 ──
const BOT = { easy: { d: 0.46, noise: 14 }, normal: { d: 0.22, noise: 4.5 }, hard: { d: 0.07, noise: 0.3 } };

function plan(b, noise) {
  const p = b.cur; let best = null;
  for (let r = 0; r < 4; r++) {
    const c = SHAPES[p.id].r[r];
    for (let x = -2; x < COLS; x++) {
      if (hits(b.g, c, x, p.y)) continue;
      let y = p.y; while (!hits(b.g, c, x, y + 1)) y++;
      const g = b.g.slice(); let above = false;
      for (const [cx, cy] of c) { if (y + cy < HID) above = true; if (y + cy >= 0) g[(y + cy) * COLS + x + cx] = 1; }
      let lines = 0;
      for (let yy = 0; yy < TR; yy++) { let full = true; for (let xx = 0; xx < COLS; xx++) if (!g[yy * COLS + xx]) { full = false; break; } if (full) { lines++; g.copyWithin(COLS, 0, yy * COLS); g.fill(0, 0, COLS); } }
      let holes = 0, agg = 0, bump = 0, prev = -1;
      for (let xx = 0; xx < COLS; xx++) {
        let h = 0, seen = false;
        for (let yy = 0; yy < TR; yy++) { const f = g[yy * COLS + xx]; if (f && !seen) { seen = true; h = TR - yy; } else if (!f && seen) holes++; }
        agg += h; if (prev >= 0) bump += Math.abs(h - prev); prev = h;
      }
      const score = lines * 7.6 - holes * 3.57 - agg * 5.1 - bump * 1.84 - (above ? 500 : 0) + Math.random() * noise;      // 널리 알려진 쌓기 가중치(높이·줄·구멍·울퉁불퉁)
      if (!best || score > best.score) best = { score, r, x };
    }
    if (SHAPES[p.id].n === 2) break;
  }
  return best || { r: 0, x: p.x };
}

function bot(b, mem, lv, dt) {
  if (!b.cur) return;
  const cfg = BOT[lv] || BOT.normal;
  if (mem.seq !== b.seq) { mem.seq = b.seq; mem.plan = plan(b, cfg.noise); mem.t = cfg.d * 1.6; mem.tries = 0; mem.replan = 0; }
  mem.t -= dt; if (mem.t > 0) return;
  mem.t = cfg.d;
  const p = b.cur, pl = mem.plan;
  if (p.r !== pl.r && mem.tries < 5) { mem.tries++; act(b, "rot"); }
  else if (p.x !== pl.x) {
    if (!act(b, p.x < pl.x ? "R" : "L")) {      // 길이 막혔으면 지금 자리에서 다시 고른다
      if (++mem.replan > 2) act(b, "drop");
      else { mem.plan = plan(b, cfg.noise); mem.tries = 0; }
    }
  }
  else act(b, "drop");
}

const G = { cols: COLS, rows: ROWS, bg: "#dfeaff", hold: true, rot2: true, nextH: 16.4, das: 0.17, arr: 0.033, create, blank, step, act, attackIn: (b, n) => { b.pending += n; }, view, encode, decode, draw, drawNext, bot };

export const meta = {
  local: true,
  portrait: true,
  soloText: "봇과 1대1. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 각자 판을 쌓아요. 마지막까지 버티면 승리.`),
  howto: [
    ["목표", "가로줄을 꽉 채우면 지워져요. 두 줄 이상 한꺼번에 지우면 상대 판에 방해 줄이 올라가요. 마지막까지 버티면 승리"],
    ["블록", "네 칸짜리 7가지가 7개씩 골고루 섞여 나와요. 오른쪽에 다음 블록 5개가 보여요"],
    ["조작", "좌우 이동 ←→, 시계 방향 돌리기 ↑ 또는 X, 반대로 돌리기 Z, 빨리 내리기 ↓, 바로 떨구기 스페이스, 보관 C 또는 Shift"],
    ["공격", "2줄 1 · 3줄 2 · 4줄 4. T 블록을 돌려 끼우면(T스핀) 더 세고, 4줄·T스핀을 연달아 하면 +1, 계속 지우면 콤보로 더 보내요. 판을 싹 비우면 +10"],
    ["빨라짐", "30초마다 한 레벨씩 블록이 빨라져요. 모두 똑같이 빨라지니 공평해요"],
    ["바닥", "바닥에 닿아도 0.5초 동안은 움직이거나 돌릴 수 있어요. 움직일 때마다 시간이 다시 늘어나요(15번까지)"],
    ["한 키보드 2인", "1P: A·D·S·W + G(반대 회전), F(떨구기), Q(보관) / 2P: 방향키 + 오른쪽 Shift(반대 회전), Enter(떨구기), 마침표(보관)"],
    ["휴대폰", "화면 아래 버튼으로 조작해요. [돌리기]는 시계 방향, [반대]는 반대 방향"],
  ],
};
export const start = (opts) => startVersus(G, opts);

export const _test = { ...G, SHAPES, K_I, K_JLSTZ, level, gravity, TR, HID, plan };
