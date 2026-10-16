import { describe, expect, it } from 'vitest';
import { DEFAULTS, FIELD, validateSettings } from '../src/config/GameConfig';
import { normalizeVoice, VoiceMapper } from '../src/controls/VoiceMapper';
import { simulatedAnalysis } from '../src/controls/SimulationController';
import { calibrationSettings, evaluateStep } from '../src/controls/CalibrationManager';
import { CaptureTracker } from '../src/game/CaptureTracker';
import { emptyAnalysis, type Analysis } from '../src/audio/types';

const voice = (pitch: number, db: number, timestamp: number): Analysis => ({
  pitch, db, rawDb: db, rms: 10 ** (db / 20), confidence: 0.98, voiced: true, timestamp, lastValidAt: timestamp,
});
describe('independent voice-to-position mapping', () => {
  it('maps pitch upward and loudness right, without changing the other axis', () => {
    const low = normalizeVoice(160, -40, DEFAULTS);
    const high = normalizeVoice(400, -40, DEFAULTS);
    const loud = normalizeVoice(160, -20, DEFAULTS);
    expect(high.ny).toBeGreaterThan(low.ny); expect(high.nx).toBe(low.nx);
    expect(loud.nx).toBeGreaterThan(low.nx); expect(loud.ny).toBe(low.ny);
  });
  it('supports linear and musical halfway points and clamps extremes', () => {
    expect(normalizeVoice(Math.sqrt(140 * 440), -30, DEFAULTS).ny).toBeCloseTo(0.5);
    expect(normalizeVoice(290, -30, { ...DEFAULTS, mapping: 'linear' }).ny).toBeCloseTo(0.5);
    expect(normalizeVoice(900, 0, DEFAULTS)).toEqual({ nx: 1, ny: 1 });
    expect(normalizeVoice(50, -100, DEFAULTS)).toEqual({ nx: 0, ny: 0 });
  });
  it('is position-based and converges to the same place at different frame rates', () => {
    const simulate = (hz: number) => {
      const mapper = new VoiceMapper();
      let position = mapper.update(emptyAnalysis(), 0, 0, DEFAULTS);
      for (let i = 1; i <= hz * 2; i++) {
        const time = 100 + i * 1000 / hz;
        position = mapper.update(voice(250, -30, time), time, 1000 / hz, DEFAULTS);
      }
      return position;
    };
    const p30 = simulate(30), p60 = simulate(60);
    // Adaptive smoothing crosses its near-target boundary on a render frame;
    // require sub-pixel equivalence rather than identical integration steps.
    expect(Math.abs(p30.x - p60.x)).toBeLessThan(0.1); expect(Math.abs(p30.y - p60.y)).toBeLessThan(0.1);
    expect(p60.nx).toBeCloseTo(0.5, 3);
  });
  it('holds through brief invalid frames and returns gently after sustained silence', () => {
    const mapper = new VoiceMapper();
    const settings = { ...DEFAULTS, pitchSmoothing: 0, loudnessSmoothing: 0 };
    const before = mapper.update(voice(400, -20, 100), 100, 100, settings);
    const invalid = { ...voice(10000, 0, 125), voiced: false, confidence: 0.1 };
    const held = mapper.update(invalid, 125, 25, settings);
    expect(held.x).toBeCloseTo(before.x, 4); expect(held.y).toBeCloseTo(before.y, 4);
    expect(held.valid).toBe(false);
    const rest = mapper.update(invalid, 500, 16, settings);
    expect(rest.x).toBeLessThan(held.x); expect(rest.y).toBeGreaterThan(held.y);
    expect(Math.abs(rest.x - held.x)).toBeLessThan(60);
  });
  it('rejects stale voiced samples', () => {
    expect(new VoiceMapper().update(voice(200, -30, 100), 500, 16, DEFAULTS).valid).toBe(false);
  });
  it('simulation correctly inverts the screen coordinates', () => {
    const a = simulatedAnalysis(FIELD.right, FIELD.top, true, 100, DEFAULTS);
    expect(a.pitch).toBeCloseTo(DEFAULTS.pitchMax); expect(a.db).toBe(DEFAULTS.maxDb);
    expect(a.voiced).toBe(true);
  });
});
describe('collection and calibration', () => {
  it('requires the full hold and resets on silence or leaving the cherry', () => {
    const capture = new CaptureTracker();
    for (let i = 0; i < 7; i++) expect(capture.update(true, true, 50, 400)).toBe(false);
    expect(capture.update(true, false, 50, 400)).toBe(false);
    expect(capture.elapsed).toBe(0);
    for (let i = 0; i < 7; i++) capture.update(true, true, 50, 400);
    expect(capture.update(true, true, 50, 400)).toBe(true);
    expect(capture.elapsed).toBe(0);
    capture.update(true, true, 50, 400); capture.update(false, true, 50, 400);
    expect(capture.elapsed).toBe(0);
  });
  it('requires enough reliable voiced samples during calibration', () => {
    expect(evaluateStep(1, Array.from({ length: 20 }, () => voice(200, -30, 100)))).toBeNull();
    expect(evaluateStep(1, Array.from({ length: 60 }, () => emptyAnalysis()))).toBeNull();
    expect(evaluateStep(1, Array.from({ length: 60 }, (_, i) => voice(200, -30, 100 + i * 25)))?.pitch).toBe(200);
  });
  it('builds personalized ranges and rejects indistinguishable levels', () => {
    const results = [[0, -65], [250, -30], [180, -30], [400, -30], [250, -40], [250, -20]]
      .map(([pitch, db]) => ({ pitch, db, samples: 60 }));
    const settings = calibrationSettings(results, DEFAULTS);
    expect(settings?.pitchMin).toBe(180); expect(settings?.maxDb).toBe(-20);
    expect(settings?.noiseGate).toBe(-59);
    results[5].db = -39;
    expect(calibrationSettings(results, DEFAULTS)).toBeNull();
  });
  it('validates numeric boundaries and independent range ordering', () => {
    expect(validateSettings(DEFAULTS)).toBeNull();
    expect(validateSettings({ ...DEFAULTS, pitchMax: DEFAULTS.pitchMin })).toBeTruthy();
    expect(validateSettings({ ...DEFAULTS, maxDb: DEFAULTS.minDb })).toBeTruthy();
    expect(validateSettings({ ...DEFAULTS, volume: NaN })).toBeTruthy();
    expect(validateSettings({ ...DEFAULTS, noiseGate: -30 })).toBeTruthy();
  });
});
