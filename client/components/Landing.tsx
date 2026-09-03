import { FormEvent, useMemo, useState } from 'react';
import type { Character, ProfileDraft } from '../../shared/types.js';
import { loadProfile } from '../lib/session.js';

interface LandingProps {
  inviteCode?: string;
  busy: boolean;
  error?: string;
  onCreate(profile: ProfileDraft): void;
  onJoin(code: string, profile: ProfileDraft): void;
}

export function Landing({ inviteCode, busy, error, onCreate, onJoin }: LandingProps) {
  const stored = useMemo(loadProfile, []);
  const [mode, setMode] = useState<'welcome' | 'create' | 'join'>(inviteCode ? 'join' : 'welcome');
  const [name, setName] = useState(stored?.displayName ?? (inviteCode ? 'Mimo' : 'Hamougo'));
  const [character, setCharacter] = useState<Character>(stored?.character ?? (inviteCode ? 'mimo' : 'hamougo'));
  const [color, setColor] = useState(stored?.color ?? (character === 'mimo' ? '#ef8dab' : '#7e86d8'));
  const [emoji, setEmoji] = useState(stored?.emoji ?? '❤️');
  const [code, setCode] = useState(inviteCode ?? '');
  const profile: ProfileDraft = { displayName: name, character, color, emoji };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'create') onCreate(profile);
    if (mode === 'join') onJoin(code, profile);
  };

  return <main className="landing-shell">
    <div className="star-field" aria-hidden="true" />
    <section className="landing-copy">
      <p className="eyebrow">A private place for two</p>
      <h1>MIMO <span>&amp;</span> HAMO</h1>
      <p className="landing-subtitle">Our Little World <b>♥</b></p>
      <p className="landing-note">Even when we’re far away, we can still meet here.</p>
      <div className="heart-orbit" aria-hidden="true"><i>♥</i><i>♥</i></div>
      {mode === 'welcome' && <div className="landing-actions">
        <button className="primary big" onClick={() => setMode('create')}>Create Our Room <span>♥</span></button>
        <button className="secondary big" onClick={() => setMode('join')}>Join Our Room <span>✉</span></button>
        <p>Made with love, for two people who are far apart.</p>
      </div>}
    </section>

    {mode !== 'welcome' && <form className="entry-card glass" onSubmit={submit}>
      <button className="back" type="button" onClick={() => setMode('welcome')}>← Back</button>
      <p className="eyebrow">{mode === 'create' ? 'Start a little world' : 'Your invitation awaits'}</p>
      <h2>{mode === 'create' ? 'Create Our Room' : 'Join Our Room'}</h2>
      <label>Your name<input maxLength={24} value={name} onChange={(event) => setName(event.target.value)} placeholder="Mimo or Hamougo" required /></label>
      <div className="character-choice">
        <button type="button" className={character === 'mimo' ? 'selected' : ''} onClick={() => { setCharacter('mimo'); setColor('#ef8dab'); }}>Mimo <span>🌙</span></button>
        <button type="button" className={character === 'hamougo' ? 'selected' : ''} onClick={() => { setCharacter('hamougo'); setColor('#7e86d8'); }}>Hamougo <span>☀️</span></button>
      </div>
      <div className="two-fields"><label>Glow color<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label>Favorite emoji<input value={emoji} maxLength={4} onChange={(event) => setEmoji(event.target.value)} /></label></div>
      {mode === 'join' && <label>Room code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="MIMO-HAMO-XXXXXX" required /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary big form-submit" disabled={busy}>{busy ? 'Opening the gate…' : mode === 'create' ? 'Create Our Room ♥' : 'Enter Our World ♥'}</button>
      <small>{mode === 'create' ? 'You’ll get a private invitation link to send to Mimo.' : 'Only two hearts can enter each room.'}</small>
    </form>}
  </main>;
}
