// 떡 야구 — 1대1 야구. 한 사람이 던지면 다른 사람이 친다. 3회·6회·9회 중에 고른다.
// 투수: 공을 겨누고 구종(직구·커브·슬라이더·체인지업)을 골라 던진다.
// 타자: 방망이 위치를 맞추고 공이 들어오는 순간 휘두른다. 맞은 결과(안타·홈런·아웃)와 주자 진루는 저절로 계산된다.

import { startHostGame, L, R, U, D, A, B } from "./hostgame.js?v=3";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle, SEAT_DARK, SEAT_TINT } from "./kit.js?v=3";

const W = 960, H = 540, START = 100, AIM_T = 9 * 60;
const PX = 310, ZX0 = 262, ZX1 = 358, ZY0 = 300, ZY1 = 420, REL = [310, 176];
const TX0 = 200, TX1 = 420, TY0 = 262, TY1 = 458;
const PITCHES = [
  { name: "직구", dur: 34, brk: 0, rise: 0, kmh: [142, 152] },
  { name: "커브", dur: 46, brk: -44, rise: -28, kmh: [112, 122] },
  { name: "슬라이더", dur: 40, brk: 42, rise: -6, kmh: [128, 137] },
  { name: "체인지업", dur: 54, brk: 12, rise: -12, kmh: [116, 126] },
];
const BAT_W = 36, SWING_LAG = 5, WINDOW = 6;
const STADIUMS = [
  { name: "낮 경기", sky: ["#7cc9ff", "#d8f0ff"], stand: "#3d4a8a", grass: "#5dbb63", grass2: "#54b05a", dirt: "#d9a46a" },
  { name: "노을 경기", sky: ["#ff9f7a", "#ffe2a8"], stand: "#5a3a5e", grass: "#62b35e", grass2: "#58a855", dirt: "#d79a62" },
  { name: "밤 경기", sky: ["#141a45", "#2f3a7a"], stand: "#1d2350", grass: "#3f9a55", grass2: "#38904e", dirt: "#c08a58", night: true },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inZone = (x, y) => x >= ZX0 - 6 && x <= ZX1 + 6 && y >= ZY0 - 6 && y <= ZY1 + 6;
const depth = (p) => Math.pow(clamp(p, 0, 1.2), 1.6);

function init(seats, opt) {
  const innings = opt && opt.mode === 9 ? 9 : opt && opt.mode === 6 ? 6 : 3;
  return {
    tick: 0, seats, innings, inn: 1, top: true, outs: 0, balls: 0, strikes: 0, bases: [0, 0, 0], score: [0, 0], line: [[], []],
    ph: 0, tm: 0, tl: AIM_T, pt: 0, tg: { x: PX, y: 360 }, bx: PX, sw: -1, lift: 0, res: null, kmh: 0,
    th: (Math.random() * STADIUMS.length) | 0, over: null, pa: [0, 0], pb: [0, 0],
    pc: 0, ptc: 0, swc: 0, rc: 0, ch: 0, sc: 0,
  };
}

function addRuns(s, n) {
  const t = s.top ? 0 : 1;
  s.line[t][s.inn - 1] = (s.line[t][s.inn - 1] || 0) + n;
  if (n) { s.score[t] += n; s.sc++; }
}

// 맞은 공이 어떻게 되었나 (q 맞은 정도, ang 방향, lift 뜬 정도)
function judge(r) {
  const { q, ang, lift } = r, X = Math.random();
  if (q < 0.3 || Math.abs(ang) > 42) return { kind: "foul", dist: 140 };
  if (lift > 0.35) {                                   // 뜬공
    if (q > 0.9 && X < 0.45 + (q - 0.9) * 4) return { kind: "hr", air: 1, dist: 400 + q * 50 };
    if (q > 0.72) return X < 0.25 ? { kind: "double", air: 1, dist: 330 } : X < 0.3 ? { kind: "triple", air: 1, dist: 360 } : { kind: "fly", air: 1, dist: 310 };
    if (q > 0.45) return X < 0.15 ? { kind: "single", air: 1, dist: 190 } : { kind: "fly", air: 1, dist: 250 };
    return { kind: "pop", air: 1, dist: 110 };
  }
  if (lift < -0.3) {                                   // 땅볼
    if (q > 0.75 && X < 0.4) return { kind: "single", dist: 170 };
    if (q > 0.5 && X < 0.15) return { kind: "single", dist: 150 };
    return { kind: "ground", dist: 100 };
  }
  if (q > 0.85) return X < 0.3 ? { kind: "double", dist: 290 } : X < 0.34 ? { kind: "triple", dist: 330 } : X < 0.4 ? { kind: "hr", air: 1, dist: 395 } : X < 0.75 ? { kind: "single", dist: 220 } : { kind: "line", dist: 200 };      // 직선타
  if (q > 0.55) return X < 0.45 ? { kind: "single", dist: 200 } : { kind: "line", dist: 170 };
  return X < 0.22 ? { kind: "single", dist: 160 } : { kind: "line", dist: 150 };
}

// 결과를 점수·주자·아웃에 반영하고 알림 글을 돌려준다
function play(s, kind) {
  const b = s.bases.slice();
  let runs = 0, text = "";
  if (kind === "single") { runs = b[2]; s.bases = [1, b[0], 0]; if (b[1]) { if (Math.random() < 0.6) runs++; else s.bases[2] = 1; } text = "안타!"; }
  else if (kind === "double") { runs = b[2] + b[1]; s.bases = [0, 1, 0]; if (b[0]) { if (Math.random() < 0.4) runs++; else s.bases[2] = 1; } text = "2루타!"; }
  else if (kind === "triple") { runs = b[0] + b[1] + b[2]; s.bases = [0, 0, 1]; text = "3루타!"; }
  else if (kind === "hr") { runs = b[0] + b[1] + b[2] + 1; s.bases = [0, 0, 0]; text = runs === 4 ? "만루 홈런!!" : "홈런!!"; }
  else if (kind === "walk") {
    if (!b[0]) s.bases[0] = 1; else if (!b[1]) s.bases[1] = 1; else if (!b[2]) s.bases[2] = 1; else runs = 1;
    text = "볼넷";
  } else if (kind === "so") { s.outs++; text = "삼진 아웃!"; }
  else if (kind === "ground") {
    s.outs++;
    if (s.outs < 3 && b[0] && Math.random() < 0.35) { s.outs++; s.bases[0] = 0; text = "병살!"; }
    else {
      text = "땅볼 아웃";
      if (s.outs < 3) {
        if (b[0]) { if (b[1]) { if (b[2]) runs++; s.bases[2] = 1; } s.bases[1] = 1; s.bases[0] = 0; }
        else if (b[2] && Math.random() < 0.4) { runs++; s.bases[2] = 0; }
      }
    }
  } else if (kind === "fly") {
    s.outs++;
    if (s.outs < 3 && b[2] && Math.random() < 0.6) { runs++; s.bases[2] = 0; text = "희생 뜬공!"; } else text = "뜬공 아웃";
  } else if (kind === "pop") { s.outs++; text = "내야 뜬공 아웃"; }
  else if (kind === "line") { s.outs++; text = "직선타 아웃"; }
  if (s.outs >= 3) runs = 0;
  addRuns(s, runs);
  return { runs, text };
}

const HIT = { single: 1, double: 1, triple: 1, hr: 1 };
const LEN = { hr: 200, single: 130, double: 140, triple: 150, ground: 100, fly: 110, pop: 100, line: 100, foul: 75, strike: 55, swing: 55, ball: 55, so: 90, walk: 90 };

function setRes(s, res) { s.res = res; s.ph = 2; s.tm = 0; s.rc++; }

function contact(s, P) {
  const e = s.sw + SWING_LAG - P.dur;                  // + 늦음, - 빠름
  if (Math.abs(e) > WINDOW) return null;
  if (s.tg.y < ZY0 - 40 || s.tg.y > ZY1 + 40) return null;      // 너무 높거나 낮은 공은 못 맞힌다
  const hx = Math.abs(s.bx - s.tg.x);
  if (hx > BAT_W) return null;
  const qt = 1 - Math.abs(e) / (WINDOW + 1), qx = 1 - hx / (BAT_W + 4);
  const q = clamp(qt * 0.55 + qx * 0.45 + (Math.random() - 0.5) * 0.1, 0, 1);
  const ang = e * 8 + (s.tg.x - s.bx) * 0.35 + (Math.random() - 0.5) * 22;      // - 왼쪽(당겨 침), + 오른쪽(밀어 침)
  const lift = ((360 - s.tg.y) / 120) * 0.5 + s.lift * 0.7 + (Math.random() - 0.5) * 0.6;
  return { q, ang, lift };
}

function resolveHit(s, r) {
  const o = judge(r);
  if (o.kind === "foul") {
    if (s.strikes < 2) s.strikes++;
    setRes(s, { kind: "foul", contact: 1, text: "파울", ang: r.ang > 0 ? 58 : -58, dist: o.dist, air: 1, len: LEN.foul, runs: 0 });
    return;
  }
  const pl = play(s, o.kind);
  s.balls = 0; s.strikes = 0;
  setRes(s, { kind: o.kind, contact: 1, text: pl.text, ang: clamp(r.ang, -44, 44), dist: o.dist, air: o.air || 0, len: LEN[o.kind] + (pl.runs ? 20 : 0), runs: pl.runs });
}

function resolveNoContact(s) {
  const swung = s.sw >= 0, zone = inZone(s.tg.x, s.tg.y);
  if (swung || zone) {
    s.strikes++;
    if (s.strikes >= 3) { const pl = play(s, "so"); s.balls = 0; s.strikes = 0; setRes(s, { kind: "so", text: pl.text, len: LEN.so, runs: 0 }); }
    else setRes(s, { kind: swung ? "swing" : "strike", text: swung ? "헛스윙!" : "스트라이크!", len: LEN.strike, runs: 0 });
  } else {
    s.balls++;
    if (s.balls >= 4) { const pl = play(s, "walk"); s.balls = 0; s.strikes = 0; setRes(s, { kind: "walk", text: pl.text, len: LEN.walk + (pl.runs ? 20 : 0), runs: pl.runs }); }
    else setRes(s, { kind: "ball", text: "볼", len: LEN.ball, runs: 0 });
  }
}

function nextPitch(s) { s.ph = 0; s.tm = 0; s.tl = AIM_T; s.tg = { x: PX, y: 360 }; s.sw = -1; s.lift = 0; }

function afterPlay(s) {
  const lead = s.score[1] - s.score[0];
  if (!s.top && s.inn >= s.innings && lead > 0) { s.over = { w: 1, t: 0 }; return; }      // 끝내기
  if (s.outs < 3) { nextPitch(s); return; }
  if (s.top) {
    if (s.inn >= s.innings && lead > 0) { s.over = { w: 1, t: 0 }; return; }            // 마지막 회 말은 안 해도 된다
    s.top = false;
  } else {
    if (s.inn >= s.innings && lead !== 0) { s.over = { w: lead > 0 ? 1 : 0, t: 0 }; return; }
    if (s.inn >= s.innings + 3) { s.over = { w: -1, t: 0 }; return; }                    // 연장 3회까지 비기면 무승부
    s.inn++; s.top = true;
  }
  s.outs = 0; s.bases = [0, 0, 0]; s.balls = 0; s.strikes = 0;
  nextPitch(s); s.ph = 3; s.ch++;
}

function step(s, masks) {
  s.tick++;
  if (s.over) { s.over.t++; return; }
  if (s.tick < START) return;
  const bi = s.top ? 0 : 1, pi = 1 - bi, mb = masks[bi] | 0, mp = masks[pi] | 0;
  const aB = mb & A && !s.pa[bi], aP = mp & A && !s.pa[pi], bP = mp & B && !s.pb[pi];
  s.pa[bi] = mb & A ? 1 : 0; s.pa[pi] = mp & A ? 1 : 0; s.pb[bi] = mb & B ? 1 : 0; s.pb[pi] = mp & B ? 1 : 0;
  if (s.ph <= 1 && s.sw < 0) {                          // 타자: 방망이 위치
    if (mb & L) s.bx -= 4;
    if (mb & R) s.bx += 4;
    s.bx = clamp(s.bx, ZX0 - 30, ZX1 + 30);
  }
  if (s.ph === 0) {                                     // 투수: 겨누고 구종 고르고 던지기
    if (mp & L) s.tg.x -= 3.2;
    if (mp & R) s.tg.x += 3.2;
    if (mp & U) s.tg.y -= 3.2;
    if (mp & D) s.tg.y += 3.2;
    s.tg.x = clamp(s.tg.x, TX0, TX1); s.tg.y = clamp(s.tg.y, TY0, TY1);
    if (bP) { s.pt = (s.pt + 1) % PITCHES.length; s.ptc++; }
    if (aP || --s.tl <= 0) {
      const P = PITCHES[s.pt];
      s.ph = 1; s.tm = 0; s.sw = -1; s.kmh = Math.round(P.kmh[0] + Math.random() * (P.kmh[1] - P.kmh[0])); s.pc++;
    }
  } else if (s.ph === 1) {                              // 공이 날아오는 중
    const P = PITCHES[s.pt];
    s.tm++;
    if (aB && s.sw < 0 && s.tm > 6) { s.sw = s.tm; s.lift = (mb & U ? 1 : 0) - (mb & D ? 1 : 0); s.swc++; }
    if (s.sw >= 0 && s.tm === s.sw + SWING_LAG) { const r = contact(s, P); if (r) { resolveHit(s, r); return; } }
    if (s.tm >= P.dur + 12) resolveNoContact(s);
  } else if (s.ph === 2) {
    if (++s.tm >= s.res.len) afterPlay(s);
  } else if (++s.tm >= 100) { s.ph = 0; s.tm = 0; }      // 공수 교대
}

// ── 봇 ──
const BOTS = {
  easy: { read: 0.6, err: 30, tErr: 7, swingZ: 0.68, chase: 0.42, zone: 0.5, mix: 0.4 },
  normal: { read: 0.45, err: 20, tErr: 5, swingZ: 0.78, chase: 0.3, zone: 0.6, mix: 0.6 },
  hard: { read: 0.32, err: 12, tErr: 3.5, swingZ: 0.85, chase: 0.2, zone: 0.66, mix: 0.75 },
};

function bot(s, i, mem, level) {
  if (s.over || s.tick < START) return 0;
  const cfg = BOTS[level] || BOTS.normal, bi = s.top ? 0 : 1, pid = s.pc + "/" + s.ch + "/" + s.rc;
  let m = 0;
  if (i !== bi) {                                       // 투수
    if (s.ph !== 0) return 0;
    if (mem.pid !== pid) {
      mem.pid = pid; mem.w = 35 + Math.random() * 55;
      const type = Math.random() < cfg.mix ? 1 + ((Math.random() * 3) | 0) : 0;
      mem.cycles = (type - s.pt + PITCHES.length) % PITCHES.length;
      if (Math.random() < cfg.zone) { mem.tx = ZX0 + 8 + Math.random() * (ZX1 - ZX0 - 16); mem.ty = ZY0 + 8 + Math.random() * (ZY1 - ZY0 - 16); }
      else { const side = Math.random(); mem.tx = side < 0.5 ? (Math.random() < 0.5 ? ZX0 - 18 - Math.random() * 30 : ZX1 + 18 + Math.random() * 30) : ZX0 + Math.random() * (ZX1 - ZX0); mem.ty = side >= 0.5 ? (Math.random() < 0.5 ? ZY0 - 16 - Math.random() * 26 : ZY1 + 16 + Math.random() * 26) : ZY0 + Math.random() * (ZY1 - ZY0); }
    }
    if (mem.cycles > 0) { if (s.tick % 6 === 0) { mem.cycles--; return B; } return 0; }
    if (mem.tx > s.tg.x + 3) m |= R; else if (mem.tx < s.tg.x - 3) m |= L;
    if (mem.ty > s.tg.y + 3) m |= D; else if (mem.ty < s.tg.y - 3) m |= U;
    if (--mem.w <= 0 && !m) return A;
    return m;
  }
  if (s.ph === 0) {                                     // 타자: 기다리는 동안 방망이를 가운데로
    if (mem.hid !== pid) { mem.hid = pid; mem.hold = PX + (Math.random() - 0.5) * 24; }
    if (mem.hold > s.bx + 3) m |= R; else if (mem.hold < s.bx - 3) m |= L;
    return m;
  }
  if (s.ph === 1) {
    const P = PITCHES[s.pt], p = s.tm / P.dur;
    if (mem.bid !== pid) { mem.bid = pid; mem.decided = false; }
    if (!mem.decided && p >= cfg.read) {
      mem.decided = true;
      mem.swing = Math.random() < (inZone(s.tg.x, s.tg.y) ? cfg.swingZ : cfg.chase);
      mem.px = s.tg.x + (Math.random() - 0.5) * 2 * cfg.err;
      mem.at = P.dur - SWING_LAG + Math.round((Math.random() - 0.5) * 2 * cfg.tErr);
      if (s.pt === 3 && Math.random() < (level === "hard" ? 0.15 : 0.4)) mem.at -= 5 + Math.random() * 6;      // 체인지업에 속는다
      mem.lift = Math.random() < 0.4 ? U : Math.random() < 0.4 ? D : 0;
    }
    if (mem.decided) {
      if (mem.px > s.bx + 3) m |= R; else if (mem.px < s.bx - 3) m |= L;
      if (mem.swing && s.sw < 0 && s.tm >= mem.at) m |= A | mem.lift;
    }
  }
  return m;
}

// ── 그리기 ──
function ballPos(v) {
  const P = PITCHES[v.pt], p = v.tm / P.dur, d = depth(p);
  const x = REL[0] + (v.tg.x - REL[0]) * d + P.brk * 4 * d * (1 - d);
  const y = REL[1] + (v.tg.y - REL[1]) * d + P.rise * 4 * d * (1 - d);
  return { x, y, r: 3 + 10 * Math.pow(clamp(d, 0, 1.1), 1.2), p };
}

function drawBall(ctx, x, y, r) {
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#c9c2b8"; ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  if (r > 5) { ctx.strokeStyle = "#e8453c"; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.arc(x - r * 0.9, y, r * 0.75, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x + r * 0.9, y, r * 0.75, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke(); }
}

function drawPitchView(ctx, v, env) {
  const st = STADIUMS[v.th | 0] || STADIUMS[0], bi = v.top ? 0 : 1, pi = 1 - bi;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 620, H); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, st.sky[0]); g.addColorStop(1, st.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 620, 140);
  if (st.night) { ctx.fillStyle = "rgba(255,255,255,.8)"; for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.arc((i * 137) % 620, (i * 41) % 60, 1.2, 0, 7); ctx.fill(); } }
  for (const x of [60, 560]) { ctx.fillStyle = "#2b2d6e"; ctx.fillRect(x - 3, 14, 6, 60); ctx.fillStyle = st.night ? "#fff8d0" : "#fffdf0"; rr(ctx, x - 22, 8, 44, 16, 4); ctx.fill(); }
  ctx.fillStyle = st.stand; ctx.fillRect(0, 62, 620, 66);
  const crowd = ["#ff9db5", "#ffc93c", "#8ecbff", "#9bd88a", "#fff", "#c3a6ff"];
  for (let r2 = 0; r2 < 4; r2++) for (let x = 6 + (r2 % 2) * 7; x < 620; x += 14) { ctx.fillStyle = crowd[(x * 7 + r2 * 3) % crowd.length]; ctx.beginPath(); ctx.arc(x, 72 + r2 * 15 + Math.sin(env.t * 4 + x) * (v.ph === 2 && HIT[v.res && v.res.kind] ? 2.5 : 0.4), 4.2, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#2b2d6e"; ctx.fillRect(0, 124, 620, 8);
  ctx.fillStyle = st.grass; ctx.fillRect(0, 132, 620, H);
  ctx.fillStyle = st.grass2; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(310, 600); ctx.lineTo(k * 100 - 40, 132); ctx.lineTo(k * 100 + 10, 132); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = st.dirt; ctx.beginPath(); ctx.moveTo(310, 150); ctx.lineTo(590, 340); ctx.lineTo(310, 560); ctx.lineTo(30, 340); ctx.closePath(); ctx.fill();
  ctx.fillStyle = st.grass; ctx.beginPath(); ctx.moveTo(310, 222); ctx.lineTo(470, 330); ctx.lineTo(310, 452); ctx.lineTo(150, 330); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(310, 482); ctx.lineTo(-30, 230); ctx.moveTo(310, 482); ctx.lineTo(650, 230); ctx.stroke();
  for (const [bx, by] of [[470, 330], [310, 222], [150, 330]]) { ctx.fillStyle = "#fff"; ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore(); }
  // 마운드와 투수
  ctx.fillStyle = st.dirt; ctx.beginPath(); ctx.ellipse(310, 196, 50, 15, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fillRect(296, 193, 28, 4);
  const wind = v.ph === 1 && v.tm < 10 ? Math.sin((v.tm / 10) * Math.PI) : 0;
  drawMochi(ctx, 310, 168 - wind * 8, 22, parseLook(v.seats[pi].look, pi), { sq: -wind * 0.15, open: wind > 0.3 });
  ctx.strokeStyle = SEAT_DARK[pi]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(310, 168 - wind * 8, 24, 0, 7); ctx.stroke();
  label(ctx, v.seats[pi].name + " (투수)", 310, 136, 13, "#fff", "rgba(43,45,110,.85)");
  if (v.ph >= 1 && v.kmh) label(ctx, `${PITCHES[v.pt].name} ${v.kmh}km/h`, 400, 186, 14, "#2b2d6e", "rgba(255,255,255,.9)", "left");
  // 홈 플레이트와 스트라이크 존
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#c9c2b8"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(284, 470); ctx.lineTo(336, 470); ctx.lineTo(336, 482); ctx.lineTo(310, 494); ctx.lineTo(284, 482); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]); ctx.strokeRect(ZX0, ZY0, ZX1 - ZX0, ZY1 - ZY0); ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5;
  for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(ZX0 + ((ZX1 - ZX0) * k) / 3, ZY0); ctx.lineTo(ZX0 + ((ZX1 - ZX0) * k) / 3, ZY1); ctx.moveTo(ZX0, ZY0 + ((ZY1 - ZY0) * k) / 3); ctx.lineTo(ZX1, ZY0 + ((ZY1 - ZY0) * k) / 3); ctx.stroke(); }
  // 투수가 겨눈 곳 (투수에게만)
  if (v.ph === 0 && v.tick >= START && (env.me === pi || env.me < 0)) {
    const t = v.tg, pulse = 12 + Math.sin(env.t * 8) * 2;
    ctx.strokeStyle = SEAT_DARK[pi]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x, t.y, pulse, 0, 7); ctx.moveTo(t.x - 20, t.y); ctx.lineTo(t.x + 20, t.y); ctx.moveTo(t.x, t.y - 20); ctx.lineTo(t.x, t.y + 20); ctx.stroke();
    label(ctx, PITCHES[v.pt].name, t.x, t.y - 26, 15, SEAT_DARK[pi], "#fff");
  }
  // 공
  if (v.ph === 1) {
    const b = ballPos(v);
    if (b.p <= 1.02) { ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.beginPath(); ctx.ellipse(b.x, 200 + (480 - 200) * depth(b.p), b.r, b.r * 0.35, 0, 0, 7); ctx.fill(); drawBall(ctx, b.x, b.y, b.r); }
    else { ctx.fillStyle = "#8a5a3c"; ctx.beginPath(); ctx.arc(v.tg.x, v.tg.y, 16, 0, 7); ctx.fill(); drawBall(ctx, v.tg.x, v.tg.y, 9); }
  } else if (v.ph === 2 && v.res) {
    const rs = v.res, k = v.tm / 40;
    if (rs.contact) {
      const up = Math.min(1, k), x = PX + Math.sin((rs.ang * Math.PI) / 180) * up * (rs.kind === "foul" ? 420 : 300), y = 400 - up * (rs.air ? 330 : 120) + (rs.air ? 0 : up * 60);
      if (up < 1) drawBall(ctx, x, y, Math.max(2, 12 - up * 10));
    } else if (rs.kind !== "walk" || v.tm < 30) { ctx.fillStyle = "#8a5a3c"; ctx.beginPath(); ctx.arc(v.tg.x, v.tg.y, 16, 0, 7); ctx.fill(); drawBall(ctx, v.tg.x, v.tg.y, 9); }
  }
  // 타자
  const bl = parseLook(v.seats[bi].look, bi), hx = 238, hy = 402;
  let ang = -2.3;
  if (v.sw >= 0 && v.ph >= 1) ang = -2.3 + clamp((v.tm - v.sw + (v.ph === 2 ? 20 : 0)) / 9, 0, 1) * 3.4;
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(214, 446, 32, 9, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  ctx.fillStyle = "#c98a4a"; ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 2.5; rr(ctx, 0, -5, 96, 10, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2b2d6e"; ctx.fillRect(0, -5, 14, 10);
  ctx.restore();
  drawMochi(ctx, 214, 412, 32, bl, { ang: -0.6, open: v.sw >= 0 && v.ph >= 1 });
  ctx.strokeStyle = SEAT_DARK[bi]; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(214, 412, 34, 0, 7); ctx.stroke();
  // 방망이로 맞힐 위치
  if (v.ph <= 1 && v.tick >= START) {
    ctx.strokeStyle = SEAT_DARK[bi]; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(v.bx - BAT_W, ZY1 + 24); ctx.lineTo(v.bx + BAT_W, ZY1 + 24); ctx.moveTo(v.bx - BAT_W, ZY1 + 16); ctx.lineTo(v.bx - BAT_W, ZY1 + 32); ctx.moveTo(v.bx + BAT_W, ZY1 + 16); ctx.lineTo(v.bx + BAT_W, ZY1 + 32); ctx.stroke();
    ctx.fillStyle = SEAT_DARK[bi]; ctx.beginPath(); ctx.moveTo(v.bx - 6, ZY1 + 12); ctx.lineTo(v.bx + 6, ZY1 + 12); ctx.lineTo(v.bx, ZY1 + 20); ctx.fill();
  }
  label(ctx, v.seats[bi].name + " (타자)", 214, 470, 13, "#fff", "rgba(43,45,110,.85)");
  // 결과 글
  if (v.ph === 2 && v.res) {
    const rs = v.res, pop = Math.min(1, v.tm / 8), big = rs.kind === "hr";
    if (big) {      // 홈런 불꽃
      for (let k2 = 0; k2 < 5; k2++) {
        const t2 = (v.tm - k2 * 18) / 40;
        if (t2 < 0 || t2 > 1) continue;
        const cx = 80 + ((k2 * 131) % 460), cy = 40 + ((k2 * 53) % 70), cols = ["#ff5d73", "#ffc93c", "#7cc6fe", "#8ed081", "#fff"];
        ctx.globalAlpha = 1 - t2;
        for (let a = 0; a < 12; a++) { const an = (a / 12) * 6.283; ctx.fillStyle = cols[(a + k2) % 5]; ctx.beginPath(); ctx.arc(cx + Math.cos(an) * t2 * 46, cy + Math.sin(an) * t2 * 46, 3.5, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
    const col = HIT[rs.kind] ? (big ? "#ffc93c" : "#ff5d73") : rs.kind === "ball" || rs.kind === "walk" ? "#2f9e5a" : "#2b2d6e";
    label(ctx, rs.text, 310, 268, (big ? 64 : 46) * (0.6 + pop * 0.4), col, "#fff");
    if (rs.runs) label(ctx, `+${rs.runs}점!`, 310, 310, 26, "#ff5d73", "#fff");
  }
  if (v.ph === 3) { ctx.fillStyle = "rgba(43,45,110,.7)"; ctx.fillRect(0, 230, 620, 70); label(ctx, `공수 교대! ${v.inn}회 ${v.top ? "초" : "말"}`, 310, 278, 36, "#fff", null); }
  ctx.restore();
}

function drawPanel(ctx, v, env) {
  const X = 632, bi = v.top ? 0 : 1;
  ctx.fillStyle = "#fffdf6"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 3; rr(ctx, X, 8, W - X - 8, H - 16, 16); ctx.fill(); ctx.stroke();
  // 점수판
  const cols = Math.max(v.innings, v.inn), nameW = 74, totW = 34, cw = Math.min(26, (W - X - 28 - nameW - totW) / cols), y0 = 22;
  ctx.fillStyle = "#2b2d6e"; rr(ctx, X + 10, y0, W - X - 28, 92, 10); ctx.fill();
  for (let c = 0; c < cols; c++) {
    const x = X + 14 + nameW + c * cw + cw / 2, on = c === v.inn - 1;
    label(ctx, String(c + 1), x, y0 + 20, 12, on ? "#ffc93c" : "rgba(255,255,255,.6)", null);
    for (let t = 0; t < 2; t++) { const r2 = v.line[t][c]; const shown = r2 != null || (c < v.inn - 1) || (c === v.inn - 1 && (t === 0 || !v.top)); label(ctx, shown ? String(r2 || 0) : "", x, y0 + 50 + t * 28, 15, "#fff", null); }
  }
  label(ctx, "점", X + W - X - 32, y0 + 20, 12, "#ffc93c", null);
  for (let t = 0; t < 2; t++) {
    const name = v.seats[t].name, y = y0 + 50 + t * 28;
    ctx.fillStyle = SEAT_TINT[t]; ctx.beginPath(); ctx.arc(X + 22, y - 5, 6, 0, 7); ctx.fill();
    label(ctx, name.length > 4 ? name.slice(0, 4) + "…" : name, X + 32, y, 14, t === bi ? "#ffc93c" : "#fff", null, "left");
    label(ctx, String(v.score[t]), X + W - X - 32, y, 18, "#ffc93c", null);
  }
  // 회·카운트
  label(ctx, `${v.inn}회 ${v.top ? "초 ▲" : "말 ▼"}`, X + 16, 146, 22, "#2b2d6e", null, "left");
  label(ctx, v.inn > v.innings ? "연장전" : `${v.innings}회 경기`, X + W - X - 22, 146, 13, "#6b6480", null, "right");
  const lights = [["B", v.balls, 3, "#2f9e5a"], ["S", v.strikes, 2, "#ffc93c"], ["O", v.outs, 2, "#ff5d73"]];
  lights.forEach(([nm, n, max, col], k) => {
    const y = 174 + k * 24;
    label(ctx, nm, X + 22, y + 6, 15, "#2b2d6e", null);
    for (let j = 0; j < max; j++) { ctx.fillStyle = j < n ? col : "rgba(43,45,110,.15)"; ctx.beginPath(); ctx.arc(X + 44 + j * 20, y, 7, 0, 7); ctx.fill(); }
  });
  // 미니 야구장
  const hx = X + 160, hy = 500, rad = 150, sc = rad / 400;
  ctx.save(); ctx.beginPath(); ctx.rect(X + 4, 230, W - X - 16, 280); ctx.clip();
  ctx.fillStyle = "#5dbb63"; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, rad, -Math.PI / 2 - Math.PI / 4, -Math.PI / 2 + Math.PI / 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, rad, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke();
  ctx.fillStyle = "#d9a46a"; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, 62, -Math.PI * 0.75, -Math.PI * 0.25); ctx.closePath(); ctx.fill();
  const bd = 90 * sc, base = (k) => [hx + [1, 0, -1][k] * bd * 0.707, hy - [1, 2, 1][k] * bd * 0.707];
  ctx.fillStyle = "#5dbb63"; ctx.beginPath(); ctx.moveTo(hx, hy - 6); ctx.lineTo(base(0)[0] - 6, base(0)[1]); ctx.lineTo(base(1)[0], base(1)[1] + 6); ctx.lineTo(base(2)[0] + 6, base(2)[1]); ctx.closePath(); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const [x, y] = base(k), on = v.bases[k];
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = on ? "#ffc93c" : "#fff"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2.5; ctx.fillRect(-7, -7, 14, 14); ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
    if (on) drawMochi(ctx, x, y - 14, 9, parseLook(v.seats[bi].look, bi));
  }
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(hx - 6, hy - 4); ctx.lineTo(hx + 6, hy - 4); ctx.lineTo(hx + 6, hy + 2); ctx.lineTo(hx, hy + 7); ctx.lineTo(hx - 6, hy + 2); ctx.closePath(); ctx.fill();
  if (v.ph === 2 && v.res && v.res.contact) {      // 공이 날아간 길
    const rs = v.res, f = Math.min(1, v.tm / 50), an = (rs.ang * Math.PI) / 180, dist = rs.dist * sc * f;
    const x = hx + Math.sin(an) * dist, y = hy - Math.cos(an) * dist - (rs.air ? Math.sin(f * Math.PI) * 30 : 0);
    ctx.strokeStyle = "rgba(43,45,110,.35)"; ctx.setLineDash([3, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, hy);
    for (let k = 1; k <= 12; k++) { const ff = (f * k) / 12; ctx.lineTo(hx + Math.sin(an) * rs.dist * sc * ff, hy - Math.cos(an) * rs.dist * sc * ff - (rs.air ? Math.sin(ff * Math.PI) * 30 : 0)); }
    ctx.stroke(); ctx.setLineDash([]);
    drawBall(ctx, x, y, 5);
  }
  ctx.restore();
}

function draw(ctx, v, env) {
  ctx.fillStyle = "#fff4dc"; ctx.fillRect(0, 0, W, H);
  drawPitchView(ctx, v, env);
  drawPanel(ctx, v, env);
  const bi = v.top ? 0 : 1, pi = 1 - bi;
  if (v.tick < START) label(ctx, "플레이 볼!", 310, 290, 56, "#ff5d73", "#fff");
  else if (!v.over && env.me >= 0) {
    let tip = "";
    if (env.me === pi && v.ph === 0) tip = env.touch ? "방향 버튼으로 겨누기 · [구종] 바꾸기 · [쾅] 던지기" : "방향키 겨누기 · Q 구종 바꾸기 · 스페이스 던지기";
    if (env.me === bi && v.ph <= 1) tip = env.touch ? "◀▶ 방망이 위치 · 공이 오면 [쾅]! (▲ 띄우기 ▼ 굴리기)" : "←→ 방망이 위치 · 공이 오면 스페이스! (↑ 띄우기 ↓ 굴리기)";
    if (tip) label(ctx, tip, 310, H - 12, 15, "#fff", "rgba(43,45,110,.85)");
    if (env.me === pi && v.ph === 0) label(ctx, `${Math.ceil(v.tl / 60)}초`, 590, 160, 16, "#fff", "rgba(43,45,110,.85)", "right");
  }
  if (v.over) {
    const w = v.over.w;
    ctx.fillStyle = "rgba(255,244,220,.55)"; ctx.fillRect(0, 0, 620, H);
    label(ctx, w < 0 ? "무승부!" : w === env.me ? "이겼다!" : `${v.seats[w].name} 승리!`, 310, 260, 64, "#ffc93c", "#2b2d6e");
    label(ctx, `${v.score[0]} : ${v.score[1]}`, 310, 312, 34, "#2b2d6e", "#fff");
  }
}

function fx(v, m, snd, me) {
  if (m.pc == null) Object.assign(m, { pc: v.pc, ptc: v.ptc, swc: v.swc, rc: v.rc, ch: v.ch, st: 0, ov: !!v.over });
  if (!m.st && v.tick >= START) { m.st = 1; snd.whistle(); }
  if (v.pc !== m.pc) { m.pc = v.pc; snd.whoosh(1.1); }
  if (v.ptc !== m.ptc) { m.ptc = v.ptc; snd.pop(); }
  if (v.swc !== m.swc) { m.swc = v.swc; snd.whoosh(0.9); }
  if (v.rc !== m.rc) {
    m.rc = v.rc;
    const k = v.res && v.res.kind;
    if (v.res && v.res.contact) { snd.clack(2); snd.thud(0.7); }       // 딱!
    else snd.thud(0.8);                                                  // 미트에 퍽
    if (k === "hr") { snd.boom(0.7); snd.cheer(); jingle(snd, [523, 659, 784, 1047, 1319], 110); }
    else if (HIT[k]) { snd.cheer(); jingle(snd, [659, 880], 90); }
    else if (k === "so") jingle(snd, [523, 392], 140);
    else if (k === "walk") snd.coin();
  }
  if (v.ch !== m.ch) { m.ch = v.ch; jingle(snd, [440, 554, 659], 110); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [523, 659, 784, 1047], 130); }
}

function title(v, me) {
  const w = v.over.w;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${v.seats[w].name} 승리! 한 판 더?`;
  return w === me ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

const G = {
  W, H, sendEvery: 2, action: "쾅", action2: "구종", overDelay: 240,
  bots: { solo: 1, local: 0 },
  cap: () => 2,
  fill: (mode, n) => (n < 2 ? 1 : 0),
  hurry: (v) => v.inn >= v.innings && !v.top && v.tick >= START,
  init, step, bot, draw, fx, title,
};

export const meta = {
  local: true,
  soloText: "봇과 1대1 야구. 경기 길이와 난이도를 골라 주세요.",
  modeLabel: "경기 길이",
  modes: [[0, "3회"], [6, "6회"], [9, "9회"]],
  soloModes: [[0, "3회"], [6, "6회"], [9, "9회"]],
  role: (slot) => (slot === 0 ? "먼저 공격" : slot === 1 ? "먼저 수비" : "관전"),
  hint: (n, mode) => `${mode === 9 ? 9 : mode === 6 ? 6 : 3}회 경기 · ` + (n === 1 ? "혼자 시작하면 봇과 붙어요." : n === 2 ? "1대1로 번갈아 던지고 쳐요." : "두 사람이 하고 나머지는 관전해요."),
  howto: [
    ["목표", "번갈아 던지고 쳐요. 정한 회(3·6·9회)가 끝났을 때 점수가 많으면 승리. 비기면 연장전(최대 3회)"],
    ["투수", "방향키로 공을 겨누고 Q로 구종(직구·커브·슬라이더·체인지업)을 바꾼 뒤 스페이스로 던져요. 점선 상자(스트라이크 존) 밖으로 던지면 볼"],
    ["타자", "←→로 방망이 위치(아래 표시)를 공이 올 곳에 맞추고, 공이 들어오는 순간 스페이스! ↑를 누르고 치면 뜬공(홈런 노리기), ↓는 땅볼"],
    ["규칙", "스트라이크 3개면 삼진, 볼 4개면 볼넷, 아웃 3개면 공수 교대. 안타·홈런과 주자는 저절로 움직여요"],
    ["한 키보드 2인", "1P: W·A·S·D + F, 구종 Q / 2P: 방향키 + Enter, 구종 마침표(.)"],
    ["휴대폰", "방향 버튼, [구종], [쾅](던지기·치기)"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
