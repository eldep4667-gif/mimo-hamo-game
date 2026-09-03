import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatMessage, MemoryCard, PlayerPublic } from '../shared/types.js';

type RoomRow = { code: string; created_at: number; love_points: number; unlocked: string };
type PlayerRow = {
  id: string; room_code: string; resume_token: string; display_name: string; character: 'mimo' | 'hamougo';
  color: string; emoji: string; x: number; y: number; angle: number; emote: string | null; connected: number;
};

export interface StoredRoom {
  code: string;
  lovePoints: number;
  unlocked: string[];
  players: Array<PlayerPublic & { resumeToken: string }>;
  messages: ChatMessage[];
  memories: MemoryCard[];
}

/** SQLite is intentionally behind this small repository so it can be replaced with Postgres later. */
export class Store {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY, created_at INTEGER NOT NULL, love_points INTEGER NOT NULL DEFAULT 0,
        unlocked TEXT NOT NULL DEFAULT '["garden"]'
      ) STRICT;
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY, room_code TEXT NOT NULL, resume_token TEXT NOT NULL,
        display_name TEXT NOT NULL, character TEXT NOT NULL, color TEXT NOT NULL, emoji TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, angle REAL NOT NULL DEFAULT 0, emote TEXT,
        connected INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(room_code) REFERENCES rooms(code)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_code);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, room_code TEXT NOT NULL, player_id TEXT NOT NULL, name TEXT NOT NULL,
        text TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_code, created_at);
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, room_code TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_memories_room ON memories(room_code, created_at);
    `);
  }

  close() { this.db.close(); }

  createRoom(code: string) {
    this.db.prepare('INSERT INTO rooms(code, created_at) VALUES (?, ?)').run(code, Date.now());
  }

  roomExists(code: string) { return Boolean(this.db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)); }

  loadRoom(code: string): StoredRoom | null {
    const room = this.db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined;
    if (!room) return null;
    const rows = this.db.prepare('SELECT * FROM players WHERE room_code = ?').all(code) as PlayerRow[];
    const players = rows.map((row) => ({
      id: row.id, resumeToken: row.resume_token, displayName: row.display_name, character: row.character,
      color: row.color, emoji: row.emoji, x: row.x, y: row.y, angle: row.angle, emote: row.emote ?? undefined,
      connected: Boolean(row.connected), speaking: false
    }));
    const messages = this.db.prepare('SELECT * FROM messages WHERE room_code = ? ORDER BY created_at DESC LIMIT 60').all(code)
      .reverse().map((row: unknown) => {
        const item = row as { id: string; player_id: string; name: string; text: string; created_at: number };
        return { id: item.id, playerId: item.player_id, name: item.name, text: item.text, createdAt: item.created_at };
      });
    const memories = this.db.prepare('SELECT * FROM memories WHERE room_code = ? ORDER BY created_at DESC LIMIT 24').all(code)
      .map((row: unknown) => {
        const item = row as { id: string; title: string; message: string; created_at: number };
        return { id: item.id, title: item.title, message: item.message, createdAt: item.created_at };
      });
    return { code, lovePoints: room.love_points, unlocked: safeArray(room.unlocked), players, messages, memories };
  }

  addPlayer(player: PlayerPublic & { resumeToken: string }, code: string) {
    this.db.prepare(`INSERT INTO players(id, room_code, resume_token, display_name, character, color, emoji, x, y, angle, emote, connected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(player.id, code, player.resumeToken, player.displayName, player.character, player.color, player.emoji, player.x, player.y, player.angle, player.emote ?? null, Number(player.connected));
  }

  setConnection(id: string, connected: boolean) { this.db.prepare('UPDATE players SET connected = ? WHERE id = ?').run(Number(connected), id); }
  setSpeaking(id: string, speaking: boolean) { void id; void speaking; }
  updateMotion(player: PlayerPublic) {
    this.db.prepare('UPDATE players SET x = ?, y = ?, angle = ?, emote = ? WHERE id = ?')
      .run(player.x, player.y, player.angle, player.emote ?? null, player.id);
  }
  addPoints(code: string, points: number) { this.db.prepare('UPDATE rooms SET love_points = love_points + ? WHERE code = ?').run(points, code); }
  unlock(code: string, slug: string) {
    const row = this.db.prepare('SELECT unlocked FROM rooms WHERE code = ?').get(code) as { unlocked: string } | undefined;
    const unlocked = new Set(safeArray(row?.unlocked ?? '[]'));
    unlocked.add(slug);
    this.db.prepare('UPDATE rooms SET unlocked = ? WHERE code = ?').run(JSON.stringify([...unlocked]), code);
    return [...unlocked];
  }
  addMessage(code: string, message: ChatMessage) {
    this.db.prepare('INSERT INTO messages(id, room_code, player_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(message.id, code, message.playerId, message.name, message.text, message.createdAt);
  }
  addMemory(code: string, memory: MemoryCard) {
    this.db.prepare('INSERT INTO memories(id, room_code, title, message, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(memory.id, code, memory.title, memory.message, memory.createdAt);
  }
}

function safeArray(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; }
  catch { return []; }
}
