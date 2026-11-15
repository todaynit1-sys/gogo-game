// 한판 오락실 — 로비, 방 대기실, 게임 실행
import { SITE, GAMES } from "./config.js";
import { unlockAudio } from "./games/kit.js?v=2";
import { BODY, FACES, HATS, PATTERNS, ACCS, drawMochi, parseLook, lookStr, randomLook } from "./avatar.js?v=3";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let muted = store.get("hp_muted") === "1";
let look = store.get("hp_look") ? parseLook(store.get("hp_look")) : randomLook();
let current = GAMES[0];   // 고른 게임
let ws = null, room = null, game = null, pingTimer = null, leaving = false;
let offline = null;       // 혼자/로컬 다시 하기용 설정
let gameId = null, sawLobby = false, overPending = false;

// 게임 모듈은 고를 때 불러온다
const VER = "?v=16";
const mods = {};
const loadMod = (id) => (mods[id] = mods[id] || import("./games/" + id + ".js" + VER));

// ── 공통 ──
function show(name) {
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "v-" + name;
  document.documentElement.classList.toggle("playing", name === "play");
  if (name === "home" || name === "game") leaveFullscreen();
  window.scrollTo(0, 0);
  updateRotTip();
}

// ── 휴대폰: 전체 화면, 회전 안내 ──
const coarse = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
let prefPortrait = false, rotDismissed = false;
function afterStart(mod) {
  $("v-play").classList.toggle("nopad", !$("touch").children.length);
  prefPortrait = !!mod.meta.portrait;
  updateRotTip();
}
function updateRotTip() {
  const tip = $("rotTip");
  if (!tip) return;
  const portraitNow = window.innerHeight > window.innerWidth;
  const show = coarse() && !rotDismissed && !$("v-play").hidden && portraitNow !== prefPortrait;
  tip.hidden = !show;
  if (show) $("rotText").textContent = prefPortrait ? "세로로 들면 판이 더 크게 보여요" : "가로로 돌리면 더 크게 즐길 수 있어요";
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
  land: `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#d9f2d2"/><g stroke="#2b2d6e" stroke-width="4"><path d="M30 30h110v70H80v50H30z" fill="#ff9db5"/><path d="M200 60h90v90h-60v-40h-30z" fill="#8ecbff"/><path d="M140 66h40v54" fill="none" stroke-dasharray="8 7"/><rect x="170" y="112" width="20" height="20" fill="#ff5d73"/></g></svg>`,
};

function renderCards() {
  const box = $("cards"); box.innerHTML = "";
  for (const g of GAMES) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "card"; b.disabled = !g.ready;
    b.innerHTML = `<span class="thumb">${THUMBS[g.id] || ""}</span><span class="card-body"><h3></h3><span class="tag"></span><p></p></span>`;
    const h = b.querySelector("h3"); h.textContent = g.name;
    if (!g.ready) { const s = document.createElement("span"); s.className = "soon"; s.textContent = "준비 중"; h.append(s); }
    b.querySelector(".tag").textContent = g.tag;
    b.querySelector("p").textContent = g.desc;
    if (g.ready) b.addEventListener("click", () => openGame(g));
    box.append(b);
  }
}

async function openGame(g) {
  current = g;
  $("gName").textContent = g.name; $("gDesc").textContent = g.desc;
  $("gThumb").innerHTML = THUMBS[g.id] || "";
  $("howList").innerHTML = "";
  show("game");
  let mod; try { mod = await loadMod(g.id); } catch { return toast("게임을 불러오지 못했어요. 새로고침해 주세요"); }
  if (current !== g) return;
  $("soloText").textContent = mod.meta.soloText;
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
    canvas: $("cv"), touchEl: $("touch"), kind: cfg.kind, level: cfg.level,
    myName: myName() || "나", look, isMuted: () => muted,
    onOver: (r) => { $("resTitle").textContent = (r && r.title) || "한 판 더 할까요?"; $("result").hidden = false; },
  });
  gameId = current.id;
  afterStart(mod);
}

window.__hp = () => (game && game.peek ? game.peek() : null);   // 점검용
function stopGame() { if (game) { game.stop(); game = null; gameId = null; } }

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
  room = d;
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
  const hop = Math.abs(Math.sin(s * 2.2)), y = 372 - hop * 26;
  c.fillStyle = "rgba(80,50,20,.2)"; c.beginPath(); c.ellipse(330, 468, 84 - hop * 14, 14, 0, 0, 7); c.fill();
  const ang = Math.atan2(pointer.y * H - y, pointer.x * W - 330);
  drawMochi(c, 330, y, 100, look, { ang, sq: (hop - 0.5) * 0.12 });
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
  window.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
  window.addEventListener("touchend", unlockAudio, { once: true, capture: true });
  window.addEventListener("resize", updateRotTip);
  $("rotClose").addEventListener("click", () => { rotDismissed = true; updateRotTip(); });
  $("fsBtn").hidden = !(document.fullscreenEnabled && coarse());
  $("fsBtn").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => { $("fsBtn").textContent = document.fullscreenElement ? "원래 화면" : "전체 화면"; });
  document.title = SITE.name + " — 가입 없이 친구랑 바로 한 판";
  $("nick").value = store.get("hp_name") || "";
  renderCards();
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
  for (const b of document.querySelectorAll("[data-solo]")) b.addEventListener("click", () => playOffline({ kind: "solo", level: b.dataset.solo }));
  $("local2").addEventListener("click", () => playOffline({ kind: "local", level: "normal" }));

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
