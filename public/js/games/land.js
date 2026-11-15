// 땅따먹기 — 내 땅 밖으로 나가 선을 긋고 돌아오면 둘러싼 만큼 내 땅이 된다.
// 선을 긋는 동안 누가 그 선을 밟으면 탈락(잠시 뒤 새 자리에서 다시 시작). 90초 뒤 땅이 가장 넓은 사람이 승리.

import { startHostGame, L, R, U, D } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle, SEAT_TINT, SEAT_DARK } from "./kit.js?v=1";

const GW = 48, GH = 27, CELL = 20, N = GW * GH, W = 960, H = 540;
const START = 120, TIME = 90 * 60, MOVE_EVERY = 7, RESPAWN = 16;
const DX = [-1, 1, 0, 0], DY = [0, 0, -1, 1], OPP = [1, 0, 3, 2], BIT = [L, R, U, D];
const HOME = [[8, 6], [39, 20], [39, 6], [8, 20]];

function stamp(s, me, cx, cy) {
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (x >= 0 && y >= 0 && x < GW && y < GH) s.own[y * GW + x] = me;
}

function init(seats) {
  const s = { tick: 0, seats, own: new Array(N).fill(0), tr: new Array(N).fill(0), time: TIME, p: [], over: null, dc: 0, cc: 0 };
  seats.forEach((_, i) => {
    const [x, y] = HOME[i];
    stamp(s, i + 1, x, y);
    s.p.push({ x, y, px: x, py: y, d: i % 2 ? 0 : 1, nd: i % 2 ? 0 : 1, al: 1, rs: 0, sc: 25, tl: 0 });
  });
  return s;
}

function kill(s, j) {
  const p = s.p[j]; if (!p.al) return;
  p.al = 0; p.rs = RESPAWN; p.tl = 0; s.dc++;
  for (let k = 0; k < N; k++) { if (s.tr[k] === j + 1) s.tr[k] = 0; if (s.own[k] === j + 1) s.own[k] = 0; }
}

function respawn(s, j) {
  const p = s.p[j];
  let bx = HOME[j][0], by = HOME[j][1];
  for (let tries = 0; tries < 40; tries++) {
    const x = 3 + ((Math.random() * (GW - 6)) | 0), y = 3 + ((Math.random() * (GH - 6)) | 0);
    if (s.tr[y * GW + x]) continue;
    if (s.p.some((q, k) => k !== j && q.al && Math.abs(q.x - x) + Math.abs(q.y - y) < 8)) continue;
    bx = x; by = y; break;
  }
  stamp(s, j + 1, bx, by);
  Object.assign(p, { x: bx, y: by, px: bx, py: by, al: 1, tl: 0, d: (Math.random() * 4) | 0 });
  p.nd = p.d;
}

// 내 땅과 내 선으로 둘러싸인 곳을 모두 내 땅으로
function claim(s, i) {
  const me = i + 1, reach = new Uint8Array(N), st = [];
  const wall = (k) => s.own[k] === me || s.tr[k] === me;
  const push = (k) => { if (!reach[k] && !wall(k)) { reach[k] = 1; st.push(k); } };
  for (let x = 0; x < GW; x++) { push(x); push((GH - 1) * GW + x); }
  for (let y = 0; y < GH; y++) { push(y * GW); push(y * GW + GW - 1); }
  while (st.length) {
    const k = st.pop(), x = k % GW, y = (k / GW) | 0;
    if (x > 0) push(k - 1); if (x < GW - 1) push(k + 1); if (y > 0) push(k - GW); if (y < GH - 1) push(k + GW);
  }
  for (let k = 0; k < N; k++) {
    if (s.tr[k] === me) { s.tr[k] = 0; s.own[k] = me; }
    else if (!reach[k] && s.own[k] !== me) s.own[k] = me;
  }
  s.p[i].tl = 0; s.cc++;
}

