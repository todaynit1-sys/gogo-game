// 알까기 — 번갈아 내 알을 튕겨 상대 알을 판 밖으로 밀어낸다. 마지막까지 알이 남은 사람이 승리.
// 차례제라서 온라인에서도 끊김 없이 할 수 있다.

import { startHostGame, L, R, U, D, A, P, B } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle, SEAT_TINT, SEAT_DARK } from "./kit.js?v=1";

const W = 960, H = 540, BX = 250, BY = 40, BS = 460, SR = 17, FR = 0.972, MAXP = 120, VK = 11.5 / MAXP, START = 90, TURN = 20 * 60;
const BOARDS = [
  { name: "나무 판", bg: "#fff1cc", wood: "#e8b96a", edge: "#a8743a", line: "rgba(120,80,30,.35)" },
  { name: "초록 판", bg: "#e6f4d7", wood: "#7fc48a", edge: "#3f8f55", line: "rgba(255,255,255,.4)" },
  { name: "밤하늘 판", bg: "#1d2146", wood: "#3a4288", edge: "#15183a", line: "rgba(255,255,255,.18)" },
];

function init(seats) {
  const n = seats.length, per = n <= 2 ? 5 : 4, st = [];
  seats.forEach((_, o) => {
    for (let k = 0; k < per; k++) {
      const t = BS * (k + 1) / (per + 1);
      const [x, y] = o === 0 ? [BX + t, BY + BS - 62] : o === 1 ? [BX + t, BY + 62] : o === 2 ? [BX + 62, BY + t] : [BX + BS - 62, BY + t];
      st.push({ x, y, vx: 0, vy: 0, o, al: 1, ft: 0 });
    }
  });
  const p = seats.map((_, o) => ({ sel: st.findIndex((q) => q.o === o), ka: [270, 90, 0, 180][o], kp: 75, ax: 0, ay: 0, pp: 0, pa: 0, pb: 0 }));
  return { tick: 0, seats, th: (Math.random() * BOARDS.length) | 0, st, p, turn: 0, ph: 0, tl: TURN, tm: 0, over: null, hc: 0, fc: 0, fl: 0, tn: 0 };
}

const left = (s, o) => s.st.filter((q) => q.o === o && q.al).length;

// 알들을 한 틱 움직인다. 모두 멈췄으면 true
function physics(s) {
  let moving = false;
  const st = s.st;
  for (const q of st) {
    if (!q.al) { if (q.ft < 30) q.ft++; continue; }
    q.x += q.vx; q.y += q.vy; q.vx *= FR; q.vy *= FR;
    if (Math.hypot(q.vx, q.vy) < 0.06) { q.vx = 0; q.vy = 0; } else moving = true;
  }
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const a = st[i], b = st[j];
    if (!a.al || !b.al) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= SR * 2 || d < 0.001) continue;
    const nx = dx / d, ny = dy / d, k = (SR * 2 - d) / 2;
    a.x -= nx * k; a.y -= ny * k; b.x += nx * k; b.y += ny * k;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) {
      const imp = (-(1 + 0.92) * rel) / 2;
      a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
      if (rel < -0.6) s.hc++;
    }
  }
  for (const q of st) if (q.al && (q.x < BX || q.x > BX + BS || q.y < BY || q.y > BY + BS)) { q.al = 0; q.ft = 0; s.fc++; }      // 판 밖으로 나가면 탈락
  return !moving;
}

function nextTurn(s) {
  const owners = s.seats.map((_, o) => o).filter((o) => left(s, o) > 0);
  if (s.seats.length > 1 && owners.length <= 1) { s.over = { w: owners.length ? owners[0] : -1, t: 0 }; return; }
  do { s.turn = (s.turn + 1) % s.seats.length; } while (left(s, s.turn) === 0);
  const p = s.p[s.turn]; p.pp = 0; p.pa = 0; p.pb = 0;
  s.ph = 0; s.tl = TURN; s.tn++;
}

