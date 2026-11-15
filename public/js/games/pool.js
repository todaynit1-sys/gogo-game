// 미니 당구 — 번갈아 흰 공(내 떡)을 쳐서 색 공을 구멍에 넣는다.
// 넣으면 한 번 더, 흰 공이 빠지면 1점 깎이고 차례가 넘어간다. 공을 다 넣었을 때 점수가 가장 높으면 승리.

import { startHostGame, L, R, U, D, A, P } from "./hostgame.js?v=2";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle, SEAT_DARK } from "./kit.js?v=3";

const W = 960, H = 540, TX0 = 150, TY0 = 104, TW = 660, TH = 330, BR = 11, FR = 0.986, START = 90, TURN = 25 * 60, MAXP = 130, VK = 14 / MAXP;
const PK = [[TX0, TY0, 21], [TX0 + TW / 2, TY0 - 2, 19], [TX0 + TW, TY0, 21], [TX0, TY0 + TH, 21], [TX0 + TW / 2, TY0 + TH + 2, 19], [TX0 + TW, TY0 + TH, 21]];
const COL = ["#fffdf6", "#ffc93c", "#3d6fd6", "#e8453c", "#8a55d6", "#ff8a2a", "#2f9e5a", "#9b2f3a", "#2a2440", "#ffc93c"];
const PTS = [0, 1, 1, 1, 1, 1, 1, 1, 1, 2];      // 9번 공은 2점
const FELTS = [
  { name: "초록 당구대", felt: "#2f8f5b", rail: "#8a5a3c", rail2: "#6e4630" },
  { name: "파랑 당구대", felt: "#2f6fb5", rail: "#5a3a2a", rail2: "#432b1f" },
  { name: "빨강 당구대", felt: "#b8404f", rail: "#3b2a22", rail2: "#2a1d18" },
  { name: "보라 당구대", felt: "#6b4bb5", rail: "#2b2d6e", rail2: "#1d1f52" },
];
const HEAD = [TX0 + TW * 0.25, TY0 + TH / 2];

function rack() {
  const cx = TX0 + TW * 0.72, cy = TY0 + TH / 2, rows = [1, 2, 3, 2, 1];
  const rest = [2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
  const bs = [{ n: 0, x: HEAD[0], y: HEAD[1], vx: 0, vy: 0, in: 0 }];
  rows.forEach((cnt, r) => {
    for (let j = 0; j < cnt; j++) {
      const n = r === 0 ? 1 : r === 2 && j === 1 ? 9 : rest.pop();
      bs.push({ n, x: cx + r * BR * 1.76, y: cy + (j - (cnt - 1) / 2) * (BR * 2 + 0.8), vx: 0, vy: 0, in: 0 });
    }
  });
  return bs;
}

function init(seats) {
  const s = { tick: 0, seats, th: (Math.random() * FELTS.length) | 0, bs: rack(), p: seats.map(() => ({ sc: 0, got: [], ka: 0, kp: 90, ax: 0, ay: 0, pp: 0, pa: 0 })), turn: 0, ph: 0, tl: TURN, sunk: [], over: null, msg: [], hc: 0, wc: 0, pc: 0, fc: 0, xc: 0, ag: 0, tn: 0 };
  beginTurn(s);
  return s;
}

function pop(s, text, col) { s.msg.push({ text, col, t: 0 }); if (s.msg.length > 3) s.msg.shift(); }

function beginTurn(s) {
  const p = s.p[s.turn], c = s.bs[0];
  let best = null, bd = 1e9;      // 키보드 조준은 가장 가까운 공 쪽에서 시작
  for (const b of s.bs) if (b.n && !b.in) { const d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } }
  if (best) p.ka = (Math.atan2(best.y - c.y, best.x - c.x) * 180) / Math.PI;
  p.pp = 0; p.pa = 0; s.ph = 0; s.tl = TURN; s.tn++;
}

