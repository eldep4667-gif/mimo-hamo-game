import { FormEvent, useState } from 'react';

export function LoveCompanion() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('Ask me for a thoughtful date idea, a gentle message, or a way to feel close tonight.');
  const [busy, setBusy] = useState(false);
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    try { const result = await fetch('/api/love-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) }); const data = await result.json(); setReply(data.reply ?? data.error); setMessage(''); } catch { setReply('I could not reach the companion right now. Your own kind words are still the best magic.'); } finally { setBusy(false); }
  }
  return <section className="love-companion glass"><div className="companion-heading"><span className="companion-spark">✦</span><div><span className="panel-kicker">A gentle third voice</span><h3>Love AI Companion</h3></div></div><p className="companion-reply">{reply}</p><form onSubmit={ask}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What should we do tonight?" maxLength={500} aria-label="Ask Love AI Companion" /><button className="primary" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button></form></section>;
}
