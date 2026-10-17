import { validateSettings, type ControlMode, type Settings } from '../config/GameConfig';
import { LOUDNESS_PROFILES, PITCH_PROFILES, withLoudnessProfile, withPitchProfile } from '../config/VoiceProfiles';
import { Modal } from './Modal';

export const MODE_LABELS: Record<ControlMode, string> = { pitch: 'Pitch', loudness: 'Loudness', full: 'Full Control' };
interface Actions {
  start: (settings: Settings) => void;
  manual: (settings: Settings) => void;
  wizard: (settings: Settings) => void;
  cancel: () => void;
}
export function showFlightSetup(modal: Modal, settings: Settings, simulation: boolean, actions: Actions): void {
  let draft = { ...settings };
  const modes = [
    ['pitch', '↕', 'Pitch', 'Sing higher or lower. Chirpy lines up below the cherry.'],
    ['loudness', '↔', 'Loudness', 'Use a softer or fuller voice. Chirpy lines up at cherry height.'],
    ['full', '✦', 'Full Control', 'Explore both together: pitch for height, loudness for left and right.'],
  ];
  modal.show(`
    <div class="modal-top"><span class="eyebrow">CHOOSE YOUR FLIGHT</span><button id="flight-close" class="icon-button" aria-label="Close flight setup">×</button></div>
    <h2>How will you soar today?</h2><p class="modal-copy">One little skill, or a whole sky of possibilities.</p>
    <form id="flight-form">
      <fieldset class="mode-field"><legend>1 · Choose your controls</legend><div class="mode-options">
        ${modes.map(([value, icon, label, description]) => `<label class="mode-option"><input type="radio" name="controlMode" value="${value}" ${draft.controlMode === value ? 'checked' : ''}><span><b class="mode-symbol" aria-hidden="true">${icon}</b><strong>${label}</strong><small>${description}</small></span></label>`).join('')}
      </div></fieldset>
      <fieldset><legend>2 · Start with your voice</legend>
        <p class="hint">Keep your saved ranges, or pick a starting point. These presets aren’t personal measurements; choose what feels comfortable.</p>
        <span class="profile-label">Pitch range</span><div class="profile-options">
          <label><input type="radio" name="pitchProfile" value="saved" checked><span>Current settings</span></label>
          ${Object.entries(PITCH_PROFILES).map(([key, p]) => `<label><input type="radio" name="pitchProfile" value="${key}"><span>${p.label}</span></label>`).join('')}
        </div>
        <p id="flight-pitch-range" class="hint"></p>
        <span class="profile-label">Voice loudness</span><div class="profile-options">
          <label><input type="radio" name="loudnessProfile" value="saved" checked><span>Current settings</span></label>
          ${Object.entries(LOUDNESS_PROFILES).map(([key, p]) => `<label><input type="radio" name="loudnessProfile" value="${key}"><span>${p.label}</span></label>`).join('')}
        </div>
        <div class="form-grid advanced-grid">
          <label>Quiet end · dBFS<input name="minDb" type="number" min="-90" max="-1" step="1" required value="${draft.minDb}"></label>
          <label>Fuller end · dBFS<input name="maxDb" type="number" min="-89" max="0" step="1" required value="${draft.maxDb}"></label>
          <label class="wide">Success sound volume<input name="volume" type="range" min="0" max="1" step="0.05" value="${draft.volume}"></label>
        </div><p class="hint">Voice levels control sensitivity to your microphone. Sound volume only changes the chime. Quiet means a soft voice, not silence. There’s no need to shout.</p>
      </fieldset>
      <div class="flight-alternatives"><span class="profile-label">Want a personal fit?</span><div class="button-row"><button id="flight-manual" type="button" class="button secondary">Manual configuration</button><button id="flight-wizard" type="button" class="button secondary">Microphone Setup</button></div></div>
      <p id="flight-error" class="form-message" role="status"></p>
      <div class="settings-actions"><button id="flight-back" type="button" class="text-button">Back</button><button id="flight-start" type="submit" class="button primary">${simulation ? 'Start simulation' : 'Start flying'} →</button></div>
    </form>
  `, actions.cancel);
  const form = modal.query<HTMLFormElement>('#flight-form');
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const refreshRanges = (): void => {
    modal.query('#flight-pitch-range').textContent = `${draft.pitchMin}–${draft.pitchMax} Hz · Only the selected control axis needs practice.`;
    field('minDb').value = String(draft.minDb); field('maxDb').value = String(draft.maxDb);
  };
  refreshRanges();
  form.querySelectorAll<HTMLInputElement>('[name="pitchProfile"]').forEach(input => {
    input.onchange = () => {
      draft = input.value === 'saved' ? { ...draft, pitchMin: settings.pitchMin, pitchMax: settings.pitchMax,
        detectionMin: settings.detectionMin, detectionMax: settings.detectionMax } : withPitchProfile(draft, input.value as keyof typeof PITCH_PROFILES);
      modal.query('#flight-pitch-range').textContent = `${draft.pitchMin}–${draft.pitchMax} Hz · Only the selected control axis needs practice.`;
    };
  });
  form.querySelectorAll<HTMLInputElement>('[name="loudnessProfile"]').forEach(input => {
    input.onchange = () => {
      draft = input.value === 'saved' ? { ...draft, minDb: settings.minDb, maxDb: settings.maxDb, noiseGate: settings.noiseGate }
        : withLoudnessProfile(draft, input.value as keyof typeof LOUDNESS_PROFILES);
      refreshRanges();
    };
  });
  const read = (): Settings | null => {
    if (!form.reportValidity()) return null;
    const updated: Settings = { ...draft, controlMode: (form.elements.namedItem('controlMode') as RadioNodeList).value as ControlMode,
      minDb: Number(field('minDb').value), maxDb: Number(field('maxDb').value), volume: Number(field('volume').value) };
    updated.noiseGate = Math.min(updated.noiseGate, updated.minDb - 6);
    const error = validateSettings(updated);
    modal.query('#flight-error').textContent = error ?? '';
    return error ? null : updated;
  };
  form.onsubmit = event => { event.preventDefault(); const value = read(); if (value) actions.start(value); };
  modal.query('#flight-manual').onclick = () => { const value = read(); if (value) actions.manual(value); };
  modal.query('#flight-wizard').onclick = () => { const value = read(); if (value) actions.wizard(value); };
  modal.query('#flight-close').onclick = actions.cancel;
  modal.query('#flight-back').onclick = actions.cancel;
}
