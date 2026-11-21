// 노을 옥상 라켓 — 해질녘 옥상 코트에서 하는 1대1 라켓 경기 (3D).
// 규칙·계산은 이 파일, 3D 무대는 rally3d.js 가 맡는다. 방장 브라우저가 계산하고 상대는 결과를 받아 그린다.

import { startHostGame, L, R, U, D, A, B } from "./hostgame.js?v=2";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle } from "./kit.js?v=3";

export const CW = 3, CL = 6.6, NET = 0.95;                       // 코트 반폭, 반길이, 네트 높이 (x 가로, y 높이, z 길이)
const W = 960, H = 540, DT = 1 / 60, GR = 11, BR = 0.13, SPEED = 4.1, REACH = 1.35, REACH_Y = 2.4, START = 70;
const sd = (i) => (i === 0 ? 1 : -1);                             // 0번은 z>0 쪽, 1번은 z<0 쪽
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inCourt = (x, z) => Math.abs(x) <= CW + 0.06 && Math.abs(z) <= CL + 0.06;

function serveSetup(s) {
  s.sv = (s.r0 + Math.floor((s.sc[0] + s.sc[1]) / 2)) % 2;       // 두 점마다 서브 교대
  for (let i = 0; i < 2; i++) Object.assign(s.p[i], { x: 0, z: sd(i) * (i === s.sv ? CL - 0.2 : CL * 0.78), sw: 0, sk: 0, pa: 1, mv: 0 });
  s.ph = 0; s.tm = 0; s.lh = -1; s.bn = 0; s.nc = 0;
  hold(s);
}
function hold(s) { const p = s.p[s.sv], side = sd(s.sv); s.b = { x: p.x + 0.8 * side, y: 1.35 + Math.sin(s.tick * 0.12) * 0.08, z: p.z - side * 0.45, vx: 0, vy: 0, vz: 0 }; }

function init(seats, opt) {
  const win = opt && opt.mode === 7 ? 7 : opt && opt.mode === 11 ? 11 : 5;
  const s = {
    tick: 0, seats: seats.slice(0, 2), win, sc: [0, 0], r0: Math.random() < 0.5 ? 0 : 1, sv: 0, ph: 0, tm: 0,
    p: [{}, {}], b: null, lh: -1, bn: 0, nc: 0, note: "", nt: 999, nw: -1, over: null,
    hc: 0, hk: 0, bc: 0, kc: 0, pc: 0, pw: -1, qc: 0, wc: 0, rl: 0,
  };
  serveSetup(s);
  return s;
}

function say(s, text, who) { s.note = text; s.nt = 0; s.nw = who; }
function point(s, w, text) {
  s.sc[w]++; s.ph = 2; s.tm = 115; s.pw = w; s.pc++;
  say(s, text, w);
}

// 공 치기. q: 2 딱 좋아 / 1 보통 / 0 겨우
function hit(s, i, q, m, serve) {
  const p = s.p[i], b = s.b, side = sd(i), lob = p.sk === 1;
  const ax = ((m & R ? 1 : 0) - (m & L ? 1 : 0)) * side, deep = m & U, short = m & D;
  let tx = ax ? ax * CW * 0.8 : clamp(b.x * 0.35, -CW * 0.5, CW * 0.5);
  let tz = -side * CL * (short ? 0.27 : deep ? 0.88 : lob ? 0.8 : 0.7);
  const sc = [1.6, 0.85, 0.22][q] * (serve ? 0.6 : 1), ang = Math.random() * 6.283, rad = Math.sqrt(Math.random()) * sc;
  tx += Math.cos(ang) * rad; tz += Math.sin(ang) * rad;
  const dist = Math.hypot(tx - b.x, tz - b.z);
  let T = lob ? Math.max(short ? 1.3 : 1.7, dist / 6.5) : dist / ((short ? 8 : serve ? 12 : 16) * [0.85, 1, 1.25][q]);
  let vx, vy, vz;
  for (let k = 0; k < 40; k++) {          // 네트를 넘을 만큼 띄운다
    vx = (tx - b.x) / T; vz = (tz - b.z) / T; vy = (BR - b.y + 0.5 * GR * T * T) / T;
    const tn = -b.z / vz, yn = b.y + vy * tn - 0.5 * GR * tn * tn;
    if (yn >= NET + (q ? 0.3 : 0.16)) break;
    T *= 1.07;
  }
  if (!q && !serve) vy *= 1 - Math.random() * 0.07;        // 겨우 친 공은 가끔 네트에 걸린다
  b.vx = vx; b.vy = vy; b.vz = vz;
  s.lh = i; s.bn = 0; s.nc = 0; s.hc++; s.hk = lob ? 1 : short ? 2 : 0; s.rl++;
  if (q === 2 && !serve) { s.qc++; say(s, "딱 좋아!", i); }
}

