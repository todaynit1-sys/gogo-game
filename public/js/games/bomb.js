// 폭탄 미로 — 미로에서 폭탄을 놓아 상자를 부수고, 끝까지 살아남으면 승리.

import { startHostGame, L, R, U, D, A } from "./hostgame.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=2";
import { rr, label, jingle, SEAT_TINT, SEAT_DARK } from "./kit.js?v=1";

const GW = 15, GH = 11, CELL = 44, OX = 150, OY = 50, W = 960, H = 540;
const SPAWN = [[1, 1], [13, 9], [13, 1], [1, 9]];
const FUSE = 132, FLAME = 26, START = 120, SHRINK_AT = START + 75 * 60, SHRINK_EVERY = 18, SHRINK_MAX = 96;
const DIR4 = [[-1, 0, L], [1, 0, R], [0, -1, U], [0, 1, D]];
const REV = { [L]: R, [R]: L, [U]: D, [D]: U };
const idx = (x, y) => y * GW + x;
const setc = (g, i, ch) => g.slice(0, i) + ch + g.slice(i + 1);
const solid = (ch) => ch === "1" || ch === "2" || ch === "3";
const ITEMS = "abcde", POOL = "aaabbbcccdde";      // a 폭탄+1, b 불길+1, c 빨라짐, d 방패, e 관통 불길
const MAPS = ["기둥 미로", "넓은 광장", "십자 길", "벽돌 길"];
const THEMES = [
  { name: "풀밭", bg: "#fff1cc", f: ["#b9e3a2", "#aedb96"], w: ["#54609e", "#7c88c4"], c: ["#b9803f", "#e0ab68"] },
  { name: "눈 마을", bg: "#e9f4fb", f: ["#f4fbff", "#e3f0f8"], w: ["#5d86a8", "#8fb6d6"], c: ["#7fa3bd", "#cfe6f5"] },
  { name: "사막", bg: "#ffe9b8", f: ["#f3d9a0", "#ecd092"], w: ["#8a5a3c", "#b9825a"], c: ["#c96a3d", "#f0a070"] },
  { name: "우주 기지", bg: "#1d2146", f: ["#3a3f78", "#343970"], w: ["#15183a", "#5560b0"], c: ["#7a55c9", "#b79cff"] },
];

// 벽이 좁혀지는 순서 (바깥에서 안으로 소용돌이)
const ORDER = (() => {
  const out = []; let x0 = 1, y0 = 1, x1 = GW - 2, y1 = GH - 2;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push(idx(x, y0));
    for (let y = y0 + 1; y <= y1; y++) out.push(idx(x1, y));
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push(idx(x, y1));
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push(idx(x0, y));
    x0++; y0++; x1--; y1--;
  }
  return out;
})();

function init(seats) {
  const map = (Math.random() * MAPS.length) | 0, dens = [0.78, 0.66, 0.78, 0.72][map];
  let g = "";
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const edge = x === 0 || y === 0 || x === GW - 1 || y === GH - 1;
    let wall = x % 2 === 0 && y % 2 === 0;                                       // 기둥 미로
    if (map === 1) wall = x % 4 === 2 && y % 4 === 2;                             // 넓은 광장: 기둥이 드문드문
    else if (map === 3) wall = wall || (y % 2 === 0 && x % 2 === 1 && (x + y) % 6 === 1);   // 벽돌 길: 군데군데 막힌 통로
    const cross = map === 2 && (x === 7 || y === 5);                              // 십자 길: 가운데 십자는 처음부터 뚫려 있다
    g += edge || wall ? "1" : cross ? "0" : Math.random() < dens ? "2" : "0";
  }
  const p = seats.map((_, i) => {
    const [x, y] = SPAWN[i];
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X > 0 && Y > 0 && X < GW - 1 && Y < GH - 1 && g[idx(X, Y)] === "2") g = setc(g, idx(X, Y), "0");
    }
    return { x, y, al: 1, nb: 1, rg: 2, sp: 0, pa: 0, dt: 0, sh: 0, pc: 0, iv: 0 };
  });
  return { tick: 0, seats, g, map, th: (Math.random() * THEMES.length) | 0, p, b: [], f: [], over: null, ex: 0, bc: 0, pk: 0, dc: 0, sk: 0 };
}

