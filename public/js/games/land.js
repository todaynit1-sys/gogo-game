// 땅따먹기 — 내 땅 밖으로 나가 선을 긋고 돌아오면 둘러싼 만큼 내 땅이 된다.
// 선을 긋는 동안 누가 그 선을 밟으면 탈락하고, 그 땅은 밟은 사람 것이 된다. 90초 뒤 땅이 가장 넓은 사람이 승리.
// 판마다 바위 배치가 다르고, 아이템(방패·깃발·얼음)이 나온다.

import { startHostGame, L, R, U, D } from "./hostgame.js?v=2";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle, SEAT_TINT, SEAT_DARK } from "./kit.js?v=3";

const GW = 48, GH = 27, CELL = 20, N = GW * GH, W = 960, H = 540;
const START = 120, TIME = 90 * 60, MOVE_EVERY = 7, RESPAWN = 16, ITEM_EVERY = 400;
const DX = [-1, 1, 0, 0], DY = [0, 0, -1, 1], OPP = [1, 0, 3, 2], BIT = [L, R, U, D];
const HOME = [[8, 6], [39, 20], [39, 6], [8, 20]];
const MAPS = ["빈 들판", "바위 밭", "가운데 연못", "네 기둥", "가로 담"];
const THEMES = [
  { name: "종이", bg: "#fbf3e0", stripe: "rgba(43,45,110,.05)", rock: ["#8f93b8", "#b9bdd8"] },
  { name: "풀밭", bg: "#e4f3d3", stripe: "rgba(60,120,50,.07)", rock: ["#7a8f6a", "#a9bd98"] },
  { name: "밤", bg: "#262a55", stripe: "rgba(255,255,255,.04)", rock: ["#4a4f86", "#7178b8"], dark: true },
  { name: "모래", bg: "#f6e3b9", stripe: "rgba(160,110,40,.07)", rock: ["#a8845a", "#cfae84"] },
];
const ITEM_COL = ["#6ec6ff", "#ff5d73", "#5fe0c8"];      // 방패, 깃발, 얼음
const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

function makeRocks(map) {
  const rk = new Array(N).fill(0);
  const put = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inb(x, y)) rk[y * GW + x] = 1; };
  if (map === 1) for (let k = 0; k < 10; k++) put(4 + ((Math.random() * 39) | 0), 2 + ((Math.random() * 22) | 0), 2, 2);
  else if (map === 2) put(19, 11, 10, 5);
  else if (map === 3) for (const [x, y] of [[15, 8], [30, 8], [15, 16], [30, 16]]) put(x, y, 3, 3);
  else if (map === 4) { put(14, 9, 9, 1); put(25, 17, 9, 1); put(23, 4, 1, 4); put(24, 19, 1, 4); }
  // 출발 자리 둘레는 비워 둔다
  for (const [hx, hy] of HOME) for (let y = hy - 4; y <= hy + 4; y++) for (let x = hx - 4; x <= hx + 4; x++) if (inb(x, y)) rk[y * GW + x] = 0;
  return rk;
}

function stamp(s, me, cx, cy, r = 2) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (inb(x, y) && !s.rk[y * GW + x]) s.own[y * GW + x] = me;
}

function init(seats) {
  const map = (Math.random() * MAPS.length) | 0;
  const s = { tick: 0, seats, map, th: (Math.random() * THEMES.length) | 0, own: new Array(N).fill(0), tr: new Array(N).fill(0), rk: makeRocks(map), it: [], time: TIME, p: [], over: null, dc: 0, cc: 0, ic: 0 };
  seats.forEach((_, i) => {
    const [x, y] = HOME[i];
    stamp(s, i + 1, x, y);
    s.p.push({ x, y, px: x, py: y, d: i % 2 ? 0 : 1, nd: i % 2 ? 0 : 1, al: 1, rs: 0, sc: 25, tl: 0, sh: 0, fz: 0 });
  });
  return s;
}

// j 가 탈락. by 가 밟았다면 j 의 땅은 by 것이 된다. 방패가 있으면 버틴다.
function kill(s, j, by) {
  const p = s.p[j];
  if (!p.al || p.sh > 0) return false;
  p.al = 0; p.rs = RESPAWN; p.tl = 0; p.fz = 0; s.dc++;
  const to = by >= 0 && by !== j ? by + 1 : 0;
  for (let k = 0; k < N; k++) { if (s.tr[k] === j + 1) s.tr[k] = 0; if (s.own[k] === j + 1) s.own[k] = to; }
  return true;
}

