// 윷놀이 — 윷을 던져 나온 만큼 말을 옮긴다. 윷·모가 나오거나 상대 말을 잡으면 한 번 더.
// 내 말끼리 만나면 업혀서 같이 간다. 말을 모두 먼저 내보내는 사람이 승리.

import { lazy3d } from "./lazy3d.js?v=1";
import { startHostGame, L, R, U, D, A, P } from "./hostgame.js?v=4";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle, SEAT_TINT, SEAT_DARK } from "./kit.js?v=3";

const W = 960, H = 540, BX = 70, BY = 60, S = 420, START = 80, THROW_T = 15 * 60, PICK_T = 20 * 60, HOMEN = 99;
const NAME = { "-1": "빽도", 1: "도", 2: "개", 3: "걸", 4: "윷", 5: "모" };
const PROB = { "-1": 1 / 16, 1: 3 / 16, 2: 6 / 16, 3: 4 / 16, 4: 1 / 16, 5: 1 / 16 };
// 말이 가는 길: O 바깥, A 오른쪽 위 모서리에서 지름길, B 왼쪽 위 모서리에서 지름길, C 가운데에서 출발점으로
const TR = {
  O: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0, HOMEN],
  A: [20, 21, 22, 23, 24, 15, 16, 17, 18, 19, 0, HOMEN],
  B: [25, 26, 22, 27, 28, 0, HOMEN],
  C: [27, 28, 0, HOMEN],
};
const NODE = (() => {
  const P2 = [], R0 = BX + S, B0 = BY + S, st = S / 5, C = [BX + S / 2, BY + S / 2];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let k = 0; k <= 4; k++) P2[k] = [R0, B0 - k * st];
  for (let k = 5; k <= 9; k++) P2[k] = [R0 - (k - 5) * st, BY];
  for (let k = 10; k <= 14; k++) P2[k] = [BX, BY + (k - 10) * st];
  for (let k = 15; k <= 19; k++) P2[k] = [BX + (k - 15) * st, B0];
  P2[20] = lerp(P2[5], C, 1 / 3); P2[21] = lerp(P2[5], C, 2 / 3); P2[22] = C;
  P2[23] = lerp(C, P2[15], 1 / 3); P2[24] = lerp(C, P2[15], 2 / 3);
  P2[25] = lerp(P2[10], C, 1 / 3); P2[26] = lerp(P2[10], C, 2 / 3);
  P2[27] = lerp(C, P2[0], 1 / 3); P2[28] = lerp(C, P2[0], 2 / 3);
  return P2;
})();
const HOME_POS = [BX + S, BY + S + 34];
// 오른쪽 판
const PX = 530, ROW_H = 64;
const THROW_BTN = [736, 470, 186, 56];
const chipRect = (j) => [540 + j * 72, 410, 64, 42];
const waitRect = (o) => [PX + 150, 22 + o * ROW_H + 6, 190, 44];
const inRect = (pt, r) => pt[0] >= r[0] && pt[0] <= r[0] + r[2] && pt[1] >= r[1] && pt[1] <= r[1] + r[3];
const near = (pt, q, r = 30) => Math.hypot(pt[0] - q[0], pt[1] - q[1]) < r;

const node = (pc) => (pc.f ? -2 : pc.i < 0 ? -1 : TR[pc.t][pc.i]);

// pc 말을 r 만큼 옮기면 어디로 가나
function plan(pc, r) {
  if (pc.f) return null;
  if (r < 0) {
    if (pc.i < 0) return null;
    if (pc.i > 0) return { t: pc.t, i: pc.i - 1, path: [TR[pc.t][pc.i - 1]], fin: 0 };
    const [t, i, n] = { O: ["O", 19, 0], A: ["O", 4, 5], B: ["O", 9, 10], C: ["A", 2, 22] }[pc.t];
    return { t, i, path: [n], fin: 0 };
  }
  let t = pc.t, i = pc.i;
  if (i < 0) t = "O";
  else {
    const n = TR[t][i];      // 모서리나 가운데에 멈춰 있으면 지름길로
    if (t === "O" && n === 5) { t = "A"; i = -1; }
    else if (t === "O" && n === 10) { t = "B"; i = -1; }
    else if (n === 22 && t !== "C") { t = "C"; i = -1; }
  }
  const path = [];
  for (let k = 0; k < r; k++) {
    i++;
    const n = TR[t][i];
    if (n === HOMEN) return { t, i, path, fin: 1 };
    path.push(n);
  }
  return { t, i, path, fin: 0 };
}

