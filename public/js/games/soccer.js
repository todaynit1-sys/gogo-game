// 떡 축구 — 위에서 내려다보는 미니 축구. 몸으로 밀고, 차기 버튼으로 뻥 찬다.
// 2분 동안 골을 더 많이 넣은 팀이 승리(5골을 먼저 넣어도 끝). 동점이면 골든골.
// 공은 높이(z)를 가진다: 짧게 누르면 패스·슛, 꾹 누르면 힘을 모아 띄우고, 금색 칸에서 떼면 불꽃 슛.

import { lazy3d } from "./lazy3d.js?v=1";
import { startHostGame, L, R, U, D, A, B } from "./hostgame.js?v=4";
import { drawMochi, parseLook } from "../avatar.js?v=3";
import { rr, label, jingle } from "./kit.js?v=3";

const W = 960, H = 540, FX0 = 48, FX1 = 912, FY0 = 58, FY1 = 502, GY0 = 205, GY1 = 355, CX = W / 2, CY = (FY0 + FY1) / 2;
const PR = 20, BR = 12, TIME = 120 * 60, WIN_GOALS = 5, OVERTIME = 45 * 60, HURRY = 30 * 60;
// 공 높이: 중력, 크로스바 높이(공 중심 기준)와 두께, 머리 높이 구간(ZH0~ZH1), 그보다 높으면 머리 위로 넘어간다
const GRAV = 0.3, GH = 64, BZ = 14, ZH0 = 26, ZH1 = 62;
// 힘 모으기(틱): 짧게 = 패스·슛, ~SW0 = 띄운 슛, SW0~SW1 = 딱 맞춤 불꽃 슛, 그 위 = 높이 띄우기(칩슛)
const CH_TAP = 12, CH_SW0 = 38, CH_SW1 = 50, CH_MAX = 62;
const REACH = PR + BR + 13, KW = 10, DASH_CD = 90, TUMBLE = 24, IMMUNE = 60, CELEB = 150, KICKOFF = 90, STUCK = 240;
const TEAM = ["#ff5d73", "#4d9be0"], TEAM_NAME = ["빨강 팀", "파랑 팀"];
const KICK_POS = [[-150, 0], [-320, -100]];
const FIELDS = [
  { name: "잔디 구장", out: "#2f8f4e", a: "#58b56a", b: "#4fab62", line: "rgba(255,255,255,.9)" },
  { name: "눈밭 구장", out: "#9fc4dd", a: "#f4fbff", b: "#e3f1fa", line: "rgba(77,155,224,.85)" },
  { name: "모래 구장", out: "#c9964f", a: "#f1d69a", b: "#e9c986", line: "rgba(255,255,255,.95)" },
  { name: "밤 구장", out: "#17203f", a: "#2c6a55", b: "#28604d", line: "rgba(255,255,255,.75)" },
];
// 알림 글자(번호로 주고받는다)
const NOTES = ["", "딱 맞춤 불꽃 슛!", "헤딩!", "발리슛!", "가로채기!", "골대 맞았다!", "아깝다, 너무 높아!", "", "번개 떡! 빨라져요", "불꽃 떡! 다음 슛은 불꽃", "통! 공 튀기기", "칩슛!", "선방!"];
const ITEM_NAME = ["번개 떡", "불꽃 떡"];

function say(s, code, who) { s.nc = code; s.nw = who; s.nt = s.tick; s.nn++; }

function kickoff(s) {
  const cnt = [0, 0];
  s.p.forEach((p) => {
    const t = p.team, k = cnt[t]++, sign = t === 0 ? 1 : -1;
    let [dx, dy] = KICK_POS[k % 2];
    if (t === s.kt && k === 0) { dx = -36; dy = 0; }       // 먹힌 팀(처음엔 무작위)이 공 바로 뒤에서 시작 → 시작하자마자 엉키지 않는다
    Object.assign(p, { x: CX + dx * sign, y: CY + dy * sign, vx: 0, vy: 0, kc: 0, ds: 0, ch: 0, kq: 0, kw: 0, tb: 0 });
  });
  Object.assign(s.b, { x: CX, y: CY, z: 0, vx: 0, vy: 0, vz: 0, f: 0, lt: -1, lk: -1, pp: -1, sk: 0, sx: CX, sy: CY });
  s.ph = 0; s.tm = KICKOFF; s.sl = 0;
}

function init(seats) {
  const s = {
    tick: 0, seats,
    p: seats.map((_, i) => ({ x: 0, y: 0, vx: 0, vy: 0, kc: 0, pa: 0, ds: 0, dc: 0, pb: 0, dx: 0, dy: 0, team: i % 2, ch: 0, kq: 0, kw: 0, tb: 0, sp: 0, fi: 0, g: 0, sh: 0 })),
    b: {}, sc: [0, 0], time: TIME, ot: 0, ph: 0, tm: KICKOFF, over: null, th: (Math.random() * FIELDS.length) | 0,
    kt: Math.random() < 0.5 ? 0 : 1, sl: 0, lg: 0, ls: -1, og: 0, it: null, iT: 900,
    // 소리·효과용 셈: 골·차기·벽·대시·헤딩·가로채기·크로스바·통통 튐 / 알림
    gk: 0, kk: 0, kh: 0, wk: 0, dk: 0, hk: 0, tk: 0, cb: 0, bo: 0, nc: 0, nn: 0, nw: -1, nt: -99,
    // 기록(점검용)
    pc: 0, pd: 0, ogc: 0, dr: 0, fk: 0,
  };
  kickoff(s);
  s.tm = KICKOFF + 30;
  return s;
}

// 공에 닿음: 마지막으로 닿은 사람(lt), 마지막으로 일부러 찬 사람(lk = 득점자), 패스 성공을 기록
// 몸에 맞고 굴절된 빠른 공은 찬 사람의 것으로 둔다(수비가 막다 들어가도 자책골로 치지 않는다)
function touch(s, i, own) {
  const b = s.b;
  if (b.pp >= 0 && b.pp !== i) { if (s.p[b.pp].team === s.p[i].team) s.pd++; b.pp = -1; }
  b.lt = i;
  if (own) b.lk = i;
}

