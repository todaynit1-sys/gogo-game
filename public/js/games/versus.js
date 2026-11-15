// 판 대전 틀 — 각자 자기 판을 쌓고 서로 방해를 보내는 게임(블록 대전, 연쇄 팡)이 함께 쓴다.
// 자기 판은 자기 브라우저가 계산하고, 다른 사람에게는 판 모습과 공격만 보낸다.
//
// 게임 정의 G:
//   cols, rows, bg
//   create() → 판            blank() → 빈 보기용 판
//   step(판, dt)             act(판, 'L'|'R'|'rot'|'rot2'|'drop')    판.soft = 아래 키 누름
//   attackIn(판, n)          판.out = 보낼 공격량, 판.pending = 받을 방해, 판.alive, 판.ev = 소리용 사건
//   view(판) → 보기용 판     encode(보기용 판) → 문자열   decode(문자열) → 보기용 판
//   draw(ctx, 보기용 판, x, y, cell, t, mini)   drawNext(ctx, 판, x, y, cell)
//   bot(판, mem, level, dt)

import { sound, jingle, makeLoop, fit, keyboard, touchPad, rr, label, BOT_NAMES } from "./kit.js?v=1";
import { drawMochi, parseLook } from "../avatar.js?v=1";

const K_SOLO = { ArrowLeft: "L", KeyA: "L", ArrowRight: "R", KeyD: "R", ArrowDown: "D", KeyS: "D", ArrowUp: "rot", KeyW: "rot", KeyX: "rot", KeyZ: "rot2", Space: "drop", Enter: "drop" };
const K_P1 = { KeyA: "L", KeyD: "R", KeyS: "D", KeyW: "rot", KeyG: "rot2", KeyF: "drop" };
const K_P2 = { ArrowLeft: "L", ArrowRight: "R", ArrowDown: "D", ArrowUp: "rot", ShiftRight: "rot2", Enter: "drop", Slash: "drop" };

