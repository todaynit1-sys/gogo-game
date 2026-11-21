// 연쇄 팡 — 색 떡 두 개가 짝으로 떨어진다. 같은 색 넷을 이으면 터지고,
// 터진 뒤 떨어진 떡이 또 터지면(연쇄) 상대에게 돌떡이 쏟아진다.

import { startVersus } from "./versus.js?v=3";
import { label } from "./kit.js?v=3";

const COLS = 7, ROWS = 12, HID = 2, TR = ROWS + HID, SPAWN_X = 3;
const OFF = [[0, -1], [1, 0], [0, 1], [-1, 0]];       // 짝꿍 위치: 위, 오른쪽, 아래, 왼쪽
const POW = [0, 1, 2.5, 5, 8, 12, 16, 20, 24, 28];
const PAL = ["", "#ff7a90", "#ffd24a", "#6ec6ff", "#7ddc7a"];
const PAL_D = ["", "#d94f68", "#d99a12", "#3a94d9", "#48ac4a"];

const idx = (x, y) => y * COLS + x;
const free = (g, x, y) => x >= 0 && x < COLS && y < TR && (y < 0 || !g[idx(x, y)]);
const pairColors = () => [1 + ((Math.random() * 4) | 0), 1 + ((Math.random() * 4) | 0)];

function gravity(g) {
  for (let x = 0; x < COLS; x++) {
    let w = TR - 1;
    for (let y = TR - 1; y >= 0; y--) { const v = g[idx(x, y)]; if (v) { g[idx(x, y)] = 0; g[idx(x, w)] = v; w--; } }
  }
}

// 같은 색 넷 이상 이어진 덩어리 찾기 → 터질 칸 번호들 (옆의 돌떡 포함)
function findPops(g) {
  const seen = new Uint8Array(g.length), pops = new Set(); let count = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (!c || c > 4 || seen[i] || i < HID * COLS) continue;
    const grp = [i]; seen[i] = 1;
    for (let k = 0; k < grp.length; k++) {
      const x = grp[k] % COLS, y = (grp[k] / COLS) | 0;
      for (const [dx, dy] of OFF) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < HID || ny >= TR) continue;
        const j = idx(nx, ny);
        if (!seen[j] && g[j] === c) { seen[j] = 1; grp.push(j); }
      }
    }
    if (grp.length >= 4) {
      count += grp.length;
      for (const j of grp) {
        pops.add(j);
        const x = j % COLS, y = (j / COLS) | 0;
        for (const [dx, dy] of OFF) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < COLS && ny >= 0 && ny < TR && g[idx(nx, ny)] === 9) pops.add(idx(nx, ny)); }
      }
    }
  }
  return { pops, count };
}

function spawn(b) {
  while (b.next.length < 3) b.next.push(pairColors());
  const [a, c] = b.next.shift(); b.next.push(pairColors());
  if (b.g[idx(SPAWN_X, HID)] || b.g[idx(SPAWN_X, HID - 1)]) { b.alive = false; b.cur = null; return; }
  b.cur = { a, b: c, x: SPAWN_X, y: HID - 1, r: 0 };
  b.seq++; b.st = "fall"; b.fallT = 0; b.lockT = 0; b.lockMoves = 0;
}

function create() {
  const b = { g: new Uint8Array(COLS * TR), cur: null, next: [], alive: true, out: 0, pending: 0, ev: [], soft: false, st: "fall", stT: 0, fallT: 0, lockT: 0, lockMoves: 0, time: 0, seq: 0, chain: 0, turnAtk: 0, pops: null, ac: 0 };
  spawn(b);
  return b;
}

const sat = (p, r = p.r) => [p.x + OFF[r][0], p.y + OFF[r][1]];
const canDown = (b) => { const p = b.cur, [sx, sy] = sat(p); return free(b.g, p.x, p.y + 1) && free(b.g, sx, sy + 1); };
function moved(b) { if (!canDown(b) && b.lockMoves < 12) { b.lockT = 0; b.lockMoves++; } }