// 차기. 방향 = 누른 방향(+공 쪽), 동료 쪽이면 패스, 상대 골대 쪽이면 골문 안으로 살짝 맞춰 준다
function kick(s, i, p, ax, ay) {
  const b = s.b, q = p.kq, sg = p.team === 0 ? 1 : -1, gx = sg > 0 ? FX1 : FX0, ogx = sg > 0 ? FX0 : FX1;
  const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
  let ux = dx / d, uy = dy / d;
  if (ax || ay) { ux = ax + ux * 0.5; uy = ay + uy * 0.5; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l; }
  let kind = q < CH_TAP ? 0 : q < CH_SW0 ? 1 : q <= CH_SW1 ? 2 : 3;
  const tx = gx - b.x, ty = CY - b.y, td = Math.hypot(tx, ty) || 1;
  const toGoal = (ux * tx + uy * ty) / td > 0.64 && Math.abs(tx) < 560 && ux * sg > 0.1;
  // 패스: 짧게 누르거나 조금 모았을 때, 누른 방향 근처에 동료가 있으면 (골대 앞에서 골대 쪽이면 슛 우선)
  let mate = -1;
  if (kind <= 1 && !(toGoal && Math.abs(tx) < 300)) {
    let best = 0.8;
    for (let j = 0; j < s.p.length; j++) {
      const o = s.p[j];
      if (j === i || o.team !== p.team || o.tb > IMMUNE || Math.abs(o.x - ogx) < 220) continue;      // 골문 앞 동료에게 백패스는 안 한다
      const ox = o.x + o.vx * 10 - b.x, oy = o.y + o.vy * 10 - b.y, od = Math.hypot(ox, oy) || 1;
      if (od < 70 || od > 560) continue;
      const c = (ox * ux + oy * uy) / od;
      if (c > best) { best = c; mate = j; }
    }
  }
  let sp, vz = 0, shot = false;
  if (mate >= 0) {
    const o = s.p[mate], ox = o.x + o.vx * 10 - b.x, oy = o.y + o.vy * 10 - b.y, od = Math.hypot(ox, oy) || 1;
    ux = ox / od; uy = oy / od;
    if (kind === 0) sp = Math.min(11, 3.6 + od * 0.02);
    else { vz = 5; sp = Math.min(11, Math.max(4, od / 34)); }      // 띄운 패스: 머리 위로 넘긴다
    b.pp = i; s.pc++;
  } else {
    if (toGoal) {
      const hit = b.y + uy * (tx / ux);
      const aimY = Math.max(GY0 + 22, Math.min(GY1 - 22, hit + (CY - hit) * 0.3));
      const ey = aimY - b.y, el = Math.hypot(tx, ey) || 1;
      ux = tx / el; uy = ey / el; shot = true; p.sh++;
    } else {
      // 우리 골문으로 가는 차기는 옆으로 돌린다: 가까우면 앞쪽 옆으로 걷어내고, 멀면 옆벽 쪽으로(살짝 앞으로)
      const ox = ogx - b.x, oy = CY - b.y, ol = Math.hypot(ox, oy) || 1, hy = ux * sg < -0.05 ? b.y + uy * (ox / ux) : -1e9;
      if ((ol < 330 && (ux * ox + uy * oy) / ol > 0.7) || (hy > GY0 - 40 && hy < GY1 + 40)) {
        if (Math.abs(ox) < 330) { ux = sg * 0.6; uy = b.y < CY ? -0.8 : 0.8; } else { ux = sg * 0.2; uy = b.y < CY ? -0.98 : 0.98; }
      }
    }
    if (p.fi && kind !== 3) { kind = 2; p.fi = 0; }
    if (kind === 0) sp = shot ? 11 : 10;
    else if (kind === 1) { const t = (q - CH_TAP) / (CH_SW0 - CH_TAP); sp = 10.5 + 2.5 * t; vz = 1 + 3.2 * t; }
    else if (kind === 2) { sp = 15.5; vz = 1.4; b.f = 50; s.fk++; say(s, 1, i); }
    else { vz = 7.4; sp = shot ? Math.max(5, Math.min(9.5, td / 44)) : 8.6; if (shot) say(s, 11, i); }      // 칩슛은 골문 앞에 떨어지게
  }
  if (b.z > 6 && kind !== 2) { sp += 1.5; if (shot) say(s, 3, i); }
  b.vx = ux * sp + p.vx * 0.2; b.vy = uy * sp + p.vy * 0.2; b.vz = Math.max(vz, b.vz > 0 ? b.vz * 0.3 : 0);
  touch(s, i, 1); p.kc = 16; s.kk++; s.kh = kind;
}

// 머리 높이로 온 공: 저절로 헤딩(상대 골대 쪽), 차기를 누르고 있었으면 발리슛
function header(s, i, p) {
  const b = s.b, sg = p.team === 0 ? 1 : -1, gx = sg > 0 ? FX1 : FX0, vol = p.ch > 0 || p.kw > 0;
  const tx = gx - b.x, aimY = Math.max(GY0 + 22, Math.min(GY1 - 22, b.y + (CY - b.y) * 0.6)), ty = aimY - b.y, tl = Math.hypot(tx, ty) || 1;
  const sp = vol ? 12.5 : Math.max(6.5, Math.min(10, Math.hypot(b.vx, b.vy) * 0.8));
  b.vx = (tx / tl) * sp; b.vy = (ty / tl) * sp; b.vz = vol ? 1.2 : 2.6;
  if (vol) { p.ch = 0; p.kw = 0; p.kq = 0; }
  p.kc = 14; touch(s, i, 1); s.hk++;
  if (Math.abs(tx) < 480) { p.sh++; say(s, vol ? 3 : 2, i); }      // 골대를 노린 헤딩만 알림
}

// 대시로 공 가진 상대를 들이받으면 가로채기(상대는 잠깐 데굴, 그 뒤 1초는 다시 안 넘어진다)
function tackle(s, ai, vi) {
  const a = s.p[ai], v = s.p[vi], b = s.b;
  if (a.ds <= 0 || a.team === v.team || v.tb > 0 || Math.hypot(b.x - v.x, b.y - v.y) > PR + BR + 26) return;
  v.tb = TUMBLE + IMMUNE; v.vx = a.dx * 4; v.vy = a.dy * 4; v.ch = 0; v.kw = 0; v.kq = 0;
  a.ds = 0; a.vx *= 0.4; a.vy *= 0.4;
  if (b.z < ZH0) { const sg = a.team === 0 ? 1 : -1; b.vx = sg * Math.max(2.5, a.dx * sg * 4) ; b.vy = a.dy * 4; b.vz = 2.5; touch(s, ai, 1); }
  s.tk++; say(s, 4, ai);
}

function ballAir(s) {
  const b = s.b;
  if (b.z > 0 || b.vz > 0) {
    b.vz -= GRAV; b.z += b.vz;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -2.4) { b.vz = -b.vz * 0.5; b.vx *= 0.88; b.vy *= 0.88; s.bo++; } else b.vz = 0;
    }
    b.vx *= 0.996; b.vy *= 0.996;
  } else { b.vx *= 0.987; b.vy *= 0.987; }
}