function step(s, masks) {
  s.tick++;
  if (s.over) { s.over.t++; return; }
  s.p.forEach((p, i) => {
    const m = masks[i] | 0, dir = m & L ? 0 : m & R ? 1 : m & U ? 2 : m & D ? 3 : -1;
    if (dir >= 0 && !(p.tl > 0 && dir === OPP[p.d])) p.nd = dir;     // 선을 긋는 중에는 뒤로 못 돈다
  });
  if (s.tick < START) return;
  if (--s.time <= 0) {
    let w = 0; s.p.forEach((p, i) => { if (p.sc > s.p[w].sc) w = i; });
    s.over = { w, t: 0 }; return;
  }
  if (s.tick % MOVE_EVERY) return;
  s.p.forEach((p, i) => {
    if (!p.al) { if (--p.rs <= 0) respawn(s, i); return; }
    p.px = p.x; p.py = p.y;
    p.d = p.nd;
    const nx = p.x + DX[p.d], ny = p.y + DY[p.d];
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return;
    const k = ny * GW + nx, t = s.tr[k];
    if (t) { kill(s, t - 1); if (t - 1 === i) return; }               // 선을 밟힌 사람이 탈락
    p.x = nx; p.y = ny;
    if (s.own[k] === i + 1) { if (p.tl > 0) claim(s, i); }
    else { s.tr[k] = i + 1; p.tl++; }
  });
  for (const p of s.p) p.sc = 0;
  for (let k = 0; k < N; k++) if (s.own[k]) s.p[s.own[k] - 1].sc++;
}

// ── 주고받기: 판은 같은 값이 이어지는 길이로 줄여 보낸다 ──
function pack(s) {
  const r = []; let last = -1, n = 0;
  for (let k = 0; k < N; k++) {
    const v = s.own[k] + 5 * s.tr[k];
    if (v === last) n++; else { if (n) r.push(last, n); last = v; n = 1; }
  }
  r.push(last, n);
  return { tick: s.tick, seats: s.seats, time: s.time, p: s.p, over: s.over, dc: s.dc, cc: s.cc, r };
}
function unpack(o) {
  const own = new Array(N), tr = new Array(N); let k = 0;
  for (let i = 0; i < o.r.length; i += 2) for (let n = o.r[i + 1], v = o.r[i]; n > 0 && k < N; n--, k++) { own[k] = v % 5; tr[k] = (v / 5) | 0; }
  return { tick: o.tick, seats: o.seats, time: o.time, p: o.p, over: o.over, dc: o.dc, cc: o.cc, own, tr };
}

// ── 봇 ──
const BOTS = { easy: { max: 4, fear: 3 }, normal: { max: 7, fear: 5 }, hard: { max: 11, fear: 6 } };
const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

function okStep(s, i, d) {
  const p = s.p[i], x = p.x + DX[d], y = p.y + DY[d];
  if (!inb(x, y) || s.tr[y * GW + x] === i + 1) return false;
  return !(p.tl > 0 && d === OPP[p.d]);
}

function pathHome(s, i) {
  const p = s.p[i], me = i + 1, start = p.y * GW + p.x, from = new Int32Array(N).fill(-1), dirOf = new Int8Array(N), q = [start];
  from[start] = start;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % GW, y = (k / GW) | 0;
    if (k !== start && s.own[k] === me) {
      const out = []; let c = k;
      while (c !== start) { out.unshift(dirOf[c]); c = from[c]; }
      return out;
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inb(nx, ny)) continue;
      const n = ny * GW + nx;
      if (from[n] >= 0 || s.tr[n] === me) continue;
      if (k === start && p.tl > 0 && d === OPP[p.d]) continue;
      from[n] = k; dirOf[n] = d; q.push(n);
    }
  }
  return [];
}

function makeLoop(s, i, cfg) {
  const p = s.p[i], me = i + 1;
  const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  for (const d of dirs) {
    // 이 방향으로 내 땅을 벗어날 때까지 몇 칸인지
    let x = p.x, y = p.y, inside = 0;
    while (inb(x + DX[d], y + DY[d]) && s.own[(y + DY[d]) * GW + x + DX[d]] === me && inside < 14) { x += DX[d]; y += DY[d]; inside++; }
    if (!inb(x + DX[d], y + DY[d])) continue;
    const a = 2 + ((Math.random() * cfg.max) | 0), b = 2 + ((Math.random() * cfg.max) | 0);
    const side = d < 2 ? (Math.random() < 0.5 ? 2 : 3) : Math.random() < 0.5 ? 0 : 1;
    const plan = [];
    const walk = (dd, n) => { for (let k = 0; k < n; k++) { if (!inb(x + DX[dd], y + DY[dd])) return; x += DX[dd]; y += DY[dd]; plan.push(dd); } };
    for (let k = 0; k < inside; k++) plan.push(d);
    walk(d, a); walk(side, b); walk(OPP[d], a + 1);
    if (plan.length > inside + 3) return plan;
  }
  return [];
}

