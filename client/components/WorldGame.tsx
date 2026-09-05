import Phaser from 'phaser';
import { forwardRef, useEffect, useImperativeHandle, useRef, type MutableRefObject } from 'react';
import type { PlayerPublic, RoomSnapshot, WorldMotion } from '../../shared/types.js';

export interface WorldGameHandle {
  setDirection(x: number, y: number): void;
  emote(value: string): void;
}

interface Props {
  snapshot: RoomSnapshot;
  selfId: string;
  onMove(motion: WorldMotion): void;
  onCollect(heartId: string): void;
  onEmote(emote: string): void;
}

type Avatar = { group: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; targetX: number; targetY: number; player: PlayerPublic };

export const WorldGame = forwardRef<WorldGameHandle, Props>(function WorldGame({ snapshot, selfId, onMove, onCollect, onEmote }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ snapshot, selfId, onMove, onCollect, onEmote });
  latest.current = { snapshot, selfId, onMove, onCollect, onEmote };
  const sceneRef = useRef<LittleWorldScene | null>(null);

  useImperativeHandle(ref, () => ({
    setDirection(x, y) { sceneRef.current?.setTouchDirection(x, y); },
    emote(value) { sceneRef.current?.showEmote(value); }
  }), []);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: host.current, width: 1200, height: 760,
      backgroundColor: '#2b1740', transparent: true, render: { antialias: true, pixelArt: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [class extends LittleWorldScene { constructor() { super(latest, sceneRef); } }]
    });
    return () => game.destroy(true);
  }, []);
  return <div className="world-canvas" ref={host} aria-label="Our Little World game map" />;
});

class LittleWorldScene extends Phaser.Scene {
  private avatars = new Map<string, Avatar>();
  private heartViews = new Map<string, Phaser.GameObjects.Container>();
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private touch = { x: 0, y: 0 };
  private latest: MutableRefObject<Props>;
  private exportedRef: MutableRefObject<LittleWorldScene | null>;
  private lastMove = 0;
  private localPosition = { x: 210, y: 420 };