// o 가 결과 r 로 옮길 수 있는 말 묶음 목록 (판 위의 묶음 + 새 말)
function options(s, o, r) {
  const out = [], seen = new Set();
  s.pc[o].forEach((pc, k) => {
    const n = node(pc);
    if (n < 0 || seen.has(n)) return;
    seen.add(n);
    const pl = plan(pc, r);
    if (pl) out.push({ k, n, pl });
  });
  out.sort((a, b) => a.n - b.n);
  if (r > 0) { const k = s.pc[o].findIndex((pc) => !pc.f && pc.i < 0); if (k >= 0) out.push({ k, n: -1, pl: plan(s.pc[o][k], r) }); }
  return out;
}
const groupIds = (s, o, op) => (op.n >= 0 ? s.pc[o].map((_, k) => k).filter((k) => node(s.pc[o][k]) === op.n) : [op.k]);
const destNode = (pl) => (pl.fin ? -2 : TR[pl.t][pl.i]);

function init(seats, opt) {
  const np = opt && opt.mode === 2 ? 2 : 4;
  return {
    tick: 0, seats, np, pc: seats.map(() => Array.from({ length: np }, () => ({ t: "O", i: -1, f: 0 }))),
    pm: seats.map(() => 0), turn: 0, ph: 0, tl: THROW_T, tm: 0, res: [], last: null, sr: 0, sg: 0, auto: 0, mv: null,
    note: "", nt: 0, over: null, thc: 0, rc: 0, mc: 0, capc: 0, finc: 0, tn: 0,
  };
}

function roll() { const r = Math.random() * 16; return r < 1 ? -1 : r < 4 ? 1 : r < 10 ? 2 : r < 14 ? 3 : r < 15 ? 4 : 5; }
function say(s, text) { s.note = text; s.nt = 0; }

function doThrow(s) { s.last = { r: roll(), seed: (Math.random() * 1e6) | 0 }; s.ph = 1; s.tm = 55; s.thc++; }

function enterPick(s) {
  const o = s.turn, combos = s.res.reduce((a, r) => a + options(s, o, r).length, 0);
  if (!combos) { say(s, "옮길 수 있는 말이 없어요"); s.res = []; s.ph = 4; s.tm = 60; return; }
  s.ph = 2; s.tl = PICK_T; s.sg = 0; s.tn++;
  s.sr = Math.max(0, s.res.findIndex((r) => options(s, o, r).length > 0));
  s.auto = combos === 1 ? 30 : 0;      // 고를 게 하나뿐이면 저절로
}

function startMove(s, op) {
  s.res.splice(s.sr, 1);
  s.mv = { o: s.turn, op, k: 0, t: 0 };
  s.ph = 3; s.mc++;
}

function applyMove(s) {
  const { o, op } = s.mv, ids = groupIds(s, o, op);
  for (const k of ids) { const pc = s.pc[o][k]; if (op.pl.fin) { pc.f = 1; pc.i = -1; } else { pc.t = op.pl.t; pc.i = op.pl.i; } }
  let cap = 0;
  if (!op.pl.fin) {
    const dn = destNode(op.pl);
    s.pc.forEach((list, q) => { if (q !== o) list.forEach((pc) => { if (!pc.f && node(pc) === dn) { pc.t = "O"; pc.i = -1; cap++; } }); });
  }
  s.mv = null;
  if (op.pl.fin) { s.finc++; say(s, ids.length > 1 ? `말 ${ids.length}개가 한꺼번에 들어왔어요!` : "말 하나가 들어왔어요!"); }
  if (s.pc[o].every((pc) => pc.f)) { s.over = { w: o, t: 0 }; return; }
  if (cap) { s.capc++; say(s, "잡았다! 한 번 더 던져요"); s.ph = 0; s.tl = THROW_T; s.tn++; return; }
  if (s.res.length) enterPick(s);
  else { s.ph = 4; s.tm = 24; }
}

function nextTurn(s) { s.turn = (s.turn + 1) % s.seats.length; s.res = []; s.ph = 0; s.tl = THROW_T; s.tn++; }

