// 통통 배구 — 말랑한 떡 친구들이 하는 2~4인 배구
// 게임 계산은 "방장" 한 명의 브라우저가 맡고, 나머지는 결과를 받아 그린다.
// 혼자 하기·한 키보드 2인은 서버 없이 돌아간다.

import { drawMochi as paintMochi, parseLook } from "../avatar.js?v=3";
import { sound, jingle, makeLoop, fit, keyboard, touchPad, rr, BOT_NAMES, SEAT_DARK, emit } from "./kit.js?v=3";

import { lazy3d } from "./lazy3d.js?v=1";
const stage = lazy3d("./volley3d.js?v=1");

const W = 960, H = 540, GROUND = 470, NET_X = 480, NET_HW = 7, NET_TOP = GROUND - 165;
const PR = 40, BR = 24, DT = 1 / 60;
const MOVE = 400, JUMP = 930, PG = 2300, BG = 1250;
const WIN_SCORE = 7, SKY = -900;

const L = 1, R = 2, U = 4, A = 8, D = 16;
const HOME = { 2: [240, 720], 4: [310, 650, 130, 830] };
const SKILL = { easy: 0.38, normal: 0.6, hard: 0.95 };
const COURTS = [
  { name: "해변", sky: ["#6ec6ff", "#e4f6ff"], sun: "#fff3b0", cloud: "rgba(255,255,255,.9)", hill: ["#a8e0a0", "#8fd18a"], floor: "#f6dca6", edge: "#e9c887" },
  { name: "노을", sky: ["#ff9a76", "#ffe3b0"], sun: "#fff0c2", cloud: "rgba(255,236,214,.8)", hill: ["#e9a36b", "#d98a5a"], floor: "#f3c98b", edge: "#dba866" },
  { name: "달밤", sky: ["#1f2463", "#5b4f9e"], sun: "#fff6c8", cloud: "rgba(200,205,255,.3)", hill: ["#3d4a8a", "#33407a"], floor: "#8f93c4", edge: "#7377ab", night: true },
  { name: "체육관", sky: ["#f3e3c3", "#fbf2de"], floor: "#e0a868", edge: "#c48a48", gym: true },
];

export const meta = {
  local: true,
  soloText: "봇과 1대1. 난이도를 골라 주세요.",
  modeLabel: "경기 방식",
  modes: [[0, "자동"], [2, "1대1"], [4, "2대2"]],
  role: (slot) => (slot % 2 ? "오른쪽 팀" : "왼쪽 팀"),
  hint(n, mode) {
    const m = mode || (n >= 3 ? 4 : 2);
    if (n === 1) return "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요.";
    return `${n}명 · ${m === 2 ? "1대1" : "2대2"}로 시작해요.` + (m === 2 && n > 2 ? " 3번째부터는 관전이에요." : m === 4 && n < 4 ? " 빈자리는 봇이 채워요." : "");
  },
  howto: [
    ["이동·점프", "방향키 또는 A·D·W"],
    ["강타", "점프한 채로 스페이스(또는 F). 아래 키를 같이 누르면 내리꽂고, 뒤쪽 키를 누르면 높이 넘겨요"],
    ["슬라이딩", "땅에서 스페이스(또는 F, ↓)를 누르면 보는 방향으로 몸을 날려요. 좌우 키를 같이 누르면 그쪽으로. 날아가는 길에 공이 있으면 상대 코트로 쳐 보내요"],
    ["한 키보드 2인", "1P: A·D·W·S + F / 2P: 방향키 + Enter"],
    ["휴대폰", "화면 아래 버튼. 강타 버튼은 점프 중엔 강타, 땅에서는 슬라이딩이에요"],
  ],
};

// ── 상태 ──────────────────────────────────────────────
function newState(mode) {
  const s = { tick: 0, mode, ph: 0, tm: 50, sv: 0, sc: [0, 0], win: -1, h: 0, k: 0, sl: 0, th: (Math.random() * COURTS.length) | 0, lh: -99, p: [], b: { x: 0, y: 0, vx: 0, vy: 0 } };
  for (let i = 0; i < mode; i++) s.p.push({ x: HOME[mode][i], y: GROUND - PR, vx: 0, vy: 0, sm: 0, dv: 0, dd: 1, rc: 0, pa: 0, fd: i % 2 ? -1 : 1, team: i % 2 });
  resetRound(s, Math.random() < 0.5 ? 0 : 1);
  return s;
}

