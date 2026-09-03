import type { GameKind, GameState, HeartItem, PlayerPublic } from '../shared/types.js';
import { answersMatch } from './roomRules.js';

const QUESTIONS = [
  { id: 'date', prompt: 'Where would Hamougo take Mimo on a perfect date?', choices: ['A sunset picnic', 'An arcade', 'A moonlit beach'] },
  { id: 'comfort', prompt: 'What makes Mimo happiest after a long day?', choices: ['A sweet message', 'A surprise gift', 'A funny story'] },
  { id: 'future', prompt: 'Which little dream should we do together first?', choices: ['Travel somewhere new', 'Make a cozy home', 'Watch the stars'] }
];

export function emptyGame(): GameState {
  return { kind: null, hearts: [], submissions: {}, syncHits: {}, rose: { sunlight: 0, water: 0, grown: false } };
}

export function startGame(kind: GameKind): GameState {
  const game = emptyGame();
  game.kind = kind;
  game.startedAt = Date.now();
  if (kind === 'couple-memory' || kind === 'who-knows') game.question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  if (kind === 'heart-catcher') game.hearts = Array.from({ length: 8 }, () => makeHeart());
  return game;
}

export function makeHeart(): HeartItem {
  return {
    id: crypto.randomUUID(),
    x: 80 + Math.random() * 1040,
    y: 100 + Math.random() * 520,
    value: 10,
    cooperative: Math.random() > 0.72
  };
}

export function canCollectHeart(game: GameState, heartId: string, collectorId: string, players: PlayerPublic[]) {
  const heart = game.hearts.find((item) => item.id === heartId);
  const collector = players.find((player) => player.id === collectorId);
  if (!heart || !collector) return null;
  if (Math.hypot(collector.x - heart.x, collector.y - heart.y) > 78) return null;
  if (heart.cooperative && players.some((player) => Math.hypot(player.x - heart.x, player.y - heart.y) > 190)) return null;
  return heart;
}

export function resolveAnswer(game: GameState, players: PlayerPublic[]) {
  const ids = players.map((player) => player.id);
  if (Object.keys(game.submissions).length < ids.length) return null;
  return answersMatch(game.submissions, ids);
}
