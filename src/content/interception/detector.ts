import { isBlockedUrl } from '../../shared/helpers';
import { hasValidSource, waitForSource, pendingMediaElements } from '../media-detection';
import type { MediaDetector, MediaElementCallback } from './types';

export function createMediaDetector(): MediaDetector {
  let callbacks: MediaElementCallback[] = [];
  let mutationObserver: MutationObserver | null = null;
  let findInterval: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;
  let createElementPatched = false;
  let audioConstructorPatched = false;

  const isYouTubeSoundEffect = (el: HTMLMediaElement): boolean => {
    if (!(el instanceof HTMLAudioElement)) return false;
    const src = el.getAttribute('src') || el.src || '';
    return src.includes('/s/search/audio/');
  };

  function isPageUrlAsSrc(el: HTMLMediaElement): boolean {
    if (!el.src && !el.currentSrc) return false;
    const src = el.src || el.currentSrc;
    try {
      const srcUrl = new URL(src);
      const pageUrl = new URL(window.location.href);
      return srcUrl.href === pageUrl.href;
    } catch {
      return false;
    }
  }

  function isLikelySoundEffect(el: HTMLMediaElement): boolean {
    if (!(el instanceof HTMLAudioElement)) return false;
    const src = el.src || el.currentSrc || '';
    if (src.includes('/mp3/bb')) return true;
    if (el.duration > 0 && el.duration < 5) return true;
    return false;
  }

  function notifyCallbacks(el: HTMLMediaElement): void {
    if (isBlockedUrl(window.location.href)) return;
    if (isYouTubeSoundEffect(el)) return;
    if (isPageUrlAsSrc(el)) return;
    if (isLikelySoundEffect(el)) return;

    for (const cb of callbacks) {
      try {
        cb(el);
      } catch {
        // ignore callback errors
      }
    }
  }

  function patchCreateElement(): void {
    if (createElementPatched) return;
    createElementPatched = true;

    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function <T extends HTMLElement>(
      tagName: string,
      options?: ElementCreationOptions,
    ): T {
      const el = originalCreateElement(tagName, options) as T;
      if (tagName === 'audio' || tagName === 'video') {
        const mediaEl = el as unknown as HTMLMediaElement;
        if (!isPageUrlAsSrc(mediaEl) && !isLikelySoundEffect(mediaEl)) {
          if (hasValidSource(mediaEl)) {
            notifyCallbacks(mediaEl);
          } else {
            pendingMediaElements.push(mediaEl);
            waitForSource(mediaEl, (readyEl) => {
              const idx = pendingMediaElements.indexOf(readyEl);
              if (idx !== -1) pendingMediaElements.splice(idx, 1);
              notifyCallbacks(readyEl);
            });
          }
        }
      }
      return el;
    } as typeof document.createElement;
  }

  function patchAudioConstructor(): void {
    if (audioConstructorPatched) return;
    audioConstructorPatched = true;

    const OriginalAudio = window.Audio;
    if (!OriginalAudio) return;

    class PatchedAudio extends OriginalAudio {
      constructor(src?: string) {
        super(src);
        const el = this as unknown as HTMLMediaElement;
        if (isPageUrlAsSrc(el) || isLikelySoundEffect(el)) return;
        if (hasValidSource(el)) {
          notifyCallbacks(el);
        } else {
          pendingMediaElements.push(el);
          waitForSource(el, (readyEl) => {
            const idx = pendingMediaElements.indexOf(readyEl);
            if (idx !== -1) pendingMediaElements.splice(idx, 1);
            notifyCallbacks(readyEl);
          });
        }
      }
    }
    (PatchedAudio as any).__original__ = OriginalAudio;
    window.Audio = PatchedAudio as any;
  }

  function scanExisting(): void {
    const elements = document.querySelectorAll<HTMLMediaElement>('audio, video');
    for (const el of elements) {
      if (isPageUrlAsSrc(el) || isLikelySoundEffect(el)) continue;
      if (hasValidSource(el)) {
        notifyCallbacks(el);
      } else {
        pendingMediaElements.push(el);
        waitForSource(el, (readyEl) => {
          const idx = pendingMediaElements.indexOf(readyEl);
          if (idx !== -1) pendingMediaElements.splice(idx, 1);
          notifyCallbacks(readyEl);
        });
      }
    }
  }

  function startMutationObserver(): void {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node instanceof HTMLMediaElement) {
            if (isPageUrlAsSrc(node) || isLikelySoundEffect(node)) continue;
            if (hasValidSource(node)) {
              notifyCallbacks(node);
            } else {
              pendingMediaElements.push(node);
              waitForSource(node, (readyEl) => {
                const idx = pendingMediaElements.indexOf(readyEl);
                if (idx !== -1) pendingMediaElements.splice(idx, 1);
                notifyCallbacks(readyEl);
              });
            }
          }

          if (node.querySelectorAll) {
            const nested = node.querySelectorAll<HTMLMediaElement>('audio, video');
            for (const el of nested) {
              if (isPageUrlAsSrc(el) || isLikelySoundEffect(el)) continue;
              if (hasValidSource(el)) {
                notifyCallbacks(el);
              } else {
                pendingMediaElements.push(el);
                waitForSource(el, (readyEl) => {
                  const idx = pendingMediaElements.indexOf(readyEl);
                  if (idx !== -1) pendingMediaElements.splice(idx, 1);
                  notifyCallbacks(readyEl);
                });
              }
            }
          }
        }
      }
    });

    const target = document.body || document.documentElement;
    mutationObserver.observe(target, { childList: true, subtree: true });
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;

      patchCreateElement();
      patchAudioConstructor();
      scanExisting();
      startMutationObserver();

      findInterval = setInterval(() => {
        scanExisting();
      }, 2000);
    },

    stop() {
      isRunning = false;
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      if (findInterval) {
        clearInterval(findInterval);
        findInterval = null;
      }
    },

    onElement(cb: MediaElementCallback) {
      callbacks.push(cb);
    },
  };
}
