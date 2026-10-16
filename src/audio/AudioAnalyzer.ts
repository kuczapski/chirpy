import { PitchDetector, PitchStabilizer } from './PitchDetector';
import { LoudnessDetector, measureRms, rmsToDb } from './LoudnessDetector';
import { emptyAnalysis, MIN_VOICE_CONFIDENCE, type Analysis, type AudioOptions } from './types';

export class AudioAnalyzer {
  private readonly detector = new PitchDetector();
  private readonly stabilizer = new PitchStabilizer();
  private readonly loudness = new LoudnessDetector();
  private reduced = new Float32Array(0);
  private lastTime = 0;
  private lastValid = 0;
  constructor(private options: AudioOptions) {}
  configure(options: AudioOptions): void { this.options = options; }
  analyze(samples: Float32Array, rate: number, timestamp: number): Analysis {
    const rms = measureRms(samples);
    const rawDb = rmsToDb(rms);
    const dt = this.lastTime ? Math.max(1, timestamp - this.lastTime) : 25;
    this.lastTime = timestamp;
    const db = this.loudness.update(rawDb, dt, this.options.attackMs, this.options.releaseMs);
    // Box-filter decimation reduces the YIN cost. RMS always uses full-rate input.
    const factor = Math.max(1, Math.floor(rate / 16000));
    const length = Math.floor(samples.length / factor);
    if (this.reduced.length !== length) this.reduced = new Float32Array(length);
    let mean = 0;
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let j = 0; j < factor; j++) sum += samples[i * factor + j];
      this.reduced[i] = sum / factor;
      mean += this.reduced[i];
    }
    mean /= length;
    for (let i = 0; i < length; i++) this.reduced[i] -= mean;
    const result = rawDb > this.options.noiseGate
      ? this.detector.detect(this.reduced, rate / factor, this.options.detectionMin, this.options.detectionMax)
      : { pitch: 0, confidence: 0 };
    const voiced = result.pitch > 0 && result.confidence >= MIN_VOICE_CONFIDENCE && this.stabilizer.accept(result.pitch, timestamp);
    if (voiced) this.lastValid = timestamp;
    return { ...emptyAnalysis(), pitch: voiced ? result.pitch : 0, confidence: result.confidence,
      rms, db, rawDb, voiced, timestamp, lastValidAt: this.lastValid };
  }
}
