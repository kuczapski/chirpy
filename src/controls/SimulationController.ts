import { clamp, FIELD, type Settings } from '../config/GameConfig';
import type { Analysis } from '../audio/types';

export function simulatedAnalysis(x: number, y: number, active: boolean, now: number, s: Settings): Analysis {
  const nx = clamp((x - FIELD.left) / (FIELD.right - FIELD.left));
  const ny = clamp((FIELD.bottom - y) / (FIELD.bottom - FIELD.top));
  const pitch = s.mapping === 'linear' ? s.pitchMin + ny * (s.pitchMax - s.pitchMin)
    : s.pitchMin * (s.pitchMax / s.pitchMin) ** ny;
  const db = s.minDb + nx * (s.maxDb - s.minDb);
  return { pitch, db, rawDb: db, rms: 10 ** (db / 20), confidence: active ? 1 : 0,
    voiced: active, timestamp: now, lastValidAt: active ? now : 0 };
}
