export function measureRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}
export const rmsToDb = (rms: number): number => 20 * Math.log10(Math.max(rms, 1e-6));

export class LoudnessDetector {
  private smoothed: number | null = null;
  update(db: number, dt: number, attackMs: number, releaseMs: number): number {
    if (this.smoothed === null) this.smoothed = db;
    const tau = db > this.smoothed ? attackMs : releaseMs;
    this.smoothed += (db - this.smoothed) * (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));
    return this.smoothed;
  }
}