function respawn(s, j) {
  const p = s.p[j];
  let bx = HOME[j][0], by = HOME[j][1];
  for (let tries = 0; tries < 60; tries++) {
    const x = 3 + ((Math.random() * (GW - 6)) | 0), y = 3 + ((Math.random() * (GH - 6)) | 0);
    if (s.tr[y * GW + x] || s.rk[y * GW + x]) continue;
    if (s.p.some((q, k) => k !== j && q.al && Math.abs(q.x - x) + Math.abs(q.y - y) < 8)) continue;
    bx = x; by = y; break;
  }
  stamp(s, j + 1, bx, by);
  Object.assign(p, { x: bx, y: by, px: bx, py: by, al: 1, tl: 0, sh: 60, d: (Math.random() * 4) | 0 });      // 다시 나올 때 잠깐 방패
  p.nd = p.d;
}

// 내 땅과 내 선으로 둘러싸인 곳을 모두 내 땅으로 (바위는 그대로)
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
    else if (!reach[k] && s.own[k] !== me && !s.rk[k]) s.own[k] = me;
  }
  s.p[i].tl = 0; s.cc++;
}

function spawnItem(s) {
  for (let tries = 0; tries < 30; tries++) {
    const x = 2 + ((Math.random() * (GW - 4)) | 0), y = 3 + ((Math.random() * (GH - 5)) | 0), k = y * GW + x;
    if (s.rk[k] || s.tr[k] || s.it.some((q) => q.x === x && q.y === y)) continue;
    if (s.p.some((q) => q.al && Math.abs(q.x - x) + Math.abs(q.y - y) < 4)) continue;
    s.it.push({ x, y, k: (Math.random() * 3) | 0 });
    return;
  }
}

function pickup(s, i, at) {
  const p = s.p[i], it = s.it[at];
  s.it.splice(at, 1); s.ic++;
  if (it.k === 0) p.sh = 400;                                                       // 방패: 한동안 선을 밟혀도 무사
  else if (it.k === 1) { stamp(s, i + 1, p.x, p.y, 3); if (p.tl > 0) claim(s, i); }  // 깃발: 둘레 7×7 이 내 땅
  else s.p.forEach((q, j) => { if (j !== i && q.al) q.fz = 160; });                  // 얼음: 다른 사람이 잠깐 얼어붙는다
}

function step(s, masks) {
  s.tick++;
  if (s.over) { s.over.t++; return; }
  s.p.forEach((p, i) => {
    const m = masks[i] | 0, dir = m & L ? 0 : m & R ? 1 : m & U ? 2 : m & D ? 3 : -1;
    if (dir >= 0 && !(p.tl > 0 && dir === OPP[p.d])) p.nd = dir;     // 선을 긋는 중에는 뒤로 못 돈다
    if (p.sh > 0) p.sh--;
    if (p.fz > 0) p.fz--;
  });
  if (s.tick < START) return;
  if (--s.time <= 0) {
    let w = 0; s.p.forEach((p, i) => { if (p.sc > s.p[w].sc) w = i; });
    s.over = { w, t: 0 }; return;
  }
  if (s.tick % ITEM_EVERY === 0 && s.it.length < 3) spawnItem(s);
  if (s.tick % MOVE_EVERY) return;
  s.p.forEach((p, i) => {
    if (!p.al) { if (--p.rs <= 0) respawn(s, i); return; }
    p.px = p.x; p.py = p.y;
    if (p.fz > 0) return;
    p.d = p.nd;
    const nx = p.x + DX[p.d], ny = p.y + DY[p.d];
    if (!inb(nx, ny) || s.rk[ny * GW + nx]) return;                  // 벽이나 바위는 못 지나간다
    const k = ny * GW + nx, t = s.tr[k];
    if (t) { const dead = kill(s, t - 1, i); if (dead && t - 1 === i) return; }      // 선을 밟힌 사람이 탈락
    p.x = nx; p.y = ny;
    if (s.own[k] === i + 1) { if (p.tl > 0) claim(s, i); }
    else if (s.tr[k] !== i + 1) { s.tr[k] = i + 1; p.tl++; }
    const at = s.it.findIndex((q) => q.x === nx && q.y === ny);
    if (at >= 0) pickup(s, i, at);
  });
  for (const p of s.p) p.sc = 0;
  for (let k = 0; k < N; k++) if (s.own[k]) s.p[s.own[k] - 1].sc++;
}