// 공 움직이기. 모두 멈췄으면 true
function physics(s) {
  const bs = s.bs;
  for (let sub = 0; sub < 2; sub++) {
    for (const b of bs) if (!b.in) { b.x += b.vx / 2; b.y += b.vy / 2; }
    for (const b of bs) {
      if (b.in) continue;
      if (PK.some(([px, py, pr]) => Math.hypot(b.x - px, b.y - py) < pr)) { b.in = 1; b.vx = 0; b.vy = 0; s.sunk.push(b.n); s.pc++; continue; }
      const sp = Math.abs(b.vx) + Math.abs(b.vy);
      if (b.x < TX0 + BR) { b.x = TX0 + BR; b.vx = Math.abs(b.vx) * 0.8; if (sp > 1) s.wc++; }
      if (b.x > TX0 + TW - BR) { b.x = TX0 + TW - BR; b.vx = -Math.abs(b.vx) * 0.8; if (sp > 1) s.wc++; }
      if (b.y < TY0 + BR) { b.y = TY0 + BR; b.vy = Math.abs(b.vy) * 0.8; if (sp > 1) s.wc++; }
      if (b.y > TY0 + TH - BR) { b.y = TY0 + TH - BR; b.vy = -Math.abs(b.vy) * 0.8; if (sp > 1) s.wc++; }
    }
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], c = bs[j];
      if (a.in || c.in) continue;
      const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= 4 * BR * BR || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (2 * BR - d) / 2;
      a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
      const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = (-(1 + 0.95) * rel) / 2;
        a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
        if (rel < -0.8) s.hc++;
      }
    }
  }
  let moving = false;
  for (const b of bs) {
    if (b.in) continue;
    b.vx *= FR; b.vy *= FR;
    if (b.vx * b.vx + b.vy * b.vy < 0.0025) { b.vx = 0; b.vy = 0; } else moving = true;
  }
  return !moving;
}

function respot(s) {
  const c = s.bs[0];
  c.in = 0; c.vx = 0; c.vy = 0;
  const free = (x, y) => s.bs.every((b) => b === c || b.in || Math.hypot(b.x - x, b.y - y) > BR * 2 + 1);
  for (let r = 0; r < 200; r += 6) for (let a = 0; a < 6.28; a += 0.8) {
    const x = HEAD[0] - r * Math.abs(Math.cos(a)), y = HEAD[1] + r * Math.sin(a);
    if (x > TX0 + BR + 2 && y > TY0 + BR + 2 && y < TY0 + TH - BR - 2 && free(x, y)) { c.x = x; c.y = y; return; }
  }
  c.x = HEAD[0]; c.y = HEAD[1];
}

function nextPlayer(s) { s.turn = (s.turn + 1) % s.p.length; beginTurn(s); }

// 공이 다 멈춘 뒤 점수 계산
function settle(s) {
  const p = s.p[s.turn], scratch = s.sunk.includes(0);
  let pts = 0;
  for (const n of s.sunk) if (n > 0) { pts += PTS[n]; p.got.push(n); }
  p.sc += pts;
  if (scratch) { p.sc -= 1; s.xc++; respot(s); pop(s, "흰 공이 빠졌어요 −1", "#ff5d73"); }
  else if (pts) pop(s, `+${pts}점! 한 번 더`, "#ffc93c");
  s.sunk = [];
  if (s.bs.every((b) => b.n === 0 || b.in)) {
    let w = 0, tie = false;
    s.p.forEach((q, i) => { if (q.sc > s.p[w].sc) { w = i; tie = false; } else if (i !== w && q.sc === s.p[w].sc) tie = true; });
    s.over = { w: tie ? -1 : w, t: 0 }; return;
  }
  if (pts > 0 && !scratch) { s.ag++; beginTurn(s); }
  else nextPlayer(s);
}

function step(s, masks, aims) {
  s.tick++;
  for (const q of s.msg) q.t++;
  if (s.msg.length && s.msg[0].t > 90) s.msg.shift();
  if (s.over) { s.over.t++; return; }
  if (s.tick < START) return;
  if (s.ph === 0) {
    const o = s.turn, p = s.p[o], m = masks[o] | 0, aim = aims && aims[o];
    if (m & L) p.ka -= 0.45;
    if (m & R) p.ka += 0.45;
    if (m & U) p.kp = Math.min(MAXP, p.kp + 1.2);
    if (m & D) p.kp = Math.max(15, p.kp - 1.2);
    let go = false;
    if (m & P && aim) { const len = Math.hypot(aim.x, aim.y), k = len > MAXP ? MAXP / len : 1; p.ax = aim.x * k; p.ay = aim.y * k; p.pp = 1; }
    else {
      if (p.pp) { p.pp = 0; if (Math.hypot(p.ax, p.ay) > 10) go = true; }      // 끌었다 놓으면 친다
      if (!go) { const r = (p.ka * Math.PI) / 180; p.ax = Math.cos(r) * p.kp; p.ay = Math.sin(r) * p.kp; }
    }
    if (m & A && !p.pa) go = true;
    p.pa = m & A ? 1 : 0;
    if (go) { const c = s.bs[0]; c.vx = p.ax * VK; c.vy = p.ay * VK; s.sunk = []; s.ph = 1; s.fc++; }
    else if (--s.tl <= 0) nextPlayer(s);
  } else if (physics(s)) settle(s);
}

