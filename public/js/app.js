// 한판 오락실 — 로비, 방 대기실, 게임 실행
import { SITE, GAMES } from "./config.js";
import { unlockAudio, sound, events, BOT_NAMES } from "./games/kit.js?v=3";
import { music } from "./music.js?v=2";
import { BODY, FACES, HATS, PATTERNS, ACCS, drawMochi, parseLook, lookStr, randomLook } from "./avatar.js?v=3";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let muted = store.get("hp_muted") === "1";
let musicOn = store.get("hp_music") !== "0";
const ui = sound(() => muted);      // 화면 단추 소리
// 게임마다 어울리는 배경음악
const THEME = { baseball: "sport", volley: "sport", soccer: "sport", dodge: "sport", bomb: "tense", land: "tense", blocks: "puzzle", chain: "puzzle", cannon: "chill", sling: "chill", pool: "chill", alkkagi: "chill", bowling: "chill", rally: "sport", yut: "yut" };
let look = store.get("hp_look") ? parseLook(store.get("hp_look")) : randomLook();
let current = GAMES[0];   // 고른 게임
let ws = null, room = null, game = null, pingTimer = null, leaving = false;
let offline = null;       // 혼자/로컬 다시 하기용 설정
let soloMode = 0;         // 혼자·한 키보드에서 고른 경기 방식(야구의 3·6·9회 등)
let gameId = null, sawLobby = false, overPending = false;

// 게임 모듈은 고를 때 불러온다
const VER = "?v=47";
const mods = {};
const loadMod = (id) => (mods[id] = mods[id] || import("./games/" + id + ".js" + VER));

// ── 공통 ──
function show(name) {
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "v-" + name;
  document.documentElement.classList.toggle("playing", name === "play");
  if (name === "home") renderRecent();
  if (name === "home" || name === "game") leaveFullscreen();
  window.scrollTo(0, 0);
  updateRotTip();
  if (name !== "play") { $("emoBar").hidden = true; music.hurry(false); }
  music.play(name === "play" ? THEME[current.id] || "lobby" : "lobby");
}

// ── 기록: 게임마다 이긴 판·연승 (이 기기에만 저장) ──
let lastRec = "";
const loadRec = () => { try { return JSON.parse(store.get("hp_rec") || "{}"); } catch { return {}; } };
function record(id, win) {
  const all = loadRec(), r = all[id] || { w: 0, p: 0, s: 0, b: 0 };
  r.p++;
  if (win) { r.w++; r.s++; r.b = Math.max(r.b, r.s); } else r.s = 0;
  all[id] = r; store.set("hp_rec", JSON.stringify(all));
  renderCards();
  return (win && r.s >= 2 ? `${r.s}연승 중! · ` : "") + `이긴 판 ${r.w} / ${r.p}` + (r.b >= 2 ? ` · 최고 ${r.b}연승` : "");
}

