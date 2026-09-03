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
    const shadow = this.add.ellipse(0, 28, 56, 16, 0x130a25, .25);
    const glow = this.add.circle(0, 0, 38, Phaser.Display.Color.HexStringToColor(player.color).color, .18);
    const torso = this.add.ellipse(0, 12, 30, 37, player.character === 'mimo' ? 0xf0a3ba : 0x7786db);
    const head = this.add.circle(0, -17, 20, player.character === 'mimo' ? 0xffdcc8 : 0xe3b99b);
    const hair = this.add.arc(0, -22, 22, 190, 350, false, player.character === 'mimo' ? 0x5a254f : 0x35233f, 1).setStrokeStyle(7, player.character === 'mimo' ? 0x5a254f : 0x35233f);
    const badge = this.add.text(23, -29, player.emoji, { fontSize: '19px' }).setOrigin(.5);
    const label = this.add.text(0, 48, player.displayName, { fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#fff6e9', stroke: '#251231', strokeThickness: 4 }).setOrigin(.5);
    body.add([shadow, glow, torso, head, hair, badge, label]); body.setPosition(x, y); body.setSize(70, 90);
    this.tweens.add({ targets: body, y: y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
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
    g.fillGradientStyle(0x513760, 0x513760, 0xf28c83, 0xf8b76f, 1); g.fillRect(0, 0, 1200, 760);
    g.fillStyle(0x2b1740, .72); g.fillCircle(1010, 115, 55); g.fillStyle(0xffd9a1, .98); g.fillCircle(1000, 108, 48);
    for (let i = 0; i < 60; i += 1) { g.fillStyle(0xffefd1, Math.random() * .55 + .15); g.fillCircle(Math.random() * 1200, Math.random() * 320, Math.random() * 2.2 + .4); }
    g.fillStyle(0x375c4f, 1); g.fillEllipse(610, 688, 1500, 400);
    g.fillStyle(0x274b47, 1); g.fillEllipse(610, 734, 1450, 260);
    g.fillStyle(0x59828b, .9); g.fillEllipse(585, 500, 310, 220);
    g.lineStyle(11, 0xeac18c, 1); g.beginPath(); g.moveTo(430, 465); g.lineTo(735, 540); g.strokePath();
    g.fillStyle(0x694138, 1); g.fillRoundedRect(834, 244, 210, 155, 20); g.fillStyle(0xffd8aa, 1); g.fillTriangle(809, 245, 940, 145, 1070, 245);
    g.fillStyle(0x6b355e, 1); g.fillRoundedRect(146, 470, 180, 78, 35); g.fillStyle(0xffd07d, .8); g.fillCircle(230, 510, 17);
    for (let i = 0; i < 48; i += 1) { const x = Math.random() * 1200; const y = 360 + Math.random() * 365; g.fillStyle(i % 2 ? 0xf180a9 : 0xffd87d, .85); g.fillCircle(x, y, 4 + Math.random() * 5); }
    const labels: Array<[number, number, string]> = [[932, 420, 'Our Home'], [230, 565, 'Picnic Garden'], [586, 617, 'Moon Lake'], [1080, 610, 'Magical Forest →']];
    labels.forEach(([x, y, text]) => this.add.text(x, y, text, { fontFamily: 'Georgia', fontSize: '17px', color: '#fff1d6', stroke: '#402341', strokeThickness: 4 }).setOrigin(.5));
  }
}
