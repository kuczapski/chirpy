/** Capture requires uninterrupted, current voiced activity; silence resets progress. */
export class CaptureTracker {
  elapsed = 0;
  update(inside: boolean, voiced: boolean, dt: number, hold: number): boolean {
    if (!inside || !voiced) this.elapsed = 0;
    else this.elapsed += Math.min(dt, 50);
    if (this.elapsed >= hold) { this.elapsed = 0; return true; }
    return false;
  }
  reset(): void { this.elapsed = 0; }
}