function bot(s, i, mem, level) {
  const p = s.p[i];
  if (!p.al || s.over) { mem.plan = null; return 0; }
  const cfg = BOTS[level] || BOTS.normal, me = i + 1, onOwn = s.own[p.y * GW + p.x] === me;
  if (mem.lx !== p.x || mem.ly !== p.y) { mem.lx = p.x; mem.ly = p.y; if (mem.plan && mem.plan.length) mem.plan.shift(); }
  if (onOwn && mem.out) { mem.plan = null; mem.out = false; mem.home = false; }
  if (!onOwn) mem.out = true;
  if (!onOwn && p.tl > 0 && !mem.home) {
    // 선을 긋는 중에 누가 다가오면 집으로
    let near = 99;
    s.p.forEach((q, j) => { if (j !== i && q.al) near = Math.min(near, Math.abs(q.x - p.x) + Math.abs(q.y - p.y)); });
    if (near < cfg.fear + p.tl * 0.25) { mem.plan = pathHome(s, i); mem.home = true; }
  }
  if (!mem.plan || !mem.plan.length) mem.plan = onOwn ? makeLoop(s, i, cfg) : pathHome(s, i);
  let d = mem.plan[0];
  if (d == null || !okStep(s, i, d)) {
    mem.plan = onOwn ? makeLoop(s, i, cfg) : pathHome(s, i);
    d = mem.plan[0];
    if (d == null || !okStep(s, i, d)) d = [0, 1, 2, 3].find((x) => okStep(s, i, x));
  }
  return d == null ? 0 : BIT[d];
}

// ── 그리기 ──
function draw(ctx, v, env) {
  ctx.fillStyle = "#fbf3e0"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(43,45,110,.05)";
  for (let x = 0; x < GW; x += 2) ctx.fillRect(x * CELL, 0, CELL, H);
  for (let k = 0; k < N; k++) {
    const o = v.own[k], t = v.tr[k];
    if (!o && !t) continue;
    const x = (k % GW) * CELL, y = ((k / GW) | 0) * CELL;
    if (o) { ctx.fillStyle = SEAT_TINT[o - 1]; ctx.fillRect(x, y, CELL, CELL); }
    if (t) { ctx.fillStyle = SEAT_DARK[t - 1]; ctx.globalAlpha = 0.6; ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6); ctx.globalAlpha = 1; }
  }
  // 땅 가장자리 선
  ctx.lineWidth = 2;
  for (let k = 0; k < N; k++) {
    const o = v.own[k]; if (!o) continue;
    const cx = k % GW, cy = (k / GW) | 0, x = cx * CELL, y = cy * CELL;
    ctx.strokeStyle = SEAT_DARK[o - 1]; ctx.beginPath();
    if (cx === 0 || v.own[k - 1] !== o) { ctx.moveTo(x, y); ctx.lineTo(x, y + CELL); }
    if (cx === GW - 1 || v.own[k + 1] !== o) { ctx.moveTo(x + CELL, y); ctx.lineTo(x + CELL, y + CELL); }
    if (cy === 0 || v.own[k - GW] !== o) { ctx.moveTo(x, y); ctx.lineTo(x + CELL, y); }
    if (cy === GH - 1 || v.own[k + GW] !== o) { ctx.moveTo(x, y + CELL); ctx.lineTo(x + CELL, y + CELL); }
    ctx.stroke();
  }
  // 선수
  const a = env.host ? (v.tick % MOVE_EVERY) / MOVE_EVERY : env.alpha;
  v.p.forEach((p, i) => {
    if (!p.al) return;
    const x = (p.px + (p.x - p.px) * a + 0.5) * CELL, y = (p.py + (p.y - p.py) * a + 0.5) * CELL;
    ctx.fillStyle = SEAT_DARK[i]; ctx.beginPath(); ctx.arc(x, y + 2, 17, 0, 7); ctx.fill();
    drawMochi(ctx, x, y, 14, parseLook(v.seats[i].look, i));
    if (i === env.me) { ctx.fillStyle = "#d6336c"; ctx.beginPath(); ctx.moveTo(x - 6, y - 31); ctx.lineTo(x + 6, y - 31); ctx.lineTo(x, y - 23); ctx.fill(); }
    else label(ctx, v.seats[i].name, x, y - 22, 12, "#2a2440", "rgba(255,255,255,.9)");
  });
  // 점수판
  const n = v.seats.length, cw = 150, x0 = (W - (n * cw + 90)) / 2;
  v.seats.forEach((seat, i) => {
    const x = x0 + (i < n / 2 ? i * cw : i * cw + 90), p = v.p[i];
    ctx.fillStyle = "rgba(255,253,246,.92)"; ctx.strokeStyle = SEAT_DARK[i]; ctx.lineWidth = 3;
    rr(ctx, x + 4, 6, cw - 8, 34, 12); ctx.fill(); ctx.stroke();
    label(ctx, `${seat.name} ${((p.sc / N) * 100).toFixed(0)}%${p.al ? "" : " ✕"}`, x + cw / 2, 30, 16, i === env.me ? "#d6336c" : "#2b2d6e", null);
  });
  const sec = Math.max(0, Math.ceil(v.time / 60));
  ctx.fillStyle = "#2b2d6e"; rr(ctx, W / 2 - 38, 4, 76, 38, 12); ctx.fill();
  label(ctx, String(sec), W / 2, 32, 24, sec <= 10 ? "#ff8fa3" : "#fff", null);
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2, 80, "#ff5d73", "#fff");
  const me = env.me >= 0 ? v.p[env.me] : null;
  if (me && !me.al && !v.over) label(ctx, "선을 밟혔어요! 곧 다시 시작해요", W / 2, H / 2, 30, "#ff5d73", "#fff");
  if (v.over) label(ctx, v.over.w === env.me ? "이겼다!" : `${v.seats[v.over.w].name} 승리!`, W / 2, H / 2 - 10, 70, "#ffc93c", "#2b2d6e");
}