// 골라인: 골문 안·크로스바 아래면 골, 크로스바에 맞으면 튕김, 위로 넘어가면 뒷벽에 맞고 돌아온다
function endLine(s, sg) {
  const b = s.b, lx = sg < 0 ? FX0 : FX1;
  if ((b.x - lx) * sg <= -BR) return;
  const inMouth = b.y > GY0 + 4 && b.y < GY1 - 4;
  if (inMouth && b.z < GH - BZ) { if ((b.x - lx) * sg > 2) goal(s, sg > 0 ? 0 : 1); return; }
  b.x = lx - sg * BR;
  if (inMouth && b.z < GH + BZ) {
    b.vx = -sg * Math.abs(b.vx) * 0.55; b.vz = b.z < GH ? -Math.abs(b.vz) - 1 : Math.abs(b.vz) * 0.6 + 1.5;
    s.cb++; say(s, 5, b.lk);
  } else {
    b.vx = -sg * Math.abs(b.vx) * 0.8; s.wk++;
    if (Math.abs(b.y - CY) < 120 && b.z >= GH + BZ && b.lk >= 0 && (s.p[b.lk].team === 0 ? 1 : -1) === sg) say(s, 6, b.lk);
  }
}

function step(s, masks) {
  s.tick++;
  if (s.over) { s.over.t++; return; }
  const b = s.b;
  if (s.ph === 0) { if (--s.tm <= 0) s.ph = 1; return; }
  if (s.ph === 2) {
    // 골 세리머니: 공은 그물 안에서 멈춘다
    b.x += b.vx; b.y += b.vy; b.vx *= 0.88; b.vy *= 0.88; ballAir(s);
    if (b.x < FX0 - 26) { b.x = FX0 - 26; b.vx = 0; } if (b.x > FX1 + 26) { b.x = FX1 + 26; b.vx = 0; }
    b.y = Math.max(GY0 + BR, Math.min(GY1 - BR, b.y)); b.z = Math.min(b.z, GH - BZ);
    if (--s.tm <= 0) {
      if (s.sc[0] >= WIN_GOALS || s.sc[1] >= WIN_GOALS || s.time <= 0) s.over = { w: s.sc[0] > s.sc[1] ? 0 : 1, t: 0 };
      else kickoff(s);
    }
    return;
  }
  // 골 직전 슬로 모션: 세 번에 한 번만 움직인다
  if (s.sl > 0) { s.sl--; if (s.sl % 3) return; }
  if (s.time > 0) s.time--;
  else if (s.sc[0] !== s.sc[1]) { s.over = { w: s.sc[0] > s.sc[1] ? 0 : 1, t: 0 }; return; }
  else if (++s.ot > OVERTIME) { s.over = { w: -1, t: 0 }; return; }      // 동점이면 먼저 넣는 팀이 승리, 끝내 안 나면 무승부

  // 선수 (처리 순서를 무작위로 뒤집어 어느 팀도 유리하지 않게 한다)
  const n = s.p.length, flip = Math.random() < 0.5;
  for (let k = 0; k < n; k++) {
    const i = flip ? n - 1 - k : k, p = s.p[i];
    if (p.tb > 0) p.tb--;
    const down = p.tb > IMMUNE, m = down ? 0 : masks[i] | 0;      // 넘어져 있는 동안은 조작이 안 먹는다
    let ax = (m & R ? 1 : 0) - (m & L ? 1 : 0), ay = (m & D ? 1 : 0) - (m & U ? 1 : 0);
    if (ax && ay) { ax *= 0.707; ay *= 0.707; }
    // 대시: 누른 방향으로 짧게 돌진 (쉬는 시간 있음)
    if (p.dc > 0) p.dc--;
    if (m & B && !p.pb && p.dc <= 0 && (ax || ay)) { p.ds = 9; p.dc = DASH_CD; p.dx = ax; p.dy = ay; s.dk++; }
    p.pb = m & B ? 1 : 0;
    if (p.ds > 0) { p.ds--; p.vx = p.dx * 9; p.vy = p.dy * 9; }
    else { const acc = p.sp > 0 ? 0.72 : 0.56, fr = down ? 0.8 : 0.86; p.vx = p.vx * fr + ax * acc; p.vy = p.vy * fr + ay * acc; }
    if (p.sp > 0) p.sp--;
    p.x += p.vx; p.y += p.vy;
    p.x = Math.max(FX0 + PR - 14, Math.min(FX1 - PR + 14, p.x)); p.y = Math.max(FY0 + PR - 10, Math.min(FY1 - PR + 10, p.y));
    if (p.kc > 0) p.kc--;
    // 차기: 누르는 동안 힘을 모으고, 떼면 찬다(뗀 뒤 잠깐은 공이 닿는 순간 찬다)
    if (!down && m & A) { if (!p.pa) p.ch = 1; else if (p.ch > 0 && p.ch < CH_MAX) p.ch++; }
    else if (p.ch > 0) { p.kq = p.ch; p.kw = KW; p.ch = 0; }
    p.pa = m & A ? 1 : 0;
    if (p.kw > 0) {
      p.kw--;
      if (p.kc <= 0 && b.z < ZH0 && Math.hypot(b.x - p.x, b.y - p.y) < REACH) { kick(s, i, p, ax, ay); p.kw = 0; p.kq = 0; }
      else if (!p.kw) p.kq = 0;
    }
  }
  // 선수끼리 밀치기 + 대시 가로채기
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const ia = flip ? n - 1 - i : i, ic = flip ? n - 1 - j : j, a = s.p[ia], c = s.p[ic], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d < PR * 2 + 6) { tackle(s, ia, ic); tackle(s, ic, ia); }
    if (d < PR * 2) { const k = (PR * 2 - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * k; a.y -= ny * k; c.x += nx * k; c.y += ny * k; }
  }
  // 공
  b.x += b.vx; b.y += b.vy; ballAir(s);
  if (b.f > 0) b.f--;
  let pinch = 0;      // 이번 틱에 몸에 닿은 팀(비트)
  for (let k = 0; k < n; k++) {
    const i = flip ? n - 1 - k : k, p = s.p[i];
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d >= PR + BR + 8 || b.z >= ZH1) continue;                    // 머리 위로 넘어간다
    if (b.z >= ZH0) { if (p.kc <= 0 && p.tb <= IMMUNE) header(s, i, p); continue; }
    if (d >= PR + BR) continue;
    const nx = dx / d, ny = dy / d;
    if (b.f > 0 && b.lt >= 0 && s.p[b.lt].team !== p.team) {
      // 불꽃 슛은 한 명을 뚫고 지나간다(조금 느려지고 막은 사람은 밀려난다)
      p.vx += b.vx * 0.45; p.vy += b.vy * 0.45; b.vx *= 0.72; b.vy *= 0.72; b.f = 0;
      if (Math.abs(p.x - (p.team === 0 ? FX0 : FX1)) < 140) say(s, 12, i);
      continue;
    }
    b.x = p.x + nx * (PR + BR); b.y = p.y + ny * (PR + BR);
    const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny, inc = Math.hypot(b.vx, b.vy);
    const pw = p.ds > 0 ? 1.9 : 1.5;      // 대시로 들이받으면 더 세게 튄다
    if (vn < 0) { b.vx -= pw * vn * nx; b.vy -= pw * vn * ny; }
    // 우리 골대 앞에서 몸에 맞은 공은 골문 쪽이 아니라 바깥으로 튄다 (몸으로 자책골 넣는 일을 줄인다)
    const sg = p.team === 0 ? 1 : -1, ogx = sg > 0 ? FX0 : FX1;
    if (Math.abs(p.x - ogx) < 150 && b.vx * sg < 0) { b.vx = sg * Math.max(1.5, Math.abs(b.vx) * 0.5); b.vy += b.y < CY ? -1.2 : 1.2; }
    // 우리 골대 앞에서 빠른 슛을 몸으로 막으면 선방
    if (inc > 9 && b.lt >= 0 && s.p[b.lt].team !== p.team && Math.abs(p.x - (p.team === 0 ? FX0 : FX1)) < 140) say(s, 12, i);
    touch(s, i, inc < 7);
    pinch |= 1 << p.team;
  }
  // 양 팀 몸 사이에 낀 공은 위로 통 튀어 오른다(끼어서 왔다 갔다 하거나 몸을 뚫고 빠지지 않게)
  if (pinch === 3 && b.z === 0) { b.vz = 5.5; b.vx *= 0.3; b.vy = b.vy * 0.3 + (Math.random() < 0.5 ? -2 : 2); s.bo++; }
  const sp = Math.hypot(b.vx, b.vy), cap = b.f > 0 ? 17 : 13.5;
  if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
  // 옆 벽과 골라인
  if (b.y < FY0 + BR) { b.y = FY0 + BR; b.vy = Math.abs(b.vy) * 0.8; s.wk++; }
  if (b.y > FY1 - BR) { b.y = FY1 - BR; b.vy = -Math.abs(b.vy) * 0.8; s.wk++; }
  endLine(s, -1);
  if (s.ph === 1) endLine(s, 1);
  if (s.ph !== 1) return;
  // 공이 한자리에 오래 갇히면 위로 통 튀겨 준다
  if (Math.abs(b.x - b.sx) + Math.abs(b.y - b.sy) > 60) { b.sx = b.x; b.sy = b.y; b.sk = 0; }
  else if (++b.sk > STUCK) {
    b.sk = 0; b.vz = 7; b.vx = (CX - b.x) * 0.012 + (Math.random() - 0.5) * 3; b.vy = (CY - b.y) * 0.012 + (Math.random() - 0.5) * 3;
    s.dr++; say(s, 10, -1);
  }
  // 떡 아이템: 가끔 가운데쯤에 떨어진다
  if (s.it) {
    const it = s.it;
    if (--it.l <= 0) { s.it = null; s.iT = 900 + ((Math.random() * 600) | 0); }
    else for (let k = 0; k < n; k++) {
      const p = s.p[k];
      if (Math.hypot(p.x - it.x, p.y - it.y) > PR + 16) continue;
      if (it.k === 0) { p.sp = 300; p.dc = 0; } else p.fi = 1;
      say(s, 8 + it.k, k); s.it = null; s.iT = 900 + ((Math.random() * 600) | 0);
      break;
    }
  } else if (--s.iT <= 0) {
    s.it = { x: (CX - 200 + Math.random() * 400) | 0, y: (FY0 + 70 + Math.random() * (FY1 - FY0 - 140)) | 0, k: Math.random() < 0.5 ? 0 : 1, l: 600 };
  }
  // 막을 사람이 없는 슛이 골문으로 날아가면 슬로 모션
  if (!s.sl) {
    for (const sg of SIDES) {
      const lx = sg < 0 ? FX0 : FX1;
      if (b.vx * sg < 3) continue;
      const t = (lx - b.x) / b.vx;
      if (t <= 0 || t > 20) continue;
      const y = b.y + b.vy * t, z = b.z + b.vz * t - 0.5 * GRAV * t * t;
      if (y < GY0 + 8 || y > GY1 - 8 || z > GH - BZ - 4) continue;
      const ex = b.x + b.vx * t, ey = y, sx = ex - b.x, sy = ey - b.y, sl2 = sx * sx + sy * sy || 1;
      let free = true;
      for (let k = 0; k < n && free; k++) {
        const p = s.p[k], u = Math.max(0, Math.min(1, ((p.x - b.x) * sx + (p.y - b.y) * sy) / sl2));
        if (Math.hypot(b.x + sx * u - p.x, b.y + sy * u - p.y) < PR + BR + 8) free = false;
      }
      if (free) s.sl = Math.min(45, Math.ceil(t) * 3 + 6);
    }
  }
}
const SIDES = [-1, 1];

