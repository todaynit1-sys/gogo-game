// 쾅쾅 포격전 — 번갈아 가며 각도와 힘을 맞춰 포탄을 쏜다. 땅이 파이고, 바람이 분다.
// 마지막까지 버틴 사람이 승리.

import { startHostGame, L, R, U, D, A } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle, SEAT_DARK } from "./kit.js?v=1";

const W = 960, H = 540, COLW = 4, NC = 240, GRAV = 0.12, WINDK = 0.012, START = 100, TURN = 20 * 60, BLAST = 44, FUEL = 70;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ty = (s, x) => s.h[clamp(Math.round(x / COLW), 0, NC - 1)];
const speedOf = (pw) => 2.5 + pw * 0.105;
const newWind = () => Math.round((Math.random() * 2 - 1) * 10) / 10;

function init(seats) {
  const f1 = 0.8 + Math.random() * 0.7, f2 = 2 + Math.random() * 1.5, f3 = 5 + Math.random() * 3;
  const p1 = Math.random() * 7, p2 = Math.random() * 7, p3 = Math.random() * 7, h = [];
  for (let i = 0; i < NC; i++) {
    const x = (i / NC) * 6.283;
    h.push(Math.round(clamp(345 + Math.sin(x * f1 + p1) * 55 + Math.sin(x * f2 + p2) * 28 + Math.sin(x * f3 + p3) * 12, 215, 468)));
  }
  const n = seats.length;
  const p = seats.map((_, i) => {
    const x = Math.round((W * (i + 0.5)) / n + Math.random() * 40 - 20), c = Math.round(x / COLW), base = h[c];
    for (let k = -5; k <= 5; k++) if (h[c + k] != null) h[c + k] = base;      // 대포 밑은 평평하게
    return { x, hp: 100, f: x < W / 2 ? 1 : -1, el: 50, pw: 0, fuel: FUEL, al: 1, pa: 0 };
  });
  return { tick: 0, seats, h, hv: 1, p, turn: 0, ph: 0, tl: TURN, tm: 0, wind: newWind(), shot: null, ex: null, over: null, fc: 0, bc: 0, dc: 0, tn: 0 };
}

function muzzle(s, p) {
  const r = (p.el * Math.PI) / 180;
  return [p.x + Math.cos(r) * 26 * p.f, ty(s, p.x) - 18 - Math.sin(r) * 26, r];
}

function fire(s) {
  const p = s.p[s.turn], [x, y, r] = muzzle(s, p), v = speedOf(Math.max(3, p.pw));
  s.shot = { x, y, vx: Math.cos(r) * v * p.f, vy: -Math.sin(r) * v, age: 0 };
  p.pw = 0; s.ph = 1; s.fc++;
}

function explode(s, x, y) {
  s.ex = { x: Math.round(x), y: Math.round(y), t: 0 }; s.bc++; s.shot = null; s.ph = 2; s.tm = 40;
  for (let i = 0; i < NC; i++) {
    const dx = i * COLW - x;
    if (Math.abs(dx) >= BLAST) continue;
    const bottom = y + Math.sqrt(BLAST * BLAST - dx * dx);
    if (bottom > s.h[i]) s.h[i] = Math.round(Math.min(H - 14, bottom));
  }
  s.hv++;
  for (const p of s.p) {
    if (!p.al) continue;
    const d = Math.hypot(p.x - x, ty(s, p.x) - 12 - y);
    if (d < BLAST + 22) { p.hp -= Math.round(52 * (1 - d / (BLAST + 22))) + (d < 22 ? 12 : 0); if (p.hp <= 0) { p.hp = 0; p.al = 0; s.dc++; } }
  }
}

function nextTurn(s) {
  const alive = s.p.filter((p) => p.al);
  if (s.p.length > 1 && alive.length <= 1) { s.over = { w: alive.length ? s.p.indexOf(alive[0]) : -1, t: 0 }; return; }
  do { s.turn = (s.turn + 1) % s.p.length; } while (!s.p[s.turn].al);
  const p = s.p[s.turn];
  p.fuel = FUEL; p.pw = 0; p.pa = 0;
  s.ph = 0; s.tl = TURN; s.wind = newWind(); s.tn++;
}

