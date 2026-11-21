// 떡 볼링 — 번갈아 공을 굴려 핀 열 개를 쓰러뜨린다. 점수는 진짜 볼링처럼(스트라이크·스페어 보너스).
// 차례제라서 온라인에서도 끊김 없이 할 수 있다.

import { lazy3d } from "./lazy3d.js?v=1";
import { startHostGame, L, R, U, D, A, P } from "./hostgame.js?v=4";
import { drawMochi, parseLook, bodyColors } from "../avatar.js?v=3";
import { rr, label, jingle, SEAT_DARK } from "./kit.js?v=3";

const W = 960, H = 540, START = 90, TURN = 20 * 60;
const LX0 = 110, LX1 = 880, LY0 = 262, LY1 = 438, CY = (LY0 + LY1) / 2, GUT = 16;      // 레인과 도랑
const BX = 160, BRD = 17, PRD = 9, HEAD = 742, MAXP = 120;
const SPOTS = (() => { const a = []; for (let r = 0; r < 4; r++) for (let j = 0; j <= r; j++) a.push([HEAD + r * 28, CY + (j - r / 2) * 33]); return a; })();
const JIT = +(globalThis.process && process.env.JIT || 0.7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANES = [
  { name: "나무 레인", bg: "#fff1cc", wood: "#f0c684", wood2: "#e9bb74", gut: "#5a3a2a", line: "rgba(120,80,30,.35)" },
  { name: "네온 레인", bg: "#1d2146", wood: "#3b4490", wood2: "#353d84", gut: "#12142e", line: "rgba(255,255,255,.2)", dark: true },
  { name: "딸기 레인", bg: "#ffe9ee", wood: "#ffc2cf", wood2: "#ffb5c4", gut: "#b0506a", line: "rgba(160,60,90,.3)" },
];

const rack = () => SPOTS.map(([x, y]) => ({ x, y, vx: 0, vy: 0, up: 1 }));
const standing = (s) => s.pins.filter((q) => q.up).length;

function init(seats, opt) {
  const N = opt && opt.mode === 10 ? 10 : 5;
  return {
    tick: 0, seats, N, th: (Math.random() * LANES.length) | 0, pl: seats.map(() => ({ rolls: [], fr: 0, bl: 0, done: 0 })),
    turn: 0, ph: 0, tl: TURN, tm: 0, pins: rack(), before: 10, ball: { x: BX, y: CY, vx: 0, vy: 0, gut: 0 },
    aim: { y: CY, ka: 0, ax: MAXP * 0.8, ay: 0, pp: 0, pa: 0 }, note: "", nt: 0, over: null, rc: 0, hc: 0, kc: 0, gc: 0, xc: 0, tn: 0,
  };
}

// 볼링 점수 (스트라이크 = 10 + 다음 두 번, 스페어 = 10 + 다음 한 번)
function total(rolls, N) {
  let sc = 0, i = 0;
  for (let f = 0; f < N && rolls[i] != null; f++) {
    if (rolls[i] === 10) { sc += 10 + (rolls[i + 1] || 0) + (rolls[i + 2] || 0); i++; }
    else { const two = rolls[i] + (rolls[i + 1] || 0); sc += two === 10 ? 10 + (rolls[i + 2] || 0) : two; i += 2; }
  }
  return sc;
}
// 점수판 칸에 적을 글자들: 프레임마다 ["X"] 또는 ["7","/"] …
function marks(rolls, N) {
  const out = []; let i = 0;
  for (let f = 0; f < N; f++) {
    const m = [];
    if (f < N - 1) {
      if (rolls[i] === 10) { m.push("X"); i++; }
      else { if (rolls[i] != null) m.push(rolls[i] || "-"); if (rolls[i + 1] != null) m.push(rolls[i] + rolls[i + 1] === 10 ? "/" : rolls[i + 1] || "-"); i += 2; }
    } else {
      for (let k = 0; k < 3 && rolls[i + k] != null; k++) {
        const r = rolls[i + k], prev = rolls[i + k - 1];
        m.push(r === 10 && (k === 0 || prev === 10 || (k === 2 && rolls[i] + rolls[i + 1] === 10)) ? "X" : k > 0 && prev !== 10 && prev + r === 10 && !(k === 2 && rolls[i] + rolls[i + 1] === 10) ? "/" : r || "-");
      }
    }
    out.push(m);
  }
  return out;
}

function say(s, text) { s.note = text; s.nt = 0; }

function throwBall(s) {
  const a = s.aim, len = Math.hypot(a.ax, a.ay) || 1, v = 8.5 + (Math.min(len, MAXP) / MAXP) * 6.5;
  s.ball = { x: BX, y: a.y, vx: (a.ax / len) * v, vy: (a.ay / len) * v, gut: 0 };
  s.before = standing(s); s.ph = 1; s.tm = 0; s.rc++;
}

function collide(a, ma, ra, b, mb, rb, s) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d >= ra + rb || d < 0.001) return;
  const jit = (Math.random() - 0.5) * JIT, cs = Math.cos(jit), sn = Math.sin(jit);      // 핀은 조금씩 제멋대로 튄다
  const nx = (dx / d) * cs - (dy / d) * sn, ny = (dx / d) * sn + (dy / d) * cs, ov = ra + rb - d, wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x -= nx * ov * wa; a.y -= ny * ov * wa; b.x += nx * ov * wb; b.y += ny * ov * wb;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const j = (-(1 + 0.6) * rel) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny; b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
    if (rel < -1) s.hc++;
  }
}