function step(s, masks, aims) {
  s.tick++;
  if (s.over) { s.over.t++; physics(s); return; }
  if (s.tick < START) return;
  if (s.ph === 0) {
    const o = s.turn, p = s.p[o], m = masks[o] | 0, aim = aims && aims[o];
    const mine = s.st.map((q, i) => (q.o === o && q.al ? i : -1)).filter((i) => i >= 0);
    if (!mine.includes(p.sel)) p.sel = mine[0];
    if (m & B && !p.pb) p.sel = mine[(mine.indexOf(p.sel) + 1) % mine.length];      // 알 바꾸기
    p.pb = m & B ? 1 : 0;
    if (m & L) p.ka = (p.ka + 358.5) % 360;
    if (m & R) p.ka = (p.ka + 1.5) % 360;
    if (m & U) p.kp = Math.min(MAXP, p.kp + 1.2);
    if (m & D) p.kp = Math.max(20, p.kp - 1.2);
    let go = false;
    if (m & P && aim) {
      if (!p.pp && aim.sx != null) {       // 누른 곳에서 가장 가까운 내 알을 고른다
        let best = -1, bd = 70;
        for (const i of mine) { const d = Math.hypot(s.st[i].x - aim.sx, s.st[i].y - aim.sy); if (d < bd) { bd = d; best = i; } }
        if (best >= 0) p.sel = best;
      }
      const len = Math.hypot(aim.x, aim.y), k = len > MAXP ? MAXP / len : 1;
      p.ax = Math.round(aim.x * k); p.ay = Math.round(aim.y * k); p.pp = 1;
    } else {
      if (p.pp) { p.pp = 0; if (Math.hypot(p.ax, p.ay) > 12) go = true; }
      if (!go) { const r = (p.ka * Math.PI) / 180; p.ax = Math.round(Math.cos(r) * p.kp); p.ay = Math.round(Math.sin(r) * p.kp); }
    }
    if (m & A && !p.pa) go = true;
    p.pa = m & A ? 1 : 0;
    if (go) { const q = s.st[p.sel]; q.vx = p.ax * VK; q.vy = p.ay * VK; s.ph = 1; s.fl++; }
    else if (--s.tl <= 0) nextTurn(s);
  } else if (s.ph === 1) { if (physics(s)) { s.ph = 2; s.tm = 26; } }
  else { physics(s); if (--s.tm <= 0) nextTurn(s); }
}

// ── 봇: 여러 방향·세기로 튕겨 보고 가장 이득인 수를 고른다 ──
function tryFlick(s, idx, vx, vy, o) {
  const c = { st: s.st.map((q) => ({ ...q })), hc: 0, fc: 0 };
  c.st[idx].vx = vx; c.st[idx].vy = vy;
  for (let k = 0; k < 420; k++) if (physics(c)) break;
  let score = 0;
  c.st.forEach((q, i) => {
    if (!s.st[i].al) return;
    if (!q.al) score += q.o === o ? -13 : 10;
    else if (q.o !== o) { const edge = Math.min(q.x - BX, BX + BS - q.x, q.y - BY, BY + BS - q.y); score += Math.max(0, 60 - edge) * 0.03; }      // 상대 알을 가장자리로 몰면 조금 이득
    else { const edge = Math.min(q.x - BX, BX + BS - q.x, q.y - BY, BY + BS - q.y); score -= Math.max(0, 50 - edge) * 0.04; }
  });
  return score;
}

const BOTS = { easy: { err: 0.13, pick: 0.5 }, normal: { err: 0.045, pick: 0.15 }, hard: { err: 0, pick: 0 } };