// 조준선: 흰 공이 처음 닿을 공(또는 쿠션)까지
function aimInfo(v, ax, ay) {
  const c = v.bs[0], len = Math.hypot(ax, ay) || 1, ux = ax / len, uy = ay / len;
  let best = 1e9, hit = -1;
  for (let i = 1; i < v.bs.length; i++) {
    const b = v.bs[i];
    if (b.in) continue;
    const fx = b.x - c.x, fy = b.y - c.y, tp = fx * ux + fy * uy;
    if (tp <= 0) continue;
    const perp2 = fx * fx + fy * fy - tp * tp, r2 = 4 * BR * BR;
    if (perp2 > r2) continue;
    const t = tp - Math.sqrt(r2 - perp2);
    if (t < best) { best = t; hit = i; }
  }
  const tx = ux > 0 ? (TX0 + TW - BR - c.x) / ux : ux < 0 ? (TX0 + BR - c.x) / ux : 1e9;
  const tyy = uy > 0 ? (TY0 + TH - BR - c.y) / uy : uy < 0 ? (TY0 + BR - c.y) / uy : 1e9;
  const tw = Math.min(tx, tyy);
  if (hit >= 0 && best < tw) { const gx = c.x + ux * best, gy = c.y + uy * best, b = v.bs[hit]; return { gx, gy, hit, ox: b.x - gx, oy: b.y - gy, ux, uy }; }
  return { gx: c.x + ux * tw, gy: c.y + uy * tw, hit: -1, ux, uy };
}

// ── 봇: 공마다 구멍마다 쳐 보고 가장 좋은 샷을 고른다 ──
const BOTS = { easy: { err: 0.026, pick: 0.3 }, normal: { err: 0.012, pick: 0.1 }, hard: { err: 0.003, pick: 0 } };

function simShot(s, ax, ay) {
  const c = { bs: s.bs.map((b) => ({ ...b })), sunk: [], pc: 0, wc: 0, hc: 0 };
  c.bs[0].vx = ax * VK; c.bs[0].vy = ay * VK;
  for (let k = 0; k < 900; k++) if (physics(c)) break;
  let sc = 0;
  for (const n of c.sunk) sc += n === 0 ? -14 : PTS[n] * 10;
  return sc;
}

function plan(s, level) {
  const c = s.bs[0], cands = [];
  for (const b of s.bs) {
    if (!b.n || b.in) continue;
    for (const [px, py] of PK) {
      const l0 = Math.hypot(px - b.x, py - b.y), ux = (px - b.x) / l0, uy = (py - b.y) / l0;
      const gx = b.x - ux * 2 * BR, gy = b.y - uy * 2 * BR, ax = gx - c.x, ay = gy - c.y, la = Math.hypot(ax, ay);
      if (la < 1 || (ax * ux + ay * uy) / la < 0.3) continue;      // 너무 얇게 깎아야 하는 공은 뺀다
      for (const pw of [0.4, 0.6, 0.85]) cands.push({ ang: Math.atan2(ay, ax), pw });
    }
  }
  for (let k = 0; k < 10; k++) cands.push({ ang: Math.random() * Math.PI * 2, pw: 0.5 + Math.random() * 0.5 });
  for (const cd of cands) cd.sc = simShot(s, Math.cos(cd.ang) * MAXP * cd.pw, Math.sin(cd.ang) * MAXP * cd.pw) + Math.random() * 3;
  cands.sort((a, b) => b.sc - a.sc);
  const cfg = BOTS[level] || BOTS.normal;
  const pick = cands[Math.floor(Math.random() * Math.max(1, cands.length * cfg.pick))] || { ang: 0, pw: 0.6 };
  const ang = pick.ang + (Math.random() * 2 - 1) * cfg.err;
  return { x: Math.cos(ang) * MAXP * pick.pw, y: Math.sin(ang) * MAXP * pick.pw };
}

function bot(s, o, mem, level) {
  if (s.over || s.tick < START || s.ph !== 0 || s.turn !== o) { mem.tn = -1; return 0; }
  if (mem.tn !== s.tn) { mem.tn = s.tn; mem.t = 0; mem.plan = plan(s, level); }
  mem.t++;
  const pl = mem.plan;
  if (mem.t < 40) return 0;
  if (mem.t < 72) { const k = Math.min(1, (mem.t - 40) / 24); return { m: P, x: pl.x * k, y: pl.y * k }; }
  return { m: 0, x: pl.x, y: pl.y };
}

