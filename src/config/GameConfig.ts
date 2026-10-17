export type Difficulty = 'easy' | 'normal' | 'advanced';
export type PitchMapping = 'logarithmic' | 'linear';
export type ControlMode = 'pitch' | 'loudness' | 'full';

export interface Settings {
  controlMode: ControlMode;
  pitchMin: number;
  pitchMax: number;
  minDb: number;
  maxDb: number;
  mapping: PitchMapping;
  pitchSmoothing: number;
  loudnessSmoothing: number;
  silenceTimeout: number;
  deadband: number;
  captureRadius: number;
  captureHold: number;
  difficulty: Difficulty;
  volume: number;
  debug: boolean;
  showMeters: boolean;
  reducedMotion: boolean;
  noiseGate: number;
  attackMs: number;
  releaseMs: number;
  detectionMin: number;
  detectionMax: number;
  windowMs: number;
  deviceId: string;
}

export const FIELD = { left: 130, right: 1150, top: 120, bottom: 565 } as const;
export const DIFFICULTIES = {
  easy: { radius: 76, hold: 300, spread: 0.65, shrink: 0.08 },
  normal: { radius: 58, hold: 400, spread: 0.86, shrink: 0.12 },
  advanced: { radius: 40, hold: 650, spread: 1, shrink: 0.15 },
} as const;

export const DEFAULTS: Settings = {
  controlMode: 'full',
  pitchMin: 140, pitchMax: 440, minDb: -42, maxDb: -18,
  mapping: 'logarithmic', pitchSmoothing: 90, loudnessSmoothing: 110,
  silenceTimeout: 200, deadband: 0.012, captureRadius: 58, captureHold: 400,
  difficulty: 'normal', volume: 0.3, debug: false, showMeters: false,
  reducedMotion: false, noiseGate: -52, attackMs: 35, releaseMs: 110,
  detectionMin: 80, detectionMax: 800, windowMs: 96, deviceId: '',
};

export const NUMBER_LIMITS: Partial<Record<keyof Settings, [number, number]>> = {
  pitchMin: [50, 1500], pitchMax: [60, 1600], minDb: [-90, -1], maxDb: [-89, 0],
  pitchSmoothing: [0, 500], loudnessSmoothing: [0, 500], silenceTimeout: [0, 1500],
  deadband: [0, 0.1], captureRadius: [24, 120], captureHold: [150, 2000],
  volume: [0, 1], noiseGate: [-100, -5], attackMs: [0, 300], releaseMs: [0, 500],
  detectionMin: [50, 500], detectionMax: [200, 1600], windowMs: [64, 128],
};

export function validateSettings(s: Settings): string | null {
  // Older saved calibration records did not include a control mode.
  if (!['pitch', 'loudness', 'full'].includes(s.controlMode ?? 'full')) return 'Choose a valid control mode.';
  for (const [key, range] of Object.entries(NUMBER_LIMITS)) {
    const value = s[key as keyof Settings];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) {
      return `${key} must be between ${range[0]} and ${range[1]}.`;
    }
  }
  if (s.pitchMax <= s.pitchMin + 10) return 'High pitch must be at least 10 Hz above low pitch.';
  if (s.maxDb < s.minDb + 3) return 'Loud voice must be at least 3 dB above quiet voice.';
  if (s.detectionMin > s.pitchMin || s.detectionMax < s.pitchMax) return 'The detection range must include your whole pitch range.';
  if (s.noiseGate >= s.minDb) return 'The noise gate must be below the quiet voice level.';
  if (!['linear', 'logarithmic'].includes(s.mapping)) return 'Choose a valid pitch mapping.';
  if (!(s.difficulty in DIFFICULTIES)) return 'Choose a valid difficulty.';
  if (['debug', 'showMeters', 'reducedMotion'].some(k => typeof s[k as keyof Settings] !== 'boolean')) return 'Invalid display setting.';
  if (typeof s.deviceId !== 'string') return 'Invalid microphone.';
  return null;
}

const KEY = 'chirpy-settings-v1';
export function loadSettings(): Settings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const s = { ...DEFAULTS, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      ...(typeof stored === 'object' && stored !== null ? stored : {}) } as Settings;
    return validateSettings(s) ? { ...DEFAULTS } : s;
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(settings: Settings): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; } catch { return false; }
}

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
