import { AudioAnalyzer } from './AudioAnalyzer';
import type { AudioOptions } from './types';

let analyzer: AudioAnalyzer | undefined;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};
scope.onmessage = (event: MessageEvent<
  { type: 'configure'; options: AudioOptions } |
  { type: 'frame'; buffer: ArrayBuffer; rate: number; timestamp: number }
>) => {
  const message = event.data;
  if (message.type === 'configure') {
    if (analyzer) analyzer.configure(message.options);
    else analyzer = new AudioAnalyzer(message.options);
    return;
  }
  if (!analyzer) return;
  const analysis = analyzer.analyze(new Float32Array(message.buffer), message.rate, message.timestamp);
  scope.postMessage({ analysis, buffer: message.buffer }, [message.buffer]);
};