function act(b, a) {
  const p = b.cur;
  if (!b.alive || !p || b.st !== "fall") return false;
  if (a === "L" || a === "R") {
    const dx = a === "L" ? -1 : 1, [sx, sy] = sat(p);
    if (!free(b.g, p.x + dx, p.y) || !free(b.g, sx + dx, sy)) return false;
    p.x += dx; moved(b); return true;
  }
  if (a === "rot" || a === "rot2") {
    const nr = (p.r + (a === "rot" ? 1 : 3)) % 4, [sx, sy] = sat(p, nr);
    if (free(b.g, sx, sy)) p.r = nr;
    else if (free(b.g, p.x - OFF[nr][0], p.y - OFF[nr][1])) { p.x -= OFF[nr][0]; p.y -= OFF[nr][1]; p.r = nr; }   // 벽에 막히면 반대로 밀려난다
    else { const fr = (p.r + 2) % 4, [fx, fy] = sat(p, fr); if (!free(b.g, fx, fy)) return false; p.r = fr; }      // 좁은 틈에서는 위아래 뒤집기
    b.ev.push("rot"); moved(b); return true;
  }
  if (a === "drop") { while (canDown(b)) p.y++; lock(b); return true; }
  return false;
}

function lock(b) {
  const p = b.cur, [sx, sy] = sat(p);
  if (p.y >= 0) b.g[idx(p.x, p.y)] = p.a;
  if (sy >= 0) b.g[idx(sx, sy)] = p.b;
  b.cur = null; b.ev.push("lock");
  gravity(b.g);
  b.chain = 0; b.turnAtk = 0;
  resolve(b);
}

function resolve(b) {
  const { pops, count } = findPops(b.g);
  if (count) {
    b.chain++; b.pops = pops; b.st = "pop"; b.stT = 0.4;
    // 1분이 지나면 공격이 점점 세져서 승부가 난다
    const late = b.time < 60 ? 1 : 1 + (b.time - 60) / 40;
    b.turnAtk += Math.floor((count * POW[Math.min(b.chain, 9)] * late) / 4);
    b.ev.push("c" + b.chain);
    return;
  }
  // 판을 전부 비우면 큰 공격 보너스
  if (b.chain > 0 && !b.g.some((v) => v)) { b.turnAtk += 21; b.ac = 1.4; b.ev.push("c9"); }
  // 이번 차례 끝: 공격 정산
  const use = Math.min(b.pending, b.turnAtk); b.pending -= use; b.out += b.turnAtk - use;
  if (b.pending > 0 && b.chain === 0) {
    // 돌떡 떨어뜨리기 (한 번에 두 줄까지)
    let n = Math.min(b.pending, COLS * 2); b.pending -= n;
    while (n > 0) {
      const order = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
      for (const x of order) {
        if (n <= 0) break;
        let y = TR - 1; while (y >= 0 && b.g[idx(x, y)]) y--;
        if (y >= 0) b.g[idx(x, y)] = 9;
        n--;
      }
    }
    b.ev.push("garbage");
  }
  b.turnAtk = 0;
  spawn(b);
}

function step(b, dt) {
  if (!b.alive) return;
  b.time += dt; if (b.ac > 0) b.ac -= dt;
  if (b.st === "pop") {
    b.stT -= dt;
    if (b.stT <= 0) { for (const j of b.pops) b.g[j] = 0; b.pops = null; gravity(b.g); b.st = "settle"; b.stT = 0.16; }
    return;
  }
  if (b.st === "settle") { b.stT -= dt; if (b.stT <= 0) resolve(b); return; }
  const p = b.cur; if (!p) return;
  const iv = b.soft ? 0.045 : Math.max(0.12, 0.6 - b.time * 0.003);
  b.fallT += dt;
  while (b.fallT >= iv) { b.fallT -= iv; if (canDown(b)) p.y++; else break; }
  if (!canDown(b)) { b.lockT += dt; if (b.lockT > 0.4) lock(b); } else b.lockT = 0;
}