function step(s, masks, aims) {
  s.tick++;
  s.nt++;
  if (s.over) { s.over.t++; return; }
  const o = s.turn, m = masks[o] | 0, pm = s.pm[o] | 0;
  s.seats.forEach((_, q) => { s.pm[q] = masks[q] | 0; });
  if (s.tick < START) return;
  const press = (bit) => (m & bit) && !(pm & bit);
  const aim = aims && aims[o];
  const click = press(P) && aim && aim.sx != null ? [aim.sx, aim.sy] : null;
  if (s.ph === 0) {                                   // 던지기 기다림
    if (press(A) || (click && inRect(click, THROW_BTN)) || --s.tl <= 0) doThrow(s);
  } else if (s.ph === 1) {                            // 윷이 굴러가는 중
    if (--s.tm <= 0) {
      const r = s.last.r;
      s.res.push(r); s.rc++;
      if (r >= 4) { say(s, `${NAME[r]}! 한 번 더 던져요`); s.ph = 0; s.tl = THROW_T; s.tn++; }
      else enterPick(s);
    }
  } else if (s.ph === 2) {                            // 말 고르기
    const res = s.res, usable = res.map((r) => options(s, o, r).length > 0);
    if (!usable[s.sr]) s.sr = Math.max(0, usable.indexOf(true));
    let ops = options(s, o, res[s.sr]);
    if (s.sg >= ops.length) s.sg = 0;
    let go = null;
    if (press(U) || press(D)) {
      const dir = press(U) ? 1 : -1;
      for (let k = 1; k <= res.length; k++) { const j = (((s.sr + dir * k) % res.length) + res.length) % res.length; if (usable[j]) { s.sr = j; break; } }
      s.sg = 0; ops = options(s, o, res[s.sr]); s.auto = 0;
    }
    if (press(R)) { s.sg = (s.sg + 1) % ops.length; s.auto = 0; }
    if (press(L)) { s.sg = (s.sg - 1 + ops.length) % ops.length; s.auto = 0; }
    if (press(A)) go = ops[s.sg];
    if (click) {
      s.auto = 0;
      res.forEach((r, j) => { if (usable[j] && inRect(click, chipRect(j))) { s.sr = j; s.sg = 0; } });
      ops = options(s, o, res[s.sr]);
      const sel = ops[s.sg];
      if (sel && near(click, sel.pl.fin ? HOME_POS : NODE[destNode(sel.pl)])) go = sel;      // 도착 표시를 누르면 옮긴다
      if (!go) ops.forEach((op) => { if ((op.n >= 0 && near(click, NODE[op.n])) || (op.n < 0 && inRect(click, waitRect(o)))) go = op; });      // 말을 누르면 바로 옮긴다
    }
    if (!go && s.auto > 0 && --s.auto === 0) go = ops[s.sg];
    if (!go && --s.tl <= 0) go = ops[s.sg] || ops[0];
    if (go) startMove(s, go);
  } else if (s.ph === 3) {                            // 말이 움직이는 중
    const mv = s.mv, len = mv.op.pl.path.length + (mv.op.pl.fin ? 1 : 0);
    if (++mv.t % 8 === 0) mv.k++;
    if (mv.k >= len) applyMove(s);
  } else if (--s.tm <= 0) nextTurn(s);
}

// ── 봇 ──
function distHome(t, i) { const pc = { t, i, f: 0 }; for (let k = 1; k < 30; k++) { const pl = plan(pc, k); if (pl && pl.fin) return k; } return 30; }

function danger(s, o, dn) {
  let p = 0;
  s.pc.forEach((list, q) => {
    if (q === o) return;
    const seen = new Set();
    list.forEach((pc) => {
      const n = node(pc);
      if (n === -2 || seen.has(n)) return;
      seen.add(n);
      for (const r of [1, 2, 3, 4, 5, -1]) { const pl = plan(pc, r); if (pl && !pl.fin && destNode(pl) === dn) p += PROB[r]; }
    });
  });
  return Math.min(1, p);
}

function evalMove(s, o, op) {
  const size = groupIds(s, o, op).length;
  if (op.pl.fin) return 60 + size * 25;
  const dn = destNode(op.pl);
  let sc = 0, cap = 0, mine = false;
  s.pc.forEach((list, q) => list.forEach((pc) => { if (node(pc) !== dn) return; if (q === o) mine = true; else cap++; }));
  sc += cap * 45 + (mine && op.n !== dn ? 10 : 0);
  const before = op.n < 0 ? 21 : distHome(s.pc[o][op.k].t, s.pc[o][op.k].i);
  sc += (before - distHome(op.pl.t, op.pl.i)) * 1.5 * size;
  if (dn === 5 || dn === 10 || dn === 22) sc += 9;
  if (!cap) sc -= danger(s, o, dn) * 40 * size;
  if (op.n >= 0) sc += danger(s, o, op.n) * 25 * size;
  return sc;
}

