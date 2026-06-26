import { vi } from 'vitest';

(globalThis as any).AudioContext = vi.fn().mockImplementation(() => ({
  state: 'running' as const,
  destination: { connect: vi.fn(), disconnect: vi.fn() },
  sampleRate: 44100,
  currentTime: 0,
  createMediaElementSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    context: undefined,
  }),
  createBufferSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    buffer: null,
    playbackRate: { value: 1 },
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  }),
  createGain: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  }),
  createBiquadFilter: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    type: 'peaking',
    frequency: { value: 1000 },
    gain: { value: 0 },
    Q: { value: 1 },
  }),
  decodeAudioData: vi.fn().mockResolvedValue({
    duration: 60,
    numberOfChannels: 2,
    sampleRate: 44100,
    length: 2646000,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(2646000)),
  }),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  audioWorklet: {
    addModule: vi.fn().mockResolvedValue(undefined),
  },
}));

(globalThis as any).MutationObserver = class {
  observe = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
};

(globalThis as any).chrome = {
  runtime: {
    sendMessage: vi.fn(),
    getURL: vi.fn().mockReturnValue('chrome-extension://test/'),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    lastError: undefined,
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Test' }),
  },
  i18n: { getMessage: vi.fn().mockReturnValue('') },
  permissions: {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(true),
    getAll: vi.fn().mockResolvedValue({ origins: ['*://*/*'] }),
    onAdded: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
  },
  action: {
    setPopup: vi.fn(),
    setIcon: vi.fn(),
    getBadgeText: vi.fn(),
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    openPopup: vi.fn().mockResolvedValue(undefined),
    onClicked: { addListener: vi.fn() },
  },
  sidePanel: {
    setOptions: vi.fn(),
    open: vi.fn(),
  },
  scripting: {
    registerContentScripts: vi.fn(),
    unregisterContentScripts: vi.fn(),
    updateContentScripts: vi.fn(),
    getRegisteredContentScripts: vi.fn().mockResolvedValue([]),
  },
};

export function createMockMediaElement(overrides: Record<string, unknown> = {}) {
  const el = document.createElement('audio') as HTMLMediaElement;
  el.play = vi.fn().mockResolvedValue(undefined);
  el.pause = vi.fn();
  el.volume = 1;
  el.muted = false;
  el.playbackRate = 1;
  el.preservesPitch = true;
  el.loop = false;
  el.currentTime = 0;
  el.crossOrigin = 'anonymous';
  Object.assign(el, overrides);
  return el;
}