function goal(s, team) {
  const b = s.b, lk = b.lk >= 0 && s.p[b.lk].team !== team && b.lt >= 0 && s.p[b.lt].team === team ? b.lt : b.lk;
  const lt = lk >= 0 ? lk : b.lt, own = lt >= 0 && s.p[lt].team !== team;
  s.sc[team]++; s.lg = team; s.gk++; s.ph = 2; s.tm = CELEB; s.sl = 0;
  s.ls = lt; s.og = own ? 1 : 0; s.kt = 1 - team;
  if (own) s.ogc++; else if (lt >= 0) s.p[lt].g++;
}

// ── 봇 ──
// skip: 가끔 멍때림, lag: 생각 간격, aim: 공 뒤에 얼마나 정확히 서야 차는지, err: 방향 실수 확률, range: 슛 거리
// chg: 슛할 때 모으는 힘(틱) 후보, tackle·pass: 가로채기·패스 하려는 정도
const BOTS = {
  easy: { skip: 0.42, lag: 18, aim: 0.45, err: 0.5, range: 300, chg: [0, 0, 0, 22], tackle: 0.04, pass: 0.25, dash: false, keep: 0.5 },
  normal: { skip: 0.15, lag: 8, aim: 0.62, err: 0.2, range: 400, chg: [0, 0, 24, 44], tackle: 0.15, pass: 0.5, dash: true, keep: 0.5 },
  hard: { skip: 0, lag: 2, aim: 0.78, err: 0.05, range: 470, chg: [44, 44, 0, 30], tackle: 0.35, pass: 0.7, dash: true, keep: 0.5 },
};
const dirBits = (x, y, dz) => (x > dz ? R : x < -dz ? L : 0) | (y > dz ? D : y < -dz ? U : 0);

