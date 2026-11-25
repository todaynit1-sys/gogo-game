// 떡 카트 — 옥상 위 고리 트랙을 세 바퀴 도는 4대 카트 경주 (3D).
// 규칙·봇은 이 파일(노드에서도 돌아가게 three 를 부르지 않는다), 3D 무대는 kart3d.js 가 맡는다.
// 방장 브라우저가 계산하고, 나머지는 줄인 상태(pack)를 받아 각자 내 카트 뒤에서 본다.

import { lazy3d } from "./lazy3d.js?v=1";
import { startHostGame, L, R, A, B, D } from "./hostgame.js?v=4";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle } from "./kit.js?v=3";

const W = 960, H = 540, DT = 1 / 60, START = 200, LAPS = 3;
export const HW = 5, WALL = 8.6, KR = 0.95, SP = 1.5;              // 길 반폭, 벽까지 거리, 카트 반지름, 길 점 간격
const VMAX = 21, TURN = 2.2, OFF = 0.6, BOOST = 1.42, FIRE_V = 34, DC1 = 55, DC2 = 130;
export const KART_COL = ["#ff5d73", "#4d9be0", "#ffa91e", "#2fae74"];
const RANK_COL = ["#ffd23f", "#e9eefc", "#ffb27a", "#c9c3e6"];
export const ITEMS = [null, "꿀 부스터", "참기름 웅덩이", "찹쌀 폭죽", "떡 방패"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (i, n) => ((i % n) + n) % n;
const TAU = Math.PI * 2;
const wrapA = (a) => a - TAU * Math.round(a / TAU);
const mix = (a, b, t) => a + (b - a) * t;

// ── 트랙: 조절점을 지나는 매끈한 고리(캣멀-롬)를 1.5 간격 점으로 다시 나눈다. 0번 점이 출발선 ──
const TRACKS = [
  { name: "노을 한 바퀴", sky: "dusk", floor: 0xdcb692, k: 1.7,
    pts: [[0, -26], [30, -26], [48, -16], [50, 4], [38, 18], [18, 20], [4, 10], [-12, 16], [-32, 24], [-50, 14], [-52, -8], [-34, -24]] },
  { name: "구불 골목", sky: "day", floor: 0xe6cfa8, k: 1.62,
    pts: [[0, -28], [26, -28], [48, -20], [56, 0], [42, 18], [20, 6], [0, 24], [-22, 8], [-44, 22], [-58, 4], [-52, -16], [-30, -28]] },
  { name: "달밤 큰 고리", sky: "night", floor: 0xc7aa9a, k: 1.34,
    pts: [[0, -30], [20, -30], [52, -22], [58, 0], [46, 24], [26, 32], [16, 18], [14, 4], [0, -6], [-14, 4], [-16, 18], [-26, 32], [-46, 24], [-58, 2], [-56, -20], [-20, -30]] },
];
const TC = [];
export function trackOf(id) {
  id = mod(id | 0, TRACKS.length);
  if (TC[id]) return TC[id];
  const Dd = TRACKS[id], P = Dd.pts.map(([x, z]) => [x * Dd.k, z * Dd.k]), n = P.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let j = 0; j < 30; j++) {
      const t = j / 30, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const m = dense.length, cum = [0];
  for (let i = 1; i <= m; i++) { const a = dense[i - 1], b = dense[i % m]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = cum[m], N = Math.round(len / SP), st = len / N, x = [], z = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * st;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % m], f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    x.push(a[0] + (b[0] - a[0]) * f); z.push(a[1] + (b[1] - a[1]) * f);
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); z0 = Math.min(z0, z[i]); z1 = Math.max(z1, z[i]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < N; i++) { x[i] -= cx; z[i] -= cz; }
  const tx = [], tz = [], ang = [];
  for (let i = 0; i < N; i++) {
    const dx = x[(i + 1) % N] - x[(i + N - 1) % N], dz = z[(i + 1) % N] - z[(i + N - 1) % N], l = Math.hypot(dx, dz) || 1;
    tx.push(dx / l); tz.push(dz / l); ang.push(Math.atan2(dz, dx));
  }
  const rows = [0.25, 0.51, 0.77].map((f) => Math.round(N * f)), bxs = [];
  for (const r of rows) for (const l of [-3.3, -1.1, 1.1, 3.3]) bxs.push([x[r] - tz[r] * l, z[r] + tx[r] * l]);
  return (TC[id] = { id, hw: HW, wall: WALL, name: Dd.name, sky: Dd.sky, floor: Dd.floor, N, L: len, st, x, z, tx, tz, ang, rows, bxs, w: x1 - x0, d: z1 - z0 });
}

// 가까운 길 점 찾기 (앞뒤 몇 점만 살펴서, 길이 가까이 붙은 곳에서도 건너뛰지 않게). 옆으로 벗어난 거리를 돌려준다(+ 오른쪽)
function near(T, o) {
  const N = T.N; let best = Infinity, bo = 0;
  for (let k = -9; k <= 9; k++) { const i = mod(o.u + k, N), dx = o.x - T.x[i], dz = o.z - T.z[i], d = dx * dx + dz * dz; if (d < best) { best = d; bo = k; } }
  o.u += bo;
  const i = mod(o.u, N), dx = o.x - T.x[i], dz = o.z - T.z[i];
  o.al = dx * T.tx[i] + dz * T.tz[i];
  return dx * -T.tz[i] + dz * T.tx[i];
}
const prog = (T, k) => k.u * T.st + (k.al || 0);

// ── 봇 실력: vm 최고 속도 비율, lag 판단 간격, dead 핸들 둔감, lane 줄 흔들림, line 안쪽 파고들기, drift 드리프트 쓰는 정도, wob 실수, idel 아이템 늦게 쓰기 ──
const BOT = {
  easy: { vm: 0.86, lag: 14, dead: 0.11, lane: 2.6, line: 0.15, drift: 0, wob: 0.006, idel: 150, start: 0 },
  normal: { vm: 0.885, lag: 8, dead: 0.07, lane: 1.6, line: 0.5, drift: 0.35, wob: 0.002, idel: 70, start: 0.35 },
  hard: { vm: 1.0, lag: 2, dead: 0.04, lane: 0.8, line: 0.85, drift: 1, wob: 0, idel: 25, start: 0.95 },
};
// 뒤처진 카트는 조금 빨라지고(사람이 더 많이), 사람보다 앞선 봇은 난이도에 따라 살짝 느긋해진다
const RB_H = 0.13, RB_B = 0.08, EASE = { easy: 0.22, normal: 0.13, hard: 0 };
// 아이템 확률 [부스터, 웅덩이, 폭죽, 방패] — 순위가 낮을수록 좋은 것
const ODDS = [[15, 40, 5, 40], [30, 20, 30, 20], [40, 10, 38, 12], [50, 0, 45, 5]];

