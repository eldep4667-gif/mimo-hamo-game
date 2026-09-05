import { useMemo, useState } from 'react';

const CHALLENGES = [
  { title: 'Say one true thing', detail: 'Share something you appreciate about each other.', reward: 25 },
  { title: 'Visit the moon lake', detail: 'Explore the world together for one minute.', reward: 40 },
  { title: 'Make a tiny memory', detail: 'Leave a note on your Memory Wall.', reward: 60 },
];

export function ProfileHub({ name, points, unlocked }: { name: string; points: number; unlocked: string[] }) {
  const [completed, setCompleted] = useState<string[]>([]);
  const level = useMemo(() => points < 300 ? 'Two Hearts' : points < 800 ? 'Growing Love' : points < 1600 ? 'Unbreakable Bond' : 'Our Little Universe', [points]);
  return <section className="profile-hub glass" aria-label="Love progress">
    <div className="profile-heading"><div className="avatar-orbit" aria-hidden="true"><span>♥</span></div><div><span className="panel-kicker">Today in your world</span><h2>{name}&apos;s love journal</h2><p>{level} · {points.toLocaleString()} shared hearts</p></div></div>
    <div className="profile-stats"><div><strong>{unlocked.length}</strong><span>places unlocked</span></div><div><strong>{completed.length}/3</strong><span>today&apos;s quests</span></div><div><strong>7</strong><span>day streak</span></div></div>
    <div className="challenge-list"><div className="section-heading"><div><span className="panel-kicker">A little ritual</span><h3>Daily challenges</h3></div><span className="streak-badge">STREAK 7</span></div>{CHALLENGES.map((challenge) => { const done = completed.includes(challenge.title); return <button className={`challenge ${done ? 'complete' : ''}`} key={challenge.title} onClick={() => setCompleted((current) => done ? current.filter((item) => item !== challenge.title) : [...current, challenge.title])}><span className="challenge-mark">{done ? '✓' : '○'}</span><span><b>{challenge.title}</b><small>{challenge.detail}</small></span><strong>+{challenge.reward}</strong></button>; })}</div>
  </section>;
}

export function Achievements({ points }: { points: number }) {
  const badges = [['First hello', 'Entered your shared world'], ['Heart keeper', `${points} hearts collected`], ['In sync', 'Played a game together']];
  return <section className="achievement-strip glass"><span className="panel-kicker">Keepsakes</span><h3>Achievements</h3><div>{badges.map(([title, detail], index) => <article key={title} className={points > index * 300 ? 'earned' : ''}><span>{points > index * 300 ? '✦' : '○'}</span><b>{title}</b><small>{detail}</small></article>)}</div></section>;
}
