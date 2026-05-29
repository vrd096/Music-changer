export interface Marker {
  id: string;
  time: number;
  name: string;
  color?: string;
}

/** Loop clip */
export interface Clip {
  id: string;
  name: string;
  enabled: boolean;
  start: number;
  end: number;
  repetitions: number;
  countIn: boolean;
  semitone?: number;
  pitch?: number;
  speed?: number;
  formant?: number;
  reducerAmount?: number;
}

/** EQ band configuration */
export interface EqBand {
  type: BiquadFilterType;
  frequency: number;
  gain: number;
  Q: number;
}

/** Default EQ bands (6-band equalizer) */
export const DEFAULT_EQ_BANDS: EqBand[] = [
  { type: 'highpass', frequency: 30, gain: 0, Q: 0.7 },
  { type: 'lowshelf', frequency: 120, gain: 0, Q: 0.7 },
  { type: 'peaking', frequency: 350, gain: 0, Q: 1 },
  { type: 'peaking', frequency: 1200, gain: 0, Q: 1 },
  { type: 'peaking', frequency: 3500, gain: 0, Q: 1 },
  { type: 'highshelf', frequency: 9000, gain: 0, Q: 0.7 },
];

/** Media/track state */
export interface MediaState {
  url: string;
  title: string;
  playlistId: string;
  markers: Marker[];
  semitone: number;
  pitch: number;
  formant: number;
  varispeed: boolean;
  speed: number;
  trackTuning: number;
  instrumentTuning: number;
  reducerAmount: number;
  reducerFocus: number;
  reducerAggressiveness: number;
  reducerStereoBias: number;
  reducerLowHz: number;
  reducerHighHz: number;
  reducerEnabled?: boolean;
  virtualTempo: number;
  clips: Clip[];
  datePlayed: number;
  isValid: boolean;
  isValidForStorage: boolean;
  deleted: boolean;
  notes: string;
  createdAt?: number;
  deletedAt?: number;
  semiTone?: number;
  recordingTuning?: number;
  originalKey?: string;
}

/** Share payload */
export interface SharePayload {
  version: number;
  createdAt: number;
  sourceUrl: string;
  sourceTitle: string;
  media: Partial<MediaState>;
}

/** Log entry */
export interface LogEntry {
  t: string;
  lvl: 'log' | 'warn' | 'error';
  scope: string;
  event: string;
  msg?: string;
  ctx?: unknown;
}

/** Message from service worker to popup/sidepanel */
export interface ServiceWorkerMessage {
  sender: 'service-worker';
  command: 'connect' | 'reset' | 'set' | 'set-from-content' | 'exit-tabCapture' | 'state';
  tabId?: number;
  altUrl?: string;
  altTitle?: string;
  isNavigation?: boolean;
  connectionStatusMessage?: string;
  hasConnectionStatusError?: boolean;
  noPermissionContext?: boolean;
  semitone?: number;
  loopMode?: string;
  media?: Partial<MediaState>;
  /** Used by popup/sidepanel to receive state updates */
  type?: 'state-update' | 'connection-status' | 'toolbar-progress';
  status?: 'connecting' | 'connected' | 'disconnected' | 'no-permission';
  hostUrl?: string;
  visible?: boolean;
}

/** Message from content script to service worker */
export interface ContentMessage {
  type?: 'logger-error' | 'main-console-error' | 'highlight-toolbar-icon' | 'enable-tab-connect';
  command?: string;
  scope?: string;
  event?: string;
  data?: unknown;
  pageUrl?: string;
  tabId?: number;
  url?: string;
  title?: string;
  entry?: LogEntry;
}

/** Message from tabcapture */
export interface TabCaptureMessage {
  sender: 'tabcapture-tab';
  tabId: number;
  command: string;
  [key: string]: unknown;
}

/** Keyboard shortcut config */
export interface KeyboardShortcut {
  code: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export type KeyboardShortcutMap = Record<string, KeyboardShortcut | KeyboardShortcut[]>;

/** Settings */
export interface Settings {
  uiLanguage: string;
  termLanguage: string;
  uiMode: 'popup' | 'sidepanel';
  keyboardShortcuts: KeyboardShortcutMap;
  useCustomShortcuts: boolean;
  bannerSnoozedAt: number;
  bannerSnoozedIndex: number;
  [key: string]: unknown;
}
