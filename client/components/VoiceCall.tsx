import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PlayerPublic } from '../../shared/types.js';

type CallStatus = 'idle' | 'connecting' | 'connected' | 'error';

export function VoiceCall({ socket, self, other }: { socket: Socket; self: PlayerPublic; other?: PlayerPublic }) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const queuedIce = useRef<RTCIceCandidateInit[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const closed = useRef(false);

  useEffect(() => {
    const receiveReady = ({ playerId }: { playerId: string }) => {
      if (streamRef.current && playerId === other?.id && self.id < playerId) void createOffer(playerId);
    };
    const receiveSignal = ({ from, data }: { from: string; data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (from === other?.id) void handleSignal(from, data);
    };
    const remoteEnded = () => closeCall(false);
    socket.on('voice:ready', receiveReady); socket.on('voice:signal', receiveSignal); socket.on('voice:end', remoteEnded);
    return () => { socket.off('voice:ready', receiveReady); socket.off('voice:signal', receiveSignal); socket.off('voice:end', remoteEnded); closeCall(false); };
  // Call helpers intentionally close over current peer identity and socket.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, other?.id, self.id]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  function makePeer(remoteId: string) {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;
    streamRef.current?.getTracks().forEach((track) => pc.addTrack(track, streamRef.current!));
    pc.onicecandidate = (event) => { if (event.candidate) socket.emit('voice:signal', { to: remoteId, data: { candidate: event.candidate.toJSON() } }); };
    pc.ontrack = (event) => {
      if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play().catch(() => undefined); }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected');
      if (['failed', 'disconnected'].includes(pc.connectionState)) setStatus('error');
    };
    return pc;
  }
  async function createOffer(remoteId: string) {
    if (!streamRef.current || pcRef.current) return;
    const pc = makePeer(remoteId); const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    socket.emit('voice:signal', { to: remoteId, data: { description: pc.localDescription } }); setStatus('connecting');
  }
  async function handleSignal(from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    if (!streamRef.current) return;
    const pc = makePeer(from);
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      for (const candidate of queuedIce.current.splice(0)) await pc.addIceCandidate(candidate);
      if (data.description.type === 'offer') {
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.emit('voice:signal', { to: from, data: { description: pc.localDescription } }); setStatus('connecting');
      }
    }
    if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate); else queuedIce.current.push(data.candidate);
    }
  }
  async function start() {
    if (!other?.connected) { setStatus('error'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('error'); return; }
    closed.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      streamRef.current = stream; setMuted(false); setStatus('connecting'); socket.emit('voice:ready'); monitorSpeaking(stream);
      if (self.id < other.id) await createOffer(other.id);
    } catch { setStatus('error'); }
  }
  function monitorSpeaking(stream: MediaStream) {
    try {
      const context = new AudioContext(); audioContext.current = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 256; context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize); let previous = false;
      const tick = () => {
        if (closed.current) return;
        analyser.getByteTimeDomainData(samples); const level = samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / samples.length;
        const speaking = level > 3.1;
        if (speaking !== previous) { previous = speaking; socket.emit('voice:speaking', speaking); }
        window.setTimeout(tick, 240);
      }; tick();
    } catch { /* The call still works if audio metering is unavailable. */ }
  }
  function toggleMute() {
    const next = !muted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); socket.emit('voice:speaking', false);
  }
  function closeCall(notify = true) {
    closed.current = true;
    if (notify && streamRef.current) socket.emit('voice:end');
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    pcRef.current?.close(); pcRef.current = null; queuedIce.current = [];
    audioContext.current?.close().catch(() => undefined); audioContext.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setMuted(false); setStatus('idle');
  }
  const statusText = status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : status === 'error' ? (!other?.connected ? 'Waiting for your other half' : 'Microphone unavailable') : 'Voice call off';
  return <aside className={`voice-call glass ${expanded ? 'expanded' : ''}`}>
    <audio ref={audioRef} autoPlay playsInline />
    <button className="voice-head" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span className={`voice-avatar ${other?.speaking ? 'speaking' : ''}`}>{other?.character === 'mimo' ? '🌙' : '☀️'}</span>
      <span><b>{other?.displayName ?? 'Mimo'}</b><small><i className={`state-dot ${status}`} /> {statusText}</small></span><span className="voice-chevron">⌃</span>
    </button>
    <div className="voice-controls">
      {status === 'idle' || status === 'error' ? <button className="call-start" onClick={() => void start()}>🎙 Start voice call</button> : <><button onClick={toggleMute} className={muted ? 'is-muted' : ''}>{muted ? '🔇 Unmute' : '🎙 Mute'}</button><label className="volume">🔊 <input aria-label="Call volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label><button className="end-call" onClick={() => closeCall()}>End</button></>}
      <small>Microphone is requested only when you start the call.</small>
    </div>
  </aside>;
}