function open(s, i, x, y) {
  if (solid(s.g[idx(x, y)])) return false;
  for (const b of s.b) if (b.x === x && b.y === y && !b.ps.includes(i)) return false;
  return true;
}

// 칸 길을 따라 움직인다. 옆으로 어긋나 있으면 먼저 줄을 맞춰 모퉁이를 부드럽게 돈다.
function moveP(s, i, dir, d) {
  const p = s.p[i], horiz = dir === L || dir === R, sgn = dir === R || dir === D ? 1 : -1;
  let a = horiz ? p.x : p.y, b = horiz ? p.y : p.x;
  const at = (ca, ln) => (horiz ? open(s, i, ca, ln) : open(s, i, ln, ca));
  let lane = Math.round(b);
  if (Math.abs(b - lane) > 1e-4) {
    const ca = Math.round(a);
    if (!at(ca + sgn, lane)) { const alt = b > lane ? lane + 1 : lane - 1; if (at(ca + sgn, alt) && at(ca, alt)) lane = alt; else return; }
    const st = Math.min(d, Math.abs(b - lane));
    b += Math.sign(lane - b) * st; d -= st;
    if (Math.abs(b - lane) > 1e-4) { if (horiz) p.y = b; else p.x = b; return; }
    b = lane;
  }
  const cur = sgn > 0 ? Math.floor(a + 1e-4) : Math.ceil(a - 1e-4), next = cur + sgn;
  let na = a + sgn * d;
  if (at(next, lane)) na = sgn > 0 ? Math.min(na, next) : Math.max(na, next);
  else na = sgn > 0 ? Math.min(na, Math.max(a, cur)) : Math.max(na, Math.min(a, cur));
  if (Math.abs(na - Math.round(na)) < 1e-4) na = Math.round(na);
  if (horiz) { p.x = na; p.y = b; } else { p.y = na; p.x = b; }
}

function placeBomb(s, i) {
  const p = s.p[i], x = Math.round(p.x), y = Math.round(p.y);
  if (s.b.filter((b) => b.o === i).length >= p.nb || s.b.some((b) => b.x === x && b.y === y)) return;
  const ps = [];
  s.p.forEach((q, j) => { if (q.al && Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1) ps.push(j); });
  s.b.push({ x, y, t: FUSE, o: i, r: p.rg, ps, pc: p.pc });
  s.bc++;
}

function flame(s, i) { const f = s.f.find((q) => q.i === i); if (f) f.t = FLAME; else s.f.push({ i, t: FLAME }); }

function blast(s, b) {
  s.ex++; flame(s, idx(b.x, b.y));
  for (const [dx, dy] of DIR4) for (let r = 1; r <= b.r; r++) {
    const x = b.x + dx * r, y = b.y + dy * r, i = idx(x, y), ch = s.g[i];
    if (ch === "1" || ch === "3") break;
    if (ch === "2") { s.g = setc(s.g, i, "3"); flame(s, i); if (b.pc) continue; break; }          // 상자는 타고 나서 사라진다
    const other = s.b.find((o) => o.x === x && o.y === y);
    if (other) { other.t = 0; break; }                                          // 옆 폭탄도 같이 터진다
    if (ch !== "0") { s.g = setc(s.g, i, "0"); flame(s, i); break; }          // 아이템은 타 버린다
    flame(s, i);
  }
}

// 방패가 있으면 한 번은 버틴다(벽에 깔릴 때는 소용없다)
function kill(s, p, crush) {
  if (!crush) {
    if (p.iv > 0) return;
    if (p.sh) { p.sh = 0; p.iv = 80; s.sk++; return; }
  }
  p.al = 0; p.dt = s.tick; s.dc++;
}