function step(s, masks) {
  s.tick++;
  if (s.over) { s.over.t++; if (s.ex) s.ex.t++; return; }
  if (s.tick < START) return;
  if (s.ex) s.ex.t++;
  if (s.ph === 0) {
    const p = s.p[s.turn], m = masks[s.turn] | 0;
    if (m & (L | R)) {
      const dir = m & L ? -1 : 1; p.f = dir;
      if (p.fuel > 0 && !p.pw) {
        const nx = clamp(p.x + dir * 1.1, 16, W - 16);
        if (ty(s, nx) - ty(s, p.x) > -9) { p.x = nx; p.fuel -= 1.1; }      // 너무 가파른 오르막은 못 오른다
      }
    }
    if (m & U) p.el = Math.min(88, p.el + 0.7);
    if (m & D) p.el = Math.max(5, p.el - 0.7);
    if (m & A) p.pw = Math.min(100, p.pw + 1.05);
    if ((p.pa && !(m & A)) || p.pw >= 100) fire(s);
    p.pa = m & A ? 1 : 0;
    if (s.ph === 0 && --s.tl <= 0) { p.pw = 0; nextTurn(s); }
  } else if (s.ph === 1) {
    const b = s.shot;
    b.vx += s.wind * WINDK; b.vy += GRAV; b.x += b.vx; b.y += b.vy; b.age++;
    if (b.x < -40 || b.x > W + 40 || b.y > H + 40) { s.shot = null; s.ph = 3; s.tm = 30; }
    else if (b.y >= ty(s, b.x)) explode(s, b.x, b.y);
    else {
      for (const p of s.p) if (p.al && b.age > 8 && Math.hypot(p.x - b.x, ty(s, p.x) - 14 - b.y) < 22) { explode(s, b.x, b.y); break; }
    }
  } else if (--s.tm <= 0) nextTurn(s);
}

// ── 주고받기: 땅 모양은 바뀌었을 때와 가끔만 보낸다 ──
function pack(s) {
  const full = s.hv !== s._sent || s.tick % 120 === 0;
  if (full) s._sent = s.hv;
  const o = { ...s, h: full ? s.h : undefined };
  delete o._sent;
  return o;
}
let lastH = null;
function unpack(o) {
  if (o.h) lastH = o.h; else o.h = lastH || new Array(NC).fill(380);
  return o;
}

// ── 봇 ──
const ERR = { easy: 15, normal: 6.5, hard: 1.6 };

function simShot(s, x, y, vx, vy) {
  for (let k = 0; k < 700; k++) {
    vx += s.wind * WINDK; vy += GRAV; x += vx; y += vy;
    if (x < -40 || x > W + 40 || y > H + 40) return null;
    if (y >= ty(s, x)) return x;
  }
  return null;
}

function solve(s, i, level) {
  const me = s.p[i], foes = s.p.filter((p, j) => j !== i && p.al);
  if (!foes.length) return { f: me.f, el: 45, pw: 50 };
  const t = level === "hard" ? foes.reduce((a, b) => (b.hp < a.hp ? b : a)) : foes[(Math.random() * foes.length) | 0];
  const f = t.x > me.x ? 1 : -1, y0 = ty(s, me.x) - 18;
  let best = null;
  for (let el = 20; el <= 82; el += 3) {
    const r = (el * Math.PI) / 180, mx = me.x + Math.cos(r) * 26 * f, my = y0 - Math.sin(r) * 26;
    for (let pw = 15; pw <= 100; pw += 3) {
      const v = speedOf(pw), hit = simShot(s, mx, my, Math.cos(r) * v * f, -Math.sin(r) * v);
      if (hit == null || Math.abs(hit - me.x) < 70) continue;
      const d = Math.abs(hit - t.x);
      if (!best || d < best.d) best = { d, el, pw };
    }
  }
  if (!best) best = { el: 50, pw: 60 };
  const e = ERR[level] || ERR.normal;
  return { f, el: clamp(best.el + (Math.random() - 0.5) * e, 8, 86), pw: clamp(best.pw + (Math.random() - 0.5) * e * 1.6, 8, 99) };
}

function bot(s, i, mem, level) {
  if (s.over || s.tick < START || s.ph !== 0 || s.turn !== i) { mem.tn = -1; return 0; }
  const p = s.p[i];
  if (mem.tn !== s.tn) { mem.tn = s.tn; mem.plan = solve(s, i, level); mem.wait = 40 + Math.random() * 50; mem.charge = false; }
  if (mem.wait-- > 0) return 0;
  const pl = mem.plan;
  if (p.f !== pl.f) return pl.f > 0 ? R : L;
  if (!mem.charge) { if (Math.abs(p.el - pl.el) > 0.8) return p.el < pl.el ? U : D; mem.charge = true; }
  return p.pw < pl.pw ? A : 0;
}

