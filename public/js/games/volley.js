// 통통 배구 — 말랑한 떡 친구들이 하는 2~4인 배구
// 게임 계산은 "방장" 한 명의 브라우저가 맡고, 나머지는 결과를 받아 그린다.
// 혼자 하기·한 키보드 2인은 서버 없이 돌아간다.

const W = 960, H = 540, GROUND = 470, NET_X = 480, NET_HW = 7, NET_TOP = GROUND - 165;
const PR = 40, BR = 24, DT = 1 / 60;
const MOVE = 400, JUMP = 930, PG = 2300, BG = 1250;
export const WIN_SCORE = 7;

const L = 1, R = 2, U = 4, A = 8;
const HOME = { 2: [240, 720], 4: [310, 650, 130, 830] };
const COLORS = [
  { body: "#ff9db5", dark: "#e56b8c", name: "분홍" },
  { body: "#9bd88a", dark: "#5fae55", name: "쑥" },
  { body: "#ffd66b", dark: "#e3a820", name: "호박" },
  { body: "#8ecbff", dark: "#4d9be0", name: "하늘" },
];
const BOT_NAMES = ["꿀떡봇", "쑥떡봇", "콩떡봇", "찰떡봇"];
const SKILL = { easy: 0.45, normal: 0.7, hard: 0.93 };

// ── 상태 ──────────────────────────────────────────────
function newState(mode) {
  const s = { tick: 0, mode, ph: 0, tm: 50, sv: 0, sc: [0, 0], win: -1, h: 0, k: 0, lh: -99, p: [], b: { x: 0, y: 0, vx: 0, vy: 0 } };
  for (let i = 0; i < mode; i++) s.p.push({ x: HOME[mode][i], y: GROUND - PR, vx: 0, vy: 0, sm: 0, team: i % 2 });
  resetRound(s, Math.random() < 0.5 ? 0 : 1);
  return s;
}

function resetRound(s, team) {
  s.sv = team; s.ph = 0; s.tm = 50;
  s.p.forEach((p, i) => { p.x = HOME[s.mode][i]; p.y = GROUND - PR; p.vx = 0; p.vy = 0; p.sm = 0; });
  s.b.x = team === 0 ? 240 : 720; s.b.y = 170; s.b.vx = 0; s.b.vy = 0;
}

function stepPlayer(p, m) {
  const onGround = p.y >= GROUND - PR - 0.5;
  p.vx = ((m & R ? 1 : 0) - (m & L ? 1 : 0)) * MOVE;
  if (m & U && onGround) p.vy = -JUMP;
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
  for (let i = 0; i < s.p.length; i++) stepPlayer(s.p[i], masks[i] | 0);
  const b = s.b;

  if (s.ph === 0) { if (--s.tm <= 0) s.ph = 1; return; }
  if (s.ph === 2) {
    // 득점 뒤 공은 바닥에서 조금 굴러가다 멈춘다
    b.vx *= 0.95; b.x += b.vx * DT;
    if (--s.tm <= 0) resetRound(s, s.sv);
    return;
  }
  if (s.ph === 3) { s.tm++; return; }

  b.vy += BG * DT;
  b.x += b.vx * DT; b.y += b.vy * DT;
  if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * 0.9; }
  if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx) * 0.9; }
  if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * 0.9; }

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
    dx = b.x - p.x; dy = b.y - p.y; d = Math.hypot(dx, dy);
    if (d >= BR + PR) continue;
    if (d < 0.001) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * (BR + PR); b.y = p.y + ny * (BR + PR);
    const m = masks[i] | 0, air = p.y < GROUND - PR - 2, dir = p.team === 0 ? 1 : -1;
    if (m & A && air && p.sm <= 0) {
      // 강타: 공중에서 강타 버튼을 누른 채 맞히면 상대 코트로 내리꽂는다
      b.vx = dir * 1050; b.vy = 260; p.sm = 22; s.k++; s.lh = s.tick;
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
  const a = [s.tick, s.mode, s.ph, s.tm, s.sv, s.sc[0], s.sc[1], s.win, s.h, s.k, Math.round(s.b.x), Math.round(s.b.y), Math.round(s.b.vx), Math.round(s.b.vy)];
  for (const p of s.p) a.push(Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.sm);
  return "s" + JSON.stringify(a);
}

