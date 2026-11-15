// 떡 축구 — 위에서 내려다보는 미니 축구. 몸으로 밀고, 차기 버튼으로 뻥 찬다.
// 2분 동안 골을 더 많이 넣은 팀이 승리(5골을 먼저 넣어도 끝).

import { startHostGame, L, R, U, D, A, B } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle } from "./kit.js?v=1";

const W = 960, H = 540, FX0 = 48, FX1 = 912, FY0 = 58, FY1 = 502, GY0 = 205, GY1 = 355, CX = W / 2, CY = (FY0 + FY1) / 2;
const PR = 20, BR = 12, TIME = 120 * 60, WIN_GOALS = 5, OVERTIME = 45 * 60;
const TEAM = ["#ff5d73", "#4d9be0"], TEAM_NAME = ["빨강 팀", "파랑 팀"];
const KICK_POS = [[-150, 0], [-320, -100]];
const FIELDS = [
  { name: "잔디 구장", out: "#2f8f4e", a: "#58b56a", b: "#4fab62", line: "rgba(255,255,255,.9)" },
  { name: "눈밭 구장", out: "#9fc4dd", a: "#f4fbff", b: "#e3f1fa", line: "rgba(77,155,224,.85)" },
  { name: "모래 구장", out: "#c9964f", a: "#f1d69a", b: "#e9c986", line: "rgba(255,255,255,.95)" },
  { name: "밤 구장", out: "#17203f", a: "#2c6a55", b: "#28604d", line: "rgba(255,255,255,.75)" },
];

function kickoff(s) {
  const cnt = [0, 0];
  s.p.forEach((p) => {
    const [dx, dy] = KICK_POS[cnt[p.team]++ % 2], sign = p.team === 0 ? 1 : -1;
    p.x = CX + dx * sign; p.y = CY + dy * sign; p.vx = 0; p.vy = 0; p.kc = 0; p.ds = 0;
  });
  Object.assign(s.b, { x: CX, y: CY, vx: 0, vy: 0 });
  s.ph = 0; s.tm = 80;
}

function init(seats) {
  const s = { tick: 0, seats, p: seats.map((_, i) => ({ x: 0, y: 0, vx: 0, vy: 0, kc: 0, pa: 0, ds: 0, dc: 0, pb: 0, dx: 0, dy: 0, team: i % 2 })), b: { x: CX, y: CY, vx: 0, vy: 0 }, sc: [0, 0], time: TIME, ot: 0, ph: 0, tm: 80, over: null, gk: 0, kk: 0, wk: 0, lg: 0, dk: 0, th: (Math.random() * FIELDS.length) | 0 };
  kickoff(s);
  return s;
}

