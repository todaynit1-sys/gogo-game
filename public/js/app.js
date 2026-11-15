// 한판 오락실 — 로비, 방 대기실, 게임 실행
import { SITE, GAMES } from "./config.js";
import { startVolley } from "./games/volley.js?v=3";
import { BODY, FACES, HATS, drawMochi, parseLook, lookStr, randomLook } from "./avatar.js?v=1";

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

// ── 공통 ──
function show(name) {
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "v-" + name;
  window.scrollTo(0, 0);
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

function openGame(g) {
  current = g;
  $("gName").textContent = g.name; $("gDesc").textContent = g.desc;
  $("gThumb").innerHTML = THUMBS[g.id] || "";
  show("game");
}

// ── 오프라인(혼자·한 키보드) ──
function playOffline(cfg) {
  offline = cfg;
  stopGame();
  $("result").hidden = true;
  $("playInfo").textContent = cfg.kind === "solo" ? "혼자 연습 · " + { easy: "쉬움", normal: "보통", hard: "어려움" }[cfg.level] : "한 키보드 2인";
  show("play");
  game = startVolley({
    canvas: $("cv"), touchEl: $("touch"), kind: cfg.kind, mode: 2, level: cfg.level,
    myName: myName() || "나", look, isMuted: () => muted,
    onOver: () => { $("resTitle").textContent = "한 판 더 할까요?"; $("result").hidden = false; },
  });
}

function stopGame() { if (game) { game.stop(); game = null; } }

// ── 온라인 ──
const BASE = (SITE.server || "").replace(/\/$/, "");
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
  leaving = false;
  const q = new URLSearchParams({ name: myName(), look: lookStr(look), game: current.id, pub: pub ? "1" : "0" });
  const wsBase = BASE ? BASE.replace(/^http/, "ws") : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const sock = new WebSocket(`${wsBase}/ws/${code}?${q}`);
  ws = sock;
  sock.onmessage = (e) => {
    const m = e.data;
    if (typeof m !== "string" || m === "pong") return;
    if (m[0] === "s" || m[0] === "i") { if (game) game.onNet(m); return; }
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

function onRoom(d) {
  room = d;
  const g = GAMES.find((x) => x.id === d.game); if (g) current = g;
  history.replaceState(null, "", "?r=" + d.code);
  if (d.phase === "play") {
    if (!game) {
      $("result").hidden = true;
      $("playInfo").textContent = "방 " + d.code;
      show("play");
      const mode = d.mode || (d.players.length >= 3 ? 4 : 2);
      game = startVolley({
        canvas: $("cv"), touchEl: $("touch"), kind: "online", mode, room: d,
        send, isMuted: () => muted,
        onOver: () => send({ t: "end" }),
      });
    } else game.setRoom(d);
  } else {
    stopGame();
    renderRoom();
    show("room");
  }
}

const SEAT_COLORS = ["#ff9db5", "#9bd88a", "#ffd66b", "#8ecbff"];
function renderRoom() {
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
      role.textContent = [p.id === d.you ? "나" : "", p.id === d.host ? "방장" : "", i % 2 ? "오른쪽 팀" : "왼쪽 팀"].filter(Boolean).join(" · ");
      el.append(dot, nm, role);
    } else el.textContent = "빈자리";
    seats.append(el);
  }
  for (const b of $("modeSeg").children) { b.setAttribute("aria-pressed", String(+b.dataset.mode === d.mode)); b.disabled = !host; }
  $("pubChk").checked = d.pub; $("pubChk").disabled = !host;
  $("startBtn").hidden = !host;
  const n = d.players.length;
  const mode = d.mode || (n >= 3 ? 4 : 2);
  $("roomHint").textContent = host
    ? (n === 1 ? "혼자 시작하면 봇과 붙어요. 친구를 기다리려면 초대 링크를 보내세요." : `${n}명 · ${mode === 2 ? "1대1" : "2대2"}로 시작해요.` + (mode === 2 && n > 2 ? " 3번째부터는 관전이에요." : mode === 4 && n < 4 ? " 빈자리는 봇이 채워요." : ""))
    : "방장이 시작하기를 기다리는 중이에요.";
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
      b.type = "button"; b.setAttribute("aria-pressed", String(look[key] === i));
      paint(b, it, i);
      b.addEventListener("click", () => { look[key] = i; saveLook(); });
      box.append(b);
    });
  };
  mk("pickColor", BODY, "c", (b, it) => { b.className = "swatch"; b.style.background = it.body; b.style.borderColor = it.dark; b.title = it.name; b.setAttribute("aria-label", it.name); });
  mk("pickFace", FACES, "f", (b, it) => { b.className = "chipbtn"; b.textContent = it; });
  mk("pickHat", HATS, "h", (b, it) => { b.className = "chipbtn"; b.textContent = it; });
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
  for (const b of $("modeSeg").children) b.addEventListener("click", () => send({ t: "set", mode: +b.dataset.mode }));
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
