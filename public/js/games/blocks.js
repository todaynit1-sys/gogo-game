// 블록 대전 — 떨어지는 블록으로 줄을 지워 상대에게 방해 줄을 보낸다.
// 2칸부터 4칸까지 10가지 모양, 가로 9칸 × 세로 18칸.

import { startVersus } from "./versus.js?v=2";
import { label } from "./kit.js?v=2";

const COLS = 9, ROWS = 18, HID = 3, TR = ROWS + HID;
const SHAPES = [
  { n: 2, c: [[0, 0], [1, 0]] },                                 // 2칸
  { n: 3, c: [[0, 1], [1, 1], [2, 1]] },                         // 3칸 일자
  { n: 2, c: [[0, 0], [0, 1], [1, 1]] },                         // 3칸 꺾임
  { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },                 // 네모
  { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },                 // ㄴ
  { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },                 // 반대 ㄴ
  { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },                 // ㅗ
  { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },                 // 계단
  { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },                 // 반대 계단
  { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },                 // 4칸 일자
  { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },         // 십자 (5칸)
  { n: 3, c: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },         // ㄷ (5칸)
];
const PAL = ["", "#ff7a90", "#ffc93c", "#7ddc7a", "#6ec6ff", "#b79cff", "#ff9f5a", "#5fe0c8", "#ff8fd0", "#8f93b8"];
const PAL_D = ["", "#d94f68", "#d99a12", "#48ac4a", "#3a94d9", "#8463dd", "#dd7428", "#2fae97", "#dd5aa6", "#62668c"];
const colorOf = (id) => 1 + (id % 8);
const KICKS = [[0, 0], [1, 0], [-1, 0], [0, -1], [2, 0], [-2, 0], [1, -1], [-1, -1]];
const ATK = [0, 0, 1, 2, 4, 6];

const rotCW = (c, n) => c.map(([x, y]) => [n - 1 - y, x]);
const rotCCW = (c, n) => c.map(([x, y]) => [y, n - 1 - x]);

function hits(g, c, x, y) {
  for (const [cx, cy] of c) {
    const X = x + cx, Y = y + cy;
    if (X < 0 || X >= COLS || Y >= TR) return true;
    if (Y >= 0 && g[Y * COLS + X]) return true;
  }
  return false;
}

function fill(b) {
  while (b.next.length < 4) {
    if (!b.bag.length) {
      b.bag = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];      // 5칸짜리(십자·ㄷ)는 쓰지 않는다
      for (let i = b.bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b.bag[i], b.bag[j]] = [b.bag[j], b.bag[i]]; }
    }
    b.next.push(b.bag.pop());
  }
}

function spawn(b, keep) {
  fill(b);
  let id = keep;
  if (id == null) { id = b.next.shift(); fill(b); b.held = false; }
  const sh = SHAPES[id], c = sh.c.map((p) => p.slice());
  const maxY = Math.max(...c.map((p) => p[1]));
  b.cur = { id, n: sh.n, c, x: Math.floor((COLS - sh.n) / 2), y: HID - 1 - maxY, r: 0 };
  b.seq++; b.fallT = 0; b.lockT = 0; b.lockMoves = 0;
  if (hits(b.g, c, b.cur.x, b.cur.y)) { b.alive = false; b.cur = null; }
}

function create() {
  const b = { g: new Uint8Array(COLS * TR), cur: null, next: [], bag: [], alive: true, out: 0, pending: 0, ev: [], soft: false, fallT: 0, lockT: 0, lockMoves: 0, time: 0, combo: 0, seq: 0, hole: (Math.random() * COLS) | 0, flash: 0, hold: -1, held: false };
  spawn(b);
  return b;
}

function moved(b) {
  const p = b.cur;
  if (hits(b.g, p.c, p.x, p.y + 1) && b.lockMoves < 12) { b.lockT = 0; b.lockMoves++; }
}