function fx(v, m, snd) {
  if (m.dc == null) Object.assign(m, { dc: v.dc, cc: v.cc, ov: !!v.over, sec: 99 });
  if (v.dc !== m.dc) { m.dc = v.dc; snd(400, 0.35, "sawtooth", 0.1, -300); }
  if (v.cc !== m.cc) { m.cc = v.cc; snd(520, 0.12, "triangle", 0.11, 260); }
  const sec = Math.ceil(v.time / 60);
  if (sec !== m.sec) { m.sec = sec; if (sec <= 5 && sec > 0 && !v.over) snd(880, 0.08, "square", 0.07); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
}

function title(v, me) {
  const w = v.over.w;
  if (me < 0) return `${v.seats[w].name} 승리! 한 판 더?`;
  return w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: MOVE_EVERY, action: null, overDelay: 220,
  bots: { solo: 3, local: 2 },
  fill: (mode, n) => (mode === 1 ? (n < 2 ? 1 : 0) : 4 - n),
  init, step, bot, draw, fx, title, pack, unpack, adopt: (v) => v,
};

export const meta = {
  local: true,
  soloText: "봇 3명과 겨뤄요. 난이도를 골라 주세요.",
  modeLabel: "빈자리",
  modes: [[0, "봇으로 채우기"], [1, "사람끼리만"]],
  role: () => "",
  hint: (n, mode) => (mode === 1 ? (n < 2 ? "혼자면 봇 하나와 붙어요." : `${n}명이 겨뤄요.`) : n < 4 ? `${n}명 + 봇 ${4 - n}명이 겨뤄요.` : "4명이 겨뤄요."),
  howto: [
    ["목표", "내 땅 밖으로 나가 선을 긋고 다시 내 땅으로 돌아오면, 둘러싼 곳이 모두 내 땅이 돼요. 90초 뒤 가장 넓은 사람이 승리"],
    ["주의", "선을 긋는 동안 누가(나 포함) 그 선을 밟으면 땅을 모두 잃고 새 자리에서 다시 시작해요. 상대 선을 밟아 끊어 보세요"],
    ["조작", "방향키 또는 W·A·S·D. 한번 누르면 그 방향으로 계속 가요"],
    ["한 키보드 2인", "1P: W·A·S·D / 2P: 방향키"],
  ],
};
export const start = (opts) => startHostGame(G, opts);

export const _test = G;