// 한 틱 굴리기. 다 멈췄으면 true
function roll(s) {
  const b = s.ball;
  for (let sub = 0; sub < 2; sub++) {
    b.x += b.vx / 2; b.y += b.vy / 2;
    if (!b.gut && (b.y < LY0 + BRD - 4 || b.y > LY1 - BRD + 4)) { b.gut = b.y < CY ? -1 : 1; if (b.x < HEAD - 30) s.gc++; }      // 도랑에 빠짐
    if (b.gut) { b.y += ((b.gut < 0 ? LY0 - GUT / 2 : LY1 + GUT / 2) - b.y) * 0.3; b.vy = 0; }
    for (const q of s.pins) {
      if (q.gone) continue;
      q.x += q.vx / 2; q.y += q.vy / 2;
      if (!b.gut) collide(b, 3, BRD, q, 1, PRD, s);
    }
    for (let i = 0; i < s.pins.length; i++) for (let j = i + 1; j < s.pins.length; j++) { const a = s.pins[i], c = s.pins[j]; if (!a.gone && !c.gone) collide(a, 1, PRD, c, 1, PRD, s); }
  }
  let moving = false;
  s.pins.forEach((q, i) => {
    if (q.gone) return;
    q.vx *= 0.925; q.vy *= 0.925;
    if (q.up && Math.hypot(q.x - SPOTS[i][0], q.y - SPOTS[i][1]) > 9) { q.up = 0; s.kc++; }      // 자리에서 밀리면 쓰러진 것
    if (q.x > LX1 + 30 || q.y < LY0 - 4 || q.y > LY1 + 4) { q.gone = 1; if (q.up) { q.up = 0; s.kc++; } return; }
    if (Math.hypot(q.vx, q.vy) > 0.12) moving = true; else { q.vx = 0; q.vy = 0; }
  });
  b.vx *= 0.998;
  s.tm++;
  return (b.x > LX1 + 60 || Math.hypot(b.vx, b.vy) < 0.3) && (!moving || s.tm > 420) || s.tm > 520;
}