function act(b, a) {
  const p = b.cur;
  if (!b.alive || !p) return false;
  if (a === "L" || a === "R") {
    const dx = a === "L" ? -1 : 1;
    if (hits(b.g, p.c, p.x + dx, p.y)) return false;
    p.x += dx; moved(b); return true;
  }
  if (a === "rot" || a === "rot2") {
    const nc = a === "rot" ? rotCW(p.c, p.n) : rotCCW(p.c, p.n);
    for (const [kx, ky] of KICKS) {
      if (!hits(b.g, nc, p.x + kx, p.y + ky)) {
        p.c = nc; p.x += kx; p.y += ky; p.r = (p.r + (a === "rot" ? 1 : 3)) % 4;
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
    while (!hits(b.g, p.c, p.x, p.y + 1)) p.y++;
    lock(b); return true;
  }
  return false;
}

function lock(b) {
  const p = b.cur, g = b.g, col = colorOf(p.id);
  let allAbove = true;
  for (const [cx, cy] of p.c) {
    const X = p.x + cx, Y = p.y + cy;
    if (Y >= HID) allAbove = false;
    if (Y >= 0) g[Y * COLS + X] = col;
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
    b.combo++; b.flash = 0.25;
    let atk = ATK[Math.min(n, 5)] + (b.combo > 1 ? Math.min(3, b.combo - 1) : 0);
    const use = Math.min(b.pending, atk); b.pending -= use; atk -= use;   // 받을 방해부터 지운다
    b.out += atk;
    b.ev.push("c" + n);
  } else {
    b.combo = 0;
    if (allAbove) { b.alive = false; b.cur = null; return; }
    if (b.pending > 0) {
      const rows = Math.min(b.pending, 5); b.pending -= rows;
      for (let i = 0; i < rows * COLS; i++) if (g[i]) { b.alive = false; }   // 위로 밀려 넘치면 끝
      g.copyWithin(0, rows * COLS);
      for (let r = 0; r < rows; r++) {
        if (Math.random() < 0.3) b.hole = (Math.random() * COLS) | 0;
        const y = TR - rows + r;
        for (let x = 0; x < COLS; x++) g[y * COLS + x] = x === b.hole ? 0 : 9;
      }
      b.ev.push("garbage");
      if (!b.alive) { b.cur = null; return; }
    }
  }
  spawn(b);
}

function step(b, dt) {
  if (!b.alive || !b.cur) return;
  b.time += dt; if (b.flash > 0) b.flash -= dt;
  const p = b.cur, iv = b.soft ? 0.04 : Math.max(0.07, 0.62 - b.time * 0.004);
  b.fallT += dt;
  while (b.fallT >= iv) { b.fallT -= iv; if (!hits(b.g, p.c, p.x, p.y + 1)) p.y++; else break; }
  if (hits(b.g, p.c, p.x, p.y + 1)) { b.lockT += dt; if (b.lockT > 0.45) lock(b); } else b.lockT = 0;
}

// ── 보기용 판 ──
function view(b) {
  let g = "";
  for (let i = HID * COLS; i < TR * COLS; i++) g += b.g[i];
  let c = null, gh = null;
  if (b.cur) {
    const p = b.cur; let gy = p.y;
    while (!hits(b.g, p.c, p.x, gy + 1)) gy++;
    c = [colorOf(p.id)]; gh = [];
    for (const [cx, cy] of p.c) { c.push(p.x + cx, p.y + cy - HID); gh.push(p.x + cx, gy + cy - HID); }
  }
  const top = g.search(/[1-9]/);
  return { g, c, gh, al: b.alive, fl: b.flash > 0, dg: top >= 0 && top < 5 * COLS, cb: b.flash > 0 && b.combo > 1 ? b.combo : 0 };
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
  if (v.gh && !mini) {
    ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 2;
    for (let i = 0; i < v.gh.length; i += 2) if (v.gh[i + 1] >= 0) ctx.strokeRect(x + v.gh[i] * cell + 3, y + v.gh[i + 1] * cell + 3, cell - 6, cell - 6);
  }
  if (v.c) for (let i = 1; i < v.c.length; i += 2) if (v.c[i + 1] >= 0) block(ctx, x + v.c[i] * cell, y + v.c[i + 1] * cell, cell, v.c[0], mini);
  if (v.fl) { ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(x, y, COLS * cell, ROWS * cell); }
  if (v.dg && !mini && v.al) {       // 많이 쌓이면 위쪽이 빨갛게 깜빡인다
    ctx.fillStyle = `rgba(255,93,115,${0.12 + 0.12 * Math.sin(t * 9)})`; ctx.fillRect(x, y, COLS * cell, 5 * cell);
    ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x, y + 5 * cell); ctx.lineTo(x + COLS * cell, y + 5 * cell); ctx.stroke(); ctx.setLineDash([]);
  }
  if (v.cb && !mini) label(ctx, v.cb + "콤보!", x + (COLS * cell) / 2, y + ROWS * cell * 0.45, 40, "#ffd24a", "#2b2d6e");
}

function drawNext(ctx, b, x, y, cell) {
  for (let i = 0; i < 3; i++) {
    const id = b.next[i]; if (id == null) continue;
    const sh = SHAPES[id], s = i === 0 ? cell : cell * 0.8;
    const minY = Math.min(...sh.c.map((p) => p[1]));
    for (const [cx, cy] of sh.c) block(ctx, x + cx * s, y + i * cell * 3.1 + (cy - minY) * s, s, colorOf(id), false);
  }
  // 보관함
  const hy = y + cell * 9.6;
  label(ctx, "보관", x + cell * 1.6, hy, 16, "#2b2d6e", null);
  ctx.strokeStyle = "rgba(43,45,110,.35)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(x - 2, hy + 8, cell * 3.4, cell * 2.8); ctx.setLineDash([]);
  if (b.hold >= 0) {
    const sh = SHAPES[b.hold], s = cell * 0.8, minY = Math.min(...sh.c.map((p) => p[1]));
    ctx.globalAlpha = b.held ? 0.4 : 1;
    for (const [cx, cy] of sh.c) block(ctx, x + 4 + cx * s, hy + 16 + (cy - minY) * s, s, colorOf(b.hold), false);
    ctx.globalAlpha = 1;
  }
}

// ── 봇: 모든 자리를 놓아 보고 가장 좋은 곳을 고른다 ──
const BOT = { easy: { d: 0.36, noise: 10 }, normal: { d: 0.17, noise: 3 }, hard: { d: 0.07, noise: 0.3 } };

function plan(b, noise) {
  const p = b.cur; let best = null, c = p.c;
  for (let r = 0; r < 4; r++) {
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
      const score = lines * 9 - holes * 7.5 - agg * 0.5 - bump * 1.8 - (above ? 500 : 0) + Math.random() * noise;
      if (!best || score > best.score) best = { score, r, x };
    }
    c = rotCW(c, p.n);
  }
  return best || { r: 0, x: p.x };
}