// ── 승리 축포 ──
function confetti() {
  const cv = $("fxCv"), box = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
  const c = cv.getContext("2d"), W = cv.width, H = cv.height, cols = ["#ff5d73", "#ffc93c", "#8ed081", "#7cc6fe", "#b79cff", "#ff9db5"];
  const bits = Array.from({ length: 150 }, (_, i) => ({ x: W * (i % 2 ? 0.25 : 0.75) + (Math.random() - 0.5) * W * 0.3, y: H * 0.6, vx: (Math.random() - 0.5) * 14 * dpr, vy: -(9 + Math.random() * 11) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: (4 + Math.random() * 5) * dpr, col: cols[i % cols.length] }));
  const t0 = performance.now();
  const frame = (now) => {
    const age = now - t0;
    c.clearRect(0, 0, W, H);
    if (age > 3600) return;
    for (const b of bits) {
      b.vy += 0.32 * dpr; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.globalAlpha = age > 2800 ? Math.max(0, 1 - (age - 2800) / 800) : 1;
      c.fillStyle = b.col; c.fillRect(-b.s, -b.s / 2, b.s * 2, b.s); c.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ── 말풍선 ──
const PHRASES = ["안녕!", "좋아!", "나이스!", "아깝다!", "ㅋㅋㅋ", "한 판 더!"];
const BOT_LINES = ["흥!", "다음엔 안 봐줘", "ㅎㅎ", "좋았어!", "나이스!", "어림없지!", "봐주는 거야~"];
let lastEmote = 0;
function showBubble(name, lk, text) {
  const box = $("bubbles"), el = document.createElement("div");
  el.className = "bubble";
  const av = document.createElement("canvas"); av.width = 68; av.height = 68;
  drawMochi(av.getContext("2d"), 34, 38, 24, lk);
  const who = document.createElement("span"); who.className = "who"; who.textContent = name;
  const b = document.createElement("b"); b.textContent = text;
  el.append(av, who, b);
  box.append(el);
  while (box.children.length > 4) box.firstChild.remove();
  ui.pop();
  setTimeout(() => el.remove(), 2700);
}
function sendEmote(k) {
  const now = performance.now();
  if (now - lastEmote < 900 || $("v-play").hidden) return;
  lastEmote = now;
  showBubble(myName() || "나", look, PHRASES[k]);
  if (room) send("b" + JSON.stringify({ t: "e", k }));
  else if (offline && offline.kind === "solo" && Math.random() < 0.55) {      // 혼자 할 때는 봇이 가끔 대꾸한다
    setTimeout(() => { if (!$("v-play").hidden) showBubble(BOT_NAMES[1], parseLook("", 1), BOT_LINES[(Math.random() * BOT_LINES.length) | 0]); }, 700 + Math.random() * 900);
  }
}
function buildEmoBar() {
  const bar = $("emoBar"); bar.innerHTML = "";
  PHRASES.forEach((p, k) => {
    const b = document.createElement("button"); b.type = "button";
    const kb = document.createElement("kbd"); kb.textContent = String(k + 1);
    b.append(kb, p);
    b.addEventListener("click", () => { sendEmote(k); bar.hidden = true; });      // 보내면 닫아서 판을 가리지 않게
    bar.append(b);
  });
}

// ── 휴대폰: 전체 화면, 회전 안내 ──
const coarse = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
let prefPortrait = false, rotDismissed = false;
function afterStart(mod) {
  $("v-play").classList.toggle("nopad", !$("touch").children.length);
  prefPortrait = !!mod.meta.portrait;
  $("rotLock").hidden = false;
  // 이미 전체 화면이면 게임에 맞는 방향으로 다시 잠근다
  if (document.fullscreenElement && screen.orientation && screen.orientation.lock) screen.orientation.lock(prefPortrait ? "portrait" : "landscape").catch(() => {});
  updateRotTip();
}
function updateRotTip() {
  const tip = $("rotTip");
  if (!tip) return;
  const portraitNow = window.innerHeight > window.innerWidth;
  const show = coarse() && !rotDismissed && !$("v-play").hidden && portraitNow !== prefPortrait;
  tip.hidden = true;      // 작은 안내 대신 화면을 덮는 안내를 쓴다
  const gate = $("rotGate");
  gate.hidden = !show; gate.classList.toggle("to-portrait", prefPortrait);
  if (show) {
    $("rotGateTitle").textContent = prefPortrait ? "휴대폰을 세로로 세워 주세요" : "휴대폰을 가로로 돌려 주세요";
    $("rotGateText").textContent = prefPortrait ? "이 게임은 세로 화면에서 판이 훨씬 크게 보여요." : "이 게임은 가로 화면에서 훨씬 크게 보이고 조작도 편해요.";
    $("rotLock").textContent = prefPortrait ? "세로로 고정하기" : "가로로 고정하기";
  }
}
// 버튼으로 방향 고정: 전체 화면으로 바꾼 뒤 잠근다(안드로이드). 아이폰은 잠글 수 없어 직접 돌려야 한다.
async function lockOrientation() {
  let ok = false;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock(prefPortrait ? "portrait" : "landscape"); ok = true; }
  } catch {}
  if (!ok) { $("rotGateText").textContent = "이 휴대폰은 자동으로 돌릴 수 없어요. 화면 회전 잠금을 풀고 직접 " + (prefPortrait ? "세워" : "돌려") + " 주세요."; $("rotLock").hidden = true; }
  updateRotTip();
}
function leaveFullscreen() {
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch {}
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
async function toggleFullscreen() {
  if (document.fullscreenElement) return leaveFullscreen();
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock(prefPortrait ? "portrait" : "landscape").catch(() => {});
  } catch { toast("이 브라우저에서는 전체 화면을 쓸 수 없어요"); }
}
let toastTimer = 0;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
function myName() {
  const v = $("nick").value.trim().slice(0, 10);
  store.set("hp_name", v);
  return v;
}

// ── 게임 카드 그림 ──
const THUMBS = {
  volley: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#9ad8ff"/><circle cx="270" cy="38" r="20" fill="#fff3b0"/><rect y="138" width="320" height="42" fill="#f6dca6"/><rect x="156" y="78" width="8" height="62" fill="#8a5a3c"/><rect x="153" y="74" width="14" height="7" fill="#fff"/><ellipse cx="82" cy="118" rx="30" ry="26" fill="#ff9db5" stroke="#2b2d6e" stroke-width="4"/><circle cx="74" cy="112" r="5" fill="#2b2d6e"/><circle cx="94" cy="112" r="5" fill="#2b2d6e"/><ellipse cx="238" cy="98" rx="28" ry="30" fill="#9bd88a" stroke="#2b2d6e" stroke-width="4"/><circle cx="228" cy="92" r="5" fill="#2b2d6e"/><circle cx="246" cy="92" r="5" fill="#2b2d6e"/><circle cx="186" cy="46" r="17" fill="#fff" stroke="#2b2d6e" stroke-width="4"/><path d="M176 46a10 10 0 0 1 14-9" stroke="#ffb703" stroke-width="5" fill="none"/></svg>`,
  blocks: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#bfe3ff"/><g stroke="#2b2d6e" stroke-width="4"><rect x="60" y="120" width="34" height="34" fill="#ff5d73"/><rect x="94" y="120" width="34" height="34" fill="#ffc93c"/><rect x="128" y="120" width="34" height="34" fill="#8ed081"/><rect x="94" y="86" width="34" height="34" fill="#ffc93c"/><rect x="196" y="120" width="34" height="34" fill="#b79cff"/><rect x="230" y="120" width="34" height="34" fill="#b79cff"/><rect x="230" y="86" width="34" height="34" fill="#ff5d73"/><rect x="162" y="26" width="34" height="34" fill="#7cc6fe"/><rect x="196" y="26" width="34" height="34" fill="#7cc6fe"/></g></svg>`,
  chain: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#e3d8ff"/><g stroke="#2b2d6e" stroke-width="4"><circle cx="100" cy="130" r="24" fill="#ff5d73"/><circle cx="150" cy="130" r="24" fill="#ff5d73"/><circle cx="150" cy="82" r="24" fill="#ff5d73"/><circle cx="200" cy="130" r="24" fill="#ffc93c"/><circle cx="250" cy="130" r="24" fill="#8ed081"/><circle cx="200" cy="82" r="24" fill="#7cc6fe"/><circle cx="110" cy="42" r="24" fill="#ffc93c"/></g></svg>`,
  bomb: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#ffe9a8"/><g stroke="#2b2d6e" stroke-width="4"><rect x="40" y="30" width="46" height="46" fill="#c9a26b"/><rect x="234" y="30" width="46" height="46" fill="#c9a26b"/><rect x="40" y="106" width="46" height="46" fill="#c9a26b"/><rect x="234" y="106" width="46" height="46" fill="#c9a26b"/><circle cx="160" cy="100" r="34" fill="#2b2d6e"/><path d="M178 70q14-22 30-14" fill="none"/></g><circle cx="212" cy="54" r="9" fill="#ff5d73"/></svg>`,
  soccer: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#58b56a"/><rect x="40" width="40" height="180" fill="#4fab62"/><rect x="120" width="40" height="180" fill="#4fab62"/><rect x="200" width="40" height="180" fill="#4fab62"/><g fill="none" stroke="#fff" stroke-width="4"><rect x="14" y="14" width="292" height="152"/><line x1="160" y1="14" x2="160" y2="166"/><circle cx="160" cy="90" r="30"/></g><rect x="2" y="62" width="14" height="56" fill="#fff" stroke="#ff5d73" stroke-width="4"/><rect x="304" y="62" width="14" height="56" fill="#fff" stroke="#4d9be0" stroke-width="4"/><circle cx="104" cy="96" r="20" fill="#ff9db5" stroke="#2b2d6e" stroke-width="4"/><circle cx="226" cy="76" r="20" fill="#8ecbff" stroke="#2b2d6e" stroke-width="4"/><circle cx="150" cy="84" r="11" fill="#fff" stroke="#2b2d6e" stroke-width="4"/></svg>`,
  cannon: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#9ad8ff"/><path d="M0 130 Q60 90 120 120 T240 105 T320 125 V180 H0Z" fill="#b98a55" stroke="#6fbf5a" stroke-width="8"/><g stroke="#2b2d6e" stroke-width="4"><line x1="62" y1="100" x2="92" y2="76" stroke-width="9" stroke-linecap="round"/><circle cx="60" cy="100" r="17" fill="#ffd66b"/><line x1="262" y1="96" x2="234" y2="72" stroke-width="9" stroke-linecap="round"/><circle cx="264" cy="98" r="17" fill="#c3a6ff"/></g><path d="M96 70 Q160 0 220 60" fill="none" stroke="#2b2d6e" stroke-width="4" stroke-dasharray="3 10" stroke-linecap="round"/><circle cx="170" cy="30" r="8" fill="#2b2d6e"/></svg>`,
  sling: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#bfe6ff"/><rect y="146" width="320" height="34" fill="#8ccf6a"/><g stroke="#2b2d6e" stroke-width="4"><path d="M52 146V112M52 112L38 84M52 112L66 84" fill="none" stroke="#8a5a3c" stroke-width="9" stroke-linecap="round"/><circle cx="118" cy="62" r="16" fill="#ff9db5"/><rect x="200" y="112" width="34" height="34" fill="#e0ab68"/><rect x="234" y="112" width="34" height="34" fill="#a3a8c8"/><rect x="268" y="112" width="34" height="34" fill="#e0ab68"/><rect x="234" y="78" width="34" height="34" fill="#aee1ff"/><circle cx="217" cy="96" r="14" fill="#9b78e6"/><circle cx="251" cy="62" r="14" fill="#9b78e6"/></g><path d="M66 84Q90 60 104 62" fill="none" stroke="#2b2d6e" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/></svg>`,
  alkkagi: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#fff1cc"/><rect x="70" y="14" width="180" height="152" rx="10" fill="#e8b96a" stroke="#a8743a" stroke-width="8"/><g stroke="#2b2d6e" stroke-width="4"><circle cx="110" cy="130" r="15" fill="#ff9db5"/><circle cx="160" cy="118" r="15" fill="#ff9db5"/><circle cx="212" cy="134" r="15" fill="#ff9db5"/><circle cx="118" cy="52" r="15" fill="#8ecbff"/><circle cx="196" cy="48" r="15" fill="#8ecbff"/><circle cx="262" cy="70" r="15" fill="#8ecbff" opacity=".55"/></g><path d="M160 104L176 70" stroke="#d6336c" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/></svg>`,
  dodge: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#c9965a"/><rect x="16" y="16" width="144" height="148" fill="#f4c7c0"/><rect x="160" y="16" width="144" height="148" fill="#c8dcf2"/><g fill="none" stroke="#fff" stroke-width="4"><rect x="16" y="16" width="288" height="148"/><line x1="160" y1="16" x2="160" y2="164" stroke-width="6"/></g><g stroke="#2b2d6e" stroke-width="4"><circle cx="86" cy="96" r="21" fill="#ff9db5"/><circle cx="240" cy="76" r="21" fill="#8ecbff"/></g><path d="M118 88h34M122 100h26" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="176" cy="86" r="12" fill="#e8453c" stroke="#9b2f3a" stroke-width="3"/></svg>`,
  pool: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#f6e6c6"/><rect x="14" y="20" width="292" height="140" rx="20" fill="#8a5a3c"/><rect x="30" y="36" width="260" height="108" rx="6" fill="#2f8f5b"/><g fill="#15122a"><circle cx="32" cy="38" r="9"/><circle cx="160" cy="34" r="8"/><circle cx="288" cy="38" r="9"/><circle cx="32" cy="142" r="9"/><circle cx="160" cy="146" r="8"/><circle cx="288" cy="142" r="9"/></g><g stroke="#2a2440" stroke-width="2"><circle cx="210" cy="90" r="9" fill="#ffc93c"/><circle cx="226" cy="81" r="9" fill="#3d6fd6"/><circle cx="226" cy="99" r="9" fill="#e8453c"/><circle cx="242" cy="72" r="9" fill="#2f9e5a"/><circle cx="242" cy="90" r="9" fill="#fffdf6"/><circle cx="242" cy="108" r="9" fill="#8a55d6"/><circle cx="96" cy="90" r="10" fill="#fffdf6"/></g><path d="M84 90H20" stroke="#e9c887" stroke-width="6" stroke-linecap="round"/></svg>`,
  yut: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#f7ecd4"/><rect x="24" y="16" width="148" height="148" rx="12" fill="#fffaf0" stroke="#8a5a3c" stroke-width="5"/><g fill="none" stroke="#c79a63" stroke-width="3"><rect x="40" y="32" width="116" height="116"/><path d="M156 32L40 148M40 32l116 116"/></g><g fill="#fff" stroke="#8a5a3c" stroke-width="2.5"><circle cx="156" cy="148" r="9" fill="#ffe3a3"/><circle cx="156" cy="32" r="9" fill="#ffe3a3"/><circle cx="40" cy="32" r="9" fill="#ffe3a3"/><circle cx="40" cy="148" r="9" fill="#ffe3a3"/><circle cx="98" cy="90" r="9" fill="#ffe3a3"/></g><circle cx="156" cy="101" r="11" fill="#ff9db5" stroke="#2b2d6e" stroke-width="3"/><circle cx="64" cy="56" r="11" fill="#8ecbff" stroke="#2b2d6e" stroke-width="3"/><g stroke="#8a5a3c" stroke-width="3"><rect x="196" y="40" width="20" height="96" rx="10" fill="#f6dca6" transform="rotate(-12 206 88)"/><rect x="226" y="36" width="20" height="96" rx="10" fill="#c98a4a" transform="rotate(6 236 84)"/><rect x="256" y="44" width="20" height="96" rx="10" fill="#f6dca6" transform="rotate(-4 266 92)"/><rect x="284" y="40" width="20" height="96" rx="10" fill="#f6dca6" transform="rotate(14 294 88)"/></g></svg>`,
  baseball: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#7cc9ff"/><rect y="40" width="320" height="34" fill="#3d4a8a"/><g fill="#ffc93c"><circle cx="20" cy="50" r="4"/><circle cx="60" cy="58" r="4"/><circle cx="100" cy="50" r="4"/><circle cx="220" cy="56" r="4"/><circle cx="270" cy="50" r="4"/></g><rect y="74" width="320" height="106" fill="#5dbb63"/><path d="M160 80L280 140L160 200L40 140Z" fill="#d9a46a"/><path d="M160 104L230 140L160 176L90 140Z" fill="#5dbb63"/><circle cx="160" cy="98" r="11" fill="#ffd66b" stroke="#2b2d6e" stroke-width="3"/><g stroke="#2b2d6e" stroke-width="3"><rect x="138" y="118" width="44" height="40" rx="2" fill="none" stroke="#fff" stroke-dasharray="5 4"/><circle cx="96" cy="150" r="18" fill="#ff9db5"/></g><rect x="104" y="112" width="58" height="9" rx="4.5" fill="#c98a4a" stroke="#8a5a3c" stroke-width="2.5" transform="rotate(-30 110 140)"/><circle cx="166" cy="128" r="7" fill="#fff" stroke="#e8453c" stroke-width="2"/></svg>`,
  rally: `<svg viewBox="0 0 320 180"><defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8fd0"/><stop offset=".6" stop-color="#ffb98a"/><stop offset="1" stop-color="#ffe2ad"/></linearGradient></defs><rect width="320" height="180" fill="url(#rs)"/><circle cx="60" cy="52" r="20" fill="#fff3cc"/><g fill="#d99a86"><rect x="0" y="52" width="34" height="50"/><rect x="96" y="40" width="30" height="62"/><rect x="150" y="58" width="40" height="44"/><rect x="214" y="34" width="34" height="68"/><rect x="270" y="56" width="50" height="46"/></g><g fill="#ffe9a8"><rect x="102" y="48" width="6" height="7"/><rect x="114" y="62" width="6" height="7"/><rect x="222" y="44" width="6" height="7"/><rect x="234" y="60" width="6" height="7"/><rect x="160" y="68" width="6" height="7"/></g><path d="M0 180L70 96h180l70 84Z" fill="#2f807b"/><path d="M40 180L96 104h128l56 76Z" fill="#4fa798"/><path d="M80 126h160l12 16H68Z" fill="#db7a4c"/><path d="M40 180L96 104h128l56 76" fill="none" stroke="#fff8ea" stroke-width="3"/><rect x="74" y="118" width="172" height="12" fill="rgba(43,45,110,.55)"/><rect x="74" y="116" width="172" height="4" fill="#fff8ea"/><ellipse cx="160" cy="106" rx="9" ry="8" fill="#9bd88a" stroke="#2b2d6e" stroke-width="2.5"/><ellipse cx="150" cy="158" rx="22" ry="20" fill="#ff9db5" stroke="#2b2d6e" stroke-width="4"/><path d="M130 152a22 12 0 0 1 40 0Z" fill="#2b2d6e"/><ellipse cx="186" cy="138" rx="9" ry="11" fill="none" stroke="#ff5d73" stroke-width="4"/><path d="M180 148l-8 8" stroke="#2b2d6e" stroke-width="4" stroke-linecap="round"/><circle cx="206" cy="92" r="6" fill="#e9ff45" stroke="#2b2d6e" stroke-width="2"/></svg>`,
  bowling: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#fff1cc"/><path d="M0 180L110 40h100L320 180Z" fill="#f0c684"/><path d="M0 180L110 40M320 180L210 40" stroke="#5a3a2a" stroke-width="7"/><g fill="#fffdf6" stroke="#2b2d6e" stroke-width="3.5"><ellipse cx="136" cy="58" rx="9" ry="15"/><ellipse cx="160" cy="58" rx="9" ry="15"/><ellipse cx="184" cy="58" rx="9" ry="15"/><ellipse cx="147" cy="74" rx="10" ry="17"/><ellipse cx="173" cy="74" rx="10" ry="17"/><ellipse cx="160" cy="92" rx="11" ry="19"/></g><g fill="none" stroke="#ff5d73" stroke-width="3.5"><path d="M152 84h16M139 67h16M165 67h16"/></g><circle cx="118" cy="142" r="27" fill="#ff9db5" stroke="#2b2d6e" stroke-width="4"/><circle cx="109" cy="137" r="4.5" fill="#2b2d6e"/><circle cx="127" cy="137" r="4.5" fill="#2b2d6e"/><path d="M70 150h-22M76 162h-16" stroke="#2b2d6e" stroke-width="4" stroke-linecap="round"/></svg>`,
  land: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#d9f2d2"/><g stroke="#2b2d6e" stroke-width="4"><path d="M30 30h110v70H80v50H30z" fill="#ff9db5"/><path d="M200 60h90v90h-60v-40h-30z" fill="#8ecbff"/><path d="M140 66h40v54" fill="none" stroke-dasharray="8 7"/><rect x="170" y="112" width="20" height="20" fill="#ff5d73"/></g></svg>`,
};

let gameFilter = "all";
const FILTERS = [["all", "전체"], ["rt", "실시간 대전"], ["turn", "차례대로"], ["won", "이겨 본 게임"]];
function renderFilters() {
  const box = $("gameFilter"); box.innerHTML = "";
  for (const [k, t] of FILTERS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t; b.setAttribute("aria-pressed", String(k === gameFilter));
    b.addEventListener("click", () => { gameFilter = k; renderFilters(); renderCards(); });
    box.append(b);
  }
}
const loadLast = () => { try { return JSON.parse(store.get("hp_last") || "[]"); } catch { return []; } };
function markPlayed(id) { const l = loadLast().filter((x) => x !== id); l.unshift(id); store.set("hp_last", JSON.stringify(l.slice(0, 3))); }
function renderRecent() {
  const row = $("recentRow"), box = $("recentPick"); box.innerHTML = "";
  const list = loadLast().map((id) => GAMES.find((g) => g.id === id && g.ready)).filter(Boolean);
  row.hidden = !list.length;
  for (const g of list) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip chip-line"; b.textContent = g.name;
    b.addEventListener("click", () => openGame(g));
    box.append(b);
  }
}
function renderCards() {
  renderRecent();
  const box = $("cards"); box.innerHTML = "";
  const recs = loadRec();
  const list = GAMES.filter((g) => gameFilter === "all" || (gameFilter === "won" ? recs[g.id] && recs[g.id].w : g.kind === gameFilter));
  if (!list.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "아직 이긴 게임이 없어요. 한 판 이기고 오면 여기에 모여요."; box.append(p); }
  for (const g of list) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "card"; b.disabled = !g.ready;
    b.innerHTML = `<span class="thumb">${THUMBS[g.id] || ""}</span><span class="card-body"><h3></h3><span class="tag"></span><p></p></span>`;
    const h = b.querySelector("h3"); h.textContent = g.name;
    if (!g.ready) { const s = document.createElement("span"); s.className = "soon"; s.textContent = "준비 중"; h.append(s); }
    b.querySelector(".tag").textContent = g.tag;
    if (g.id === "rally") { const s = document.createElement("span"); s.className = "newb"; s.textContent = "새 게임"; h.append(s); }
    const rec = loadRec()[g.id];
    if (rec && rec.w) { const w = document.createElement("span"); w.className = "wins"; w.textContent = `이긴 판 ${rec.w}`; h.append(w); }
    b.querySelector("p").textContent = g.desc;
    if (g.ready) b.addEventListener("click", () => openGame(g));
    box.append(b);
  }
}

