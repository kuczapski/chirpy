import workletUrl from './audio-worklet.ts?worker&url';
import { emptyAnalysis, type Analysis } from './types';
import type { Settings } from '../config/GameConfig';

export class AudioInput {
  latest: Analysis = emptyAnalysis();
  sampleRate = 0;
  latencyMs = 0;
  backend = 'Not connected';
  onError: ((message: string) => void) | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private worker: Worker | null = null;
  private generation = 0;
  private listeners = new Set<(analysis: Analysis) => void>();
  get active(): boolean { return this.stream !== null && this.context?.state === 'running'; }
  subscribe(listener: (analysis: Analysis) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async start(settings: Settings): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access needs HTTPS or localhost. You can still explore with Simulation Mode.');
    }
    // Create/resume from the initiating click, before the permission prompt resolves.
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    try {
      await context.resume();
      const supported = navigator.mediaDevices.getSupportedConstraints();
      const audio: MediaTrackConstraints = { channelCount: { ideal: 1 } };
      if (supported.echoCancellation) audio.echoCancellation = false;
      if (supported.noiseSuppression) audio.noiseSuppression = false;
      if (supported.autoGainControl) audio.autoGainControl = false;
      if (settings.deviceId) audio.deviceId = { exact: settings.deviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Microphone request canceled.');
      }
      this.stream = stream;
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation === this.generation) this.fail('The microphone was disconnected. Reconnect it, then try again.');
      }));
      this.sampleRate = context.sampleRate;
      this.latencyMs = settings.windowMs + (context.baseLatency || 0) * 1000;
      this.worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
      this.worker.postMessage({ type: 'configure', options: settings });
      this.worker.onerror = () => this.fail('Audio analysis could not start. Please retry microphone access.');
      this.source = context.createMediaStreamSource(stream);
      this.mute = context.createGain();
      this.mute.gain.value = 0;
      this.mute.connect(context.destination);
      let worklet: AudioWorkletNode | null = null;
      if (context.audioWorklet) {
        try {
          await context.audioWorklet.addModule(workletUrl);
          if (generation !== this.generation) throw new Error('Microphone request canceled.');
          worklet = new AudioWorkletNode(context, 'chirpy-capture', {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
            processorOptions: { windowMs: settings.windowMs },
          });
        } catch {
          if (generation !== this.generation) throw new Error('Microphone request canceled.');
          // Older browsers / worklet policy restrictions use the same worker via ScriptProcessor.
        }
      }
      let busy = false;
      if (worklet) {
        this.backend = 'AudioWorklet + worker';
        const capture = worklet;
        capture.port.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
          this.worker?.postMessage({ type: 'frame', buffer: event.data.buffer,
            rate: context.sampleRate, timestamp: performance.now() }, [event.data.buffer]);
        };
        capture.onprocessorerror = () => this.fail('Microphone processing stopped. Please retry.');
        this.processor = capture;
      } else {
        this.backend = 'Compatibility capture + worker';
        const size = settings.windowMs <= 64 ? 2048 : settings.windowMs <= 96 ? 4096 : 8192;
        const fallback = context.createScriptProcessor(size, 1, 1);
        this.latencyMs = size / context.sampleRate * 1000 + (context.baseLatency || 0) * 1000;
        fallback.onaudioprocess = event => {
          if (busy || !this.worker) return;
          busy = true;
          const copy = event.inputBuffer.getChannelData(0).slice();
          this.worker.postMessage({ type: 'frame', buffer: copy.buffer,
            rate: context.sampleRate, timestamp: performance.now() }, [copy.buffer]);
        };
        this.processor = fallback;
      }
      this.worker.onmessage = (event: MessageEvent<{ analysis: Analysis; buffer: ArrayBuffer }>) => {
        if (generation !== this.generation) return;
        this.latest = event.data.analysis;
        this.listeners.forEach(listener => listener(this.latest));
        busy = false;
        worklet?.port.postMessage({ buffer: event.data.buffer }, [event.data.buffer]);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.mute);
      context.onstatechange = () => {
        if (generation === this.generation && context.state !== 'running' && this.stream) {
          this.fail('Microphone audio was interrupted. Select Resume to reconnect.');
        }
      };
    } catch (error) {
      if (generation === this.generation) this.stop();
      if (error instanceof DOMException) {
        const messages: Record<string, string> = {
          NotAllowedError: 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.',
          NotFoundError: 'No microphone was found. Connect one, or try Simulation Mode.',
          NotReadableError: 'This microphone is busy or unavailable. Close other apps using it and try again.',
          OverconstrainedError: 'The selected microphone is unavailable. Choose the default input and retry.',
        };
        throw new Error(messages[error.name] ?? 'Could not open the microphone. Check your browser permissions and try again.');
      }
      throw error;
    }
  }
  configure(settings: Settings): void {
    this.worker?.postMessage({ type: 'configure', options: settings });
  }
  async devices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
  }
  private fail(message: string): void { this.stop(); this.onError?.(message); }
  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.source?.disconnect(); this.source = null;
    if (typeof AudioWorkletNode !== 'undefined' && this.processor instanceof AudioWorkletNode) this.processor.port.close();
    if (this.processor && 'onaudioprocess' in this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect(); this.processor = null;
    this.mute?.disconnect(); this.mute = null;
    this.worker?.terminate(); this.worker = null;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => undefined);
      this.context = null;
    }
    this.latest = emptyAnalysis();
    this.backend = 'Not connected';
  }
}
