import { io, type Socket } from 'socket.io-client';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { GameKind, PlayerSession, ProfileDraft, RoomSnapshot, WorldMotion } from '../shared/types.js';
import { Landing } from './components/Landing.js';
import type { WorldGameHandle } from './components/WorldGame.js';
import { VoiceCall } from './components/VoiceCall.js';
import { Chat } from './components/Chat.js';
import { Arcade } from './components/Arcade.js';
import { DrawingCanvas } from './components/DrawingCanvas.js';
import { loadSession, saveProfile, saveSession } from './lib/session.js';

type JoinResponse = { ok: boolean; error?: string; snapshot?: RoomSnapshot; session?: PlayerSession; inviteUrl?: string };
const WorldGame = lazy(async () => ({ default: (await import('./components/WorldGame.js')).WorldGame }));
const AdventureScene = lazy(async () => ({ default: (await import('./components/AdventureScene.js')).AdventureScene }));

export function App() {
  const socketRef = useRef<Socket | null>(null); const worldRef = useRef<WorldGameHandle>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null); const [selfId, setSelfId] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [toast, setToast] = useState('');
  const [arcadeOpen, setArcadeOpen] = useState(false); const [view, setView] = useState<'world' | 'adventure'>('world');
  const inviteCode = useMemo(() => parseInvite(location.pathname), []);
  const socket = useMemo(() => {
    const instance = io(import.meta.env.VITE_SOCKET_URL || undefined, { autoConnect: false, transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelayMax: 3_000 });
    socketRef.current = instance; return instance;
  }, []);

  useEffect(() => {
    const receiveSnapshot = (next: RoomSnapshot) => setSnapshot(next);
    const moved = ({ id, ...motion }: { id: string } & WorldMotion) => setSnapshot((current) => current ? { ...current, players: current.players.map((player) => player.id === id ? { ...player, ...motion } : player) } : current);
    const emote = ({ id, emote: value }: { id: string; emote: string }) => setSnapshot((current) => current ? { ...current, players: current.players.map((player) => player.id === id ? { ...player, emote: value } : player) } : current);
    const message = (notice: { text: string }) => setToast(notice.text);
    const presence = (event: { type: 'joined' | 'left'; name: string }) => setToast(event.type === 'joined' ? `${event.name} is here ❤️` : `${event.name} disconnected 💔`);
    const speaking = ({ playerId, speaking: active }: { playerId: string; speaking: boolean }) => setSnapshot((current) => current ? { ...current, players: current.players.map((player) => player.id === playerId ? { ...player, speaking: active } : player) } : current);
    socket.on('room:snapshot', receiveSnapshot); socket.on('player:moved', moved); socket.on('player:emote', emote); socket.on('game:notice', message); socket.on('presence', presence); socket.on('voice:speaking', speaking);
    socket.on('connect_error', () => setError('We could not reach the little world. Check that the server is running.'));
    return () => { socket.disconnect(); socket.removeAllListeners(); };
  }, [socket]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 4_500); return () => window.clearTimeout(timeout); }, [toast]);

  const enter = useCallback(async (event: 'room:create' | 'room:enter', payload: unknown) => {
    setBusy(true); setError('');
    try {
      const result = await new Promise<JoinResponse>((resolvePromise, reject) => {
        const send = () => socket.timeout(12_000).emit(event, payload, (timedOut: Error | null, response: JoinResponse) => timedOut ? reject(timedOut) : resolvePromise(response));
        if (socket.connected) send(); else { socket.once('connect', send); socket.connect(); }
      });
      if (!result.ok || !result.snapshot || !result.session) { setError(result.error ?? 'The invitation could not be opened.'); return; }
      setSnapshot(result.snapshot); setSelfId(result.session.playerId); saveSession({ ...result.session, code: result.snapshot.code });
      if (result.inviteUrl) setToast('Your private invitation link is ready below.');
    } catch { setError('The little world did not answer in time. Please try again.'); }
    finally { setBusy(false); }
  }, [socket]);

  function create(profile: ProfileDraft) { saveProfile(profile); void enter('room:create', profile); }
  function join(code: string, profile: ProfileDraft) { saveProfile(profile); void enter('room:enter', { code, profile, session: loadSession(code) }); }
  function move(motion: WorldMotion) {
    socket.emit('player:move', motion);
    setSnapshot((current) => current ? { ...current, players: current.players.map((player) => player.id === selfId ? { ...player, ...motion } : player) } : current);
  }
  function emote(value: string) { socket.emit('player:emote', value); }
  function startGame(kind: GameKind) { socket.emit('game:start', kind); setArcadeOpen(false); }

  if (!snapshot || !selfId) return <><Landing inviteCode={inviteCode} busy={busy} error={error} onCreate={create} onJoin={join} />{busy && <Loading />}</>;
  const self = snapshot.players.find((player) => player.id === selfId); if (!self) return <Loading />;
  const other = snapshot.players.find((player) => player.id !== selfId);
  const shareUrl = `${location.origin}/join/${snapshot.code}`;
  const copyInvite = () => {
    if (!navigator.clipboard) { setToast(`Share this code with Mimo: ${snapshot.code}`); return; }
    void navigator.clipboard.writeText(shareUrl).then(() => setToast('Invite link copied for Mayada ❤️')).catch(() => setToast(`Share this code with Mimo: ${snapshot.code}`));
  };
  return <main className="world-shell">
    <header className="world-header"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); setView('world'); }}><span>♥</span><b>محاميحو &amp; ميادة</b><small>OUR LITTLE WORLD</small></a><div className="room-code"><span>PRIVATE ROOM</span><b>{snapshot.code}</b><button onClick={copyInvite}>Copy invite</button></div><div className="header-actions"><button className={view === 'world' ? 'selected' : ''} onClick={() => setView('world')}>✦ World</button><button className={view === 'adventure' ? 'selected' : ''} onClick={() => setView('adventure')}>🌲 Adventure</button><button className="arcade-button" onClick={() => setArcadeOpen(true)}>Our Arcade <span>♥</span></button></div></header>
    {view === 'world' ? <section className="world-layout"><div className="game-stage"><Suspense fallback={<Loading />}><WorldGame ref={worldRef} snapshot={snapshot} selfId={selfId} onMove={move} onCollect={(id) => socket.emit('game:heart:collect', id)} onEmote={emote} /></Suspense><GamePrompt snapshot={snapshot} socket={socket} /><MobileControls game={worldRef} onEmote={(value) => worldRef.current?.emote(value)} /></div><aside className="world-sidebar"><LoveProgress points={snapshot.lovePoints} unlocked={snapshot.unlocked} /><MemoryWall memories={snapshot.memories} /><Chat socket={socket} messages={snapshot.messages} selfId={selfId} /></aside></section> : <Suspense fallback={<Loading />}><AdventureScene snapshot={snapshot} selfId={selfId} onMove={move} onCrystal={() => socket.emit('adventure:crystal')} onBack={() => setView('world')} /></Suspense>}
    <DrawingCanvas socket={socket} active={snapshot.game.kind === 'draw-together'} />
    <VoiceCall socket={socket} self={self} other={other} />
    {arcadeOpen && <Arcade game={snapshot.game} onPlay={startGame} onClose={() => setArcadeOpen(false)} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function GamePrompt({ snapshot, socket }: { snapshot: RoomSnapshot; socket: Socket }) {
  const { game } = snapshot; if (!game.kind) return <div className="game-hint glass"><span>✦</span><p>Explore together with <b>WASD / arrows</b>. On phone, use the controls below. Open <b>Our Arcade</b> whenever you’re ready for an adventure.</p></div>;
  if (game.kind === 'heart-catcher') return <div className="game-hint glass"><span>❤️</span><p><b>Heart Catcher</b><br />Move to the hearts. Gold hearts only unlock when both of you are close.</p></div>;
  if (game.kind === 'couple-memory' || game.kind === 'who-knows') return <div className="game-prompt glass"><p className="eyebrow">{game.kind === 'couple-memory' ? 'Couple Memory' : 'Who Knows Who?'}</p><h3>{game.question?.prompt}</h3><div>{game.question?.choices.map((choice) => <button key={choice} onClick={() => socket.emit('game:answer', choice)}>{choice}</button>)}</div><small>Answer is private until both of you choose.</small></div>;
  if (game.kind === 'heart-sync') return <div className="game-prompt glass"><p className="eyebrow">Heart Sync</p><h3>Count to three… and tap as one.</h3><button className="sync-heart" onClick={() => socket.emit('game:sync:tap')}>♥</button><small>Within 420ms unlocks LOVE SYNC.</small></div>;
  if (game.kind === 'rose-garden') return <div className="game-prompt glass"><p className="eyebrow">Rose Garden</p><h3>Help your rose bloom</h3><div className="rose-meter"><span>☀️ {game.rose.sunlight}/5</span><span>💧 {game.rose.water}/5</span></div><div><button onClick={() => socket.emit('game:rose:care', 'sunlight')}>Give sunlight</button><button onClick={() => socket.emit('game:rose:care', 'water')}>Give water</button></div><small>{game.rose.grown ? '🌹 It bloomed because of both of you.' : 'Each heart must take one role: sunlight or water.'}</small></div>;
  return <div className="game-hint glass"><span>🎨</span><p><b>Draw Together</b><br />Your shared canvas is open. Draw at the same time, then save the memory.</p></div>;
}

function LoveProgress({ points, unlocked }: { points: number; unlocked: string[] }) {
  const levels: Array<[number, string]> = [[0, 'Two Hearts'], [300, 'Growing Love'], [800, 'Unbreakable Bond'], [1600, 'Our Little Universe'], [3000, 'Forever Team']];
  const current = levels.filter(([threshold]) => points >= threshold).at(-1)!; const next = levels.find(([threshold]) => points < threshold);
  const percent = next ? Math.min(100, (points - current[0]) / (next[0] - current[0]) * 100) : 100;
  return <section className="progress-card glass"><div><span className="panel-kicker">Love level</span><h3>{current[1]}</h3></div><strong>♥ {points.toLocaleString()}</strong><div className="progress-track"><i style={{ width: `${percent}%` }} /></div><small>{next ? `${next[0] - points} hearts until ${next[1]}` : 'Your universe is glowing bright.'}</small><div className="unlock-list">{['garden', 'rose-garden', 'moon-lake', 'dream-beach', 'magical-forest', 'memory-castle'].map((item) => <span className={unlocked.includes(item) ? 'unlocked' : ''} key={item}>{unlocked.includes(item) ? '✦' : '◌'} {item.replaceAll('-', ' ')}</span>)}</div></section>;
}
function MemoryWall({ memories }: { memories: RoomSnapshot['memories'] }) {
  return <section className="memory-wall glass"><header><div><span className="panel-kicker">Kept forever</span><h3>Memory Wall</h3></div><span>♥</span></header>{memories.length ? <div>{memories.slice(0, 4).map((memory) => <article key={memory.id}><span>♥</span><p><b>{memory.title}</b><small>{memory.message}</small></p></article>)}</div> : <p className="empty-memory">Your first shared moment will appear here.</p>}</section>;
}
function MobileControls({ game, onEmote }: { game: RefObject<WorldGameHandle | null>; onEmote(value: string): void }) {
  const move = (x: number, y: number) => { game.current?.setDirection(x, y); };
  return <div className="mobile-controls"><div className="d-pad"><button onPointerDown={() => move(0, -1)} onPointerUp={() => move(0, 0)}>↑</button><button onPointerDown={() => move(-1, 0)} onPointerUp={() => move(0, 0)}>←</button><button onPointerDown={() => move(1, 0)} onPointerUp={() => move(0, 0)}>→</button><button onPointerDown={() => move(0, 1)} onPointerUp={() => move(0, 0)}>↓</button></div><div className="emote-pad"><button onClick={() => onEmote('❤️')}>♥</button><button onClick={() => onEmote('👋')}>👋</button><button onClick={() => onEmote('💃')}>✦</button></div></div>;
}
function Loading() { return <div className="loading"><div><i>♥</i><i>♥</i></div><p>Connecting two hearts…</p><small>Preparing your little world</small></div>; }
function parseInvite(path: string) { const match = path.match(/^\/join\/(MAHMIHOO-MAYADA-[A-Z0-9]{6})$/i); return match?.[1].toUpperCase(); }
