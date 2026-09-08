const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));

export function drivingSound(speed: number, acceleration: number, surface: number, shore: number) {
  const pace = clamp(speed, 0, 40), load = clamp((acceleration + 0.4) / 2.5, 0, 1);
  const rough = surface === 1 ? 0.8 : surface === 2 ? 1 : surface === 5 ? 0.3 : 0;
  return { pulseHz: 31 + pace * 1.65 + load * 3, engineGain: 0.021 + load * 0.011,
    tireGain: Math.min(0.019, pace * 0.00043) * (1 + rough * 0.7), tireHz: 520 + rough * 840 + pace * 13,
    windGain: Math.min(0.009, (pace / 30) ** 2 * 0.006), shoreGain: clamp(shore, 0, 1) * 0.004 };
}

/** Original, lightweight synthesis: no audio downloads, recordings, or autoplay. */
export class RoadAudio {
  context?: AudioContext;
  enabled = false;
  volume = 0.65;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private harmonic?: OscillatorNode;
  private engineGain?: GainNode;
  private tire?: GainNode;
  private tireFilter?: BiquadFilterNode;
  private wind?: GainNode;
  private shore?: GainNode;
  private noise?: AudioBufferSourceNode;
  private disposed = false;
  private pending?: Promise<boolean>;
  private generation = 0;

  private create(): void {
    this.context = new AudioContext(); const c = this.context;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    const engineFilter = c.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 430;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    this.engineGain.connect(engineFilter).connect(this.master);
    this.engine = c.createOscillator(); this.engine.type = 'triangle'; this.engine.frequency.value = 31;
    this.engine.connect(this.engineGain); this.engine.start();
    const harmonicGain = c.createGain(); harmonicGain.gain.value = 0.16;
    this.harmonic = c.createOscillator(); this.harmonic.type = 'sine'; this.harmonic.frequency.value = 62;
    this.harmonic.connect(harmonicGain).connect(this.engineGain); this.harmonic.start();
    const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), values = buffer.getChannelData(0);
    let seed = 67321, previous = 0;
    for (let i = 0; i < values.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const white = (seed >>> 0) / 2147483648 - 1; previous = previous * 0.35 + white * 0.65; values[i] = previous; }
    this.noise = c.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
    this.tireFilter = c.createBiquadFilter(); this.tireFilter.type = 'bandpass'; this.tireFilter.frequency.value = 650; this.tireFilter.Q.value = 0.45;
    this.tire = c.createGain(); this.tire.gain.value = 0; this.noise.connect(this.tireFilter).connect(this.tire).connect(this.master);
    const windFilter = c.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 1100;
    this.wind = c.createGain(); this.wind.gain.value = 0; this.noise.connect(windFilter).connect(this.wind).connect(this.master);
    const shoreFilter = c.createBiquadFilter(); shoreFilter.type = 'bandpass'; shoreFilter.frequency.value = 380; shoreFilter.Q.value = 0.55;
    this.shore = c.createGain(); this.shore.gain.value = 0; this.noise.connect(shoreFilter).connect(this.shore).connect(this.master);
    this.noise.start();
  }

  async toggle(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.enabled) { this.turnOff(); return false; }
    if (this.pending) return this.pending;
    if (!this.context) this.create();
    const generation = this.generation;
    this.pending = this.context!.resume().then(() => { if (this.disposed || generation !== this.generation) return false; this.enabled = true; return true; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  update(speed: number, paused: boolean, acceleration = 0, surface = 6, shore = 0): void {
    if (!this.context || !this.master || !this.engine || !this.harmonic || this.disposed) return;
    const now = this.context.currentTime, sound = drivingSound(speed, acceleration, surface, shore);
    this.master.gain.setTargetAtTime(this.enabled && !paused ? clamp(this.volume, 0, 1) : 0, now, 0.08);
    this.engine.frequency.setTargetAtTime(sound.pulseHz, now, 0.18); this.harmonic.frequency.setTargetAtTime(sound.pulseHz * 2 - 0.2, now, 0.18);
    this.engineGain!.gain.setTargetAtTime(sound.engineGain, now, 0.16);
    this.tire!.gain.setTargetAtTime(sound.tireGain, now, 0.25); this.tireFilter!.frequency.setTargetAtTime(sound.tireHz, now, 0.4);
    this.wind!.gain.setTargetAtTime(sound.windGain, now, 0.3);
    this.shore!.gain.setTargetAtTime(sound.shoreGain * (0.75 + 0.25 * Math.sin(now * 0.73)), now, 0.8);
  }
  silence(): void { if (this.context && this.master) { this.master.gain.cancelScheduledValues(this.context.currentTime); this.master.gain.setValueAtTime(0, this.context.currentTime); } }
  turnOff(): void { this.generation++; this.enabled = false; this.silence(); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.turnOff();
    this.engine?.stop(); this.harmonic?.stop(); this.noise?.stop(); void this.context?.close().catch(() => {});
  }
}
