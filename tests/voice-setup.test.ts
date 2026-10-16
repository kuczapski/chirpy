import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../src/config/GameConfig';
import { hasVoiceSetup, resetCalibration, saveCalibration } from '../src/controls/CalibrationManager';

describe('manual and measured voice setup', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    resetCalibration();
  });
  afterEach(() => { resetCalibration(); vi.unstubAllGlobals(); });

  it('accepts explicitly saved manual ranges without requiring measured calibration', () => {
    expect(hasVoiceSetup('')).toBe(false);
    const settings = { ...DEFAULTS, pitchMin: 160, pitchMax: 420, minDb: -45, maxDb: -16 };
    expect(saveCalibration(settings, 'manual')).toBe(true);
    expect(hasVoiceSetup('')).toBe(true);
    expect(JSON.parse(storage.get('chirpy-calibration-v1')!).source).toBe('manual');
    expect(JSON.parse(storage.get('chirpy-calibration-v1')!).settings).toEqual(settings);
  });
  it('recognizes manual setup restored from storage', () => {
    storage.set('chirpy-calibration-v1', JSON.stringify({ version: 1, deviceId: '', settings: DEFAULTS, source: 'manual' }));
    expect(hasVoiceSetup('')).toBe(true);
  });
  it('still supports existing measured profiles and requires setup for a different device', () => {
    storage.set('chirpy-calibration-v1', JSON.stringify({ version: 1, deviceId: '', settings: DEFAULTS }));
    expect(hasVoiceSetup('')).toBe(true);
    expect(hasVoiceSetup('another-mic')).toBe(false);
  });
  it('clears manual setup when calibration is explicitly reset', () => {
    saveCalibration(DEFAULTS, 'manual');
    resetCalibration();
    expect(hasVoiceSetup('')).toBe(false);
  });
  it('does not accept invalid manual ranges', () => {
    expect(saveCalibration({ ...DEFAULTS, pitchMax: DEFAULTS.pitchMin }, 'manual')).toBe(false);
    expect(hasVoiceSetup('')).toBe(false);
  });
  it('keeps the explicit choice for this visit if storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(saveCalibration(DEFAULTS, 'manual')).toBe(false);
    expect(hasVoiceSetup('')).toBe(true);
    resetCalibration();
    expect(hasVoiceSetup('')).toBe(false);
  });
});
