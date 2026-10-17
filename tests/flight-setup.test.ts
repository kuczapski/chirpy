import { describe, expect, it } from 'vitest';
import { DEFAULTS, FIELD, validateSettings } from '../src/config/GameConfig';
import { LOUDNESS_PROFILES, PITCH_PROFILES, withLoudnessProfile, withPitchProfile } from '../src/config/VoiceProfiles';
import { alignToTarget } from '../src/controls/ControlMode';

describe('single-axis flights', () => {
  const bird = { x: 200, y: 450, nx: 0.1, ny: 0.3, valid: true };
  const cherry = { x: 800, y: 250 };
  it('pitch controls only height and automatically follows a new cherry column', () => {
    expect(alignToTarget(bird, cherry, 'pitch')).toMatchObject({ x: 800, y: 450, valid: true });
    expect(alignToTarget(bird, { x: 400, y: 150 }, 'pitch')).toMatchObject({ x: 400, y: 450 });
  });
  it('loudness controls only horizontal position and follows a new cherry row', () => {
    expect(alignToTarget(bird, cherry, 'loudness')).toMatchObject({ x: 200, y: 250, valid: true });
    expect(alignToTarget(bird, { x: 400, y: 150 }, 'loudness')).toMatchObject({ x: 200, y: 150 });
  });
  it('full control leaves both axes under voice control', () => {
    expect(alignToTarget(bird, cherry, 'full')).toEqual(bird);
  });
  it('automatic alignment never makes silence a valid signal', () => {
    for (const mode of ['pitch', 'loudness', 'full'] as const) {
      expect(alignToTarget({ ...bird, valid: false }, cherry, mode).valid).toBe(false);
    }
  });
  it('reports normalized coordinates corresponding to the aligned position', () => {
    expect(alignToTarget(bird, { x: FIELD.right, y: FIELD.top }, 'pitch').nx).toBe(1);
    expect(alignToTarget(bird, { x: FIELD.right, y: FIELD.top }, 'loudness').ny).toBe(1);
  });
});

describe('voice preset combinations', () => {
  for (const pitch of Object.keys(PITCH_PROFILES) as (keyof typeof PITCH_PROFILES)[]) {
    for (const loudness of Object.keys(LOUDNESS_PROFILES) as (keyof typeof LOUDNESS_PROFILES)[]) {
      it(`${pitch} + ${loudness} produces usable independent ranges`, () => {
        const configured = withLoudnessProfile(withPitchProfile(DEFAULTS, pitch), loudness);
        expect(validateSettings(configured)).toBeNull();
        expect(configured.pitchMin).toBe(PITCH_PROFILES[pitch].min);
        expect(configured.minDb).toBe(LOUDNESS_PROFILES[loudness].min);
        expect(configured.noiseGate).toBeLessThan(configured.minDb);
        expect(configured.detectionMin).toBeLessThanOrEqual(configured.pitchMin);
      });
    }
  }
  it('preserves unrelated manual choices and never mutates the saved object', () => {
    const manual = { ...DEFAULTS, captureHold: 720, volume: 0.1, deviceId: 'my-mic', controlMode: 'pitch' as const };
    const result = withPitchProfile(manual, 'low');
    expect(result).toMatchObject({ captureHold: 720, volume: 0.1, deviceId: 'my-mic', controlMode: 'pitch' });
    expect(manual.pitchMin).toBe(DEFAULTS.pitchMin);
  });
});
