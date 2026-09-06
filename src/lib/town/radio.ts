import { RADIO_STATIONS, type RadioBand, type RadioStation } from './radio-stations';

// Integer tenths of MHz avoid floating-point drift across the FM dial.
export const RADIO_BANDS = {
  fm: { min: 879, max: 1079, step: 2, initial: 913, unit: 'MHz' },
  am: { min: 530, max: 1710, step: 10, initial: 940, unit: 'kHz' },
} as const;

export function tuneFrequency(band: RadioBand, value: number): number {
  const { min, max, step, initial } = RADIO_BANDS[band];
  if (!Number.isFinite(value)) return initial;
  return Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step));
}

export function stationFrequency(station: RadioStation): number {
  return Math.round(station.frequency * (station.band === 'fm' ? 10 : 1));
}

export function formatFrequency(band: RadioBand, frequency: number): string {
  return band === 'fm' ? (frequency / 10).toFixed(1) : String(frequency);
}

export function stationAt(band: RadioBand, frequency: number): RadioStation | undefined {
  return RADIO_STATIONS.find((station) => station.band === band && stationFrequency(station) === frequency);
}

export type RadioState = 'off' | 'tuning' | 'connecting' | 'playing' | 'static' | 'unavailable' | 'blocked' | 'suspended';

/** One disposable media element per tuning attempt isolates late media events. */
export class TownRadio {
  band: RadioBand = 'fm';
  frequency: number = RADIO_BANDS.fm.initial;
  volume = 0.45;
  enabled = false;
  state: RadioState = 'off';
  private media?: HTMLAudioElement;
  private mediaAbort?: AbortController;
  private context?: AudioContext;
  private noise?: AudioBufferSourceNode;
  private noiseGain?: GainNode;
  private timer?: ReturnType<typeof setTimeout>;
  private timeout?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;

  constructor(private readonly onChange: () => void) {}

  private update(state: RadioState): void {
    this.state = state;
    if (this.noiseGain && this.context) {
      const noisy = this.enabled && ['static', 'unavailable', 'tuning'].includes(state);
      this.noiseGain.gain.setTargetAtTime(noisy ? this.volume * 0.055 : 0, this.context.currentTime, 0.035);
    }
    this.onChange();
  }

  private startStatic(): void {
    // Optional tuning noise; live stations still work without Web Audio.
    try {
      if (!this.context) {
        this.context = new AudioContext();
        const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this.noise = this.context.createBufferSource();
        this.noise.buffer = buffer;
        this.noise.loop = true;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3200;
        this.noiseGain = this.context.createGain();
        this.noiseGain.gain.value = 0;
        this.noise.connect(filter).connect(this.noiseGain).connect(this.context.destination);
        this.noise.start();
      }
      void this.context.resume().catch(() => {});
    } catch { /* Static is decorative; do not prevent live playback. */ }
  }

  private stopStream(): void {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
    this.mediaAbort?.abort();
    if (this.media) {
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
      this.media = undefined;
    }
  }

  turnOn(): void {
    if (this.disposed) return;
    this.enabled = true;
    this.startStatic();
    // Keep play() inside the user's gesture for mobile autoplay policies.
    this.connect();
  }

  turnOff(): void {
    if (this.disposed) return;
    this.enabled = false;
    this.stopStream();
    this.update('off');
    void this.context?.suspend().catch(() => {});
  }

  tune(band: RadioBand, frequency: number, settle = false): void {
    if (this.disposed) return;
    this.band = band;
    this.frequency = tuneFrequency(band, frequency);
    this.stopStream();
    if (!this.enabled) { this.update(this.state === 'suspended' ? 'suspended' : 'off'); return; }
    if (settle) {
      this.update('tuning');
      this.timer = setTimeout(() => this.connect(), 160);
    } else this.connect();
  }

  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.media) this.media.volume = this.volume;
    this.update(this.state);
  }

  suspend(): void {
    if (!this.enabled || this.disposed) return;
    this.enabled = false;
    this.stopStream();
    this.update('suspended');
    void this.context?.suspend().catch(() => {});
  }

  private connect(): void {
    this.stopStream();
    if (this.disposed || !this.enabled) return;
    const station = stationAt(this.band, this.frequency);
    if (!station) { this.update('static'); return; }
    if (!station.streamUrl) { this.update('unavailable'); return; }
    const media = new Audio();
    this.media = media;
    this.mediaAbort = new AbortController();
    const options = { signal: this.mediaAbort.signal };
    const generation = this.generation;
    const current = () => !this.disposed && this.enabled && this.generation === generation;
    const fail = (state: 'blocked' | 'unavailable') => {
      if (!current()) return;
      this.stopStream();
      this.update(state);
    };
    const waitForStream = () => {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => fail('unavailable'), 15000);
    };
    media.preload = 'none';
    media.volume = this.volume;
    // Use native media playback, without routing cross-origin audio through Web Audio.
    media.src = station.streamUrl;
    media.addEventListener('playing', () => {
      if (!current()) return;
      clearTimeout(this.timeout);
      this.update('playing');
    }, options);
    for (const event of ['waiting', 'stalled']) media.addEventListener(event, () => {
      if (!current()) return;
      this.update('connecting');
      waitForStream();
    }, options);
    media.addEventListener('error', () => fail('unavailable'), options);
    media.addEventListener('ended', () => fail('unavailable'), options);
    this.update('connecting');
    waitForStream();
    void media.play().catch((error: unknown) => {
      fail(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'unavailable');
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopStream();
    this.enabled = false;
    this.disposed = true;
    this.noise?.stop();
    void this.context?.close().catch(() => {});
  }
}

