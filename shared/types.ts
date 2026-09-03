export type Character = 'mimo' | 'hamougo';

export interface ProfileDraft {
  displayName: string;
  character: Character;
  color: string;
  emoji: string;
}

export interface PlayerPublic extends ProfileDraft {
  id: string;
  x: number;
  y: number;
  angle: number;
  emote?: string;
  connected: boolean;
  speaking: boolean;
}

export interface PlayerSession {
  playerId: string;
  resumeToken: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  createdAt: number;
}

export interface RoomSnapshot {
  code: string;
  players: PlayerPublic[];
  messages: ChatMessage[];
  lovePoints: number;
  unlocked: string[];
  memories: MemoryCard[];
  game: GameState;
  adventure: { crystalCollected: boolean };
}

export interface MemoryCard {
  id: string;
  title: string;
  message: string;
  createdAt: number;
}

export type GameKind = 'heart-catcher' | 'couple-memory' | 'who-knows' | 'heart-sync' | 'rose-garden' | 'draw-together';

export interface HeartItem {
  id: string;
  x: number;
  y: number;
  value: number;
  cooperative: boolean;
}

export interface GameState {
  kind: GameKind | null;
  hearts: HeartItem[];
  question?: { id: string; prompt: string; choices: string[] };
  submissions: Record<string, string>;
  syncHits: Record<string, number>;
  rose: { sunlight: number; water: number; grown: boolean; sunlightPlayer?: string; waterPlayer?: string };
  startedAt?: number;
}

export interface WorldMotion {
  x: number;
  y: number;
  angle: number;
  emote?: string;
}

export const GAME_CATALOG = [
  ['heart-catcher', '❤️ Heart Catcher', 'Catch falling hearts together.', '100'],
  ['couple-memory', '💕 Couple Memory', 'Make matching choices.', '75'],
  ['who-knows', '💌 Who Knows Who?', 'Answer at the same time.', '75'],
  ['heart-sync', '💖 Heart Sync', 'Tap in perfect harmony.', '100'],
  ['rose-garden', '🌹 Rose Garden', 'Balance sunlight and water.', '125'],
  ['draw-together', '🎨 Draw Together', 'Create a shared love note.', '50'],
  ['our-puzzle', '🧩 Our Puzzle', 'Coming in the next world update.', '150'],
  ['kiss-heart', '💋 Kiss the Heart', 'Coming in the next world update.', '100'],
  ['gift', '🎁 Secret Gift', 'Coming in the next world update.', '75'],
  ['treasure', '🗺️ Treasure Hunt', 'Coming in the next world update.', '125'],
  ['night-sky', '🌙 Night Sky', 'Coming in the next world update.', '100'],
  ['maze', '💗 Heart Maze', 'Coming in the next world update.', '150'],
  ['laugh', '😂 Make Mimo Laugh', 'Coming in the next world update.', '75'],
  ['compliment', '🥰 Compliment Battle', 'Coming in the next world update.', '50'],
  ['dare', '💞 Love Dare', 'Coming in the next world update.', '50'],
  ['story', '🧠 Our Story Quiz', 'Coming in the next world update.', '100'],
  ['rhythm', '🎵 Love Rhythm', 'Coming in the next world update.', '125'],
  ['race', '🏃 Couple Race', 'Coming in the next world update.', '125'],
  ['find-me', '🌌 Find Me', 'Coming in the next world update.', '100'],
  ['future', '💍 Our Future', 'Coming in the next world update.', '250']
] as const;