function settle(s) {
  const p = s.pl[s.turn], k = s.before - standing(s), N = s.N, last = p.fr === N - 1;
  p.rolls.push(k);
  const left = standing(s);
  let frameDone = false, reset = false;
  if (!last) {
    if (p.bl === 0 && left === 0) { frameDone = true; say(s, "스트라이크!"); s.xc++; }
    else if (p.bl === 0) { p.bl = 1; say(s, k ? k + "개!" : s.ball.gut ? "도랑~" : "아깝다!"); }
    else { frameDone = true; if (left === 0) { say(s, "스페어!"); s.xc++; } else say(s, k ? k + "개!" : s.ball.gut ? "도랑~" : "아깝다!"); }
  } else {
    const r = p.rolls, i0 = r.length - 1 - p.bl, first = r[i0];
    if (p.bl === 0) { if (left === 0) { reset = true; say(s, "스트라이크!"); s.xc++; } p.bl = 1; }
    else if (p.bl === 1) {
      if (first === 10) { if (left === 0) { reset = true; say(s, "스트라이크!"); s.xc++; } p.bl = 2; }
      else if (left === 0) { reset = true; say(s, "스페어!"); s.xc++; p.bl = 2; }
      else frameDone = true;
    } else { frameDone = true; if (left === 0) { say(s, "스트라이크!"); s.xc++; } }
  }
  if (frameDone) { p.fr++; p.bl = 0; if (p.fr >= N) p.done = 1; }
  s.ph = 2; s.tm = 0; s.next = { frameDone, reset };
}

function advance(s) {
  const { frameDone, reset } = s.next;
  if (frameDone) {
    if (s.pl.every((p) => p.done)) {
      let w = 0, tie = false; const sc = s.pl.map((p) => total(p.rolls, s.N));
      sc.forEach((v, i) => { if (v > sc[w]) { w = i; tie = false; } else if (i !== w && v === sc[w]) tie = true; });
      s.over = { w: tie && s.pl.length > 1 ? -1 : w, t: 0 }; return;
    }
    do { s.turn = (s.turn + 1) % s.pl.length; } while (s.pl[s.turn].done);
    s.pins = rack();
  } else if (reset) s.pins = rack();
  else s.pins.forEach((q, i) => { if (q.up) { q.x = SPOTS[i][0]; q.y = SPOTS[i][1]; q.vx = 0; q.vy = 0; } else q.gone = 1; });      // 쓰러진 핀 치우기
  s.ball = { x: BX, y: CY, vx: 0, vy: 0, gut: 0 };
  s.aim = { y: CY, ka: 0, ax: MAXP * 0.8, ay: 0, pp: 0, pa: 0 };
  s.ph = 0; s.tl = TURN; s.tn++;
}

function step(s, masks, aims) {
  s.tick++; s.nt++;
  if (s.over) { s.over.t++; return; }
  if (s.tick < START) return;
  if (s.ph === 0) {
    const a = s.aim, m = masks[s.turn] | 0, aim = aims && aims[s.turn];
    if (m & U) a.y -= 2.2;
    if (m & D) a.y += 2.2;
    if (m & L) a.ka = Math.max(-14, a.ka - 0.25);
    if (m & R) a.ka = Math.min(14, a.ka + 0.25);
    let go = false;
    if (m & P && aim) {
      if (!a.pp && aim.sy != null) a.y = aim.sy;                      // 누른 높이에서 굴린다
      const len = Math.hypot(aim.x, aim.y), k = len > MAXP ? MAXP / len : 1;
      a.ax = Math.max(8, aim.x * k); a.ay = clamp(aim.y * k, -a.ax * 0.3, a.ax * 0.3); a.pp = 1;
    } else {
      if (a.pp) { a.pp = 0; if (Math.hypot(a.ax, a.ay) > 14) go = true; }
      if (!go) { const r = (a.ka * Math.PI) / 180; a.ax = Math.cos(r) * MAXP * 0.85; a.ay = Math.sin(r) * MAXP * 0.85; }
    }
    a.y = clamp(a.y, LY0 + BRD + 2, LY1 - BRD - 2);
    if (m & A && !a.pa) go = true;
    a.pa = m & A ? 1 : 0;
    if (go || --s.tl <= 0) throwBall(s);
  } else if (s.ph === 1) { if (roll(s)) settle(s); }
  else if (++s.tm > 70) advance(s);
}

