import { clamp, DEFAULTS, validateSettings, type Settings } from '../config/GameConfig';
import { MIN_VOICE_CONFIDENCE, type Analysis } from '../audio/types';

export const CALIBRATION_STEPS = [
  { title: 'Listen to the meadow', prompt: 'Stay quiet for a moment. Let’s listen to the room.', icon: '◌', duration: 2000, voiced: false },
  { title: 'Find your comfy voice', prompt: 'Say “AAAA” in your usual, comfortable voice.', icon: '♪', duration: 2500, voiced: true },
  { title: 'A little lower', prompt: 'Say a comfortable low “AAAA”. Stay relaxed.', icon: '↓', duration: 2500, voiced: true },
  { title: 'A little higher', prompt: 'Now try a comfortable high “AAAA”. No need to strain.', icon: '↑', duration: 2500, voiced: true },
  { title: 'Soft and gentle', prompt: 'Say a quiet “AAAA” with a clear voice, rather than a whisper.', icon: '◔', duration: 2500, voiced: true },
  { title: 'A little fuller', prompt: 'Say a comfortably louder “AAAA”. You never need to shout.', icon: '◕', duration: 2500, voiced: true },
] as const;
export interface StepResult { pitch: number; db: number; samples: number }
export const CALIBRATION_TIMING = { voicedMs: 1200, minimumSamples: 12, settleMs: 250, maxListenMs: 8000 } as const;
export interface StepAssessment {
  result: StepResult | null;
  voicedMs: number;
  progress: number;
  reason: 'ready' | 'more-voice' | 'varying-pitch' | 'more-room';
}
export const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
};
export function assessStep(index: number, frames: Analysis[]): StepAssessment {
  const good: { frame: Analysis; duration: number }[] = [];
  let previous = frames[0]?.timestamp ?? 0;
  for (const frame of frames) {
    const duration = clamp(frame.timestamp - previous, 0, 100);
    previous = frame.timestamp;
    if (duration === 0) continue;
    if (index === 0 || (frame.voiced && frame.pitch > 0 && frame.confidence >= MIN_VOICE_CONFIDENCE)) good.push({ frame, duration });
  }
  if (index === 0) {
    const measuredMs = good.reduce((sum, item) => sum + item.duration, 0);
    const ready = measuredMs >= 1500 && good.length >= 12;
    return { voicedMs: 0, progress: clamp(measuredMs / 1500), reason: ready ? 'ready' : 'more-room',
      result: ready ? { pitch: 0, db: percentile(good.map(item => item.frame.rawDb), 0.5), samples: good.length } : null };
  }
  // Find the largest comfortable pitch cluster. Brief octave errors and onset
  // noise should not invalidate an otherwise usable measurement.
  good.sort((a, b) => a.frame.pitch - b.frame.pitch);
  let left = 0, bestLeft = 0, bestRight = -1, bestMs = 0, windowMs = 0;
  for (let right = 0; right < good.length; right++) {
    windowMs += good[right].duration;
    while (good[right].frame.pitch / good[left].frame.pitch > 1.5) windowMs -= good[left++].duration;
    if (windowMs > bestMs) { bestMs = windowMs; bestLeft = left; bestRight = right; }
  }
  const cluster = good.slice(bestLeft, bestRight + 1);
  const totalMs = good.reduce((sum, item) => sum + item.duration, 0);
  const coherent = bestMs >= totalMs * 0.6;
  const enough = bestMs >= CALIBRATION_TIMING.voicedMs && cluster.length >= CALIBRATION_TIMING.minimumSamples;
  const ready = enough && coherent;
  return { voicedMs: bestMs, progress: clamp(bestMs / CALIBRATION_TIMING.voicedMs),
    reason: ready ? 'ready' : !coherent && totalMs >= CALIBRATION_TIMING.voicedMs ? 'varying-pitch' : 'more-voice',
    result: ready ? { pitch: percentile(cluster.map(item => item.frame.pitch), 0.5),
      db: percentile(cluster.map(item => item.frame.rawDb), 0.5), samples: cluster.length } : null };
}
export function evaluateStep(index: number, frames: Analysis[]): StepResult | null {
  return assessStep(index, frames).result;
}
export function calibrationSettings(results: StepResult[], current: Settings): Settings | null {
  if (results.length !== 6) return null;
  const [noise, comfortable, low, high, quiet, loud] = results;
  if (high.pitch / low.pitch < 1.12 || loud.db - quiet.db < 4 || comfortable.db - noise.db < 8) return null;
  const s: Settings = { ...current,
    pitchMin: Math.round(low.pitch), pitchMax: Math.round(high.pitch),
    minDb: Math.round(quiet.db), maxDb: Math.round(loud.db),
    noiseGate: clamp(Math.min(noise.db + 6, quiet.db - 4), -100, -5),
  };
  return validateSettings(s) ? null : s;
}
const KEY = 'chirpy-calibration-v1';
interface VoiceSetup {
  version: number;
  deviceId: string;
  settings: Settings;
  source?: 'calibrated' | 'manual';
}
let sessionSetup: VoiceSetup | null = null;

/** Either measured calibration or explicitly saved manual settings can prepare an input. */
export function hasVoiceSetup(deviceId: string): boolean {
  try {
    const stored = sessionSetup ?? JSON.parse(localStorage.getItem(KEY) ?? 'null') as VoiceSetup | null;
    return stored?.version === 1 && stored.deviceId === deviceId && !!stored.settings && validateSettings(stored.settings) === null;
  } catch { return false; }
}
export function saveCalibration(settings: Settings, source: 'calibrated' | 'manual' = 'calibrated'): boolean {
  if (validateSettings(settings)) return false;
  sessionSetup = { version: 1, deviceId: settings.deviceId, settings: { ...settings }, source };
  try { localStorage.setItem(KEY, JSON.stringify({ ...sessionSetup, date: new Date().toISOString() })); return true; }
  catch { return false; }
}
export function resetCalibration(): void {
  sessionSetup = null;
  try { localStorage.removeItem(KEY); } catch { /* In-memory defaults still apply. */ }
}
export function uncalibratedDefaults(current: Settings): Settings {
  return { ...current, pitchMin: DEFAULTS.pitchMin, pitchMax: DEFAULTS.pitchMax,
    minDb: DEFAULTS.minDb, maxDb: DEFAULTS.maxDb, noiseGate: DEFAULTS.noiseGate,
    detectionMin: DEFAULTS.detectionMin, detectionMax: DEFAULTS.detectionMax };
}