function resetRound(s, team) {
  s.sv = team; s.ph = 0; s.tm = 50;
  s.p.forEach((p, i) => { p.x = HOME[s.mode][i]; p.y = GROUND - PR; p.vx = 0; p.vy = 0; p.sm = 0; p.dv = 0; p.rc = 0; });
  s.b.x = team === 0 ? 240 : 720; s.b.y = 170; s.b.vx = 0; s.b.vy = 0;
}

function stepPlayer(p, m) {
  const onGround = p.y >= GROUND - PR - 0.5;
  if (p.dv > 0) {
    // 슬라이딩: 짧은 시간 빠르게 미끄러진다
    p.dv--; p.vx = p.dd * (540 + p.dv * 26);
    if (p.dv === 0) p.rc = 11;
  } else if (p.rc > 0) {
    p.rc--; p.vx = 0;           // 일어나는 동안은 못 움직인다
  } else {
    p.vx = ((m & R ? 1 : 0) - (m & L ? 1 : 0)) * MOVE;
    if (p.vx) p.fd = p.vx > 0 ? 1 : -1;
    // 땅에서 강타 키(또는 아래 키)를 누르면 슬라이딩. 좌우 키를 같이 누르면 그쪽으로, 아니면 보는 방향으로.
    if (m & (A | D) && !p.pa && onGround && !(m & U)) { p.dv = 18; p.dh = 0; p.dd = m & R ? 1 : m & L ? -1 : p.fd || 1; }
    else if (m & U && onGround) p.vy = -JUMP;
  }
  p.pa = m & (A | D) ? 1 : 0;
  p.vy += PG * DT;
  p.x += p.vx * DT; p.y += p.vy * DT;
  if (p.y > GROUND - PR) { p.y = GROUND - PR; p.vy = 0; }
  const lo = p.team === 0 ? PR : NET_X + NET_HW + PR;
  const hi = p.team === 0 ? NET_X - NET_HW - PR : W - PR;
  if (p.x < lo) p.x = lo;
  if (p.x > hi) p.x = hi;
  if (p.sm > 0) p.sm--;
}

function step(s, masks) {
  s.tick++;
  for (let i = 0; i < s.p.length; i++) { stepPlayer(s.p[i], masks[i] | 0); if (s.p[i].dv === 18) s.sl++; }
  const b = s.b;

  if (s.ph === 0) { if (--s.tm <= 0) s.ph = 1; return; }
  if (s.ph === 2) {
    b.vx *= 0.95; b.x += b.vx * DT;      // 득점 뒤 공은 조금 굴러가다 멈춘다
    if (--s.tm <= 0) resetRound(s, s.sv);
    return;
  }
  if (s.ph === 3) { s.tm++; return; }

  b.vy += BG * DT;
  b.x += b.vx * DT; b.y += b.vy * DT;
  if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * 0.9; }
  if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx) * 0.9; }
  if (b.y < SKY) { b.y = SKY; b.vy = Math.abs(b.vy) * 0.5; }      // 천장 없음: 하늘 높이 떴다가 그대로 떨어진다

  // 네트 (사각형과 원 충돌)
  const cx = Math.max(NET_X - NET_HW, Math.min(b.x, NET_X + NET_HW));
  const cy = Math.max(NET_TOP, Math.min(b.y, GROUND));
  let dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d < BR) {
    if (d < 0.001) { dx = b.vx > 0 ? -1 : 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * BR; b.y = cy + ny * BR;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.75 * vn * nx; b.vy -= 1.75 * vn * ny; }
    if (Math.abs(b.vx) < 40) b.vx += (b.x < NET_X ? -1 : 1) * 70;
  }

  // 선수와 충돌
  for (let i = 0; i < s.p.length; i++) {
    const p = s.p[i];
    if (p.dv > 0) {
      // 슬라이딩 중에는 몸을 날린 앞쪽까지 닿는다. 경로에 공이 있으면 상대 코트로 쳐 보낸다(한 번만).
      if (p.dh) continue;
      const hx = p.x + p.dd * 26, hy = p.y - 10, reach = PR + 16 + BR;
      if (Math.hypot(b.x - hx, b.y - hy) < reach || Math.hypot(b.x - p.x, b.y - p.y) < BR + PR) {
        const dir = p.team === 0 ? 1 : -1;
        b.vx = dir * 430 + p.dd * 110; b.vy = -730;
        if (b.y > p.y - 6) b.y = p.y - 6;
        p.dh = 1; s.k++; s.lh = s.tick;
      }
      continue;
    }
    dx = b.x - p.x; dy = b.y - p.y; d = Math.hypot(dx, dy);
    if (d >= BR + PR) continue;
    if (d < 0.001) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * (BR + PR); b.y = p.y + ny * (BR + PR);
    const m = masks[i] | 0, air = p.y < GROUND - PR - 2, dir = p.team === 0 ? 1 : -1;
    const fwd = m & (dir > 0 ? R : L), back = m & (dir > 0 ? L : R);
    if (m & A && air && p.sm <= 0) {
      // 강타: 누른 방향에 따라 세 가지
      const nearNet = Math.abs(p.x - NET_X) < 175;
      if (back) { b.vx = dir * 620; b.vy = -660; }                              // 뒤: 높이 넘기기
      else if (m & D || (!fwd && nearNet)) { b.vx = dir * 800; b.vy = 600; }    // 아래(또는 네트 앞): 내리꽂기
      else { b.vx = dir * 960; b.vy = 60; }                                   // 앞: 빠르고 낮게
      p.sm = 22; s.k++; s.lh = s.tick;
    } else if (p.dv > 0) {
      // 슬라이딩으로 받으면 공이 높이 떠서 다음 공격을 이을 수 있다
      b.vx = dir * 130 + p.dd * 70; b.vy = -820;
      if (s.tick - s.lh > 6) { s.h++; s.lh = s.tick; }
    } else {
      const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (vn < 0) { b.vx -= 1.85 * vn * nx; b.vy -= 1.85 * vn * ny; }
      const out = b.vx * nx + b.vy * ny;
      if (out < 560) { b.vx += (560 - out) * nx; b.vy += (560 - out) * ny; }
      b.vx += p.vx * 0.25;
      if (s.tick - s.lh > 6) { s.h++; s.lh = s.tick; }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 1350) { b.vx *= 1350 / sp; b.vy *= 1350 / sp; }
  }

  // 바닥에 닿으면 반대편 득점
  if (b.y >= GROUND - BR) {
    b.y = GROUND - BR; b.vy = 0;
    const team = b.x < NET_X ? 1 : 0;
    s.sc[team]++; s.sv = team;
    if (s.sc[team] >= WIN_SCORE) { s.ph = 3; s.win = team; s.tm = 0; }
    else { s.ph = 2; s.tm = 75; }
  }
}