// ── 그리기 ──
function drawBall(ctx, n, x, y, look) {
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 4, BR, BR * 0.8, 0, 0, 7); ctx.fill();
  if (n === 0) { drawMochi(ctx, x, y, BR, { ...look, hex: "fffdf6" }); return; }
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, BR, 0, 7); ctx.clip();
  ctx.fillStyle = n === 9 ? "#fffdf6" : COL[n]; ctx.fillRect(x - BR, y - BR, BR * 2, BR * 2);
  if (n === 9) { ctx.fillStyle = COL[9]; ctx.fillRect(x - BR, y - BR * 0.55, BR * 2, BR * 1.1); }
  ctx.restore();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, BR * 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = "#2a2440"; ctx.font = "700 9px Jua, sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(n), x, y + 3.2);
  ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.arc(x - BR * 0.4, y - BR * 0.45, BR * 0.25, 0, 7); ctx.fill();
}

function draw(ctx, v, env) {
  const f = FELTS[v.th | 0] || FELTS[0];
  ctx.fillStyle = "#f6e6c6"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(43,45,110,.06)";
  for (let y = 12; y < H; y += 26) for (let x = 12 + ((y / 26) % 2) * 13; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
  // 당구대
  ctx.fillStyle = "rgba(0,0,0,.2)"; rr(ctx, TX0 - 30, TY0 - 24, TW + 68, TH + 66, 26); ctx.fill();
  ctx.fillStyle = f.rail2; rr(ctx, TX0 - 34, TY0 - 34, TW + 68, TH + 68, 26); ctx.fill();
  ctx.fillStyle = f.rail; rr(ctx, TX0 - 28, TY0 - 28, TW + 56, TH + 56, 22); ctx.fill();
  ctx.fillStyle = f.felt; rr(ctx, TX0 - 7, TY0 - 7, TW + 14, TH + 14, 8); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(HEAD[0], TY0); ctx.lineTo(HEAD[0], TY0 + TH); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.5)";
  for (let k = 1; k < 8; k++) if (k !== 4) for (const y of [TY0 - 18, TY0 + TH + 18]) { ctx.beginPath(); ctx.arc(TX0 + (TW * k) / 8, y, 2.5, 0, 7); ctx.fill(); }
  for (let k = 1; k < 4; k++) for (const x of [TX0 - 18, TX0 + TW + 18]) { ctx.beginPath(); ctx.arc(x, TY0 + (TH * k) / 4, 2.5, 0, 7); ctx.fill(); }
  for (const [px, py, pr] of PK) { ctx.fillStyle = "#15122a"; ctx.beginPath(); ctx.arc(px, py, pr + 2, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2; ctx.stroke(); }

  const aiming = v.ph === 0 && v.tick >= START && !v.over, p = v.p[v.turn], c = v.bs[0];
  const look = parseLook(v.seats[v.turn].look, v.turn);
  if (aiming && !c.in) {
    const ai = aimInfo(v, p.ax, p.ay);
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(ai.gx, ai.gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(ai.gx, ai.gy, BR, 0, 7); ctx.stroke();
    if (ai.hit >= 0) {      // 맞은 공이 굴러갈 방향
      const ol = Math.hypot(ai.ox, ai.oy) || 1, b = v.bs[ai.hit];
      ctx.strokeStyle = "rgba(255,230,120,.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + (ai.ox / ol) * 70, b.y + (ai.oy / ol) * 70); ctx.stroke();
    }
    // 큐
    const pw = Math.hypot(p.ax, p.ay), pull = 8 + pw * 0.45, ux = ai.ux, uy = ai.uy;
    const x1 = c.x - ux * (BR + pull), y1 = c.y - uy * (BR + pull), x2 = c.x - ux * (BR + pull + 250), y2 = c.y - uy * (BR + pull + 250);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#5a3a2a"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x1 - ux * 70, y1 - uy * 70); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = "#e9c887"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * 70, y1 - uy * 70); ctx.stroke();
    ctx.strokeStyle = "#7cc6fe"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * 5, y1 - uy * 5); ctx.stroke();
    // 세기 막대
    ctx.fillStyle = "rgba(255,253,246,.9)"; rr(ctx, TX0 + TW + 44, TY0 + 20, 16, TH - 40, 8); ctx.fill();
    const hh = ((TH - 48) * pw) / MAXP;
    ctx.fillStyle = pw > MAXP * 0.75 ? "#ff5d73" : "#ffc93c"; rr(ctx, TX0 + TW + 47, TY0 + TH - 24 - hh, 10, hh, 5); ctx.fill();
  }
  for (const b of v.bs) {
    if (b.in) continue;
    const q = env.prev && env.prev.bs.find((o) => o.n === b.n), x = q ? q.x + (b.x - q.x) * env.alpha : b.x, y = q ? q.y + (b.y - q.y) * env.alpha : b.y;
    drawBall(ctx, b.n, x, y, look);
  }
  // 점수 카드
  const n = v.seats.length, cw = Math.min(230, 900 / n), x0 = (W - cw * n) / 2;
  v.seats.forEach((seat, i) => {
    const x = x0 + i * cw, q = v.p[i], on = i === v.turn && !v.over;
    ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = on ? "#ff5d73" : SEAT_DARK[i]; ctx.lineWidth = on ? 4.5 : 3;
    rr(ctx, x + 5, 6, cw - 10, 54, 14); ctx.fill(); ctx.stroke();
    drawMochi(ctx, x + 28, 33, 15, parseLook(seat.look, i));
    label(ctx, seat.name, x + 50, 28, 15, i === env.me ? "#d6336c" : "#2b2d6e", null, "left");
    label(ctx, String(q.sc), x + cw - 16, 41, 26, "#2b2d6e", null, "right");
    q.got.slice(-8).forEach((bn, k) => { ctx.fillStyle = COL[bn]; ctx.beginPath(); ctx.arc(x + 56 + k * 12, 46, 4.5, 0, 7); ctx.fill(); });
  });
  for (const m of v.msg) if (m.t < 80) label(ctx, m.text, W / 2, TY0 + TH / 2 - 10 - m.t * 0.4, 30, m.col, "#2b2d6e");
  if (v.tick < START) label(ctx, "준비!", W / 2, TY0 + TH / 2 + 20, 70, "#fff", "#2b2d6e");
  else if (aiming) {
    label(ctx, `${v.seats[v.turn].name} 차례 · ${Math.ceil(v.tl / 60)}초`, W / 2, H - 38, 19, v.turn === env.me ? "#d6336c" : "#2b2d6e", null);
    if (v.turn === env.me) label(ctx, env.touch ? "화면을 뒤로 끌었다 놓으면 쳐요. 멀리 끌수록 세게" : "화면을 뒤로 끌었다 놓으면 쳐요 · 키보드: ←→ 방향, ↑↓ 세기, 스페이스", W / 2, H - 13, 16, "#6b6480", null);
  }
  label(ctx, f.name, W - 14, H - 12, 13, "#6b6480", null, "right");
  if (v.over) {
    const w = v.over.w;
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, TY0 + TH / 2 + 20, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd, me) {
  if (m.fc == null) Object.assign(m, { fc: v.fc, hc: v.hc, wc: v.wc, pc: v.pc, xc: v.xc, tn: -1, ov: !!v.over });
  if (v.fc !== m.fc) { m.fc = v.fc; snd.clack(1.3); }
  if (v.hc !== m.hc) { m.hc = v.hc; snd.clack(); }
  if (v.wc !== m.wc) { m.wc = v.wc; snd.thud(0.35); }
  if (v.pc !== m.pc) { m.pc = v.pc; snd.thud(0.6); snd(320, 0.18, "sine", 0.1, -200); }
  if (v.xc !== m.xc) { m.xc = v.xc; snd(400, 0.35, "sawtooth", 0.08, -300); }
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
  W, H, sendEvery: 2, action: null, overDelay: 220, pointer: true, noPad: true,
  bots: { solo: 1, local: 0 },
  fill: (mode, n) => (n < 2 ? 1 : 0),
  init, step, bot, draw, fx, title,
};

export const meta = {
  local: true,
  soloText: "봇과 번갈아 치며 점수 겨루기. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 겨뤄요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 번갈아 쳐요. 점수가 가장 높으면 승리.`),
  howto: [
    ["목표", "흰 공(내 떡)으로 색 공을 쳐서 구멍에 넣어요. 공 하나에 1점, 노란 줄무늬 9번은 2점. 공을 다 넣었을 때 점수가 가장 높으면 승리"],
    ["차례", "공을 넣으면 한 번 더 쳐요. 못 넣으면 다음 사람 차례, 흰 공이 빠지면 1점 깎이고 차례가 넘어가요"],
    ["조작", "화면을 뒤로 끌었다가 놓으면 반대쪽으로 쳐요. 멀리 끌수록 세게. 점선과 노란 선이 공이 갈 길이에요"],
    ["키보드", "←→ 방향, ↑↓ 세기, 스페이스 치기"],
    ["한 키보드 2인", "차례가 되면 같은 마우스(또는 키보드)로 번갈아 쳐요"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
