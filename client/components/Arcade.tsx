import type { GameKind, GameState } from '../../shared/types.js';

const PLAYABLE: Array<{ kind: GameKind; icon: string; title: string; text: string; reward: string }> = [
  { kind: 'heart-catcher', icon: '❤️', title: 'Heart Catcher', text: 'Move through the garden and collect hearts together. Gold hearts need both of you.', reward: '+10–25' },
  { kind: 'couple-memory', icon: '💕', title: 'Couple Memory', text: 'Choose your answer in secret. A matching choice makes a combo heart.', reward: '+75' },
  { kind: 'who-knows', icon: '💌', title: 'Who Knows Who?', text: 'Answer sweet questions at the same time and see how well you know each other.', reward: '+75' },
  { kind: 'heart-sync', icon: '💖', title: 'Heart Sync', text: 'Tap together within one heartbeat for a perfect LOVE SYNC.', reward: '+100' },
  { kind: 'rose-garden', icon: '🌹', title: 'Rose Garden', text: 'Give the rose sunlight and water. It blooms only when you cooperate.', reward: '+125' },
  { kind: 'draw-together', icon: '🎨', title: 'Draw Together', text: 'Make a little masterpiece at the exact same time.', reward: '+50' }
];

export function Arcade({ game, onPlay, onClose }: { game: GameState; onPlay(kind: GameKind): void; onClose(): void }) {
  return <section className="arcade-overlay" role="dialog" aria-modal="true" aria-label="محاميحو & ميادة Arcade">
    <div className="arcade-sheet"><button className="close" onClick={onClose}>×</button><p className="eyebrow">Six playable little adventures</p><h2>محاميحو & ميادة Arcade <span>♥</span></h2><p className="arcade-intro">Choose a game together. Points and memories are recorded in your shared world.</p>
      <div className="game-grid">{PLAYABLE.map((item) => <article className={`game-card ${game.kind === item.kind ? 'active' : ''}`} key={item.kind}><span className="game-icon">{item.icon}</span><div><h3>{item.title}</h3><p>{item.text}</p><small>Two players · {item.reward} love points</small></div><button className="primary" onClick={() => onPlay(item.kind)}>{game.kind === item.kind ? 'Playing now' : 'Play together'}</button></article>)}</div>
      <p className="arcade-footer">The next chapter will grow this arcade into twenty adventures—these six are already live, synced, and playable now.</p>
    </div>
  </section>;
}
