import type { GameKind, GameState } from '../../shared/types.js';

const PLAYABLE: Array<{ kind: GameKind; icon: string; title: string; text: string; reward: string; category: string }> = [
  { kind: 'heart-catcher', icon: '01', category: 'Explore', title: 'Heart Catcher', text: 'Roam the valley and collect the lights that appear between you. Golden hearts ask for both players.', reward: '+10–25' },
  { kind: 'couple-memory', icon: '02', category: 'Remember', title: 'Couple Memory', text: 'Private answers become a shared story when the two of you choose the same detail.', reward: '+75' },
  { kind: 'who-knows', icon: '03', category: 'Know each other', title: 'Who Knows Who?', text: 'A quiet set of questions about the person beside you. Compare answers after the reveal.', reward: '+75' },
  { kind: 'heart-sync', icon: '04', category: 'Connect', title: 'Heart Sync', text: 'Find the same rhythm. Tap together within one heartbeat to light the bridge.', reward: '+100' },
  { kind: 'rose-garden', icon: '05', category: 'Care', title: 'Rose Garden', text: 'Share the work of growing something beautiful. One gives light, one gives water.', reward: '+125' },
  { kind: 'draw-together', icon: '06', category: 'Create', title: 'Draw Together', text: 'Two cursors, one canvas, no undo. Save the result as a memory of tonight.', reward: '+50' }
];

export function Arcade({ game, onPlay, onClose }: { game: GameState; onPlay(kind: GameKind): void; onClose(): void }) {
  return <section className="arcade-overlay" role="dialog" aria-modal="true" aria-label="محاميحو & ميادة Arcade">
    <div className="arcade-sheet"><button className="close" onClick={onClose}>×</button><p className="eyebrow">Six playable little adventures</p><h2>محاميحو & ميادة Arcade <span>♥</span></h2><p className="arcade-intro">Choose a game together. Points and memories are recorded in your shared world.</p>
      <div className="game-grid">{PLAYABLE.map((item) => <article className={`game-card ${game.kind === item.kind ? 'active' : ''}`} key={item.kind}><span className="game-icon">{item.icon}</span><div><small className="game-category">{item.category}</small><h3>{item.title}</h3><p>{item.text}</p><small>Two players · {item.reward} love points</small></div><button className="primary" onClick={() => onPlay(item.kind)}>{game.kind === item.kind ? 'Playing now' : 'Play together'}</button></article>)}</div>
      <p className="arcade-footer">The next chapter will grow this arcade into twenty adventures—these six are already live, synced, and playable now.</p>
    </div>
  </section>;
}