async function openGame(g) {
  current = g; markPlayed(g.id);
  $("gName").textContent = g.name; $("gDesc").textContent = g.desc;
  $("gThumb").innerHTML = THUMBS[g.id] || "";
  $("howList").innerHTML = "";
  show("game");
  let mod; try { mod = await loadMod(g.id); } catch { return toast("게임을 불러오지 못했어요. 새로고침해 주세요"); }
  if (current !== g) return;
  $("soloText").textContent = mod.meta.soloText;
  // 경기 길이 같은 선택지 (혼자·한 키보드용)
  const sm = mod.meta.soloModes, seg = $("soloModeSeg");
  $("soloModeRow").hidden = !sm; seg.innerHTML = "";
  if (sm) {
    $("soloModeLabel").textContent = mod.meta.modeLabel || "경기 방식";
    const saved = +store.get("hp_mode_" + g.id);
    soloMode = sm.some(([v]) => v === saved) ? saved : sm[0][0];
    for (const [val, text] of sm) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = text;
      b.setAttribute("aria-pressed", String(val === soloMode));
      b.addEventListener("click", () => { soloMode = val; store.set("hp_mode_" + g.id, String(val)); for (const x of seg.children) x.setAttribute("aria-pressed", String(x === b)); });
      seg.append(b);
    }
  } else soloMode = 0;
  $("localCard").hidden = !mod.meta.local;
  for (const [k, v] of mod.meta.howto) {
    const li = document.createElement("li"), b = document.createElement("b");
    b.textContent = k; li.append(b, " " + v); $("howList").append(li);
  }
}

