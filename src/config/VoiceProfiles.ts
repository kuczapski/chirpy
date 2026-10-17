import type { Settings } from './GameConfig';

// Convenient starting ranges, not measurements or age-based requirements.
export const PITCH_PROFILES = {
  kid: { label: 'Kid', min: 180, max: 600 },
  adult: { label: 'Adult', min: 100, max: 380 },
  high: { label: 'High-pitched', min: 220, max: 700 },
  low: { label: 'Low-pitched', min: 70, max: 250 },
} as const;
export const LOUDNESS_PROFILES = {
  quiet: { label: 'Quiet', min: -55, max: -30 },
  comfortable: { label: 'Comfortable', min: -42, max: -18 },
  loud: { label: 'Fuller voice', min: -32, max: -10 },
} as const;
export function withPitchProfile(settings: Settings, key: keyof typeof PITCH_PROFILES): Settings {
  const profile = PITCH_PROFILES[key];
  return { ...settings, pitchMin: profile.min, pitchMax: profile.max,
    detectionMin: Math.min(settings.detectionMin, profile.min), detectionMax: Math.max(settings.detectionMax, profile.max) };
}
export function withLoudnessProfile(settings: Settings, key: keyof typeof LOUDNESS_PROFILES): Settings {
  const profile = LOUDNESS_PROFILES[key];
  return { ...settings, minDb: profile.min, maxDb: profile.max, noiseGate: Math.min(settings.noiseGate, profile.min - 6) };
}