function plan(s, i, p, mem, cfg) {
  const b = s.b, n = s.p.length, sg = p.team === 0 ? 1 : -1, gx = sg > 0 ? FX1 : FX0, ogx = sg > 0 ? FX0 : FX1;
  const bx = b.x + b.vx * 7, by = b.y + b.vy * 7;
  let mate = -1;
  for (let j = 0; j < n; j++) if (j !== i && s.p[j].team === p.team) mate = j;
  const dMe = Math.hypot(p.x - bx, p.y - by);
  // 2대2: 공에 가까운 쪽이 공격, 다른 쪽은 골문을 지킨다(바뀔 때 조금 버틴다)
  let att = true;
  if (mate >= 0) {
    const q = s.p[mate], dM = Math.hypot(q.x - bx, q.y - by) + (q.tb > IMMUNE ? 200 : 0);
    att = mem.att == null ? dMe < dM || (dMe === dM && i < mate) : mem.att ? dMe < dM + 45 : dMe < dM - 45;
  }
  mem.att = att;
  let opp = -1, od = 1e9;
  for (let j = 0; j < n; j++) { const q = s.p[j]; if (q.team === p.team) continue; const d = Math.hypot(q.x - b.x, q.y - b.y); if (d < od) { od = d; opp = j; } }
  const oppHas = od < PR + BR + 16, near = Math.hypot(p.x - b.x, p.y - b.y);
  mem.kick = 0; mem.dash = 0;
  let tx = gx, ty = CY, want = -1;
  if (!att) {
    const q = s.p[mate], mateHas = Math.hypot(q.x - b.x, q.y - b.y) < PR + BR + 16 && !oppHas;
    if (!(near < 120 && near < od - 10)) {
      if (mateHas && (b.x - CX) * sg > 0) { mem.tx = CX - sg * 70; mem.ty = CY + (by - CY) * 0.3; }      // 우리 공이면 가운데에서 받을 준비
      else { mem.tx = ogx + sg * 44; mem.ty = Math.max(GY0 + 12, Math.min(GY1 - 12, CY + (by - CY) * cfg.keep)); }      // 골문 앞을 지킨다
      return;
    }
    // 공이 골문 가까이 오면 걷어낸다: 동료에게 띄우거나 앞으로 길게
    if (Math.random() < cfg.pass) { tx = q.x; ty = q.y; want = 24; } else { tx = CX + sg * 200; ty = b.y < CY ? FY0 + 60 : FY1 - 60; want = 28; }
  } else {
    const toGoal = Math.abs(gx - b.x);
    // 앞이 막혔나(공과 골대 사이 가까이에 상대가 있나)
    let blocked = false;
    for (let j = 0; j < n; j++) { const q = s.p[j]; if (q.team !== p.team && (q.x - b.x) * sg > 0 && (q.x - b.x) * sg < 90 && Math.abs(q.y - b.y) < 45) blocked = true; }
    if (toGoal < cfg.range) {
      want = cfg.chg[(Math.random() * cfg.chg.length) | 0];
      ty = CY + (Math.random() * 2 - 1) * 55;
    } else if (mate >= 0 && Math.random() < cfg.pass && (blocked || (s.p[mate].x - b.x) * sg > 120)) {
      const q = s.p[mate];
      tx = q.x + q.vx * 10; ty = q.y + q.vy * 10;
      // 패스 길목에 상대가 있으면 띄운다
      let lane = true;
      const lx = tx - b.x, ly = ty - b.y, l2 = lx * lx + ly * ly || 1;
      for (let j = 0; j < n; j++) { const o = s.p[j]; if (o.team === p.team) continue; const u = Math.max(0, Math.min(1, ((o.x - b.x) * lx + (o.y - b.y) * ly) / l2)); if (Math.hypot(b.x + lx * u - o.x, b.y + ly * u - o.y) < 34) lane = false; }
      want = lane ? 0 : 24;
    } else if (blocked && Math.random() < 0.4) want = 26;
    // 공 가진 상대에게 대시로 가로채기
    if (oppHas && p.dc <= 0 && s.tick >= (mem.tt | 0) && ((mem.tt = s.tick + 45), Math.random() < cfg.tackle)) {      // 0.75초에 한 번만 마음먹는다
      const o = s.p[opp];
      if (Math.hypot(o.x - p.x, o.y - p.y) < 95) { mem.tx = o.x; mem.ty = o.y; mem.dash = 1; return; }
    }
  }
  const ul = Math.hypot(tx - bx, ty - by) || 1, ux = (tx - bx) / ul, uy = (ty - by) / ul;
  let ax = bx - ux * (PR + BR + 1), ay = by - uy * (PR + BR + 1);
  if ((p.x - bx) * ux + (p.y - by) * uy > -8) {       // 공보다 앞에 있으면 옆으로 돌아 들어간다
    const sx = -uy, sy = ux, side = (p.x - bx) * sx + (p.y - by) * sy >= 0 ? 1 : -1;
    ax = bx + sx * side * 52 - ux * 10; ay = by + sy * side * 52 - uy * 10;
  }
  mem.tx = ax; mem.ty = ay; mem.ux = ux; mem.uy = uy;
  if (want >= 0) {
    mem.kick = 1; mem.want = want;
    const ang = Math.atan2(uy, ux) + (Math.random() < cfg.err ? (Math.random() - 0.5) * 1.6 : 0);
    mem.ax = Math.cos(ang); mem.ay = Math.sin(ang);
  }
  if (cfg.dash && p.dc <= 0 && dMe > 170) mem.dash = 1;      // 공이 멀면 대시로 따라붙는다
}

