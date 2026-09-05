import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { generateText, gateway } from 'ai';
import { Server, type Socket } from 'socket.io';
import type { ChatMessage, GameKind, MemoryCard, PlayerPublic, PlayerSession, ProfileDraft, RoomSnapshot } from '../shared/types.js';
import { canCollectHeart, emptyGame, makeHeart, resolveAnswer, startGame } from './game.js';
import { clampMotion, makeRoomCode, sanitizeCode, sanitizeProfile } from './roomRules.js';
import { Store } from './store.js';

type RuntimePlayer = PlayerPublic & { resumeToken: string; socketId?: string; lastMoveAt: number };
type RuntimeRoom = {
  code: string; players: Map<string, RuntimePlayer>; messages: ChatMessage[]; memories: MemoryCard[];
  lovePoints: number; unlocked: string[]; game: ReturnType<typeof emptyGame>; heartTimer?: NodeJS.Timeout;
  crystalCollected: boolean;
};
type Ack = (response: { ok: boolean; error?: string; snapshot?: RoomSnapshot; session?: PlayerSession; inviteUrl?: string }) => void;

const PORT = Number(process.env.PORT ?? 3001);
const databasePath = resolve(process.env.DATABASE_PATH ?? './data/little-world.sqlite');
const originList = (process.env.CLIENT_ORIGIN ?? '').split(',').map((item) => item.trim()).filter(Boolean);

