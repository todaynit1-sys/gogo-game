// 새총 무너뜨리기 — 번갈아 새총으로 몸을 날려 성을 무너뜨리고 도깨비를 잡는다.
// 세 판 동안 점수를 가장 많이 낸 사람이 승리.

import { startHostGame, L, R, U, D, A, P } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle, SEAT_DARK } from "./kit.js?v=1";

const W = 960, H = 540, GY = 470, SX = 150, SY = 372, CS = 34, NCc = 10, NR = 9, X0 = 560, BRD = 14;
const GRAV = 0.16, START = 100, TURN = 25 * 60, ROUNDS = 3, SHOTS = 3, MAXPULL = 110, VK = 13.5 / MAXPULL;
const rnd = (n) => (Math.random() * n) | 0;
const cellAt = (g, c, r) => g[r * NCc + c];
const setCell = (s, c, r, ch) => { const i = r * NCc + c; s.g = s.g.slice(0, i) + ch + s.g.slice(i + 1); };

function makeLevel() {
  for (;;) {
    const g = new Array(NCc * NR).fill("0"), hs = []; let h = 3 + rnd(3);
    for (let c = 0; c < NCc; c++) { h = Math.max(2, Math.min(6, h + rnd(3) - 1)); hs.push(c > 0 && c < NCc - 1 && Math.random() < 0.14 ? 0 : h); }
    for (let c = 0; c < NCc; c++) for (let r = 0; r < hs[c]; r++) g[r * NCc + c] = r === 0 ? (Math.random() < 0.5 ? "s" : "w") : Math.random() < 0.2 ? "g" : Math.random() < 0.18 ? "s" : "w";
    const cols = [...Array(NCc).keys()].filter((c) => hs[c] > 0).sort(() => Math.random() - 0.5).slice(0, 5);
    for (const c of cols) { if (Math.random() < 0.6) g[hs[c] * NCc + c] = "t"; else g[(1 + rnd(hs[c] - 1)) * NCc + c] = "t"; }
    if (g.filter((x) => x === "t").length >= 4) return g.join("");
  }
}

function init(seats) {
  return { tick: 0, seats, g: makeLevel(), p: seats.map(() => ({ sc: 0, sh: SHOTS, ka: 40, kp: 85, ax: 0, ay: 0, pp: 0, pa: 0 })), turn: 0, ph: 0, tl: TURN, tm: 0, rd: 1, shot: null, over: null, pop: [], fc: 0, hc: 0, tc: 0, tn: 0 };
}

function score(s, v, c, r) {
  s.p[s.shot ? s.shot.o : s.turn].sc += v;
  s.pop.push({ x: X0 + (c + 0.5) * CS, y: GY - (r + 0.5) * CS, v, t: 0 });
  if (s.pop.length > 8) s.pop.shift();
}

// 빈자리가 생기면 위의 것들이 내려앉는다. 두 칸 넘게 떨어진 도깨비·유리는 깨지고, 떨어진 블록에 깔린 도깨비도 잡힌다.
function collapse(s) {
  for (let c = 0; c < NCc; c++) {
    const stack = []; let moved = false;
    for (let r = 0; r < NR; r++) {
      const ch = cellAt(s.g, c, r);
      if (ch === "0") continue;
      const fell = r - stack.length;
      if (fell > 0) {
        moved = true;
        if (ch === "t" && fell >= 2) { score(s, 100, c, stack.length); s.tc++; continue; }
        if (ch === "g" && fell >= 2) { score(s, 10, c, stack.length); s.hc++; continue; }
        if (ch !== "t" && stack.length && stack[stack.length - 1] === "t") { stack.pop(); score(s, 100, c, stack.length); s.tc++; }
      }
      stack.push(ch);
    }
    if (moved) for (let r = 0; r < NR; r++) setCell(s, c, r, stack[r] || "0");
  }
}

function launch(s, ax, ay) {
  const p = s.p[s.turn];
  s.shot = { x: SX, y: SY, vx: ax * VK, vy: ay * VK, age: 0, o: s.turn };
  p.sh--; s.ph = 1; s.fc++;
}

function endShot(s) { s.shot = null; s.ph = 2; s.tm = 45; }