function bot(s, i, mem, level) {
  if (s.over || s.ph !== 1) { mem.last = 0; mem.at = null; return 0; }
  const p = s.p[i];
  if (p.tb > IMMUNE) { mem.last = 0; return 0; }
  if (s.sl > 0 && s.sl % 3) return mem.last | 0;
  const cfg = BOTS[level] || BOTS.normal, b = s.b;
  if (Math.random() < cfg.skip) return mem.last | 0;
  if (mem.at == null || s.tick - mem.at >= cfg.lag || s.tick < mem.at) { mem.at = s.tick; plan(s, i, p, mem, cfg); }
  let m = dirBits(mem.tx - p.x, mem.ty - p.y, 6);
  if (mem.hold) { if (p.ch > 0 && s.tick < mem.hold && Math.hypot(b.x - p.x, b.y - p.y) < 95) m |= A; else mem.hold = 0; }
  else if (mem.kick) {
    const bd = Math.hypot(b.x - p.x, b.y - p.y) || 1, aligned = ((b.x - p.x) / bd) * mem.ux + ((b.y - p.y) / bd) * mem.uy > cfg.aim;
    if (p.ch > 0) {
      const ready = p.ch >= mem.want && bd < REACH - 3 && aligned && b.z < ZH0;
      if (ready) { m = dirBits(mem.ax, mem.ay, 0.38); mem.kick = 0; }      // 떼면서 노리는 쪽을 누른다
      else if (bd > 150 || (p.ch >= CH_SW1 - 1 && mem.want < CH_SW1)) { mem.kick = 0; mem.hold = s.tick + 60; m |= A; }      // 놓쳤거나 너무 모았으면 포기(공에서 멀어진 뒤, 늦어도 1초 뒤 뗀다)
      else m |= A;
    } else if (!(mem.last & A) && b.z < ZH0 && (mem.want > 0 ? bd < 150 && aligned : bd < REACH - 3 && aligned)) m |= A;
  }
  if (mem.dash && !(mem.last & B) && m & (L | R | U | D)) { m |= B; mem.dash = 0; }
  mem.last = m;
  return m;
}

// ── 그리기 ──
const stage = lazy3d("./soccer3d.js?v=5");
const lerpV = (cur, old, a) => (old != null ? old + (cur - old) * a : cur);
const POS = [[0, 0], [0, 0], [0, 0], [0, 0]];

function chargeBar(ctx, x, y, ch, mine) {
  const w = mine ? 56 : 40, h = mine ? 9 : 6, x0 = x - w / 2, k = ch / CH_MAX;
  ctx.fillStyle = "rgba(43,45,110,.85)"; rr(ctx, x0 - 2, y - 2, w + 4, h + 4, 4); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(x0 + (CH_SW0 / CH_MAX) * w, y, ((CH_SW1 - CH_SW0) / CH_MAX) * w, h);      // 딱 맞춤 칸
  const sweet = ch >= CH_SW0 && ch <= CH_SW1;
  ctx.fillStyle = sweet ? "#ffd23c" : ch > CH_SW1 ? "#b79cff" : "#7ddc7a";
  ctx.fillRect(x0, y, k * w, h);
  ctx.strokeStyle = "#ffd23c"; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + (CH_SW0 / CH_MAX) * w, y, ((CH_SW1 - CH_SW0) / CH_MAX) * w, h);
  if (mine && ch >= CH_TAP) label(ctx, sweet ? "지금!" : ch > CH_SW1 ? "높이" : "모으는 중", x, y - 5, 12, sweet ? "#ffd23c" : "#fff", "rgba(43,45,110,.8)");
}

