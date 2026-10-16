import type { GameSnapshot } from '../game/Game';
import type { AudioInput } from '../audio/AudioInput';

export function updateDebug(element: HTMLElement, snapshot: GameSnapshot, input: AudioInput, simulation: boolean): void {
  const a = snapshot.analysis;
  element.textContent = [
    simulation ? 'SIMULATED INPUT' : input.backend,
    `F0 ${a.pitch.toFixed(1)} Hz   confidence ${a.confidence.toFixed(3)}`,
    `RMS ${a.rms.toFixed(5)}   ${a.db.toFixed(1)} dBFS (raw ${a.rawDb.toFixed(1)})`,
    `Voice ${a.voiced ? 'yes' : 'no'}   X ${snapshot.position.nx.toFixed(3)}  Y ${snapshot.position.ny.toFixed(3)}`,
    `Rate ${simulation ? '—' : input.sampleRate + ' Hz'}   window + input latency ≈${simulation ? 0 : Math.round(input.latencyMs)} ms`,
    `Frame age ${Math.max(0, Math.round(performance.now() - a.timestamp))} ms`,
  ].join('\n');
}
