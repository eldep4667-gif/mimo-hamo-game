import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ChatMessage } from '../../shared/types.js';

export function Chat({ socket, messages, selfId }: { socket: Socket; messages: ChatMessage[]; selfId: string }) {
  const [text, setText] = useState('');
  const [typing, setTyping] = useState('');
  const latest = useRef<HTMLDivElement>(null);
  useEffect(() => { latest.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  useEffect(() => {
    const listener = ({ playerId, typing: active }: { playerId: string; typing: boolean }) => setTyping(active && playerId !== selfId ? 'Someone is writing…' : '');
    socket.on('chat:typing', listener); return () => { socket.off('chat:typing', listener); };
  }, [socket, selfId]);
  function send(event: FormEvent) {
    event.preventDefault(); if (!text.trim()) return;
    socket.emit('chat:send', text); socket.emit('chat:typing', false); setText('');
  }
  return <section className="chat-panel glass">
    <header><div><span className="panel-kicker">Love line</span><h3>Messages</h3></div><span className="presence-dot" /></header>
    <div className="messages">{messages.length === 0 && <p className="empty-chat">Your story starts with a hello.</p>}
      {messages.map((message) => <article className={`message ${message.playerId === selfId ? 'own' : ''}`} key={message.id}>
        <strong>{message.playerId === selfId ? 'You' : message.name}</strong><p>{message.text}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
      </article>)}<div ref={latest} /></div>
    <p className="typing">{typing}</p>
    <div className="reactions">{['❤️', '🥰', '😘', '😂', '🫶', '🌹', '✨'].map((emoji) => <button key={emoji} onClick={() => socket.emit('chat:send', emoji)}>{emoji}</button>)}</div>
    <form onSubmit={send}><input value={text} onChange={(event) => { setText(event.target.value); socket.emit('chat:typing', Boolean(event.target.value)); }} onBlur={() => socket.emit('chat:typing', false)} placeholder="Leave a little note…" maxLength={500} /><button className="send" aria-label="send message">↑</button></form>
  </section>;
}
