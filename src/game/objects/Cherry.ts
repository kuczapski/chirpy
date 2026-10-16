import Phaser from 'phaser';

export class Cherry extends Phaser.GameObjects.Container {
  private halo: Phaser.GameObjects.Arc;
  private ring: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.halo = scene.add.circle(0, 0, 48, 0xfff7c2, 0.2);
    const fruit = scene.add.image(0, -7, 'cherry').setDisplaySize(63, 69);
    this.ring = scene.add.graphics();
    this.add([this.halo, this.ring, fruit]);
    scene.add.existing(this);
  }
  feedback(time: number, distance: number, progress: number, radius: number, reduced: boolean): void {
    const near = Math.max(0, 1 - distance / (radius * 3));
    this.halo.setRadius(radius).setAlpha(0.12 + near * 0.3);
    this.halo.setScale(reduced ? 1 : 1 + Math.sin(time / 400) * 0.045);
    this.ring.clear();
    this.ring.lineStyle(2, 0xffffff, 0.4).strokeCircle(0, 0, radius);
    if (progress > 0) {
      this.ring.lineStyle(6, 0xffffff, 0.95).beginPath()
        .arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress).strokePath();
    }
  }
}