// ── 오프라인(혼자·한 키보드) ──
async function playOffline(cfg) {
  offline = cfg;
  stopGame();
  let mod; try { mod = await loadMod(current.id); } catch { return toast("게임을 불러오지 못했어요. 새로고침해 주세요"); }
  $("result").hidden = true;
  $("playInfo").textContent = current.name + " · " + (cfg.kind === "solo" ? "혼자 · " + { easy: "쉬움", normal: "보통", hard: "어려움" }[cfg.level] : "한 키보드 2인");
  show("play");
  game = mod.start({
    canvas: $("cv"), touchEl: $("touch"), kind: cfg.kind, level: cfg.level, mode: cfg.mode,
    myName: myName() || "나", look, isMuted: () => muted,
    onOver: (r) => { $("resTitle").textContent = (r && r.title) || "한 판 더 할까요?"; $("resSub").textContent = lastRec; $("result").hidden = false; },
  });
  gameId = current.id;
  lastRec = "";
  afterStart(mod);
}

window.__hp = () => (game && game.peek ? game.peek() : null);   // 점검용
function stopGame() { $("howPanel").hidden = true; if (game) { game.stop(); game = null; gameId = null; } }

// ── 온라인 ──
// 내 컴퓨터에서 개발할 때는 같이 뜬 로컬 서버를 쓴다
const BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "" : (SITE.server || "").replace(/\/$/, "");
let serverOK = null; // 대전 서버가 살아 있는지 (null = 아직 모름)
function needServer() {
  if (serverOK !== false) return true;
  toast("온라인 대전 서버는 준비 중이에요. 혼자 연습과 한 키보드 2인은 지금 돼요");
  return false;
}
async function api(path) {
  const r = await fetch(BASE + path, { cache: "no-store" });
  if (!r.ok) throw new Error("api " + r.status);
  return r.json();
}