// ── 주고받기: 판은 같은 값이 이어지는 길이로 줄여 보낸다 ──
function pack(s) {
  const r = []; let last = -1, n = 0;
  for (let k = 0; k < N; k++) {
    const v = s.own[k] + 5 * s.tr[k] + 25 * s.rk[k];
    if (v === last) n++; else { if (n) r.push(last, n); last = v; n = 1; }
  }
  r.push(last, n);
  return { tick: s.tick, seats: s.seats, map: s.map, th: s.th, it: s.it, time: s.time, p: s.p, over: s.over, dc: s.dc, cc: s.cc, ic: s.ic, r };
}
function unpack(o) {
  const own = new Array(N), tr = new Array(N), rk = new Array(N); let k = 0;
  for (let i = 0; i < o.r.length; i += 2) for (let n = o.r[i + 1], v = o.r[i]; n > 0 && k < N; n--, k++) { own[k] = v % 5; tr[k] = ((v / 5) | 0) % 5; rk[k] = (v / 25) | 0; }
  return { tick: o.tick, seats: o.seats, map: o.map, th: o.th, it: o.it || [], time: o.time, p: o.p, over: o.over, dc: o.dc, cc: o.cc, ic: o.ic, own, tr, rk };
}

// ── 봇 ──
const BOTS = { easy: { max: 4, fear: 3 }, normal: { max: 7, fear: 5 }, hard: { max: 11, fear: 6 } };
const free = (s, x, y) => inb(x, y) && !s.rk[y * GW + x];

function okStep(s, i, d) {
  const p = s.p[i], x = p.x + DX[d], y = p.y + DY[d];
  if (!free(s, x, y) || s.tr[y * GW + x] === i + 1) return false;
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
      if (!free(s, nx, ny)) continue;
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
    while (free(s, x + DX[d], y + DY[d]) && s.own[(y + DY[d]) * GW + x + DX[d]] === me && inside < 14) { x += DX[d]; y += DY[d]; inside++; }
    if (!free(s, x + DX[d], y + DY[d])) continue;
    const a = 2 + ((Math.random() * cfg.max) | 0), b = 2 + ((Math.random() * cfg.max) | 0);
    const side = d < 2 ? (Math.random() < 0.5 ? 2 : 3) : Math.random() < 0.5 ? 0 : 1;
    const plan = [];
    const walk = (dd, n) => { for (let k = 0; k < n; k++) { if (!free(s, x + DX[dd], y + DY[dd])) return; x += DX[dd]; y += DY[dd]; plan.push(dd); } };
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
  if (!onOwn && p.tl > 0 && !mem.home && p.sh <= 0) {
    // 선을 긋는 중에 누가 다가오면 집으로
    let near = 99;
    s.p.forEach((q, j) => { if (j !== i && q.al && q.fz <= 0) near = Math.min(near, Math.abs(q.x - p.x) + Math.abs(q.y - p.y)); });
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
function drawItem(ctx, it, t) {
  const x = (it.x + 0.5) * CELL, y = (it.y + 0.5) * CELL + Math.sin(t * 4 + it.x) * 1.5;
  ctx.fillStyle = "#fff"; ctx.strokeStyle = ITEM_COL[it.k]; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ITEM_COL[it.k]; ctx.strokeStyle = ITEM_COL[it.k]; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  if (it.k === 0) { ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x + 5, y + 2); ctx.quadraticCurveTo(x + 3, y + 6, x, y + 8); ctx.quadraticCurveTo(x - 3, y + 6, x - 5, y + 2); ctx.lineTo(x - 6, y - 5); ctx.closePath(); ctx.fill(); }
  else if (it.k === 1) { ctx.beginPath(); ctx.moveTo(x - 4, y + 8); ctx.lineTo(x - 4, y - 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 4, y - 8); ctx.lineTo(x + 7, y - 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill(); }
  else { for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 8, y - Math.sin(a) * 8); ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); ctx.stroke(); } }
}