function bot(s, o, mem, level) {
  if (s.over || s.tick < START || s.ph !== 0 || s.turn !== o) { mem.tn = -1; return 0; }
  if (mem.tn !== s.tn) {
    mem.tn = s.tn; mem.t = 0;
    const cfg = BOTS[level] || BOTS.normal, cands = [];
    s.st.forEach((a, i) => {
      if (a.o !== o || !a.al) return;
      s.st.forEach((b) => {
        if (b.o === o || !b.al) return;
        const base = Math.atan2(b.y - a.y, b.x - a.x);
        for (const pw of [0.6, 0.8, 1]) for (const off of [-0.05, 0, 0.05]) {
          const ang = base + off, v = 11.5 * pw;
          cands.push({ i, ang, pw, sc: tryFlick(s, i, Math.cos(ang) * v, Math.sin(ang) * v, o) + Math.random() * 0.5 });
        }
      });
    });
    cands.sort((x, y) => y.sc - x.sc);
    const c = cands[Math.floor(Math.random() * Math.max(1, cands.length * cfg.pick))] || { i: s.st.findIndex((q) => q.o === o && q.al), ang: 0, pw: 0.6 };
    const ang = c.ang + (Math.random() * 2 - 1) * cfg.err;
    mem.plan = { i: c.i, x: Math.round(Math.cos(ang) * MAXP * c.pw), y: Math.round(Math.sin(ang) * MAXP * c.pw) };
  }
  mem.t++;
  const pl = mem.plan, q = s.st[pl.i];
  if (mem.t < 45) return 0;
  if (mem.t < 80) { const k = Math.min(1, (mem.t - 45) / 22); return { m: P, x: Math.round(pl.x * k), y: Math.round(pl.y * k), sx: Math.round(q.x), sy: Math.round(q.y) }; }
  return { m: 0, x: pl.x, y: pl.y, sx: Math.round(q.x), sy: Math.round(q.y) };
}

