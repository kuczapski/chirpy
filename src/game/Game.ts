import Phaser from 'phaser';
import { DIFFICULTIES, FIELD, type Settings } from '../config/GameConfig';
import type { Analysis } from '../audio/types';
import { VoiceMapper, fieldPosition, type Position } from '../controls/VoiceMapper';
import { simulatedAnalysis } from '../controls/SimulationController';
import { CaptureTracker } from './CaptureTracker';
import { Bird } from './objects/Bird';
import { Cherry } from './objects/Cherry';
import { alignToTarget } from '../controls/ControlMode';

export interface GameSnapshot {
  score: number; progress: number; analysis: Analysis; position: Position;
}
export interface GameCallbacks {
  settings: () => Settings;
  analysis: () => Analysis;
  holdVoiceInput: () => boolean;
  onSnapshot: (snapshot: GameSnapshot) => void;
  onCapture: (score: number) => void;
  onReady: () => void;
}
export class MeadowScene extends Phaser.Scene {
  mode: 'menu' | 'play' | 'pause' = 'menu';
  simulation = false;
  score = 0;
  private bird!: Bird;
  private cherry!: Cherry;
  private shadow!: Phaser.GameObjects.Ellipse;
  private clouds: { image: Phaser.GameObjects.Image; speed: number }[] = [];
  private mapper = new VoiceMapper();
  private capture = new CaptureTracker();
  private nextHud = 0;
  private portrait = false;
  private targetX = 1060;
  setPortrait(width: number | null): void {
    this.portrait = width !== null;
    const logicalWidth = width ?? 1280;
    this.scale.setGameSize(logicalWidth, 720);
    this.cameras.main.setScroll((1280 - logicalWidth) / 2, 0);
    if (this.cherry && this.mode !== 'menu') {
      this.cherry.x = this.portrait ? 640 : this.targetX;
      if (this.callbacks.settings().controlMode === 'pitch') this.bird.x = this.cherry.x;
    }
    this.capture.reset();
    this.pointerActive = false;
  }
  private pointerActive = false;
  private lastX = FIELD.left as number;
  private lastY = FIELD.bottom as number;
  constructor(private callbacks: GameCallbacks) { super('Meadow'); }
  preload(): void {
    for (const name of ['bird', 'wing', 'cherry', 'cloud']) this.load.svg(name, `${import.meta.env.BASE_URL}assets/${name}.svg`);
  }
  create(): void {
    this.drawLandscape();
    this.shadow = this.add.ellipse(930, 585, 120, 22, 0x4e9268, 0.13);
    this.cherry = new Cherry(this).setPosition(1060, 230);
    this.bird = new Bird(this, 900, 365).setScale(2.25);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointerActive = true; this.lastX = pointer.x; this.lastY = pointer.y;
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerActive = true; this.lastX = pointer.x; this.lastY = pointer.y;
    });
    this.input.on('gameout', () => { this.pointerActive = false; });
    this.callbacks.onReady();
  }
  private drawLandscape(): void {
    const g = this.add.graphics();
    // Canvas-independent gradient, made of thin horizontal bands.
    for (let y = 0; y < 720; y += 4) {
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(177, 224, 239), new Phaser.Display.Color(235, 248, 226), 720, y);
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b)).fillRect(0, y, 1280, 4);
    }
    g.fillStyle(0xfff6cd, 0.28).fillCircle(1080, 120, 87);
    g.fillStyle(0xfff4c4, 0.75).fillCircle(1080, 120, 62);
    g.fillStyle(0xffe8a5).fillCircle(1080, 120, 45);
    [[130, 125, 0.85], [660, 95, 0.6], [1110, 310, 0.78], [410, 290, 0.4]].forEach(([x, y, scale], i) => {
      const cloud = this.add.image(x, y, 'cloud').setScale(scale).setAlpha(i === 3 ? 0.45 : 0.65);
      this.clouds.push({ image: cloud, speed: 3 + i * 1.5 });
    });
    const hills = this.add.graphics();
    hills.fillStyle(0xc0dfb4).fillEllipse(220, 675, 950, 300).fillEllipse(1120, 650, 1000, 290);
    hills.fillStyle(0xa4cfa0).fillEllipse(690, 730, 1100, 310);
    hills.fillStyle(0x83bc88).fillEllipse(-10, 750, 780, 290).fillEllipse(1320, 744, 900, 320);
    hills.fillStyle(0x73ae7d).fillEllipse(650, 845, 1800, 400);
    const details = this.add.graphics();
    for (let i = 0; i < 72; i++) {
      const x = (i * 173 + 29) % 1280;
      const y = 638 + (i * 37) % 82;
      details.lineStyle(2, 0x579564, 0.55).lineBetween(x, y, x - 4, y - 10).lineBetween(x, y, x + 6, y - 7);
      if (i % 3 === 0) {
        details.fillStyle(i % 2 === 0 ? 0xfff8db : 0xf6c7b4);
        for (let p = 0; p < 5; p++) details.fillCircle(x + Math.cos(p * 1.256) * 4, y - 14 + Math.sin(p * 1.256) * 4, 3.4);
        details.fillStyle(0xe8bd60).fillCircle(x, y - 14, 2.5);
      }
    }
    // Little distant trees frame the play area without obscuring targets.
    [38, 1220].forEach((x, i) => {
      details.fillStyle(0x70976a).fillRoundedRect(x - 4, 500, 8, 110, 4);
      details.fillStyle(i ? 0x91c49b : 0x95c99d).fillEllipse(x, 488, 115, 145);
      details.fillStyle(0xa8d5a5, 0.6).fillEllipse(x - 15, 462, 65, 80);
    });
  }
  start(simulation: boolean): void {
    this.simulation = simulation; this.mode = 'play'; this.score = 0;
    this.mapper.reset(); this.capture.reset(); this.pointerActive = false;
    this.lastX = FIELD.left; this.lastY = FIELD.bottom;
    this.bird.setScale(1).setPosition(FIELD.left, FIELD.bottom).setAngle(0);
    this.spawnCherry();
  }
  pause(): void { this.mode = 'pause'; this.capture.reset(); }
  resume(): void { this.mode = 'play'; this.capture.reset(); this.pointerActive = false; }
  menu(): void {
    this.mode = 'menu'; this.capture.reset();
    this.bird.setScale(2.25).setPosition(900, 365).setAngle(0);
    this.cherry.setPosition(1060, 230).setVisible(true);
  }
  private spawnCherry(): void {
    const easyTargets = [[0.3, 0.35], [0.43, 0.52], [0.56, 0.4]];
    let nx: number, ny: number;
    if (this.score < easyTargets.length) [nx, ny] = easyTargets[this.score];
    else {
      const spread = DIFFICULTIES[this.callbacks.settings().difficulty].spread * Math.min(1, 0.6 + this.score * 0.025);
      nx = 0.5 + (Math.random() - 0.5) * spread * 0.85;
      ny = 0.5 + (Math.random() - 0.5) * spread * 0.85;
    }
    const position = fieldPosition(nx, ny);
    this.targetX = position.x;
    this.cherry.setPosition(this.portrait ? 640 : position.x, position.y).setVisible(true);
    const mode = this.callbacks.settings().controlMode;
    if (mode === 'pitch') this.bird.x = this.cherry.x;
    if (mode === 'loudness') this.bird.y = this.cherry.y;
  }
  private celebrate(): void {
    const reduced = this.callbacks.settings().reducedMotion;
    const text = this.add.text(this.cherry.x, this.cherry.y - 55, '+1', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '30px', color: '#27674d', fontStyle: 'bold',
      stroke: '#fffdf0', strokeThickness: 5,
    }).setOrigin(0.5);
    this.tweens.add({ targets: text, y: text.y - (reduced ? 0 : 45), alpha: 0, duration: 1100, onComplete: () => text.destroy() });
    if (reduced) return;
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      const dot = this.add.circle(this.cherry.x, this.cherry.y, 3 + i % 3, [0xffeea9, 0xffffff, 0xf19a86][i % 3]);
      this.tweens.add({ targets: dot, x: dot.x + Math.cos(angle) * 85, y: dot.y + Math.sin(angle) * 75,
        alpha: 0, scale: 0.3, duration: 700, ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
    }
  }
  update(time: number, delta: number): void {
    if (!this.bird) return;
    const settings = this.callbacks.settings();
    if (!settings.reducedMotion && this.mode !== 'pause') {
      for (const cloud of this.clouds) {
        cloud.image.x += cloud.speed * Math.min(delta, 50) / 1000;
        if (cloud.image.x > 1450) cloud.image.x = -150;
      }
    }
    if (this.mode === 'menu') {
      this.bird.y = 365 + (settings.reducedMotion ? 0 : Math.sin(time / 700) * 12);
      this.bird.animate(time, settings.reducedMotion);
      this.cherry.feedback(time, 150, 0, 45, settings.reducedMotion);
      this.shadow.setPosition(900, 585).setScale(1);
      return;
    }
    if (this.mode !== 'play') return;
    const now = performance.now();
    const analysis = this.simulation
      ? simulatedAnalysis(this.lastX, this.lastY, this.pointerActive, now, settings)
      : this.callbacks.analysis();
    const mapped = this.mapper.update(analysis, now, delta, settings, !this.simulation && this.callbacks.holdVoiceInput());
    const position = alignToTarget(mapped, this.cherry, settings.controlMode);
    this.bird.setPosition(position.x, position.y);
    this.bird.animate(time, settings.reducedMotion, position.valid);
    this.shadow.setPosition(position.x, 601).setScale(0.45 + position.y / 1400).setAlpha(0.55);
    const distance = Phaser.Math.Distance.Between(position.x, position.y, this.cherry.x, this.cherry.y);
    const difficulty = DIFFICULTIES[settings.difficulty];
    const radius = settings.captureRadius * (1 - difficulty.shrink * Math.min(this.score / 30, 1));
    if (this.capture.update(distance < radius, position.valid, delta, settings.captureHold)) {
      this.score++;
      this.celebrate();
      this.callbacks.onCapture(this.score);
      this.spawnCherry();
    }
    const progress = this.capture.elapsed / settings.captureHold;
    this.cherry.feedback(time, distance, progress, radius, settings.reducedMotion);
    if (time > this.nextHud) {
      this.nextHud = time + 80;
      this.callbacks.onSnapshot({ score: this.score, progress, analysis, position });
    }
  }
}
export function createGame(parent: HTMLElement, callbacks: GameCallbacks): { game: Phaser.Game; scene: MeadowScene } {
  const scene = new MeadowScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, width: 1280, height: 720, transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false },
    audio: { noAudio: true }, scene: [scene],
  });
  return { game, scene };
}