// ── 보기용 판 ──
function view(b) {
  let g = "";
  for (let i = HID * COLS; i < TR * COLS; i++) {
    const v = b.g[i];
    g += b.pops && b.pops.has(i) ? (v === 9 ? "i" : "abcd"[v - 1]) : v;
  }
  let c = null, gh = null;
  if (b.cur) {
    const p = b.cur, [sx, sy] = sat(p);
    c = [p.a, p.x, p.y - HID, p.b, sx, sy - HID];
    // 떨어질 자리 미리보기
    const land = (x, skip) => { let y = TR - 1; while (y >= 0 && b.g[idx(x, y)]) y--; return y - skip; };
    if (sx === p.x) { const low = sy > p.y; gh = [p.a, p.x, land(p.x, low ? 1 : 0) - HID, p.b, sx, land(sx, low ? 0 : 1) - HID]; }
    else gh = [p.a, p.x, land(p.x, 0) - HID, p.b, sx, land(sx, 0) - HID];
  }
  return { g, c, gh, al: b.alive, ch: b.st === "pop" ? b.chain : 0, ac: b.ac > 0, dg: b.g[idx(SPAWN_X, HID + 2)] > 0 };
}
const encode = (v) => JSON.stringify({ g: v.g, c: v.c, al: v.al, ch: v.ch, ac: v.ac });
const decode = (s) => JSON.parse(s);
const blank = () => ({ g: "0".repeat(COLS * ROWS), c: null, al: true, ch: 0 });

function blob(ctx, cx, cy, s, ci, mini, pop, t) {
  const r = s * 0.46 * (pop ? 0.75 + 0.25 * Math.abs(Math.sin(t * 22)) : 1);
  if (ci === 9) {
    ctx.fillStyle = "#62668c"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#a9adcc"; ctx.beginPath(); ctx.arc(cx, cy - r * 0.08, r * 0.82, 0, 7); ctx.fill();
    return;
  }
  ctx.fillStyle = PAL_D[ci]; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.fillStyle = pop ? "#fff" : PAL[ci]; ctx.beginPath(); ctx.arc(cx, cy - r * 0.07, r * 0.86, 0, 7); ctx.fill();
  if (mini || s < 16) return;
  ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.22, r * 0.12, -0.5, 0, 7); ctx.fill();
  ctx.fillStyle = "#3a2a22";
  ctx.beginPath(); ctx.arc(cx - r * 0.3, cy, r * 0.11, 0, 7); ctx.arc(cx + r * 0.3, cy, r * 0.11, 0, 7); ctx.fill();
}