export function startVersus(G, opts) {
  const { canvas, kind } = opts;
  const snd = sound(opts.isMuted);
  let room = opts.room || null;
  const portrait = window.innerWidth < 640 && window.innerHeight > window.innerWidth;
  const W = portrait ? 540 : 960, H = portrait ? 720 : 540;

  const myRoomSlot = () => { const me = room && room.players.find((p) => p.id === room.you); return me ? me.slot : -1; };
  const hostSlot = () => { const h = room && room.players.find((p) => p.id === room.host); return h ? h.slot : -1; };

  // ── 자리 만들기 ──
  const seats = [];
  const mk = (slot, kindOf, name, look, withBoard) => {
    const s = { slot, kind: kindOf, name, look, board: withBoard ? G.create() : null, view: withBoard ? null : G.blank(), alive: true, mem: {}, rr: 0, hit: 0, das: null, pending: 0, isBot: kindOf === "bot" };
    seats.push(s); return s;
  };
  if (kind === "solo") {
    mk(0, "me", opts.myName, opts.look || parseLook("", 0), true).map = K_SOLO;
    mk(1, "bot", BOT_NAMES[1], parseLook("", 1), true);
  } else if (kind === "local") {
    mk(0, "p1", "1P", opts.look || parseLook("", 0), true).map = K_P1;
    mk(1, "p2", "2P", parseLook("", 1), true).map = K_P2;
  } else if (!opts.late) {
    for (const p of room.players) {
      if (p.id === room.you) mk(p.slot, "me", p.name, parseLook(p.look, p.slot), true).map = K_SOLO;
      else mk(p.slot, "remote", p.name, parseLook(p.look, p.slot), false);
    }
    if (room.players.length === 1) {
      const slot = myRoomSlot() === 0 ? 1 : 0;       // 혼자 시작했으면 봇 하나와 붙는다
      mk(slot, "bot", BOT_NAMES[slot], parseLook("", slot), true);
    }
    seats.sort((a, b) => a.slot - b.slot);
  }
  const bySlot = (slot) => seats.find((s) => s.slot === slot);
  const focus = () => seats.find((s) => s.kind === "me" || s.kind === "p1") || seats[0];
  const level = opts.level || "normal";

  let phase = "count", count = 3.2, t = 0, sendT = 0, winner = -2, overT = 0, overSent = false, lastCount = 4;

  // ── 조작 ──
  const kb = keyboard(new Set([...Object.keys(K_SOLO), ...Object.keys(K_P1), ...Object.keys(K_P2)]));
  const pad = touchPad(opts.touchEl, [
    [{ id: "L", label: "◀" }, { id: "D", label: "▼" }, { id: "R", label: "▶" }],
    [{ id: "rot", label: "돌리기", cls: "jump" }, { id: "drop", label: "뚝!", cls: "smash" }],
  ]);
  const held = (seat, action) => {
    for (const c of kb.down) if (seat.map[c] === action) return true;
    return seat.kind === "me" && pad.down.has(action);
  };
  function press(seat, action) {
    if (!seat.alive || phase !== "play") return;
    if (action === "L" || action === "R") { G.act(seat.board, action); seat.das = { dir: action, t: 0 }; }
    else if (action !== "D") G.act(seat.board, action);
  }

  // ── 네트워크 ──
  const net = (obj, seat) => {
    if (kind !== "online") return;
    if (seat && seat.kind === "bot") obj.a = seat.slot;
    opts.send("b" + JSON.stringify(obj));
  };

  function routeAttack(seat, n) {
    const targets = seats.filter((s) => s !== seat && s.alive);
    if (!targets.length) return;
    const target = targets[seat.rr++ % targets.length];
    target.hit = 0.45;
    if (target.board) G.attackIn(target.board, n);
    else net({ t: "a", to: target.slot, n }, seat);
  }

  function setOver(w) {
    if (phase === "over") return;
    phase = "over"; winner = w; overT = 0;
    const f = focus();
    if (f && f.board && kind !== "local") { if (w === f.slot) jingle(snd, [523, 659, 784, 1047], 130); else jingle(snd, [392, 330, 262], 160); }
    else jingle(snd, [523, 659, 784, 1047], 130);
  }

  function tick(dt) {
    t += dt;
    for (const s of seats) if (s.hit > 0) s.hit -= dt;
    if (phase === "count") {
      count -= dt;
      const c = Math.ceil(count - 0.2);
      if (c !== lastCount && c >= 1 && c <= 3) { lastCount = c; snd(520, 0.1, "triangle", 0.1); }
      if (count <= 0) { phase = "play"; snd(880, 0.2, "triangle", 0.12); }
    }
    // 눌린 키 처리
    for (const code of kb.press.splice(0)) for (const s of seats) if (s.map && s.map[code]) press(s, s.map[code]);
    for (const id of pad.press.splice(0)) { const s = seats.find((x) => x.kind === "me"); if (s) press(s, id); }

    if (phase === "play") {
      for (const s of seats) {
        if (!s.board || !s.alive) continue;
        if (s.map) {
          s.board.soft = held(s, "D");
          if (s.das) {
            if (!held(s, s.das.dir)) s.das = null;
            else { s.das.t += dt; while (s.das && s.das.t > 0.2) { G.act(s.board, s.das.dir); s.das.t -= 0.045; } }
          }
        } else G.bot(s.board, s.mem, level, dt);
        G.step(s.board, dt);
        const loud = s.map != null;
        for (const e of s.board.ev.splice(0)) {
          if (!loud) continue;
          if (e === "lock") snd(160, 0.06, "square", 0.06);
          else if (e === "rot") snd(620, 0.04, "sine", 0.05);
          else if (e === "garbage") snd(110, 0.2, "sawtooth", 0.08);
          else if (e[0] === "c") snd(500 + 110 * +e.slice(1), 0.16, "triangle", 0.13, 200);
        }
        if (s.board.out > 0) { const n = s.board.out; s.board.out = 0; routeAttack(s, n); }
        if (!s.board.alive) { s.alive = false; snd(200, 0.4, "sawtooth", 0.1, -140); net({ t: "d" }, s); }
      }
      if (kind === "online") {
        sendT += dt;
        if (sendT > 0.16) {
          sendT = 0;
          for (const s of seats) if (s.board) net({ t: "s", d: G.encode(G.view(s.board)), p: s.board.pending }, s);
        }
      }
      if (!opts.late && seats.length >= 2) {
        const alive = seats.filter((s) => s.alive);
        if (alive.length <= 1) { const w = alive.length ? alive[0].slot : -1; setOver(w); net({ t: "o", w }); }
      }
    } else if (phase === "over") {
      overT += dt;
      if (overT > 4 && !overSent) {
        overSent = true;
        const f = focus(), wn = bySlot(winner);
        const title = kind === "local" || !f || !f.board ? `${wn ? wn.name : "무승부"} 승리! 한 판 더?` : winner === f.slot ? "이겼어요! 한 판 더?" : "아쉬워요. 한 판 더?";
        opts.onOver({ title });
      }
    }
  }

  // ── 그리기 ──
  function layout() {
    const f = focus();
    const list = f ? [f, ...seats.filter((s) => s !== f)] : [];
    const n = list.length, out = [], cols = G.cols, rows = G.rows;
    if (!n) return out;
    if (portrait) {
      const cell = Math.floor(Math.min((H - 120) / rows, (W - 194) / cols));
      const x = 12, y = 92;
      out.push({ s: list[0], x, y, cell, nx: x + cols * cell + 12, ny: y });
      if (n > 1) {
        const mx = x + cols * cell + 12, availW = W - mx - 8, availH = H - (y + 150) - 10;
        const mc = Math.max(5, Math.floor(Math.min(availW / cols, availH / ((n - 1) * (rows + 3.2)))));
        for (let i = 1; i < n; i++) out.push({ s: list[i], x: mx, y: y + 150 + (i - 1) * (rows + 3.2) * mc + 2.4 * mc, cell: mc, mini: true });
      }
    } else if (n <= 2) {
      const cell = Math.min(38, Math.floor((H - 104) / rows));
      const pw = cols * cell + 12 + 3.4 * cell, gap = 70, total = pw * n + gap * (n - 1), y = 86;
      for (let i = 0; i < n; i++) {
        const x = (W - total) / 2 + i * (pw + gap);
        out.push({ s: list[i], x, y, cell, nx: x + cols * cell + 12, ny: y });
      }
    } else {
      const cell = Math.min(38, Math.floor((H - 104) / rows));
      const pw = cols * cell + 12 + 3.4 * cell, x = 26, y = 86;
      out.push({ s: list[0], x, y, cell, nx: x + cols * cell + 12, ny: y });
      const rest = n - 1, left = x + pw + 30;
      const mc = Math.floor(Math.min((H - 130) / rows, (W - left - 20) / (rest * (cols + 1.2))));
      for (let i = 1; i < n; i++) out.push({ s: list[i], x: left + (i - 1) * (cols + 1.2) * mc, y: y + 24, cell: mc, mini: true });
    }
    return out;
  }

  function drawPanel(ctx, r) {
    const s = r.s, cell = r.cell, w = G.cols * cell, h = G.rows * cell;
    // 이름표
    const ns = r.mini ? Math.max(11, Math.min(17, cell * 0.95)) : 20;
    drawMochi(ctx, r.x + ns * 0.8, r.y - ns * 0.95, ns * 0.72, s.look);
    label(ctx, s.name, r.x + ns * 1.8, r.y - ns * 0.55, ns, "#2b2d6e", "#fff", "left");
    // 판
    ctx.fillStyle = "#2b2d6e"; rr(ctx, r.x - 5, r.y - 5, w + 10, h + 10, 10); ctx.fill();
    ctx.fillStyle = "#262860"; ctx.fillRect(r.x, r.y, w, h);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    for (let c = 0; c < G.cols; c += 2) ctx.fillRect(r.x + c * cell, r.y, cell, h);
    const v = s.board ? G.view(s.board) : s.view;
    if (v) G.draw(ctx, v, r.x, r.y, cell, t, !!r.mini);
    // 받을 방해 (왼쪽 빨간 막대)
    const pend = s.board ? s.board.pending : s.pending;
    if (pend > 0) {
      ctx.fillStyle = "#ff5d73";
      const ph = Math.min(h, pend * cell * (G.pendUnit || 1));
      ctx.fillRect(r.x - 5, r.y + h - ph, 4, ph);
      if (!r.mini) label(ctx, "+" + pend, r.x - 16, r.y + h - 4, 15, "#ff5d73", "#fff", "center");
    }
    if (s.hit > 0) { ctx.fillStyle = `rgba(255,93,115,${s.hit})`; ctx.fillRect(r.x, r.y, w, h); }
    if (!s.alive) {
      ctx.fillStyle = "rgba(20,20,50,.62)"; ctx.fillRect(r.x, r.y, w, h);
      label(ctx, "탈락", r.x + w / 2, r.y + h / 2, r.mini ? Math.max(14, cell * 1.6) : 40, "#fff", "#2b2d6e");
    }
    if (phase === "over" && winner === s.slot) label(ctx, "승리!", r.x + w / 2, r.y + h / 2, r.mini ? Math.max(14, cell * 1.6) : 46, "#ffc93c", "#2b2d6e");
    if (s.board && !r.mini) {
      label(ctx, "다음", r.nx + cell * 1.6, r.ny + 16, 16, "#2b2d6e", null);
      G.drawNext(ctx, s.board, r.nx, r.ny + 26, cell * 0.78);
    }
  }

  function draw() {
    const ctx = fit(canvas, W, H);
    ctx.fillStyle = G.bg || "#e9e4ff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(43,45,110,.06)";
    for (let y = 12; y < H; y += 26) for (let x = 12 + ((y / 26) % 2) * 13; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
    const rects = layout();
    for (const r of rects) drawPanel(ctx, r);
    if (!rects.length) label(ctx, "다른 사람의 판을 기다리는 중…", W / 2, H / 2, 26, "#2b2d6e");
    if (phase === "count") {
      const c = Math.ceil(count - 0.2);
      label(ctx, c >= 1 ? String(Math.min(3, c)) : "시작!", W / 2, H / 2 + 20, 110, "#ff5d73", "#fff");
    }
    if (kind === "online" && !seats.some((s) => s.kind === "me")) label(ctx, "관전 중 — 다음 판에 참가해요", W / 2, 30, 20, "#2b2d6e");
    else if (phase === "over") {
      const f = focus(), wn = bySlot(winner);
      const msg = kind === "local" || !f || !f.board ? `${wn ? wn.name : "무승부"} 승리!` : winner === f.slot ? "이겼다!" : "아쉽다, 졌어요";
      label(ctx, msg, W / 2, 46, 40, "#ff5d73", "#fff");
    }
  }

  const stopLoop = makeLoop(tick, draw);

  return {
    onNet(msg) {
      if (msg[0] !== "b") return;
      const sender = +msg[1];
      let d; try { d = JSON.parse(msg.slice(2)); } catch { return; }
      const viaHost = d.a != null && sender === hostSlot();
      const slot = viaHost ? d.a : sender;
      if (d.t === "s") {
        let s = bySlot(slot);
        if (!s) {
          const pl = room.players.find((p) => p.slot === slot);
          s = mk(slot, "remote", viaHost || !pl ? BOT_NAMES[slot % 4] : pl.name, parseLook(pl && !viaHost ? pl.look : "", slot), false);
          s.isBot = viaHost; seats.sort((a, b) => a.slot - b.slot);
        }
        if (s.kind === "remote") { try { s.view = G.decode(d.d); s.pending = d.p | 0; } catch {} }
      } else if (d.t === "a") {
        const target = bySlot(d.to);
        if (target && target.board && target.alive && d.n > 0 && d.n < 200) { G.attackIn(target.board, d.n | 0); target.hit = 0.45; }
      } else if (d.t === "d") {
        const s = bySlot(slot); if (s && s.kind === "remote") s.alive = false;
      } else if (d.t === "o") setOver(d.w);
    },
    setRoom(r) {
      const hostChanged = room && r.host !== room.host;
      room = r;
      for (const s of seats) {
        if (s.kind !== "remote") continue;
        if (s.isBot) { if (hostChanged) s.alive = false; }       // 봇을 돌리던 방장이 나갔다
        else if (!r.players.some((p) => p.slot === s.slot)) s.alive = false;
      }
    },
    stop() { stopLoop(); kb.stop(); pad.stop(); },
    peek() { return { phase, seats: seats.map((s) => ({ slot: s.slot, kind: s.kind, alive: s.alive, filled: (s.board ? G.view(s.board) : s.view).g.replace(/0/g, "").length })) }; },
  };
}