export function mountTownRadio(root: HTMLElement): { dispose(): void } {
  const candidate = root.querySelector<HTMLElement>('[data-town-radio]');
  if (!candidate) return { dispose() {} };
  const panel: HTMLElement = candidate;
  const get = <T extends HTMLElement>(name: string) => panel.querySelector<T>(`[data-radio-${name}]`)!;
  const dial = get<HTMLInputElement>('dial');
  const band = get<HTMLSelectElement>('band');
  const power = get<HTMLButtonElement>('power');
  const retry = get<HTMLButtonElement>('retry');
  const status = get('status');
  const frequency = get('frequency');
  const name = get('name');
  const detail = get('detail');
  const website = get<HTMLAnchorElement>('website');
  const volume = get<HTMLInputElement>('volume');
  const summary = get('summary');
  const markers = get('markers');
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const failed = new Set<string>();
  const savedFrequencies = { fm: RADIO_BANDS.fm.initial as number, am: RADIO_BANDS.am.initial as number };

  const messages: Record<RadioState, string> = {
    off: 'Off',
    tuning: 'Tuning…',
    connecting: 'Connecting…',
    playing: 'Live',
    static: 'Static',
    unavailable: 'Unavailable',
    blocked: 'Playback blocked',
    suspended: 'Paused',
  };

  const radio = new TownRadio(render);
  function render(): void {
    const config = RADIO_BANDS[radio.band];
    const station = stationAt(radio.band, radio.frequency);
    const label = `${formatFrequency(radio.band, radio.frequency)} ${radio.band.toUpperCase()}`;
    dial.min = String(config.min);
    dial.max = String(config.max);
    dial.step = String(config.step);
    dial.value = String(radio.frequency);
    dial.setAttribute('aria-valuetext', `${label}${station ? `, ${station.name}` : ', no listed local station'}`);
    band.value = radio.band;
    frequency.textContent = label;
    name.textContent = station ? `${station.name} · ${station.callSign}` : 'No listed local station';
    detail.textContent = station ? `${station.city} · ${station.format}` : '';
    detail.hidden = !station;
    website.hidden = !station;
    if (station) website.href = station.website;
    status.textContent = messages[radio.state];
    panel.dataset.state = radio.state;
    power.textContent = radio.enabled ? 'Turn radio off' : radio.state === 'suspended' ? 'Resume radio' : 'Turn radio on';
    power.setAttribute('aria-pressed', String(radio.enabled));
    summary.textContent = radio.enabled ? label : radio.state === 'suspended' ? 'Paused' : 'Off';
    retry.hidden = !radio.enabled || !['unavailable', 'blocked'].includes(radio.state) || !station?.streamUrl;
    get('min').textContent = formatFrequency(radio.band, config.min);
    get('max').textContent = `${formatFrequency(radio.band, config.max)} ${config.unit}`;
    get<HTMLButtonElement>('down').disabled = radio.frequency <= config.min;
    get<HTMLButtonElement>('up').disabled = radio.frequency >= config.max;
    if (station && radio.state === 'unavailable') failed.add(station.id);
    if (station && radio.state === 'playing') failed.delete(station.id);
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-radio-station]')) {
      const id = button.dataset.radioStation!;
      button.setAttribute('aria-pressed', String(id === station?.id));
      const reception = button.querySelector<HTMLElement>('[data-radio-reception]');
      if (reception) {
        reception.textContent = failed.has(id) ? 'Unavailable' : id === station?.id && radio.state === 'playing' ? 'Live' : reception.dataset.radioReception!;
        reception.hidden = !reception.textContent;
      }
    }
    if (markers.dataset.band !== radio.band) {
      markers.dataset.band = radio.band;
      markers.replaceChildren();
      for (const entry of RADIO_STATIONS.filter((entry) => entry.band === radio.band)) {
        const marker = document.createElement('span');
        marker.style.left = `${(stationFrequency(entry) - config.min) / (config.max - config.min) * 100}%`;
        marker.title = `${entry.frequency} ${entry.callSign}`;
        if (entry.recommended) marker.classList.add('recommended');
        markers.append(marker);
      }
    }
  }

  function tune(nextBand: RadioBand, value: number, settle = false): void {
    savedFrequencies[radio.band] = radio.frequency;
    radio.tune(nextBand, value, settle);
  }
  power.addEventListener('click', () => radio.enabled ? radio.turnOff() : radio.turnOn(), options);
  retry.addEventListener('click', () => radio.turnOn(), options);
  dial.addEventListener('input', () => tune(radio.band, Number(dial.value), true), options);
  // A direct user gesture on release also gives mobile browsers permission to play.
  dial.addEventListener('change', () => tune(radio.band, Number(dial.value)), options);
  band.addEventListener('change', () => {
    const nextBand = band.value as RadioBand;
    tune(nextBand, savedFrequencies[nextBand]);
  }, options);
  for (const [control, direction] of [['down', -1], ['up', 1]] as const) {
    get(control).addEventListener('click', () => tune(radio.band, radio.frequency + direction * RADIO_BANDS[radio.band].step), options);
  }
  volume.addEventListener('input', () => radio.setVolume(Number(volume.value) / 100), options);
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-radio-station]')) {
    button.addEventListener('click', () => {
      const station = RADIO_STATIONS.find((entry) => entry.id === button.dataset.radioStation);
      if (station) tune(station.band, stationFrequency(station));
    }, options);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) radio.suspend(); }, options);
  window.addEventListener('blur', () => radio.suspend(), options);
  window.addEventListener('pagehide', () => radio.suspend(), options);
  render();
  return { dispose() { abort.abort(); radio.dispose(); } };
}