function draw(ctx, v, env) {
  const fd = FIELDS[v.th | 0] || FIELDS[0], a = env.alpha;
  let d3 = null;
  const m3 = stage.get();
  if (m3) { try { d3 = m3.render(v, env, fd); ctx.drawImage(d3.cv, 0, 0, W, H); } catch { d3 = null; stage.fail(); } }
  if (d3) {
    v.p.forEach((p, i) => { POS[i][0] = d3.tags[i][0]; POS[i][1] = d3.tags[i][1]; });
  } else {
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
    // 아이템
    if (v.it) {
      const bob = Math.sin(env.t * 5) * 3, col = v.it.k ? "#ff8a3c" : "#ffd23c";
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(v.it.x, v.it.y + 12, 13, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(v.it.x, v.it.y - 4 + bob, 13, 0, 7); ctx.fill(); ctx.stroke();
      label(ctx, ITEM_NAME[v.it.k], v.it.x, v.it.y - 24 + bob, 12, "#fff", "rgba(43,45,110,.8)");
    }
    // 선수
    v.p.forEach((p, i) => {
      const q = env.prev && env.prev.p[i], x = q ? lerpV(p.x, q.x, a) : p.x, y = q ? lerpV(p.y, q.y, a) : p.y;
      POS[i][0] = x; POS[i][1] = y - 31;
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x, y + 16, 19, 7, 0, 0, 7); ctx.fill();
      if (p.ds > 0 || p.sp > 0) {       // 대시·번개 잔상
        ctx.globalAlpha = 0.25;
        const tx = p.ds > 0 ? p.dx : p.vx / 5, ty = p.ds > 0 ? p.dy : p.vy / 5;
        for (let k = 1; k <= 3; k++) { ctx.fillStyle = p.sp > 0 ? "#ffd23c" : TEAM[p.team]; ctx.beginPath(); ctx.arc(x - tx * k * 13, y - ty * k * 13, PR - k * 2, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      const sweet = p.ch >= CH_SW0 && p.ch <= CH_SW1;
      ctx.strokeStyle = p.fi ? "#ff8a3c" : sweet ? "#ffd23c" : TEAM[p.team]; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, PR + 3 + (p.kc > 8 ? 4 : 0), 0, 7); ctx.stroke();
      if (p.dc <= 0) { ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(x + PR + 2, y + PR - 2, 4.5, 0, 7); ctx.fill(); }      // 대시 준비됨
      const hop = v.ph === 2 && !v.og && v.ls === i ? Math.abs(Math.sin(env.t * 10)) * 14 : 0;
      ctx.save();
      if (p.tb > IMMUNE) { ctx.translate(x, y); ctx.rotate(((p.tb - IMMUNE) / TUMBLE) * 6.283); ctx.translate(-x, -y); }
      drawMochi(ctx, x, y - hop, PR, parseLook(v.seats[i].look, i), { ang: Math.atan2(v.b.y - p.y, v.b.x - p.x) });
      ctx.restore();
      if (p.tb > IMMUNE) for (let k = 0; k < 3; k++) { const an = env.t * 6 + k * 2.1; ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(x + Math.cos(an) * 16, y - 24 + Math.sin(an) * 5, 3.5, 0, 7); ctx.fill(); }
    });
    // 공: 높이만큼 위에 그리고, 그림자는 땅에 (높을수록 작고 옅다)
    const bq = env.prev && env.prev.b, bx = bq ? lerpV(v.b.x, bq.x, a) : v.b.x, by = bq ? lerpV(v.b.y, bq.y, a) : v.b.y, bz = Math.max(0, bq ? lerpV(v.b.z, bq.z, a) : v.b.z);
    const sh = 1 - Math.min(0.55, bz / 150);
    ctx.fillStyle = `rgba(0,0,0,${0.24 * sh})`; ctx.beginPath(); ctx.ellipse(bx, by + 9, 11 * sh, 5 * sh, 0, 0, 7); ctx.fill();
    const r = BR * (1 + bz / 200), py = by - bz;
    if (v.b.f > 0) for (let k = 4; k >= 1; k--) { ctx.fillStyle = k > 2 ? "rgba(255,93,60,.35)" : "rgba(255,200,60,.6)"; ctx.beginPath(); ctx.arc(bx - v.b.vx * k * 1.6, py - v.b.vy * k * 1.6, r * (1.1 - k * 0.12), 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(bx, py); ctx.rotate((bx + by) * 0.05); ctx.scale(r / BR, r / BR);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2a2440"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, BR, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2a2440"; ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, 7); ctx.fill();
    for (let k = 0; k < 5; k++) { const an = (k / 5) * 6.283; ctx.beginPath(); ctx.arc(Math.cos(an) * 9.5, Math.sin(an) * 9.5, 2.6, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // 이름표와 힘 막대 (2D·3D 공통)
  v.p.forEach((p, i) => {
    const [x, y] = POS[i];
    if (i === env.me) { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2b2d6e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 8, y - 10); ctx.lineTo(x + 8, y - 10); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else label(ctx, v.seats[i].name, x, y, 12, "#fff", "rgba(43,45,110,.8)");
    if (p.ch > 0 && !v.over) chargeBar(ctx, x, y - (i === env.me ? 26 : 30), p.ch, i === env.me);
  });
  // 슬로 모션: 위아래 검은 띠
  if (v.sl > 0 && v.ph === 1) { ctx.fillStyle = "rgba(10,10,30,.75)"; ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26); }
  // 점수판
  ctx.fillStyle = "rgba(255,253,246,.94)"; rr(ctx, CX - 150, 6, 300, 46, 14); ctx.fill();
  label(ctx, String(v.sc[0]), CX - 100, 42, 36, TEAM[0], null);
  label(ctx, String(v.sc[1]), CX + 100, 42, 36, TEAM[1], null);
  const sec = Math.ceil(v.time / 60);
  label(ctx, v.time > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "골든골!", CX, 38, 22, v.time > HURRY ? "#2b2d6e" : "#ff5d73", null);
  if (env.me >= 0 && v.tick < 420) {
    label(ctx, `나는 ${TEAM_NAME[env.me % 2]} · ${env.me % 2 ? "왼쪽" : "오른쪽"} 골대로!`, CX, H - 12, 18, "#fff", "rgba(43,45,110,.85)");
    label(ctx, `${env.touch ? "차기" : "스페이스"} 짧게 = 패스·슛 · 꾹 눌러 금색에서 떼면 불꽃 슛!`, CX, H - 40, 15, "#ffd23c", "rgba(43,45,110,.85)");
  }
  // 알림
  if (v.nc && v.tick - v.nt < 70 && v.ph === 1 && !v.over && NOTES[v.nc]) {
    const age = v.tick - v.nt, k = Math.min(1, age / 8), who = v.nw >= 0 && v.seats[v.nw] ? v.seats[v.nw].name : "";
    ctx.save(); ctx.globalAlpha = age > 55 ? (70 - age) / 15 : 1; ctx.translate(CX, 104); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    label(ctx, NOTES[v.nc], 0, 0, 34, v.nc === 1 ? "#ffd23c" : v.nc === 12 ? "#7ddc7a" : "#fff", "#2b2d6e");
    if (who && v.nc !== 10) label(ctx, who, 0, 26, 15, "#fff", "rgba(43,45,110,.8)");
    ctx.restore();
  }
  if (v.ph === 1 && v.time <= 0 && v.ot < 150 && !v.over) label(ctx, "골든골! 먼저 넣는 팀이 승리", CX, CY - 60, 40, "#ffd23c", "#2b2d6e");
  if (v.ph === 0 && !v.over) {
    const n = Math.ceil(v.tm / 30);
    label(ctx, n > 3 ? "준비!" : String(n), CX, CY + 24, n > 3 ? 70 : 96, "#fff", "#2b2d6e");
  }
  if (v.ph === 2 && !v.over) {
    const k = CELEB - v.tm, cols = ["#ff5d73", "#ffc93c", "#7ddc7a", "#6ec6ff", "#b79cff"];
    if (k < 12) { ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - k / 12)})`; ctx.fillRect(0, 0, W, H); }      // 번쩍
    if (!d3) for (let i = 0; i < 46; i++) {       // 축포 (3D 에서는 무대가 직접 뿌린다)
      const x = (i * 131) % W, y = ((i * 53) % 200) - 120 + k * (3 + (i % 4)), s2 = 5 + (i % 3) * 2;
      ctx.save(); ctx.translate(x + Math.sin(k * 0.1 + i) * 14, y); ctx.rotate(k * 0.12 + i);
      ctx.fillStyle = cols[i % 5]; ctx.fillRect(-s2, -s2 / 2, s2 * 2, s2); ctx.restore();
    }
    const sc = Math.min(1, k / 10);
    ctx.save(); ctx.translate(CX, CY + 20); ctx.scale(0.5 + sc * 0.5, 0.5 + sc * 0.5);
    label(ctx, v.og ? "자책골…" : "골!", 0, 0, v.og ? 80 : 110, TEAM[v.lg], "#fff");
    ctx.restore();
    const who = v.ls >= 0 && v.seats[v.ls] ? v.seats[v.ls].name : "";
    if (who && k > 10) label(ctx, v.og ? `${who}의 공이 그만…` : `${who} 골!`, CX, CY + 70, 26, "#fff", "rgba(43,45,110,.85)");
  }
  label(ctx, fd.name, W - 14, H - 12, 14, "#fff", "rgba(43,45,110,.7)", "right");
  if (v.over) {
    const w = v.over.w, mine = env.me >= 0 ? env.me % 2 : -1;
    label(ctx, w < 0 ? "무승부!" : mine < 0 ? `${TEAM_NAME[w]} 승리!` : w === mine ? "이겼다!" : "아쉽다, 졌어요", CX, CY + 10, 70, "#ffc93c", "#2b2d6e");
    label(ctx, summary(v), CX, CY + 62, 18, "#fff", "rgba(43,45,110,.85)");
  }
}

// 경기 뒤 한 줄: 득점자 · 슛 수
function summary(v) {
  const sc = v.p.map((p, i) => [p.g | 0, i]).filter((x) => x[0] > 0).sort((x, y) => y[0] - x[0]).map(([g, i]) => `${v.seats[i].name} ${g}골`);
  const sh = [0, 0];
  v.p.forEach((p) => { sh[p.team] += p.sh | 0; });
  return `${sc.length ? "득점 " + sc.join(", ") : "득점 없음"} · 슛 빨강 ${sh[0]} : 파랑 ${sh[1]}`;
}

function fx(v, m, snd, me) {
  if (m.gk == null) Object.assign(m, { gk: v.gk, kk: v.kk, wk: v.wk, dk: v.dk, hk: v.hk, tk: v.tk, cb: v.cb, bo: v.bo, nn: v.nn, ov: !!v.over, ph: v.ph, cd: 0, sl: 0, sw: 0 });
  if (v.dk !== m.dk) { m.dk = v.dk; snd.whoosh(); }
  if (v.ph !== m.ph) { if (v.ph === 1 && !v.over) snd.whistle(); m.ph = v.ph; }
  if (v.ph === 0) { const n = Math.ceil(v.tm / 30); if (n <= 3 && n !== m.cd) { m.cd = n; snd(660, 0.08, "square", 0.05); } } else m.cd = 0;
  if (v.kk !== m.kk) { m.kk = v.kk; if (v.kh === 2) { snd.boom(0.6); snd.sparkle(); } else snd.thud(v.kh === 0 ? 0.8 : 1.1); }
  if (v.hk !== m.hk) { m.hk = v.hk; snd.pop(); snd.thud(0.5); }
  if (v.tk !== m.tk) { m.tk = v.tk; snd.thud(1.2); snd.whoosh(1.4); }
  if (v.cb !== m.cb) { m.cb = v.cb; snd(1760, 0.35, "triangle", 0.09, -300); snd.clack(1.2); }
  if (v.bo !== m.bo) { m.bo = v.bo; snd.thud(0.35); }
  if (v.wk !== m.wk) { m.wk = v.wk; snd(330, 0.05, "sine", 0.06); }
  if (v.nn !== m.nn) { m.nn = v.nn; if (v.nc === 8 || v.nc === 9) snd.coin(); else if (v.nc === 10) snd.pop(); else if (v.nc === 12) snd.cheer(); }
  if (v.sl > 0 && !m.sl) snd.whoosh(0.6);
  m.sl = v.sl > 0 ? 1 : 0;
  // 내가 힘을 모으다 금색 칸에 들어가면 딩
  const p = me >= 0 && v.p[me], sw = p && p.ch >= CH_SW0 && p.ch <= CH_SW1 ? 1 : 0;
  if (sw && !m.sw) snd(1320, 0.07, "triangle", 0.08);
  m.sw = sw;
  if (v.gk !== m.gk) { m.gk = v.gk; jingle(snd, [523, 659, 784, 1047, 1319], 90); snd.cheer(); setTimeout(() => snd.cheer(), 500); }
  if (!!v.over !== m.ov) { m.ov = !!v.over; if (v.over) jingle(snd, [784, 659, 784, 1047], 150); }
}

function title(v, me) {
  const w = v.over.w;
  if (w < 0) return "무승부! 한 판 더?";
  if (me < 0) return `${TEAM_NAME[w]} 승리! 한 판 더?`;
  return w === me % 2 ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
}

// 보낼 때는 선수·공을 숫자 배열로 줄이고 소수 한 자리로 자른다
const PK = ["x", "y", "vx", "vy", "kc", "pa", "ds", "dc", "pb", "dx", "dy", "team", "ch", "kq", "kw", "tb", "sp", "fi", "g", "sh"];
const BK = ["x", "y", "z", "vx", "vy", "vz", "f", "lt", "lk", "pp", "sk", "sx", "sy"];
const r1 = (x) => Math.round(x * 10) / 10;
function pack(s) {
  const o = {};
  for (const k in s) o[k] = s[k];
  o.p = s.p.map((p) => PK.map((k) => r1(p[k])));
  o.b = BK.map((k) => r1(s.b[k]));
  return o;
}
function unpack(o) {
  const s = {};
  for (const k in o) s[k] = o[k];
  s.p = o.p.map((a) => { const p = {}; PK.forEach((k, i) => { p[k] = a[i]; }); return p; });
  s.b = {}; BK.forEach((k, i) => { s.b[k] = o.b[i]; });
  return s;
}

const G = {
  W, H, sendEvery: 2, action: "차기", action2: "대시", overDelay: 260, multiDir: true,
  hurry: (v) => v.time < HURRY,
  bots: { solo: 3, local: 2 },
  cap: (mode, n) => mode || (n >= 3 ? 4 : 2),
  fill: (mode, n) => Math.max(0, (mode || (n >= 3 ? 4 : 2)) - n),
  init, step, bot, draw, fx, title, pack, unpack, dispose: () => stage.dispose(),
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
    ["목표", "공을 상대 골대에 넣어요. 2분 동안 더 많이 넣은 팀이 승리, 5골을 먼저 넣어도 끝. 동점이면 골든골"],
    ["조작", "이동 방향키(또는 W·A·S·D, 대각선 가능), 공 가까이에서 스페이스로 차기. 골대 쪽으로 차면 골문 안으로 알아서 맞춰 줘요"],
    ["패스", "동료 쪽을 누르고 짧게 차면 동료 발밑으로 패스. 조금 모아서 차면 상대 머리 위로 띄워요"],
    ["힘 모으기", "차기를 꾹 누르면 머리 위 막대가 차요. 금색 칸에서 떼면 '딱 맞춤' 불꽃 슛(한 명을 뚫어요), 끝까지 모으면 높이 띄우는 칩슛"],
    ["헤딩·발리", "공이 머리 높이로 오면 저절로 헤딩! 그때 차기를 누르고 있으면 더 센 발리슛"],
    ["대시·가로채기", "방향을 누른 채 Q(2P는 마침표)로 돌진. 공 가진 상대에게 부딪히면 공을 뺏고 상대는 잠깐 데굴. 노란 점이 보이면 쓸 수 있어요"],
    ["떡 아이템", "가끔 가운데에 떡이 떨어져요. 번개 떡은 잠깐 빨라지고, 불꽃 떡은 다음 슛이 불꽃 슛"],
    ["한 키보드 2인", "1P: W·A·S·D + F, 대시 Q / 2P: 방향키 + Enter, 대시 마침표(.)"],
  ],
};
export const start = (opts) => startHostGame(G, opts);
export const _test = G;
