// 게임들이 함께 쓰는 작은 도구 모음: 소리, 진행 루프, 화면 맞춤, 키보드, 터치 버튼

let actx = null, nbuf = null;
// 효과음과 배경음악이 함께 쓰는 소리 장치
export function audio() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
}
export function noiseBuffer() {
  const ac = audio();
  if (!nbuf) { nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return nbuf;
}
export function beep(freq, dur = 0.1, type = "sine", vol = 0.12, slide = 0, delay = 0) {
  try {
    const ac = audio(), o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch {}
}
// 잡음 소리: 폭발·타격·바람 같은 소리를 거르개로 다듬어 만든다
export function noise(dur = 0.1, vol = 0.2, filter = "lowpass", freq = 1000, q = 1, freq2 = 0, delay = 0) {
  try {
    const ac = audio(), src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + delay;
    src.buffer = noiseBuffer(); src.loop = true;
    f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  } catch {}
}
// 휴대폰(특히 iOS)은 손가락으로 건드린 순간에 소리를 한 번 켜 둬야 이후 소리가 난다
export function unlockAudio() {
  try {
    const ac = audio(), src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050); src.connect(ac.destination); src.start(0);
  } catch {}
}
// 게임이 앱에 알리는 일: "over"(판 끝, {win}) · "hurry"(시간 촉박, true/false)
export const events = new EventTarget();
export const emit = (name, detail) => { try { events.dispatchEvent(new CustomEvent(name, { detail })); } catch {} };

// 음소거를 따르는 소리 함수. 자주 쓰는 소리는 이름으로 부른다: snd.boom(), snd.thud() …
export const sound = (isMuted) => {
  const on = () => !(isMuted && isMuted());
  const f = (...a) => { if (on()) beep(...a); };
  const add = (name, fn) => { f[name] = (...a) => { if (on()) fn(...a); }; };
  add("noise", noise);
  add("boom", (big = 1) => { noise(0.55 * big, 0.32, "lowpass", 1100, 0.7, 90); beep(110, 0.35 * big, "sine", 0.28, -70); });
  add("thud", (v = 1) => { noise(0.1, 0.22 * v, "lowpass", 500, 1, 120); beep(140, 0.12, "sine", 0.18 * v, -80); });
  add("whoosh", (v = 1) => noise(0.2, 0.09 * v, "bandpass", 500, 1.2, 2600));
  add("clack", (v = 1) => { noise(0.035, 0.22 * v, "bandpass", 3200, 6); beep(2100, 0.03, "triangle", 0.07 * v); });
  add("wood", (v = 1, d = 0) => { noise(0.06, 0.2 * v, "bandpass", 1300 + Math.random() * 500, 4, 0, d); beep(620 + Math.random() * 200, 0.05, "sine", 0.08 * v, 0, d); });
  add("pop", () => beep(520, 0.07, "sine", 0.1, 500));
  add("coin", () => { beep(988, 0.07, "square", 0.06); beep(1319, 0.18, "square", 0.06, 0, 0.07); });
  add("sparkle", () => [1047, 1319, 1568, 2093].forEach((fr, i) => beep(fr, 0.12, "triangle", 0.07, 0, i * 0.05)));
  add("whistle", () => { beep(2100, 0.12, "sine", 0.1); beep(2300, 0.32, "sine", 0.1, -200, 0.13); });
  add("cheer", () => { noise(1.4, 0.07, "bandpass", 900, 0.6); noise(1.1, 0.05, "bandpass", 1800, 0.8, 0, 0.15); });
  return f;
};
export const jingle = (snd, notes, gap = 120) => notes.forEach((f, i) => setTimeout(() => snd(f, 0.18, "triangle", 0.12), i * gap));

// 진행(tick)과 그리기(draw)를 분리한 루프. 화면이 가려져 그리기가 멈춰도
// 워커 타이머가 진행을 이어 가서 다른 사람의 게임이 멈추지 않는다.
export function makeLoop(tick, draw, dt = 1 / 60) {
  let running = true, last = performance.now(), acc = 0;
  const pump = () => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= dt) { tick(dt); acc -= dt; }
  };
  const frame = () => { if (!running) return; pump(); draw(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  let w = null;
  try {
    w = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),16)"], { type: "text/javascript" })));
    w.onmessage = () => { if (running) pump(); };
  } catch {}
  return () => { running = false; if (w) w.terminate(); };
}

// 캔버스 해상도를 화면 크기에 맞추고, 논리 좌표(W×H)로 그릴 수 있게 한다
export function fit(canvas, W, H) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.max(0.35, Math.min(2.2, ((r.width || W) / W) * dpr));
  const w = Math.round(W * s), h = Math.round(H * s);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
  return ctx;
}

// 키보드: down = 지금 눌린 키, press = 방금 눌린 키 줄(읽은 쪽이 비운다), order = 누른 순서
export function keyboard(codes) {
  const down = new Set(), press = [], order = [];
  const kd = (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!codes.has(e.code)) return;
    e.preventDefault();
    if (!down.has(e.code)) { down.add(e.code); press.push(e.code); order.push(e.code); }
  };
  const ku = (e) => { if (!codes.has(e.code)) return; down.delete(e.code); const i = order.indexOf(e.code); if (i >= 0) order.splice(i, 1); };
  const bl = () => { down.clear(); order.length = 0; };
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", bl);
  return { down, press, order, stop() { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", bl); } };
}

// 터치 버튼. groups: [왼쪽 묶음, 오른쪽 묶음], 묶음 = [{ id, label, cls }] 또는 { dpad: true }
// dpad 의 id 는 L, R, U, D
export function touchPad(el, groups) {
  const down = new Set(), press = [], order = [];
  if (!el) return { down, press, order, stop() {} };
  el.innerHTML = "";
  const mk = (id, label, cls) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tbtn " + (cls || ""); b.textContent = label;
    const on = (e) => { e.preventDefault(); if (!down.has(id)) { down.add(id); press.push(id); order.push(id); } b.classList.add("on"); };
    const off = (e) => { e.preventDefault(); down.delete(id); const i = order.indexOf(id); if (i >= 0) order.splice(i, 1); b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off);
    b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  };
  for (const g of groups) {
    const box = document.createElement("div");
    if (g.dpad) {
      box.className = "dpad";
      const u = mk("U", "▲", "d-u"), l = mk("L", "◀", "d-l"), r = mk("R", "▶", "d-r"), d = mk("D", "▼", "d-d");
      box.append(u, l, r, d);
    } else {
      box.className = "tgroup";
      for (const b of g) box.append(mk(b.id, b.label, b.cls));
    }
    el.append(box);
  }
  return { down, press, order, stop() { el.innerHTML = ""; } };
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// 외곽선 있는 글자
export function label(ctx, str, x, y, size, fill = "#2a2440", stroke = "#fff", align = "center") {
  ctx.font = `700 ${size}px Jua, 'Malgun Gothic', sans-serif`; ctx.textAlign = align; ctx.lineJoin = "round";
  if (stroke) { ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); }
  ctx.fillStyle = fill; ctx.fillText(str, x, y);
}

export const BOT_NAMES = ["꿀떡봇", "쑥떡봇", "콩떡봇", "찰떡봇"];
export const SEAT_TINT = ["#ff9db5", "#9bd88a", "#ffd66b", "#8ecbff"];
export const SEAT_DARK = ["#e56b8c", "#5fae55", "#e3a820", "#4d9be0"];