function init(seats, opt) {
  const ss = seats.slice(0, 4), mode = opt ? opt.mode | 0 : 0;
  const tr = mode >= 1 && mode <= TRACKS.length ? mode - 1 : (Math.random() * TRACKS.length) | 0;
  const T = trackOf(tr), lv = opt && BOT[opt.level] ? opt.level : "normal";
  const grid = ss.map((_, i) => i).sort(() => Math.random() - 0.5);
  const k = ss.map((seat, i) => {
    const g = grid[i], u = -3 - g * 2, i0 = mod(u, T.N), lat = g & 1 ? 2.4 : -2.4;
    return {
      x: T.x[i0] - T.tz[i0] * lat, z: T.z[i0] + T.tx[i0] * lat, a: T.ang[i0], v: 0, u, al: 0, rk: g + 1,
      sp: 0, bo: 0, sh: 0, iv: 0, dr: 0, dc: 0, hp: 0, pa: 0, pb: 0, it: 0, ir: 0, px: 0, pz: 0,
      off: 0, ww: 0, wl: 0, fin: 0, ft: 0, lm: -1, lt: -999, rs: 0,
      hum: seat.c !== "b" ? 1 : 0, bm: seat.c === "b" ? BOT[lv].vm : 1,
    };
  });
  return { tick: 0, seats: ss, tr, lv, k, o: [], bx: T.bxs.map(() => 0), nf: 0, f1: 0, lh: 0, e: [0, 0, 0, 0], over: null };
}

function spin(k, n, slow) { k.sp = n; k.iv = n + 50; k.dr = 0; k.dc = 0; k.bo = 0; k.v *= slow; }

function useItem(s, i) {
  const k = s.k[i], it = k.it, c = Math.cos(k.a), sn = Math.sin(k.a);
  k.it = 0; s.e[1]++;
  if (it === 1) k.bo = 80;
  else if (it === 2) {
    s.o.push({ t: 1, x: k.x - c * 2.6, z: k.z - sn * 2.6, a: 0, u: k.u, w: i, l: 1500, g: -1 });
    let n = 0; for (const o of s.o) if (o.t === 1) n++;
    if (n > 6) s.o.splice(s.o.findIndex((o) => o.t === 1), 1);
  } else if (it === 3) {
    const g = s.k.findIndex((q) => q.rk === k.rk - 1 && !q.fin);
    s.o.push({ t: 2, x: k.x + c * 1.8, z: k.z + sn * 1.8, a: k.a, u: k.u, w: i, l: 330, g });
  } else if (it === 4) k.sh = 420;
}

// 결승 뒤나 경기가 끝난 뒤에는 저절로 길을 따라 천천히 돈다
function aimAt(T, k, la, lat) { const j = mod(k.u + la, T.N); return wrapA(Math.atan2(T.z[j] + T.tx[j] * lat - k.z, T.x[j] - T.tz[j] * lat - k.x) - k.a); }
function autoMask(T, k) { const d = aimAt(T, k, 4 + Math.round(Math.abs(k.v) * 0.25), 0); return d > 0.06 ? R : d < -0.06 ? L : 0; }

function drive(s, T, k, i, m, rb) {
  const steer = (m & R ? 1 : 0) - (m & L ? 1 : 0), aHeld = m & A ? 1 : 0, bEdge = m & B && !k.pb;
  k.pb = m & B ? 1 : 0;
  if (k.iv > 0) k.iv--;
  if (k.sh > 0) k.sh--;
  if (k.ir > 0) k.ir--;
  if (k.hp > 0) k.hp--;
  if (k.sp > 0) { k.sp--; k.v *= 0.95; k.pa = aHeld; }
  else {
    // 드리프트: 누르는 순간 폴짝 뛰고, 그때(또는 뛰는 동안) 꺾은 쪽으로 미끄러진다. 오래 버틸수록 뗄 때 부스트가 세다
    if (aHeld && !k.pa && Math.abs(k.v) > 6) { k.hp = 12; k.dr = steer; k.dc = 0; }
    if (!k.dr && aHeld && k.hp > 0 && steer && k.v > 6) k.dr = steer;
    if (k.dr && (!aHeld || k.v < 6)) {
      if (!aHeld && k.dc >= DC2) k.bo = Math.max(k.bo, 56);
      else if (!aHeld && k.dc >= DC1) k.bo = Math.max(k.bo, 30);
      k.dr = 0; k.dc = 0;
    }
    k.pa = aHeld;
    let yaw;
    if (k.dr) { yaw = k.dr * (1.4 + 0.9 * steer * k.dr); k.dc += steer * k.dr > 0 ? 1.5 : steer ? 0.6 : 1; }
    else yaw = steer * TURN * Math.min(1, Math.abs(k.v) / 7) * (k.v < 0 ? -1 : 1);
    k.a += yaw * DT;
    if (bEdge && k.it && !k.ir) useItem(s, i);
  }
  // 속도: 가속은 저절로, ↓ 는 브레이크(멈추면 후진)
  const cruise = k.fin || s.over;
  let top = VMAX * k.bm * rb * (k.off ? OFF : 1) * (k.dr ? 0.97 : 1) * (cruise ? 0.7 : 1);
  if (k.sp > 0) { /* 미끄러지는 중 */ }
  else if (k.bo > 0) { k.bo--; top = Math.max(top, VMAX * BOOST * (k.off ? 0.8 : 1)); k.v = Math.min(top, k.v + 45 * DT); }
  else if (m & D && !cruise) k.v = Math.max(-7, k.v - 30 * DT);
  else if (k.v < top) k.v = Math.min(top, k.v + (4 + (top - k.v) * 1.5) * DT);
  else k.v = Math.max(top, k.v - (k.off ? 22 : 10) * DT);

  k.x += (Math.cos(k.a) * k.v + k.px) * DT; k.z += (Math.sin(k.a) * k.v + k.pz) * DT;
  k.px *= 0.9; k.pz *= 0.9;
  const lat = near(T, k), al = Math.abs(lat), i0 = mod(k.u, T.N);
  k.off = al > HW + KR * 0.4 ? 1 : 0;
  if (al > WALL) {      // 말랑 쿠션 벽: 밀어내고, 카트를 길 방향으로 살짝 돌려서 미끄러져 나가게
    const nx = -T.tz[i0], nz = T.tx[i0], sg = lat > 0 ? 1 : -1, ov = al - WALL;
    k.x -= nx * ov * sg; k.z -= nz * ov * sg;
    const pn = (k.px * nx + k.pz * nz) * sg;
    if (pn > 0) { k.px -= nx * pn * sg; k.pz -= nz * pn * sg; }
    const ta = T.ang[i0], fw = Math.cos(k.a - ta) >= 0 ? ta : ta + Math.PI;
    k.a += wrapA(fw - k.a) * 0.18;
    if (!k.wl) { k.v *= 0.8; s.e[0]++; } else k.v *= 0.995;
    k.wl = 1;
  } else k.wl = 0;
  // 거꾸로 달리는지
  if (k.v > 3 && Math.cos(k.a - T.ang[i0]) < -0.3) k.ww = Math.min(200, k.ww + 1); else k.ww = Math.max(0, k.ww - 3);
  // 아이템 상자
  for (let b = 0; b < T.bxs.length; b++) {
    if (s.bx[b]) continue;
    const dx = k.x - T.bxs[b][0], dz = k.z - T.bxs[b][1];
    if (dx * dx + dz * dz > 1.75 * 1.75) continue;
    s.bx[b] = 150;
    if (!k.it && !k.ir && !k.fin) { k.it = roll(k.rk); k.ir = 45; }
  }
  // 바퀴 수
  const lap = Math.floor(k.u / T.N);
  if (lap > k.lm) { k.lm = lap; if (lap > 0) k.lt = s.tick; }
  if (!k.fin && k.u >= LAPS * T.N) { k.fin = ++s.nf; k.ft = s.tick; k.it = 0; k.ir = 0; if (!s.f1) s.f1 = s.tick; if (k.hum) s.lh = s.tick; }
}
function roll(rank) { const w = ODDS[clamp(rank, 1, 4) - 1]; let r = Math.random() * 100; for (let j = 0; j < 4; j++) { r -= w[j]; if (r < 0) return j + 1; } return 1; }