function bot(b, mem, level, dt) {
  if (!b.cur) return;
  const cfg = BOT[level] || BOT.normal;
  if (mem.seq !== b.seq) { mem.seq = b.seq; mem.plan = plan(b, cfg.noise); mem.t = cfg.d * 1.6; mem.tries = 0; }
  mem.t -= dt; if (mem.t > 0) return;
  mem.t = cfg.d;
  const p = b.cur, pl = mem.plan;
  if (p.r !== pl.r && mem.tries < 5) { mem.tries++; act(b, "rot"); }
  else if (p.x !== pl.x) { if (!act(b, p.x < pl.x ? "R" : "L")) act(b, "drop"); }
  else act(b, "drop");
}

const G = { cols: COLS, rows: ROWS, bg: "#dfeaff", hold: true, create, blank, step, act, attackIn: (b, n) => { b.pending += n; }, view, encode, decode, draw, drawNext, bot };

export const meta = {
  local: true,
  portrait: true,
  soloText: "봇과 1대1. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 각자 판을 쌓아요. 마지막까지 버티면 승리.`),
  howto: [
    ["목표", "가로줄을 꽉 채우면 지워져요. 두 줄 이상 한꺼번에 지우면 상대 판에 방해 줄이 올라가요"],
    ["조작", "좌우 이동 ←→ (A·D), 돌리기 ↑ (W), 천천히 내리기 ↓ (S), 바로 떨구기 스페이스"],
    ["보관", "C(또는 왼쪽 Shift)를 누르면 지금 블록을 보관함에 넣고 보관해 둔 블록을 꺼내요. 블록 하나에 한 번만"],
    ["한 키보드 2인", "1P: A·D·S·W + F(떨구기), Q(보관) / 2P: 방향키 + Enter(떨구기), 마침표(보관)"],
    ["휴대폰", "화면 아래 버튼으로 조작해요"],
  ],
};
export const start = (opts) => startVersus(G, opts);

export const _test = G;
