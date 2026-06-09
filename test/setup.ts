import { vi } from 'vitest';

const mockAudioNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
};

function freshCtx() {
  return {
    state: 'running' as const,
    destination: { ...mockAudioNode },
    sampleRate: 44100,
    currentTime: 0,
    createMediaElementSource: vi.fn().mockReturnValue({ ...mockAudioNode, context: undefined }),
    createBufferSource: vi.fn().mockReturnValue({
      ...mockAudioNode,
      buffer: null,
      playbackRate: { value: 1 },
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }),
    createGain: vi.fn().mockReturnValue({ ...mockAudioNode, gain: { value: 1 } }),
    createBiquadFilter: vi.fn().mockReturnValue({
      ...mockAudioNode,
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
  };
}

(globalThis as any).AudioContext = vi.fn().mockImplementation(() => freshCtx());

(globalThis as any).HTMLMediaElement = class {};
(globalThis as any).HTMLVideoElement = class {};
(globalThis as any).HTMLAudioElement = class {};
(globalThis as any).MutationObserver = class {
  observe = vi.fn();
  disconnect = vi.fn();
};

const baseMediaEl = {
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  src: 'https://example.com/audio.mp3',
  currentSrc: 'https://example.com/audio.mp3',
  srcObject: null,
  volume: 1,
  muted: false,
  playbackRate: 1,
  preservesPitch: true,
  loop: false,
  duration: 120,
  currentTime: 0,
  readyState: 4,
  paused: false,
  crossOrigin: null,
  classList: { contains: vi.fn().mockReturnValue(false) },
  closest: vi.fn().mockReturnValue(null),
  getBoundingClientRect: vi.fn().mockReturnValue({ width: 640, height: 360, top: 0, bottom: 360 }),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getAttribute: vi.fn().mockReturnValue(''),
  querySelector: vi.fn().mockReturnValue(null),
  querySelectorAll: vi.fn().mockReturnValue([]),
};

(globalThis as any).document = {
  createElement: vi.fn().mockReturnValue({ ...baseMediaEl }),
  querySelectorAll: vi.fn().mockReturnValue([]),
  querySelector: vi.fn().mockReturnValue(null),
  body: { querySelectorAll: vi.fn().mockReturnValue([]) },
  documentElement: { dataset: {}, querySelectorAll: vi.fn().mockReturnValue([]) },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

(globalThis as any).window = {
  AudioContext: (globalThis as any).AudioContext,
  location: { href: 'https://example.com', hostname: 'example.com', host: 'example.com' },
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
  return { ...baseMediaEl, ...overrides } as unknown as HTMLMediaElement;
}