function step(s, masks) {
  s.tick++;
  if (s.over) s.over.t++;
  const T = trackOf(s.tr), ks = s.k, n = ks.length;
  if (s.tick < START) {      // 카운트다운: 출발 직전에 드리프트 버튼을 누르고 있으면 출발 부스트
    for (let i = 0; i < n; i++) { const m = masks[i] | 0; if (m & A && s.tick >= START - 40) ks[i].rs = 1; ks[i].pa = m & A ? 1 : 0; }
    return;
  }
  if (s.tick === START) for (const k of ks) if (k.rs) { k.bo = 50; }
  // 따라잡기 보정
  let lead = -Infinity, hb = -Infinity;
  for (const k of ks) { const p = prog(T, k); if (!k.fin) lead = Math.max(lead, p); if (k.hum) hb = Math.max(hb, k.fin ? Infinity : p); }
  for (let i = 0; i < n; i++) {
    const k = ks[i];
    let rb = 1;
    if (!k.fin) {
      const p = prog(T, k);
      rb += Math.min(1, Math.max(0, lead - p) / 50) * (k.hum ? RB_H : RB_B);
      if (!k.hum && hb > -Infinity && hb < Infinity && p > hb + 5) rb *= 1 - Math.min(1, (p - hb) / 60) * (EASE[s.lv] || 0);
    }
    const m = k.fin || s.over ? autoMask(T, k) : masks[i] | 0;
    drive(s, T, k, i, m, rb);
  }
  // 부딪히기
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = ks[i], b = ks[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 >= 4 * KR * KR || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = (2 * KR - d) / 2;
    a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
    const va = (Math.cos(a.a) * a.v + a.px) * nx + (Math.sin(a.a) * a.v + a.pz) * nz, vb = (Math.cos(b.a) * b.v + b.px) * nx + (Math.sin(b.a) * b.v + b.pz) * nz, cl = va - vb;
    if (cl <= 0) continue;
    const imp = 2 + cl * 0.55, ka = b.sh && !a.sh ? 2.2 : a.sh && !b.sh ? 0.4 : 1, kb = a.sh && !b.sh ? 2.2 : b.sh && !a.sh ? 0.4 : 1;
    a.px -= nx * imp * ka; a.pz -= nz * imp * ka; b.px += nx * imp * kb; b.pz += nz * imp * kb;
    if (cl > 2.5) s.e[0]++;
  }
  // 웅덩이와 폭죽
  for (let j = s.o.length - 1; j >= 0; j--) {
    const o = s.o[j];
    if (--o.l <= 0) { s.o.splice(j, 1); continue; }
    if (o.t === 2) {
      near(T, o);
      const g = o.g >= 0 ? ks[o.g] : null;
      let tx, tz;
      if (g && !g.fin && Math.hypot(g.x - o.x, g.z - o.z) < 24) { tx = g.x; tz = g.z; }
      else { const i2 = mod(o.u + 6, T.N); tx = T.x[i2]; tz = T.z[i2]; }
      o.a += clamp(wrapA(Math.atan2(tz - o.z, tx - o.x) - o.a), -0.1, 0.1);
      o.x += Math.cos(o.a) * FIRE_V * DT; o.z += Math.sin(o.a) * FIRE_V * DT;
    }
    for (let q = 0; q < n; q++) {
      if (q === o.w && (o.t === 2 || o.l > 1440)) continue;
      const k = ks[q], r = o.t === 1 ? 1.6 : 1.35;
      if ((k.x - o.x) ** 2 + (k.z - o.z) ** 2 > r * r) continue;
      if (k.sh) { k.sh = 0; s.e[3]++; }
      else if (!k.iv) { spin(k, o.t === 1 ? 55 : 70, o.t === 1 ? 0.6 : 0.4); s.e[2]++; }
      else continue;
      s.o.splice(j, 1); break;
    }
  }
  for (let b = 0; b < s.bx.length; b++) if (s.bx[b] > 0) s.bx[b]--;
  // 순위
  const ord = ks.map((_, i) => i).sort((a, b) => { const p = ks[a], q = ks[b]; if (p.fin || q.fin) return (p.fin || 99) - (q.fin || 99); return prog(T, q) - prog(T, p); });
  ord.forEach((i, r) => { ks[i].rk = r + 1; });
  if (!s.over) {
    let hums = 0, humFin = 0, all = true;
    for (const k of ks) { if (k.hum) { hums++; if (k.fin) humFin++; } if (!k.fin) all = false; }
    if (all || (hums && humFin === hums && s.tick - s.lh > 150) || (s.f1 && s.tick - s.f1 > 25 * 60) || s.tick > START + 200 * 60) s.over = { w: ord[0], t: 0, r: ord };
  }
}