// ── 봇 ──
const ERR = { easy: [32, 8.5], normal: [16, 4.4], hard: [5, 1.5] };
function bot(s, i, mem, level) {
  if (s.over || s.tick < START || s.ph !== 0 || s.turn !== i) { mem.tn = -1; return 0; }
  if (mem.tn !== s.tn) {
    mem.tn = s.tn; mem.t = 0;
    const up = s.pins.filter((q) => q.up), e = ERR[level] || ERR.normal;
    let tx = HEAD, tyy = CY + 7;                                       // 첫 공은 1번 핀 살짝 옆(포켓)
    if (up.length < 10 && up.length) { tx = Math.min(...up.map((q) => q.x)); const front = up.filter((q) => q.x < tx + 14); tyy = front.reduce((a, q) => a + q.y, 0) / front.length; }
    const sy = clamp(CY + (tyy - CY) * 0.5 + (Math.random() - 0.5) * 2 * e[0], LY0 + BRD + 4, LY1 - BRD - 4);
    const ang = Math.atan2(tyy - sy, tx - BX) + ((Math.random() - 0.5) * 2 * e[1] * Math.PI) / 180;
    mem.plan = { sy, x: Math.cos(ang) * MAXP * 0.9, y: Math.sin(ang) * MAXP * 0.9 };
  }
  mem.t++;
  const pl = mem.plan;
  if (mem.t < 40) return 0;
  if (mem.t < 70) { const k = Math.min(1, (mem.t - 40) / 20); return { m: P, x: pl.x * k, y: pl.y * k, sx: BX, sy: pl.sy }; }
  return { m: 0, x: pl.x, y: pl.y, sx: BX, sy: pl.sy };
}