function connect(code, { pub = false } = {}) {
  disconnect();
  leaving = false; sawLobby = false; overPending = false;
  const q = new URLSearchParams({ name: myName(), look: lookStr(look), game: current.id, pub: pub ? "1" : "0" });
  const wsBase = BASE ? BASE.replace(/^http/, "ws") : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const sock = new WebSocket(`${wsBase}/ws/${code}?${q}`);
  ws = sock;
  sock.onmessage = (e) => {
    const m = e.data;
    if (typeof m !== "string" || m === "pong") return;
    if (m[0] === "b" && m[2] === "{" && m.includes('"t":"e"')) {
      try {
        const slot = +m[1], d = JSON.parse(m.slice(2)), p = room && room.players.find((x) => x.slot === slot);
        if (d.t === "e" && p) showBubble(p.name, parseLook(p.look, slot), PHRASES[(d.k | 0) % PHRASES.length]);
      } catch {}
      return;
    }
    if (m[0] === "s" || m[0] === "i" || m[0] === "b") { if (game) game.onNet(m); return; }
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.t === "full") { leaving = true; toast("방이 꽉 찼어요 (최대 4명)"); goHome(); }
    else if (d.t === "room") onRoom(d);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    clearInterval(pingTimer); ws = null;
    if (!leaving) { toast("연결이 끊겼어요"); stopGame(); room = null; show("home"); }
  };
  clearInterval(pingTimer);
  pingTimer = setInterval(() => { if (sock.readyState === 1) sock.send("ping"); }, 25000);
}

function disconnect() {
  leaving = true;
  clearInterval(pingTimer);
  if (ws) { try { ws.close(1000); } catch {} ws = null; }
  room = null;
}

function send(x) { if (ws && ws.readyState === 1) ws.send(typeof x === "string" ? x : JSON.stringify(x)); }