// ── 봇 ──
function bot(s, i, mem, level) {
  const P = BOT[level] || BOT.normal, k = s.k[i], T = trackOf(s.tr);
  if (s.tick < START) { if (mem.st == null) mem.st = Math.random() < P.start; return mem.st && s.tick >= START - 30 ? A : 0; }
  if (s.over || k.fin || k.sp > 0) { mem.dh = 0; return 0; }
  if (mem.t == null || s.tick - mem.t >= P.lag || s.tick < mem.t) {
    mem.t = s.tick;
    if (mem.ln == null || Math.random() < 0.03) mem.ln = (Math.random() * 2 - 1) * P.lane;
    const la = 3 + Math.round(Math.abs(k.v) * 0.28), j = mod(k.u + la, T.N);
    const turn = wrapA(T.ang[mod(k.u + la + 9, T.N)] - T.ang[mod(k.u, T.N)]);
    const lat = clamp(mem.ln + Math.sign(turn) * Math.min(1, Math.abs(turn)) * HW * 0.6 * (k.dr ? P.line * 0.25 : P.line), -HW + 1.2, HW - 1.2);
    mem.tx = T.x[j] - T.tz[j] * lat; mem.tz = T.z[j] + T.tx[j] * lat; mem.turn = turn;
    mem.tn = wrapA(T.ang[mod(k.u + 6, T.N)] - T.ang[mod(k.u, T.N)]);      // 바로 앞 굽이
  }
  const diff = wrapA(Math.atan2(mem.tz - k.z, mem.tx - k.x) - k.a);
  let m = 0;
  // 끼였으면 잠깐 후진
  if (k.v < 2 && !k.bo) mem.sk = (mem.sk | 0) + 1; else mem.sk = 0;
  if (mem.sk > 50) { mem.rv = 45; mem.sk = 0; }
  if (mem.rv > 0) { mem.rv--; return D | (diff > 0 ? L : R); }
  if (Math.random() < P.wob) { mem.wb = 10 + ((Math.random() * 14) | 0); mem.wd = Math.random() < 0.5 ? L : R; }
  if (mem.wb > 0) { mem.wb--; m |= mem.wd; }
  else if (diff > P.dead) m |= R; else if (diff < -P.dead) m |= L;
  // 드리프트: 큰 굽이 앞에서 꺾으며 누르고, 굽이가 끝나면 뗀다
  if (Math.abs(mem.turn) < 0.4) mem.dd = 0;      // 굽이마다 한 번 드리프트할지 정한다
  else if (!mem.dd && Math.abs(mem.turn) > 0.75 && mem.tn * mem.turn > 0.06 && k.v > 13) { mem.dd = 1; if (!k.dr && Math.random() < P.drift) mem.dh = 1; }
  if (mem.dh) {
    if (!k.dr) {
      if (mem.dh++ > 6) mem.dh = 0;      // 드리프트가 안 걸렸으면 포기
      else m = (m & ~(L | R)) | (mem.turn > 0 ? R : L) | A;
    } else {
      mem.dh++;
      m &= ~(L | R);
      if (diff * k.dr > 0.04) m |= k.dr > 0 ? R : L; else if (diff * k.dr < -0.04) m |= k.dr > 0 ? L : R;
      const done = Math.abs(mem.tn) < 0.12 && k.dc >= DC1, bad = Math.abs(diff) > 0.85 || mem.dh > 170;
      if (done || bad) mem.dh = 0; else m |= A;
    }
  }
  // 아이템
  if (k.it && !k.ir) {
    mem.ih = (mem.ih | 0) + 1;
    if (mem.ih > P.idel) {
      let use = false;
      const p = prog(T, k);
      if (k.it === 1) use = Math.abs(mem.turn) < 0.35 || mem.ih > P.idel + 200;
      else if (k.it === 2) use = s.k.some((q) => q !== k && p - prog(T, q) > 2 && p - prog(T, q) < 16) || mem.ih > P.idel + 260;
      else if (k.it === 3) use = s.k.some((q) => q.rk === k.rk - 1 && prog(T, q) - p < 70) || mem.ih > P.idel + 300;
      else use = true;
      if (use) { m |= B; mem.ih = 0; }
    }
  } else mem.ih = 0;
  return m;
}