function draw(ctx, v, env) {
  const th = THEMES[v.th | 0] || THEMES[0];
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.stripe;
  for (let x = 0; x < GW; x += 2) ctx.fillRect(x * CELL, 0, CELL, H);
  for (let k = 0; k < N; k++) {
    const o = v.own[k], t = v.tr[k], rock = v.rk[k];
    if (!o && !t && !rock) continue;
    const x = (k % GW) * CELL, y = ((k / GW) | 0) * CELL;
    if (rock) { ctx.fillStyle = th.rock[0]; ctx.fillRect(x, y, CELL, CELL); ctx.fillStyle = th.rock[1]; rr(ctx, x + 2, y + 2, CELL - 4, CELL - 6, 4); ctx.fill(); continue; }
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
  for (const it of v.it) drawItem(ctx, it, env.t);
  // 선수
  const a = env.host ? (v.tick % MOVE_EVERY) / MOVE_EVERY : env.alpha;
  v.p.forEach((p, i) => {
    if (!p.al) return;
    const x = (p.px + (p.x - p.px) * a + 0.5) * CELL, y = (p.py + (p.y - p.py) * a + 0.5) * CELL;
    ctx.fillStyle = SEAT_DARK[i]; ctx.beginPath(); ctx.arc(x, y + 2, 17, 0, 7); ctx.fill();
    drawMochi(ctx, x, y, 14, parseLook(v.seats[i].look, i));
    if (p.sh > 0 && (p.sh > 90 || v.tick % 10 < 6)) { ctx.strokeStyle = "rgba(110,198,255,.95)"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, 21, 0, 7); ctx.stroke(); }
    if (p.fz > 0) { ctx.fillStyle = "rgba(150,230,255,.6)"; ctx.beginPath(); ctx.arc(x, y, 19, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
    if (i === env.me) { ctx.fillStyle = "#d6336c"; ctx.beginPath(); ctx.moveTo(x - 6, y - 31); ctx.lineTo(x + 6, y - 31); ctx.lineTo(x, y - 23); ctx.fill(); }
    else label(ctx, v.seats[i].name, x, y - 24, 12, "#2a2440", "rgba(255,255,255,.9)");
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
  label(ctx, `${MAPS[v.map | 0]} · ${th.name}`, W - 10, H - 10, 14, th.dark ? "#fff" : "#2b2d6e", th.dark ? null : "rgba(255,255,255,.8)", "right");
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2, 80, "#ff5d73", "#fff");
  const me = env.me >= 0 ? v.p[env.me] : null;
  if (me && !v.over) {
    if (!me.al) label(ctx, "선을 밟혔어요! 곧 다시 시작해요", W / 2, H / 2, 30, "#ff5d73", "#fff");
    else if (me.fz > 0) label(ctx, "얼어붙었어요!", W / 2, H / 2, 30, "#3a94d9", "#fff");
  }
  if (v.over) label(ctx, v.over.w === env.me ? "이겼다!" : `${v.seats[v.over.w].name} 승리!`, W / 2, H / 2 - 10, 70, "#ffc93c", "#2b2d6e");
}

function fx(v, m, snd) {
  if (m.dc == null) Object.assign(m, { dc: v.dc, cc: v.cc, ic: v.ic | 0, ov: !!v.over, sec: 99 });
  if (v.dc !== m.dc) { m.dc = v.dc; snd(400, 0.35, "sawtooth", 0.1, -300); }
  if (v.cc !== m.cc) { m.cc = v.cc; snd.sparkle(); }
  if ((v.ic | 0) !== m.ic) { m.ic = v.ic | 0; snd.coin(); }
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
  hurry: (v) => v.tick >= START && v.time < 600,
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
    ["주의", "선을 긋는 동안 누가 그 선을 밟으면 탈락하고, 내 땅은 밟은 사람이 가져가요(내가 내 선을 밟으면 그냥 사라져요). 상대 선을 밟아 땅을 빼앗아 보세요"],
    ["아이템", "방패(파랑): 한동안 선을 밟혀도 무사 / 깃발(빨강): 둘레 7×7 이 바로 내 땅 / 얼음(청록): 다른 사람이 잠깐 얼어붙음"],
    ["맵", "판마다 빈 들판·바위 밭·가운데 연못·네 기둥·가로 담 가운데 하나. 바위는 지나갈 수 없어요"],
    ["조작", "방향키 또는 W·A·S·D. 한번 누르면 그 방향으로 계속 가요"],
    ["한 키보드 2인", "1P: W·A·S·D / 2P: 방향키"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
