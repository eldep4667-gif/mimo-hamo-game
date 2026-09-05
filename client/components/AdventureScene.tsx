import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import type { PlayerPublic, RoomSnapshot, WorldMotion } from '../../shared/types.js';

interface Props { snapshot: RoomSnapshot; selfId: string; onMove(motion: WorldMotion): void; onCrystal(): void; onBack(): void; }

export function AdventureScene({ snapshot, selfId, onMove, onCrystal, onBack }: Props) {
  const host = useRef<HTMLDivElement>(null); const latest = useRef({ snapshot, selfId, onMove, onCrystal }); latest.current = { snapshot, selfId, onMove, onCrystal };
  useEffect(() => {
    if (!host.current) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#20142f'); scene.fog = new THREE.Fog('#20142f', 15, 52);
    const camera = new THREE.PerspectiveCamera(55, 1, .1, 100); camera.position.set(0, 14, 18);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; host.current.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#f6c7d0', '#172d2c', 2)); const sun = new THREE.DirectionalLight('#ffd19d', 2.4); sun.position.set(8, 16, 5); sun.castShadow = true; scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#284b45', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshStandardMaterial({ color: '#6d9cb0', emissive: '#214f6c', emissiveIntensity: .3, roughness: .25 })); lake.rotation.x = -Math.PI / 2; lake.position.set(-5, .015, 2); scene.add(lake);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffe8bd' })); moon.position.set(-14, 18, -18); scene.add(moon);
    const moonGlow = new THREE.PointLight('#ffdca5', 9, 26); moonGlow.position.copy(moon.position); scene.add(moonGlow);
    for (let i = 0; i < 44; i += 1) scene.add(tree((Math.random() - .5) * 50, (Math.random() - .5) * 40));
    for (let i = 0; i < 18; i += 1) scene.add(lantern(-13 + i * 1.65, -6 + Math.sin(i) * 1.2));
    scene.add(bridge(-5, 2), garden(8, -5));
    const crystal = new THREE.Group(); const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), new THREE.MeshStandardMaterial({ color: '#ff82b3', emissive: '#ea387a', emissiveIntensity: 1.4, metalness: .15, roughness: .2 })); crystal.add(gem); const halo = new THREE.PointLight('#ff79ae', 13, 11); halo.position.y = 1; crystal.add(halo); crystal.position.set(0, 1.5, 0); scene.add(crystal);
    const models = new Map<string, THREE.Group>(); const target = new THREE.Vector3(); const keys = new Set<string>(); let previous = performance.now(); let sentAt = 0; let frame = 0;
    const resize = () => { const width = host.current?.clientWidth ?? 1; const height = host.current?.clientHeight ?? 1; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
    const down = (event: KeyboardEvent) => { if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { keys.add(event.code); event.preventDefault(); } };
    const up = (event: KeyboardEvent) => keys.delete(event.code);
    const observer = new ResizeObserver(resize); observer.observe(host.current); window.addEventListener('keydown', down); window.addEventListener('keyup', up); resize();
    function animate(now: number) {
      frame = requestAnimationFrame(animate); const dt = Math.min((now - previous) / 1000, .05); previous = now;
      const state = latest.current; const self = state.snapshot.players.find((player) => player.id === state.selfId);
      if (self) {
        const dx = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
        const dy = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
        if (dx || dy) {
          const len = Math.hypot(dx, dy); const next = { x: THREE.MathUtils.clamp(self.x + dx / len * 250 * dt, 20, 1180), y: THREE.MathUtils.clamp(self.y + dy / len * 250 * dt, 40, 725), angle: Math.atan2(dy, dx) };
          if (now - sentAt > 60) { sentAt = now; state.onMove(next); }
        }
      }
      syncModels(scene, models, state.snapshot.players, state.selfId);
      crystal.rotation.y += dt; crystal.position.y = 1.65 + Math.sin(now / 600) * .25;
      if (!state.snapshot.adventure.crystalCollected && self && Math.hypot(self.x - 600, self.y - 380) < 125) state.onCrystal();
      const own = models.get(state.selfId); if (own) { target.copy(own.position); camera.position.lerp(new THREE.Vector3(target.x, 14, target.z + 18), .04); camera.lookAt(target.x, 0, target.z - 2); }
      renderer.render(scene, camera);
    }
    animate(performance.now());
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); renderer.dispose(); host.current?.replaceChildren(); };
  }, []);
  return <section className="adventure-view"><div className="adventure-top"><button className="secondary" onClick={onBack}>← Our Little World</button><div><span className="eyebrow">Level 1 · Shared Three.js adventure</span><h2>The Magical Forest</h2></div><p>{snapshot.adventure.crystalCollected ? '💎 Heart Crystal restored' : 'Find the glowing Heart Crystal together'}</p></div><div ref={host} className="three-host" /><p className="adventure-help">Move with WASD / arrow keys. Stand together at the crystal to restore its light.</p></section>;
}