function step(s, masks) {
  s.tick++;
  if (s.over) { s.over.t++; return; }
  const b = s.b;
  if (s.ph === 0) { if (--s.tm <= 0) s.ph = 1; return; }
  if (s.ph === 2) {
    b.x += b.vx; b.y += b.vy; b.vx *= 0.9; b.vy *= 0.9;
    if (--s.tm <= 0) {
      if (s.sc[0] >= WIN_GOALS || s.sc[1] >= WIN_GOALS || s.time <= 0) s.over = { w: s.sc[0] > s.sc[1] ? 0 : 1, t: 0 };
      else kickoff(s);
    }
    return;
  }
  if (s.time > 0) s.time--;
  else if (s.sc[0] !== s.sc[1]) { s.over = { w: s.sc[0] > s.sc[1] ? 0 : 1, t: 0 }; return; }
  else if (++s.ot > OVERTIME) { s.over = { w: -1, t: 0 }; return; }      // 동점이면 먼저 넣는 팀이 승리, 끝내 안 나면 무승부

  // 선수 (처리 순서를 무작위로 뒤집어 어느 팀도 유리하지 않게 한다)
  const n = s.p.length, flip = Math.random() < 0.5;
  for (let k = 0; k < n; k++) {
    const i = flip ? n - 1 - k : k, p = s.p[i], m = masks[i] | 0;
    let ax = (m & R ? 1 : 0) - (m & L ? 1 : 0), ay = (m & D ? 1 : 0) - (m & U ? 1 : 0);
    if (ax && ay) { ax *= 0.707; ay *= 0.707; }
    // 대시: 누른 방향으로 짧게 돌진 (쉬는 시간 있음)
    if (p.dc > 0) p.dc--;
    if (m & B && !p.pb && p.dc <= 0 && (ax || ay)) { p.ds = 9; p.dc = 110; p.dx = ax; p.dy = ay; s.dk++; }
    p.pb = m & B ? 1 : 0;
    if (p.ds > 0) { p.ds--; p.vx = p.dx * 9; p.vy = p.dy * 9; }
    else { p.vx = p.vx * 0.86 + ax * 0.56; p.vy = p.vy * 0.86 + ay * 0.56; }
    p.x += p.vx; p.y += p.vy;
    p.x = Math.max(FX0 + PR - 14, Math.min(FX1 - PR + 14, p.x)); p.y = Math.max(FY0 + PR - 10, Math.min(FY1 - PR + 10, p.y));
    if (p.kc > 0) p.kc--;
    if (m & A && !p.pa && p.kc <= 0) {
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      p.kc = 14;
      if (d < PR + BR + 11) { b.vx = (dx / d) * 9 + p.vx * 0.5; b.vy = (dy / d) * 9 + p.vy * 0.5; s.kk++; }
    }
    p.pa = m & A ? 1 : 0;
  }
  // 선수끼리 밀치기
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = s.p[flip ? n - 1 - i : i], c = s.p[flip ? n - 1 - j : j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d < PR * 2) { const k = (PR * 2 - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * k; a.y -= ny * k; c.x += nx * k; c.y += ny * k; }
  }
  // 공
  b.x += b.vx; b.y += b.vy; b.vx *= 0.987; b.vy *= 0.987;
  for (let k = 0; k < n; k++) {
    const p = s.p[flip ? n - 1 - k : k];
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d >= PR + BR) continue;
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * (PR + BR); b.y = p.y + ny * (PR + BR);
    const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
    const pw = p.ds > 0 ? 1.9 : 1.5;      // 대시로 들이받으면 더 세게 튄다
    if (vn < 0) { b.vx -= pw * vn * nx; b.vy -= pw * vn * ny; }
  }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 13) { b.vx *= 13 / sp; b.vy *= 13 / sp; }
  // 벽과 골
  if (b.y < FY0 + BR) { b.y = FY0 + BR; b.vy = Math.abs(b.vy) * 0.8; s.wk++; }
  if (b.y > FY1 - BR) { b.y = FY1 - BR; b.vy = -Math.abs(b.vy) * 0.8; s.wk++; }
  const inMouth = b.y > GY0 + 4 && b.y < GY1 - 4;
  if (b.x < FX0 + BR) {
    if (inMouth) { if (b.x < FX0 - 2) goal(s, 1); }
    else { b.x = FX0 + BR; b.vx = Math.abs(b.vx) * 0.8; s.wk++; }
  } else if (b.x > FX1 - BR) {
    if (inMouth) { if (b.x > FX1 + 2) goal(s, 0); }
    else { b.x = FX1 - BR; b.vx = -Math.abs(b.vx) * 0.8; s.wk++; }
  }
}

function goal(s, team) { s.sc[team]++; s.lg = team; s.gk++; s.ph = 2; s.tm = 120; }

// ── 봇 ──
const BOTS = { easy: { skip: 0.35, aim: 0.5, lag: 16 }, normal: { skip: 0.12, aim: 0.72, lag: 7 }, hard: { skip: 0, aim: 0.86, lag: 2 } };

function bot(s, i, mem, level) {
  if (s.over || s.ph !== 1) return 0;
  const cfg = BOTS[level] || BOTS.normal, p = s.p[i], b = s.b;
  if (Math.random() < cfg.skip) return mem.last | 0;
  if (mem.at == null || s.tick - mem.at >= cfg.lag || s.tick < mem.at) {
    mem.at = s.tick;
    const gx = p.team === 0 ? FX1 : FX0, ogx = p.team === 0 ? FX0 : FX1;
    // 공에 더 가까운 같은 편이 있으면 수비
    let chase = true;
    s.p.forEach((q, j) => { if (j !== i && q.team === p.team && Math.hypot(q.x - b.x, q.y - b.y) < Math.hypot(p.x - b.x, p.y - b.y) - 12) chase = false; });
    const bx = b.x + b.vx * 7, by = b.y + b.vy * 7;
    if (chase) {
      const dx = gx - bx, dy = CY - by, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let tx = bx - ux * (PR + BR + 1), tyy = by - uy * (PR + BR + 1);
      const ahead = (p.x - bx) * ux + (p.y - by) * uy;
      if (ahead > -8) {       // 공보다 앞에 있으면 옆으로 돌아 들어간다
        const sx = -uy, sy = ux, side = (p.x - bx) * sx + (p.y - by) * sy >= 0 ? 1 : -1;
        tx += sx * side * 34; tyy += sy * side * 34;
      }
      mem.tx = tx; mem.ty = tyy; mem.ux = ux; mem.uy = uy; mem.chase = true;
    } else {
      mem.tx = ogx + (bx - ogx) * 0.34; mem.ty = CY + (by - CY) * 0.5; mem.chase = false;
    }
  }
  let m = 0;
  const dx = mem.tx - p.x, dy = mem.ty - p.y;
  if (dx > 6) m |= R; else if (dx < -6) m |= L;
  if (dy > 6) m |= D; else if (dy < -6) m |= U;
  if (mem.chase) {
    const kx = b.x - p.x, ky = b.y - p.y, kd = Math.hypot(kx, ky) || 1;
    if (kd < PR + BR + 9 && (kx / kd) * mem.ux + (ky / kd) * mem.uy > cfg.aim && p.kc <= 0 && !(mem.last & A)) m |= A;
  }
  // 공이 멀면 대시로 따라붙는다
  if (mem.chase && p.dc <= 0 && Math.hypot(dx, dy) > 170 && !(mem.last & B) && cfg.skip < 0.3 && m & (L | R | U | D)) m |= B;
  mem.last = m;
  return m;
}

