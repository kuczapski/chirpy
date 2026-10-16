import { describe, expect, it } from 'vitest';
import { AudioAnalyzer } from '../src/audio/AudioAnalyzer';
import { emptyAnalysis, type Analysis } from '../src/audio/types';
import { DEFAULTS, FIELD } from '../src/config/GameConfig';
import { assessStep, evaluateStep } from '../src/controls/CalibrationManager';
import { VoiceMapper } from '../src/controls/VoiceMapper';
import { LoudnessControl } from '../src/controls/LoudnessControl';

const frame = (timestamp: number, pitch = 200, db = -30): Analysis => ({
  pitch, confidence: 0.9, db, rawDb: db, rms: 10 ** (db / 20), voiced: true, timestamp, lastValidAt: timestamp,
});

describe('calibration with an imperfect voice', () => {
  it('collects usable moments around a delayed start and short breathing pauses', () => {
    const frames = Array.from({ length: 240 }, (_, i) =>
      i < 100 || i % 20 < 6 ? { ...emptyAnalysis(), timestamp: i * 25 } : frame(i * 25, 200 + 8 * Math.sin(i)));
    expect(evaluateStep(1, frames)?.pitch).toBeGreaterThan(190);
  });
  it('discards occasional octave errors instead of rejecting the whole step', () => {
    const frames = Array.from({ length: 110 }, (_, i) => frame(i * 25, i % 4 === 0 ? 400 : 200 + 5 * Math.sin(i)));
    expect(evaluateStep(1, frames)?.pitch).toBeCloseTo(200, -1);
  });
  it('uses voiced duration rather than requiring a fast processing cadence', () => {
    expect(evaluateStep(1, Array.from({ length: 24 }, (_, i) => frame(i * 90)))?.pitch).toBe(200);
  });
  it('does not count missing audio, duplicate timestamps, silence, or a short burst as enough voice', () => {
    expect(evaluateStep(1, Array.from({ length: 100 }, () => frame(100)))).toBeNull();
    expect(evaluateStep(1, Array.from({ length: 6 }, (_, i) => frame(i * 1000)))).toBeNull();
    expect(evaluateStep(1, Array.from({ length: 100 }, (_, i) => ({ ...emptyAnalysis(), timestamp: i * 25 })))).toBeNull();
    expect(evaluateStep(1, Array.from({ length: 20 }, (_, i) => frame(i * 25)))).toBeNull();
  });
  it('still rejects a broad sweep without a representative comfortable pitch', () => {
    const frames = Array.from({ length: 180 }, (_, i) => frame(i * 25, 80 * 2 ** (i / 45)));
    expect(assessStep(1, frames).reason).toBe('varying-pitch');
  });
  it('ignores a short background bump when measuring the room floor', () => {
    const frames = Array.from({ length: 80 }, (_, i) => frame(i * 25, 0, i < 15 ? -25 : -60));
    expect(evaluateStep(0, frames)?.db).toBe(-60);
  });
});

describe('natural vowel analysis', () => {
  it('tracks a harmonic vowel with vibrato, changing amplitude, and breath noise', () => {
    const analyzer = new AudioAnalyzer(DEFAULTS);
    const samples = new Float32Array(4608);
    let seed = 42, voiced = 0;
    for (let index = 0; index < 100; index++) {
      for (let i = 0; i < samples.length; i++) {
        const t = (index * 1200 + i) / 48000;
        const phase = 2 * Math.PI * 155 * t - 155 * 0.035 / 5 * Math.cos(2 * Math.PI * 5 * t);
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        samples[i] = 0.13 * (1 + 0.18 * Math.sin(2 * Math.PI * 4 * t))
          * (Math.sin(phase) + 0.45 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase))
          + 0.025 * seed / 2147483648;
      }
      const result = analyzer.analyze(samples, 48000, 100 + index * 25);
      if (result.voiced && result.pitch > 140 && result.pitch < 170) voiced++;
    }
    expect(voiced).toBeGreaterThan(90);
  });
});

describe('stable horizontal control', () => {
  it('suppresses short loudness ripples while keeping a sustained level change responsive', () => {
    const mapper = new VoiceMapper();
    const positions: number[] = [];
    for (let t = 0; t < 3000; t += 25) {
      const position = mapper.update(frame(t, 200, -30 + 2 * Math.sin(2 * Math.PI * 5 * t / 1000)), t, 25, DEFAULTS);
      if (t > 1200) positions.push(position.x);
    }
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(15);
    let last = mapper.update(frame(3000, 200, -20), 3000, 25, DEFAULTS);
    for (let t = 3025; t <= 3450; t += 25) last = mapper.update(frame(t, 200, -20), t, 25, DEFAULTS);
    expect(last.nx).toBeGreaterThan(0.83);
  });
  it('holds its destination through chime feedback protection, without a leftward return', () => {
    const mapper = new VoiceMapper();
    const settings = { ...DEFAULTS, pitchSmoothing: 0, loudnessSmoothing: 0 };
    const initial = mapper.update(frame(100, 300, -24), 100, 100, settings);
    for (let t = 125; t <= 500; t += 25) {
      const held = mapper.update(emptyAnalysis(), t, 25, settings, true);
      expect(held.x).toBeCloseTo(initial.x, 4);
      expect(held.y).toBeCloseTo(initial.y, 4);
      expect(held.valid).toBe(false);
    }
  });
  it('still reaches both horizontal endpoints', () => {
    const mapper = new VoiceMapper();
    let last = mapper.update(frame(0), 0, 25, DEFAULTS);
    for (let t = 25; t <= 2500; t += 25) last = mapper.update(frame(t, 200, DEFAULTS.maxDb), t, 25, DEFAULTS);
    expect(last.x).toBeCloseTo(FIELD.right, 0);
    for (let t = 2525; t <= 5000; t += 25) last = mapper.update(frame(t, 200, DEFAULTS.minDb), t, 25, DEFAULTS);
    expect(last.x).toBeCloseTo(FIELD.left, 0);
  });
  it('adds each audio timestamp only once, regardless of rendering frequency', () => {
    const control = new LoudnessControl();
    control.update(-30, 100, -42, -18, 0.012);
    const first = control.update(-20, 125, -42, -18, 0.012);
    for (let i = 0; i < 20; i++) expect(control.update(-20, 125, -42, -18, 0.012)).toBe(first);
  });
});
