import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Socket } from 'socket.io-client';

type Point = [number, number];
type Stroke = { points: Point[]; color: string; width: number };
const COLORS = ['#f0719f', '#f5c969', '#ffffff', '#9f8cea', '#77d7c7'];

export function DrawingCanvas({ socket, active }: { socket: Socket; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const points = useRef<Point[]>([]);
  const [color, setColor] = useState(COLORS[0]); const [width, setWidth] = useState(7);
  function context() { return canvas.current?.getContext('2d') ?? null; }
  function draw(stroke: Stroke) {
    const ctx = context(); if (!ctx || stroke.points.length < 2) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.beginPath();
    stroke.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  useEffect(() => {
    const remote = (stroke: Stroke) => draw(stroke); const clear = () => { const ctx = context(); ctx?.clearRect(0, 0, 1200, 600); };
    socket.on('draw:stroke', remote); socket.on('draw:clear', clear); return () => { socket.off('draw:stroke', remote); socket.off('draw:clear', clear); };
  // Canvas drawing state is deliberately kept outside React for low-latency co-drawing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);
  if (!active) return null;
  function getPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect(); return [(event.clientX - bounds.left) * 1200 / bounds.width, (event.clientY - bounds.top) * 600 / bounds.height];
  }
  function begin(event: ReactPointerEvent<HTMLCanvasElement>) { drawing.current = true; points.current = [getPoint(event)]; event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; points.current.push(getPoint(event)); if (points.current.length > 18) flush(); }
  function flush() { if (points.current.length < 2) return; const stroke = { points: points.current, color, width }; draw(stroke); socket.emit('draw:stroke', stroke); points.current = [points.current.at(-1)!]; }
  function end() { flush(); drawing.current = false; points.current = []; }
  return <section className="drawing-modal glass"><header><div><p className="eyebrow">Same canvas, same moment</p><h3>Draw Together</h3></div><div className="draw-tools">{COLORS.map((item) => <button aria-label={`Choose ${item}`} className={color === item ? 'selected' : ''} style={{ background: item }} onClick={() => setColor(item)} key={item} />)}<input aria-label="Brush size" type="range" min="2" max="24" value={width} onChange={(event) => setWidth(Number(event.target.value))} /><button onClick={() => socket.emit('draw:clear')}>Clear</button><button className="primary" onClick={() => socket.emit('draw:save')}>Save memory</button></div></header><canvas ref={canvas} width="1200" height="600" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /></section>;
}
