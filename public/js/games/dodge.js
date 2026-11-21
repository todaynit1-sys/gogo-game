// 떡 피구 — 코트를 반으로 나눠 공을 던져 상대를 맞힌다. 맞으면 하트가 하나 줄고,
// 날아오는 공을 제때 잡으면 던진 사람 하트가 준다. 상대 팀을 모두 탈락시키면 승리.

import { lazy3d } from "./lazy3d.js?v=1";
import { startHostGame, L, R, U, D, A, B } from "./hostgame.js?v=3";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle } from "./kit.js?v=3";

const W = 960, H = 540, FX0 = 60, FX1 = 900, FY0 = 74, FY1 = 500, MID = 480, CY = (FY0 + FY1) / 2;
const PR = 20, BR = 11, START = 100, TIME = 150 * 60, SPEED = 12.5, LIVE_MIN = 5, HOLD_MAX = 300, CATCH_WIN = 14;
const TEAM = ["#ff5d73", "#4d9be0"], TEAM_NAME = ["빨강 팀", "파랑 팀"];
const COURTS = [
  { name: "운동장", out: "#c9965a", a: "#f0c88a", b: "#e9bd7a", line: "#fff" },
  { name: "체육관", out: "#8a5a3c", a: "#e7b276", b: "#dca468", line: "rgba(255,255,255,.95)" },
  { name: "눈밭", out: "#9fc4dd", a: "#f4fbff", b: "#e6f2fa", line: "rgba(77,155,224,.9)" },
  { name: "밤 코트", out: "#17203f", a: "#3a4b8a", b: "#34447e", line: "rgba(255,255,255,.8)" },
];
const SPOTS = [[-150, 0], [-290, -120], [-290, 120]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function init(seats) {
  const hearts = seats.length <= 2 ? 3 : 2, cnt = [0, 0];
  const p = seats.map((_, i) => {
    const team = i % 2, [dx, dy] = SPOTS[cnt[team]++ % 3], sg = team === 0 ? 1 : -1;
    return { x: MID + dx * sg, y: CY + dy * sg, vx: 0, vy: 0, fx: sg, fy: 0, team, hp: hearts, mh: hearts, al: 1, iv: 0, cw: 0, cd: 0, ds: 0, dc: 0, dx: 0, dy: 0, pa: 0, pb: 0 };
  });
  return { tick: 0, seats, th: (Math.random() * COURTS.length) | 0, p, b: { x: MID, y: CY, vx: 0, vy: 0, live: 0, own: -1, hold: -1, ht: 0, age: 0 }, time: TIME, over: null, tc: 0, hc: 0, cc: 0, pc: 0, oc: 0, dk: 0, msg: [] };
}

function grab(s, j) { const b = s.b; b.hold = j; b.live = 0; b.own = -1; b.ht = 0; b.vx = 0; b.vy = 0; }
function out(s, j) { const q = s.p[j]; q.al = 0; q.hp = 0; s.oc++; if (s.b.hold === j) s.b.hold = -1; }
function pop(s, x, y, text, col) { s.msg.push({ x: Math.round(x), y: Math.round(y), text, col, t: 0 }); if (s.msg.length > 6) s.msg.shift(); }

// 던지기: 봇은 정확한 방향을, 사람은 앞쪽 방향키를 누르고 있으면 그 방향, 아니면 가장 가까운 상대를 노린다
function throwBall(s, i, m, aim) {
  const p = s.p[i], b = s.b, fwd = p.team === 0 ? 1 : -1;
  let dx, dy;
  if (aim && (aim.x || aim.y)) { dx = aim.x; dy = aim.y; }
  else if (m & (fwd > 0 ? R : L)) { dx = (m & R ? 1 : 0) - (m & L ? 1 : 0); dy = (m & D ? 1 : 0) - (m & U ? 1 : 0); }
  else {
    let best = null, bd = 1e9;
    for (const q of s.p) if (q.al && q.team !== p.team) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
    if (best) { dx = best.x - p.x; dy = best.y - p.y; } else { dx = fwd; dy = 0; }
  }
  const d = Math.hypot(dx, dy) || 1;
  b.vx = (dx / d) * SPEED; b.vy = (dy / d) * SPEED; b.live = 1; b.own = i; b.hold = -1; b.ht = 0; b.age = 0;
  b.x = p.x + (dx / d) * (PR + BR + 2); b.y = p.y + (dy / d) * (PR + BR + 2);
  s.tc++;
}

// 공이 선수에게 닿았을 때. 공을 누가 잡았으면 true
function touch(s) {
  const b = s.b;
  for (let j = 0; j < s.p.length; j++) {
    const q = s.p[j];
    if (!q.al) continue;
    const dx = q.x - b.x, dy = q.y - b.y, d = Math.hypot(dx, dy);
    if (d >= PR + BR) continue;
    if (!b.live) { grab(s, j); s.pc++; return true; }            // 굴러가는 공 줍기
    const th = s.p[b.own];
    if (q.team === th.team) {                                     // 같은 편: 던진 사람은 지나 보내고, 동료는 받는다(패스)
      if (j === b.own ? b.age < 12 : b.age < 6) continue;
      grab(s, j); s.pc++; return true;
    }
    if (q.iv > 0) continue;
    if (q.cw > 0) {                                               // 잡았다! 던진 사람 하트 -1
      const o = b.own;
      grab(s, j); s.cc++; q.cw = 0;
      th.hp--;
      pop(s, q.x, q.y - 44, "잡았다!", TEAM[q.team]);
      pop(s, th.x, th.y - 44, th.hp > 0 ? "−1" : "탈락!", "#ff5d73");
      if (th.hp <= 0) out(s, o);
      return true;
    }
    q.hp--; q.iv = 70; s.hc++;                                    // 맞았다
    const nx = dx / (d || 1), ny = dy / (d || 1);
    q.vx += nx * 6; q.vy += ny * 6;
    b.vx = -b.vx * 0.3 - nx * 1.5; b.vy = -b.vy * 0.3 - ny * 1.5; b.live = 0; b.own = -1;
    pop(s, q.x, q.y - 44, q.hp > 0 ? "아야!" : "탈락!", "#ff5d73");
    if (q.hp <= 0) out(s, j);
    return false;
  }
  return false;
}

function moveBall(s) {
  const b = s.b;
  b.age++;
  for (let sub = 0; sub < 2; sub++) {
    b.x += b.vx / 2; b.y += b.vy / 2;
    if (b.x < FX0 + BR) { b.x = FX0 + BR; b.vx = Math.abs(b.vx) * 0.75; }
    if (b.x > FX1 - BR) { b.x = FX1 - BR; b.vx = -Math.abs(b.vx) * 0.75; }
    if (b.y < FY0 + BR) { b.y = FY0 + BR; b.vy = Math.abs(b.vy) * 0.75; }
    if (b.y > FY1 - BR) { b.y = FY1 - BR; b.vy = -Math.abs(b.vy) * 0.75; }
    if (touch(s)) return;
  }
  const k = b.live ? 0.996 : 0.94;
  b.vx *= k; b.vy *= k;
  if (b.live && Math.hypot(b.vx, b.vy) < LIVE_MIN) { b.live = 0; b.own = -1; }
  if (!b.live && Math.hypot(b.vx, b.vy) < 0.05) { b.vx = 0; b.vy = 0; }
}

function step(s, masks, aims) {
  s.tick++;
  for (const q of s.msg) q.t++;
  if (s.msg.length && s.msg[0].t > 70) s.msg.shift();
  if (s.over) { s.over.t++; return; }
  if (s.tick < START) return;
  if (--s.time <= 0) {
    const hp = [0, 0]; s.p.forEach((p) => { hp[p.team] += p.al ? p.hp : 0; });
    s.over = { w: hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1, t: 0 }; return;
  }
  const b = s.b, n = s.p.length, flip = Math.random() < 0.5;
  for (let k = 0; k < n; k++) {
    const i = flip ? n - 1 - k : k, p = s.p[i];
    if (!p.al) continue;
    const m = masks[i] | 0;
    let ax = (m & R ? 1 : 0) - (m & L ? 1 : 0), ay = (m & D ? 1 : 0) - (m & U ? 1 : 0);
    if (ax && ay) { ax *= 0.707; ay *= 0.707; }
    if (ax || ay) { const d = Math.hypot(ax, ay); p.fx = ax / d; p.fy = ay / d; }
    if (p.iv > 0) p.iv--;
    if (p.cw > 0) p.cw--;
    if (p.cd > 0) p.cd--;
    if (p.dc > 0) p.dc--;
    if (m & B && !p.pb && p.dc <= 0 && (ax || ay)) { p.ds = 8; p.dc = 100; p.dx = ax; p.dy = ay; s.dk++; }
    p.pb = m & B ? 1 : 0;
    const slow = b.hold === i ? 0.8 : 1;      // 공을 들면 조금 느리다
    if (p.ds > 0) { p.ds--; p.vx = p.dx * 9; p.vy = p.dy * 9; }
    else { p.vx = p.vx * 0.84 + ax * 0.62 * slow; p.vy = p.vy * 0.84 + ay * 0.62 * slow; }
    p.x += p.vx; p.y += p.vy;
    p.x = clamp(p.x, p.team === 0 ? FX0 + PR : MID + PR, p.team === 0 ? MID - PR : FX1 - PR);
    p.y = clamp(p.y, FY0 + PR, FY1 - PR);
    if (m & A && !p.pa) {
      if (b.hold === i) throwBall(s, i, m, aims && aims[i]);
      else if (p.cd <= 0) { p.cw = CATCH_WIN; p.cd = 42; }      // 잡을 준비 (잠깐 동안만)
    }
    p.pa = m & A ? 1 : 0;
  }
  // 같은 편끼리 밀치기
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = s.p[i], c = s.p[j];
    if (!a.al || !c.al || a.team !== c.team) continue;
    const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d < PR * 2) { const k = (PR * 2 - d) / 2; a.x -= (dx / d) * k; a.y -= (dy / d) * k; c.x += (dx / d) * k; c.y += (dy / d) * k; }
  }
  // 공
  if (b.hold >= 0) {
    const h = s.p[b.hold];
    if (!h.al) b.hold = -1;
    else {
      b.x = h.x + h.fx * (PR + 6); b.y = h.y + h.fy * (PR + 6);
      if (++b.ht > HOLD_MAX) throwBall(s, b.hold, 0, null);      // 너무 오래 들고 있으면 저절로 던진다
    }
  }
  if (b.hold < 0) moveBall(s);
  // 승패
  const alive = [0, 0]; s.p.forEach((p) => { if (p.al) alive[p.team]++; });
  if (!alive[0] || !alive[1]) s.over = { w: !alive[0] && !alive[1] ? -1 : alive[0] ? 0 : 1, t: 0 };
}