const NOISE = { easy: 30, normal: 8, hard: 1 };

function bot(s, o, mem, level) {
  if (s.over || s.tick < START || s.turn !== o) return 0;
  if (mem.w > 0) { mem.w--; return 0; }
  if (s.ph === 0) {
    if (mem.tn !== s.tn) { mem.tn = s.tn; mem.w = 30 + Math.random() * 30; return 0; }
    mem.w = 8; return A;
  }
  if (s.ph === 2) {
    if (mem.tn !== s.tn) {
      mem.tn = s.tn; mem.w = 35;
      let best = null;
      s.res.forEach((r, ri) => options(s, o, r).forEach((op, gi) => { const sc = evalMove(s, o, op) + Math.random() * (NOISE[level] || 8); if (!best || sc > best.sc) best = { sc, ri, gi }; }));
      mem.plan = best;
      return 0;
    }
    const pl = mem.plan;
    if (!pl) return 0;
    mem.w = 7;
    if (s.sr !== pl.ri) return U;
    if (s.sg !== pl.gi) return R;
    return A;
  }
  return 0;
}

// ── 그리기 ──
function stickFaces(last) {
  const r = last.r, seed = last.seed, flat = [0, 0, 0, 0];
  if (r === -1) flat[0] = 1;
  else if (r === 1) flat[1 + (seed % 3)] = 1;
  else if (r >= 2 && r <= 4) { const order = [0, 1, 2, 3].sort((a, b) => ((seed >> (a * 3)) & 7) - ((seed >> (b * 3)) & 7)); for (let k = 0; k < r; k++) flat[order[k]] = 1; }
  return flat;
}

function drawStick(ctx, x, y, ang, isFlat, marked) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = "rgba(0,0,0,.18)"; rr(ctx, -10, -42, 24, 88, 11); ctx.fill();
  ctx.fillStyle = isFlat ? "#f6dca6" : "#c98a4a"; ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 2.5;
  rr(ctx, -12, -44, 24, 88, 11); ctx.fill(); ctx.stroke();
  if (isFlat) {      // 배(평평한 쪽): X 무늬
    ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 2;
    for (const yy of [-26, 0, 26]) { ctx.beginPath(); ctx.moveTo(-6, yy - 6); ctx.lineTo(6, yy + 6); ctx.moveTo(6, yy - 6); ctx.lineTo(-6, yy + 6); ctx.stroke(); }
    if (marked) { ctx.fillStyle = "#ff5d73"; ctx.beginPath(); ctx.arc(0, -36, 4, 0, 7); ctx.fill(); }
  } else { ctx.fillStyle = "rgba(255,255,255,.25)"; rr(ctx, -6, -38, 5, 76, 3); ctx.fill(); }
  ctx.restore();
}