// ── 주고받기: 카트는 숫자 배열로 줄여 보낸다 (한 장면 약 330바이트, 초당 20번) ──
const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
function pack(s) {
  let bx = 0;
  for (let b = 0; b < s.bx.length; b++) if (!s.bx[b]) bx |= 1 << b;
  return {
    tick: s.tick, tr: s.tr, lv: s.lv, seats: s.tick < 60 || s.tick % 30 === 0 || s.over ? s.seats : undefined, nf: s.nf, f1: s.f1, lh: s.lh, e: s.e, over: s.over, bx,
    k: s.k.map((k) => [r2(k.x), r2(k.z), r2(wrapA(k.a)), r1(k.v), k.u, k.rk, k.it, k.ir, k.sp, k.bo, k.sh, k.dr, k.dc >= DC2 ? 2 : k.dc >= DC1 ? 1 : 0, k.hp, k.fin, k.ft, k.ww > 45 ? 1 : 0, k.off, k.lm, k.lt]),
    o: s.o.map((o) => [o.t, r1(o.x), r1(o.z), r2(wrapA(o.a))]),
  };
}
// 자리 정보(이름·모습)는 판 중에 안 바뀌므로 0.5초마다만 보내고, 받는 쪽은 마지막 것을 기억해 둔다
let seatCache = [];
function unpack(p) {
  if (p.seats) seatCache = p.seats;
  const T = trackOf(p.tr), bx = [];
  for (let b = 0; b < T.bxs.length; b++) bx.push(p.bx >> b & 1 ? 0 : 1);
  return {
    tick: p.tick, tr: p.tr, lv: p.lv, seats: p.seats || seatCache, nf: p.nf, f1: p.f1, lh: p.lh, e: p.e || [0, 0, 0, 0], over: p.over, bx,
    k: (p.k || []).map((q) => ({ x: q[0], z: q[1], a: q[2], v: q[3], u: q[4], rk: q[5], it: q[6], ir: q[7], sp: q[8], bo: q[9], sh: q[10], dr: q[11], dc: [0, DC1, DC2][q[12]] || 0, hp: q[13], fin: q[14], ft: q[15], ww: q[16] ? 99 : 0, off: q[17], lm: q[18], lt: q[19] })),
    o: (p.o || []).map((q) => ({ t: q[0], x: q[1], z: q[2], a: q[3] })),
  };
}
// 방장이 나가서 내가 이어받을 때: 받은 보기에서 계산용 상태를 다시 만든다
function adopt(v) {
  const T = trackOf(v.tr), lv = BOT[v.lv] ? v.lv : "normal";
  const findU = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < T.N; i++) { const d = (x - T.x[i]) ** 2 + (z - T.z[i]) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  return {
    ...v, lv, e: [...v.e], bx: v.bx.map((b) => (b ? 60 : 0)), over: v.over ? { ...v.over } : null,
    k: v.k.map((k, i) => { const seat = v.seats[i] || { c: "b" }; return { ...k, al: 0, iv: 0, pa: 0, pb: 0, px: 0, pz: 0, wl: 0, rs: 0, hum: seat.c !== "b" ? 1 : 0, bm: seat.c === "b" ? BOT[lv].vm : 1 }; }),
    o: v.o.map((o) => { const u = findU(o.x, o.z), fw = o.t === 2; return { ...o, u, w: -1, l: fw ? 200 : 900, g: fw ? v.k.reduce((g, q, i) => (q.rk === 1 ? i : g), -1) : -1 }; }),
  };
}

// ── 그리기 ──
const stage = lazy3d("./kart3d.js?v=1");
const POSE = [0, 1, 2, 3].map(() => ({ x: 0, z: 0, a: 0 })), OPOSE = [];
function poses(v, env) {
  const q = env.prev && env.prev.k && env.prev.k.length === v.k.length && env.prev.tr === v.tr ? env.prev.k : null, al = env.alpha == null ? 1 : env.alpha;
  for (let i = 0; i < v.k.length; i++) {
    const k = v.k[i], p = POSE[i];
    if (q && al < 1 && Math.abs(q[i].x - k.x) + Math.abs(q[i].z - k.z) < 12) { p.x = mix(q[i].x, k.x, al); p.z = mix(q[i].z, k.z, al); p.a = q[i].a + wrapA(k.a - q[i].a) * al; }
    else { p.x = k.x; p.z = k.z; p.a = k.a; }
  }
  const qo = env.prev && env.prev.o && env.prev.o.length === v.o.length ? env.prev.o : null;
  while (OPOSE.length < v.o.length) OPOSE.push({ t: 0, x: 0, z: 0, a: 0 });
  OPOSE.length = v.o.length;
  for (let j = 0; j < v.o.length; j++) {
    const o = v.o[j], p = OPOSE[j], r = qo && qo[j].t === o.t && al < 1 ? qo[j] : null;
    p.t = o.t; p.x = r ? mix(r.x, o.x, al) : o.x; p.z = r ? mix(r.z, o.z, al) : o.z; p.a = r ? r.a + wrapA(o.a - r.a) * al : o.a;
  }
  return POSE;
}

function draw(ctx, v, env) {
  const T = trackOf(v.tr), me = env.me >= 0 && env.me < v.k.length ? env.me : -1;
  const pose = poses(v, env);
  let fol = me;
  if (fol < 0) { fol = 0; for (let i = 0; i < v.k.length; i++) if (v.k[i].rk === 1) fol = i; }      // 관전: 선두를 따라간다
  let d3 = null;
  const m3 = stage.get();
  if (m3) { try { d3 = m3.render(v, env, T, pose, OPOSE, fol); ctx.drawImage(d3.cv, 0, 0, W, H); } catch { d3 = null; stage.fail(); } }
  if (d3) {
    for (let i = 0; i < v.k.length; i++) { const tg = d3.tags[i]; if (i !== fol && tg) label(ctx, v.seats[i] ? v.seats[i].name : "", tg[0], tg[1], 13, "#fff", "rgba(43,45,110,.8)"); }
  } else flat(ctx, v, T, pose, fol);
  hud(ctx, v, T, fol, me, env);
}