async function onRoom(d) {
  const before = room ? room.players.length : 0;
  room = d;
  if (d.phase === "lobby" && before && d.players.length > before) ui.coin();
  const g = GAMES.find((x) => x.id === d.game); if (g) current = g;
  history.replaceState(null, "", "?r=" + d.code);
  let mod; try { mod = await loadMod(d.game); } catch { return toast("게임을 불러오지 못했어요. 새로고침해 주세요"); }
  if (room !== d) return;                 // 불러오는 사이에 더 새로운 방 정보가 왔다
  if (d.phase === "play") {
    if (game && gameId === d.game) {
      game.setRoom(d);
      if (overPending && d.host === d.you) { overPending = false; send({ t: "end" }); }   // 끝난 판의 방장을 넘겨받았다
      return;
    }
    stopGame();
    $("result").hidden = true;
    $("playInfo").textContent = current.name + " · 방 " + d.code;
    show("play");
    overPending = false;
    game = mod.start({
      canvas: $("cv"), touchEl: $("touch"), kind: "online", mode: d.mode, room: d, late: !sawLobby,
      myName: myName() || "나", look, send, isMuted: () => muted,
      onOver: () => { if (room && room.host === room.you) send({ t: "end" }); else overPending = true; },
    });
    gameId = d.game;
    lastRec = "";
    afterStart(mod);
  } else {
    sawLobby = true; overPending = false;
    stopGame();
    renderRoom(mod.meta);
    show("room");
  }
}

function renderRoom(meta) {
  const d = room, host = d.host === d.you;
  $("rGame").textContent = current.name;
  $("rCode").textContent = d.code;
  const seats = $("seats"); seats.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const p = d.players.find((x) => x.slot === i);
    const el = document.createElement("div");
    el.className = "seat" + (p ? "" : " empty");
    if (p) {
      const dot = document.createElement("canvas"); dot.className = "ava"; dot.width = 132; dot.height = 132;
      drawMochi(dot.getContext("2d"), 66, 80, 46, parseLook(p.look, i));
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
      const role = document.createElement("span"); role.className = "role";
      role.textContent = [p.id === d.you ? "나" : "", p.id === d.host ? "방장" : "", meta.role(i, d.mode)].filter(Boolean).join(" · ");
      el.append(dot, nm, role);
    } else el.textContent = "빈자리";
    seats.append(el);
  }
  // 게임 바꾸기 (방장만)
  const pick = $("gamePick"); pick.innerHTML = "";
  for (const g of GAMES.filter((x) => x.ready)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chipbtn"; b.textContent = g.name; b.disabled = !host;
    b.setAttribute("aria-pressed", String(g.id === d.game));
    b.addEventListener("click", () => send({ t: "set", game: g.id }));
    pick.append(b);
  }
  // 경기 방식
  const seg = $("modeSeg"); seg.innerHTML = "";
  $("modeOpt").hidden = !meta.modes;
  if (meta.modes) {
    $("modeLabel").textContent = meta.modeLabel || "경기 방식";
    for (const [val, text] of meta.modes) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = text; b.disabled = !host;
      b.setAttribute("aria-pressed", String(val === d.mode));
      b.addEventListener("click", () => send({ t: "set", mode: val }));
      seg.append(b);
    }
  }
  $("pubChk").checked = d.pub; $("pubChk").disabled = !host;
  $("startBtn").hidden = !host;
  $("roomHint").textContent = host ? meta.hint(d.players.length, d.mode) : "방장이 게임을 고르고 시작하기를 기다리는 중이에요.";
}

function goHome() {
  disconnect(); stopGame();
  history.replaceState(null, "", location.pathname);
  show("home"); loadStats();
}

async function loadStats() {
  try {
    const s = await api("/api/stats");
    serverOK = true;
    $("online").hidden = !(s.online > 0);
    $("online").textContent = `지금 ${s.online}명 접속 중`;
  } catch { serverOK = false; $("online").hidden = true; }
}

// ── 내 방: 캐릭터 꾸미기 ──
function renderCloset() {
  const mk = (boxId, items, key, paint) => {
    const box = $(boxId); box.innerHTML = "";
    items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-pressed", String(look[key] === i && !(key === "c" && look.hex)));
      paint(b, it, i);
      b.addEventListener("click", () => { look[key] = i; if (key === "c") look.hex = null; saveLook(); });
      box.append(b);
    });
  };
  mk("pickColor", BODY, "c", (b, it) => { b.className = "swatch"; b.style.background = it.body; b.style.borderColor = it.dark; b.title = it.name; b.setAttribute("aria-label", it.name); });
  mk("pickFace", FACES, "f", (b, it) => { b.className = "chipbtn"; b.textContent = it; });
  mk("pickHat", HATS, "h", (b, it) => { b.className = "chipbtn"; b.textContent = it; });
  mk("pickPattern", PATTERNS, "m", (b, it) => { b.className = "chipbtn"; b.textContent = it; });
  mk("pickAcc", ACCS, "a", (b, it) => { b.className = "chipbtn"; b.textContent = it; });
  // 직접 고르는 색
  const wrap = document.createElement("label");
  wrap.className = "swatch custom" + (look.hex ? " on" : ""); wrap.title = "색 직접 고르기";
  const inp = document.createElement("input");
  inp.type = "color"; inp.value = "#" + (look.hex || "ff8fab"); inp.setAttribute("aria-label", "색 직접 고르기");
  inp.addEventListener("input", () => { look.hex = inp.value.slice(1).toLowerCase(); store.set("hp_look", lookStr(look)); wrap.classList.add("on"); for (const s of $("pickColor").querySelectorAll("button")) s.setAttribute("aria-pressed", "false"); });
  wrap.append(inp); $("pickColor").append(wrap);
}
function saveLook() { store.set("hp_look", lookStr(look)); renderCloset(); }

