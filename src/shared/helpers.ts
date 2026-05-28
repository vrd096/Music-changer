import type { Marker, Clip, MediaState, SharePayload } from './types';

export const RUNTIME_LOG_KEY = 'runtimeLog';
export const RUNTIME_LOG_MAX = 200;
export const RUNTIME_LOG_STRING_MAX = 200;
export const RUNTIME_LOG_DEPTH_MAX = 5;

export function generateId(prefix: string = 'm'): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}${Date.now().toString(36).slice(-4)}${rand}`;
}

export function createMarker(time: number = 0): Marker {
  return { id: generateId('m'), time, name: '' };
}

export function createClip(): Clip {
  return {
    id: generateId('ls'),
    name: '',
    enabled: true,
    start: 0,
    end: 0,
    repetitions: 1,
    countIn: false,
  };
}

export function createDefaultMedia(): MediaState {
  return {
    url: '',
    title: '',
    playlistId: 'default',
    markers: [createMarker(), createMarker(30)],
    semitone: 0,
    pitch: 0,
    formant: 0,
    varispeed: false,
    speed: 1,
    trackTuning: 440,
    instrumentTuning: 440,
    reducerAmount: 0,
    reducerFocus: 1.2,
    reducerAggressiveness: 0.5,
    reducerStereoBias: 0,
    reducerLowHz: 120,
    reducerHighHz: 6000,
    virtualTempo: 0,
    clips: [],
    datePlayed: 0,
    isValid: false,
    isValidForStorage: false,
    deleted: false,
    notes: '',
  };
}

function migrateField(obj: any, oldKey: string, newKey: string, defaultValue: any): void {
  if (typeof obj[oldKey] !== 'undefined') {
    if (obj[newKey] === defaultValue || typeof obj[newKey] === 'undefined')
      obj[newKey] = obj[oldKey];
    delete obj[oldKey];
  }
}

function normalizeMarker(m: any): Marker {
  return {
    id: m?.id || generateId('m'),
    time: typeof m?.time === 'number' ? m.time : 0,
    name: typeof m?.name === 'string' ? m.name : '',
    ...(typeof m?.color === 'string' && m.color !== '' ? { color: m.color } : {}),
  };
}

function normalizeClip(c: any): Clip {
  const defaults = createClip();
  return {
    ...defaults,
    ...(c ?? {}),
    start: typeof c?.start === 'number' ? c.start : defaults.start,
    end: typeof c?.end === 'number' ? c.end : defaults.end,
  };
}

export function normalizeMedia(media: Record<string, unknown>): MediaState {
  const defaults = createDefaultMedia();
  const result: MediaState = {
    ...defaults,
    ...(media as Partial<MediaState>),
    semitone: (media.semitone ?? media.semiTone ?? 0) as number,
    clips: Array.isArray(media.clips)
      ? (media.clips as any[]).map(normalizeClip)
      : [...defaults.clips],
    markers: Array.isArray(media.markers)
      ? (media.markers as any[]).map(normalizeMarker)
      : defaults.markers.map((m) => ({ ...m })),
    notes: typeof media.notes === 'string' ? media.notes : defaults.notes,
    varispeed: (media.varispeed ?? false) as boolean,
    trackTuning: (media.trackTuning ?? media.recordingTuning ?? 440) as number,
    instrumentTuning: (media.instrumentTuning ?? 440) as number,
  };
  migrateField(result, 'reducerDepth', 'reducerAmount', 0);
  migrateField(result, 'reducerQ', 'reducerFocus', 1.2);
  migrateField(result, 'reducerVocalCut', 'reducerAggressiveness', 0.5);
  migrateField(result, 'reducerCenterFocus', 'reducerStereoBias', 0);
  migrateField(result, 'reducerLowCut', 'reducerLowHz', 120);
  migrateField(result, 'reducerHighCut', 'reducerHighHz', 6000);
  for (const clip of result.clips) {
    const c = clip as any;
    if (typeof c.reducerDepth !== 'undefined') {
      if (typeof c.reducerAmount === 'undefined') c.reducerAmount = c.reducerDepth;
      delete c.reducerDepth;
    }
  }
  delete (result as any).originalKey;
  delete (result as any).semiTone;
  delete (result as any).recordingTuning;
  if (Array.isArray(result.markers)) {
    for (const marker of result.markers) {
      if (!marker.id) marker.id = generateId('m');
    }
  }
  return result;
}

export function isDefaultMarkers(markers: Marker[]): boolean {
  return (
    markers.length === 2 &&
    markers.every((m, i) => {
      const et = i === 0 ? 0 : 30;
      return m.time === et && (m.name ?? '') === '' && (m.color ?? '') === '';
    })
  );
}

export function createSharePayload(source: {
  sourceUrl: string;
  sourceTitle?: string;
  createdAt?: number;
  media?: Record<string, unknown>;
}): SharePayload | null {
  if (!source?.sourceUrl) return null;
  return {
    version: 1,
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
    sourceUrl: source.sourceUrl,
    sourceTitle: source.sourceTitle || '',
    media: sanitizeMediaForStorage(
      source.media ? normalizeMedia(source.media) : createDefaultMedia(),
    ),
  };
}

export function sanitizeMediaForStorage(media: Partial<MediaState>): Partial<MediaState> {
  if (!media) return {};
  const defaults = createDefaultMedia();
  const result: Record<string, unknown> = {};
  if (media.playlistId && media.playlistId !== defaults.playlistId)
    result.playlistId = media.playlistId;
  if (media.url) result.url = media.url;
  if (media.title) result.title = media.title;
  if (Array.isArray(media.markers)) {
    if (media.markers.length === 0) {
      result.markers = [];
    } else if (!isDefaultMarkers(media.markers)) {
      result.markers = media.markers.map((m) => {
        const r: Record<string, unknown> = { id: m.id, time: m.time };
        if (m.name !== '') r.name = m.name;
        if (m.color !== undefined && m.color !== '') r.color = m.color;
        return r;
      });
    }
  }
  if (Array.isArray(media.clips)) result.clips = media.clips.map((c) => sanitizeClip(c));
  if (media.semitone !== undefined && media.semitone !== defaults.semitone)
    result.semitone = media.semitone;
  if (media.pitch !== undefined && media.pitch !== defaults.pitch) result.pitch = media.pitch;
  if (media.speed !== undefined && media.speed !== defaults.speed) result.speed = media.speed;
  if (media.formant !== undefined && media.formant !== defaults.formant)
    result.formant = media.formant;
  if (media.varispeed !== undefined && media.varispeed !== defaults.varispeed)
    result.varispeed = media.varispeed;
  if (media.trackTuning !== undefined && media.trackTuning !== defaults.trackTuning)
    result.trackTuning = media.trackTuning;
  if (media.instrumentTuning !== undefined && media.instrumentTuning !== defaults.instrumentTuning)
    result.instrumentTuning = media.instrumentTuning;
  if (media.reducerFocus !== undefined && media.reducerFocus !== defaults.reducerFocus)
    result.reducerFocus = media.reducerFocus;
  if (media.reducerAmount !== undefined && media.reducerAmount !== defaults.reducerAmount)
    result.reducerAmount = media.reducerAmount;
  if (
    media.reducerAggressiveness !== undefined &&
    media.reducerAggressiveness !== defaults.reducerAggressiveness
  )
    result.reducerAggressiveness = media.reducerAggressiveness;
  if (
    media.reducerStereoBias !== undefined &&
    media.reducerStereoBias !== defaults.reducerStereoBias
  )
    result.reducerStereoBias = media.reducerStereoBias;
  if (media.reducerLowHz !== undefined && media.reducerLowHz !== defaults.reducerLowHz)
    result.reducerLowHz = media.reducerLowHz;
  if (media.reducerHighHz !== undefined && media.reducerHighHz !== defaults.reducerHighHz)
    result.reducerHighHz = media.reducerHighHz;
  if (media.reducerEnabled) result.reducerEnabled = true;
  if (media.virtualTempo !== undefined && media.virtualTempo !== defaults.virtualTempo)
    result.virtualTempo = media.virtualTempo;
  if (media.datePlayed !== undefined && media.datePlayed > 0) result.datePlayed = media.datePlayed;
  if (media.isValid) result.isValid = true;
  if (media.isValidForStorage) result.isValidForStorage = true;
  if (media.deleted) result.deleted = true;
  if (
    typeof media.createdAt === 'number' &&
    Number.isFinite(media.createdAt) &&
    media.createdAt > 0
  )
    result.createdAt = media.createdAt;
  if (
    typeof media.deletedAt === 'number' &&
    Number.isFinite(media.deletedAt) &&
    media.deletedAt > 0
  )
    result.deletedAt = media.deletedAt;
  if (typeof media.notes === 'string' && media.notes !== '') result.notes = media.notes;
  return result as Partial<MediaState>;
}

function sanitizeClip(clip: Clip): Record<string, unknown> {
  const d = createClip();
  const r: Record<string, unknown> = { id: clip.id, start: clip.start, end: clip.end };
  if (clip.name !== '') r.name = clip.name;
  if (clip.enabled !== d.enabled) r.enabled = clip.enabled;
  if (clip.semitone !== undefined && clip.semitone !== 0) r.semitone = clip.semitone;
  if (clip.pitch !== undefined && clip.pitch !== 0) r.pitch = clip.pitch;
  if (clip.speed !== undefined && clip.speed !== 1) r.speed = clip.speed;
  if (clip.formant !== undefined && clip.formant !== 0) r.formant = clip.formant;
  if (clip.reducerAmount !== undefined && clip.reducerAmount !== 0)
    r.reducerAmount = clip.reducerAmount;
  if (clip.repetitions !== d.repetitions) r.repetitions = clip.repetitions;
  if (clip.countIn !== d.countIn) r.countIn = clip.countIn;
  return r;
}

export function isBlockedUrl(url: string | URL | null | undefined): boolean {
  if (!url) return true;
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    const blockedProtocols = [
      'chrome:',
      'edge:',
      'brave:',
      'vivaldi:',
      'opera:',
      'yandex:',
      'devtools:',
      'chrome-untrusted:',
      'chrome-extension:',
      'moz-extension:',
      'file:',
      'about:',
      'http:',
    ];
    const blockedHosts = [
      'accounts.google.com',
      'adservice.google.com',
      'analytics.google.com',
      'doubleclick.net',
      'googlesyndication.com',
      'chrome.google.com',
      'addons.mozilla.org',
      'microsoftedge.microsoft.com',
      'chromewebstore.google.com',
      'criteo.com',
      'googleadservices.com',
      'google-analytics.com',
      'imasdk.googleapis.com',
      'googleapis.com',
      'gstatic.com',
      'admob.com',
      'spotx.tv',
      'spotxchange.com',
      'freewheel.com',
      'freewheel.tv',
      'teads.com',
      'teads.tv',
      'tremorvideo.com',
      'tremorhub.com',
      'adnxs.com',
      'appnexus.com',
      'amazon-adsystem.com',
      'aax.amazon-adsystem.com',
      'adsrvr.org',
      'rubiconproject.com',
      'openx.net',
      'indexexchange.com',
      'thetradedesk.com',
      'triplelift.com',
      '2mdn.net',
      'adserver',
      'adswag.com',
    ];
    const blockedUrls = [
      'https://www.google.com/recaptcha',
      'https://accounts.youtube.com/RotateCookiesPage',
    ];
    const allowedHosts = ['youtube.googleapis.com'];
    if (allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) return false;
    return (
      !u ||
      !u.hostname ||
      blockedProtocols.includes(u.protocol) ||
      blockedHosts.some((h) => u.hostname.includes(h)) ||
      blockedUrls.some((bu) => u.href.startsWith(bu))
    );
  } catch {
    return true;
  }
}

export async function isVivExt(): Promise<boolean> {
  try {
    const win = await chrome.windows.getCurrent();
    return !!(win as any)?.vivExtData;
  } catch {
    return false;
  }
}

export function isYaBrowser(): boolean {
  try {
    return navigator.userAgent.includes('YaBrowser');
  } catch {
    return false;
  }
}

export function hasSidePanel(): boolean {
  return (
    !!chrome?.sidePanel?.open ||
    !!(typeof (browser as any) !== 'undefined' && (browser as any).sidebarAction) ||
    !!(typeof (opr as any) !== 'undefined' && (opr as any).sidebarAction)
  );
}
