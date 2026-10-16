import type { AudioInput } from '../audio/AudioInput';
import type { Analysis } from '../audio/types';
import { clamp, type Settings } from '../config/GameConfig';
import { CALIBRATION_STEPS, CALIBRATION_TIMING, assessStep, calibrationSettings, uncalibratedDefaults, type StepResult } from '../controls/CalibrationManager';
import { Modal } from './Modal';

export interface CalibrationOutcome { settings: Settings; personalized: boolean }
export class CalibrationWizard {
  private step = 0;
  private results: StepResult[] = [];
  private timer = 0;
  private unsubscribe: (() => void) | null = null;
  private resolve: ((result: CalibrationOutcome | null) => void) | null = null;
  private working: Settings;
  constructor(private modal: Modal, private input: AudioInput, private original: Settings) {
    this.working = { ...original, detectionMin: Math.min(original.detectionMin, 60), detectionMax: Math.max(original.detectionMax, 1200) };
  }
  run(): Promise<CalibrationOutcome | null> {
    this.input.configure(this.working);
    return new Promise(resolve => { this.resolve = resolve; this.render(); });
  }
  cancel(): void { this.finish(null); }
  private clearRecording(): void {
    window.clearInterval(this.timer); this.timer = 0;
    this.unsubscribe?.(); this.unsubscribe = null;
  }
  private finish(result: CalibrationOutcome | null): void {
    this.clearRecording();
    this.input.configure(result?.settings ?? this.original);
    this.modal.close();
    this.resolve?.(result); this.resolve = null;
  }
  private render(): void {
    this.clearRecording();
    const stage = CALIBRATION_STEPS[this.step];
    this.modal.show(`
      <div class="modal-top"><span class="eyebrow">MICROPHONE SETUP</span><button class="icon-button" id="cal-cancel" aria-label="Cancel microphone setup">×</button></div>
      <div class="step-dots" aria-label="Step ${this.step + 1} of 6">${CALIBRATION_STEPS.map((_, i) => `<span class="${i <= this.step ? 'done' : ''}"></span>`).join('')}</div>
      <div class="cal-icon" aria-hidden="true">${stage.icon}</div>
      <p class="small-label">STEP ${this.step + 1} OF 6</p><h2>${stage.title}</h2>
      <p class="modal-copy">${stage.prompt}</p>
      <div class="cal-meter"><span id="cal-level"></span></div>
      <p id="cal-live" class="hint">Take a breath. Start whenever you’re ready.</p>
      <progress id="cal-progress" max="1" value="0" aria-label="Measurement progress"></progress>
      <p id="cal-message" class="form-message" aria-live="polite"></p>
      <div class="button-row"><button id="cal-record" class="button primary">Start listening</button><button id="cal-next" class="button secondary" disabled>${this.step === 5 ? 'Finish setup' : 'Next step'} →</button></div>
      <div class="cal-bottom"><button id="cal-back" class="text-button" ${this.step === 0 ? 'disabled' : ''}>← Previous step</button><button id="cal-defaults" class="text-button">Use default ranges</button></div>
      <p class="fine-print">Default ranges are not personalized. You can adjust them in Settings. Your voice is processed here and never recorded.</p>
    `, () => this.cancel());
    this.modal.query('#cal-cancel').onclick = () => this.cancel();
    this.modal.query('#cal-record').onclick = () => this.record();
    this.modal.query('#cal-back').onclick = () => { this.step--; this.render(); };
    this.modal.query('#cal-defaults').onclick = () => this.finish({ settings: uncalibratedDefaults(this.original), personalized: false });
    this.modal.query('#cal-next').onclick = () => {
      if (this.step < 5) { this.step++; this.render(); }
      else {
        const settings = calibrationSettings(this.results, this.working);
        if (!settings) {
          this.modal.query('#cal-message').textContent = 'We need a little more difference between low/high and quiet/loud, with less room noise. Use Previous step to retry, or choose default ranges.';
          return;
        }
        this.finish({ settings, personalized: true });
      }
    };
  }
  private record(): void {
    this.clearRecording();
    const stage = CALIBRATION_STEPS[this.step];
    const frames: Analysis[] = [];
    const record = this.modal.query<HTMLButtonElement>('#cal-record');
    const next = this.modal.query<HTMLButtonElement>('#cal-next');
    const back = this.modal.query<HTMLButtonElement>('#cal-back');
    record.disabled = true; next.disabled = true; back.disabled = true;
    record.textContent = 'Listening…';
    this.modal.query('#cal-message').textContent = '';
    const start = performance.now();
    this.unsubscribe = this.input.subscribe(frame => {
      if (frame.timestamp < start + CALIBRATION_TIMING.settleMs) return;
      frames.push(frame);
      this.modal.query<HTMLElement>('#cal-level').style.width = `${clamp((frame.rawDb + 80) / 70) * 100}%`;
      this.modal.query('#cal-live').textContent = this.step === 0 ? 'Listening to your room…'
        : frame.voiced ? `We hear you! ${Math.round(frame.pitch)} Hz · ${Math.round(frame.rawDb)} dBFS`
          : frame.rawDb <= this.working.noiseGate ? 'Move a little nearer, then use your comfortable voice.'
          : 'We hear sound. Try “AAAA” or a gentle hum; small changes are fine.';
    });
    this.timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const assessment = assessStep(this.step, frames);
      this.modal.query<HTMLProgressElement>('#cal-progress').value = Math.min(assessment.progress, clamp(elapsed / stage.duration));
      if (elapsed < stage.duration) return;
      if (stage.voiced && !assessment.result && elapsed < CALIBRATION_TIMING.maxListenMs) {
        this.modal.query('#cal-message').textContent = 'Take your time. We’re collecting little moments of your voice. Pauses are okay.';
        return;
      }
      this.clearRecording();
      const result = assessment.result;
      record.disabled = false; record.textContent = 'Try this step again'; back.disabled = this.step === 0;
      if (!result) {
        this.modal.query('#cal-message').textContent = assessment.reason === 'varying-pitch'
          ? 'Try one comfortable note, or a gentle hum. Small pitch changes are okay. You can also use default ranges.'
          : frames.length < 12 ? 'The microphone is not sending enough audio. Retry access from Microphone Setup, or use default ranges.'
          : 'We heard sound, but need a little more clear voice. Try a gentle hum nearer the microphone, or use default ranges. You do not need to be louder.';
        return;
      }
      this.results[this.step] = result;
      if (this.step === 0) {
        this.working.noiseGate = clamp(result.db + 6, -100, -5);
        this.input.configure(this.working);
      }
      next.disabled = false;
      this.modal.query('#cal-message').textContent = this.step === 0 ? 'Room sound measured. Ready for your voice!' : 'Got it! Your voice is coming through clearly.';
      next.focus();
    }, 60);
  }
}
