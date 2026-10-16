// Vite bundles this as an independent worklet module. Outputs stay silent.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ChirpyCapture extends AudioWorkletProcessor {
  private readonly ring: Float32Array;
  private transfer: Float32Array | null;
  private index = 0;
  private filled = 0;
  private elapsed = 0;
  private readonly hop = Math.round(sampleRate / 40);
  constructor(options?: { processorOptions?: { windowMs?: number } }) {
    super();
    const size = Math.round(sampleRate * (options?.processorOptions?.windowMs ?? 96) / 1000);
    this.ring = new Float32Array(size);
    this.transfer = new Float32Array(size);
    this.port.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
      this.transfer = new Float32Array(event.data.buffer);
    };
  }
  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.ring[this.index] = channel[i];
      this.index = (this.index + 1) % this.ring.length;
    }
    this.filled = Math.min(this.ring.length, this.filled + channel.length);
    this.elapsed += channel.length;
    if (this.filled === this.ring.length && this.elapsed >= this.hop && this.transfer) {
      this.elapsed = 0;
      const frame = this.transfer;
      for (let i = 0; i < frame.length; i++) frame[i] = this.ring[(this.index + i) % this.ring.length];
      this.port.postMessage({ buffer: frame.buffer }, [frame.buffer]);
      this.transfer = null; // Backpressure: at most one analysis frame is in flight.
    }
    return true;
  }
}
registerProcessor('chirpy-capture', ChirpyCapture);
export {};
