import { isBlockedUrl } from '../shared/types';

export const INIT_FLAG = '___tp_isInitialized';

let _handler: ((el: HTMLMediaElement) => void) | null = null;
export function getMediaElementHandler() {
  return _handler;
}
export function setMediaElementHandler(fn: ((el: HTMLMediaElement) => void) | null) {
  _handler = fn;
}

export const pendingMediaElements: HTMLMediaElement[] = [];

export function hasValidSource(el: HTMLMediaElement): boolean {
  return !!(el.src || el.currentSrc || el.srcObject);
}

export function waitForSource(
  el: HTMLMediaElement,
  callback: (el: HTMLMediaElement) => void,
): void {
  if (hasValidSource(el)) {
    callback(el);
    return;
  }
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    callback(el);
    return;
  }
  const onLoadStart = () => {
    el.removeEventListener('loadstart', onLoadStart);
    el.removeEventListener('loadedmetadata', onMeta);
    callback(el);
  };
  const onMeta = () => {
    el.removeEventListener('loadstart', onLoadStart);
    el.removeEventListener('loadedmetadata', onMeta);
    callback(el);
  };
  el.addEventListener('loadstart', onLoadStart);
  el.addEventListener('loadedmetadata', onMeta);
  let attempts = 0;
  const checkInterval = setInterval(() => {
    attempts++;
    if (hasValidSource(el) || el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      clearInterval(checkInterval);
      el.removeEventListener('loadstart', onLoadStart);
      el.removeEventListener('loadedmetadata', onMeta);
      callback(el);
    } else if (attempts >= 10) {
      clearInterval(checkInterval);
      el.removeEventListener('loadstart', onLoadStart);
      el.removeEventListener('loadedmetadata', onMeta);
      if (hasValidSource(el)) callback(el);
    }
  }, 1000);
}

export const isBeatport = window.location.href.includes('beatport.com');

(function patchCreateElement(): void {
  const originalCreateElement = document.createElement.bind(document);
  const originalAudio = window.Audio;
  document.createElement = function <T extends HTMLElement>(
    tagName: string,
    options?: ElementCreationOptions,
  ): T {
    const el = originalCreateElement(tagName, options) as T;
    if ((tagName === 'audio' || tagName === 'video') && _handler)
      _handler(el as unknown as HTMLMediaElement);
    return el;
  } as typeof document.createElement;
  if (originalAudio) {
    class PatchedAudio extends originalAudio {
      constructor(src?: string) {
        super(src);
        if (_handler) _handler(this);
      }
    }
    (PatchedAudio as any).__original__ = originalAudio;
    window.Audio = PatchedAudio as any;
  }
  if (isBeatport) {
    const nativePlaybackRateDescriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      'playbackRate',
    );
    (window as any).___tp_nativePlaybackRateDescriptor = nativePlaybackRateDescriptor;
    const origCMS = AudioContext.prototype.createMediaElementSource.bind(AudioContext.prototype);
    let dummyCtx: AudioContext | null = null;
    try {
      dummyCtx = new AudioContext();
    } catch {}
    AudioContext.prototype.createMediaElementSource = function (
      this: AudioContext,
      element: HTMLMediaElement,
    ): MediaElementAudioSourceNode {
      if (dummyCtx) {
        try {
          return origCMS.call(dummyCtx, element);
        } catch (e) {
          return dummyCtx.createGain() as unknown as MediaElementAudioSourceNode;
        }
      }
      return origCMS.call(this, element);
    };
    try {
      (window as any).___tp_earlyContext = new AudioContext();
    } catch {}
  }
})();

export function logError(scope: string, event: string, data?: unknown): void {
  console.error(`[${scope}] ${event}`, data ?? '');
  try {
    chrome.runtime.sendMessage({
      type: 'logger-error',
      entry: {
        lvl: 'error',
        scope,
        event,
        msg: typeof data === 'string' ? data : undefined,
        ctx: data,
      },
      pageUrl: window.location.href,
    });
  } catch {}
}

export function isSecurityError(error: unknown, url: string): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const blocked = msg.includes('Blocked a frame with origin') || msg.includes('SecurityError');
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {}
  if (blocked && hostname) {
    const known = new Set([
      'youtube.googleapis.com',
      'youtube.com',
      'www.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
      'w.soundcloud.com',
    ]);
    if (known.has(hostname)) return false;
    if (
      hostname.endsWith('.cloudfastcdn.net') ||
      hostname.endsWith('.webcloudcdn.net') ||
      hostname.endsWith('.youtube.googleapis.com')
    )
      return false;
  }
  return blocked;
}