// ── 봇 ──
const BOTS = {
  easy: { lag: 14, err: 0.22, catchP: 0.08, dodge: 0.35, hold: [55, 120] },
  normal: { lag: 7, err: 0.1, catchP: 0.28, dodge: 0.7, hold: [30, 85] },
  hard: { lag: 2, err: 0.035, catchP: 0.5, dodge: 0.92, hold: [18, 55] },
};

function bot(s, i, mem, level) {
  const p = s.p[i], b = s.b;
  if (s.over || s.tick < START || !p.al) return 0;
  const cfg = BOTS[level] || BOTS.normal;
  if (mem.at != null && s.tick - mem.at < cfg.lag && s.tick >= mem.at) return mem.out | 0;
  mem.at = s.tick;
  const fwd = p.team === 0 ? 1 : -1;
  const go = (tx, ty, tol = 8) => { let r = 0; if (tx > p.x + tol) r |= R; else if (tx < p.x - tol) r |= L; if (ty > p.y + tol) r |= D; else if (ty < p.y - tol) r |= U; return r; };
  const home = () => go(MID - fwd * (210 + (i >> 1) * 90), CY + Math.sin(s.tick / 50 + i * 1.7) * 130, 14);
  let m = 0, aim = null;
  if (b.hold === i) {
    const pid = s.pc + "/" + s.cc;
    if (mem.pid !== pid) { mem.pid = pid; mem.holdT = cfg.hold[0] + Math.random() * (cfg.hold[1] - cfg.hold[0]); }
    m |= go(MID - fwd * 90, CY + Math.sin(s.tick / 40 + i) * 120);      // 앞으로 나간다
    if (b.ht >= mem.holdT) {
      const foes = s.p.filter((q) => q.al && q.team !== p.team);
      if (foes.length) {
        const t = level === "hard" ? foes.reduce((a, c) => (c.hp < a.hp ? c : a)) : foes.reduce((a, c) => (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? c : a));
        const tt = Math.hypot(t.x - p.x, t.y - p.y) / SPEED;
        const ang = Math.atan2(t.y + t.vy * tt - p.y, t.x + t.vx * tt - p.x) + (Math.random() * 2 - 1) * cfg.err;
        aim = { x: Math.round(Math.cos(ang) * 100), y: Math.round(Math.sin(ang) * 100) };
        if (!(mem.out & A)) m |= A;
      }
    }
  } else if (b.live && b.own >= 0 && s.p[b.own].team !== p.team) {
    // 날아오는 공: 잡거나 피한다
    const rx = p.x - b.x, ry = p.y - b.y, vv = b.vx * b.vx + b.vy * b.vy || 1, t = (rx * b.vx + ry * b.vy) / vv;
    if (t > 0 && t < 45) {
      const cx = b.x + b.vx * t - p.x, cy = b.y + b.vy * t - p.y, miss = Math.hypot(cx, cy);
      if (miss < PR + BR + 10) {
        if (mem.tid !== s.tc) { mem.tid = s.tc; mem.mode = Math.random() < cfg.catchP ? "catch" : Math.random() < cfg.dodge ? "dodge" : "none"; }
        if (mem.mode === "catch") { if (t < 9 && p.cd <= 0 && !(mem.out & A)) m |= A; }
        else if (mem.mode === "dodge") {
          let ux = -cx, uy = -cy;
          if (Math.hypot(ux, uy) < 4) { ux = -b.vy; uy = b.vx; }      // 정면이면 옆으로
          m |= go(p.x + ux * 10, p.y + uy * 10, 2);
          if (t < 14 && p.dc <= 0 && level !== "easy" && m) m |= B;
        }
      }
    }
    if (!m) m = home();
  } else if (b.hold < 0 && !b.live) {
    // 굴러다니는 공: 내 쪽에 있고 내가 가장 가까우면 줍는다
    const mine = p.team === 0 ? b.x < MID + PR : b.x > MID - PR;
    const dme = Math.hypot(p.x - b.x, p.y - b.y);
    const closest = !s.p.some((q, j) => j !== i && q.al && q.team === p.team && Math.hypot(q.x - b.x, q.y - b.y) < dme);
    if (mine && closest) { m |= go(b.x, b.y, 4); if (p.dc <= 0 && dme > 170 && level !== "easy" && m) m |= B; }
    else m = home();
  } else if (b.hold >= 0 && s.p[b.hold].team !== p.team) {
    m = go(MID - fwd * 300, CY + Math.sin(s.tick / 30 + i * 2) * 150, 12);      // 상대가 공을 들면 뒤로 물러서 좌우로
  } else m = home();
  mem.out = m;
  return aim ? { m, x: aim.x, y: aim.y } : m;
}