  constructor(latest: MutableRefObject<Props>, exportedRef: MutableRefObject<LittleWorldScene | null>) {
    super('little-world'); this.latest = latest; this.exportedRef = exportedRef;
  }
  create() {
    this.exportedRef.current = this;
    this.drawEnvironment();
    this.keys = this.input.keyboard!.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.keys;
    const cursor = this.input.keyboard!.createCursorKeys();
    this.keys.up.on('down', () => void cursor); // Retains keyboard focus on mobile Safari without hijacking canvas.
    this.input.keyboard!.on('keydown-SPACE', () => this.showEmote('❤️'));
    this.input.keyboard!.on('keydown-E', () => this.showEmote('👋'));
  }
  setTouchDirection(x: number, y: number) { this.touch = { x, y }; }
  showEmote(emote: string) {
    const self = this.avatars.get(this.latest.current.selfId); if (!self) return;
    this.latest.current.onEmote(emote); this.floatEmote(self.group.x, self.group.y - 70, emote);
  }
  update(time: number, delta: number) {
    const { snapshot, selfId } = this.latest.current;
    const cursor = this.input.keyboard!.createCursorKeys();
    const inputs = { x: Number(this.keys.right.isDown || cursor.right.isDown) - Number(this.keys.left.isDown || cursor.left.isDown), y: Number(this.keys.down.isDown || cursor.down.isDown) - Number(this.keys.up.isDown || cursor.up.isDown) };
    const direction = inputs.x || inputs.y ? inputs : this.touch;
    const self = snapshot.players.find((player) => player.id === selfId);
    if (self && Math.hypot(self.x - this.localPosition.x, self.y - this.localPosition.y) > 150) this.localPosition = { x: self.x, y: self.y };
    if (self && (direction.x || direction.y)) {
      const length = Math.max(1, Math.hypot(direction.x, direction.y));
      const speed = 255 * (delta / 1000);
      this.localPosition.x = Phaser.Math.Clamp(this.localPosition.x + direction.x / length * speed, 20, 1180);
      this.localPosition.y = Phaser.Math.Clamp(this.localPosition.y + direction.y / length * speed, 40, 725);
      if (time - this.lastMove > 55) {
        this.lastMove = time;
        this.latest.current.onMove({ x: this.localPosition.x, y: this.localPosition.y, angle: Math.atan2(direction.y, direction.x) });
      }
    } else if (self) this.localPosition = { x: self.x, y: self.y };
    this.syncAvatars(snapshot.players, selfId);
    this.syncHearts(snapshot.game.hearts, snapshot.game.kind === 'heart-catcher');
  }
  private syncAvatars(players: PlayerPublic[], selfId: string) {
    const present = new Set(players.map((player) => player.id));
    for (const [id, avatar] of this.avatars) if (!present.has(id)) { avatar.group.destroy(); this.avatars.delete(id); }
    players.forEach((player) => {
      let avatar = this.avatars.get(player.id);
      const position = player.id === selfId ? this.localPosition : { x: player.x, y: player.y };
      if (!avatar) { avatar = this.createAvatar(player, position.x, position.y); this.avatars.set(player.id, avatar); }
      avatar.player = player; avatar.targetX = position.x; avatar.targetY = position.y;
      avatar.group.setAlpha(player.connected ? 1 : .45);
      if (player.id !== selfId) avatar.group.setPosition(Phaser.Math.Linear(avatar.group.x, position.x, .16), Phaser.Math.Linear(avatar.group.y, position.y, .16));
      else avatar.group.setPosition(position.x, position.y);
      avatar.label.setText(`${player.speaking ? '✦ ' : ''}${player.displayName}${player.connected ? '' : ' · away'}`);
      if (player.emote) this.floatEmote(avatar.group.x, avatar.group.y - 73, player.emote);
    });
  }
  private createAvatar(player: PlayerPublic, x: number, y: number): Avatar {
    const body = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 35, 74, 19, 0x0d0718, .42);
    const aura = this.add.circle(0, -4, 48, Phaser.Display.Color.HexStringToColor(player.color).color, .12);
    const cape = this.add.ellipse(0, 20, 43, 52, player.character === 'mimo' ? 0x9a456e : 0x46579d, .95);
    const coat = this.add.ellipse(0, 17, 32, 44, player.character === 'mimo' ? 0xf1a2b8 : 0x7386d6, 1);
    const face = this.add.circle(0, -18, 22, player.character === 'mimo' ? 0xffd7c0 : 0xe6b99f, 1);
    const hair = this.add.arc(0, -23, 24, 186, 355, false, player.character === 'mimo' ? 0x40213e : 0x201b37, 1).setStrokeStyle(8, player.character === 'mimo' ? 0x40213e : 0x201b37);
    const eyeL = this.add.circle(-7, -16, 2, 0x211326); const eyeR = this.add.circle(7, -16, 2, 0x211326);
    const scarf = this.add.rectangle(0, 1, 30, 6, 0xf8d58d, .9);
    const badge = this.add.text(28, -35, player.emoji, { fontSize: '18px' }).setOrigin(.5);
    const label = this.add.text(0, 56, `${player.speaking ? '✦ ' : ''}${player.displayName}`, { fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#fff5df', stroke: '#171024', strokeThickness: 5 }).setOrigin(.5);
    body.add([shadow, aura, cape, coat, face, hair, eyeL, eyeR, scarf, badge, label]); body.setPosition(x, y); body.setSize(82, 110);
    this.tweens.add({ targets: body, y: y - 4, duration: 1_200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    return { group: body, label, targetX: x, targetY: y, player };
  }
  private syncHearts(hearts: { id: string; x: number; y: number; cooperative: boolean }[], visible: boolean) {
    const ids = new Set(hearts.map((heart) => heart.id));
    for (const [id, view] of this.heartViews) if (!visible || !ids.has(id)) { view.destroy(); this.heartViews.delete(id); }
    if (!visible) return;
    hearts.forEach((heart) => {
      if (this.heartViews.has(heart.id)) return;
      const group = this.add.container(heart.x, heart.y);
      const halo = this.add.circle(0, 0, heart.cooperative ? 35 : 27, heart.cooperative ? 0xffc76e : 0xff7398, .18);
      const icon = this.add.text(0, 0, heart.cooperative ? '💛' : '❤️', { fontSize: heart.cooperative ? '38px' : '30px' }).setOrigin(.5);
      group.add([halo, icon]); group.setSize(70, 70).setInteractive({ useHandCursor: true });
      group.on('pointerdown', () => this.latest.current.onCollect(heart.id));
      this.tweens.add({ targets: group, y: heart.y - 11, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.heartViews.set(heart.id, group);
    });
  }
  private floatEmote(x: number, y: number, emote: string) {
    const note = this.add.text(x, y, emote, { fontSize: '26px' }).setOrigin(.5).setDepth(12);
    this.tweens.add({ targets: note, y: y - 46, alpha: 0, duration: 1_000, ease: 'Quad.out', onComplete: () => note.destroy() });
  }
  private drawEnvironment() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x100d25, 0x26133b, 0x5c3151, 0x9b5368, 1); g.fillRect(0, 0, 1200, 760);
    g.fillStyle(0xf9d998, .14); g.fillCircle(965, 115, 104); g.fillStyle(0x17102b, .92); g.fillCircle(965, 115, 82); g.fillStyle(0xffe8b1, .96); g.fillCircle(951, 103, 66);
    for (let i = 0; i < 105; i += 1) { const x = (i * 137) % 1200; const y = 30 + ((i * 71) % 330); g.fillStyle(i % 5 === 0 ? 0xffd995 : 0xfff1d0, i % 4 ? .7 : 1); g.fillCircle(x, y, i % 6 === 0 ? 2.5 : 1.1); }
    g.fillStyle(0x263d46, 1); g.fillEllipse(610, 684, 1550, 410); g.fillStyle(0x18343c, 1); g.fillEllipse(620, 748, 1500, 285);
    g.fillStyle(0x254f5a, .95); g.fillEllipse(560, 507, 410, 250); g.fillStyle(0x76b0ac, .16); g.fillEllipse(560, 481, 330, 120);
    g.lineStyle(10, 0xd2a66b, 1); g.beginPath(); g.moveTo(365, 465); g.lineTo(470, 442); g.lineTo(590, 458); g.lineTo(750, 525); g.strokePath(); g.lineStyle(3, 0xffdfa0, .65); g.beginPath(); g.moveTo(365, 453); g.lineTo(470, 430); g.lineTo(590, 446); g.lineTo(750, 513); g.strokePath();
    this.drawHouse(g, 905, 230); this.drawGarden(g, 205, 520); this.drawTrees(g); this.drawLanterns(g);
    const labels: Array<[number, number, string, string]> = [[930, 424, 'THE HOME', 'A place for two'], [205, 602, 'PICNIC GARDEN', 'Make a memory'], [562, 650, 'MOON LAKE', 'Sit beneath the stars'], [1080, 614, 'SECRET WOODS', 'Coming soon']];
    labels.forEach(([x, y, title, subtitle]) => { this.add.text(x, y, title, { fontFamily: 'DM Sans', fontStyle: 'bold', fontSize: '13px', color: '#fff0cf', letterSpacing: 2, stroke: '#161027', strokeThickness: 5 }).setOrigin(.5); this.add.text(x, y + 19, subtitle, { fontFamily: 'DM Sans', fontSize: '10px', color: '#d8c5c2', stroke: '#161027', strokeThickness: 3 }).setOrigin(.5); });
  }
  private drawHouse(g: Phaser.GameObjects.Graphics, x: number, y: number) { g.fillStyle(0x462b42, 1); g.fillRoundedRect(x - 108, y, 216, 155, 12); g.fillStyle(0x9e5364, 1); g.fillTriangle(x - 136, y + 8, x, y - 104, x + 136, y + 8); g.fillStyle(0xffdca2, .95); g.fillRoundedRect(x - 72, y + 45, 48, 62, 8); g.fillRoundedRect(x + 26, y + 45, 48, 62, 8); g.fillStyle(0x2c1835, 1); g.fillRect(x - 13, y + 72, 28, 83); g.fillStyle(0xffc77a, .3); g.fillCircle(x, y + 33, 75); }
  private drawGarden(g: Phaser.GameObjects.Graphics, x: number, y: number) { g.fillStyle(0x483450, .9); g.fillEllipse(x, y, 255, 95); for (let i = 0; i < 18; i += 1) { const px = x - 110 + ((i * 47) % 220); const py = y - 22 + ((i * 23) % 50); g.fillStyle(i % 2 ? 0xe98eaa : 0xf6ce84, .88); g.fillCircle(px, py, 5); g.fillStyle(0x6e9f79, .9); g.fillRect(px - 1, py + 4, 2, 16); } }
  private drawTrees(g: Phaser.GameObjects.Graphics) { for (let i = 0; i < 12; i += 1) { const x = 35 + i * 103; const y = 385 + (i % 3) * 23; g.fillStyle(0x231b32, 1); g.fillRect(x - 5, y, 10, 105); g.fillStyle(i % 2 ? 0x2d554c : 0x365f50, .96); g.fillCircle(x, y - 13, 38); g.fillCircle(x - 22, y + 10, 27); g.fillCircle(x + 23, y + 10, 29); } }
  private drawLanterns(g: Phaser.GameObjects.Graphics) { for (const [x, y] of [[420, 360], [770, 375], [1130, 350]]) { g.lineStyle(2, 0x24152f, 1); g.lineBetween(x, y - 46, x, y); g.fillStyle(0xffc66f, .22); g.fillCircle(x, y, 28); g.fillStyle(0xffd98e, 1); g.fillRoundedRect(x - 7, y - 7, 14, 16, 3); } }

}
