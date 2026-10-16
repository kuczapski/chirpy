/** A short median rejects transient level spikes. Hysteresis then ignores small
 * reversals instead of turning every envelope ripple into horizontal motion. */
export class LoudnessControl {
  private samples = new Float64Array(5);
  private sorted = new Float64Array(5);
  private count = 0;
  private index = 0;
  private value: number | null = null;
  private timestamp = -Infinity;

  reset(): void {
    this.count = 0; this.index = 0; this.value = null; this.timestamp = -Infinity;
  }

  update(db: number, timestamp: number, min: number, max: number, deadband: number): number {
    // Render frames must not add copies of the same audio sample to the median.
    if (timestamp === this.timestamp) return this.value ?? db;
    if (timestamp - this.timestamp > 250) this.reset();
    this.timestamp = timestamp;
    this.samples[this.index] = db;
    this.index = (this.index + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
    for (let i = 0; i < this.count; i++) this.sorted[i] = this.samples[i];
    // Five elements; insertion sort avoids allocating in the control loop.
    for (let i = 1; i < this.count; i++) {
      const value = this.sorted[i];
      let j = i - 1;
      while (j >= 0 && this.sorted[j] > value) { this.sorted[j + 1] = this.sorted[j]; j--; }
      this.sorted[j + 1] = value;
    }
    const median = this.sorted[Math.floor(this.count / 2)];
    const band = Math.min(0.9, (max - min) * Math.max(0.025, deadband));
    if (this.value === null || median <= min || median >= max) this.value = median;
    else if (median > this.value + band) this.value = median - band;
    else if (median < this.value - band) this.value = median + band;
    return this.value;
  }
}
