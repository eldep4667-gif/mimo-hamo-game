import type { PlayerPublic, WorldMotion } from '../shared/types.js';

export const WORLD = { width: 1200, height: 760, speedPerSecond: 390 } as const;

export function sanitizeProfile(input: unknown): { ok: true; value: { displayName: string; character: 'mimo' | 'hamougo'; color: string; emoji: string } } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Profile is required.' };
  const candidate = input as Record<string, unknown>;
  const displayName = typeof candidate.displayName === 'string' ? candidate.displayName.trim().slice(0, 24) : '';
  const character = candidate.character;
  const color = typeof candidate.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.color) ? candidate.color : '#e9729c';
  const emoji = typeof candidate.emoji === 'string' ? Array.from(candidate.emoji).slice(0, 2).join('') : '❤️';
  if (!displayName || !['mimo', 'hamougo'].includes(String(character))) return { ok: false, error: 'Choose a name and character.' };
  return { ok: true, value: { displayName, character: character as 'mimo' | 'hamougo', color, emoji: emoji || '❤️' } };
}

export function sanitizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^MIMO-HAMO-[A-Z0-9]{6}$/.test(code) ? code : null;
}

export function clampMotion(previous: PlayerPublic, candidate: unknown, elapsedMs: number): WorldMotion | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const input = candidate as Record<string, unknown>;
  if (![input.x, input.y, input.angle].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const x = Math.max(20, Math.min(WORLD.width - 20, input.x as number));
  const y = Math.max(40, Math.min(WORLD.height - 35, input.y as number));
  const distance = Math.hypot(x - previous.x, y - previous.y);
  const maximum = Math.max(42, (Math.max(0, elapsedMs) / 1000) * WORLD.speedPerSecond + 28);
  if (distance > maximum) return null;
  const emote = typeof input.emote === 'string' ? input.emote.slice(0, 24) : undefined;
  return { x, y, angle: input.angle as number, emote };
}

export function answersMatch(submissions: Record<string, string>, playerIds: string[]): boolean {
  if (playerIds.length !== 2 || playerIds.some((id) => !submissions[id])) return false;
  return submissions[playerIds[0]] === submissions[playerIds[1]];
}

export function makeRoomCode(random = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let index = 0; index < 6; index += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `MIMO-HAMO-${suffix}`;
}