const pointer = { x: 0.7, y: 0.3 };
const TAP_LINES = ["안녕!", "놀자!", "간지러워!", "한 판 할래?", "히히", "오늘은 뭐 하지?", "꾸며 줘서 고마워!"];
let roomTap = null;
function paintRoom(t) {
  const cv = $("avatarCv");
  const c = cv.getContext("2d"), W = cv.width, H = cv.height, s = t / 1000;
  // 벽과 바닥
  c.fillStyle = "#ffe3ea"; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,.55)";
  for (let x = 30; x < W; x += 90) c.fillRect(x, 0, 34, 380);
  c.fillStyle = "#e8b98a"; c.fillRect(0, 380, W, H - 380);
  c.fillStyle = "#d9a673"; c.fillRect(0, 380, W, 10);
  // 창문
  c.fillStyle = "#9ad8ff"; c.strokeStyle = "#2b2d6e"; c.lineWidth = 6;
  c.beginPath(); c.roundRect(60, 60, 170, 150, 16); c.fill(); c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.ellipse(120 + Math.sin(s * 0.4) * 20, 120, 34, 14, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(145, 60); c.lineTo(145, 210); c.moveTo(60, 135); c.lineTo(230, 135); c.stroke();
  // 오락기
  c.fillStyle = "#2b2d6e"; c.beginPath(); c.roundRect(520, 150, 150, 250, 14); c.fill();
  c.fillStyle = "#ffc93c"; c.beginPath(); c.roundRect(536, 168, 118, 86, 8); c.fill();
  c.fillStyle = "#ff5d73"; c.beginPath(); c.arc(566, 296, 12, 0, 7); c.fill();
  c.fillStyle = "#8ed081"; c.beginPath(); c.arc(612, 290, 8, 0, 7); c.arc(636, 302, 8, 0, 7); c.fill();
  c.fillStyle = "#2b2d6e"; c.font = "700 26px Jua, sans-serif"; c.textAlign = "center"; c.fillText(Math.floor(s) % 2 ? "한판!" : "GO!", 595, 220);
  // 깔개
  c.fillStyle = "#ff8fab"; c.beginPath(); c.ellipse(330, 470, 190, 44, 0, 0, 7); c.fill();
  c.strokeStyle = "#fff"; c.lineWidth = 5; c.setLineDash([14, 12]); c.beginPath(); c.ellipse(330, 470, 160, 32, 0, 0, 7); c.stroke(); c.setLineDash([]);
  // 캐릭터 (통통 튄다)
  const age = roomTap ? t - roomTap.t : 1e9, tapping = age < 1600;
  const hop = Math.abs(Math.sin(s * 2.2)), jump = tapping && age < 520 ? Math.sin((age / 520) * Math.PI) * 70 : 0;
  const y = 372 - hop * 26 - jump;
  c.fillStyle = "rgba(80,50,20,.2)"; c.beginPath(); c.ellipse(330, 468, 84 - hop * 14 - jump * 0.3, 14, 0, 0, 7); c.fill();
  const ang = Math.atan2(pointer.y * H - y, pointer.x * W - 330);
  const wob = tapping ? Math.sin(age / 45) * 0.16 * Math.max(0, 1 - age / 900) : 0;
  drawMochi(c, 330, y, 100, look, { ang, sq: (hop - 0.5) * 0.12 + wob, open: tapping && age < 700 });
  if (tapping) {      // 말풍선
    c.font = "700 30px Jua, sans-serif"; c.textAlign = "center";
    const tw = c.measureText(roomTap.text).width + 40, bx = Math.min(W - tw / 2 - 10, 330 + 90), by = Math.max(60, y - 150);
    c.globalAlpha = Math.min(1, (1600 - age) / 300);
    c.fillStyle = "#fffdf6"; c.strokeStyle = "#2b2d6e"; c.lineWidth = 5;
    c.beginPath(); c.roundRect(bx - tw / 2, by - 36, tw, 56, 18); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(bx - 40, by + 18); c.lineTo(bx - 64, by + 46); c.lineTo(bx - 14, by + 18); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#fffdf6"; c.fillRect(bx - 38, by + 14, 22, 8);
    c.fillStyle = "#2b2d6e"; c.fillText(roomTap.text, bx, by + 2);
    c.globalAlpha = 1;
  }
}
function roomLoop(t) {
  requestAnimationFrame(roomLoop);
  if (!$("v-home").hidden) paintRoom(t);
}

// ── 후원 ──
function openDonate() {
  const box = $("dList"); box.innerHTML = "";
  const d = SITE.donate;
  const link = (label, href, cls) => { const a = document.createElement("a"); a.className = "btn " + cls; a.textContent = label; a.href = href; a.target = "_blank"; a.rel = "noopener"; box.append(a); };
  if (d.kakaopay) link("카카오페이로 보내기", d.kakaopay, "btn-coral");
  if (d.toss) link("토스로 보내기", d.toss, "btn-navy");
  if (d.bank) {
    const row = document.createElement("div"); row.className = "bank";
    const s = document.createElement("span"); s.textContent = d.bank;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-line"; b.textContent = "복사";
    b.addEventListener("click", () => copy(d.bank, "계좌를 복사했어요"));
    row.append(s, b); box.append(row);
  }
  if (!box.children.length) { const n = document.createElement("div"); n.className = "none"; n.textContent = "후원 창구를 준비하고 있어요. 마음만으로도 고맙습니다."; box.append(n); }
  $("donateModal").hidden = false;
}

async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { window.prompt("복사해서 보내 주세요", text); }
}