export function createRealtimeServer(options: { databasePath?: string; origins?: string[] } = {}) {
  const store = new Store(options.databasePath ?? databasePath);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(cors({ origin: options.origins ?? originList, credentials: false }));
  app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'our-little-world' }));
  app.get('/api/config', (_request, response) => response.json({ stunUrl: process.env.VITE_STUN_URL ?? 'stun:stun.l.google.com:19302' }));
  app.post('/api/love-ai', async (request, response) => {
    const message = typeof request.body?.message === 'string' ? request.body.message.trim().slice(0, 500) : '';
    if (!message) return response.status(400).json({ error: 'A message is required.' });
    try {
      const result = await generateText({
        model: gateway('anthropic/claude-sonnet-4.6'),
        system: 'You are Love AI Companion for Mahmihoo and Mayada. Reply warmly in 2 concise sentences, offer one practical long-distance relationship idea, and never claim to be a human.',
        prompt: message
      });
      return response.json({ reply: result.text });
    } catch {
      return response.status(503).json({ error: 'Love AI is resting. Try again in a moment.' });
    }
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || (options.origins ?? originList).length === 0 || (options.origins ?? originList).includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed'));
      },
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20_000
  });
  const rooms = new Map<string, RuntimeRoom>();
  const rateWindows = new Map<string, { startedAt: number; count: number }>();

  function loadRoom(code: string): RuntimeRoom | null {
    const existing = rooms.get(code);
    if (existing) return existing;
    const stored = store.loadRoom(code);
    if (!stored) return null;
    const room: RuntimeRoom = {
      code, lovePoints: stored.lovePoints, unlocked: stored.unlocked, messages: stored.messages, memories: stored.memories,
      players: new Map(stored.players.map((player) => [player.id, { ...player, connected: false, speaking: false, lastMoveAt: Date.now() }])),
      game: emptyGame(), crystalCollected: stored.memories.some((memory) => memory.title === 'The Heart Crystal')
    };
    rooms.set(code, room);
    return room;
  }

  function snapshot(room: RuntimeRoom): RoomSnapshot {
    return {
      code: room.code,
      players: [...room.players.values()].map(({ resumeToken: _token, socketId: _socket, lastMoveAt: _lastMove, ...player }) => player),
      messages: room.messages.slice(-60), lovePoints: room.lovePoints, unlocked: room.unlocked, memories: room.memories.slice(0, 24), game: room.game,
      adventure: { crystalCollected: room.crystalCollected }
    };
  }

  function broadcastSnapshot(room: RuntimeRoom) { io.to(room.code).emit('room:snapshot', snapshot(room)); }

  function roomFor(socket: Socket): RuntimeRoom | null {
    const code = socket.data.roomCode as string | undefined;
    return code ? rooms.get(code) ?? null : null;
  }

  function playerFor(socket: Socket, room: RuntimeRoom): RuntimePlayer | null {
    const id = socket.data.playerId as string | undefined;
    return id ? room.players.get(id) ?? null : null;
  }

  function withinRate(socket: Socket, event: string, max: number, periodMs: number) {
    const key = `${socket.id}:${event}`;
    const current = rateWindows.get(key) ?? { startedAt: Date.now(), count: 0 };
    if (Date.now() - current.startedAt > periodMs) { current.startedAt = Date.now(); current.count = 0; }
    current.count += 1;
    rateWindows.set(key, current);
    return current.count <= max;
  }

  function addMemory(room: RuntimeRoom, title: string, message: string) {
    const memory = { id: crypto.randomUUID(), title, message, createdAt: Date.now() };
    room.memories.unshift(memory);
    store.addMemory(room.code, memory);
    return memory;
  }

  function award(room: RuntimeRoom, points: number, title?: string, message?: string) {
    room.lovePoints += points;
    store.addPoints(room.code, points);
    if (title && message) addMemory(room, title, message);
    const unlocks: Array<[number, string]> = [[300, 'rose-garden'], [800, 'moon-lake'], [1600, 'dream-beach'], [3000, 'magical-forest']];
    unlocks.forEach(([threshold, slug]) => {
      if (room.lovePoints >= threshold && !room.unlocked.includes(slug)) room.unlocked = store.unlock(room.code, slug);
    });
  }

  function stopHeartTimer(room: RuntimeRoom) { if (room.heartTimer) clearInterval(room.heartTimer); room.heartTimer = undefined; }

  function beginGame(room: RuntimeRoom, kind: GameKind) {
    stopHeartTimer(room);
    room.game = startGame(kind);
    if (kind === 'heart-catcher') {
      room.heartTimer = setInterval(() => {
        if (room.game.kind !== 'heart-catcher') return stopHeartTimer(room);
        if (room.game.hearts.length < 18) room.game.hearts.push(makeHeart());
        broadcastSnapshot(room);
      }, 2_200);
    }
  }

  function attach(socket: Socket, room: RuntimeRoom, player: RuntimePlayer) {
    if (player.socketId && player.socketId !== socket.id) io.sockets.sockets.get(player.socketId)?.disconnect(true);
    player.socketId = socket.id;
    player.connected = true;
    player.speaking = false;
    player.lastMoveAt = Date.now();
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    store.setConnection(player.id, true);
    io.to(room.code).emit('presence', { type: 'joined', playerId: player.id, name: player.displayName });
    broadcastSnapshot(room);
  }

  io.on('connection', (socket) => {
    socket.on('room:create', (raw: unknown, acknowledge?: Ack) => {
      if (!withinRate(socket, 'create', 3, 60_000)) return acknowledge?.({ ok: false, error: 'Please wait a moment before creating another room.' });
      const profile = sanitizeProfile(raw);
      if (!profile.ok) return acknowledge?.({ ok: false, error: profile.error });
      let code = makeRoomCode();
      while (store.roomExists(code)) code = makeRoomCode();
      store.createRoom(code);
      const room = loadRoom(code)!;
      const player = createPlayer(profile.value, 210, 420);
      room.players.set(player.id, player);
      store.addPlayer(player, room.code);
      attach(socket, room, player);
      acknowledge?.({ ok: true, snapshot: snapshot(room), session: sessionOf(player), inviteUrl: `${socket.handshake.headers.origin ?? ''}/join/${code}` });
    });

    socket.on('room:enter', (raw: unknown, acknowledge?: Ack) => {
      if (!withinRate(socket, 'enter', 8, 60_000) || !raw || typeof raw !== 'object') return acknowledge?.({ ok: false, error: 'Try again in a moment.' });
      const payload = raw as { code?: unknown; profile?: unknown; session?: Partial<PlayerSession> };
      const code = sanitizeCode(payload.code);
      const room = code ? loadRoom(code) : null;
      if (!room) return acknowledge?.({ ok: false, error: 'That room could not be found.' });
      const resume = payload.session;
      const existing = resume?.playerId ? room.players.get(resume.playerId) : undefined;
      if (existing && resume?.resumeToken === existing.resumeToken) {
        attach(socket, room, existing);
        return acknowledge?.({ ok: true, snapshot: snapshot(room), session: sessionOf(existing) });
      }
      if (existing || room.players.size >= 2) return acknowledge?.({ ok: false, error: 'This little world is already private for two.' });
      const profile = sanitizeProfile(payload.profile);
      if (!profile.ok) return acknowledge?.({ ok: false, error: profile.error });
      const player = createPlayer(profile.value, 850, 420);
      room.players.set(player.id, player);
      store.addPlayer(player, room.code);
      attach(socket, room, player);
      addMemory(room, `${player.displayName} joined ❤️`, 'The little world became a place for two.');
      broadcastSnapshot(room);
      acknowledge?.({ ok: true, snapshot: snapshot(room), session: sessionOf(player) });
    });

    socket.on('player:move', (raw: unknown) => {
      const room = roomFor(socket); if (!room || !withinRate(socket, 'move', 36, 1_000)) return;
      const player = playerFor(socket, room); if (!player) return;
      const next = clampMotion(player, raw, Date.now() - player.lastMoveAt); if (!next) return;
      Object.assign(player, next, { lastMoveAt: Date.now() });
      store.updateMotion(player);
      socket.to(room.code).emit('player:moved', { id: player.id, ...next });
    });

    socket.on('player:emote', (raw: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || typeof raw !== 'string' || raw.length > 24 || !withinRate(socket, 'emote', 6, 3_000)) return;
      player.emote = raw;
      store.updateMotion(player);
      io.to(room.code).emit('player:emote', { id: player.id, emote: raw });
    });

    socket.on('chat:send', (raw: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || typeof raw !== 'string' || !withinRate(socket, 'chat', 8, 10_000)) return;
      const text = raw.trim().slice(0, 500); if (!text) return;
      const message: ChatMessage = { id: crypto.randomUUID(), playerId: player.id, name: player.displayName, text, createdAt: Date.now() };
      room.messages.push(message); room.messages = room.messages.slice(-60); store.addMessage(room.code, message);
      io.to(room.code).emit('chat:message', message);
    });

    socket.on('chat:typing', (typing: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || typeof typing !== 'boolean' || !withinRate(socket, 'typing', 8, 3_000)) return;
      socket.to(room.code).emit('chat:typing', { playerId: player.id, typing });
    });

    socket.on('game:start', (kind: unknown) => {
      const room = roomFor(socket); if (!room || !withinRate(socket, 'gameStart', 4, 20_000)) return;
      if (!['heart-catcher', 'couple-memory', 'who-knows', 'heart-sync', 'rose-garden', 'draw-together'].includes(String(kind))) return;
      beginGame(room, kind as GameKind);
      io.to(room.code).emit('game:notice', { text: 'A new little adventure begins…' });
      broadcastSnapshot(room);
    });

    socket.on('game:heart:collect', (heartId: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || room.game.kind !== 'heart-catcher' || typeof heartId !== 'string' || !withinRate(socket, 'heart', 8, 2_000)) return;
      const heart = canCollectHeart(room.game, heartId, player.id, [...room.players.values()].filter((item) => item.connected));
      if (!heart) return;
      room.game.hearts = room.game.hearts.filter((item) => item.id !== heart.id);
      const points = heart.cooperative ? 25 : heart.value;
      award(room, points, heart.cooperative ? 'Perfect teamwork!' : 'A little heart collected', heart.cooperative ? 'Mahmihoo & Mayada reached a heart together.' : `${player.displayName} found a heart in the garden.`);
      io.to(room.code).emit('game:notice', { text: heart.cooperative ? '✨ Together! +25 hearts' : `❤️ +${points} love points` });
      broadcastSnapshot(room);
    });

    socket.on('game:answer', (answer: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || !room.game.question || typeof answer !== 'string' || !room.game.question.choices.includes(answer)) return;
      room.game.submissions[player.id] = answer;
      const connected = [...room.players.values()].filter((item) => item.connected);
      const match = connected.length === 2 ? resolveAnswer(room.game, connected) : null;
      if (match === null) { socket.emit('game:notice', { text: 'Answer saved — waiting for your other half…' }); return; }
      if (match) {
        award(room, 75, 'Two hearts, one answer', 'Mahmihoo & Mayada chose the same little dream.');
        io.to(room.code).emit('game:notice', { text: '✨ LOVE MATCH! +75 love points' });
      } else io.to(room.code).emit('game:notice', { text: 'Different answers — now you have something sweet to talk about.' });
      room.game.submissions = {};
      broadcastSnapshot(room);
    });

    socket.on('game:sync:tap', () => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || room.game.kind !== 'heart-sync' || !withinRate(socket, 'sync', 6, 3_000)) return;
      room.game.syncHits[player.id] = Date.now();
      const hits = Object.values(room.game.syncHits);
      if (hits.length === 2) {
        const perfect = Math.abs(hits[0] - hits[1]) <= 420;
        if (perfect) award(room, 100, 'Love Sync', 'Two taps landed as one heartbeat.');
        io.to(room.code).emit('game:notice', { text: perfect ? '✨ LOVE SYNC! +100 love points' : 'Almost! Try tapping closer together.' });
        room.game.syncHits = {};
        broadcastSnapshot(room);
      }
    });

    socket.on('game:rose:care', (action: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || room.game.kind !== 'rose-garden' || !['sunlight', 'water'].includes(String(action)) || !withinRate(socket, 'rose', 6, 3_000)) return;
      const rose = room.game.rose;
      if (action === 'sunlight') {
        if ((rose.sunlightPlayer && rose.sunlightPlayer !== player.id) || rose.waterPlayer === player.id) return;
        rose.sunlightPlayer ??= player.id; rose.sunlight = Math.min(5, rose.sunlight + 1);
      } else {
        if ((rose.waterPlayer && rose.waterPlayer !== player.id) || rose.sunlightPlayer === player.id) return;
        rose.waterPlayer ??= player.id; rose.water = Math.min(5, rose.water + 1);
      }
      if (!rose.grown && rose.sunlight >= 5 && rose.water >= 5) {
        rose.grown = true; award(room, 125, 'Our rose bloomed', 'Mahmihoo & Mayada grew something beautiful together.');
        io.to(room.code).emit('game:notice', { text: '🌹 Your magical rose bloomed! +125 love points' });
      }
      broadcastSnapshot(room);
    });

    socket.on('draw:stroke', (stroke: unknown) => {
      const room = roomFor(socket); if (!room || room.game.kind !== 'draw-together' || !withinRate(socket, 'stroke', 30, 1_000) || !isStroke(stroke)) return;
      socket.to(room.code).emit('draw:stroke', stroke);
    });
    socket.on('draw:clear', () => { const room = roomFor(socket); if (room?.game.kind === 'draw-together') io.to(room.code).emit('draw:clear'); });
    socket.on('draw:save', () => {
      const room = roomFor(socket); if (!room || room.game.kind !== 'draw-together' || !withinRate(socket, 'drawingSave', 2, 60_000)) return;
      addMemory(room, 'A drawing made together', 'A shared little masterpiece from Mahmihoo & Mayada.');
      award(room, 50);
      io.to(room.code).emit('game:notice', { text: '🎨 Your drawing is now a memory. +50 love points' }); broadcastSnapshot(room);
    });

    socket.on('adventure:crystal', () => {
      const room = roomFor(socket); if (!room || room.crystalCollected || !withinRate(socket, 'crystal', 4, 10_000)) return;
      const together = [...room.players.values()].filter((player) => player.connected);
      // The crystal is at the same shared coordinate in the 2D map and Three.js forest.
      if (together.length !== 2 || together.some((player) => Math.hypot(player.x - 600, player.y - 380) > 150)) return;
      room.crystalCollected = true; award(room, 500, 'The Heart Crystal', 'Together, Mahmihoo & Mayada brought light back to the magical forest.');
      room.unlocked = store.unlock(room.code, 'memory-castle');
      io.to(room.code).emit('game:notice', { text: '💎 Heart Crystal found together! +500 love points' }); broadcastSnapshot(room);
    });

    // Signalling only: audio media goes directly peer-to-peer through WebRTC.
    socket.on('voice:signal', (raw: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || !isSignal(raw) || !withinRate(socket, 'signal', 80, 10_000)) return;
      const recipient = room.players.get(raw.to);
      if (recipient?.socketId) io.to(recipient.socketId).emit('voice:signal', { from: player.id, data: raw.data });
    });
    socket.on('voice:ready', () => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (room && player) socket.to(room.code).emit('voice:ready', { playerId: player.id });
    });
    socket.on('voice:speaking', (speaking: unknown) => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || typeof speaking !== 'boolean' || !withinRate(socket, 'speaking', 10, 3_000)) return;
      player.speaking = speaking; socket.to(room.code).emit('voice:speaking', { playerId: player.id, speaking });
    });
    socket.on('voice:end', () => { const room = roomFor(socket); if (room) socket.to(room.code).emit('voice:end'); });

    socket.on('disconnect', () => {
      const room = roomFor(socket); const player = room ? playerFor(socket, room) : null;
      if (!room || !player || player.socketId !== socket.id) return;
      player.connected = false; player.speaking = false; player.socketId = undefined; store.setConnection(player.id, false);
      io.to(room.code).emit('presence', { type: 'left', playerId: player.id, name: player.displayName });
      broadcastSnapshot(room);
    });
  });

  const clientDist = resolve(fileURLToPath(new URL('../dist/client', import.meta.url)));
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_request, response) => response.sendFile(resolve(clientDist, 'index.html')));

  return { app, io, httpServer, store, close: () => { rooms.forEach(stopHeartTimer); io.close(); store.close(); } };
}

function createPlayer(profile: ProfileDraft, x: number, y: number): RuntimePlayer {
  return { id: crypto.randomUUID(), resumeToken: crypto.randomUUID(), ...profile, x, y, angle: 0, connected: false, speaking: false, lastMoveAt: Date.now() };
}
function sessionOf(player: RuntimePlayer): PlayerSession { return { playerId: player.id, resumeToken: player.resumeToken }; }
function isStroke(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as { points?: unknown; color?: unknown; width?: unknown };
  return Array.isArray(item.points) && item.points.length > 1 && item.points.length <= 100 && item.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((v) => typeof v === 'number' && v >= 0 && v <= 1200))
    && typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color) && typeof item.width === 'number' && item.width > 0 && item.width <= 40;
}
function isSignal(value: unknown): value is { to: string; data: unknown } {
  if (!value || typeof value !== 'object') return false;
  const item = value as { to?: unknown; data?: unknown };
  return typeof item.to === 'string' && item.to.length <= 64 && item.data !== undefined && JSON.stringify(item.data).length < 12_000;
}

if (process.env.VITEST !== 'true') {
  const realtime = createRealtimeServer();
  realtime.httpServer.listen(PORT, () => console.log(`Our Little World is listening on http://localhost:${PORT}`));
}