function ballStep(s, live) {
  const b = s.b, pz = b.z;
  b.vy -= GR * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
  if (pz * b.z <= 0 && pz !== b.z && b.y < NET && Math.abs(b.x) < CW + 0.45) {      // 네트에 걸림
    b.z = (pz >= 0 ? 1 : -1) * 0.07; b.vz *= -0.12; b.vx *= 0.35; b.vy = Math.min(b.vy, 0); s.nc++; s.kc++;
  }
  if (b.y <= BR && b.vy < 0) {
    b.y = BR; b.vy = Math.min(5.5, -b.vy * 0.72); b.vx *= 0.82; b.vz *= 0.82; if (Math.abs(b.vy) > 0.8) s.bc++; else b.vy = 0;
    if (live && s.lh >= 0) {
      const h = s.lh, o = 1 - h;
      if (s.bn > 0) point(s, h, "득점!");                                             // 두 번 튀었다
      else if (!inCourt(b.x, b.z)) point(s, o, "아웃!");
      else if (b.z * sd(h) > 0) point(s, o, s.nc ? "네트!" : "짧았어!");                // 내 코트에 떨어짐
      else s.bn = 1;
    }
  }
  if (live && s.ph === 1 && (Math.abs(b.x) > CW + 7 || Math.abs(b.z) > CL + 9)) point(s, s.bn ? s.lh : 1 - s.lh, s.bn ? "득점!" : "아웃!");
}

// 내 라켓의 가장 치기 좋은 자리와 공 사이 거리
function sweet(p, i, b) { return Math.hypot(b.x - p.x, b.z - (p.z - sd(i) * 0.45), (b.y - 1) * 0.6); }

function step(s, masks) {
  s.tick++; s.nt++;
  if (s.over) { s.over.t++; ballStep(s, false); return; }
  if (s.tick < START) { hold(s); return; }
  for (let i = 0; i < 2; i++) {
    const p = s.p[i], m = masks[i] | 0, side = sd(i), serving = s.ph === 0 && s.sv === i;
    const ax = ((m & R ? 1 : 0) - (m & L ? 1 : 0)) * side, az = serving ? 0 : ((m & D ? 1 : 0) - (m & U ? 1 : 0)) * side;
    const n = Math.hypot(ax, az) || 1, sp = SPEED * (p.sw ? 0.55 : 1) * DT;
    p.x = clamp(p.x + (ax / n) * sp, -(serving ? CW : CW + 2.2), serving ? CW : CW + 2.2);
    p.z = side * clamp(side * (p.z + (az / n) * sp), 0.6, CL + 2.2);
    p.mv = ax || az ? 1 : 0;
    const press = m & (A | B) ? 1 : 0;
    if (p.sw && ++p.sw > 20) p.sw = 0;
    if (press && !p.pa && !p.sw && s.ph < 2) { p.sw = 1; p.sk = m & B && !(m & A) ? 1 : 0; s.wc++; }
    p.pa = press;
  }
  if (s.ph === 2) {
    ballStep(s, false);
    if (--s.tm <= 0) { if (s.sc[s.pw] >= s.win) s.over = { w: s.pw, t: 0 }; else { s.rl = 0; serveSetup(s); } }
    return;
  }
  if (s.ph === 0) {
    hold(s); s.tm++;
    const p = s.p[s.sv];
    if (p.sw === 1 || s.tm > 420) { if (!p.sw) p.sw = 1; s.ph = 1; s.rl = 0; hit(s, s.sv, 1, masks[s.sv] | 0, true); }
    return;
  }
  ballStep(s, true);
  if (s.ph !== 1) return;
  const b = s.b;
  for (let i = 0; i < 2; i++) {
    const p = s.p[i], side = sd(i);
    if (!(p.sw >= 1 && p.sw <= 10) || s.lh === i || b.z * side < -0.25 || b.y > REACH_Y) continue;
    if (Math.hypot(b.x - p.x, b.z - p.z) > REACH) continue;
    const d = sweet(p, i, b);
    hit(s, i, d < 0.62 ? 2 : d < 1.05 ? 1 : 0, masks[i] | 0, false);
  }
}