function decode(str) {
  const a = JSON.parse(str.slice(1));
  const s = { tick: a[0], mode: a[1], ph: a[2], tm: a[3], sv: a[4], sc: [a[5], a[6]], win: a[7], h: a[8], k: a[9], lh: a[0], b: { x: a[10], y: a[11], vx: a[12], vy: a[13] }, p: [] };
  for (let i = 0, j = 14; i < s.mode; i++, j += 5) s.p.push({ x: a[j], y: a[j + 1], vx: a[j + 2], vy: a[j + 3], sm: a[j + 4], team: i % 2 });
  return s;
}

// ── 봇 ────────────────────────────────────────────────
function botMask(s, i, mem, skill) {
  const p = s.p[i], b = s.b, dir = p.team === 0 ? 1 : -1;
  if (mem.round !== s.sc[0] + s.sc[1] || s.tick - mem.at > 90) {
    mem.round = s.sc[0] + s.sc[1]; mem.at = s.tick;
    mem.err = (Math.random() * 2 - 1) * (1 - skill) * 85;
  }
  // 공이 어디로 떨어질지 미리 계산
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const hitY = GROUND - PR * 2 - BR + 14;
  if (s.ph === 1) {
    for (let k = 0; k < 200 && !(y >= hitY && vy > 0); k++) {
      vy += BG * DT; x += vx * DT; y += vy * DT;
      if (x < BR) { x = BR; vx = -vx; }
      if (x > W - BR) { x = W - BR; vx = -vx; }
    }
  }
  const mine = p.team === 0 ? x < NET_X : x > NET_X;
  let target = HOME[s.mode][i];
  if (mine && s.ph < 2) {
    let go = true;
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
  const near = Math.abs(b.x - p.x) < 95;
  const bOwn = p.team === 0 ? b.x < NET_X : b.x > NET_X;
  if (s.ph === 1 && bOwn && near && onGround && b.y < p.y - 80 && b.y > p.y - 250 && b.vy > -150 && Math.random() < skill * 0.5) m |= U;
  if (!onGround && Math.hypot(b.x - p.x, b.y - p.y) < PR + BR + 45 && (b.x - p.x) * dir > -12 && Math.random() < skill) m |= A;
  return m;
}

// ── 소리 ──────────────────────────────────────────────
let actx = null;
function beep(freq, dur, type = "sine", vol = 0.12, slide = 0) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
  } catch {}
}

