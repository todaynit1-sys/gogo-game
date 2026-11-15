// 한판 오락실 — 로비, 방 대기실, 게임 실행
import { SITE, GAMES } from "./config.js";
import { startVolley } from "./games/volley.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let muted = store.get("hp_muted") === "1";
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
    myName: myName() || "나", isMuted: () => muted,
    onOver: () => { $("resTitle").textContent = "한 판 더 할까요?"; $("result").hidden = false; },
  });
}

function stopGame() { if (game) { game.stop(); game = null; } }

// ── 온라인 ──
async function api(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error("api " + r.status);
  return r.json();
}

function connect(code, { pub = false } = {}) {
  disconnect();
  leaving = false;
  const q = new URLSearchParams({ name: myName(), game: current.id, pub: pub ? "1" : "0" });
  const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${code}?${q}`);
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
      const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = SEAT_COLORS[i];
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
    $("online").hidden = !(s.online > 0);
    $("online").textContent = `지금 ${s.online}명 접속 중`;
  } catch { $("online").hidden = true; }
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
    if (!/^[A-Z]{4}$/.test(code)) return toast("방 코드는 영문 4글자예요");
    connect(code);
  });
  $("mkRoom").addEventListener("click", async () => {
    try { const r = await api("/api/new"); connect(r.code); } catch { toast("서버에 연결하지 못했어요"); }
  });
  $("quick").addEventListener("click", async () => {
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