// ── 봇 ──
const LV = { easy: { lag: 14, err: 1.0, thr: 1.15, wit: 0.25, miss: 0.14 }, normal: { lag: 8, err: 0.5, thr: 0.85, wit: 0.6, miss: 0.06 }, hard: { lag: 3, err: 0.16, thr: 0.58, wit: 0.92, miss: 0.015 } };
function predict(s, i) {
  const side = sd(i); let { x, y, z, vx, vy, vz } = s.b, land = s.bn > 0;
  for (let k = 0; k < 220; k++) {
    const pz = z; vy -= GR * DT; x += vx * DT; y += vy * DT; z += vz * DT;
    if (pz * z <= 0 && pz !== z && y < NET) return { out: true };
    if (y <= BR && vy < 0) {
      if (land) return { x, z };
      if (!inCourt(x, z) || z * side < 0) return { out: true };
      land = true; y = BR; vy = Math.min(5.5, -vy * 0.72); vx *= 0.82; vz *= 0.82;
    }
    if (land && (y >= 0.8 || vy <= 0)) return { x, z };
  }
  return { x, z };
}
function bot(s, i, mem, level) {
  const lv = LV[level] || LV.normal, p = s.p[i], o = s.p[1 - i], b = s.b, side = sd(i);
  if (s.over || s.tick < START || s.ph === 2) { mem.st = 0; return 0; }
  const aim = () => {      // 상대가 없는 쪽으로
    let m = 0;
    if (Math.random() < lv.wit) m |= (o.x > 0.3 ? -1 : o.x < -0.3 ? 1 : Math.random() < 0.5 ? -1 : 1) * side > 0 ? R : L;
    else if (Math.random() < 0.5) m |= Math.random() < 0.5 ? L : R;
    return m;
  };
  if (s.ph === 0) {
    if (s.sv !== i) return go(p, i, 0, side * CL * 0.78);
    mem.st = (mem.st | 0) + 1;
    return mem.st > 50 ? A | aim() : 0;
  }
  mem.st = 0;
  if (s.lh === i) return go(p, i, 0, side * CL * 0.72);            // 내가 쳤으면 가운데로 돌아간다
  if (mem.hc !== s.hc) { mem.hc = s.hc; mem.pt = -99; const a = Math.random() * 6.283; mem.ex = Math.cos(a) * lv.err; mem.ez = Math.sin(a) * lv.err; mem.ld = 99; mem.whiff = Math.random() < lv.miss; }
  if (s.tick - mem.pt >= lv.lag) { mem.pt = s.tick; mem.pr = predict(s, i); }
  const pr = mem.pr;
  if (pr.out && level !== "easy") return go(p, i, 0, side * CL * 0.72);                 // 나갈 공은 건드리지 않는다
  const tx = pr.out ? b.x : pr.x + mem.ex, tz = pr.out ? side * CL * 0.7 : pr.z + side * 0.45 + mem.ez;
  let m = go(p, i, tx, side * clamp(side * tz, 0.8, CL + 2.1));
  if (b.z * side > -0.2 && b.y < REACH_Y && Math.hypot(b.x - p.x, b.z - p.z) < REACH) {
    const d = sweet(p, i, b), leaving = d > mem.ld + 0.01;
    if (!p.sw && !mem.whiff && (d < lv.thr || (leaving && (s.bn > 0 || b.y < 1.6)))) {
      m = aim();
      const oz = -side * o.z, far = oz > CL * 0.8, close = oz < CL * 0.42;
      if (close && Math.random() < lv.wit * 0.7) m |= B | U;                           // 앞에 나와 있으면 머리 위로
      else { m |= A; if (far && Math.random() < lv.wit * 0.3) m |= D; else if (Math.random() < 0.4) m |= U; }
    }
    mem.ld = d;
  }
  return m;
}
function go(p, i, x, z) {
  const side = sd(i); let m = 0;
  if (Math.abs(x - p.x) > 0.14) m |= (x - p.x) * side > 0 ? R : L;
  if (Math.abs(z - p.z) > 0.14) m |= (z - p.z) * side < 0 ? U : D;
  return m;
}

