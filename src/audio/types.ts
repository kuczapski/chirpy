// Natural vowels are less perfectly periodic than a generated sine wave.
// Keep a periodicity floor while allowing modest breathiness and vibrato.
export const MIN_VOICE_CONFIDENCE = 0.8;

export interface Analysis {
  pitch: number;
  confidence: number;
  rms: number;
  db: number;
  rawDb: number;
  voiced: boolean;
  timestamp: number;
  lastValidAt: number;
}
export const emptyAnalysis = (): Analysis => ({
  pitch: 0, confidence: 0, rms: 0, db: -120, rawDb: -120,
  voiced: false, timestamp: 0, lastValidAt: 0,
});
export interface AudioOptions {
  detectionMin: number;
  detectionMax: number;
  noiseGate: number;
  attackMs: number;
  releaseMs: number;
  windowMs: number;
}