function flyTick(s) {
  const b = s.shot;
  for (let sub = 0; sub < 2; sub++) {
    b.vy += GRAV * 0.5; b.x += b.vx * 0.5; b.y += b.vy * 0.5;
    if (b.y > GY - BRD) {
      b.y = GY - BRD;
      if (Math.abs(b.vy) > 1.2) { b.vy = -b.vy * 0.38; b.vx *= 0.8; } else { b.vy = 0; b.vx *= 0.92; }
    }
    const c0 = Math.floor((b.x - BRD - X0) / CS), c1 = Math.floor((b.x + BRD - X0) / CS);
    const r0 = Math.floor((GY - (b.y + BRD)) / CS), r1 = Math.floor((GY - (b.y - BRD)) / CS);
    let removed = false;
    for (let c = Math.max(0, c0); c <= Math.min(NCc - 1, c1); c++) for (let r = Math.max(0, r0); r <= Math.min(NR - 1, r1); r++) {
      const ch = cellAt(s.g, c, r);
      if (ch === "0") continue;
      const x = X0 + c * CS, y = GY - (r + 1) * CS;
      const nx = Math.max(x, Math.min(b.x, x + CS)), ny = Math.max(y, Math.min(b.y, y + CS));
      let dx = b.x - nx, dy = b.y - ny, d = Math.hypot(dx, dy);
      if (d >= BRD) continue;
      const sp = Math.hypot(b.vx, b.vy);
      const smash = (pts, keep) => { setCell(s, c, r, "0"); score(s, pts, c, r); b.vx *= keep; b.vy *= keep; removed = true; };
      if (ch === "t") { smash(100, 0.85); s.tc++; continue; }
      if (ch === "g" && sp > 1.5) { smash(10, 0.85); s.hc++; continue; }
      if (ch === "w" && sp >= 5) { smash(10, 0.55); s.hc++; continue; }
      if (ch === "d" && sp >= 5) { smash(20, 0.4); s.hc++; continue; }
      if (ch === "s" && sp >= 8) { setCell(s, c, r, "d"); s.hc++; }      // 돌은 한 번에 안 깨지고 금이 간다
      if (d < 0.001) { dx = b.vx > 0 ? -1 : 1; dy = 0; d = 1; }
      const ux = dx / d, uy = dy / d, vn = b.vx * ux + b.vy * uy;
      b.x = nx + ux * BRD; b.y = ny + uy * BRD;
      if (vn < 0) { b.vx -= 1.35 * vn * ux; b.vy -= 1.35 * vn * uy; b.vx *= 0.9; b.vy *= 0.9; }
    }
    if (removed) collapse(s);
  }
  b.age++;
  if (b.x > W + 40 || b.x < -40 || b.age > 420 || (b.y >= GY - BRD - 0.5 && Math.hypot(b.vx, b.vy) < 0.5)) endShot(s);
}

function advance(s) {
  const n = s.p.length;
  if (!s.g.includes("t") || !s.p.some((p) => p.sh > 0)) {
    if (s.rd >= ROUNDS) {
      let w = 0, tie = false;
      s.p.forEach((p, i) => { if (p.sc > s.p[w].sc) { w = i; tie = false; } else if (i !== w && p.sc === s.p[w].sc) tie = true; });
      s.over = { w: tie ? -1 : w, t: 0 }; return;
    }
    s.rd++; s.g = makeLevel(); s.turn = (s.rd - 1) % n;
    for (const p of s.p) p.sh = SHOTS;
    s.ph = 3; s.tm = 90; return;
  }
  do { s.turn = (s.turn + 1) % n; } while (s.p[s.turn].sh <= 0);
  s.ph = 0; s.tl = TURN; s.tn++;
}