// ── 그리기: 3D 무대는 따로 불러오고, 점수판과 글자는 그 위에 2D 로 얹는다 ──
let stage = null, stageOn = false, stageErr = false;
function loadStage() {
  if (stage || stageOn || stageErr || typeof document === "undefined") return;
  stageOn = true;
  import("./rally3d.js?v=2").then((m) => { stage = m; }).catch(() => { stageErr = true; });
}
const mix = (a, b, t) => a + (b - a) * t;
function flat(ctx, v) {      // 3D 를 못 쓰는 기기: 위에서 본 간단한 코트
  ctx.fillStyle = "#f2b27c"; ctx.fillRect(0, 0, W, H);
  const k = 30, ox = W / 2, oy = H / 2 + 10, X = (x) => ox + x * k * 1.6, Y = (z) => oy + z * k;
  ctx.fillStyle = "#4f9d8f"; ctx.fillRect(X(-CW), Y(-CL), CW * 2 * k * 1.6, CL * 2 * k);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(X(-CW), Y(-CL), CW * 2 * k * 1.6, CL * 2 * k);
  ctx.fillStyle = "#2b2d6e"; ctx.fillRect(X(-CW) - 10, oy - 3, CW * 2 * k * 1.6 + 20, 6);
  v.p.forEach((p, i) => drawMochi(ctx, X(p.x), Y(p.z) + 10, 20, parseLook(v.seats[i].look, i)));
  const b = v.b, r = 7 + b.y * 3;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.z), 8, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#e8ff4a"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(b.x), Y(b.z) - b.y * 16, r, 0, 7); ctx.fill(); ctx.stroke();
}

function draw(ctx, v, env) {
  loadStage();
  const me = env.me >= 0 && env.me < 2 ? env.me : 0;
  // 받는 쪽은 두 장면 사이를 부드럽게 잇는다
  let view = v;
  if (env.prev && env.prev.p && env.alpha < 1) {
    const a = env.alpha, q = env.prev;
    view = { ...v, p: v.p.map((p, i) => ({ ...p, x: mix(q.p[i].x, p.x, a), z: mix(q.p[i].z, p.z, a) })), b: q.hc === v.hc && q.ph === v.ph ? { ...v.b, x: mix(q.b.x, v.b.x, a), y: mix(q.b.y, v.b.y, a), z: mix(q.b.z, v.b.z, a) } : v.b };
  }
  let ok = false;
  if (stage) {
    try { const cv = stage.render(view, { me, t: env.t, touch: env.touch }); if (cv) { ctx.drawImage(cv, 0, 0, W, H); ok = true; } } catch { stageErr = true; stage = null; }
  }
  if (!ok) { if (stageErr) flat(ctx, view); else { ctx.fillStyle = "#f2b27c"; ctx.fillRect(0, 0, W, H); label(ctx, "옥상으로 올라가는 중…", W / 2, H / 2, 30, "#fff", "#2b2d6e"); return; } }

  // 점수판
  ctx.fillStyle = "rgba(43,45,110,.82)"; rr(ctx, W / 2 - 190, 12, 380, 58, 29); ctx.fill();
  for (let i = 0; i < 2; i++) {
    const left = i === me, x = left ? W / 2 - 160 : W / 2 + 160, seat = v.seats[i];
    ctx.fillStyle = "#fff6e0"; ctx.beginPath(); ctx.arc(x, 41, 23, 0, 7); ctx.fill();
    drawMochi(ctx, x, 45, 17, parseLook(seat.look, i));
    label(ctx, String(v.sc[i]), left ? W / 2 - 104 : W / 2 + 104, 55, 38, "#ffd66b", null);
    label(ctx, seat.name, left ? W / 2 - 78 : W / 2 + 78, 34, 14, "#fff", null, left ? "left" : "right");
    if (v.sv === i && !v.over) { ctx.fillStyle = "#e8ff4a"; ctx.beginPath(); ctx.arc(left ? W / 2 - 72 : W / 2 + 72, 52, 5, 0, 7); ctx.fill(); }
  }
  label(ctx, `${v.win}점 내기`, W / 2, 47, 14, "#cfd3ff", null);

  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2 - 20, 76, "#fff", "#2b2d6e");
  else if (v.ph === 0 && !v.over) {
    const mine = v.sv === env.me;
    label(ctx, mine ? (env.touch ? "강타 버튼으로 서브!" : "스페이스로 서브!") : `${v.seats[v.sv].name} 서브`, W / 2, 112, 24, "#fff", "#2b2d6e");
  }
  if (v.note && v.nt < 70 && !v.over) {
    const big = v.note !== "딱 좋아!", k = Math.min(1, v.nt / 8), mineNote = v.nw === me;
    ctx.save(); ctx.translate(W / 2, big ? H / 2 - 40 : 150); ctx.scale(0.6 + k * 0.4, 0.6 + k * 0.4);
    label(ctx, v.note, 0, 0, big ? 74 : 44, big ? (mineNote ? "#ffd66b" : "#ff8fa3") : "#ffe45c", "#2b2d6e");
    ctx.restore();
  }
  if (v.over) label(ctx, v.over.w === env.me ? "이겼다!" : env.me < 0 ? `${v.seats[v.over.w].name} 승리!` : "졌다…", W / 2, H / 2 - 30, 80, "#ffd66b", "#2b2d6e");
  else if (env.me >= 0 && !env.touch && v.tick < START + 600) label(ctx, "스페이스 강타 · Q 높이 넘기기 · 방향키를 누른 채 치면 그쪽으로 (↓ 짧게, ↑ 깊게)", W / 2, H - 14, 15, "#fff", "rgba(43,45,110,.85)");
}

