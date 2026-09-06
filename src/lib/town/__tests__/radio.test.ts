// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatFrequency, RADIO_BANDS, stationAt, stationFrequency, TownRadio, tuneFrequency } from '../radio';

// Keep playback tests independent of changes to the researched station directory.
vi.mock('../radio-stations', () => ({
  RADIO_STATIONS: [
    { id: 'fm-live', band: 'fm', frequency: 91.3, streamUrl: 'https://radio.example/first.mp3' },
    { id: 'fm-next', band: 'fm', frequency: 93.5, streamUrl: 'https://radio.example/second.mp3' },
    { id: 'fm-no-stream', band: 'fm', frequency: 95.7 },
    { id: 'am-live', band: 'am', frequency: 940, streamUrl: 'https://radio.example/am.mp3' },
  ],
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];
  src = '';
  preload = '';
  volume = 1;
  playback = deferred();
  play = vi.fn(() => this.playback.promise);
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
  private queuedListeners = new Map<string, EventListenerOrEventListenerObject[]>();

  constructor() { super(); MockAudio.instances.push(this); }

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    if (listener) this.queuedListeners.set(type, [...(this.queuedListeners.get(type) ?? []), listener]);
    super.addEventListener(type, listener, options);
  }

  // Simulate a callback already queued before the controller aborted listeners.
  deliverQueued(type: string): void {
    for (const listener of this.queuedListeners.get(type) ?? []) {
      const event = new Event(type);
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
  }
}

class MockNode {
  connect = vi.fn((node: MockNode) => node);
  start = vi.fn();
  stop = vi.fn();
  gain = { value: 0, setTargetAtTime: vi.fn() };
  frequency = { value: 0 };
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  sampleRate = 20;
  currentTime = 5;
  destination = new MockNode();
  noise = new MockNode();
  noiseGain = new MockNode();
  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(40) }));
  createBufferSource = vi.fn(() => this.noise);
  createBiquadFilter = vi.fn(() => new MockNode());
  createGain = vi.fn(() => this.noiseGain);
  constructor() { MockAudioContext.instances.push(this); }
}

describe('radio dial', () => {
  it.each(['fm', 'am'] as const)('allows every %s channel, including empty channels', (band) => {
    const { min, max, step } = RADIO_BANDS[band];
    const frequencies: number[] = [];
    for (let value = min; value <= max; value += step) {
      frequencies.push(tuneFrequency(band, value));
      expect(tuneFrequency(band, value)).toBe(value);
    }
    expect(new Set(frequencies).size).toBe(band === 'fm' ? 101 : 119);
    expect(frequencies.filter((frequency) => !stationAt(band, frequency)).length).toBeGreaterThan(90);
    expect(tuneFrequency(band, min - 1000)).toBe(min);
    expect(tuneFrequency(band, max + 1000)).toBe(max);
    expect(tuneFrequency(band, min + step * 0.4)).toBe(min);
    expect(tuneFrequency(band, min + step * 0.6)).toBe(min + step);
    for (const invalid of [NaN, Infinity, -Infinity]) expect(tuneFrequency(band, invalid)).toBe(RADIO_BANDS[band].initial);
  });

  it('keeps FM arithmetic in integer tenths and labels the correct units', () => {
    expect(stationFrequency(stationAt('fm', 913)!)).toBe(913);
    expect(stationFrequency(stationAt('am', 940)!)).toBe(940);
    expect(formatFrequency('fm', 913)).toBe('91.3');
    expect(formatFrequency('fm', 1079)).toBe('107.9');
    expect(formatFrequency('am', 940)).toBe('940');
    expect(stationAt('fm', 940)).toBeUndefined();
    expect(stationAt('am', 913)).toBeUndefined();
  });
});

describe('researched station directory', () => {
  it('uses unique station IDs and tuneable, non-conflicting frequencies', async () => {
    const { RADIO_STATIONS: stations, RADIO_CATALOG_CHECKED_AT: checkedAt } = await vi.importActual<typeof import('../radio-stations')>('../radio-stations');
    expect(checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(stations.map((station) => station.id)).size).toBe(stations.length);
    expect(new Set(stations.map((station) => `${station.band}:${stationFrequency(station)}`)).size).toBe(stations.length);
    expect(new Set(stations.map((station) => station.band))).toEqual(new Set(['am', 'fm']));
    for (const station of stations) {
      const frequency = stationFrequency(station);
      expect(tuneFrequency(station.band, frequency), station.id).toBe(frequency);
      expect(Number.isFinite(station.frequency), station.id).toBe(true);
      for (const label of [station.id, station.callSign, station.name, station.city, station.format]) expect(label.trim()).not.toBe('');
      expect(new URL(station.website).protocol, station.id).toBe('https:');
      if (station.streamUrl) expect(new URL(station.streamUrl).protocol, station.id).toBe('https:');
    }
  });

  it('keeps unavailable stations and recommends only nearby services with a stream', async () => {
    const { RADIO_STATIONS: stations } = await vi.importActual<typeof import('../radio-stations')>('../radio-stations');
    const recommendations = stations.filter((station) => station.recommended);
    const unavailable = stations.filter((station) => !station.streamUrl);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(unavailable.length).toBeGreaterThan(0);
    for (const station of recommendations) {
      expect(station.streamUrl, station.id).toBeTruthy();
      expect(station.reception, station.id).toBe('local');
    }
    for (const station of unavailable) expect(station.note?.trim(), station.id).toBeTruthy();
    expect(stations.find((station) => station.band === 'fm' && stationFrequency(station) === RADIO_BANDS.fm.initial)?.streamUrl).toBeTruthy();
  });
});

