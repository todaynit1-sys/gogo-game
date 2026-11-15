// 쾅쾅 포격전 — 번갈아 가며 각도와 힘을 맞춰 포탄을 쏜다. 땅이 파이고, 바람이 분다.
// 포탄 다섯 가지, 판마다 다른 지형과 하늘. 마지막까지 버틴 사람이 승리.

import { startHostGame, L, R, U, D, A, B } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle, SEAT_DARK } from "./kit.js?v=1";

const W = 960, H = 540, COLW = 4, NC = 240, GRAV = 0.12, WINDK = 0.012, START = 100, TURN = 20 * 60, FUEL = 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ty = (s, x) => s.h[clamp(Math.round(x / COLW), 0, NC - 1)];
const speedOf = (pw) => 2.5 + pw * 0.105;
const newWind = () => Math.round((Math.random() * 2 - 1) * 10) / 10;

// 포탄: r 폭발 크기, d 피해, n 처음 개수(-1 = 무제한), dig 땅을 더 깊이 판다, bn 튀는 횟수
const SHELLS = [
  { name: "기본탄", r: 44, d: 52, n: -1, col: "#2a2440" },
  { name: "대왕탄", r: 74, d: 64, n: 2, col: "#ff5d73" },
  { name: "세발탄", r: 34, d: 34, n: 2, col: "#ffc93c" },
  { name: "굴착탄", r: 56, d: 24, n: 2, dig: 2.1, col: "#8a5a3c" },
  { name: "통통탄", r: 46, d: 52, n: 2, bn: 2, col: "#5fe0c8" },
];
const THEMES = [
  { name: "낮", sky: ["#7cc9ff", "#fbe8c8"], soil: ["#b98a55", "#7a5633"], grass: "#6fbf5a", edge: "#4f9a41", cloud: "rgba(255,255,255,.75)" },
  { name: "노을", sky: ["#ff9f7a", "#ffe2a8"], soil: ["#a8684a", "#6e3f2c"], grass: "#d9a441", edge: "#b07d22", cloud: "rgba(255,240,220,.7)" },
  { name: "밤", sky: ["#20245e", "#5a4a9a"], soil: ["#5d5f8c", "#343660"], grass: "#7ad0c0", edge: "#3f9d8f", cloud: "rgba(200,205,255,.35)", stars: true },
  { name: "눈밭", sky: ["#a9d8f5", "#f3fbff"], soil: ["#cfe3ef", "#8fb0c8"], grass: "#ffffff", edge: "#b9d3e3", cloud: "rgba(255,255,255,.9)" },
];
const MAPS = ["언덕", "큰 산", "골짜기", "계단", "협곡"];

function makeTerrain(kind) {
  const f1 = 0.8 + Math.random() * 0.7, f2 = 2 + Math.random() * 1.5, f3 = 5 + Math.random() * 3;
  const p1 = Math.random() * 7, p2 = Math.random() * 7, p3 = Math.random() * 7, h = [];
  const levels = Array.from({ length: 7 }, () => 250 + Math.random() * 190);
  const pits = [0.3 + Math.random() * 0.12, 0.58 + Math.random() * 0.12];
  for (let i = 0; i < NC; i++) {
    const u = i / NC, x = u * 6.283;
    const wave = Math.sin(x * f1 + p1) * 55 + Math.sin(x * f2 + p2) * 28 + Math.sin(x * f3 + p3) * 12;
    let y;
    if (kind === 1) y = 440 - 230 * Math.exp(-(((u - 0.5) / 0.17) ** 2)) + wave * 0.35;            // 가운데 큰 산
    else if (kind === 2) y = 250 + 200 * Math.exp(-(((u - 0.5) / 0.22) ** 2)) + wave * 0.35;       // 가운데가 깊은 골짜기
    else if (kind === 3) {                                                                          // 계단식 평지
      const k = u * 6.999, a = levels[Math.floor(k)], b = levels[Math.min(6, Math.floor(k) + 1)], t = k % 1;
      y = t > 0.82 ? a + ((b - a) * (t - 0.82)) / 0.18 : a; y += wave * 0.08;
    } else if (kind === 4) {                                                                        // 좁고 깊은 구덩이 둘
      y = 330 + wave * 0.6;
      for (const c of pits) y += 150 * Math.exp(-(((u - c) / 0.035) ** 2));
    } else y = 345 + wave;                                                                          // 완만한 언덕
    h.push(Math.round(clamp(y, 160, 468)));
  }
  return h;
}