function step(s, masks) {
  s.tick++;
  if (s.over) s.over.t++;
  if (s.tick < START) return;
  const done = !!s.over;
  for (let i = 0; i < s.p.length; i++) {
    const p = s.p[i]; if (!p.al) continue;
    if (p.iv > 0) p.iv--;
    const m = masks[i] | 0, dir = m & 15;
    if (dir) moveP(s, i, dir, (3.4 + 0.45 * p.sp) / 60);
    if (m & A && !p.pa && !done) placeBomb(s, i);
    p.pa = m & A ? 1 : 0;
    const c = idx(Math.round(p.x), Math.round(p.y)), ch = s.g[c];
    if (ITEMS.includes(ch)) {
      if (ch === "a") p.nb = Math.min(6, p.nb + 1); else if (ch === "b") p.rg = Math.min(8, p.rg + 1); else if (ch === "c") p.sp = Math.min(4, p.sp + 1);
      else if (ch === "d") p.sh = 1; else p.pc = 1;
      s.g = setc(s.g, c, "0"); s.pk++;
    }
  }
  for (const b of s.b) { b.t--; b.ps = b.ps.filter((j) => s.p[j].al && Math.abs(s.p[j].x - b.x) < 1 && Math.abs(s.p[j].y - b.y) < 1); }
  for (let again = true; again;) {
    again = false;
    for (let k = 0; k < s.b.length; k++) if (s.b[k].t <= 0) { const b = s.b[k]; s.b.splice(k, 1); blast(s, b); again = true; break; }
  }
  for (let k = s.f.length - 1; k >= 0; k--) {
    const f = s.f[k];
    if (--f.t > 0) continue;
    if (s.g[f.i] === "3") s.g = setc(s.g, f.i, Math.random() < 0.36 ? POOL[(Math.random() * POOL.length) | 0] : "0");
    s.f.splice(k, 1);
  }
  if (done) return;
  // 시간이 지나면 벽이 바깥부터 좁혀 온다
  if (s.tick >= SHRINK_AT && (s.tick - SHRINK_AT) % SHRINK_EVERY === 0) {
    const k = (s.tick - SHRINK_AT) / SHRINK_EVERY;
    if (k < SHRINK_MAX) {
      const c = ORDER[k];
      if (s.g[c] !== "1") {
        s.g = setc(s.g, c, "1");
        s.b = s.b.filter((b) => idx(b.x, b.y) !== c); s.f = s.f.filter((f) => f.i !== c);
        for (const p of s.p) if (p.al && idx(Math.round(p.x), Math.round(p.y)) === c) kill(s, p, true);
      }
    }
  }
  const fl = new Set(s.f.map((f) => f.i));
  for (const p of s.p) if (p.al && fl.has(idx(Math.round(p.x), Math.round(p.y)))) kill(s, p);
  const alive = s.p.filter((p) => p.al);
  if (s.p.length > 1 && alive.length <= 1) s.over = { w: alive.length ? s.p.indexOf(alive[0]) : -1, t: 0 };
}

// ── 주고받기 ──
function pack(s) {
  const a = s.g.split("");
  for (const f of s.f) a[f.i] = "f";
  return {
    tick: s.tick, seats: s.seats, map: s.map, th: s.th, sk: s.sk, g: a.join(""),
    p: s.p.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, al: p.al, nb: p.nb, rg: p.rg, sp: p.sp, dt: p.dt, sh: p.sh, pc: p.pc, iv: p.iv })),
    b: s.b.map((b) => [b.x, b.y, b.t, b.o, b.r, b.pc | 0]), over: s.over, ex: s.ex, bc: s.bc, pk: s.pk, dc: s.dc,
  };
}
function adopt(v) {
  const f = [];
  for (let i = 0; i < v.g.length; i++) if (v.g[i] === "f") f.push({ i, t: 12 });
  return {
    tick: v.tick, seats: v.seats, map: v.map, th: v.th, sk: v.sk | 0, g: v.g.replace(/f/g, "0"), p: v.p.map((p) => ({ ...p, pa: 0 })),
    b: v.b.map(([x, y, t, o, r, pc]) => ({ x, y, t, o, r, pc: pc | 0, ps: [] })), f, over: v.over, ex: v.ex, bc: v.bc, pk: v.pk, dc: v.dc,
  };
}

