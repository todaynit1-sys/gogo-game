// 한판 오락실 서버
// - Room  : 방 하나당 하나. 최대 4명의 WebSocket 을 받아 중계만 한다(게임 계산은 방장 브라우저가 맡는다).
// - Lobby : 전체에 하나. 열린 방 목록(빠른 대전)과 접속자 수를 들고 있다.
// 저장하는 개인정보 없음. 방은 사람이 다 나가면 사라진다.
import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS = 4;
const GAMES = ["volley"];
const CODE_RE = /^[A-Z]{4}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // 헷갈리는 I, O 제외

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}

function cleanName(raw) {
  const s = String(raw || "")
    .replace(/[\u0000-\u001f<>&"'`]/g, "")
    .trim()
    .slice(0, 10);
  return s || "손님" + Math.floor(10 + Math.random() * 90);
}

function lobbyStub(env) {
  return env.LOBBY.get(env.LOBBY.idFromName("lobby"));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p.startsWith("/ws/")) {
      const code = p.slice(4).toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "websocket only" }, 426);
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
    }
    if (p === "/api/quick" || p === "/api/new" || p === "/api/stats") {
      return lobbyStub(env).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ───────────────────────── Room ─────────────────────────
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.meta = null;
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get("meta")) || null;
    });
    // 'ping' 에는 방을 깨우지 않고 자동으로 'pong' (요금·부하 절약)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  sockets(except) {
    return this.ctx.getWebSockets().filter((w) => w !== except);
  }

  players(except) {
    return this.sockets(except)
      .map((w) => w.deserializeAttachment())
      .filter(Boolean)
      .sort((a, b) => a.slot - b.slot);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.pathname.slice(4).toUpperCase();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const current = this.players();
    if (current.length >= MAX_PLAYERS) {
      server.accept();
      server.send(JSON.stringify({ t: "full" }));
      server.close(4001, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    if (!this.meta || current.length === 0) {
      const game = GAMES.includes(url.searchParams.get("game")) ? url.searchParams.get("game") : GAMES[0];
      this.meta = { code, game, mode: 0, phase: "lobby", host: 0, pub: url.searchParams.get("pub") === "1", seq: 0 };
    }
    const used = new Set(current.map((x) => x.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const id = ++this.meta.seq;
    const me = { id, slot, name: cleanName(url.searchParams.get("name")) };
    if (current.length === 0) this.meta.host = id;

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    await this.save();
    this.broadcastRoom();
    return new Response(null, { status: 101, webSocket: client });
  }

  async save() {
    await this.ctx.storage.put("meta", this.meta);
    this.report();
  }

  // 로비에 방 상태 알리기 (실패해도 게임에는 지장 없음)
  report(gone = false) {
    if (!this.meta) return;
    const body = gone
      ? { code: this.meta.code, gone: true }
      : { code: this.meta.code, game: this.meta.game, n: this.players().length, phase: this.meta.phase, pub: this.meta.pub };
    this.ctx.waitUntil(
      lobbyStub(this.env)
        .fetch("https://lobby/update", { method: "POST", body: JSON.stringify(body) })
        .catch(() => {})
    );
  }

  broadcastRoom(except) {
    const players = this.players(except);
    const m = this.meta;
    for (const w of this.sockets(except)) {
      const a = w.deserializeAttachment();
      if (!a) continue;
      try {
        w.send(JSON.stringify({ t: "room", code: m.code, game: m.game, mode: m.mode, phase: m.phase, host: m.host, pub: m.pub, you: a.id, players }));
      } catch {}
    }
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > 6000 || !this.meta) return;
    const me = ws.deserializeAttachment();
    if (!me) return;
    const isHost = me.id === this.meta.host;
    const c = msg[0];

    // 's…' 방장이 보내는 게임 상태 → 나머지 모두에게 그대로 전달
    if (c === "s") {
      if (!isHost) return;
      for (const w of this.sockets(ws)) {
        try { w.send(msg); } catch {}
      }
      return;
    }
    // 'i…' 조작 입력 → 방장에게만 전달 (자리 번호를 붙여서)
    if (c === "i") {
      if (isHost || msg.length > 24) return;
      for (const w of this.sockets(ws)) {
        const a = w.deserializeAttachment();
        if (a && a.id === this.meta.host) {
          try { w.send("i" + me.slot + msg.slice(1)); } catch {}
          break;
        }
      }
      return;
    }
    if (c !== "{") return;
    let d;
    try { d = JSON.parse(msg); } catch { return; }

    if (d.t === "yield" && isHost) {
      // 방장 화면이 가려지면(탭 전환 등) 다른 사람에게 방장을 넘긴다
      const other = this.players(ws)[0];
      if (other) {
        this.meta.host = other.id;
        await this.save();
        this.broadcastRoom();
      }
      return;
    }
    if (!isHost) return;
    if (d.t === "set") {
      if (GAMES.includes(d.game)) this.meta.game = d.game;
      if ([0, 2, 4].includes(d.mode)) this.meta.mode = d.mode;
      if (typeof d.pub === "boolean") this.meta.pub = d.pub;
    } else if (d.t === "start") {
      this.meta.phase = "play";
    } else if (d.t === "end") {
      this.meta.phase = "lobby";
    } else return;
    await this.save();
    this.broadcastRoom();
  }

  async leave(ws) {
    if (!this.meta) return;
    const me = ws.deserializeAttachment();
    const rest = this.players(ws);
    if (rest.length === 0) {
      this.report(true);
      this.meta = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (me && me.id === this.meta.host) this.meta.host = rest[0].id;
    await this.ctx.storage.put("meta", this.meta);
    // 나간 소켓을 빼고 인원 보고
    this.ctx.waitUntil(
      lobbyStub(this.env)
        .fetch("https://lobby/update", {
          method: "POST",
          body: JSON.stringify({ code: this.meta.code, game: this.meta.game, n: rest.length, phase: this.meta.phase, pub: this.meta.pub }),
        })
        .catch(() => {})
    );
    this.broadcastRoom(ws);
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch {}
    await this.leave(ws);
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }
}

// ───────────────────────── Lobby ─────────────────────────
export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = {};
    ctx.blockConcurrencyWhile(async () => {
      this.rooms = (await ctx.storage.get("rooms")) || {};
    });
  }

  prune() {
    const old = Date.now() - 6 * 3600 * 1000;
    for (const k in this.rooms) if (this.rooms[k].ts < old) delete this.rooms[k];
  }

  newCode() {
    for (let tries = 0; tries < 50; tries++) {
      let c = "";
      const r = crypto.getRandomValues(new Uint8Array(4));
      for (let i = 0; i < 4; i++) c += ALPHABET[r[i] % ALPHABET.length];
      if (!this.rooms[c]) return c;
    }
    return "ZZZZ";
  }

  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/update" && request.method === "POST") {
      const d = await request.json();
      if (d.gone) delete this.rooms[d.code];
      else this.rooms[d.code] = { game: d.game, n: d.n, phase: d.phase, pub: !!d.pub, ts: Date.now() };
      await this.ctx.storage.put("rooms", this.rooms);
      return json({ ok: true });
    }
    this.prune();
    if (p === "/api/stats") {
      let online = 0, rooms = 0;
      for (const k in this.rooms) { online += this.rooms[k].n; rooms++; }
      return json({ online, rooms });
    }
    if (p === "/api/new") return json({ code: this.newCode(), fresh: true });
    if (p === "/api/quick") {
      const game = url.searchParams.get("game");
      let best = null;
      for (const k in this.rooms) {
        const r = this.rooms[k];
        if (!r.pub || r.game !== game || r.n >= MAX_PLAYERS || r.n < 1) continue;
        // 대기 중인 방 우선, 그다음 사람이 많은 방
        const score = (r.phase === "lobby" ? 10 : 0) + r.n;
        if (!best || score > best.score) best = { code: k, score };
      }
      if (best) return json({ code: best.code, fresh: false });
      return json({ code: this.newCode(), fresh: true });
    }
    return json({ error: "not found" }, 404);
  }
}