const stage = lazy3d("./table3d.js?v=3");
let g3cur = null;
function draw(ctx, v, env) {
  const scr = ctx, m3 = stage.get();
  let g3 = null;
  if (m3) { try { g3 = m3.open("yut", { rect: [28, 18, 532, 538], unit: 7.3, frame: 0x8a5a3c, cam: { fov: 40, x: 4.5, y: 12.6, z: 8.6, look: 0.2 }, touch: env.touch, t: env.t }); ctx = g3.board; } catch { g3 = null; stage.fail(); } }
  g3cur = g3;
  ctx.fillStyle = "#f7ecd4"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(160,110,40,.06)";
  for (let y = 10; y < H; y += 22) for (let x = 10 + ((y / 22) % 2) * 11; x < W; x += 22) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill(); }
  // 윷판
  ctx.fillStyle = "rgba(0,0,0,.12)"; rr(ctx, BX - 34, BY - 28, S + 68, S + 66, 22); ctx.fill();
  ctx.fillStyle = "#fffaf0"; ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 5; rr(ctx, BX - 34, BY - 34, S + 68, S + 68, 22); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#c79a63"; ctx.lineWidth = 4;
  ctx.strokeRect(BX, BY, S, S);
  ctx.beginPath(); ctx.moveTo(NODE[5][0], NODE[5][1]); ctx.lineTo(NODE[15][0], NODE[15][1]); ctx.moveTo(NODE[10][0], NODE[10][1]); ctx.lineTo(NODE[0][0], NODE[0][1]); ctx.stroke();
  NODE.forEach(([x, y], n) => {
    const big = n % 5 === 0 && n <= 20 ? n !== 20 : n === 22;
    ctx.fillStyle = big ? "#ffe3a3" : "#fff"; ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, big ? 18 : 11, 0, 7); ctx.fill(); ctx.stroke();
    if (big) { ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke(); }
  });
  label(ctx, "출발 · 완주", NODE[0][0] - 50, NODE[0][1] + 27, 13, "#8a5a3c", "#fffaf0");
  ctx.fillStyle = "rgba(138,90,60,.5)"; ctx.beginPath(); ctx.moveTo(NODE[0][0] + 26, NODE[0][1] - 30); ctx.lineTo(NODE[0][0] + 26, NODE[0][1] - 60); ctx.lineTo(NODE[0][0] + 18, NODE[0][1] - 48); ctx.fill();

  // 고르는 중: 고른 말·가는 길·도착 표시
  const o = v.turn, mineTurn = o === env.me;
  let sel = null;
  if (v.ph === 2 && v.res.length) {
    sel = options(v, o, v.res[v.sr])[v.sg] || null;
    if (sel) {
      const from = sel.n >= 0 ? NODE[sel.n] : NODE[0], pts = [from, ...sel.pl.path.map((n) => NODE[n])];
      if (sel.pl.fin) pts.push(HOME_POS);
      ctx.strokeStyle = SEAT_DARK[o]; ctx.lineWidth = 4; ctx.setLineDash([3, 9]); ctx.lineCap = "round";
      ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
      const dest = pts[pts.length - 1], dn = destNode(sel.pl);
      const cap = dn >= 0 && v.pc.some((list, q) => q !== o && list.some((pc) => node(pc) === dn));
      const pulse = 24 + Math.sin(env.t * 7) * 3;
      ctx.strokeStyle = cap ? "#ff5d73" : SEAT_DARK[o]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(dest[0], dest[1], pulse, 0, 7); ctx.stroke();
      label(ctx, cap ? "잡기!" : sel.pl.fin ? "완주!" : NAME[v.res[v.sr]], dest[0], dest[1] - 30, 16, cap ? "#ff5d73" : SEAT_DARK[o], "#fff");
      if (sel.n >= 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(from[0], from[1], 22, 0, 7); ctx.stroke(); }
    }
  }
  // 판 위의 말
  const moving = v.mv ? new Set(groupIds(v, v.mv.o, v.mv.op)) : null;
  v.pc.forEach((list, q) => {
    const byNode = {};
    list.forEach((pc, k) => { const n = node(pc); if (n < 0) return; if (moving && q === v.mv.o && moving.has(k)) return; (byNode[n] = byNode[n] || []).push(k); });
    for (const n in byNode) drawGroup(ctx, v, q, NODE[n][0], NODE[n][1], byNode[n].length, env);
  });
  if (v.mv) {
    const { o: mo, op, k, t } = v.mv, pts = [op.n >= 0 ? NODE[op.n] : NODE[0], ...op.pl.path.map((n) => NODE[n])];
    if (op.pl.fin) pts.push(HOME_POS);
    const a = pts[Math.min(k, pts.length - 1)], b = pts[Math.min(k + 1, pts.length - 1)], f = (t % 8) / 8;
    const hop = Math.sin(f * Math.PI) * 14;
    drawGroup(ctx, v, mo, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - hop, moving.size, env);
  }

  if (g3) {
    ctx = scr; g3cur = null;
    try { g3.cheer = !!v.over; ctx.drawImage(g3.close(), 0, 0, W, H); } catch { stage.fail(); }
    ctx.fillStyle = "rgba(247,236,212,.94)"; ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 3; rr(ctx, 518, 8, 434, 524, 18); ctx.fill(); ctx.stroke();
  }
  // 오른쪽: 선수
  v.seats.forEach((seat, q) => {
    const y = 22 + q * ROW_H, on = q === o && !v.over, list = v.pc[q];
    ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = on ? "#ff5d73" : SEAT_DARK[q]; ctx.lineWidth = on ? 4.5 : 3;
    rr(ctx, PX, y, 400, ROW_H - 8, 14); ctx.fill(); ctx.stroke();
    drawMochi(ctx, PX + 30, y + 28, 18, parseLook(seat.look, q));
    label(ctx, seat.name, PX + 56, y + 35, 17, q === env.me ? "#d6336c" : "#2b2d6e", null, "left");
    const wait = list.filter((pc) => !pc.f && pc.i < 0).length, fin = list.filter((pc) => pc.f).length;
    for (let k = 0; k < wait; k++) drawMochi(ctx, PX + 166 + k * 26, y + 28, 10, parseLook(seat.look, q));
    if (on && v.ph === 2 && sel && sel.n < 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(PX + 166, y + 28, 15, 0, 7); ctx.stroke(); }
    label(ctx, `완주 ${fin}/${v.np}`, PX + 388, y + 35, 15, fin ? "#2f9e5a" : "#6b6480", null, "right");
  });
  // 윷가락
  if (v.last) {
    const anim = v.ph === 1 ? 55 - v.tm : 99, flying = anim < 38, faces = stickFaces(v.last);
    for (let k = 0; k < 4; k++) {
      const x = 580 + k * 46, y = 352 - (flying ? Math.sin((anim / 38) * Math.PI) * 60 : 0);
      const ang = flying ? (anim * 0.5 + k * 1.3 + v.last.seed) % 6.28 : ((v.last.seed >> k) % 7 - 3) * 0.05;
      drawStick(ctx, x, y, ang, flying ? (anim + k) % 6 < 3 : faces[k], k === 0);
    }
    if (!flying) label(ctx, NAME[v.last.r] + "!", 860, 368, 46, v.last.r >= 4 ? "#ff5d73" : v.last.r < 0 ? "#8a55d6" : "#2b2d6e", "#fff");
  } else label(ctx, "윷을 던져 시작해요", 730, 360, 20, "#6b6480", null);
  // 결과 칩
  if (v.res.length) {
    v.res.forEach((r, j) => {
      const [x, y, w, h] = chipRect(j), on = v.ph === 2 && j === v.sr, ok = options(v, o, r).length > 0;
      ctx.globalAlpha = ok ? 1 : 0.4;
      ctx.fillStyle = on ? "#2b2d6e" : "#fffdf6"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2.5; rr(ctx, x, y, w, h, 12); ctx.fill(); ctx.stroke();
      label(ctx, NAME[r], x + w / 2, y + 29, 20, on ? "#fff" : "#2b2d6e", null);
      ctx.globalAlpha = 1;
    });
  }
  // 던지기 버튼
  const canThrow = v.ph === 0 && v.tick >= START && !v.over;
  ctx.globalAlpha = canThrow ? 1 : 0.35;
  ctx.fillStyle = "#ff5d73"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 3; rr(ctx, ...THROW_BTN, 16); ctx.fill(); ctx.stroke();
  label(ctx, "윷 던지기", THROW_BTN[0] + THROW_BTN[2] / 2, THROW_BTN[1] + 37, 24, "#fff", null);
  ctx.globalAlpha = 1;
  // 안내
  let tip = "";
  if (v.tick < START) tip = "준비!";
  else if (v.over) tip = "";
  else if (v.ph === 0) tip = mineTurn ? `${env.touch ? "[윷 던지기]를 눌러요" : "스페이스 또는 [윷 던지기]"} · ${Math.ceil(v.tl / 60)}초` : `${v.seats[o].name} 차례`;
  else if (v.ph === 2) tip = mineTurn ? `${env.touch ? "옮길 말을 눌러요 · 결과는 아래 칩으로" : "말을 누르면 옮겨요 · ↑↓ 결과 · ←→ 말 · 스페이스"} · ${Math.ceil(v.tl / 60)}초` : `${v.seats[o].name}이(가) 말을 고르는 중`;
  if (tip) label(ctx, tip, 540, 300, 15, mineTurn ? "#d6336c" : "#6b6480", null, "left");
  if (v.note && v.nt < 120) label(ctx, v.note, BX + S / 2, BY + S / 2 - 40, 24, "#ff5d73", "#fff");
  if (v.tick < START) label(ctx, "준비!", BX + S / 2, BY + S / 2 + 20, 60, "#ff5d73", "#fff");
  if (v.over) label(ctx, v.over.w === env.me ? "이겼다!" : `${v.seats[v.over.w].name} 승리!`, BX + S / 2, BY + S / 2 + 20, 56, "#ffc93c", "#2b2d6e");
}