// ── 네트워크용 압축 ────────────────────────────────────
function encode(s) {
  const a = [s.tick, s.mode, s.ph, s.tm, s.sv, s.sc[0], s.sc[1], s.win, s.h, s.k, Math.round(s.b.x), Math.round(s.b.y), Math.round(s.b.vx), Math.round(s.b.vy), s.sl, s.th | 0];
  for (const p of s.p) a.push(Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.sm, p.dv, p.rc);
  return "s" + JSON.stringify(a);
}

function decode(str) {
  const a = JSON.parse(str.slice(1));
  const s = { tick: a[0], mode: a[1], ph: a[2], tm: a[3], sv: a[4], sc: [a[5], a[6]], win: a[7], h: a[8], k: a[9], lh: a[0], b: { x: a[10], y: a[11], vx: a[12], vy: a[13] }, sl: a[14], th: a[15] | 0, p: [] };
  for (let i = 0, j = 16; i < s.mode; i++, j += 7) {
    s.p.push({ x: a[j], y: a[j + 1], vx: a[j + 2], vy: a[j + 3], sm: a[j + 4], dv: a[j + 5], rc: a[j + 6], dd: a[j + 2] < 0 ? -1 : 1, fd: a[j + 2] < 0 ? -1 : 1, pa: 0, team: i % 2 });
  }
  return s;
}