function step(s, masks, aims) {
  s.tick++;
  for (const q of s.pop) q.t++;
  if (s.over) { s.over.t++; return; }
  if (s.tick < START) return;
  if (s.ph === 0) {
    const p = s.p[s.turn], m = masks[s.turn] | 0, aim = aims && aims[s.turn];
    if (m & U) p.ka = Math.min(85, p.ka + 0.8);
    if (m & D) p.ka = Math.max(5, p.ka - 0.8);
    if (m & R) p.kp = Math.min(MAXPULL, p.kp + 1);
    if (m & L) p.kp = Math.max(25, p.kp - 1);
    let go = false;
    if (m & P && aim) {
      const len = Math.hypot(aim.x, aim.y), k = len > MAXPULL ? MAXPULL / len : 1;
      p.ax = Math.round(aim.x * k); p.ay = Math.round(aim.y * k); p.pp = 1;
    } else {
      if (p.pp) { p.pp = 0; if (Math.hypot(p.ax, p.ay) > 14 && p.ax > 4) go = true; }      // 끌었다 놓으면 발사
      if (!go) { const r = (p.ka * Math.PI) / 180; p.ax = Math.round(Math.cos(r) * p.kp); p.ay = Math.round(-Math.sin(r) * p.kp); }
    }
    if (m & A && !p.pa && p.ax > 4) go = true;
    p.pa = m & A ? 1 : 0;
    if (go) launch(s, p.ax, p.ay);
    else if (--s.tl <= 0) { p.sh--; s.ph = 2; s.tm = 20; }
  } else if (s.ph === 1) flyTick(s);
  else if (s.ph === 2) { if (--s.tm <= 0) advance(s); }
  else if (--s.tm <= 0) { s.ph = 0; s.tl = TURN; s.tn++; }
}

// ── 봇: 여러 번 쏴 보고 점수가 잘 나오는 조준을 고른다 ──
const TRIES = { easy: 10, normal: 36, hard: 90 };

function tryShot(s, ax, ay) {
  const c = { g: s.g, p: [{ sc: 0, sh: 9 }], turn: 0, shot: null, pop: [], ph: 1, tm: 0, fc: 0, hc: 0, tc: 0 };
  launch(c, ax, ay);
  for (let k = 0; k < 450 && c.shot; k++) flyTick(c);
  return c.p[0].sc;
}

function bot(s, i, mem, level) {
  if (s.over || s.tick < START || s.ph !== 0 || s.turn !== i) { mem.tn = -1; return 0; }
  if (mem.tn !== s.tn) {
    mem.tn = s.tn; mem.t = 0;
    let best = null;
    for (let k = 0; k < (TRIES[level] || TRIES.normal); k++) {
      const a = ((12 + Math.random() * 62) * Math.PI) / 180, pw = 50 + Math.random() * 60;
      const ax = Math.round(Math.cos(a) * pw), ay = Math.round(-Math.sin(a) * pw), sc = tryShot(s, ax, ay) + Math.random() * 5;
      if (!best || sc > best.sc) best = { sc, ax, ay };
    }
    mem.plan = best;
  }
  mem.t++;
  const { ax, ay } = mem.plan;
  if (mem.t < 50) return 0;
  if (mem.t < 85) { const k = Math.min(1, (mem.t - 50) / 22); return { m: P, x: Math.round(ax * k), y: Math.round(ay * k) }; }
  return { m: 0, x: ax, y: ay };
}

