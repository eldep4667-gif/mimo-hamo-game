import { describe, expect, it } from 'vitest';
import { answersMatch, clampMotion, makeRoomCode } from './roomRules.js';

const player = { id: 'p1', displayName: 'Mimo', character: 'mimo' as const, color: '#ffffff', emoji: '❤️', x: 100, y: 100, angle: 0, connected: true, speaking: false };

describe('room rules', () => {
  it('creates private-looking room codes', () => expect(makeRoomCode(() => 0)).toBe('MAHMIHOO-MAYADA-AAAAAA'));
  it('rejects impossible movement', () => expect(clampMotion(player, { x: 1000, y: 1000, angle: 0 }, 30)).toBeNull());
  it('accepts nearby, bounded movement', () => expect(clampMotion(player, { x: 125, y: 108, angle: 0 }, 60)).toMatchObject({ x: 125, y: 108 }));
  it('requires both answers to match', () => {
    expect(answersMatch({ a: 'beach', b: 'beach' }, ['a', 'b'])).toBe(true);
    expect(answersMatch({ a: 'beach', b: 'garden' }, ['a', 'b'])).toBe(false);
  });
});
