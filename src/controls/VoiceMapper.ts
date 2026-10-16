import { clamp, FIELD, type Settings } from '../config/GameConfig';
import { MIN_VOICE_CONFIDENCE, type Analysis } from '../audio/types';
import { LoudnessControl } from './LoudnessControl';

export interface Position { x: number; y: number; nx: number; ny: number; valid: boolean }
export function normalizeVoice(pitch: number, db: number, s: Settings): { nx: number; ny: number } {
  const ny = s.mapping === 'logarithmic'
    ? Math.log(Math.max(1, pitch) / s.pitchMin) / Math.log(s.pitchMax / s.pitchMin)
    : (pitch - s.pitchMin) / (s.pitchMax - s.pitchMin);
  return { nx: clamp((db - s.minDb) / (s.maxDb - s.minDb)), ny: clamp(ny) };
}
export function fieldPosition(nx: number, ny: number): { x: number; y: number } {
  return { x: FIELD.left + nx * (FIELD.right - FIELD.left), y: FIELD.bottom - ny * (FIELD.bottom - FIELD.top) };
}
export class VoiceMapper {
  private nx = 0;
  private ny = 0;
  private targetX = 0;
  private targetY = 0;
  private lastValid = -Infinity;
  private loudness = new LoudnessControl();
  reset(): void { this.nx = this.ny = this.targetX = this.targetY = 0; this.lastValid = -Infinity; this.loudness.reset(); }
  update(analysis: Analysis, now: number, dt: number, s: Settings, holdPosition = false): Position {
    const valid = !holdPosition && analysis.voiced && analysis.confidence >= MIN_VOICE_CONFIDENCE && analysis.pitch > 0
      && now - analysis.timestamp <= 150 && now >= analysis.timestamp;
    if (holdPosition) {
      // A success chime is a deliberate input hold, not silence. Never drift left
      // because speaker-feedback protection briefly suppresses microphone input.
      this.lastValid = now;
    } else if (valid) {
      const db = this.loudness.update(analysis.db, analysis.timestamp, s.minDb, s.maxDb, s.deadband);
      const target = normalizeVoice(analysis.pitch, db, s);
      if (Math.abs(target.nx - this.targetX) > s.deadband) this.targetX = target.nx;
      if (Math.abs(target.ny - this.targetY) > s.deadband) this.targetY = target.ny;
      this.lastValid = now;
    } else if (now - this.lastValid > s.silenceTimeout) {
      this.targetX = 0; this.targetY = 0;
    }
    const smooth = (current: number, target: number, ms: number): number =>
      current + (target - current) * (1 - Math.exp(-Math.min(dt, 100) / Math.max(valid ? ms : 350, 1)));
    // Slow small corrections more than intentional moves across the field.
    const loudnessMs = s.loudnessSmoothing * (Math.abs(this.targetX - this.nx) < 0.07 ? 2.2 : 1);
    this.nx = smooth(this.nx, this.targetX, loudnessMs);
    this.ny = smooth(this.ny, this.targetY, s.pitchSmoothing);
    return { ...fieldPosition(this.nx, this.ny), nx: this.nx, ny: this.ny, valid };
  }
}