function draw(ctx, v, x, y, cell, t, mini) {
  for (let i = 0; i < v.g.length; i++) {
    const ch = v.g[i]; if (ch === "0") continue;
    const pop = ch >= "a", ci = pop ? (ch === "i" ? 9 : ch.charCodeAt(0) - 96) : +ch;
    blob(ctx, x + (i % COLS + 0.5) * cell, y + (((i / COLS) | 0) + 0.5) * cell, cell, ci, mini, pop, t);
  }
  if (v.gh && !mini) for (let i = 0; i < 6; i += 3) if (v.gh[i + 2] >= 0) { ctx.fillStyle = PAL[v.gh[i]]; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(x + (v.gh[i + 1] + 0.5) * cell, y + (v.gh[i + 2] + 0.5) * cell, cell * 0.16, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (v.c) for (let i = 0; i < 6; i += 3) if (v.c[i + 2] >= 0) blob(ctx, x + (v.c[i + 1] + 0.5) * cell, y + (v.c[i + 2] + 0.5) * cell, cell, v.c[i], mini, false, t);
  // 숨 막히는 자리 표시 (여기가 막히면 탈락)
  if (!mini) {
    if (v.dg && v.al) { ctx.fillStyle = `rgba(255,93,115,${0.18 + 0.16 * Math.sin(t * 9)})`; ctx.fillRect(x + SPAWN_X * cell, y, cell, cell * 3); }      // 가운데 줄이 높이 쌓이면 경고
    ctx.strokeStyle = "rgba(255,93,115,.6)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(x + SPAWN_X * cell + 3, y + 3, cell - 6, cell - 6); ctx.setLineDash([]);
  }
  if (v.ac) label(ctx, "전부 지움!", x + (COLS * cell) / 2, y + ROWS * cell * 0.55, mini ? Math.max(12, cell * 1.4) : 40, "#7ddc7a", "#2b2d6e");
  if (v.ch >= 2) label(ctx, v.ch + "연쇄!", x + (COLS * cell) / 2, y + ROWS * cell * 0.4, mini ? Math.max(12, cell * 1.5) : 44, "#ffd24a", "#2b2d6e");
}

function drawNext(ctx, b, x, y, cell) {
  for (let i = 0; i < 2; i++) {
    const pr = b.next[i]; if (!pr) continue;
    const s = i === 0 ? cell : cell * 0.8, yy = y + i * cell * 2.7;
    blob(ctx, x + cell, yy + s * 0.5, s, pr[1], false, false, 0);
    blob(ctx, x + cell, yy + s * 1.5, s, pr[0], false, false, 0);
  }
}

// ── 봇 ──
const BOT = { easy: { d: 0.46, noise: 20 }, normal: { d: 0.25, noise: 6 }, hard: { d: 0.09, noise: 0.4 } };

function plan(b, noise) {
  const p = b.cur; let best = null;
  for (let r = 0; r < 4; r++) {
    for (let x = 0; x < COLS; x++) {
      const sx = x + OFF[r][0];
      if (sx < 0 || sx >= COLS) continue;
      const g = b.g.slice();
      const put = (cx, col) => { let y = TR - 1; while (y >= 0 && g[idx(cx, y)]) y--; if (y < 0) return -1; g[idx(cx, y)] = col; return y; };
      // 아래에 놓일 떡부터
      let ya, yb;
      if (r === 2) { yb = put(sx, p.b); ya = put(x, p.a); } else { ya = put(x, p.a); yb = put(sx, p.b); }
      if (ya < HID || yb < HID) continue;
      let adj = 0;
      for (const [cx, cy, col] of [[x, ya, p.a], [sx, yb, p.b]]) for (const [dx, dy] of OFF) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && nx < COLS && ny >= 0 && ny < TR && g[idx(nx, ny)] === col) adj++; }
      let chain = 0, atk = 0;
      for (;;) { const f = findPops(g); if (!f.count) break; chain++; atk += Math.floor((f.count * POW[Math.min(chain, 9)]) / 4); for (const j of f.pops) g[j] = 0; gravity(g); }
      let top = TR; for (let y = 0; y < TR; y++) if (g[idx(SPAWN_X, y)]) { top = y; break; }
      const height = TR - Math.min(ya, yb);
      const score = atk * 12 + chain * 6 + adj * 2.6 - height * 1.1 - (top <= HID + 2 ? 60 : 0) + Math.random() * noise;
      if (!best || score > best.score) best = { score, r, x };
    }
  }
  return best || { r: 0, x: p.x };
}

function bot(b, mem, level, dt) {
  if (!b.cur || b.st !== "fall") return;
  const cfg = BOT[level] || BOT.normal;
  if (mem.seq !== b.seq) { mem.seq = b.seq; mem.plan = plan(b, cfg.noise); mem.t = cfg.d * 1.6; mem.tries = 0; }
  mem.t -= dt; if (mem.t > 0) return;
  mem.t = cfg.d;
  const p = b.cur, pl = mem.plan;
  if (p.r !== pl.r && mem.tries < 5) { mem.tries++; act(b, "rot"); }
  else if (p.x !== pl.x) { if (!act(b, p.x < pl.x ? "R" : "L")) act(b, "drop"); }
  else act(b, "drop");
}

const G = { cols: COLS, rows: ROWS, bg: "#efe6ff", pendUnit: 1 / COLS, create, blank, step, act, attackIn: (b, n) => { b.pending += n; }, view, encode, decode, draw, drawNext, bot };

export const meta = {
  local: true,
  portrait: true,
  soloText: "봇과 1대1. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 각자 판을 쌓아요. 마지막까지 버티면 승리.`),
  howto: [
    ["목표", "같은 색 떡을 넷 이상 이으면 터져요. 터진 뒤 내려앉은 떡이 또 터지면 연쇄! 연쇄가 길수록 상대에게 돌떡이 많이 떨어져요"],
    ["탈락", "가운데 맨 윗칸(빨간 점선)이 막히면 끝"],
    ["보너스", "판을 전부 비우면 '전부 지움!' — 돌떡 세 줄이 상대에게 떨어져요"],
    ["조작", "좌우 이동 ←→ (A·D), 돌리기 ↑ (W), 천천히 내리기 ↓ (S), 바로 떨구기 스페이스"],
    ["한 키보드 2인", "1P: A·D·S·W + F(떨구기) / 2P: 방향키 + Enter(떨구기)"],
  ],
};
export const start = (opts) => startVersus(G, opts);

export const _test = G;