// ── 봇 ──
const BOTS = { easy: { aggr: 0.3, see: 0.9 }, normal: { aggr: 0.6, see: 0.975 }, hard: { aggr: 0.95, see: 1 } };

function blastCells(s, x, y, r, out, pc) {
  out.add(idx(x, y));
  for (const [dx, dy] of DIR4) for (let k = 1; k <= r; k++) {
    const c = idx(x + dx * k, y + dy * k), ch = s.g[c];
    if (ch === "2" && pc) { out.add(c); continue; }      // 관통 불길은 상자를 뚫고 간다
    if (solid(ch)) break;
    out.add(c);
  }
  return out;
}

function foeInLine(s, i, x, y, r) {
  for (const [dx, dy] of DIR4) for (let k = 1; k <= r; k++) {
    const X = x + dx * k, Y = y + dy * k;
    if (solid(s.g[idx(X, Y)])) break;
    if (s.p.some((q, j) => j !== i && q.al && Math.round(q.x) === X && Math.round(q.y) === Y)) return true;
  }
  return false;
}

function bot(s, i, mem, level) {
  const p = s.p[i];
  if (!p.al || s.tick < START || s.over) return 0;
  const cfg = BOTS[level] || BOTS.normal;
  const cx = Math.round(p.x), cy = Math.round(p.y);
  if (Math.abs(p.x - cx) > 0.04 || Math.abs(p.y - cy) > 0.04) {
    // 칸 사이를 걷는 중: 그대로 가되, 막혀서 못 가면 되돌아간다
    if (mem.lx === p.x && mem.ly === p.y) { if (++mem.stuck > 8) { mem.dir = REV[mem.dir] || 0; mem.stuck = 0; } } else mem.stuck = 0;
    mem.lx = p.x; mem.ly = p.y;
    return mem.dir || 0;
  }
  mem.lx = p.x; mem.ly = p.y; mem.stuck = 0;
  const here = idx(cx, cy);
  if (mem.cell !== here || s.tick - mem.at > 40) { mem.cell = here; mem.at = s.tick; mem.roll = Math.random(); mem.see = Math.random() < cfg.see; }
  const flames = new Set(s.f.map((f) => f.i)), danger = new Set(flames);
  if (mem.see) for (const b of s.b) blastCells(s, b.x, b.y, b.r, danger, b.pc);
  const bombAt = new Set(s.b.map((b) => idx(b.x, b.y)));
  const walk = (c) => !solid(s.g[c]) && !flames.has(c) && !bombAt.has(c);
  // 가까운 목표까지 가는 첫걸음 찾기
  const search = (goal, avoid, maxD) => {
    const seen = new Set([here]), q = [[here, 0, 0]];
    for (let h = 0; h < q.length; h++) {
      const [c, first, d] = q[h];
      if (d > 0 && goal(c)) return first;
      if (d >= maxD) continue;
      const x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy, bit] of DIR4) {
        const n = idx(x + dx, y + dy);
        if (seen.has(n) || !walk(n) || (avoid && avoid.has(n))) continue;
        seen.add(n); q.push([n, first || bit, d + 1]);
      }
    }
    return 0;
  };
  let dir = 0, act = 0;
  if (danger.has(here)) dir = search((c) => !danger.has(c), null, 8);            // 위험하면 일단 피한다
  else {
    const softNear = DIR4.some(([dx, dy]) => s.g[idx(cx + dx, cy + dy)] === "2");
    const foe = foeInLine(s, i, cx, cy, p.rg);
    if (s.b.filter((b) => b.o === i).length < p.nb && !bombAt.has(here) && (foe || (softNear && mem.roll < cfg.aggr))) {
      const d2 = blastCells(s, cx, cy, p.rg, new Set(danger), p.pc);
      const esc = search((c) => !d2.has(c), null, 6);                             // 도망갈 길이 있을 때만 놓는다
      if (esc) { act = A; dir = esc; }
    }
    if (!act) {
      dir = search((c) => ITEMS.includes(s.g[c]), danger, 7)
        || search((c) => DIR4.some(([dx, dy]) => s.g[c + dx + dy * GW] === "2"), danger, 12)
        || search((c) => foeInLine(s, i, c % GW, (c / GW) | 0, p.rg), danger, 14)
        || 0;
    }
  }
  mem.dir = dir;
  return dir | act;
}