// ── 게임 시작 ─────────────────────────────────────────
// opts: { canvas, touchEl, kind:'solo'|'local'|'online', mode:2|4, level, myName,
//         room, send(str), isMuted(), onOver(winTeam, myTeam) }
export function startVolley(opts) {
  const { canvas, touchEl, kind } = opts;
  const ctx = canvas.getContext("2d");
  let room = opts.room || null;
  let sim = null;        // 내가 방장(또는 오프라인)일 때의 진짜 상태
  let snap = null;       // 받은 최신 상태
  let view = null;       // 화면에 그리는 상태
  let running = true, last = performance.now(), acc = 0, overSent = false, shake = 0;
  let seenH = 0, seenK = 0, seenScore = 0, seenPh = -1;
  const remote = [0, 0, 0, 0];
  const botMem = [{}, {}, {}, {}];
  const keys = new Set();
  const touch = { m: 0 };
  let lastSentMask = -1;
  const trail = [];
  const clouds = [0, 1, 2, 3].map((i) => ({ x: i * 270 + 40, y: 50 + (i % 2) * 46, s: 0.8 + (i % 3) * 0.25 }));

  const iAmHost = () => kind !== "online" || (room && room.host === room.you);
  const mySlot = () => {
    if (kind !== "online") return 0;
    const me = room && room.players.find((p) => p.id === room.you);
    return me ? me.slot : -1;
  };
  const modeNow = () => (sim || snap || { mode: opts.mode }).mode;

  function slotName(i) {
    if (kind === "solo") return i === 0 ? opts.myName : BOT_NAMES[i];
    if (kind === "local") return i === 0 ? "1P" : i === 1 ? "2P" : BOT_NAMES[i];
    const pl = room.players.find((p) => p.slot === i);
    return pl ? pl.name : BOT_NAMES[i];
  }

  // 조작
  function kbMask(set) {
    let m = 0;
    for (const c of set) if (keys.has(c[0])) m |= c[1];
    return m;
  }
  const P1 = [["KeyA", L], ["KeyD", R], ["KeyW", U], ["KeyF", A], ["KeyG", A]];
  const P2 = [["ArrowLeft", L], ["ArrowRight", R], ["ArrowUp", U], ["Slash", A], ["ShiftRight", A], ["Enter", A], ["Numpad0", A]];
  const SOLO = [...P1, ...P2, ["Space", A]];
  const myMask = () => kbMask(SOLO) | touch.m;

  const GAME_KEYS = new Set(SOLO.map((c) => c[0]));
  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.type === "keydown") keys.add(e.code); else keys.delete(e.code);
  }
  const onBlur = () => { keys.clear(); touch.m = 0; };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", onBlur);

  // 터치 버튼
  if (touchEl) {
    touchEl.innerHTML = "";
    const mk = (label, bit, cls) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tbtn " + cls; b.textContent = label;
      const on = (e) => { e.preventDefault(); touch.m |= bit; b.classList.add("on"); };
      const off = (e) => { e.preventDefault(); touch.m &= ~bit; b.classList.remove("on"); };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("pointerleave", off);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return b;
    };
    const left = document.createElement("div"); left.className = "tgroup";
    const right = document.createElement("div"); right.className = "tgroup";
    left.append(mk("◀", L, "move"), mk("▶", R, "move"));
    right.append(mk("강타", A, "smash"), mk("점프", U, "jump"));
    touchEl.append(left, right);
  }

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
      if (!sim) sim = snap ? snap : newState(opts.mode);
      step(sim, masksFor(sim));
      if (kind === "online" && sim.tick % 2 === 0) opts.send(encode(sim));
      view = sim;
      if (sim.ph === 3 && sim.tm > 230 && !overSent) { overSent = true; finish(sim.win); }
    } else {
      sim = null;
      const m = mySlot() >= 0 && mySlot() < modeNow() ? myMask() : 0;
      if (m !== lastSentMask) { lastSentMask = m; opts.send("i" + m); }
      if (!snap) return;
      if (!view || view === sim || view.mode !== snap.mode) view = JSON.parse(JSON.stringify(snap));
      // 받은 상태 쪽으로 부드럽게 따라간다. 내 캐릭터는 먼저 움직여서 반응을 빠르게.
      const k = 0.4, me = mySlot();
      for (let i = 0; i < snap.p.length; i++) {
        const v = view.p[i], t = snap.p[i];
        if (i === me) { stepPlayer(v, m); v.x += (t.x - v.x) * 0.15; v.y += (t.y - v.y) * 0.15; }
        else { v.x += (t.x + t.vx * DT - v.x) * k; v.y += (t.y + t.vy * DT - v.y) * k; v.vx = t.vx; v.vy = t.vy; }
        v.sm = t.sm;
      }
      // 공은 받은 값에서 한 프레임씩 미리 굴려 둔다
      if (snap.ph === 1) { snap.b.vy += BG * DT; snap.b.x += snap.b.vx * DT; snap.b.y = Math.min(GROUND - BR, snap.b.y + snap.b.vy * DT); }
      view.b.x += (snap.b.x - view.b.x) * 0.55; view.b.y += (snap.b.y - view.b.y) * 0.55;
      view.b.vx = snap.b.vx; view.b.vy = snap.b.vy;
      Object.assign(view, { tick: view.tick + 1, ph: snap.ph, tm: snap.tm, sv: snap.sv, sc: snap.sc, win: snap.win, h: snap.h, k: snap.k });
    }
    effects();
  }

  function finish(win) {
    const me = mySlot();
    opts.onOver(win, me >= 0 && me < modeNow() ? me % 2 : -1);
  }

  function effects() {
    const s = view; if (!s) return;
    const muted = opts.isMuted && opts.isMuted();
    if (s.h !== seenH) { seenH = s.h; if (!muted) beep(430 + Math.random() * 80, 0.09, "sine", 0.14, 160); }
    if (s.k !== seenK) { seenK = s.k; shake = 9; if (!muted) { beep(180, 0.16, "square", 0.1, -90); beep(760, 0.08, "triangle", 0.1, -300); } }
    const sc = s.sc[0] + s.sc[1];
    if (sc !== seenScore) { seenScore = sc; shake = 6; if (!muted) { beep(660, 0.1, "triangle", 0.12); setTimeout(() => beep(880, 0.16, "triangle", 0.12), 100); } }
    if (s.ph !== seenPh) {
      if (s.ph === 3 && !muted) [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.12), i * 130));
      seenPh = s.ph;
    }
    trail.push({ x: s.b.x, y: s.b.y }); if (trail.length > 7) trail.shift();
    if (shake > 0) shake *= 0.85;
  }

  // ── 그리기 ──
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.round(r.width * dpr)), h = Math.round((w * H) / W);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function drawMochi(p, i, s, isMe) {
    const c = COLORS[i], b = s.b;
    const air = p.y < GROUND - PR - 2;
    const sq = air ? Math.max(-0.16, Math.min(0.16, -p.vy / 5200)) : Math.sin(s.tick * 0.12 + i) * 0.025;
    const rx = PR * (1 - sq * 0.8), ry = PR * (1 + sq);
    // 그림자
    ctx.fillStyle = "rgba(80,50,20,.18)";
    ctx.beginPath(); ctx.ellipse(p.x, GROUND + 4, PR * (0.95 - (GROUND - PR - p.y) / 700), 7, 0, 0, 7); ctx.fill();
    // 몸
    ctx.fillStyle = c.body; ctx.strokeStyle = c.dark; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + (PR - ry), rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath(); ctx.ellipse(p.x - rx * 0.38, p.y - ry * 0.45 + (PR - ry), rx * 0.24, ry * 0.14, -0.5, 0, 7); ctx.fill();
    // 얼굴 (공을 바라본다)
    const ang = Math.atan2(b.y - p.y, b.x - p.x), ex = Math.cos(ang) * 4, ey = Math.sin(ang) * 4;
    const fy = p.y - 4 + (PR - ry);
    for (const sx of [-13, 13]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x + sx, fy, 8, 0, 7); ctx.fill();
      ctx.fillStyle = "#3a2a22"; ctx.beginPath(); ctx.arc(p.x + sx + ex, fy + ey, 4.2, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,90,110,.35)";
    ctx.beginPath(); ctx.arc(p.x - 24, fy + 11, 6, 0, 7); ctx.arc(p.x + 24, fy + 11, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = "#3a2a22"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath();
    if (p.sm > 0) { ctx.fillStyle = "#3a2a22"; ctx.arc(p.x, fy + 15, 5, 0, 7); ctx.fill(); }
    else { ctx.arc(p.x, fy + 10, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    // 이름표
    const name = slotName(i);
    ctx.font = "700 17px Jua, 'Malgun Gothic', sans-serif"; ctx.textAlign = "center";
    const ny = Math.min(p.y - PR - 14, GROUND - PR * 2 - 14);
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.strokeText(name, p.x, ny);
    ctx.fillStyle = isMe ? "#d6336c" : "#4a3b33"; ctx.fillText(name, p.x, ny);
    if (isMe) { ctx.fillStyle = "#d6336c"; ctx.beginPath(); ctx.moveTo(p.x - 7, ny - 24); ctx.lineTo(p.x + 7, ny - 24); ctx.lineTo(p.x, ny - 15); ctx.fill(); }
  }

  function draw() {
    fit();
    const sc = canvas.width / W;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    const s = view;
    const t = performance.now() / 1000;
    // 하늘
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, "#6ec6ff"); g.addColorStop(1, "#e4f6ff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(820, 86, 44, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.9)";
    for (const c of clouds) {
      const x = ((c.x + t * 9 * c.s) % (W + 200)) - 100;
      ctx.beginPath(); ctx.ellipse(x, c.y, 46 * c.s, 17 * c.s, 0, 0, 7); ctx.ellipse(x + 30 * c.s, c.y - 12 * c.s, 30 * c.s, 17 * c.s, 0, 0, 7); ctx.ellipse(x - 30 * c.s, c.y - 6 * c.s, 24 * c.s, 13 * c.s, 0, 0, 7); ctx.fill();
    }
    // 언덕
    ctx.fillStyle = "#a8e0a0"; ctx.beginPath(); ctx.ellipse(200, GROUND + 30, 330, 120, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8fd18a"; ctx.beginPath(); ctx.ellipse(760, GROUND + 40, 380, 140, 0, 0, 7); ctx.fill();
    // 모래 바닥
    ctx.fillStyle = "#f6dca6"; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#e9c887"; ctx.fillRect(0, GROUND, W, 6);

    if (!s) {
      ctx.fillStyle = "#4a3b33"; ctx.font = "700 30px Jua, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("연결하는 중…", W / 2, H / 2);
      return;
    }
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 네트
    ctx.fillStyle = "#8a5a3c"; ctx.fillRect(NET_X - NET_HW, NET_TOP, NET_HW * 2, GROUND - NET_TOP);
    ctx.fillStyle = "#fff"; ctx.fillRect(NET_X - NET_HW - 2, NET_TOP - 6, NET_HW * 2 + 4, 10);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let y = NET_TOP + 14; y < GROUND - 8; y += 16) ctx.fillRect(NET_X - NET_HW, y, NET_HW * 2, 3);

    const me = kind === "local" ? -1 : mySlot();
    for (let i = 0; i < s.p.length; i++) drawMochi(s.p[i], i, s, i === me);

    // 공
    const b = s.b, sp = Math.hypot(b.vx, b.vy);
    if (sp > 800) trail.forEach((q, i) => { ctx.fillStyle = `rgba(255,120,80,${i * 0.045})`; ctx.beginPath(); ctx.arc(q.x, q.y, BR * (0.5 + i * 0.07), 0, 7); ctx.fill(); });
    ctx.fillStyle = "rgba(80,50,20,.16)"; ctx.beginPath(); ctx.ellipse(b.x, GROUND + 4, BR * (1 - (GROUND - b.y) / 900), 5, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(s.tick * 0.02 + b.x * 0.02);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3d6fd6"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, BR, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ffb703"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, BR - 8, -0.6, 0.9); ctx.stroke();
    ctx.strokeStyle = "#3d6fd6"; ctx.beginPath(); ctx.arc(0, 0, BR - 8, 2.4, 3.9); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // 점수판
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.88)"; roundRect(W / 2 - 110, 14, 220, 62, 18); ctx.fill();
    ctx.font = "700 46px Jua, sans-serif";
    ctx.fillStyle = COLORS[0].dark; ctx.fillText(s.sc[0], W / 2 - 56, 62);
    ctx.fillStyle = COLORS[1].dark; ctx.fillText(s.sc[1], W / 2 + 56, 62);
    ctx.fillStyle = "#4a3b33"; ctx.fillText(":", W / 2, 58);
    ctx.font = "700 15px Jua, sans-serif"; ctx.fillStyle = "#4a3b33";
    ctx.fillText(WIN_SCORE + "점 먼저 내면 승리", W / 2, 96);

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
    if (kind === "online" && me >= s.mode) {
      ctx.font = "700 18px Jua, sans-serif"; ctx.fillStyle = "#4a3b33"; ctx.fillText("관전 중 — 다음 판에 참가해요", W / 2, H - 22);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // 게임 진행(pump)과 그리기를 분리한다. 화면이 가려져 그리기가 멈춰도
  // 별도 타이머(워커)가 진행을 이어 가므로 다른 사람의 게임이 멈추지 않는다.
  function pump() {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= DT) { tick(); acc -= DT; }
  }
  function frame() {
    if (!running) return;
    pump();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  let ticker = null;
  try {
    ticker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),16)"], { type: "text/javascript" })));
    ticker.onmessage = () => { if (running) pump(); };
  } catch {}

  return {
    // 서버에서 온 게임 메시지
    onNet(msg) {
      if (msg[0] === "s") { if (!iAmHost()) { try { snap = decode(msg); } catch {} } }
      else if (msg[0] === "i") { const slot = +msg[1]; if (slot >= 0 && slot < 4) remote[slot] = parseInt(msg.slice(2), 10) & 15; }
    },
    // 방 정보가 바뀜 (누가 나가거나, 내가 방장이 됨)
    setRoom(r) {
      const wasHost = iAmHost();
      room = r;
      if (!wasHost && iAmHost() && snap) { sim = snap; view = sim; }
      lastSentMask = -1;
    },
    stop() {
      running = false;
      if (ticker) ticker.terminate();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      if (touchEl) touchEl.innerHTML = "";
    },
  };
}