// ── 그리기 ──
const stage = lazy3d("./table3d.js?v=2");
function draw(ctx, v, env) {
  const th = LANES[v.th | 0] || LANES[0];
  const scr = ctx, m3 = stage.get();
  let g3 = null;
  if (m3) { try { g3 = m3.open("bowl", { rect: [20, 214, 940, 486], unit: 19.4, sky: th.dark ? "night" : "dusk", cam: { fov: 36, y: 8.4, z: 13.4, look: -3.4 }, touch: env.touch, t: env.t }); ctx = g3.board; } catch { g3 = null; stage.fail(); } }
  const ink = th.dark ? "#fff" : "#2b2d6e";
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  // 레인
  ctx.fillStyle = th.gut; rr(ctx, LX0 - 8, LY0 - GUT - 6, LX1 - LX0 + 60, LY1 - LY0 + GUT * 2 + 12, 12); ctx.fill();
  for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? th.wood : th.wood2; ctx.fillRect(LX0, LY0 + (k * (LY1 - LY0)) / 8, LX1 - LX0, (LY1 - LY0) / 8 + 1); }
  ctx.fillStyle = th.line;
  for (let k = 0; k < 7; k++) { const y = LY0 + ((k + 1) * (LY1 - LY0)) / 8, x = 330 + Math.abs(k - 3) * -22 + 66; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 5); ctx.fill(); }
  ctx.fillRect(BX + 40, LY0, 3, LY1 - LY0);
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(LX1, LY0 - GUT, 52, LY1 - LY0 + GUT * 2);
  // 핀
  v.pins.forEach((q, i) => {
    if (q.gone) return;
    const old = env.prev && env.prev.pins[i], x = old && !old.gone ? old.x + (q.x - old.x) * env.alpha : q.x, y = old && !old.gone ? old.y + (q.y - old.y) * env.alpha : q.y;
    if (g3) { try { g3.pin(i, x, y, { r: PRD, up: !!q.up, ang: i * 2.4 }); } catch { stage.fail(); } return; }
    ctx.globalAlpha = q.up ? 1 : 0.55;
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 3, PRD, PRD * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, PRD, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, PRD - 4, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  });
  // 공(차례인 사람의 떡)과 조준선
  const turn = v.turn, look = parseLook(v.seats[turn].look, turn), aiming = v.ph === 0 && v.tick >= START && !v.over;
  if (aiming) {
    const a = v.aim, len = Math.hypot(a.ax, a.ay) || 1, ux = a.ax / len, uy = a.ay / len;
    ctx.strokeStyle = th.dark ? "rgba(255,255,255,.7)" : "rgba(43,45,110,.55)"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.setLineDash([3, 12]);
    ctx.beginPath(); ctx.moveTo(BX + ux * 26, a.y + uy * 26); ctx.lineTo(BX + ux * (60 + len * 2.6), a.y + uy * (60 + len * 2.6)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,253,246,.9)"; rr(ctx, 40, LY0, 14, LY1 - LY0, 7); ctx.fill();      // 세기 막대
    const hh = ((LY1 - LY0 - 6) * Math.min(len, MAXP)) / MAXP; ctx.fillStyle = "#ff5d73"; rr(ctx, 43, LY1 - 3 - hh, 8, hh, 4); ctx.fill();
  }
  if (!v.over && (v.ph !== 1 || v.ball.x < LX1 + 30)) {
    const b = v.ph === 0 ? { x: BX - (v.aim.pp ? v.aim.ax * 0.25 : 0), y: v.aim.y - (v.aim.pp ? v.aim.ay * 0.25 : 0) } : v.ball, old = v.ph === 1 && env.prev && env.prev.ball;
    const x = old ? old.x + (b.x - old.x) * env.alpha : b.x, y = old ? old.y + (b.y - old.y) * env.alpha : b.y;
    if (g3) { try { g3.mochi("ball", look, x, y, { r: BRD + 3, face: 0 }); } catch { stage.fail(); } } else {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 5, BRD, BRD * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = bodyColors(look).dark; ctx.beginPath(); ctx.arc(x, y, BRD + 2, 0, 7); ctx.fill();
    drawMochi(ctx, x, y + 1, BRD - 1, look, { ang: 0, open: v.ph === 1 });
    }
  }
  if (g3) { ctx = scr; try { g3.cheer = !!v.over; ctx.drawImage(g3.close(), 0, 0, W, H); } catch { stage.fail(); } }
  // 점수판
  const n = v.seats.length, rowH = n > 2 ? 44 : 54, cw = v.N === 10 ? 62 : 104, x0 = 250;
  v.seats.forEach((seat, i) => {
    const y = 10 + i * (rowH + 4), p = v.pl[i], on = i === turn && !v.over, mk = marks(p.rolls, v.N);
    ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = on ? "#ff5d73" : SEAT_DARK[i]; ctx.lineWidth = on ? 4 : 2.5;
    rr(ctx, 20, y, W - 40, rowH, 12); ctx.fill(); ctx.stroke();
    drawMochi(ctx, 46, y + rowH / 2 + 2, Math.min(17, rowH / 2 - 6), parseLook(seat.look, i));
    label(ctx, seat.name, 70, y + rowH / 2 + 6, 17, i === env.me ? "#d6336c" : "#2b2d6e", null, "left");
    for (let f = 0; f < v.N; f++) {
      const x = x0 + f * cw;
      ctx.fillStyle = f === p.fr && on ? "#fff1b8" : "#f4eedd"; rr(ctx, x, y + 6, cw - 6, rowH - 12, 7); ctx.fill();
      label(ctx, String(f + 1), x + 5, y + 19, 10, "#8f93b8", null, "left");
      label(ctx, (mk[f] || []).join(" "), x + (cw - 6) / 2 + 4, y + rowH / 2 + 8, n > 2 ? 17 : 20, "#2b2d6e", null);
    }
    label(ctx, String(total(p.rolls, v.N)), W - 40, y + rowH / 2 + 10, 26, "#ff5d73", null, "right");
  });
  if (v.tick < START) label(ctx, "준비!", W / 2, CY + 20, 70, "#ff5d73", "#fff");
  else if (aiming) {
    label(ctx, `${v.seats[turn].name} 차례 · ${Math.ceil(v.tl / 60)}초`, W / 2, LY1 + 52, 19, turn === env.me ? "#d6336c" : ink, th.dark ? null : "rgba(255,255,255,.9)");
    if (turn === env.me) label(ctx, env.touch ? "굴릴 높이를 누르고 뒤로 끌었다 놓아요. 멀리 끌수록 세게" : "누른 높이에서 뒤로 끌었다 놓기 · 키보드: ↑↓ 위치, ←→ 방향, 스페이스", W / 2, H - 12, 16, ink, th.dark ? null : "rgba(255,255,255,.9)");
  }
  if (v.note && v.nt < 80 && !v.over) label(ctx, v.note, W / 2, CY + 16, v.note.length < 6 ? 62 : 44, /스트|스페/.test(v.note) ? "#ffc93c" : "#fff", "#2b2d6e");
  label(ctx, th.name, W - 14, H - 12, 13, ink, null, "right");
  if (v.over) { const w = v.over.w; label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, CY + 20, 70, "#ffc93c", "#2b2d6e"); }
}