// ── 그리기 ──
let shake = 0;
const px = (x) => OX + (x + 0.5) * CELL, py = (y) => OY + (y + 0.5) * CELL;

function drawItem(ctx, ch, x, y) {
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2.5;
  rr(ctx, x - 15, y - 15, 30, 30, 8); ctx.fill(); ctx.stroke();
  if (ch === "a") { ctx.fillStyle = "#2b2d6e"; ctx.beginPath(); ctx.arc(x, y + 2, 8, 0, 7); ctx.fill(); ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + 4, y - 5); ctx.lineTo(x + 8, y - 10); ctx.stroke(); }
  else if (ch === "b") { ctx.fillStyle = "#ff7a2f"; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.quadraticCurveTo(x + 11, y, x, y + 10); ctx.quadraticCurveTo(x - 11, y, x, y - 11); ctx.fill(); ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(x, y + 3, 4, 0, 7); ctx.fill(); }
  else if (ch === "d") {      // 방패
    ctx.fillStyle = "#6ec6ff"; ctx.strokeStyle = "#3a94d9"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 8, y + 3); ctx.quadraticCurveTo(x + 5, y + 9, x, y + 11); ctx.quadraticCurveTo(x - 5, y + 9, x - 8, y + 3); ctx.lineTo(x - 9, y - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 4, y - 1); ctx.stroke();
  } else if (ch === "e") {    // 관통 불길
    ctx.fillStyle = "#e0ab68"; ctx.fillRect(x - 3, y - 9, 6, 18);
    ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 9, y); ctx.moveTo(x + 4, y - 5); ctx.lineTo(x + 10, y); ctx.lineTo(x + 4, y + 5); ctx.stroke();
  }
  else { ctx.fillStyle = "#ffc93c"; ctx.strokeStyle = "#d99a12"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 3, y - 11); ctx.lineTo(x - 7, y + 2); ctx.lineTo(x - 1, y + 2); ctx.lineTo(x - 3, y + 11); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x + 1, y - 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
}