// ── 그리기 ──
function heart(ctx, x, y, s, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); ctx.fill();
}

const stage = lazy3d("./dodge3d.js?v=2");
function draw(ctx, v, env) {
  const c = COURTS[v.th | 0] || COURTS[0];
  let d3 = null;
  const m3 = stage.get();
  if (m3) { try { d3 = m3.render(v, env, c); ctx.drawImage(d3.cv, 0, 0, W, H); } catch { d3 = null; stage.fail(); } }
  if (d3) {
    v.p.forEach((p, i) => {
      const tag = d3.tags[i]; if (!tag) return;
      const [x, y] = tag;
      for (let k = 0; k < p.mh; k++) heart(ctx, x - (p.mh - 1) * 8 + k * 16, y, 6, k < p.hp ? "#ff5d73" : "rgba(43,45,110,.35)");
      if (i === env.me) { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 8, y - 26); ctx.lineTo(x + 8, y - 26); ctx.lineTo(x, y - 15); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else label(ctx, v.seats[i].name, x, y - 14, 12, "#fff", "rgba(43,45,110,.8)");
    });
  } else {
  ctx.fillStyle = c.out; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.a; ctx.fillRect(FX0, FY0, MID - FX0, FY1 - FY0);
  ctx.fillStyle = c.b; ctx.fillRect(MID, FY0, FX1 - MID, FY1 - FY0);
  ctx.fillStyle = "rgba(255,93,115,.10)"; ctx.fillRect(FX0, FY0, MID - FX0, FY1 - FY0);
  ctx.fillStyle = "rgba(77,155,224,.10)"; ctx.fillRect(MID, FY0, FX1 - MID, FY1 - FY0);
  ctx.strokeStyle = c.line; ctx.lineWidth = 4; ctx.strokeRect(FX0, FY0, FX1 - FX0, FY1 - FY0);
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(MID, FY0); ctx.lineTo(MID, FY1); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(MID, CY, 56, 0, 7); ctx.stroke();
  ctx.setLineDash([10, 10]);
  for (const x of [FX0 + 110, FX1 - 110]) { ctx.beginPath(); ctx.moveTo(x, FY0); ctx.lineTo(x, FY1); ctx.stroke(); }
  ctx.setLineDash([]);
  const at = (cur, old) => (old != null ? old + (cur - old) * env.alpha : cur);
  // 선수
  v.p.forEach((p, i) => {
    if (!p.al) return;
    const q = env.prev && env.prev.p[i], x = at(p.x, q && q.x), y = at(p.y, q && q.y);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x, y + 16, 19, 7, 0, 0, 7); ctx.fill();
    if (p.ds > 0) {
      ctx.globalAlpha = 0.25;
      for (let k = 1; k <= 3; k++) { ctx.fillStyle = TEAM[p.team]; ctx.beginPath(); ctx.arc(x - p.dx * k * 13, y - p.dy * k * 13, PR - k * 2, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (p.iv > 0 && v.tick % 8 < 4) ctx.globalAlpha = 0.4;
    ctx.strokeStyle = TEAM[p.team]; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, PR + 3, 0, 7); ctx.stroke();
    drawMochi(ctx, x, y, PR, parseLook(v.seats[i].look, i), { ang: Math.atan2(p.fy, p.fx), open: p.cw > 0 });
    ctx.globalAlpha = 1;
    if (p.cw > 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, PR + 10, 0, 7); ctx.stroke(); }
    for (let k = 0; k < p.mh; k++) heart(ctx, x - (p.mh - 1) * 8 + k * 16, y - PR - 16, 6, k < p.hp ? "#ff5d73" : "rgba(43,45,110,.25)");
    if (i === env.me) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x - 7, y - PR - 40); ctx.lineTo(x + 7, y - PR - 40); ctx.lineTo(x, y - PR - 31); ctx.fill(); }
    else label(ctx, v.seats[i].name, x, y - PR - 28, 12, "#fff", "rgba(43,45,110,.8)");
  });
  // 공
  const b = v.b, bq = env.prev && env.prev.b, bx = at(b.x, bq && bq.x), by = at(b.y, bq && bq.y);
  if (b.live) { ctx.fillStyle = "rgba(255,93,115,.25)"; for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(bx - b.vx * k * 1.2, by - b.vy * k * 1.2, BR - k * 1.5, 0, 7); ctx.fill(); } }
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(bx, by + 9, 10, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#e8453c"; ctx.strokeStyle = "#9b2f3a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, BR, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, BR - 4, -0.5, 1.2); ctx.stroke();
  }
  // 점수판
  const hp = [0, 0]; v.p.forEach((p) => { hp[p.team] += p.al ? p.hp : 0; });
  ctx.fillStyle = "rgba(255,253,246,.94)"; rr(ctx, W / 2 - 190, 8, 380, 50, 14); ctx.fill();
  heart(ctx, W / 2 - 150, 33, 9, TEAM[0]); label(ctx, String(hp[0]), W / 2 - 118, 44, 30, TEAM[0], null);
  heart(ctx, W / 2 + 118, 33, 9, TEAM[1]); label(ctx, String(hp[1]), W / 2 + 150, 44, 30, TEAM[1], null);
  const sec = Math.max(0, Math.ceil(v.time / 60));
  label(ctx, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`, W / 2, 42, 22, sec > 10 ? "#2b2d6e" : "#ff5d73", null);
  label(ctx, c.name, W - 14, H - 12, 14, "#fff", "rgba(43,45,110,.7)", "right");
  for (const q of v.msg) if (q.t < 60) { const [mx, my] = d3 ? d3.at(q.x, q.y, 1.6) : [q.x, q.y]; label(ctx, q.text, mx, my - q.t * 0.6, 22, q.col, "#fff"); }
  if (env.me >= 0 && v.tick < 480 && !v.over) label(ctx, env.touch ? `나는 ${TEAM_NAME[env.me % 2]} · [던지기]: 공을 들면 던지기, 없으면 잡기 · [대시]: 돌진` : `나는 ${TEAM_NAME[env.me % 2]} · 스페이스: 공을 들면 던지기, 없으면 잡기 · Q: 대시`, W / 2, H - 12, 16, "#fff", "rgba(43,45,110,.85)");
  if (v.tick < START) label(ctx, "준비!", W / 2, CY + 20, 70, "#fff", "#2b2d6e");
  if (v.over) {
    const w = v.over.w, mine = env.me >= 0 ? env.me % 2 : -1;
    label(ctx, w < 0 ? "무승부!" : mine < 0 ? `${TEAM_NAME[w]} 승리!` : w === mine ? "이겼다!" : "아쉽다, 졌어요", W / 2, CY + 10, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd) {
  if (m.tc == null) Object.assign(m, { tc: v.tc, hc: v.hc, cc: v.cc, pc: v.pc, oc: v.oc, dk: v.dk, ov: !!v.over });
  if (v.tc !== m.tc) { m.tc = v.tc; snd.whoosh(1.3); }
  if (!m.st && v.tick >= START) { m.st = 1; snd.whistle(); }
  if (v.hc !== m.hc) { m.hc = v.hc; snd.thud(1.3); }
  if (v.cc !== m.cc) { m.cc = v.cc; jingle(snd, [660, 880, 1100], 70); }
  if (v.pc !== m.pc) { m.pc = v.pc; snd(420, 0.06, "triangle", 0.08, 120); }
  if (v.oc !== m.oc) { m.oc = v.oc; snd(400, 0.35, "sawtooth", 0.1, -300); }
  if (v.dk !== m.dk) { m.dk = v.dk; snd.whoosh(); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
}

function title(v, me) {
  const w = v.over.w;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${TEAM_NAME[w]} 승리! 한 판 더?`;
  return w === me % 2 ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 2, action: "던지기", action2: "대시", overDelay: 220, multiDir: true,
  hurry: (v) => v.tick >= START && v.time < 600,
  bots: { solo: 3, local: 2 },
  cap: (mode, n) => mode || (n >= 3 ? 4 : 2),
  fill: (mode, n) => Math.max(0, (mode || (n >= 3 ? 4 : 2)) - n),
  init, step, bot, draw, fx, title, dispose: () => stage.dispose(),
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
    ["목표", "공을 던져 상대를 맞히면 하트가 하나 줄어요. 하트가 다 없어지면 탈락, 상대 팀을 모두 탈락시키면 승리"],
    ["던지기", "공을 들고 스페이스. 앞쪽 방향키를 같이 누르면 그 방향으로, 아니면 가장 가까운 상대를 노려요"],
    ["잡기", "공이 없을 때 스페이스를 누르면 잠깐 잡을 준비를 해요. 날아오는 공을 잡으면 던진 사람 하트가 줄어요"],
    ["대시", "방향을 누른 채 Q(2P는 마침표)로 짧게 돌진. 공을 피하거나 주우러 갈 때 써요"],
    ["한 키보드 2인", "1P: W·A·S·D + F, 대시 Q / 2P: 방향키 + Enter, 대시 마침표(.)"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