// 3D 를 못 쓰는 기기(또는 불러오는 중): 내 카트가 늘 위를 보게 돌아가는 위에서 본 화면
function flat(ctx, v, T, pose, fol) {
  const sky = { dusk: "#e9b48c", day: "#cfe6c2", night: "#3b3a6e" }[T.sky] || "#e9b48c";
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const me = pose[fol], th = -Math.PI / 2 - me.a, SC = 9, cx = W / 2, cy = H * 0.66, c = Math.cos(th), sn = Math.sin(th);
  const scr = (x, z) => { const dx = (x - me.x) * SC, dz = (z - me.z) * SC; return [cx + dx * c - dz * sn, cy + dx * sn + dz * c]; };
  if (!T.p2 && typeof Path2D !== "undefined") { const p = new Path2D(); p.moveTo(T.x[0], T.z[0]); for (let i = 1; i < T.N; i++) p.lineTo(T.x[i], T.z[i]); p.closePath(); T.p2 = p; }
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(th); ctx.scale(SC, SC); ctx.translate(-me.x, -me.z);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = "#f6f1e6"; ctx.lineWidth = WALL * 2 + 1.4; ctx.stroke(T.p2);
  ctx.strokeStyle = "#8fc46a"; ctx.lineWidth = WALL * 2; ctx.stroke(T.p2);
  ctx.strokeStyle = "#e8505b"; ctx.lineWidth = HW * 2 + 1.4; ctx.stroke(T.p2);
  ctx.strokeStyle = "#6f6a7e"; ctx.lineWidth = HW * 2; ctx.stroke(T.p2);
  ctx.setLineDash([2, 2.5]); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 0.25; ctx.stroke(T.p2); ctx.setLineDash([]);
  // 출발선
  ctx.save(); ctx.translate(T.x[0], T.z[0]); ctx.rotate(T.ang[0]);
  for (let r = 0; r < 2; r++) for (let q = -5; q < 5; q++) { ctx.fillStyle = (q + r) & 1 ? "#fff" : "#2b2d6e"; ctx.fillRect(r * 0.7 - 0.7, q * HW / 5, 0.7, HW / 5); }
  ctx.restore();
  ctx.restore();
  // 아이템 상자
  for (let b = 0; b < T.bxs.length; b++) {
    if (v.bx[b]) continue;
    const [x, y] = scr(T.bxs[b][0], T.bxs[b][1]);
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    ctx.fillStyle = "#b79cff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; rr(ctx, x - 8, y - 8, 16, 16, 4); ctx.fill(); ctx.stroke();
    label(ctx, "?", x, y + 5, 13, "#fff", null);
  }
  for (const o of OPOSE) {
    const [x, y] = scr(o.x, o.z);
    if (o.t === 1) { ctx.fillStyle = "rgba(240,190,60,.85)"; ctx.beginPath(); ctx.ellipse(x, y, 15, 12, 0, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = "#ff5d73"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  // 카트 (먼 것부터)
  const order = v.k.map((_, i) => i).sort((a, b) => scr(pose[a].x, pose[a].z)[1] - scr(pose[b].x, pose[b].z)[1]);
  for (const i of order) {
    const k = v.k[i], p = pose[i], [x, y] = scr(p.x, p.z), ha = p.a + th + (k.sp ? v.tick * 0.5 : 0);
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ha + Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, -9, -11, 20, 26, 6); ctx.fill();
    ctx.fillStyle = KART_COL[i % 4]; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2; rr(ctx, -10, -13, 20, 26, 6); ctx.fill(); ctx.stroke();
    if (k.bo) { ctx.fillStyle = "#ffb13b"; ctx.beginPath(); ctx.moveTo(-5, 13); ctx.lineTo(0, 24 + Math.random() * 6); ctx.lineTo(5, 13); ctx.fill(); }
    ctx.restore();
    const hop = k.hp ? Math.sin((k.hp / 12) * Math.PI) * 6 : 0;
    drawMochi(ctx, x, y - 4 - hop, 10, parseLook(v.seats[i] ? v.seats[i].look : "", i));
    if (k.sh) { ctx.strokeStyle = "rgba(140,220,255,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 2, 18, 0, 7); ctx.stroke(); }
    if (k.dr) { ctx.fillStyle = k.dc >= DC2 ? "#ff9a3c" : k.dc >= DC1 ? "#7fd4ff" : "#fff"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * 9, y + 12, 3, 0, 7); ctx.fill(); } }
    if (i !== fol) label(ctx, v.seats[i] ? v.seats[i].name : "", x, y - 22, 12, "#fff", "rgba(43,45,110,.8)");
  }
}

function drawItem(ctx, id, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 30, s / 30); ctx.lineWidth = 3; ctx.strokeStyle = "#2b2d6e"; ctx.lineJoin = "round";
  if (id === 1) {      // 꿀 부스터: 꿀단지와 번개
    ctx.fillStyle = "#ffb21e"; rr(ctx, -16, -10, 32, 26, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#c47a2c"; rr(ctx, -12, -17, 24, 8, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff6b0"; ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(-6, 5); ctx.lineTo(0, 5); ctx.lineTo(-3, 13); ctx.lineTo(7, 1); ctx.lineTo(1, 1); ctx.closePath(); ctx.fill();
  } else if (id === 2) {      // 참기름 웅덩이: 노란 방울
    ctx.fillStyle = "#f2c14e"; ctx.beginPath(); ctx.moveTo(0, -18); ctx.bezierCurveTo(14, -2, 15, 6, 12, 10); ctx.arc(0, 8, 12, 0.2, Math.PI - 0.2); ctx.bezierCurveTo(-15, 6, -14, -2, 0, -18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.ellipse(-5, 4, 3, 5, -0.4, 0, 7); ctx.fill();
  } else if (id === 3) {      // 찹쌀 폭죽: 빨간 로켓
    ctx.rotate(-0.6);
    ctx.fillStyle = "#ff5d73"; rr(ctx, -7, -12, 14, 26, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff8ee"; ctx.beginPath(); ctx.moveTo(-7, -11); ctx.lineTo(0, -22); ctx.lineTo(7, -11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(-5, 14); ctx.lineTo(0, 24); ctx.lineTo(5, 14); ctx.closePath(); ctx.fill();
  } else if (id === 4) {      // 떡 방패: 말랑한 방울막
    ctx.fillStyle = "rgba(142,203,255,.55)"; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff8ee"; ctx.beginPath(); ctx.ellipse(0, 3, 10, 8, 0, 0, 7); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.ellipse(-8, -9, 4, 2.5, -0.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function hud(ctx, v, T, fol, me, env) {
  const k = v.k[fol], t = v.tick, lap = clamp(Math.floor(k.u / T.N) + 1, 1, LAPS), seatName = (i) => (v.seats[i] ? v.seats[i].name : "");
  // 순위와 순위표 (왼쪽 위)
  ctx.fillStyle = "rgba(43,45,110,.82)"; rr(ctx, 12, 10, 132, 70, 20); ctx.fill();
  label(ctx, String(k.rk), 54, 66, 56, RANK_COL[k.rk - 1] || "#fff", "#2b2d6e");
  label(ctx, "등", 96, 64, 26, "#fff", null);
  label(ctx, `/ ${v.k.length}`, 128, 64, 15, "#cfd3ff", null);
  const byRank = v.k.map((_, i) => i).sort((a, b) => v.k[a].rk - v.k[b].rk);
  byRank.forEach((i, r) => {
    const y = 96 + r * 24, mine = i === fol;
    ctx.fillStyle = mine ? "rgba(255,214,107,.92)" : "rgba(43,45,110,.62)"; rr(ctx, 12, y - 10, 150, 21, 10); ctx.fill();
    ctx.fillStyle = KART_COL[i % 4]; ctx.beginPath(); ctx.arc(26, y, 6, 0, 7); ctx.fill();
    label(ctx, `${r + 1}`, 42, y + 5, 13, mine ? "#2b2d6e" : "#fff", null);
    label(ctx, seatName(i).slice(0, 8) + (v.k[i].fin ? " ✓" : ""), 54, y + 5, 13, mine ? "#2b2d6e" : "#fff", null, "left");
  });
  // 바퀴와 시간 (가운데 위)
  ctx.fillStyle = "rgba(43,45,110,.82)"; rr(ctx, W / 2 - 92, 10, 184, 58, 22); ctx.fill();
  label(ctx, k.fin ? "골인!" : `${lap} / ${LAPS} 바퀴`, W / 2, 38, 22, lap === LAPS && !k.fin ? "#ffd66b" : "#fff", null);
  const rt = Math.max(0, ((k.fin ? k.ft : t) - START) / 60);
  label(ctx, `${Math.floor(rt / 60)}:${(rt % 60).toFixed(1).padStart(4, "0")}`, W / 2, 60, 15, "#cfd3ff", null);
  // 아이템 칸 (오른쪽 위)
  const ix = W - 96, iy = 10;
  ctx.fillStyle = "rgba(43,45,110,.82)"; rr(ctx, ix, iy, 84, 84, 22); ctx.fill();
  ctx.fillStyle = "#fff8ee"; rr(ctx, ix + 8, iy + 8, 68, 68, 16); ctx.fill();
  if (k.ir > 0) drawItem(ctx, ((t >> 2) % 4) + 1, ix + 42, iy + 42, 26);
  else if (k.it) drawItem(ctx, k.it, ix + 42, iy + 42, 30);
  if (me >= 0 && k.it && !k.ir) {
    label(ctx, ITEMS[k.it], ix + 42, iy + 108, 14, "#fff", "rgba(43,45,110,.85)");
    label(ctx, env.touch ? "아이템 버튼!" : "Q 로 쓰기", ix + 42, iy + 126, 13, "#ffd66b", "rgba(43,45,110,.85)");
  }
  // 작은 지도 (오른쪽)
  const mw = 150, mh = 108, mx = W - 12 - mw, my = 148, sc = Math.min((mw - 16) / T.w, (mh - 16) / T.d);
  ctx.fillStyle = "rgba(43,45,110,.6)"; rr(ctx, mx, my, mw, mh, 16); ctx.fill();
  ctx.save(); ctx.translate(mx + mw / 2, my + mh / 2); ctx.scale(sc, sc);
  ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(T.x[0], T.z[0]); for (let i = 3; i < T.N; i += 3) ctx.lineTo(T.x[i], T.z[i]); ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 4 / sc; ctx.stroke();
  ctx.fillStyle = "#2b2d6e"; ctx.fillRect(T.x[0] - 1.5 / sc, T.z[0] - 6 / sc, 3 / sc, 12 / sc);
  ctx.restore();
  for (let i = v.k.length - 1; i >= -1; i--) {
    const j = i < 0 ? fol : i; if (i === fol) continue;
    const q = v.k[j], x = mx + mw / 2 + q.x * sc, y = my + mh / 2 + q.z * sc;
    ctx.fillStyle = KART_COL[j % 4]; ctx.strokeStyle = j === fol ? "#fff" : "#2b2d6e"; ctx.lineWidth = j === fol ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(x, y, j === fol ? 6.5 : 4.5, 0, 7); ctx.fill(); ctx.stroke();
  }

  // 가운데 알림
  if (t < START) {
    const n = Math.ceil((START - t) / 60);
    if (t < 20 || n > 3) label(ctx, "준비!", W / 2, H / 2 - 30, 70, "#fff", "#2b2d6e");
    else { const f = ((START - t) % 60) / 60; ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.scale(0.8 + f * 0.5, 0.8 + f * 0.5); label(ctx, String(n), 0, 30, 110, ["#ff5d73", "#ffc93c", "#7ddc7a"][3 - n] || "#fff", "#2b2d6e"); ctx.restore(); }
    if (me >= 0) label(ctx, env.touch ? "출발 직전에 드리프트 버튼을 누르고 있으면 출발 부스트!" : "출발 직전에 스페이스를 누르고 있으면 출발 부스트!", W / 2, H / 2 + 50, 18, "#fff", "rgba(43,45,110,.85)");
  } else if (t < START + 50) label(ctx, "출발!", W / 2, H / 2 - 20, 96, "#ffd66b", "#2b2d6e");
  if (!v.over) {
    if (k.fin) label(ctx, `골인! ${k.fin}등`, W / 2, H / 2 - 30, 72, RANK_COL[k.fin - 1] || "#fff", "#2b2d6e");
    else if (me >= 0 && k.ww > 45) label(ctx, "거꾸로 가고 있어요! 뒤로 돌아요 ↺", W / 2, H / 2 - 40, 34, "#fff", "#e8505b");
    else if (k.lt > 0 && t - k.lt < 110) label(ctx, lap === LAPS ? "마지막 바퀴!" : `${lap}바퀴째!`, W / 2, 130, lap === LAPS ? 46 : 36, lap === LAPS ? "#ffd66b" : "#fff", "#2b2d6e");
    if (k.sp > 0) label(ctx, "빙글빙글~", W / 2, H / 2 + 10, 30, "#fff", "#2b2d6e");
  }
  // 드리프트 게이지
  if (k.dr && !v.over) {
    const f = Math.min(1, k.dc / DC2), bw = 220, bx = W / 2 - bw / 2, by = H - 92;
    ctx.fillStyle = "rgba(43,45,110,.75)"; rr(ctx, bx - 4, by - 4, bw + 8, 22, 11); ctx.fill();
    ctx.fillStyle = k.dc >= DC2 ? "#ff9a3c" : k.dc >= DC1 ? "#5cc8ff" : "#d8dcf5"; rr(ctx, bx, by, Math.max(14, bw * f), 14, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(bx + bw * (DC1 / DC2) - 1, by - 2, 2, 18);
    label(ctx, k.dc >= DC2 ? "떼면 왕 부스트!" : k.dc >= DC1 ? "떼면 부스트!" : "드리프트 중…", W / 2, by - 10, 16, "#fff", "rgba(43,45,110,.85)");
  }
  // 처음 몇 초는 조작 안내
  if (me >= 0 && !v.over && t >= START && t < START + 480) {
    label(ctx, env.touch ? "◀ ▶ 핸들 · 드리프트 누른 채 꺾었다 떼면 부스트 · ? 상자를 지나면 아이템" : "← → 핸들 · 스페이스 누른 채 꺾었다 떼면 부스트 · Q 아이템 · ↓ 브레이크", W / 2, H - 14, 16, "#fff", "rgba(43,45,110,.85)");
  }
  // 결과
  if (v.over) {
    const ord = v.over.r || byRank, pw = 380, px = W / 2 - pw / 2, py = 118;
    ctx.fillStyle = "rgba(255,253,246,.95)"; rr(ctx, px, py, pw, 64 + ord.length * 50, 24); ctx.fill();
    const myPlace = me >= 0 ? ord.indexOf(me) + 1 : 0;
    label(ctx, me < 0 ? "경주 끝!" : myPlace === 1 ? "1등이에요!" : `${myPlace}등이에요`, W / 2, py + 44, 34, myPlace === 1 ? "#ff5d73" : "#2b2d6e", null);
    ord.forEach((i, r) => {
      const y = py + 92 + r * 50, q = v.k[i];
      if (i === me) { ctx.fillStyle = "rgba(255,214,107,.6)"; rr(ctx, px + 14, y - 22, pw - 28, 44, 14); ctx.fill(); }
      label(ctx, `${r + 1}`, px + 40, y + 10, 28, RANK_COL[r] === "#e9eefc" ? "#8d94b8" : RANK_COL[r], "#2b2d6e");
      ctx.fillStyle = KART_COL[i % 4]; rr(ctx, px + 66, y - 14, 34, 28, 9); ctx.fill();
      drawMochi(ctx, px + 83, y - 2, 13, parseLook(v.seats[i] ? v.seats[i].look : "", i));
      label(ctx, seatName(i), px + 112, y + 7, 20, "#2b2d6e", null, "left");
      const tm = q.fin ? ((q.ft - START) / 60).toFixed(1) + "초" : "완주 못 함";
      label(ctx, tm, px + pw - 24, y + 7, 16, "#6b6480", null, "right");
    });
  }
}

function fx(v, m, snd, me) {
  const k = me >= 0 ? v.k[me] : null;
  if (m.e == null) Object.assign(m, { e: v.e.slice(), cd: -1, lap: k ? k.lm : 0, ir: 0, bo: 0, fin: k ? k.fin : 0, ov: !!v.over, dr: 0 });
  const n = v.tick < START ? Math.ceil((START - v.tick) / 60) : 0;
  if (n !== m.cd) { if (n >= 1 && n <= 3) snd(523, 0.16, "square", 0.07); else if (n === 0 && m.cd > 0) snd(1047, 0.4, "square", 0.08); m.cd = n; }
  if (v.e[0] !== m.e[0]) snd.thud(0.5);
  if (v.e[1] !== m.e[1]) snd.pop();
  if (v.e[2] !== m.e[2]) { snd.boom(0.5); snd(700, 0.4, "triangle", 0.06, -500); }
  if (v.e[3] !== m.e[3]) snd.noise(0.25, 0.12, "highpass", 2500, 1);
  m.e = v.e.slice();
  if (k) {
    if (k.ir > m.ir) snd.coin();
    m.ir = k.ir;
    if (k.bo > m.bo + 5) snd.whoosh(1.2);
    m.bo = k.bo;
    if (k.dr && !m.dr) snd(260, 0.08, "sine", 0.06, 120);
    m.dr = k.dr;
    if (k.lm > m.lap) { m.lap = k.lm; if (k.lm > 0 && k.lm < LAPS) jingle(snd, k.lm === LAPS - 1 ? [659, 784, 988] : [587, 784], 90); }
    if (k.fin && !m.fin) { m.fin = k.fin; jingle(snd, k.fin === 1 ? [523, 659, 784, 1047, 1319] : [523, 659, 784], 110); snd.cheer(); }
  }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over && me >= 0 && !(k && k.fin)) jingle(snd, (v.over.r || []).indexOf(me) === 0 ? [523, 659, 784, 1047] : [392, 330, 262], 140); }
}

function title(v, me) {
  const r = v.over.r || [], place = r.indexOf(me) + 1;
  if (me < 0) return `${v.seats[v.over.w].name} 1등! 한 판 더?`;
  if (place === 1) return "이겼어요! 1등으로 골인 — 한 판 더?";
  if (place === 2) return "잘했어요! 2등이에요 — 한 판 더?";
  return `아쉬워요. ${place}등이에요 — 한 판 더?`;
}

const G = {
  W, H, sendEvery: 3, action: "드리프트", action2: "아이템", overDelay: 300, multiDir: true,
  bots: { solo: 3, local: 2 },
  cap: () => 4,
  fill: (mode, n) => Math.max(0, 4 - n),
  hurry: (v) => !v.over && v.k.some((k) => !k.fin && k.lm >= LAPS - 1),
  init, step, bot, draw, fx, title, pack, unpack, adopt, dispose: () => stage.dispose(),
  trackOf, START, LAPS, BOT, EASE,
};

const COURSES = [[0, "무작위"], [1, "노을 한 바퀴"], [2, "구불 골목"], [3, "달밤 큰 고리"]];
export const meta = {
  local: false,
  soloText: "나와 봇 셋, 네 대가 세 바퀴를 달려요. 코스와 난이도를 골라 주세요.",
  modeLabel: "코스",
  modes: COURSES,
  soloModes: COURSES,
  role: () => "",
  hint: (n) => "네 대가 세 바퀴 경주를 해요." + (n < 4 ? " 빈자리는 봇이 채워요." : ""),
  howto: [
    ["목표", "옥상 트랙을 세 바퀴 먼저 도는 카트가 1등! 네 대가 함께 달려요"],
    ["조작", "앞으로는 저절로 가요. ← → (또는 A·D) 핸들, ↓ 브레이크·후진"],
    ["드리프트", "스페이스를 누른 채 굽은 길에서 꺾으면 폴짝 뛰어 미끄러져요. 바닥 게이지가 파랗게 차면 떼서 부스트, 주황까지 버티면 왕 부스트!"],
    ["아이템", "보라색 ? 상자를 지나가면 하나 받아요. Q(또는 E)로 쓰기 — 꿀 부스터(빨라짐), 참기름 웅덩이(뒤에 떨굼), 찹쌀 폭죽(앞 차를 쫓아감), 떡 방패(한 번 막아 줌)"],
    ["요령", "길 밖 초록 매트는 느려져요. 뒤처지면 조금 빨라지고 더 좋은 아이템이 나오니 끝까지 포기 금지! 출발 직전에 스페이스를 누르고 있으면 출발 부스트"],
    ["휴대폰", "가로로 들고 왼손 ◀ ▶ 핸들, 오른손 드리프트·아이템 버튼. 가속은 저절로 돼요"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