function draw(ctx, v, env) {
  const th = THEMES[v.th | 0] || THEMES[0];
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  // 판
  ctx.fillStyle = "#2b2d6e"; rr(ctx, OX - 6, OY - 6, GW * CELL + 12, GH * CELL + 12, 12); ctx.fill();
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const ch = v.g[idx(x, y)], X = OX + x * CELL, Y = OY + y * CELL;
    ctx.fillStyle = th.f[(x + y) % 2]; ctx.fillRect(X, Y, CELL, CELL);
    if (ch === "1") {
      ctx.fillStyle = th.w[0]; ctx.fillRect(X, Y, CELL, CELL);
      ctx.fillStyle = th.w[1]; rr(ctx, X + 3, Y + 2, CELL - 6, CELL - 9, 6); ctx.fill();
    } else if (ch === "2") {
      ctx.fillStyle = th.c[0]; rr(ctx, X + 2, Y + 2, CELL - 4, CELL - 4, 6); ctx.fill();
      ctx.fillStyle = th.c[1]; rr(ctx, X + 5, Y + 4, CELL - 10, CELL - 12, 4); ctx.fill();
      ctx.strokeStyle = th.c[0]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X + 8, Y + 8); ctx.lineTo(X + CELL - 8, Y + CELL - 11); ctx.moveTo(X + CELL - 8, Y + 8); ctx.lineTo(X + 8, Y + CELL - 11); ctx.stroke();
    } else if (ITEMS.includes(ch)) drawItem(ctx, ch, X + CELL / 2, Y + CELL / 2 + Math.sin(env.t * 4 + x) * 2);
    else if (ch === "f" || ch === "3") {
      const k = 0.8 + Math.sin(env.t * 30 + x + y) * 0.12;
      ctx.fillStyle = "#ff7a2f"; rr(ctx, X + 2, Y + 2, CELL - 4, CELL - 4, 12); ctx.fill();
      ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(X + CELL / 2, Y + CELL / 2, CELL * 0.3 * k, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X + CELL / 2, Y + CELL / 2, CELL * 0.14 * k, 0, 7); ctx.fill();
    }
  }
  // 폭탄
  for (const [bx, by, bt] of v.b) {
    const k = 1 + Math.sin(bt * 0.25) * 0.08, X = px(bx), Y = py(by);
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(X, Y + 15, 14, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = bt < 40 && bt % 10 < 5 ? "#ff5d73" : "#2a2440"; ctx.beginPath(); ctx.arc(X, Y + 2, 15 * k, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(X - 5, Y - 4, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X + 6, Y - 11); ctx.quadraticCurveTo(X + 12, Y - 18, X + 15, Y - 14); ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(X + 15, Y - 14, 3 + (bt % 6 < 3 ? 1.5 : 0), 0, 7); ctx.fill();
  }
  // 선수
  v.p.forEach((p, i) => {
    if (!p.al) return;
    const q = env.prev && env.prev.p[i] ? env.prev.p[i] : p;
    const x = q.x + (p.x - q.x) * env.alpha, y = q.y + (p.y - q.y) * env.alpha, X = px(x), Y = py(y);
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(X, Y + 17, 15, 5, 0, 0, 7); ctx.fill();
    if (p.iv > 0 && v.tick % 8 < 4) ctx.globalAlpha = 0.35;      // 방패가 깨진 직후 깜빡임(잠깐 무적)
    drawMochi(ctx, X, Y, 18, parseLook(v.seats[i].look, i), { sq: Math.sin(env.t * 9 + i) * 0.04 });
    ctx.globalAlpha = 1;
    if (p.sh) { ctx.strokeStyle = "rgba(110,198,255,.95)"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(X, Y - 1, 23 + Math.sin(env.t * 6) * 1.5, 0, 7); ctx.stroke(); }
    if (i === env.me) { ctx.fillStyle = "#d6336c"; ctx.beginPath(); ctx.moveTo(X - 6, Y - 37); ctx.lineTo(X + 6, Y - 37); ctx.lineTo(X, Y - 29); ctx.fill(); }
    else label(ctx, v.seats[i].name, X, Y - 28, 12, "#2a2440", "rgba(255,255,255,.9)");
  });
  ctx.restore();

  // 양옆 선수 카드
  v.seats.forEach((seat, i) => {
    const X = i % 2 ? W - 140 : 10, Y = 62 + ((i / 2) | 0) * 168, p = v.p[i];
    ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = SEAT_DARK[i]; ctx.lineWidth = 4;
    rr(ctx, X, Y, 130, 150, 16); ctx.fill(); ctx.stroke();
    drawMochi(ctx, X + 65, Y + 52, 30, parseLook(seat.look, i));
    label(ctx, seat.name, X + 65, Y + 106, 17, i === env.me ? "#d6336c" : "#2b2d6e", null);
    label(ctx, `폭탄 ${p.nb} · 불길 ${p.rg}`, X + 65, Y + 128, 14, "#6b6480", null);
    if (p.sh || p.pc) label(ctx, [p.sh ? "방패" : "", p.pc ? "관통" : ""].filter(Boolean).join(" · "), X + 65, Y + 144, 13, "#3a94d9", null);
    if (!p.al) { ctx.fillStyle = "rgba(255,244,220,.78)"; rr(ctx, X, Y, 130, 150, 16); ctx.fill(); label(ctx, "탈락", X + 65, Y + 84, 30, "#8f93b8", "#fff"); }
  });

  // 위쪽 안내
  label(ctx, `${MAPS[v.map | 0]} · ${th.name}`, W - 12, 26, 14, th.name === "우주 기지" ? "#fff" : "#2b2d6e", null, "right");
  const left = Math.ceil((SHRINK_AT - v.tick) / 60);
  if (v.tick < START) label(ctx, "준비!", W / 2, H / 2, 80, "#ff5d73", "#fff");
  if (left > 0) label(ctx, `${left}초 뒤 벽이 좁혀 와요`, W / 2, 32, left <= 10 ? 24 : 20, left <= 10 ? "#ff5d73" : "#2b2d6e", "#fff");
  else label(ctx, "벽이 좁혀 오는 중!", W / 2, 32, 24, "#ff5d73", "#fff");
  if (v.over) {
    const w = v.over.w;
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, W / 2, H / 2 - 10, 70, "#ffc93c", "#2b2d6e");
  }
}