// ── 그리기 ──
function draw(ctx, v, env) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#7cc9ff"); g.addColorStop(1, "#fbe8c8");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.75)";
  for (let i = 0; i < 4; i++) { const x = ((i * 290 + env.t * (8 + v.wind * 14)) % (W + 240) + W + 240) % (W + 240) - 120, y = 70 + (i % 2) * 50; ctx.beginPath(); ctx.ellipse(x, y, 50, 17, 0, 0, 7); ctx.ellipse(x + 30, y - 12, 30, 16, 0, 0, 7); ctx.fill(); }
  // 땅
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let i = 0; i < NC; i++) ctx.lineTo(i * COLW, v.h[i]);
  ctx.lineTo(W, v.h[NC - 1]); ctx.lineTo(W, H); ctx.closePath();
  const gg = ctx.createLinearGradient(0, 200, 0, H); gg.addColorStop(0, "#b98a55"); gg.addColorStop(1, "#7a5633");
  ctx.fillStyle = gg; ctx.fill();
  ctx.beginPath(); for (let i = 0; i < NC; i++) ctx.lineTo(i * COLW, v.h[i]); ctx.lineTo(W, v.h[NC - 1]);
  ctx.strokeStyle = "#6fbf5a"; ctx.lineWidth = 9; ctx.lineJoin = "round"; ctx.stroke();
  ctx.strokeStyle = "#4f9a41"; ctx.lineWidth = 2; ctx.stroke();

  const cur = v.p[v.turn], aiming = v.ph === 0 && v.tick >= START && !v.over;
  // 조준 안내선 (지금 쏘는 사람)
  if (aiming && cur.al) {
    const r = (cur.el * Math.PI) / 180, sp = speedOf(cur.pw > 3 ? cur.pw : 55);
    let x = cur.x + Math.cos(r) * 26 * cur.f, y = ty(v, cur.x) - 18 - Math.sin(r) * 26, vx = Math.cos(r) * sp * cur.f, vy = -Math.sin(r) * sp;
    ctx.fillStyle = "rgba(43,45,110,.55)";
    for (let k = 0; k < 30; k++) { vx += v.wind * WINDK; vy += GRAV; x += vx; y += vy; if (k % 3 === 2) { ctx.beginPath(); ctx.arc(x, y, 3.2 - k * 0.06, 0, 7); ctx.fill(); } }
  }
  // 대포
  v.p.forEach((p, i) => {
    if (!p.al) return;
    const x = p.x, y = ty(v, p.x), r = (p.el * Math.PI) / 180;
    ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + Math.cos(r) * 26 * p.f, y - 18 - Math.sin(r) * 26); ctx.stroke();
    ctx.fillStyle = "#2b2d6e"; rr(ctx, x - 20, y - 10, 40, 12, 6); ctx.fill();
    ctx.fillStyle = "#54609e"; ctx.beginPath(); ctx.arc(x - 12, y - 2, 5, 0, 7); ctx.arc(x, y - 2, 5, 0, 7); ctx.arc(x + 12, y - 2, 5, 0, 7); ctx.fill();
    drawMochi(ctx, x, y - 22, 15, parseLook(v.seats[i].look, i), { ang: p.f > 0 ? -0.3 : Math.PI + 0.3 });
    // 체력
    ctx.fillStyle = "rgba(43,45,110,.85)"; rr(ctx, x - 24, y - 60, 48, 9, 4); ctx.fill();
    ctx.fillStyle = p.hp > 50 ? "#7ddc7a" : p.hp > 25 ? "#ffc93c" : "#ff5d73"; rr(ctx, x - 22, y - 58, Math.max(2, 44 * p.hp / 100), 5, 2.5); ctx.fill();
    label(ctx, v.seats[i].name, x, y - 66, 13, i === env.me ? "#d6336c" : "#2a2440", "rgba(255,255,255,.9)");
    if (aiming && i === v.turn) {
      const by = y - 92 + Math.sin(env.t * 6) * 4;
      ctx.fillStyle = SEAT_DARK[i]; ctx.beginPath(); ctx.moveTo(x - 9, by); ctx.lineTo(x + 9, by); ctx.lineTo(x, by + 11); ctx.fill();
      if (p.pw > 0) {       // 힘 게이지
        ctx.fillStyle = "#fff"; rr(ctx, x - 32, y + 8, 64, 11, 5); ctx.fill();
        ctx.fillStyle = "#ff5d73"; rr(ctx, x - 30, y + 10, Math.max(2, 60 * p.pw / 100), 7, 3.5); ctx.fill();
      }
    }
  });
  // 포탄
  if (v.shot) {
    const b = v.shot;
    ctx.fillStyle = "rgba(43,45,110,.25)"; for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(b.x - b.vx * k * 1.5, b.y - b.vy * k * 1.5, 6 - k, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#2a2440"; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
  }
  // 폭발
  if (v.ex && v.ex.t < 34) {
    const k = v.ex.t, r = k < 9 ? (BLAST * k) / 9 : BLAST, al = k < 9 ? 1 : 1 - (k - 9) / 25;
    ctx.globalAlpha = Math.max(0, al);
    ctx.fillStyle = "#ff7a2f"; ctx.beginPath(); ctx.arc(v.ex.x, v.ex.y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(v.ex.x, v.ex.y, r * 0.66, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(v.ex.x, v.ex.y, r * 0.3, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 위쪽 안내
  ctx.fillStyle = "rgba(255,253,246,.92)"; rr(ctx, W / 2 - 150, 10, 300, 58, 16); ctx.fill();
  const wn = Math.round(Math.abs(v.wind) * 10);
  label(ctx, wn === 0 ? "바람 없음" : `바람 ${v.wind > 0 ? "→" : "←"} ${wn}`, W / 2, 34, 18, "#2b2d6e", null);
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2 - 40, 80, "#ff5d73", "#fff");
  else if (!v.over) label(ctx, aiming ? `${v.seats[v.turn].name} 차례 · ${Math.ceil(v.tl / 60)}초` : v.ph === 1 ? "날아가는 중…" : "쾅!", W / 2, 58, 17, v.turn === env.me && aiming ? "#d6336c" : "#6b6480", null);
  if (aiming && v.turn === env.me) label(ctx, "←→ 이동 · ↑↓ 각도 · 스페이스를 꾹 눌렀다 떼면 발사", W / 2, H - 16, 17, "#2a2440", "rgba(255,255,255,.9)");
  if (v.over) {
    const w = v.over.w;
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, H / 2 - 40, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd, me) {
  if (m.fc == null) Object.assign(m, { fc: v.fc, bc: v.bc, dc: v.dc, tn: -1, ov: !!v.over });
  if (v.fc !== m.fc) { m.fc = v.fc; snd(160, 0.2, "square", 0.1, -80); snd(900, 0.5, "sine", 0.04, -500); }
  if (v.bc !== m.bc) { m.bc = v.bc; snd(80, 0.4, "sawtooth", 0.15, -30); }
  if (v.dc !== m.dc) { m.dc = v.dc; snd(400, 0.35, "sawtooth", 0.1, -300); }
  if (v.tn !== m.tn) { m.tn = v.tn; if (v.turn === me && v.tick >= START) jingle(snd, [660, 880], 90); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
}

function title(v, me) {
  const w = v.over.w;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${v.seats[w].name} 승리! 한 판 더?`;
  return w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 3, action: "발사", overDelay: 220,
  bots: { solo: 1, local: 0 },
  fill: (mode, n) => (mode === 1 ? (n < 2 ? 1 : 0) : n < 2 ? 1 : 0),
  init, step, bot, draw, fx, title, pack, unpack,
};

export const meta = {
  local: true,
  soloText: "봇과 1대1 포격전. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 번갈아 쏴요. 마지막까지 버티면 승리.`),
  howto: [
    ["목표", "번갈아 가며 포탄을 쏴서 상대의 체력을 0으로 만들어요. 마지막까지 남으면 승리"],
    ["조작", "←→ 이동(연료만큼), ↑↓ 포신 각도, 스페이스를 꾹 눌러 힘을 모았다가 떼면 발사"],
    ["바람", "차례마다 바람이 바뀌어요. 점선 안내선을 보고 각도를 맞춰 보세요"],
    ["한 키보드 2인", "1P: W·A·S·D + F / 2P: 방향키 + Enter (차례에만 움직여요)"],
    ["휴대폰", "방향 버튼으로 이동·각도, 발사 버튼을 꾹 눌렀다 떼기"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