function lantern(x: number, z: number) {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#4a3440', roughness: .9 })); post.position.y = .7;
  const light = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd98b' })); light.position.y = 1.42;
  const glow = new THREE.PointLight('#ffc36e', 1.2, 4); glow.position.y = 1.42; group.add(post, light, glow); group.position.set(x, 0, z); return group;
}
function bridge(x: number, z: number) {
  const group = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ color: '#7b4c48', roughness: .85 });
  for (let i = -3; i <= 3; i += 1) { const plank = new THREE.Mesh(new THREE.BoxGeometry(.8, .16, 2.5), wood); plank.position.set(i * .9, .22, 0); plank.rotation.y = i * .02; group.add(plank); }
  group.position.set(x, 0, z); return group;
}
function garden(x: number, z: number) {
  const group = new THREE.Group(); const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, .18, 32), new THREE.MeshStandardMaterial({ color: '#573b45', roughness: 1 })); soil.position.y = .1; group.add(soil);
  for (let i = 0; i < 12; i += 1) { const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .45, 5), new THREE.MeshStandardMaterial({ color: '#5ea27d' })); const bloom = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? '#f18bab' : '#f6cf87', emissive: i % 2 ? '#7c2747' : '#6b4a22', emissiveIntensity: .35 })); const angle = i * .52; stem.position.set(Math.cos(angle) * 1.9, .35, Math.sin(angle) * 1.9); bloom.position.set(stem.position.x, .62, stem.position.z); group.add(stem, bloom); }
  group.position.set(x, 0, z); return group;
}
function tree(x: number, z: number) {
  const group = new THREE.Group(); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .38, 2.3, 6), new THREE.MeshStandardMaterial({ color: '#533b39', roughness: 1 })); trunk.position.y = 1.15; trunk.castShadow = true;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.45, 4.2, 8), new THREE.MeshStandardMaterial({ color: '#315849', roughness: .9 })); canopy.position.y = 3.4; canopy.castShadow = true; group.add(trunk, canopy); group.position.set(x, 0, z); return group;
}
function syncModels(scene: THREE.Scene, models: Map<string, THREE.Group>, players: PlayerPublic[], selfId: string) {
  const ids = new Set(players.map((player) => player.id));
  for (const [id, model] of models) if (!ids.has(id)) { scene.remove(model); models.delete(id); }
  players.forEach((player) => {
    let model = models.get(player.id);
    if (!model) { model = character(player); models.set(player.id, model); scene.add(model); }
    const x = (player.x - 600) / 34; const z = (player.y - 380) / 34;
    model.position.lerp(new THREE.Vector3(x, 0, z), player.id === selfId ? .4 : .12); model.rotation.y = -player.angle;
    model.children[2].visible = player.speaking;
  });
}
function character(player: PlayerPublic) {
  const group = new THREE.Group(); const color = new THREE.Color(player.character === 'mimo' ? '#ee9fb5' : '#7a86d8');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .9, 5, 10), new THREE.MeshStandardMaterial({ color, roughness: .65 })); body.position.y = 1.1; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.48, 14, 12), new THREE.MeshStandardMaterial({ color: player.character === 'mimo' ? '#ffdcc9' : '#e4b89a', roughness: .7 })); head.position.y = 2.25;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: player.character === 'mimo' ? '#46334f' : '#241e4a', roughness: .9 })); hair.position.y = 2.43;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(.43, .08, 6, 14), new THREE.MeshStandardMaterial({ color: player.character === 'mimo' ? '#ffd273' : '#f19ab3', roughness: .55 })); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.72;
  const glow = new THREE.PointLight('#ff9bbf', 1.5, 4); glow.position.y = 2.3; glow.visible = false; group.add(body, head, hair, scarf, glow); return group;
}