function fx(v, m, snd, me) {
  if (m.hc == null) Object.assign(m, { hc: v.hc, bc: v.bc, kc: v.kc, pc: v.pc, qc: v.qc, wc: v.wc, ov: !!v.over });
  if (v.hc !== m.hc) { m.hc = v.hc; snd.pop(v.hk === 1 ? 0.8 : 1.2); snd.clack(v.hk === 2 ? 0.5 : 0.9); m.wc = v.wc; }
  else if (v.wc !== m.wc) { m.wc = v.wc; snd.whoosh(0.5); }
  if (v.bc !== m.bc) { m.bc = v.bc; snd.thud(0.5); }
  if (v.kc !== m.kc) { m.kc = v.kc; snd.noise(0.2, 0.08, "bandpass", 900, 1); }
  if (v.qc !== m.qc) { m.qc = v.qc; snd.sparkle(); }
  if (v.pc !== m.pc) { m.pc = v.pc; snd.whistle(); if (v.pw === me || me < 0) snd.cheer(); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, v.over.w === me ? [523, 659, 784, 1047] : [392, 330, 262], 140); }
}

function title(v, me) {
  if (me < 0) return `${v.seats[v.over.w].name} 승리! 한 판 더?`;
  return v.over.w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 2, action: "강타", action2: "높이", overDelay: 200, multiDir: true,
  bots: { solo: 1, local: 0 },
  cap: () => 2,
  fill: (mode, n) => (n < 2 ? 1 : 0),
  hurry: (v) => Math.max(v.sc[0], v.sc[1]) === v.win - 1,
  init, step, bot, draw, fx, title,
};

export const meta = {
  local: false,
  soloText: "봇과 1대1. 몇 점 내기인지와 난이도를 골라 주세요.",
  modeLabel: "몇 점 내기",
  modes: [[0, "5점"], [7, "7점"], [11, "11점"]],
  soloModes: [[0, "5점"], [7, "7점"], [11, "11점"]],
  role: () => "",
  hint: (n, mode) => `${mode === 7 ? 7 : mode === 11 ? 11 : 5}점 내기 1대1. ` + (n < 2 ? "혼자 시작하면 봇과 겨뤄요." : n > 2 ? "두 명만 뛰고 나머지는 관전이에요." : ""),
  howto: [
    ["목표", "공을 상대 코트에 넣어 못 받게 하면 1점. 먼저 정한 점수를 내면 승리"],
    ["조작", "이동 방향키(또는 W·A·S·D, 대각선 가능), 스페이스 강타, Q 높이 넘기기"],
    ["방향", "방향키를 누른 채 치면 그쪽으로 가요. ←→ 좌우 구석, ↑ 깊숙이, ↓ 네트 바로 뒤에 살짝"],
    ["타이밍", "공이 내 바로 앞에 왔을 때 치면 '딱 좋아!' — 더 빠르고 정확해요. 너무 멀리서 휘두르면 공이 흩어져 밖으로 나가기 쉬워요"],
    ["규칙", "공은 내 코트에서 한 번까지만 튀어도 돼요(안 튀기고 바로 쳐도 됨). 친 공이 네트에 걸리거나 선 밖에 떨어지면 상대 점수"],
    ["요령", "상대가 뒤에 있으면 ↓로 짧게, 앞에 나와 있으면 Q로 머리 위로 넘겨 보세요"],
  ],
};
export const start = (opts) => {
  const g = startHostGame(G, opts), stop = g.stop;
  g.stop = () => { stop(); if (stage) stage.dispose(); };
  return g;
};
export const _test = G;
