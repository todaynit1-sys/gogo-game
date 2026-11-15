// 한 화면 대전 틀 — 모두가 같은 판에서 움직이는 게임(폭탄 미로, 땅따먹기)이 함께 쓴다.
// 게임 계산은 방장 브라우저가 하고, 나머지는 조작만 보내고 결과를 받아 그린다.
//
// 게임 정의 G:
//   W, H, sendEvery(몇 틱마다 보낼지), action(터치 버튼 이름 또는 null), overDelay
//   bots: { solo, local }, fill(mode, 사람 수) → 온라인에서 채울 봇 수
//   init(seats, { mode, level }) → 상태          step(상태, 조작[])
//   bot(상태, i, mem, level) → 조작              draw(ctx, 보기, env)
//   fx(보기, 기억, snd)                           title(보기, 내 번호)
//   pack(상태) → 보낼 것   unpack(받은 것) → 보기   viewOf(상태) → 보기   adopt(보기) → 상태
//   multiDir: 대각선 이동 허용   pointer: 화면 끌기 조준 사용 (step 의 세 번째 인자로 끈 방향이 온다)
//   noPad: 방향 버튼 없이 터치 끌기만 쓰는 게임

import { sound, makeLoop, fit, keyboard, touchPad, label, BOT_NAMES } from "./kit.js?v=1";
import { lookStr } from "../avatar.js?v=2";

export const L = 1, R = 2, U = 4, D = 8, A = 16, P = 32, B = 64;   // P = 화면을 끌고 있는 중
const DIRS = L | R | U | D;
const P1 = { KeyA: L, KeyD: R, KeyW: U, KeyS: D, KeyF: A, KeyG: A, KeyQ: B, KeyE: B };
const P2 = { ArrowLeft: L, ArrowRight: R, ArrowUp: U, ArrowDown: D, Enter: A, Slash: A, ShiftRight: A, Numpad0: A, Period: B, Comma: B };
const SOLO = { ...P1, ...P2, Space: A };
const TOUCH = { L, R, U, D, A, B };

