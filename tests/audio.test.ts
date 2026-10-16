import { describe, expect, it } from 'vitest';
import { PitchDetector, PitchStabilizer } from '../src/audio/PitchDetector';
import { AudioAnalyzer } from '../src/audio/AudioAnalyzer';
import { LoudnessDetector, measureRms, rmsToDb } from '../src/audio/LoudnessDetector';
import { DEFAULTS } from '../src/config/GameConfig';

function sine(frequency: number, amplitude = 0.3, rate = 48000, duration = 0.096): Float32Array {
  return Float32Array.from({ length: Math.round(rate * duration) }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / rate));
}
describe('YIN fundamental-frequency estimation', () => {
  it.each([80, 110, 200, 400, 790])('finds a %i Hz sine at native sample rate', frequency => {
    const result = new PitchDetector().detect(sine(frequency), 48000);
    expect(Math.abs(result.pitch - frequency)).toBeLessThan(frequency * 0.015);
    expect(result.confidence).toBeGreaterThan(0.95);
  });
  it('finds the fundamental when the second harmonic is louder', () => {
    const samples = sine(200, 0.12);
    const harmonic = sine(400, 0.32);
    for (let i = 0; i < samples.length; i++) samples[i] += harmonic[i];
    expect(new PitchDetector().detect(samples, 48000).pitch).toBeCloseTo(200, 0);
  });
  it('rejects silence and deterministic broadband noise', () => {
    expect(new PitchDetector().detect(new Float32Array(4096), 48000).pitch).toBe(0);
    let seed = 12345;
    const noise = Float32Array.from({ length: 4096 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return seed / 2147483648 * 0.2;
    });
    expect(new PitchDetector().detect(noise, 48000).pitch).toBe(0);
  });
  it('rejects an isolated octave error but accepts a sustained new interval', () => {
    const tracker = new PitchStabilizer();
    expect(tracker.accept(200, 100)).toBe(true);
    expect(tracker.accept(400, 125)).toBe(false);
    expect(tracker.accept(201, 150)).toBe(true);
    expect(tracker.accept(400, 175)).toBe(false);
    expect(tracker.accept(401, 200)).toBe(false);
    expect(tracker.accept(400, 225)).toBe(true);
  });
});
describe('loudness and analysis pipeline', () => {
  it('reports RMS and dBFS with the expected amplitude relationship', () => {
    const quiet = measureRms(sine(200, 0.1));
    const loud = measureRms(sine(200, 0.2));
    expect(quiet).toBeCloseTo(0.1 / Math.sqrt(2), 3);
    expect(loud / quiet).toBeCloseTo(2, 5);
    expect(rmsToDb(loud) - rmsToDb(quiet)).toBeCloseTo(6.0206, 3);
    expect(Number.isFinite(rmsToDb(0))).toBe(true);
  });
  it.each([44100, 48000, 96000])('analyzes genuine voiced input at %i Hz sample rate', rate => {
    const a = new AudioAnalyzer(DEFAULTS).analyze(sine(200, 0.2, rate), rate, 100);
    expect(a.voiced).toBe(true);
    expect(a.pitch).toBeCloseTo(200, 0);
    expect(a.lastValidAt).toBe(100);
    expect(a.db).toBeGreaterThan(-20);
  });
  it('gates quiet periodic noise and invalidates silent frames immediately', () => {
    const analyzer = new AudioAnalyzer(DEFAULTS);
    expect(analyzer.analyze(sine(200, 0.0001), 48000, 100).voiced).toBe(false);
    expect(analyzer.analyze(sine(200), 48000, 125).voiced).toBe(true);
    const silent = analyzer.analyze(new Float32Array(4608), 48000, 150);
    expect(silent.voiced).toBe(false);
    expect(silent.lastValidAt).toBe(125);
  });
  it('uses separate attack and release times', () => {
    const loudness = new LoudnessDetector();
    loudness.update(-60, 25, 20, 200);
    const attack = loudness.update(-20, 25, 20, 200);
    const release = loudness.update(-60, 25, 20, 200);
    expect(attack).toBeGreaterThan(-35);
    expect(attack - release).toBeLessThan(6);
  });
});
