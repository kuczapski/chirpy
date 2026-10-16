export class SuccessSound {
  private context: AudioContext | null = null;
  async unlock(): Promise<void> {
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
    } catch { /* Visual feedback always works, including when audio is blocked. */ }
  }
  play(volume: number): void {
    const context = this.context;
    if (!context || context.state !== 'running' || volume === 0) return;
    [659.25, 880].forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + i * 0.095;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + 0.25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  close(): void { void this.context?.close().catch(() => undefined); this.context = null; }
}