// ── 그리기 ──
function drawCell(ctx, ch, x, y, t) {
  if (ch === "w") {
    ctx.fillStyle = "#b9803f"; rr(ctx, x + 1, y + 1, CS - 2, CS - 2, 5); ctx.fill();
    ctx.fillStyle = "#e0ab68"; rr(ctx, x + 4, y + 3, CS - 8, CS - 9, 3); ctx.fill();
    ctx.strokeStyle = "rgba(150,95,40,.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 7, y + 12); ctx.lineTo(x + CS - 7, y + 12); ctx.moveTo(x + 7, y + 21); ctx.lineTo(x + CS - 9, y + 21); ctx.stroke();
  } else if (ch === "s" || ch === "d") {
    ctx.fillStyle = "#6b7196"; rr(ctx, x + 1, y + 1, CS - 2, CS - 2, 5); ctx.fill();
    ctx.fillStyle = "#a3a8c8"; rr(ctx, x + 4, y + 3, CS - 8, CS - 9, 3); ctx.fill();
    if (ch === "d") { ctx.strokeStyle = "#3d4268"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + 8, y + 5); ctx.lineTo(x + 17, y + 15); ctx.lineTo(x + 12, y + 22); ctx.lineTo(x + 24, y + 30); ctx.moveTo(x + 17, y + 15); ctx.lineTo(x + 27, y + 11); ctx.stroke(); }
  } else if (ch === "g") {
    ctx.fillStyle = "rgba(170,225,255,.75)"; ctx.strokeStyle = "#6fb6e6"; ctx.lineWidth = 2.5; rr(ctx, x + 2, y + 2, CS - 4, CS - 4, 5); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 8, y + 20); ctx.lineTo(x + 18, y + 8); ctx.stroke();
  } else if (ch === "t") {
    // 도깨비
    const cx = x + CS / 2, cy = y + CS / 2 + 2 + Math.sin(t * 5 + x) * 1.2;
    ctx.fillStyle = "#7a55c9"; ctx.beginPath(); ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx - 12, cy - 18); ctx.lineTo(cx - 3, cy - 12); ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx + 12, cy - 18); ctx.lineTo(cx + 3, cy - 12); ctx.fill();
    ctx.fillStyle = "#9b78e6"; ctx.strokeStyle = "#5a3aa6"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx - 5, cy - 2, 4, 0, 7); ctx.arc(cx + 5, cy - 2, 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a2440"; ctx.beginPath(); ctx.arc(cx - 6, cy - 2, 1.8, 0, 7); ctx.arc(cx + 4, cy - 2, 1.8, 0, 7); ctx.fill();
    ctx.strokeStyle = "#2a2440"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy + 8, 4, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  }
}

