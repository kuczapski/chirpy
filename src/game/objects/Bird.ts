import Phaser from 'phaser';

export class Bird extends Phaser.GameObjects.Container {
  private wing: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const body = scene.add.image(0, 0, 'bird').setDisplaySize(120, 110);
    this.wing = scene.add.image(-20, 9, 'wing').setDisplaySize(50, 40).setOrigin(0.8, 0.35);
    this.add([body, this.wing]);
    scene.add.existing(this);
  }
  animate(time: number, reducedMotion: boolean, valid = false): void {
    this.wing.angle = reducedMotion ? -10 : Math.sin(time / (valid ? 85 : 170)) * 16 - 8;
  }
}
