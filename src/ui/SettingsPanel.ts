import { DEFAULTS, DIFFICULTIES, NUMBER_LIMITS, validateSettings, type Settings } from '../config/GameConfig';
import { resetCalibration, uncalibratedDefaults } from '../controls/CalibrationManager';
import type { AudioInput } from '../audio/AudioInput';
import { Modal } from './Modal';

type NumericKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
export async function showSettings(modal: Modal, settings: Settings, input: AudioInput,
  apply: (settings: Settings) => void, close: () => void, setup: () => void): Promise<void> {
  const field = (key: NumericKey, label: string, step = 1): string => {
    const limits = NUMBER_LIMITS[key]!;
    return `<label>${label}<input name="${key}" type="number" value="${settings[key]}" min="${limits[0]}" max="${limits[1]}" step="${step}" required></label>`;
  };
  const check = (key: 'debug' | 'showMeters' | 'reducedMotion', label: string): string =>
    `<label class="check"><input name="${key}" type="checkbox" ${settings[key] ? 'checked' : ''}>${label}</label>`;
  modal.show(`
    <div class="modal-top"><span class="eyebrow">MAKE IT YOURS</span><button type="button" id="settings-close" class="icon-button" aria-label="Close settings">×</button></div>
    <h2>Just your kind of flight.</h2><p class="modal-copy">Comfortable ranges. A gentler pace. Your choice.</p>
    <p class="hint">Saving uses your voice settings directly. Choose Microphone Setup only when you want to measure your ranges again.</p>
    <form id="settings-form">
      <fieldset><legend>Voice & movement</legend><div class="form-grid">
        <label class="wide">Flight controls<select name="controlMode"><option value="pitch">Pitch · height only</option><option value="loudness">Loudness · left and right only</option><option value="full">Full Control · both axes</option></select></label>
        ${field('pitchMin', 'Low pitch · Hz')}${field('pitchMax', 'High pitch · Hz')}
        ${field('minDb', 'Quiet voice · dBFS')}${field('maxDb', 'Loud voice · dBFS')}
        <label>Pitch mapping<select name="mapping"><option value="logarithmic">Musical / logarithmic</option><option value="linear">Linear in Hz</option></select></label>
        ${field('silenceTimeout', 'Hold during silence · ms')}
        ${field('pitchSmoothing', 'Pitch smoothing · ms')}${field('loudnessSmoothing', 'Loudness smoothing · ms')}
        ${field('deadband', 'Jitter deadband · 0–0.1', 0.001)}
      </div></fieldset>
      <fieldset><legend>Cherry collecting</legend><div class="form-grid">
        <label>Difficulty<select name="difficulty"><option value="easy">Easy · a gentle start</option><option value="normal">Normal · steady singing</option><option value="advanced">Advanced · fine control</option></select></label>
        ${field('captureRadius', 'Capture radius · pixels')}${field('captureHold', 'Capture hold · ms')}
        <label>Sound effects<input name="volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}" aria-label="Sound effects volume"></label>
      </div></fieldset>
      <fieldset><legend>Display</legend><div class="check-grid">${check('reducedMotion', 'Reduce decorative motion')}${check('showMeters', 'Show pitch & loudness')}${check('debug', 'Show audio debug details')}</div></fieldset>
      <details><summary>Microphone & advanced audio</summary>
        <div class="form-grid advanced-grid"><label class="wide">Input microphone<select name="deviceId" id="device-select"><option value="">System default microphone</option></select></label>
        ${field('noiseGate', 'Noise gate · dBFS')}${field('attackMs', 'Loudness attack · ms')}${field('releaseMs', 'Loudness release · ms')}
        ${field('detectionMin', 'Detect from · Hz')}${field('detectionMax', 'Detect to · Hz')}
        <label>Analysis window<select name="windowMs"><option value="64">64 ms · faster response</option><option value="96">96 ms · balanced</option><option value="128">128 ms · steadier low notes</option></select></label></div>
        <p class="hint">Device names appear after microphone permission. A changed input is opened safely on your next voice session.</p>
        <div class="button-row"><button type="button" class="button secondary small" id="settings-setup">Microphone Setup / retry access</button><button type="button" id="reset-calibration" class="text-button">Reset calibration</button></div>
      </details>
      <p class="form-message" id="settings-error" role="status"></p>
      <div class="settings-actions"><button type="button" id="restore-defaults" class="text-button">Restore defaults</button><button type="submit" class="button primary">Save settings</button></div>
    </form>
  `, close);
  const form = modal.query<HTMLFormElement>('#settings-form');
  const control = <T extends HTMLInputElement | HTMLSelectElement>(key: keyof Settings): T => form.elements.namedItem(key) as T;
  control('mapping').value = settings.mapping;
  control('controlMode').value = settings.controlMode;
  control('difficulty').value = settings.difficulty;
  control('windowMs').value = String(settings.windowMs);
  modal.query('#settings-close').onclick = close;
  modal.query('#settings-setup').onclick = setup;
  control('difficulty').onchange = () => {
    const difficulty = DIFFICULTIES[control('difficulty').value as Settings['difficulty']];
    control('captureRadius').value = String(difficulty.radius);
    control('captureHold').value = String(difficulty.hold);
  };
  modal.query('#reset-calibration').onclick = () => {
    resetCalibration();
    const defaults = uncalibratedDefaults(settings);
    for (const key of ['pitchMin', 'pitchMax', 'minDb', 'maxDb', 'noiseGate', 'detectionMin', 'detectionMax'] as const) control(key).value = String(defaults[key]);
    modal.query('#settings-error').textContent = 'Calibration cleared. Save to use default ranges, or open Microphone Setup.';
  };
  modal.query('#restore-defaults').onclick = () => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const element = control(key as keyof Settings);
      if (!element) continue;
      if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = Boolean(value);
      else element.value = String(value);
    }
  };
  form.onsubmit = event => {
    event.preventDefault();
    const updated = { ...settings };
    for (const key of Object.keys(NUMBER_LIMITS) as NumericKey[]) updated[key] = Number(control(key).value);
    updated.mapping = control('mapping').value as Settings['mapping'];
    updated.controlMode = control('controlMode').value as Settings['controlMode'];
    updated.difficulty = control('difficulty').value as Settings['difficulty'];
    updated.deviceId = control('deviceId').value;
    for (const key of ['debug', 'showMeters', 'reducedMotion'] as const) updated[key] = control<HTMLInputElement>(key).checked;
    const error = validateSettings(updated);
    if (error) { modal.query('#settings-error').textContent = error; return; }
    apply(updated); close();
  };
  try {
    const devices = await input.devices();
    if (!form.isConnected) return;
    const select = control<HTMLSelectElement>('deviceId');
    devices.forEach((device, index) => {
      if (!device.deviceId) return;
      const option = document.createElement('option');
      option.value = device.deviceId; option.textContent = device.label || `Microphone ${index + 1}`;
      select.append(option);
    });
    if (settings.deviceId && !devices.some(device => device.deviceId === settings.deviceId)) {
      const option = new Option('Previously selected microphone (unavailable)', settings.deviceId);
      select.append(option);
    }
    select.value = settings.deviceId;
  } catch { /* System default remains selectable when enumeration is blocked. */ }
}