function fx(v, m, snd) {
  if (m.ex == null) Object.assign(m, { ex: v.ex, bc: v.bc, pk: v.pk, dc: v.dc, sk: v.sk | 0, ov: !!v.over });
  if ((v.sk | 0) !== m.sk) { m.sk = v.sk | 0; snd(520, 0.2, "triangle", 0.12, -300); }
  if (v.ex !== m.ex) { m.ex = v.ex; shake = 9; snd(90, 0.3, "sawtooth", 0.14, -40); snd(240, 0.12, "square", 0.07, -150); }
  if (v.bc !== m.bc) { m.bc = v.bc; snd(300, 0.06, "sine", 0.08, -80); }
  if (v.pk !== m.pk) { m.pk = v.pk; snd(700, 0.1, "triangle", 0.1, 300); }
  if (v.dc !== m.dc) { m.dc = v.dc; snd(400, 0.35, "sawtooth", 0.1, -300); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
  if (shake > 0) shake *= 0.86;
}

function title(v, me) {
  const w = v.over.w;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${v.seats[w].name} 승리! 한 판 더?`;
  return w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 3, action: "폭탄", overDelay: 200,
  bots: { solo: 3, local: 2 },
  fill: (mode, n) => (mode === 1 ? (n < 2 ? 1 : 0) : 4 - n),
  init, step, bot, draw, fx, title, pack, viewOf: pack, adopt,
};

export const meta = {
  local: true,
  soloText: "봇 3명과 겨뤄요. 난이도를 골라 주세요.",
  modeLabel: "빈자리",
  modes: [[0, "봇으로 채우기"], [1, "사람끼리만"]],
  role: () => "",
  hint: (n, mode) => (mode === 1 ? (n < 2 ? "혼자면 봇 하나와 붙어요." : `${n}명이 겨뤄요.`) : n < 4 ? `${n}명 + 봇 ${4 - n}명이 겨뤄요.` : "4명이 겨뤄요."),
  howto: [
    ["목표", "폭탄으로 상자를 부수고 상대를 불길에 가둬요. 마지막까지 살아남으면 승리"],
    ["조작", "이동 방향키(또는 W·A·S·D), 폭탄 놓기 스페이스"],
    ["아이템", "폭탄 그림: 한 번에 놓는 폭탄 +1 / 불꽃: 불길 길이 +1 / 번개: 빨라짐 / 방패: 불길을 한 번 막아 줌 / 화살: 불길이 상자를 뚫고 지나감"],
    ["맵", "판마다 기둥 미로·넓은 광장·십자 길·벽돌 길 가운데 하나가 나오고 배경도 바뀌어요"],
    ["주의", "내 폭탄에도 당해요. 75초가 지나면 벽이 바깥부터 좁혀 와요"],
    ["한 키보드 2인", "1P: W·A·S·D + F / 2P: 방향키 + Enter"],
  ],
};
export const start = (opts) => startHostGame(G, opts);

export const _test = G;