export function startHostGame(G, opts) {
  const { canvas, kind } = opts;
  const snd = sound(opts.isMuted);
  let room = opts.room || null;
  let sim = null, snap = null, prev = null, snapAt = 0, snapGap = 0.1, overSent = false, lastSent = "", lastMask = -1, sendWait = 0, t = 0;
  const remote = [0, 0, 0, 0], latch = [0, 0, 0, 0], mem = [{}, {}, {}, {}], fxMem = {};      // latch: 한 틱 사이에 눌렀다 뗀 버튼도 놓치지 않게
  const level = opts.level || "normal";

  const kb = keyboard(new Set(Object.keys(SOLO)));
  const pad = touchPad(opts.touchEl, G.noPad ? [] : G.action ? [{ dpad: true }, G.action2 ? [{ id: "B", label: G.action2, cls: "jump" }, { id: "A", label: G.action, cls: "smash big" }] : [{ id: "A", label: G.action, cls: "smash big" }]] : [{ dpad: true }]);

  // 화면 끌기 조준: 누른 곳에서 끈 만큼(반대 방향으로 쏜다)
  const drag = { on: false, sx: 0, sy: 0, x: 0, y: 0 };
  const remoteAim = [null, null, null, null];
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect(), sc = Math.min(r.width / G.W, r.height / G.H) || 1;
    return [(e.clientX - r.left - (r.width - G.W * sc) / 2) / sc, (e.clientY - r.top - (r.height - G.H * sc) / 2) / sc];
  };
  const pd = (e) => { if (!G.pointer) return; e.preventDefault(); const [x, y] = toLogical(e); drag.on = true; drag.sx = x; drag.sy = y; drag.x = 0; drag.y = 0; try { canvas.setPointerCapture(e.pointerId); } catch {} };
  const pm = (e) => { if (!drag.on) return; const [x, y] = toLogical(e); drag.x = Math.round(drag.sx - x); drag.y = Math.round(drag.sy - y); };
  const pu = () => { drag.on = false; };
  canvas.addEventListener("pointerdown", pd); canvas.addEventListener("pointermove", pm);
  canvas.addEventListener("pointerup", pu); canvas.addEventListener("pointercancel", pu);
  const myAim = () => ({ x: drag.x, y: drag.y, sx: Math.round(drag.sx), sy: Math.round(drag.sy) });

  const iAmHost = () => kind !== "online" || (room && room.host === room.you);
  const mySlot = () => { if (kind !== "online") return 0; const me = room.players.find((p) => p.id === room.you); return me ? me.slot : -1; };

  // 방향은 가장 나중에 누른 키가 이긴다
  function maskOf(map, withTouch) {
    let dir = 0, act = 0;
    const multi = !!G.multiDir;
    for (const c of kb.order) { const b = map[c]; if (!b) continue; if (b & DIRS) dir = multi ? dir | b : b; else act |= b; }
    if (withTouch) for (const c of pad.order) { const b = TOUCH[c]; if (b & DIRS) dir = multi ? dir | b : b; else act |= b; }
    if (G.pointer && drag.on) act |= P;
    return dir | act;
  }

  function buildSeats() {
    const seats = [], bot = () => seats.push({ c: "b", name: BOT_NAMES[seats.length % 4], look: "" });
    if (kind === "solo") {
      seats.push({ c: "k0", name: opts.myName, look: opts.look ? lookStr(opts.look) : "" });
      for (let i = 0; i < G.bots.solo; i++) bot();
    } else if (kind === "local") {
      seats.push({ c: "k1", name: "1P", look: opts.look ? lookStr(opts.look) : "" }, { c: "k2", name: "2P", look: "" });
      for (let i = 0; i < G.bots.local; i++) bot();
    } else {
      const ps = [...room.players].sort((a, b) => a.slot - b.slot).slice(0, G.cap ? G.cap(room.mode | 0, room.players.length) : 4);
      for (const p of ps) seats.push({ c: "r", slot: p.slot, name: p.name, look: p.look || "" });
      const n = Math.min(4 - seats.length, G.fill(room.mode | 0, ps.length));
      for (let i = 0; i < n; i++) bot();
    }
    return seats;
  }

  let aims = [];
  function inputs(s) {
    aims = s.seats.map(() => null);
    return s.seats.map((seat, i) => {
      const human = (map, touch) => { aims[i] = myAim(); return maskOf(map, touch); };
      const robot = (lv) => { const r = G.bot(s, i, mem[i], lv); if (r && typeof r === "object") { aims[i] = { x: r.x, y: r.y, sx: r.sx, sy: r.sy }; return r.m | 0; } return r | 0; };
      if (seat.c === "k0") return human(SOLO, true);
      if (seat.c === "k1") return human(P1, false);
      if (seat.c === "k2") return human(P2, false);
      if (seat.c === "r") {
        if (seat.slot === mySlot()) return human(SOLO, true);
        if (room.players.some((p) => p.slot === seat.slot)) { aims[i] = remoteAim[seat.slot]; const r = remote[seat.slot] | latch[seat.slot]; latch[seat.slot] = 0; return r; }
        return robot("normal");                          // 나간 사람 자리는 봇이 이어받는다
      }
      return robot(kind === "online" ? "normal" : level);
    });
  }

  const meIndex = (v) => {
    if (kind === "local") return -1;
    if (kind === "solo") return v.seats.findIndex((x) => x.c === "k0");
    const slot = mySlot();
    return v.seats.findIndex((x) => x.c === "r" && x.slot === slot);
  };
  const viewNow = () => (iAmHost() ? (sim ? (G.viewOf ? G.viewOf(sim) : sim) : null) : snap);

  function tick(dt) {
    t += dt;
    if (iAmHost()) {
      if (!sim) sim = snap ? (G.adopt ? G.adopt(snap) : snap) : G.init(buildSeats(), { mode: room ? room.mode | 0 : 0, level });
      const masks = inputs(sim);
      G.step(sim, masks, aims);
      if (kind === "online" && sim.tick % G.sendEvery === 0) opts.send("s" + JSON.stringify(G.pack ? G.pack(sim) : sim));
      if (sim.over && sim.over.t > (G.overDelay || 240) && !overSent) { overSent = true; opts.onOver({ title: G.title(sim, meIndex(sim)) }); }
    } else {
      sim = null;
      const m = snap && meIndex(snap) >= 0 ? maskOf(SOLO, true) : 0;
      const key = G.pointer ? m + ":" + drag.x + ":" + drag.y + (G.pointerStart ? ":" + Math.round(drag.sx) + ":" + Math.round(drag.sy) : "") : String(m);
      // 끄는 동안의 미세한 변화는 조금 묶어서 보낸다 (눌렀다 뗀 순간은 바로)
      if (key !== lastSent && (m !== lastMask || ++sendWait >= 3)) { lastSent = key; lastMask = m; sendWait = 0; opts.send("i" + key); }
    }
    const v = viewNow();
    if (v && G.fx) G.fx(v, fxMem, snd, meIndex(v));
  }

  function draw() {
    const ctx = fit(canvas, G.W, G.H);
    const v = viewNow();
    if (!v) { ctx.fillStyle = "#fff4dc"; ctx.fillRect(0, 0, G.W, G.H); label(ctx, "연결하는 중…", G.W / 2, G.H / 2, 30, "#2b2d6e"); return; }
    const host = iAmHost();
    const alpha = host ? 1 : Math.max(0, Math.min(1, (performance.now() - snapAt) / 1000 / snapGap));
    G.draw(ctx, v, { me: meIndex(v), t, prev: host ? null : prev, alpha, host });
    if (kind === "online" && meIndex(v) < 0) label(ctx, "관전 중 — 다음 판에 참가해요", G.W / 2, G.H - 14, 18, "#2b2d6e");
  }

  const stopLoop = makeLoop(tick, draw);

  return {
    onNet(msg) {
      if (msg[0] === "s") {
        if (iAmHost()) return;
        try {
          const o = JSON.parse(msg.slice(1)), now = performance.now();
          prev = snap; snap = G.unpack ? G.unpack(o) : o;
          if (snapAt) snapGap = Math.max(0.03, Math.min(0.4, snapGap * 0.7 + ((now - snapAt) / 1000) * 0.3));
          snapAt = now;
        } catch {}
      } else if (msg[0] === "i") {
        const slot = +msg[1]; if (!(slot >= 0 && slot < 4)) return;
        const part = msg.slice(2).split(":");
        const nm = parseInt(part[0], 10) & 127;
        latch[slot] |= nm & ~remote[slot];
        remote[slot] = nm;
        if (part.length >= 3) {
          const num = (k, lo, hi) => Math.max(lo, Math.min(hi, parseInt(part[k], 10) || 0));
          remoteAim[slot] = { x: num(1, -400, 400), y: num(2, -400, 400) };
          if (part.length >= 5) { remoteAim[slot].sx = num(3, -100, 1100); remoteAim[slot].sy = num(4, -100, 700); }
        }
      }
    },
    setRoom(r) {
      const wasHost = iAmHost();
      room = r;
      if (!wasHost && iAmHost() && snap) sim = G.adopt ? G.adopt(snap) : snap;
      lastSent = ""; lastMask = -1;
    },
    stop() {
      stopLoop(); kb.stop(); pad.stop();
      canvas.removeEventListener("pointerdown", pd); canvas.removeEventListener("pointermove", pm);
      canvas.removeEventListener("pointerup", pu); canvas.removeEventListener("pointercancel", pu);
    },
    peek() { const v = iAmHost() ? sim : snap; return { host: iAmHost(), tick: v ? v.tick : -1, seats: v ? v.seats.length : 0, over: !!(v && v.over), turn: v ? v.turn : -1, tn: v ? v.tn : -1 }; },
  };
}