function drawGroup(ctx, v, q, x, y, cnt, env) {
  const look = parseLook(v.seats[q].look, q);
  if (g3cur) {      // 3D: 업은 말은 위로 쌓는다
    const base = (g3cur._n = (g3cur._f === env.t ? g3cur._n : 0)); g3cur._f = env.t;
    try { for (let k = 0; k < cnt; k++) g3cur.mochi(q * 40 + base + k, look, x, y, { r: 17, ring: k ? null : SEAT_DARK[q], lift: k * 24 }); } catch { stage.fail(); }
    g3cur._n = base + cnt;
    return;
  }
  for (let k = cnt - 1; k >= 0; k--) {
    const yy = y - k * 7;
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x, y + 14, 15, 5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = SEAT_DARK[q]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, yy, 17, 0, 7); ctx.stroke();
    drawMochi(ctx, x, yy, 15, look);
  }
  if (cnt > 1) { ctx.fillStyle = SEAT_DARK[q]; ctx.beginPath(); ctx.arc(x + 16, y - 18 - (cnt - 1) * 7, 10, 0, 7); ctx.fill(); label(ctx, "×" + cnt, x + 16, y - 13 - (cnt - 1) * 7, 12, "#fff", null); }
}

function fx(v, m, snd, me) {
  if (m.thc == null) Object.assign(m, { thc: v.thc, rc: v.rc, mc: v.mc, capc: v.capc, finc: v.finc, k: -1, tn: -1, ov: !!v.over });
  if (v.thc !== m.thc) { m.thc = v.thc; for (let k = 0; k < 4; k++) snd.wood(1, 0.12 + k * 0.08 + Math.random() * 0.04); }
  if (v.rc !== m.rc) { m.rc = v.rc; const r = v.res[v.res.length - 1]; if (r >= 4) jingle(snd, [659, 784, 1047, 1319], 90); else if (r < 0) snd(500, 0.3, "triangle", 0.1, -300); else snd(660, 0.14, "triangle", 0.1); }
  const k = v.mv ? v.mv.k : -1;
  if (k !== m.k) { if (k > 0) snd.wood(0.6); m.k = k; }
  if (v.capc !== m.capc) { m.capc = v.capc; snd.thud(1.2); jingle(snd, [880, 1100], 90); }
  if (v.finc !== m.finc) { m.finc = v.finc; jingle(snd, [523, 784, 1047], 100); }
  if (v.tn !== m.tn) { m.tn = v.tn; if (v.turn === me && v.ph === 0 && v.tick >= START) snd(880, 0.1, "triangle", 0.08); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
}

function title(v, me) {
  const w = v.over.w;
  if (me < 0) return `${v.seats[w].name} 승리! 한 판 더?`;
  return w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 3, action: null, overDelay: 220, pointer: true, pointerStart: true, noPad: true,
  bots: { solo: 1, local: 0 },
  fill: (mode, n) => (n < 2 ? 1 : 0),
  init, step, bot, draw, fx, title, dispose: () => stage.dispose(),
  mapPointer: (x, y) => { const m = stage.get(); return m && x < 516 ? m.pick(x, y) : [x, y]; },
};

export const meta = {
  local: true,
  soloText: "봇과 1대1 윷놀이. 난이도를 골라 주세요.",
  modeLabel: "말 개수",
  modes: [[0, "4개"], [2, "2개(빨리)"]],
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 번갈아 던져요. 말을 모두 먼저 내보내면 승리.`),
  howto: [
    ["목표", "윷을 던져 나온 만큼 말을 옮겨요. 말을 모두 출발점 너머로 먼저 내보내면 승리"],
    ["윷", "도 1칸, 개 2칸, 걸 3칸, 윷 4칸, 모 5칸, 빽도는 1칸 뒤로. 윷·모가 나오면 한 번 더 던져요"],
    ["잡기·업기", "상대 말이 있는 칸에 서면 잡아서 출발점으로 돌려보내고 한 번 더 던져요. 내 말끼리 만나면 업혀서 같이 가요"],
    ["지름길", "모서리나 가운데 칸에 딱 멈추면 다음에는 대각선 지름길로 가요"],
    ["조작", "[윷 던지기]나 스페이스로 던지고, 옮길 말을 눌러요. 결과가 여러 개면 아래 칩을 눌러 고른 뒤 말을 눌러요. 키보드는 ↑↓ 결과, ←→ 말, 스페이스"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
