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

function normalizeMarker(raw: any): Marker {
  return {
    id: raw?.id || generateId('m'),
    time: typeof raw?.time === 'number' ? raw.time : 0,
    name: typeof raw?.name === 'string' ? raw.name : '',
    ...(typeof raw?.color === 'string' && raw.color !== '' ? { color: raw.color } : {}),
  };
}

function normalizeClip(raw: any): Clip {
  const defaults = createClip();
  return {
    ...defaults,
    ...(raw ?? {}),
    start: typeof raw?.start === 'number' ? raw.start : defaults.start,
    end: typeof raw?.end === 'number' ? raw.end : defaults.end,
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
    const rawClip = clip as any;
    if (typeof rawClip.reducerDepth !== 'undefined') {
      if (typeof rawClip.reducerAmount === 'undefined')
        rawClip.reducerAmount = rawClip.reducerDepth;
      delete rawClip.reducerDepth;
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
    markers.every((marker, index) => {
      const expectedTime = index === 0 ? 0 : 30;
      return (
        marker.time === expectedTime && (marker.name ?? '') === '' && (marker.color ?? '') === ''
      );
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
      result.markers = media.markers.map((marker) => {
        const entry: Record<string, unknown> = { id: marker.id, time: marker.time };
        if (marker.name !== '') entry.name = marker.name;
        if (marker.color !== undefined && marker.color !== '') entry.color = marker.color;
        return entry;
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
  const defaults = createClip();
  const result: Record<string, unknown> = { id: clip.id, start: clip.start, end: clip.end };
  if (clip.name !== '') result.name = clip.name;
  if (clip.enabled !== defaults.enabled) result.enabled = clip.enabled;
  if (clip.semitone !== undefined && clip.semitone !== 0) result.semitone = clip.semitone;
  if (clip.pitch !== undefined && clip.pitch !== 0) result.pitch = clip.pitch;
  if (clip.speed !== undefined && clip.speed !== 1) result.speed = clip.speed;
  if (clip.formant !== undefined && clip.formant !== 0) result.formant = clip.formant;
  if (clip.reducerAmount !== undefined && clip.reducerAmount !== 0)
    result.reducerAmount = clip.reducerAmount;
  if (clip.repetitions !== defaults.repetitions) result.repetitions = clip.repetitions;
  if (clip.countIn !== defaults.countIn) result.countIn = clip.countIn;
  return result;
}

export function isBlockedUrl(url: string | URL | null | undefined): boolean {
  if (!url) return true;
  try {
    const parsedUrl = typeof url === 'string' ? new URL(url) : url;
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
    if (
      allowedHosts.some(
        (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`),
      )
    )
      return false;
    return (
      !parsedUrl ||
      !parsedUrl.hostname ||
      blockedProtocols.includes(parsedUrl.protocol) ||
      blockedHosts.some((host) => parsedUrl.hostname.includes(host)) ||
      blockedUrls.some((blockedUrl) => parsedUrl.href.startsWith(blockedUrl))
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
