import type { PlayerSession, ProfileDraft } from '../../shared/types.js';

const PROFILE_KEY = 'little-world-profile';
const SESSION_KEY = 'little-world-session';

export type SavedSession = PlayerSession & { code: string };

export function loadProfile(): ProfileDraft | null {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as ProfileDraft | null; } catch { return null; }
}
export function saveProfile(profile: ProfileDraft) { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
export function loadSession(code?: string): SavedSession | null {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as SavedSession | null;
    return session && (!code || session.code === code) ? session : null;
  } catch { return null; }
}
export function saveSession(session: SavedSession) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