// ── 봇 ────────────────────────────────────────────────
function botMask(s, i, mem, skill) {
  const p = s.p[i], b = s.b, dir = p.team === 0 ? 1 : -1;
  if (mem.round !== s.sc[0] + s.sc[1] || s.tick - mem.at > 90) {
    mem.round = s.sc[0] + s.sc[1]; mem.at = s.tick;
    mem.err = (Math.random() * 2 - 1) * (1 - skill) * 85;
    mem.style = Math.random();
  }
  // 공이 어디로, 언제 떨어질지 미리 계산. 실력이 낮을수록 공을 늦게 다시 읽는다.
  const lag = skill > 0.9 ? 2 : skill > 0.5 ? 11 : 17;
  if (mem.pt == null || s.tick - mem.pt >= lag || s.ph !== mem.pph || s.tick < mem.pt) {
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy, k = 0;
    const hitY = GROUND - PR * 2 - BR + 14;
    if (s.ph === 1) {
      for (; k < 200 && !(y >= hitY && vy > 0); k++) {
        vy += BG * DT; x += vx * DT; y += vy * DT;
        if (x < BR) { x = BR; vx = -vx; }
        if (x > W - BR) { x = W - BR; vx = -vx; }
      }
    }
    mem.pt = s.tick; mem.pph = s.ph; mem.px = x; mem.pk = k;
  } else if (mem.pk > 0) mem.pk--;
  const x = mem.px, k = mem.pk;
  const mine = p.team === 0 ? x < NET_X : x > NET_X;
  let target = HOME[s.mode][i], go = false;
  if (mine && s.ph < 2) {
    go = true;
    for (let j = 0; j < s.p.length; j++) {
      if (j === i || s.p[j].team !== p.team) continue;
      const mineD = Math.abs(p.x - x), mateD = Math.abs(s.p[j].x - x);
      if (mateD < mineD - 20 || (Math.abs(mateD - mineD) <= 20 && j < i)) go = false;
    }
    if (go) target = x - dir * 20 + mem.err;
  }
  let m = 0;
  if (p.x < target - 10) m |= R; else if (p.x > target + 10) m |= L;
  const onGround = p.y >= GROUND - PR - 0.5;
  // 걸어서는 못 닿을 공이면 슬라이딩
  if (go && s.ph === 1 && onGround && k < 34) {
    const need = Math.abs(target - p.x), reach = MOVE * k * DT;
    if (need > reach + 20 && need < reach + 260 && Math.random() < skill) m |= A;
  }
  const near = Math.abs(b.x - p.x) < 95;
  const bOwn = p.team === 0 ? b.x < NET_X : b.x > NET_X;
  if (!(m & A) && s.ph === 1 && bOwn && near && onGround && b.y < p.y - 80 && b.y > p.y - 250 && b.vy > -150 && Math.random() < skill * 0.5) m |= U;
  if (!onGround && Math.hypot(b.x - p.x, b.y - p.y) < PR + BR + 45 && (b.x - p.x) * dir > -12 && Math.random() < skill) {
    m |= A;
    // 강타 방향을 섞는다: 가끔 뒤로 높이, 가끔 앞으로 낮게
    if (mem.style < 0.2) m = (m & ~(L | R)) | (dir > 0 ? L : R);
    else if (mem.style > 0.7) m = (m & ~(L | R)) | (dir > 0 ? R : L);
  }
  return m;
}