function fx(v, m, snd, me) {
  if (m.rc == null) Object.assign(m, { rc: v.rc, hc: v.hc, kc: v.kc, gc: v.gc, xc: v.xc, tn: -1, ov: !!v.over });
  if (v.rc !== m.rc) { m.rc = v.rc; snd.noise(1.1, 0.07, "lowpass", 260, 1); }       // 구르는 소리
  if (v.kc !== m.kc) { m.kc = v.kc; snd.wood(1.2); snd.clack(0.8); }
  else if (v.hc !== m.hc) snd.clack(0.5);
  m.hc = v.hc;
  if (v.gc !== m.gc) { m.gc = v.gc; snd.thud(0.8); }
  if (v.xc !== m.xc) { m.xc = v.xc; snd.cheer(); jingle(snd, [659, 784, 1047, 1319], 90); }
  if (v.tn !== m.tn) { m.tn = v.tn; if (v.turn === me && v.tick >= START) snd(880, 0.1, "triangle", 0.08); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
}

function title(v, me) {
  const w = v.over.w;
  if (v.seats.length === 1) return `${total(v.pl[0].rolls, v.N)}점! 한 판 더?`;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${v.seats[w].name} 승리! 한 판 더?`;
  return w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 2, action: null, overDelay: 220, pointer: true, pointerStart: true, noPad: true,
  bots: { solo: 1, local: 0 },
  fill: (mode, n) => (n < 2 ? 1 : 0),
  init, step, bot, draw, fx, title, dispose: () => stage.dispose(),
  mapPointer: (x, y) => { const m = stage.get(); return m ? m.pick(x, y) : [x, y]; },
};

export const meta = {
  local: true,
  soloText: "봇과 번갈아 굴려 점수 겨루기. 길이와 난이도를 골라 주세요.",
  modeLabel: "경기 길이",
  modes: [[0, "5프레임"], [10, "10프레임"]],
  soloModes: [[0, "5프레임"], [10, "10프레임"]],
  role: () => "",
  hint: (n, mode) => `${mode === 10 ? 10 : 5}프레임 · ` + (n === 1 ? "혼자 시작하면 봇과 겨뤄요." : `${n}명이 번갈아 굴려요.`),
  howto: [
    ["목표", "공을 굴려 핀 열 개를 쓰러뜨려요. 한 프레임에 두 번 굴리고, 점수가 가장 높으면 승리"],
    ["점수", "한 번에 다 쓰러뜨리면 스트라이크(X): 10점 + 다음 두 번 점수. 두 번에 다 쓰러뜨리면 스페어(/): 10점 + 다음 한 번 점수"],
    ["조작", "굴리고 싶은 높이를 누른 채 뒤로 끌었다가 놓아요. 끄는 방향 반대로, 멀리 끌수록 세게 굴러가요"],
    ["키보드", "↑↓ 굴릴 위치, ←→ 방향, 스페이스 굴리기"],
    ["요령", "가운데 맨 앞 핀의 살짝 옆을 맞히면 스트라이크가 잘 나와요. 레인 밖 도랑에 빠지면 0점"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