// ── 그리기 ──
function draw(ctx, v, env) {
  const fd = FIELDS[v.th | 0] || FIELDS[0];
  ctx.fillStyle = fd.out; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? fd.a : fd.b; ctx.fillRect(FX0 + (i * (FX1 - FX0)) / 8, FY0, (FX1 - FX0) / 8, FY1 - FY0); }
  ctx.strokeStyle = fd.line; ctx.lineWidth = 4;
  ctx.strokeRect(FX0, FY0, FX1 - FX0, FY1 - FY0);
  ctx.beginPath(); ctx.moveTo(CX, FY0); ctx.lineTo(CX, FY1); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 70, 0, 7); ctx.stroke();
  ctx.strokeRect(FX0, GY0 - 50, 110, GY1 - GY0 + 100); ctx.strokeRect(FX1 - 110, GY0 - 50, 110, GY1 - GY0 + 100);
  // 골대
  for (const [x, col] of [[FX0 - 34, TEAM[0]], [FX1, TEAM[1]]]) {
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(x, GY0, 34, GY1 - GY0);
    ctx.strokeStyle = "rgba(43,45,110,.25)"; ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * 8.5, GY0); ctx.lineTo(x + k * 8.5, GY1); ctx.stroke(); }
    for (let k = 1; k < 10; k++) { ctx.beginPath(); ctx.moveTo(x, GY0 + k * 15); ctx.lineTo(x + 34, GY0 + k * 15); ctx.stroke(); }
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.strokeRect(x, GY0, 34, GY1 - GY0);
  }
  const lerp = (cur, old) => (old ? old + (cur - old) * env.alpha : cur);
  // 선수
  v.p.forEach((p, i) => {
    const q = env.prev && env.prev.p[i], x = q ? lerp(p.x, q.x) : p.x, y = q ? lerp(p.y, q.y) : p.y;
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x, y + 16, 19, 7, 0, 0, 7); ctx.fill();
    if (p.ds > 0) {       // 대시 잔상
      ctx.globalAlpha = 0.25;
      for (let k = 1; k <= 3; k++) { ctx.fillStyle = TEAM[p.team]; ctx.beginPath(); ctx.arc(x - p.dx * k * 13, y - p.dy * k * 13, PR - k * 2, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = TEAM[p.team]; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, PR + 3 + (p.kc > 8 ? 4 : 0), 0, 7); ctx.stroke();
    if (p.dc <= 0) { ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(x + PR + 2, y + PR - 2, 4.5, 0, 7); ctx.fill(); }      // 대시 준비됨
    drawMochi(ctx, x, y, PR, parseLook(v.seats[i].look, i), { ang: Math.atan2(v.b.y - p.y, v.b.x - p.x) });
    if (i === env.me) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x - 7, y - 40); ctx.lineTo(x + 7, y - 40); ctx.lineTo(x, y - 31); ctx.fill(); }
    else label(ctx, v.seats[i].name, x, y - 31, 12, "#fff", "rgba(43,45,110,.8)");
  });
  // 공
  const bq = env.prev && env.prev.b, bx = bq ? lerp(v.b.x, bq.x) : v.b.x, by = bq ? lerp(v.b.y, bq.y) : v.b.y;
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(bx, by + 9, 11, 5, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(bx, by); ctx.rotate((bx + by) * 0.05);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2a2440"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, BR, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2a2440"; ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, 7); ctx.fill();
  for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283; ctx.beginPath(); ctx.arc(Math.cos(a) * 9.5, Math.sin(a) * 9.5, 2.6, 0, 7); ctx.fill(); }
  ctx.restore();
  // 점수판
  ctx.fillStyle = "rgba(255,253,246,.94)"; rr(ctx, CX - 150, 6, 300, 46, 14); ctx.fill();
  label(ctx, String(v.sc[0]), CX - 100, 42, 36, TEAM[0], null);
  label(ctx, String(v.sc[1]), CX + 100, 42, 36, TEAM[1], null);
  const sec = Math.ceil(v.time / 60);
  label(ctx, v.time > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "골든골!", CX, 38, 22, v.time > 0 && sec > 10 ? "#2b2d6e" : "#ff5d73", null);
  if (env.me >= 0 && v.tick < 420) label(ctx, `나는 ${TEAM_NAME[env.me % 2]} · ${env.me % 2 ? "왼쪽" : "오른쪽"} 골대로!`, CX, H - 12, 18, "#fff", "rgba(43,45,110,.85)");
  if (v.ph === 0 && !v.over) label(ctx, "준비!", CX, CY + 20, 70, "#fff", "#2b2d6e");
  if (v.ph === 2 && !v.over) {
    // 골 축포
    const k = 120 - v.tm, cols = ["#ff5d73", "#ffc93c", "#7ddc7a", "#6ec6ff", "#b79cff"];
    for (let i = 0; i < 46; i++) {
      const x = (i * 131) % W, y = ((i * 53) % 200) - 120 + k * (3 + (i % 4)), s2 = 5 + (i % 3) * 2;
      ctx.save(); ctx.translate(x + Math.sin(k * 0.1 + i) * 14, y); ctx.rotate(k * 0.12 + i);
      ctx.fillStyle = cols[i % 5]; ctx.fillRect(-s2, -s2 / 2, s2 * 2, s2); ctx.restore();
    }
    label(ctx, "골!", CX, CY + 20, 110, TEAM[v.lg], "#fff");
  }
  label(ctx, fd.name, W - 14, H - 12, 14, "#fff", "rgba(43,45,110,.7)", "right");
  if (v.over) {
    const w = v.over.w, mine = env.me >= 0 ? env.me % 2 : -1;
    label(ctx, w < 0 ? "무승부!" : mine < 0 ? `${TEAM_NAME[w]} 승리!` : w === mine ? "이겼다!" : "아쉽다, 졌어요", CX, CY + 10, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd) {
  if (m.gk == null) Object.assign(m, { gk: v.gk, kk: v.kk, wk: v.wk, dk: v.dk, ov: !!v.over });
  if (v.dk !== m.dk) { m.dk = v.dk; snd(700, 0.14, "sawtooth", 0.05, -500); }
  if (v.kk !== m.kk) { m.kk = v.kk; snd(210, 0.09, "square", 0.1, -90); }
  if (v.wk !== m.wk) { m.wk = v.wk; snd(330, 0.05, "sine", 0.06); }
  if (v.gk !== m.gk) { m.gk = v.gk; jingle(snd, [523, 659, 784, 1047, 1319], 90); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [784, 659, 784, 1047], 150); }
}