function init(seats) {
  const map = (Math.random() * MAPS.length) | 0, h = makeTerrain(map), n = seats.length;
  const p = seats.map((_, i) => {
    const x = Math.round((W * (i + 0.5)) / n + Math.random() * 40 - 20), c = Math.round(x / COLW), base = h[c];
    for (let k = -5; k <= 5; k++) if (h[c + k] != null) h[c + k] = base;      // 대포 밑은 평평하게
    return { x, hp: 100, f: x < W / 2 ? 1 : -1, el: 50, pw: 0, fuel: FUEL, al: 1, pa: 0, pb: 0, w: 0, am: SHELLS.map((k) => k.n) };
  });
  return { tick: 0, seats, h, hv: 1, map, th: (Math.random() * THEMES.length) | 0, p, turn: 0, ph: 0, tl: TURN, tm: 0, wind: newWind(), sh: [], ex: [], over: null, fc: 0, bc: 0, dc: 0, tn: 0, wc: 0, bn: 0 };
}

function muzzle(s, p) {
  const r = (p.el * Math.PI) / 180;
  return [p.x + Math.cos(r) * 26 * p.f, ty(s, p.x) - 18 - Math.sin(r) * 26, r];
}

function fire(s) {
  const p = s.p[s.turn], [x, y, r] = muzzle(s, p), v = speedOf(Math.max(3, p.pw)), k = p.w, sh = SHELLS[k];
  for (const off of k === 2 ? [-0.075, 0, 0.075] : [0]) {
    s.sh.push({ x, y, vx: Math.cos(r + off) * v * p.f, vy: -Math.sin(r + off) * v, age: 0, k, bn: sh.bn || 0 });
  }
  if (k > 0 && --p.am[k] <= 0) p.w = 0;      // 다 쓰면 기본탄으로
  p.pw = 0; s.ph = 1; s.fc++;
}

function boom(s, x, y, k) {
  const sh = SHELLS[k], rad = sh.r;
  s.ex.push({ x: Math.round(x), y: Math.round(y), t: 0, r: rad }); s.bc++;
  for (let i = 0; i < NC; i++) {
    const dx = i * COLW - x;
    if (Math.abs(dx) >= rad) continue;
    const bottom = y + Math.sqrt(rad * rad - dx * dx) * (sh.dig || 1);
    if (bottom > s.h[i]) s.h[i] = Math.round(Math.min(H - 14, bottom));
  }
  s.hv++;
  for (const p of s.p) {
    if (!p.al) continue;
    const d = Math.hypot(p.x - x, ty(s, p.x) - 12 - y);
    if (d < rad + 22) { p.hp -= Math.round(sh.d * (1 - d / (rad + 22))) + (d < 22 ? 12 : 0); if (p.hp <= 0) { p.hp = 0; p.al = 0; s.dc++; } }
  }
}

function nextTurn(s) {
  const alive = s.p.filter((p) => p.al);
  if (s.p.length > 1 && alive.length <= 1) { s.over = { w: alive.length ? s.p.indexOf(alive[0]) : -1, t: 0 }; return; }
  do { s.turn = (s.turn + 1) % s.p.length; } while (!s.p[s.turn].al);
  const p = s.p[s.turn];
  p.fuel = FUEL; p.pw = 0; p.pa = 0; p.pb = 0;
  s.ph = 0; s.tl = TURN; s.wind = newWind(); s.tn++;
}

