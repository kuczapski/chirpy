import { MIN_VOICE_CONFIDENCE } from './types';

export interface PitchResult { pitch: number; confidence: number }

/** YIN cumulative mean normalized difference, with parabolic interpolation.
 * Buffers are reused; the worker owns this detector, never the render thread. */
export class PitchDetector {
  private readonly difference = new Float32Array(4096);
  detect(samples: Float32Array, sampleRate: number, minHz = 80, maxHz = 800): PitchResult {
    const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
    const maxTau = Math.min(Math.ceil(sampleRate / minHz), Math.floor(samples.length / 2), this.difference.length - 2);
    // Comparing a whole 96–128 ms window smears natural pitch modulation.
    // Use the most recent short span, still covering at least two low-note periods.
    const length = Math.min(samples.length - maxTau, Math.max(Math.round(sampleRate * 0.025), maxTau * 2));
    const start = samples.length - length - maxTau;
    let energy = 0;
    for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
    if (energy / samples.length < 1e-10 || maxTau <= minTau) return { pitch: 0, confidence: 0 };
    const d = this.difference;
    d[0] = 1;
    let cumulative = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let i = 0; i < length; i++) {
        const delta = samples[start + i] - samples[start + i + tau];
        sum += delta * delta;
      }
      cumulative += sum;
      d[tau] = cumulative > 0 ? sum * tau / cumulative : 1;
    }
    let best = minTau;
    for (let tau = minTau; tau < maxTau; tau++) {
      if (d[tau] < d[best]) best = tau;
      if (d[tau] < 0.15) {
        while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
        best = tau;
        break;
      }
    }
    const confidence = Math.max(0, 1 - d[best]);
    if (confidence < MIN_VOICE_CONFIDENCE) return { pitch: 0, confidence };
    const left = d[best - 1], center = d[best], right = d[Math.min(best + 1, maxTau)];
    const denominator = 2 * (2 * center - right - left);
    const offset = Math.abs(denominator) > 1e-9 ? (right - left) / denominator : 0;
    const pitch = sampleRate / (best + Math.max(-0.5, Math.min(0.5, offset)));
    return pitch >= minHz * 0.99 && pitch <= maxHz * 1.01 ? { pitch, confidence } : { pitch: 0, confidence: 0 };
  }
}

/** Require three consistent frames for a large interval, suppressing isolated octave errors. */
export class PitchStabilizer {
  private previous = 0;
  private candidate = 0;
  private count = 0;
  private lastTime = -Infinity;
  accept(pitch: number, time: number): boolean {
    if (pitch <= 0) return false;
    if (time - this.lastTime > 350) this.previous = 0;
    if (this.previous && Math.abs(Math.log2(pitch / this.previous)) > 0.48) {
      if (this.candidate && Math.abs(Math.log2(pitch / this.candidate)) < 0.12) this.count++;
      else { this.candidate = pitch; this.count = 1; }
      if (this.count < 3) return false;
    }
    this.previous = pitch;
    this.lastTime = time;
    this.count = 0;
    return true;
  }
}