// ── 게임 시작 ─────────────────────────────────────────
// opts: { canvas, touchEl, kind:'solo'|'local'|'online', mode, level, myName, look,
//         room, send(str), isMuted(), onOver({title}) }
export function start(opts) {
  const { canvas, kind } = opts;
  const snd = sound(opts.isMuted);
  let room = opts.room || null;
  const startMode = kind === "online" ? (opts.mode || (room.players.length >= 3 ? 4 : 2)) : 2;
  let sim = null;        // 내가 방장(또는 오프라인)일 때의 진짜 상태
  let snap = null;       // 받은 최신 상태
  let view = null;       // 화면에 그리는 상태
  let overSent = false, shake = 0;
  let seenH = 0, seenK = 0, seenScore = 0, seenPh = -1, seenSl = 0, started = false, hurrySaid = false;
  const touchy = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const remote = [0, 0, 0, 0];
  const botMem = [{}, {}, {}, {}];
  let lastSentMask = -1;
  const trail = [], sparks = [];
  const clouds = [0, 1, 2, 3].map((i) => ({ x: i * 270 + 40, y: 50 + (i % 2) * 46, s: 0.8 + (i % 3) * 0.25 }));

  const iAmHost = () => kind !== "online" || (room && room.host === room.you);
  const mySlot = () => {
    if (kind !== "online") return 0;
    const me = room && room.players.find((p) => p.id === room.you);
    return me ? me.slot : -1;
  };
  const modeNow = () => (sim || snap || { mode: startMode }).mode;

  function slotName(i) {
    if (kind === "solo") return i === 0 ? opts.myName : BOT_NAMES[i];
    if (kind === "local") return i === 0 ? "1P" : i === 1 ? "2P" : BOT_NAMES[i];
    const pl = room.players.find((p) => p.slot === i);
    return pl ? pl.name : BOT_NAMES[i];
  }
  function slotLook(i) {
    if (kind !== "online") return i === 0 && opts.look ? opts.look : parseLook("", i);
    const pl = room.players.find((p) => p.slot === i);
    return parseLook(pl && pl.look, i);
  }

  // 조작
  const P1 = { KeyA: L, KeyD: R, KeyW: U, KeyS: D, KeyF: A, KeyG: A };
  const P2 = { ArrowLeft: L, ArrowRight: R, ArrowUp: U, ArrowDown: D, Slash: A, ShiftRight: A, Enter: A, Numpad0: A };
  const SOLO = { ...P1, ...P2, Space: A };
  const kb = keyboard(new Set(Object.keys(SOLO)));
  const pad = touchPad(opts.touchEl, [
    [{ id: "L", label: "◀" }, { id: "R", label: "▶" }],
    [{ id: "A", label: "강타", cls: "smash" }, { id: "U", label: "점프", cls: "jump" }],
  ]);
  const TOUCH = { L, R, U, A };
  const kbMask = (map) => { let m = 0; for (const c of kb.down) m |= map[c] || 0; return m; };
  const myMask = () => { let m = kbMask(SOLO); for (const c of pad.down) m |= TOUCH[c]; return m; };

  function masksFor(s) {
    const out = [];
    for (let i = 0; i < s.mode; i++) {
      if (kind === "solo") out.push(i === 0 ? myMask() : botMask(s, i, botMem[i], SKILL[opts.level] || SKILL.normal));
      else if (kind === "local") out.push(i === 0 ? kbMask(P1) : i === 1 ? kbMask(P2) : botMask(s, i, botMem[i], SKILL.normal));
      else {
        const pl = room.players.find((p) => p.slot === i);
        if (!pl) out.push(botMask(s, i, botMem[i], SKILL.normal));
        else if (pl.id === room.you) out.push(myMask());
        else out.push(remote[i]);
      }
    }
    return out;
  }

  function tick() {
    if (iAmHost()) {
      if (!sim) sim = snap ? snap : newState(startMode);
      step(sim, masksFor(sim));
      if (kind === "online" && sim.tick % 2 === 0) opts.send(encode(sim));
      view = sim;
      if (sim.ph === 3 && sim.tm > 230 && !overSent) { overSent = true; finish(sim.win); }
    } else {
      sim = null;
      const me = mySlot();
      const m = me >= 0 && me < modeNow() ? myMask() : 0;
      if (m !== lastSentMask) { lastSentMask = m; opts.send("i" + m); }
      if (!snap) return;
      if (!view || view.mode !== snap.mode || view === snap) view = JSON.parse(JSON.stringify(snap));
      // 받은 상태 쪽으로 부드럽게 따라간다. 내 캐릭터는 먼저 움직여서 반응을 빠르게.
      for (let i = 0; i < snap.p.length; i++) {
        const v = view.p[i], t = snap.p[i];
        if (i === me) {
          if (t.dv > 0 && v.dv === 0 && v.rc === 0) { v.dv = t.dv; v.dd = t.dd; }
          stepPlayer(v, m); v.x += (t.x - v.x) * 0.15; v.y += (t.y - v.y) * 0.15;
        } else {
          v.x += (t.x + t.vx * DT - v.x) * 0.4; v.y += (t.y + t.vy * DT - v.y) * 0.4;
          v.vx = t.vx; v.vy = t.vy; v.dv = t.dv; v.rc = t.rc; v.dd = t.dd;
        }
        v.sm = t.sm;
      }
      // 공은 받은 값에서 한 프레임씩 미리 굴려 둔다
      if (snap.ph === 1) { snap.b.vy += BG * DT; snap.b.x += snap.b.vx * DT; snap.b.y = Math.min(GROUND - BR, snap.b.y + snap.b.vy * DT); }
      view.b.x += (snap.b.x - view.b.x) * 0.55; view.b.y += (snap.b.y - view.b.y) * 0.55;
      view.b.vx = snap.b.vx; view.b.vy = snap.b.vy;
      Object.assign(view, { tick: view.tick + 1, ph: snap.ph, tm: snap.tm, sv: snap.sv, sc: snap.sc, win: snap.win, h: snap.h, k: snap.k, sl: snap.sl, th: snap.th });
    }
    effects();
  }

  function finish(win) {
    const me = mySlot(), myTeam = kind !== "local" && me >= 0 && me < modeNow() ? me % 2 : -1;
    opts.onOver({ title: myTeam < 0 ? "한 판 더 할까요?" : myTeam === win ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?" });
  }

  function effects() {
    const s = view; if (!s) return;
    if (s.h !== seenH) { seenH = s.h; snd(430 + Math.random() * 80, 0.09, "sine", 0.14, 160); }
    if (s.k !== seenK) { seenK = s.k; shake = 9; sparks.push({ x: s.b.x, y: s.b.y, t: 0 }); snd.thud(1.2); snd(760, 0.08, "triangle", 0.1, -300); }
    if ((s.sl | 0) !== seenSl) { seenSl = s.sl | 0; snd.whoosh(1.2); }
    if (!started && s.ph === 1) { started = true; snd.whistle(); }
    const h = s.ph !== 3 && Math.max(s.sc[0], s.sc[1]) === WIN_SCORE - 1;      // 매치 포인트면 음악이 빨라진다
    if (h !== hurrySaid) { hurrySaid = h; emit("hurry", h); }
    const sc = s.sc[0] + s.sc[1];
    if (sc !== seenScore) { seenScore = sc; shake = 6; jingle(snd, [660, 880], 100); }
    if (s.ph !== seenPh) {
      if (s.ph === 3) {
        jingle(snd, [523, 659, 784, 1047], 130);
        const me = mySlot(), myTeam = kind !== "local" && me >= 0 && me < s.mode ? me % 2 : -1;
        emit("over", { win: myTeam < 0 ? null : myTeam === s.win });
      }
      seenPh = s.ph;
    }
    trail.push({ x: s.b.x, y: s.b.y }); if (trail.length > 7) trail.shift();
    if (shake > 0) shake *= 0.85;
  }

  // ── 그리기 ──
  let ctx = null, use3d = false;
  function drawMochi(p, i, s, isMe) {
    const b = s.b;
    if (!use3d) {
    const air = p.y < GROUND - PR - 2;
    let sq = air ? Math.max(-0.16, Math.min(0.16, -p.vy / 5200)) : Math.sin(s.tick * 0.12 + i) * 0.025;
    if (p.dv > 0) sq = -0.46; else if (p.rc > 0) sq = -0.46 + (11 - p.rc) * 0.04;
    ctx.fillStyle = "rgba(80,50,20,.18)";
    ctx.beginPath(); ctx.ellipse(p.x, GROUND + 4, PR * (0.95 - (GROUND - PR - p.y) / 700), 7, 0, 0, 7); ctx.fill();
    if (p.dv > 0) {
      // 슬라이딩 흙먼지
      ctx.fillStyle = "rgba(214,178,120,.7)";
      for (let q = 1; q <= 4; q++) { ctx.beginPath(); ctx.arc(p.x - p.dd * (34 + q * 24), GROUND - 6 - q * 4, 15 - q * 2.6, 0, 7); ctx.fill(); }
      // 잔상
      ctx.globalAlpha = 0.22;
      for (let q = 1; q <= 2; q++) paintMochi(ctx, p.x - p.dd * q * 30, p.y, PR, slotLook(i), { sq: -0.46 });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 3;
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.moveTo(p.x - p.dd * 50, GROUND - 16 - q * 12); ctx.lineTo(p.x - p.dd * (95 + q * 14), GROUND - 16 - q * 12); ctx.stroke(); }
    }
    paintMochi(ctx, p.x, p.y, PR, slotLook(i), { ang: Math.atan2(b.y - p.y, b.x - p.x), sq, open: p.sm > 0 || p.dv > 0 });
    }
    const name = slotName(i);
    ctx.font = "700 17px Jua, 'Malgun Gothic', sans-serif"; ctx.textAlign = "center";
    const ny = Math.min(p.y - PR - 34, GROUND - PR * 2 - 34);
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.strokeText(name, p.x, ny);
    ctx.fillStyle = isMe ? "#d6336c" : "#4a3b33"; ctx.fillText(name, p.x, ny);
    if (isMe) { ctx.fillStyle = "#d6336c"; ctx.beginPath(); ctx.moveTo(p.x - 7, ny - 24); ctx.lineTo(p.x + 7, ny - 24); ctx.lineTo(p.x, ny - 15); ctx.fill(); }
  }

  function draw() {
    ctx = fit(canvas, W, H);
    const s = view;
    const t = performance.now() / 1000;
    const th = COURTS[(s && s.th) | 0] || COURTS[0];
    let d3 = null;
    if (s) { const m3 = stage.get(); if (m3) { try { d3 = m3.render(s, { t, touch: !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches), thi: (s.th | 0) % COURTS.length, looks: s.p.map((_, i) => slotLook(i)) }); ctx.drawImage(d3.cv, 0, 0, W, H); } catch { d3 = null; stage.fail(); } } }
    use3d = !!d3;
    if (!d3) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (th.gym) {
      // 체육관: 벽 줄무늬, 창문, 관중석 난간
      ctx.fillStyle = "rgba(180,140,90,.16)"; for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 40, GROUND);
      ctx.fillStyle = "#bfe3ff"; ctx.strokeStyle = "#8a5a3c"; ctx.lineWidth = 6;
      for (const x of [110, 330, 550, 770]) { ctx.beginPath(); ctx.roundRect(x, 60, 90, 110, 12); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = "#8a5a3c"; ctx.fillRect(0, GROUND - 110, W, 8);
    } else {
      if (th.night) {
        ctx.fillStyle = "rgba(255,255,255,.85)";
        for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((i * 211) % W, (i * 83) % 250, 1 + ((i * 7) % 3) * 0.5, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = th.sun; ctx.beginPath(); ctx.arc(820, 86, th.night ? 34 : 44, 0, 7); ctx.fill();
      if (th.night) { ctx.fillStyle = th.sky[0]; ctx.beginPath(); ctx.arc(806, 78, 30, 0, 7); ctx.fill(); }
      ctx.fillStyle = th.cloud;
      for (const c of clouds) {
        const x = ((c.x + t * 9 * c.s) % (W + 200)) - 100;
        ctx.beginPath(); ctx.ellipse(x, c.y, 46 * c.s, 17 * c.s, 0, 0, 7); ctx.ellipse(x + 30 * c.s, c.y - 12 * c.s, 30 * c.s, 17 * c.s, 0, 0, 7); ctx.ellipse(x - 30 * c.s, c.y - 6 * c.s, 24 * c.s, 13 * c.s, 0, 0, 7); ctx.fill();
      }
      ctx.fillStyle = th.hill[0]; ctx.beginPath(); ctx.ellipse(200, GROUND + 30, 330, 120, 0, 0, 7); ctx.fill();
      ctx.fillStyle = th.hill[1]; ctx.beginPath(); ctx.ellipse(760, GROUND + 40, 380, 140, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = th.floor; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = th.edge; ctx.fillRect(0, GROUND, W, 6);
    if (th.gym) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(0, GROUND + 26, W, 4); }
    }

    if (!s) {
      ctx.fillStyle = "#4a3b33"; ctx.font = "700 30px Jua, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("연결하는 중…", W / 2, H / 2);
      return;
    }
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 네트
    if (!d3) {
    ctx.fillStyle = "#8a5a3c"; ctx.fillRect(NET_X - NET_HW, NET_TOP, NET_HW * 2, GROUND - NET_TOP);
    ctx.fillStyle = "#fff"; ctx.fillRect(NET_X - NET_HW - 2, NET_TOP - 6, NET_HW * 2 + 4, 10);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let y = NET_TOP + 14; y < GROUND - 8; y += 16) ctx.fillRect(NET_X - NET_HW, y, NET_HW * 2, 3);
    }

    const me = kind === "local" ? -1 : mySlot();
    for (let i = 0; i < s.p.length; i++) drawMochi(s.p[i], i, s, i === me);

    // 공
    const b = s.b, sp = Math.hypot(b.vx, b.vy);
    if (!d3) if (sp > 800) trail.forEach((q, i) => { ctx.fillStyle = `rgba(255,120,80,${i * 0.045})`; ctx.beginPath(); ctx.arc(q.x, q.y, BR * (0.5 + i * 0.07), 0, 7); ctx.fill(); });
    if (!d3) { ctx.fillStyle = "rgba(80,50,20,.16)"; ctx.beginPath(); ctx.ellipse(b.x, GROUND + 4, BR * Math.max(0.35, 1 - (GROUND - b.y) / 900), 5, 0, 0, 7); ctx.fill(); }
    if (b.y < -BR) {      // 화면 위로 나간 공: 어디로 떨어질지 화살표로 알려 준다
      const up = Math.min(1, (-b.y - BR) / 500), r = 15 - up * 6, mx = Math.max(26, Math.min(W - 26, b.x));
      ctx.save(); if (Math.abs(mx - W / 2) < 130) ctx.translate(0, 96);      // 점수판 밑으로 비켜 그린다
      ctx.fillStyle = "#ff5d73"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mx, 8); ctx.lineTo(mx - 13, 26); ctx.lineTo(mx + 13, 26); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3d6fd6"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(mx, 46, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (!d3) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(s.tick * 0.02 + b.x * 0.02);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3d6fd6"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, BR, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ffb703"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, BR - 8, -0.6, 0.9); ctx.stroke();
    ctx.strokeStyle = "#3d6fd6"; ctx.beginPath(); ctx.arc(0, 0, BR - 8, 2.4, 3.9); ctx.stroke();
    ctx.restore();
    }
    ctx.restore();

    // 강타 불꽃
    for (let i = sparks.length - 1; i >= 0; i--) {
      const q = sparks[i]; q.t++;
      if (q.t > 14) { sparks.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,${200 - q.t * 8},60,${1 - q.t / 14})`; ctx.lineWidth = 5; ctx.lineCap = "round";
      for (let k = 0; k < 8; k++) { const an = (k / 8) * 6.283 + 0.3, r0 = 10 + q.t * 4, r1 = r0 + 14; ctx.beginPath(); ctx.moveTo(q.x + Math.cos(an) * r0, q.y + Math.sin(an) * r0); ctx.lineTo(q.x + Math.cos(an) * r1, q.y + Math.sin(an) * r1); ctx.stroke(); }
    }
    // 점수판
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.88)"; rr(ctx, W / 2 - 110, 14, 220, 62, 18); ctx.fill();
    ctx.font = "700 46px Jua, sans-serif";
    ctx.fillStyle = SEAT_DARK[0]; ctx.fillText(s.sc[0], W / 2 - 56, 62);
    ctx.fillStyle = SEAT_DARK[1]; ctx.fillText(s.sc[1], W / 2 + 56, 62);
    ctx.fillStyle = "#4a3b33"; ctx.fillText(":", W / 2, 58);
    ctx.font = "700 15px Jua, sans-serif"; ctx.fillStyle = "#4a3b33";
    ctx.fillText(WIN_SCORE + "점 먼저 내면 승리 · " + th.name, W / 2, 96);
    if (s.ph !== 3 && Math.max(s.sc[0], s.sc[1]) === WIN_SCORE - 1) {
      ctx.font = "700 22px Jua, sans-serif"; ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.strokeText("매치 포인트!", W / 2, 124);
      ctx.fillStyle = "#ff5d73"; ctx.fillText("매치 포인트!", W / 2, 124);
    }

    let msg = "", sub = "";
    if (s.ph === 0 && s.tick < 60) msg = "준비!";
    else if (s.ph === 2) msg = "득점!";
    else if (s.ph === 3) {
      const myTeam = me >= 0 && me < s.mode ? me % 2 : -1;
      msg = myTeam < 0 ? (s.win === 0 ? "왼쪽 팀 승리!" : "오른쪽 팀 승리!") : myTeam === s.win ? "이겼다!" : "아쉽다, 졌어요";
      sub = s.sc[0] + " : " + s.sc[1];
    }
    if (msg) {
      ctx.font = "700 64px Jua, sans-serif"; ctx.lineWidth = 12; ctx.strokeStyle = "#fff"; ctx.strokeText(msg, W / 2, 210);
      ctx.fillStyle = "#ff5d73"; ctx.fillText(msg, W / 2, 210);
      if (sub) { ctx.font = "700 34px Jua, sans-serif"; ctx.lineWidth = 8; ctx.strokeText(sub, W / 2, 258); ctx.fillStyle = "#4a3b33"; ctx.fillText(sub, W / 2, 258); }
    }
    if (s.tick < 720 && s.ph !== 3 && !(kind === "online" && me >= s.mode)) {
      ctx.font = "700 17px Jua, sans-serif"; ctx.textAlign = "center";
      const tip = touchy ? "강타 버튼: 점프 중엔 강타 · 땅에서는 슬라이딩" : kind === "local" ? "1P F · 2P Enter: 점프 중엔 강타 · 땅에서는 슬라이딩" : "스페이스: 점프 중엔 강타 · 땅에서는 슬라이딩";
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.strokeText(tip, W / 2, H - 20);
      ctx.fillStyle = "#4a3b33"; ctx.fillText(tip, W / 2, H - 20);
    }
    if (kind === "online" && me >= s.mode) {
      ctx.font = "700 18px Jua, sans-serif"; ctx.fillStyle = "#4a3b33"; ctx.fillText("관전 중 — 다음 판에 참가해요", W / 2, H - 22);
    }
  }

  const stopLoop = makeLoop(tick, draw, DT);

  return {
    // 서버에서 온 게임 메시지
    onNet(msg) {
      if (msg[0] === "s") { if (!iAmHost()) { try { snap = decode(msg); } catch {} } }
      else if (msg[0] === "i") { const slot = +msg[1]; if (slot >= 0 && slot < 4) remote[slot] = parseInt(msg.slice(2), 10) & 31; }
    },
    // 방 정보가 바뀜 (누가 나가거나, 내가 방장이 됨)
    setRoom(r) {
      const wasHost = iAmHost();
      room = r;
      if (!wasHost && iAmHost() && snap) { sim = snap; view = sim; }
      lastSentMask = -1;
    },
    stop() { stopLoop(); kb.stop(); pad.stop(); stage.dispose(); if (hurrySaid) emit("hurry", false); },
    peek() { return { b: view ? view.b : null, host: iAmHost(), tick: view ? view.tick : -1, sc: view ? view.sc : null, sl: view ? view.sl : 0, p: view ? view.p.map((q) => [Math.round(q.x), q.dv, q.rc]) : [] }; },
  };
}

export const _test = { newState, step, botMask, SKILL };