function step(s, masks) {
  s.tick++;
  for (const e of s.ex) e.t++;
  if (s.ex.length && s.ex[0].t > 36) s.ex = s.ex.filter((e) => e.t <= 36);
  if (s.over) { s.over.t++; return; }
  if (s.tick < START) return;
  if (s.ph === 0) {
    const p = s.p[s.turn], m = masks[s.turn] | 0;
    if (m & (L | R)) {
      const dir = m & L ? -1 : 1; p.f = dir;
      if (p.fuel > 0 && !p.pw) {
        // 앞쪽 한 칸의 높이 차로 비탈을 본다. 가파르면 느리고 연료가 더 들고, 절벽(30 넘게)만 못 오른다.
        const rise = ty(s, p.x) - ty(s, clamp(p.x + dir * COLW, 0, W));
        if (rise <= 30) {
          const sp = rise > 10 ? 1 : 2;
          p.x = clamp(p.x + dir * sp, 16, W - 16); p.fuel -= rise > 10 ? 2.5 : 2;
        }
      }
    }
    if (m & U) p.el = Math.min(88, p.el + 0.7);
    if (m & D) p.el = Math.max(5, p.el - 0.7);
    if (m & B && !p.pb && !p.pw) {          // 포탄 바꾸기 (남은 것만)
      do { p.w = (p.w + 1) % SHELLS.length; } while (p.w !== 0 && p.am[p.w] <= 0);
      s.wc++;
    }
    p.pb = m & B ? 1 : 0;
    if (m & A) p.pw = Math.min(100, p.pw + 1.05);
    if ((p.pa && !(m & A)) || p.pw >= 100) fire(s);
    p.pa = m & A ? 1 : 0;
    if (s.ph === 0 && --s.tl <= 0) { p.pw = 0; nextTurn(s); }
  } else if (s.ph === 1) {
    for (let k = s.sh.length - 1; k >= 0; k--) {
      const b = s.sh[k];
      b.vx += s.wind * WINDK; b.vy += GRAV; b.x += b.vx; b.y += b.vy; b.age++;
      let hit = false;
      if (b.x < -40 || b.x > W + 40 || b.y > H + 40) { s.sh.splice(k, 1); continue; }
      if (b.y >= ty(s, b.x)) {
        if (b.bn > 0) { b.bn--; b.y = ty(s, b.x) - 2; b.vy = -Math.abs(b.vy) * 0.62; b.vx *= 0.85; s.bn++; }      // 통통탄은 튄다
        else hit = true;
      } else {
        for (const p of s.p) if (p.al && b.age > 8 && Math.hypot(p.x - b.x, ty(s, p.x) - 14 - b.y) < 22) { hit = true; break; }
      }
      if (hit) { boom(s, b.x, b.y, b.k); s.sh.splice(k, 1); }
    }
    if (!s.sh.length) { s.ph = 2; s.tm = 40; }
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
  for (let el = 20; el <= 86; el += 3) {
    const r = (el * Math.PI) / 180, mx = me.x + Math.cos(r) * 26 * f, my = y0 - Math.sin(r) * 26;
    for (let pw = 15; pw <= 100; pw += 3) {
      const v = speedOf(pw), hit = simShot(s, mx, my, Math.cos(r) * v * f, -Math.sin(r) * v);
      if (hit == null || Math.abs(hit - me.x) < 80) continue;
      const d = Math.abs(hit - t.x);
      if (!best || d < best.d) best = { d, el, pw };
    }
  }
  if (!best) best = { el: 60, pw: 70 };
  const e = ERR[level] || ERR.normal;
  return { f, el: clamp(best.el + (Math.random() - 0.5) * e, 8, 86), pw: clamp(best.pw + (Math.random() - 0.5) * e * 1.6, 8, 99) };
}

function bot(s, i, mem, level) {
  if (s.over || s.tick < START || s.ph !== 0 || s.turn !== i) { mem.tn = -1; return 0; }
  const p = s.p[i];
  if (mem.tn !== s.tn) {
    mem.tn = s.tn; mem.plan = solve(s, i, level); mem.wait = 40 + Math.random() * 50; mem.charge = false;
    // 가끔 특수탄을 고른다 (튀는 통통탄은 조준이 달라져서 봇은 안 쓴다)
    const have = [1, 2, 3].filter((k) => p.am[k] > 0);
    mem.want = have.length && Math.random() < 0.4 ? have[(Math.random() * have.length) | 0] : 0;
  }
  if (mem.wait-- > 0) return 0;
  if (p.w !== mem.want) return s.tick % 8 < 4 ? B : 0;
  const pl = mem.plan;
  if (p.f !== pl.f) return pl.f > 0 ? R : L;
  if (!mem.charge) { if (Math.abs(p.el - pl.el) > 0.8) return p.el < pl.el ? U : D; mem.charge = true; }
  return p.pw < pl.pw ? A : 0;
}

// ── 그리기 ──
function draw(ctx, v, env) {
  const th = THEMES[v.th] || THEMES[0];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (th.stars) {
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 46; i++) { const x = (i * 197) % W, y = (i * 89) % 260; ctx.beginPath(); ctx.arc(x, y, 1 + ((i * 7) % 3) * 0.5 + Math.sin(env.t * 2 + i) * 0.4, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#fff6c8"; ctx.beginPath(); ctx.arc(820, 84, 34, 0, 7); ctx.fill();
    ctx.fillStyle = th.sky[0]; ctx.beginPath(); ctx.arc(806, 76, 30, 0, 7); ctx.fill();
  }
  ctx.fillStyle = th.cloud;
  for (let i = 0; i < 4; i++) { const x = ((i * 290 + env.t * (8 + v.wind * 14)) % (W + 240) + W + 240) % (W + 240) - 120, y = 70 + (i % 2) * 50; ctx.beginPath(); ctx.ellipse(x, y, 50, 17, 0, 0, 7); ctx.ellipse(x + 30, y - 12, 30, 16, 0, 0, 7); ctx.fill(); }
  // 땅
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let i = 0; i < NC; i++) ctx.lineTo(i * COLW, v.h[i]);
  ctx.lineTo(W, v.h[NC - 1]); ctx.lineTo(W, H); ctx.closePath();
  const gg = ctx.createLinearGradient(0, 160, 0, H); gg.addColorStop(0, th.soil[0]); gg.addColorStop(1, th.soil[1]);
  ctx.fillStyle = gg; ctx.fill();
  ctx.beginPath(); for (let i = 0; i < NC; i++) ctx.lineTo(i * COLW, v.h[i]); ctx.lineTo(W, v.h[NC - 1]);
  ctx.strokeStyle = th.grass; ctx.lineWidth = 9; ctx.lineJoin = "round"; ctx.stroke();
  ctx.strokeStyle = th.edge; ctx.lineWidth = 2; ctx.stroke();

  const cur = v.p[v.turn], aiming = v.ph === 0 && v.tick >= START && !v.over;
  // 조준 안내선 (지금 쏘는 사람)
  if (aiming && cur.al) {
    const r = (cur.el * Math.PI) / 180, sp = speedOf(cur.pw > 3 ? cur.pw : 55);
    let x = cur.x + Math.cos(r) * 26 * cur.f, y = ty(v, cur.x) - 18 - Math.sin(r) * 26, vx = Math.cos(r) * sp * cur.f, vy = -Math.sin(r) * sp;
    ctx.fillStyle = th.stars ? "rgba(255,255,255,.7)" : "rgba(43,45,110,.55)";
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
    ctx.fillStyle = "rgba(43,45,110,.85)"; rr(ctx, x - 24, y - 60, 48, 9, 4); ctx.fill();
    ctx.fillStyle = p.hp > 50 ? "#7ddc7a" : p.hp > 25 ? "#ffc93c" : "#ff5d73"; rr(ctx, x - 22, y - 58, Math.max(2, 44 * p.hp / 100), 5, 2.5); ctx.fill();
    label(ctx, v.seats[i].name, x, y - 66, 13, i === env.me ? "#d6336c" : "#2a2440", "rgba(255,255,255,.9)");
    if (aiming && i === v.turn) {
      const by = y - 92 + Math.sin(env.t * 6) * 4;
      ctx.fillStyle = SEAT_DARK[i]; ctx.beginPath(); ctx.moveTo(x - 9, by); ctx.lineTo(x + 9, by); ctx.lineTo(x, by + 11); ctx.fill();
      // 연료 (이동할 수 있는 양)
      ctx.fillStyle = "rgba(43,45,110,.85)"; rr(ctx, x - 24, y + 22, 48, 8, 4); ctx.fill();
      ctx.fillStyle = "#6ec6ff"; rr(ctx, x - 22, y + 24, Math.max(0, (44 * p.fuel) / FUEL), 4, 2); ctx.fill();
      if (p.pw > 0) {       // 힘 게이지
        ctx.fillStyle = "#fff"; rr(ctx, x - 32, y + 8, 64, 11, 5); ctx.fill();
        ctx.fillStyle = "#ff5d73"; rr(ctx, x - 30, y + 10, Math.max(2, 60 * p.pw / 100), 7, 3.5); ctx.fill();
      }
    }
  });
  // 포탄
  for (const b of v.sh) {
    const sh = SHELLS[b.k], rad = b.k === 1 ? 9 : b.k === 2 ? 4.5 : 6;
    ctx.fillStyle = "rgba(43,45,110,.25)"; for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(b.x - b.vx * k * 1.5, b.y - b.vy * k * 1.5, rad - k, 0, 7); ctx.fill(); }
    ctx.fillStyle = sh.col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, 7); ctx.fill(); ctx.stroke();
  }
  // 폭발
  for (const e of v.ex) {
    if (e.t >= 34) continue;
    const k = e.t, r = k < 9 ? (e.r * k) / 9 : e.r, al = k < 9 ? 1 : 1 - (k - 9) / 25;
    ctx.globalAlpha = Math.max(0, al);
    ctx.fillStyle = "#ff7a2f"; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.66, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.3, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 위쪽 안내
  ctx.fillStyle = "rgba(255,253,246,.92)"; rr(ctx, W / 2 - 150, 10, 300, 58, 16); ctx.fill();
  const wn = Math.round(Math.abs(v.wind) * 10);
  label(ctx, wn === 0 ? "바람 없음" : `바람 ${v.wind > 0 ? "→" : "←"} ${wn}`, W / 2, 34, 18, "#2b2d6e", null);
  label(ctx, `${MAPS[v.map] || ""} · ${th.name}`, W - 16, 28, 15, "#2b2d6e", "rgba(255,255,255,.85)", "right");
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2 - 40, 80, "#ff5d73", "#fff");
  else if (!v.over) label(ctx, aiming ? `${v.seats[v.turn].name} 차례 · ${Math.ceil(v.tl / 60)}초` : v.ph === 1 ? "날아가는 중…" : "쾅!", W / 2, 58, 17, v.turn === env.me && aiming ? "#d6336c" : "#6b6480", null);
  // 포탄 고르기 (지금 쏘는 사람 것)
  if (aiming) {
    const bw = 92, x0 = 14;
    SHELLS.forEach((sh, k) => {
      const x = x0 + k * (bw + 6), on = cur.w === k, left = cur.am[k];
      ctx.globalAlpha = left === 0 ? 0.4 : 1;
      ctx.fillStyle = on ? "#2b2d6e" : "rgba(255,253,246,.92)"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2.5;
      rr(ctx, x, H - 62, bw, 30, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = sh.col; ctx.beginPath(); ctx.arc(x + 14, H - 47, 6, 0, 7); ctx.fill();
      label(ctx, sh.name + (left < 0 ? "" : " " + left), x + 24, H - 41, 14, on ? "#fff" : "#2b2d6e", null, "left");
      ctx.globalAlpha = 1;
    });
    if (v.turn === env.me) label(ctx, "←→ 이동 · ↑↓ 각도 · Q 포탄 바꾸기 · 스페이스를 꾹 눌렀다 떼면 발사", W / 2, H - 12, 16, "#2a2440", "rgba(255,255,255,.9)");
  }
  if (v.over) {
    const w = v.over.w;
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, H / 2 - 40, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd, me) {
  if (m.fc == null) Object.assign(m, { fc: v.fc, bc: v.bc, dc: v.dc, wc: v.wc, bn: v.bn, tn: -1, ov: !!v.over });
  if (v.fc !== m.fc) { m.fc = v.fc; snd(160, 0.2, "square", 0.1, -80); snd(900, 0.5, "sine", 0.04, -500); }
  if (v.bc !== m.bc) { m.bc = v.bc; snd(80, 0.4, "sawtooth", 0.15, -30); }
  if (v.dc !== m.dc) { m.dc = v.dc; snd(400, 0.35, "sawtooth", 0.1, -300); }
  if (v.wc !== m.wc) { m.wc = v.wc; snd(520, 0.05, "triangle", 0.08); }
  if (v.bn !== m.bn) { m.bn = v.bn; snd(380, 0.08, "sine", 0.09, 200); }
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
  W, H, sendEvery: 3, action: "발사", action2: "포탄", overDelay: 220,
  bots: { solo: 1, local: 0 },
  fill: (mode, n) => (n < 2 ? 1 : 0),
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
    ["조작", "←→ 이동(대포 아래 파란 연료 막대만큼, 차례마다 다시 참), ↑↓ 포신 각도, 스페이스를 꾹 눌러 힘을 모았다가 떼면 발사"],
    ["포탄", "Q로 바꿔요. 기본탄(무제한), 대왕탄(크게 터짐), 세발탄(세 발이 퍼짐), 굴착탄(땅을 깊이 팜), 통통탄(두 번 튄 뒤 터짐). 특수탄은 두 발씩"],
    ["지형", "판마다 언덕·큰 산·골짜기·계단·협곡 가운데 하나가 나오고, 낮·노을·밤·눈밭으로 분위기가 바뀌어요. 차례마다 바람도 바뀌어요"],
    ["한 키보드 2인", "1P: W·A·S·D + F, 포탄 Q / 2P: 방향키 + Enter, 포탄 마침표(.)"],
    ["휴대폰", "방향 버튼으로 이동·각도, 포탄 버튼으로 바꾸고, 발사 버튼을 꾹 눌렀다 떼기"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