describe('TownRadio playback and resource ownership', () => {
  let radio: TownRadio;
  let changes: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockAudio.instances = [];
    MockAudioContext.instances = [];
    vi.stubGlobal('Audio', MockAudio);
    vi.stubGlobal('AudioContext', MockAudioContext);
    changes = vi.fn();
    radio = new TownRadio(changes);
  });

  afterEach(() => {
    radio.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts off and permits browsing both bands without requesting audio', () => {
    expect(radio.enabled).toBe(false);
    expect(radio.state).toBe('off');
    radio.tune('am', 940, true);
    radio.tune('fm', 935);
    vi.runAllTimers();
    expect(radio.frequency).toBe(935);
    expect(radio.state).toBe('off');
    expect(MockAudio.instances).toHaveLength(0);
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('starts playback within the power gesture and waits for a playing event', () => {
    radio.turnOn();
    const media = MockAudio.instances[0];
    expect(media.src).toBe('https://radio.example/first.mp3');
    expect(media.preload).toBe('none');
    expect(media.volume).toBe(0.45);
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(radio.state).toBe('connecting');
    media.dispatchEvent(new Event('playing'));
    expect(radio.state).toBe('playing');
    expect(vi.getTimerCount()).toBe(0);
    expect(MockAudioContext.instances[0].noiseGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 5, 0.035);
  });

  it('distinguishes unlisted dial positions from stations without a stream', () => {
    radio.tune('fm', 915);
    radio.turnOn();
    expect(radio.state).toBe('static');
    radio.tune('fm', 957);
    expect(radio.state).toBe('unavailable');
    expect(MockAudio.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(MockAudioContext.instances[0].noiseGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.45 * 0.055, 5, 0.035);
  });

  it('releases the old stream immediately and debounces dial motion', () => {
    radio.turnOn();
    const old = MockAudio.instances[0];
    radio.tune('fm', 935, true);
    expect(old.pause).toHaveBeenCalledTimes(1);
    expect(old.removeAttribute).toHaveBeenCalledWith('src');
    expect(old.load).toHaveBeenCalledTimes(1);
    expect(old.src).toBe('');
    expect(radio.state).toBe('tuning');
    vi.advanceTimersByTime(100);
    radio.tune('am', 940, true);
    vi.advanceTimersByTime(159);
    expect(MockAudio.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockAudio.instances).toHaveLength(2);
    expect(MockAudio.instances[1].src).toBe('https://radio.example/am.mp3');
  });

  it('connects on dial release without leaving a duplicate debounce request', () => {
    radio.turnOn();
    radio.tune('fm', 935, true);
    radio.tune('fm', 935);
    vi.advanceTimersByTime(160);
    expect(MockAudio.instances).toHaveLength(2);
    expect(MockAudio.instances[1].play).toHaveBeenCalledTimes(1);
  });

  it('ignores late events and rejected play promises from the previous station', async () => {
    radio.turnOn();
    const old = MockAudio.instances[0];
    radio.tune('fm', 935);
    const current = MockAudio.instances[1];
    current.dispatchEvent(new Event('playing'));
    changes.mockClear();
    for (const event of ['playing', 'waiting', 'stalled', 'error', 'ended']) old.deliverQueued(event);
    old.playback.reject(new DOMException('Old request was blocked', 'NotAllowedError'));
    await Promise.resolve();
    expect(radio.state).toBe('playing');
    expect(current.pause).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'ended'])('releases an unavailable station after %s and can retry it', (event) => {
    radio.turnOn();
    const old = MockAudio.instances[0];
    old.dispatchEvent(new Event(event));
    expect(radio.state).toBe('unavailable');
    expect(old.pause).toHaveBeenCalledOnce();
    expect(old.src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    radio.turnOn();
    expect(MockAudio.instances).toHaveLength(2);
    expect(radio.state).toBe('connecting');
  });

  it.each([
    ['autoplay refusal', new DOMException('User gesture required', 'NotAllowedError'), 'blocked'],
    ['network failure', new Error('Network failed'), 'unavailable'],
  ])('reports %s without leaving a stream running', async (_label, error, state) => {
    radio.turnOn();
    const media = MockAudio.instances[0];
    media.playback.reject(error);
    await Promise.resolve();
    expect(radio.state).toBe(state);
    expect(radio.enabled).toBe(true);
    expect(media.pause).toHaveBeenCalledOnce();
    expect(media.src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives a silent connection 15 seconds, then releases it', () => {
    radio.turnOn();
    vi.advanceTimersByTime(14999);
    expect(radio.state).toBe('connecting');
    vi.advanceTimersByTime(1);
    expect(radio.state).toBe('unavailable');
    expect(MockAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(MockAudio.instances[0].src).toBe('');
  });

  it.each(['waiting', 'stalled'])('allows recovery after %s and times out a persistent interruption', (event) => {
    radio.turnOn();
    const media = MockAudio.instances[0];
    media.dispatchEvent(new Event('playing'));
    vi.advanceTimersByTime(20000);
    expect(radio.state).toBe('playing');
    media.dispatchEvent(new Event(event));
    expect(radio.state).toBe('connecting');
    vi.advanceTimersByTime(14999);
    media.dispatchEvent(new Event('playing'));
    vi.advanceTimersByTime(20000);
    expect(radio.state).toBe('playing');
    media.dispatchEvent(new Event(event));
    vi.advanceTimersByTime(15000);
    expect(radio.state).toBe('unavailable');
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it.each(['turnOff', 'suspend', 'dispose'] as const)('%s cancels active media, queued callbacks, and timeouts', async (action) => {
    radio.turnOn();
    const media = MockAudio.instances[0];
    const context = MockAudioContext.instances[0];
    radio[action]();
    const state = radio.state;
    changes.mockClear();
    expect(radio.enabled).toBe(false);
    expect(media.pause).toHaveBeenCalledOnce();
    expect(media.src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    for (const event of ['playing', 'waiting', 'error']) media.deliverQueued(event);
    media.playback.reject(new Error('Cancelled connection'));
    await Promise.resolve();
    vi.advanceTimersByTime(20000);
    expect(radio.state).toBe(state);
    expect(changes).not.toHaveBeenCalled();
    if (action === 'dispose') {
      expect(context.noise.stop).toHaveBeenCalledOnce();
      expect(context.close).toHaveBeenCalledOnce();
    } else {
      expect(state).toBe(action === 'suspend' ? 'suspended' : 'off');
      expect(context.suspend).toHaveBeenCalledOnce();
    }
  });

  it.each(['turnOff', 'suspend', 'dispose'] as const)('%s cancels a scheduled dial connection', (action) => {
    radio.turnOn();
    radio.tune('fm', 935, true);
    radio[action]();
    vi.runAllTimers();
    expect(MockAudio.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps suspension while browsing and resumes only when explicitly powered on', () => {
    radio.turnOn();
    radio.suspend();
    radio.tune('am', 940);
    expect(radio.state).toBe('suspended');
    expect(MockAudio.instances).toHaveLength(1);
    radio.turnOn();
    expect(radio.enabled).toBe(true);
    expect(MockAudio.instances[1].src).toBe('https://radio.example/am.mp3');
    expect(MockAudioContext.instances).toHaveLength(1);
    expect(MockAudioContext.instances[0].resume).toHaveBeenCalledTimes(2);
  });

  it('clamps volume, carries it between stations, and keeps invalid input from muting audio', () => {
    radio.setVolume(0.2);
    radio.turnOn();
    expect(MockAudio.instances[0].volume).toBe(0.2);
    radio.setVolume(2);
    expect(MockAudio.instances[0].volume).toBe(1);
    radio.setVolume(NaN);
    radio.setVolume(Infinity);
    expect(radio.volume).toBe(1);
    radio.tune('fm', 935);
    expect(MockAudio.instances[1].volume).toBe(1);
    radio.setVolume(-0.5);
    expect(MockAudio.instances[1].volume).toBe(0);
    radio.tune('fm', 915);
    expect(MockAudioContext.instances[0].noiseGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 5, 0.035);
    radio.setVolume(0.5);
    expect(MockAudioContext.instances[0].noiseGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5 * 0.055, 5, 0.035);
  });

  it('plays live stations when Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => radio.turnOn()).not.toThrow();
    MockAudio.instances[0].dispatchEvent(new Event('playing'));
    expect(radio.state).toBe('playing');
  });

  it('disposes once and rejects subsequent power, tuning, and volume changes', () => {
    radio.turnOn();
    const context = MockAudioContext.instances[0];
    radio.dispose();
    changes.mockClear();
    radio.dispose();
    radio.turnOn();
    radio.tune('am', 940);
    radio.setVolume(0.8);
    expect(MockAudio.instances).toHaveLength(1);
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.noise.stop).toHaveBeenCalledOnce();
    expect(radio.band).toBe('fm');
    expect(radio.volume).toBe(0.45);
    expect(changes).not.toHaveBeenCalled();
  });
});