function title(v, me) {
  const w = v.over.w;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${TEAM_NAME[w]} 승리! 한 판 더?`;
  return w === me % 2 ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 2, action: "차기", action2: "대시", overDelay: 220, multiDir: true,
  bots: { solo: 3, local: 2 },
  cap: (mode, n) => mode || (n >= 3 ? 4 : 2),
  fill: (mode, n) => Math.max(0, (mode || (n >= 3 ? 4 : 2)) - n),
  init, step, bot, draw, fx, title,
};

export const meta = {
  local: true,
  soloText: "봇과 한 편이 되어 2대2. 난이도를 골라 주세요.",
  modeLabel: "경기 방식",
  modes: [[0, "자동"], [2, "1대1"], [4, "2대2"]],
  role: (slot) => (slot % 2 ? "파랑 팀" : "빨강 팀"),
  hint(n, mode) {
    const m = mode || (n >= 3 ? 4 : 2);
    return `${m === 2 ? "1대1" : "2대2"}로 시작해요.` + (n < m ? " 빈자리는 봇이 채워요." : n > m ? " 남는 사람은 관전이에요." : "");
  },
  howto: [
    ["목표", "공을 상대 골대에 넣어요. 2분 동안 더 많이 넣은 팀이 승리, 5골을 먼저 넣어도 끝"],
    ["조작", "이동 방향키(또는 W·A·S·D, 대각선 가능), 공 가까이에서 스페이스로 뻥 차기"],
    ["대시", "방향을 누른 채 Q(2P는 마침표)를 누르면 짧게 돌진해요. 노란 점이 보이면 쓸 수 있고, 대시로 공을 들이받으면 세게 날아가요"],
    ["요령", "몸으로 밀면 드리블, 공 뒤에서 골대 쪽으로 차면 슛이에요"],
    ["한 키보드 2인", "1P: W·A·S·D + F, 대시 Q / 2P: 방향키 + Enter, 대시 마침표(.)"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