// ── 그리기 ──
function draw(ctx, v, env) {
  const th = BOARDS[v.th | 0] || BOARDS[0];
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,.18)"; rr(ctx, BX - 14, BY - 8, BS + 28, BS + 30, 18); ctx.fill();
  ctx.fillStyle = th.edge; rr(ctx, BX - 16, BY - 16, BS + 32, BS + 32, 18); ctx.fill();
  ctx.fillStyle = th.wood; rr(ctx, BX, BY, BS, BS, 8); ctx.fill();
  ctx.strokeStyle = th.line; ctx.lineWidth = 1.5;
  for (let k = 1; k < 10; k++) { const t = (BS * k) / 10; ctx.beginPath(); ctx.moveTo(BX + t, BY + 10); ctx.lineTo(BX + t, BY + BS - 10); ctx.moveTo(BX + 10, BY + t); ctx.lineTo(BX + BS - 10, BY + t); ctx.stroke(); }

  const aiming = v.ph === 0 && v.tick >= START && !v.over, p = v.p[v.turn];
  // 조준선
  if (aiming && v.st[p.sel] && v.st[p.sel].al) {
    const q = v.st[p.sel], len = Math.hypot(p.ax, p.ay) || 1, ux = p.ax / len, uy = p.ay / len, reach = 34 + len * 1.5;
    ctx.strokeStyle = SEAT_DARK[v.turn]; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.setLineDash([2, 11]);
    ctx.beginPath(); ctx.moveTo(q.x + ux * 22, q.y + uy * 22); ctx.lineTo(q.x + ux * reach, q.y + uy * reach); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = SEAT_DARK[v.turn]; ctx.beginPath();
    ctx.moveTo(q.x + ux * (reach + 14), q.y + uy * (reach + 14)); ctx.lineTo(q.x + ux * reach - uy * 9, q.y + uy * reach + ux * 9); ctx.lineTo(q.x + ux * reach + uy * 9, q.y + uy * reach - ux * 9); ctx.fill();
    if (p.pp) { ctx.strokeStyle = "rgba(43,45,110,.5)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - p.ax * 0.5, q.y - p.ay * 0.5); ctx.stroke(); }
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(q.x, q.y, SR + 6 + Math.sin(env.t * 7) * 1.5, 0, 7); ctx.stroke();
  }
  // 알
  v.st.forEach((q, i) => {
    const old = env.prev && env.prev.st[i], x = old ? old.x + (q.x - old.x) * env.alpha : q.x, y = old ? old.y + (q.y - old.y) * env.alpha : q.y;
    if (!q.al) {
      if (q.ft >= 30) return;
      ctx.globalAlpha = 1 - q.ft / 30;
      const r = SR * (1 - q.ft / 40);
      ctx.fillStyle = SEAT_TINT[q.o]; ctx.beginPath(); ctx.arc(x, y + q.ft * 0.8, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; return;
    }
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 5, SR, SR * 0.85, 0, 0, 7); ctx.fill();
    ctx.fillStyle = SEAT_TINT[q.o]; ctx.strokeStyle = SEAT_DARK[q.o]; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(x, y, SR, 0, 7); ctx.fill(); ctx.stroke();
    drawMochi(ctx, x, y + 1, 11, parseLook(v.seats[q.o].look, q.o));
  });
  // 선수 카드
  v.seats.forEach((seat, o) => {
    const X = o % 2 === 0 ? 20 : W - 220, Y = o < 2 ? 70 : 250, n = v.st.filter((q) => q.o === o && q.al).length, on = o === v.turn && !v.over;
    ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = on ? "#ff5d73" : SEAT_DARK[o]; ctx.lineWidth = on ? 5 : 3.5;
    rr(ctx, X, Y, 200, 150, 16); ctx.fill(); ctx.stroke();
    drawMochi(ctx, X + 50, Y + 58, 30, parseLook(seat.look, o));
    label(ctx, seat.name, X + 100, Y + 126, 18, o === env.me ? "#d6336c" : "#2b2d6e", null);
    for (let k = 0; k < n; k++) { ctx.fillStyle = SEAT_TINT[o]; ctx.strokeStyle = SEAT_DARK[o]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(X + 104 + (k % 3) * 28, Y + 40 + ((k / 3) | 0) * 28, 11, 0, 7); ctx.fill(); ctx.stroke(); }
    if (n === 0) { ctx.fillStyle = "rgba(255,244,220,.8)"; rr(ctx, X, Y, 200, 150, 16); ctx.fill(); label(ctx, "탈락", X + 100, Y + 86, 30, "#8f93b8", "#fff"); }
  });
  const dark = th.name === "밤하늘 판";
  label(ctx, th.name, W - 14, H - 12, 14, dark ? "#fff" : "#2b2d6e", null, "right");
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2, 80, "#ff5d73", "#fff");
  else if (aiming) {
    label(ctx, `${v.seats[v.turn].name} 차례 · ${Math.ceil(v.tl / 60)}초`, W / 2, 26, 19, v.turn === env.me ? "#d6336c" : dark ? "#fff" : "#2b2d6e", dark ? null : "rgba(255,255,255,.9)");
    if (v.turn === env.me) label(ctx, "내 알을 눌러 뒤로 끌었다 놓기 · 키보드: Q 알 바꾸기, ←→ 방향, ↑↓ 세기, 스페이스", W / 2, H - 10, 16, dark ? "#fff" : "#2a2440", dark ? null : "rgba(255,255,255,.9)");
  }
  if (v.over) {
    const w = v.over.w;
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, H / 2, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd, me) {
  if (m.hc == null) Object.assign(m, { hc: v.hc, fc: v.fc, fl: v.fl, tn: -1, ov: !!v.over });
  if (v.fl !== m.fl) { m.fl = v.fl; snd(240, 0.08, "square", 0.08, 120); }
  if (v.hc !== m.hc) { m.hc = v.hc; snd(900, 0.05, "triangle", 0.12, -300); }
  if (v.fc !== m.fc) { m.fc = v.fc; snd(420, 0.3, "sawtooth", 0.09, -320); }
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
  W, H, sendEvery: 2, action: null, overDelay: 220, pointer: true, pointerStart: true, noPad: true,
  bots: { solo: 1, local: 0 },
  fill: (mode, n) => (n < 2 ? 1 : 0),
  init, step, bot, draw, fx, title,
};

export const meta = {
  local: true,
  soloText: "봇과 1대1 알까기. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 번갈아 튕겨요. 마지막까지 알이 남으면 승리.`),
  howto: [
    ["목표", "번갈아 내 알을 하나씩 튕겨서 상대 알을 판 밖으로 밀어내요. 알이 마지막까지 남은 사람이 승리"],
    ["조작", "내 알을 누른 채 뒤로 끌었다가 놓으면 반대쪽으로 튕겨 나가요. 멀리 끌수록 세게"],
    ["키보드", "Q 알 바꾸기, ←→ 방향 돌리기, ↑↓ 세기, 스페이스 튕기기"],
    ["주의", "너무 세게 치면 내 알도 같이 판 밖으로 나가요"],
    ["한 키보드 2인", "차례가 되면 같은 마우스(또는 키보드)로 번갈아 튕겨요"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