function draw(ctx, v, env) {
  const g = ctx.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, "#8fd3ff"); g.addColorStop(1, "#fff1cf");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(110, 84, 40, 0, 7); ctx.fill();
  ctx.fillStyle = "#bfe6a8"; ctx.beginPath(); ctx.ellipse(300, GY + 30, 380, 110, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#a6d992"; ctx.beginPath(); ctx.ellipse(800, GY + 40, 360, 130, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#8ccf6a"; ctx.fillRect(0, GY, W, H - GY);
  ctx.fillStyle = "#6fb651"; ctx.fillRect(0, GY, W, 7);
  // 성
  for (let r = 0; r < NR; r++) for (let c = 0; c < NCc; c++) { const ch = cellAt(v.g, c, r); if (ch !== "0") drawCell(ctx, ch, X0 + c * CS, GY - (r + 1) * CS, env.t); }

  const aiming = v.ph === 0 && v.tick >= START && !v.over, p = v.p[v.turn];
  const px = aiming ? SX - p.ax * 0.5 : SX, py = aiming ? SY - p.ay * 0.5 : SY;
  // 새총
  ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 11; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(SX, GY); ctx.lineTo(SX, SY + 26); ctx.lineTo(SX - 16, SY - 8); ctx.moveTo(SX, SY + 26); ctx.lineTo(SX + 16, SY - 8); ctx.stroke();
  if (aiming) {
    ctx.strokeStyle = "#5a3323"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(SX - 16, SY - 8); ctx.lineTo(px, py); ctx.lineTo(SX + 16, SY - 8); ctx.stroke();
    // 날아갈 길 미리보기
    let x = SX, y = SY, vx = p.ax * VK, vy = p.ay * VK;
    ctx.fillStyle = "rgba(43,45,110,.5)";
    for (let k = 0; k < 36; k++) { vy += GRAV; x += vx; y += vy; if (k % 3 === 2) { ctx.beginPath(); ctx.arc(x, y, 3.4 - k * 0.05, 0, 7); ctx.fill(); } }
  }
  // 기다리는 선수들
  v.seats.forEach((seat, i) => {
    if (i === v.turn && !v.over) return;
    drawMochi(ctx, 36 + i * 30, GY - 15, 14, parseLook(seat.look, i));
  });
  // 날아가는(또는 새총에 걸린) 선수
  if (!v.over) {
    const look = parseLook(v.seats[v.turn].look, v.turn);
    if (v.shot) {
      const q = env.prev && env.prev.shot, x = q ? q.x + (v.shot.x - q.x) * env.alpha : v.shot.x, y = q ? q.y + (v.shot.y - q.y) * env.alpha : v.shot.y;
      drawMochi(ctx, x, y, BRD, look, { ang: Math.atan2(v.shot.vy, v.shot.vx), open: true });
    } else if (v.ph === 0) drawMochi(ctx, px, py, BRD, look, { ang: Math.atan2(p.ay, p.ax), sq: aiming ? -0.08 : 0 });
  }
  // 점수 팝업
  for (const q of v.pop) if (q.t < 60) label(ctx, "+" + q.v, q.x, q.y - q.t * 0.7, q.v >= 100 ? 24 : 16, q.v >= 100 ? "#ff5d73" : "#2b2d6e", "#fff");
  // 점수판
  const n = v.seats.length, cw = 168, x0 = (W - n * cw) / 2;
  v.seats.forEach((seat, i) => {
    const x = x0 + i * cw, q = v.p[i], on = i === v.turn && !v.over;
    ctx.fillStyle = "rgba(255,253,246,.94)"; ctx.strokeStyle = on ? "#ff5d73" : SEAT_DARK[i]; ctx.lineWidth = on ? 5 : 3;
    rr(ctx, x + 5, 8, cw - 10, 50, 13); ctx.fill(); ctx.stroke();
    label(ctx, seat.name, x + 14, 29, 15, i === env.me ? "#d6336c" : "#2b2d6e", null, "left");
    label(ctx, String(q.sc), x + cw - 14, 34, 22, "#2b2d6e", null, "right");
    for (let k = 0; k < SHOTS; k++) { ctx.fillStyle = k < q.sh ? "#ffc93c" : "rgba(43,45,110,.18)"; ctx.beginPath(); ctx.arc(x + 20 + k * 14, 45, 4.5, 0, 7); ctx.fill(); }
  });
  label(ctx, `${v.rd}번째 판 / ${ROUNDS}판`, W / 2, 82, 17, "#2b2d6e", "rgba(255,255,255,.9)");
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2 - 30, 80, "#ff5d73", "#fff");
  else if (v.ph === 3) label(ctx, `${v.rd}번째 판!`, W / 2, H / 2 - 30, 70, "#ff5d73", "#fff");
  else if (aiming) {
    label(ctx, `${v.seats[v.turn].name} 차례 · ${Math.ceil(v.tl / 60)}초`, SX + 40, SY - 120, 18, v.turn === env.me ? "#d6336c" : "#2a2440", "rgba(255,255,255,.9)");
    if (v.turn === env.me) label(ctx, "화면을 뒤로 끌었다 놓으면 발사 · 키보드: ↑↓ 각도, ←→ 힘, 스페이스", W / 2, H - 16, 17, "#2a2440", "rgba(255,255,255,.9)");
  }
  if (v.over) {
    const w = v.over.w;
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, H / 2 - 30, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd, me) {
  if (m.fc == null) Object.assign(m, { fc: v.fc, hc: v.hc, tc: v.tc, tn: -1, ov: !!v.over });
  if (v.fc !== m.fc) { m.fc = v.fc; snd(300, 0.25, "sine", 0.12, 500); }
  if (v.hc !== m.hc) { m.hc = v.hc; snd(180, 0.1, "square", 0.08, -90); }
  if (v.tc !== m.tc) { m.tc = v.tc; snd(700, 0.14, "triangle", 0.12, 500); }
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
  soloText: "봇과 번갈아 쏴서 점수 겨루기. 난이도를 골라 주세요.",
  modes: null,
  role: () => "",
  hint: (n) => (n === 1 ? "혼자 시작하면 봇과 겨뤄요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명이 번갈아 쏴요. 세 판 점수를 겨뤄요.`),
  howto: [
    ["목표", "새총으로 몸을 날려 성을 부수고 보라색 도깨비를 잡아요. 도깨비 100점, 블록 10~20점. 세 판 합계가 가장 높으면 승리"],
    ["조작", "화면을 뒤쪽(왼쪽 아래)으로 끌었다가 놓으면 발사. 키보드는 ↑↓ 각도, ←→ 힘, 스페이스 발사"],
    ["요령", "나무는 세게 맞혀야 부서지고, 돌은 두 번 맞혀야 깨져요. 밑을 빼면 위가 무너지면서 도깨비가 깔려요"],
    ["한 키보드 2인", "차례가 되면 같은 마우스(또는 키보드)로 번갈아 쏴요"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