// ── 이벤트 연결 ──
function init() {
  // 휴대폰: 첫 터치에 소리를 켜고(iOS 는 손가락으로 건드려야 소리가 난다), 화면을 돌리면 안내를 다시 본다
  const firstTouch = () => { unlockAudio(); music.unlock(); };
  window.addEventListener("pointerdown", firstTouch, { once: true, capture: true });
  window.addEventListener("touchend", firstTouch, { once: true, capture: true });
  window.addEventListener("keydown", firstTouch, { once: true, capture: true });
  music.setOn(musicOn);
  const setMusic = () => { for (const id of ["musicBtn", "musicBtn2"]) { $(id).textContent = id === "musicBtn" ? (musicOn ? "음악 켬" : "음악 끔") : musicOn ? "음악 끄기" : "음악 켜기"; $(id).setAttribute("aria-pressed", String(musicOn)); } };
  setMusic();
  for (const id of ["musicBtn", "musicBtn2"]) $(id).addEventListener("click", () => { musicOn = !musicOn; store.set("hp_music", musicOn ? "1" : "0"); music.setOn(musicOn); setMusic(); });
  // 판이 끝나면 음악을 잠깐 쉬고, 이기면 축포
  events.addEventListener("over", (e) => {
    music.pause(0.8);
    const win = e.detail ? e.detail.win : null, kindNow = room ? "online" : offline && offline.kind;
    lastRec = win != null && kindNow !== "local" ? record(gameId || current.id, win) : "";
    if (win === true) { confetti(); ui.cheer(); }
    if (room && lastRec) { const txt = (win ? "이겼어요! " : "아쉬워요. ") + lastRec; setTimeout(() => toast(txt), 1400); }
  });
  events.addEventListener("hurry", (e) => music.hurry(!!e.detail));
  // 말풍선
  buildEmoBar();
  $("emoBtn").addEventListener("click", () => { $("emoBar").hidden = !$("emoBar").hidden; });
  $("howBtn").addEventListener("click", async () => {
    const panel = $("howPanel");
    if (!panel.hidden) { panel.hidden = true; return; }
    const id = gameId || (current && current.id); if (!id) return;
    let mod; try { mod = await loadMod(id); } catch { return; }
    const g = GAMES.find((x) => x.id === id), list = $("howPlayList"); list.innerHTML = "";
    $("howTitle").textContent = (g ? g.name + " " : "") + "하는 법";
    for (const [k, v] of mod.meta.howto) { const li = document.createElement("li"), b = document.createElement("b"); b.textContent = k; li.append(b, " " + v); list.append(li); }
    panel.hidden = false;
  });
  $("howClose").addEventListener("click", () => { $("howPanel").hidden = true; });
  $("howPanel").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if ($("v-play").hidden || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    const k = /^Digit([1-6])$/.exec(e.code);
    if (k) sendEmote(+k[1] - 1);
  });
  // 단추 누르는 소리
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".btn, .card, .chipbtn, .swatch, .seg button, .chip")) ui.pop(); });
  // 내 방 캐릭터 누르기
  $("avatarCv").addEventListener("pointerdown", (e) => {
    const r = $("avatarCv").getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 720, y = ((e.clientY - r.top) / r.height) * 560;
    if (Math.hypot(x - 330, y - 360) > 130) return;
    roomTap = { t: performance.now(), text: TAP_LINES[(Math.random() * TAP_LINES.length) | 0] };
    ui(420, 0.18, "sine", 0.12, 500); ui(840, 0.12, "triangle", 0.06, 300, 0.08);
  });
  window.addEventListener("resize", updateRotTip);
  $("rotClose").addEventListener("click", () => { rotDismissed = true; updateRotTip(); });
  $("rotSkip").addEventListener("click", () => { rotDismissed = true; updateRotTip(); });
  $("rotLock").addEventListener("click", lockOrientation);
  $("fsBtn").hidden = !(document.fullscreenEnabled && coarse());
  $("fsBtn").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => { $("fsBtn").textContent = document.fullscreenElement ? "원래 화면" : "전체 화면"; });
  document.title = SITE.name + " — 가입 없이 친구랑 바로 한 판";
  $("nick").value = store.get("hp_name") || "";
  renderFilters(); renderCards();
  $("randGame").addEventListener("click", () => { const r = GAMES.filter((g) => g.ready); openGame(r[(Math.random() * r.length) | 0]); });
  $("closetToggle").addEventListener("click", (e) => { const on = $("closet").classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", String(on)); e.currentTarget.textContent = on ? "캐릭터 꾸미기 닫기" : "캐릭터 꾸미기 열기"; });
  renderCloset();
  store.set("hp_look", lookStr(look));
  $("randLook").addEventListener("click", () => { look = randomLook(); saveLook(); });
  window.addEventListener("pointermove", (e) => { const r = $("avatarCv").getBoundingClientRect(); if (r.width) { pointer.x = (e.clientX - r.left) / r.width; pointer.y = (e.clientY - r.top) / r.height; } });
  paintRoom(0);
  requestAnimationFrame(roomLoop);
  const setMute = () => { $("muteBtn").textContent = muted ? "소리 끔" : "소리 켬"; $("muteBtn").setAttribute("aria-pressed", String(muted)); };
  setMute();
  $("muteBtn").addEventListener("click", () => { muted = !muted; store.set("hp_muted", muted ? "1" : "0"); setMute(); });
  $("goHome").addEventListener("click", goHome);
  $("donateBtn").hidden = !SITE.donate.show;
  $("donateBtn").addEventListener("click", openDonate);
  $("dClose").addEventListener("click", () => ($("donateModal").hidden = true));
  $("donateModal").addEventListener("click", (e) => { if (e.target === $("donateModal")) $("donateModal").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("donateModal").hidden = true; });
  for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", goHome);

  $("joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = $("joinCode").value.trim().toUpperCase();
    if (!needServer()) return;
    if (!/^[A-Z]{4}$/.test(code)) return toast("방 코드는 영문 4글자예요");
    connect(code);
  });
  $("mkRoom").addEventListener("click", async () => {
    if (!needServer()) return;
    try { const r = await api("/api/new"); connect(r.code); } catch { toast("서버에 연결하지 못했어요"); }
  });
  $("quick").addEventListener("click", async () => {
    if (!needServer()) return;
    try { const r = await api("/api/quick?game=" + current.id); connect(r.code, { pub: true }); if (r.fresh) toast("기다리는 사람이 없어 새 방을 열었어요"); }
    catch { toast("서버에 연결하지 못했어요"); }
  });
  for (const b of document.querySelectorAll("[data-solo]")) b.addEventListener("click", () => playOffline({ kind: "solo", level: b.dataset.solo, mode: soloMode }));
  $("local2").addEventListener("click", () => playOffline({ kind: "local", level: "normal", mode: soloMode }));

  $("leaveRoom").addEventListener("click", goHome);
  $("copyLink").addEventListener("click", () => room && copy(`${location.origin}/?r=${room.code}`, "초대 링크를 복사했어요. 친구에게 보내 주세요"));
  $("pubChk").addEventListener("change", (e) => send({ t: "set", pub: e.target.checked }));
  $("startBtn").addEventListener("click", () => send({ t: "start" }));

  $("exitPlay").addEventListener("click", () => {
    if (room) goHome();
    else { stopGame(); openGame(current); }
  });
  $("again").addEventListener("click", () => offline && playOffline(offline));
  $("resExit").addEventListener("click", () => { stopGame(); openGame(current); });

  // 방장 화면이 가려지면 게임이 멈추므로 다른 사람에게 방장을 넘긴다
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && room && room.host === room.you && room.players.length > 1) send({ t: "yield" });
  });

  const invited = new URLSearchParams(location.search).get("r");
  if (invited && /^[A-Za-z]{4}$/.test(invited)) connect(invited.toUpperCase());
  else show("home");
  loadStats();
}
init();
