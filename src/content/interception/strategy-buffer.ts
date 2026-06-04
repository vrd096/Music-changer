import { getAdapter } from '../platform-adapters';
import { DEFAULT_EQ_BANDS } from '../../shared/types';
import type { EqBand } from '../../shared/types';
import {
  isBeatport as isBeatportPage,
  logError,
  hasValidSource,
  waitForSource,
  pendingMediaElements,
  setMediaElementHandler,
} from '../media-detection';
import type { InterceptionStrategy, InterceptionResult } from './types';

let skipAudioWorklet = false;

function isPageUrlAsSrc(el: HTMLMediaElement): boolean {
  if (!el.src) return false;
  try {
    const srcUrl = new URL(el.src);
    const pageUrl = new URL(window.location.href);
    return (
      srcUrl.href === pageUrl.href ||
      (srcUrl.origin === pageUrl.origin && srcUrl.pathname === pageUrl.pathname)
    );
  } catch {
    return false;
  }
}

function isVibesFastActive(): boolean {
  for (const audio of document.querySelectorAll<HTMLAudioElement>('audio')) {
    if (isPageUrlAsSrc(audio)) return true;
  }
  return false;
}

function watchBeatportElement(
  el: HTMLMediaElement,
  onAudioReady: (buffer: AudioBuffer, url: string) => void,
  onPlay: () => void,
  onPause: () => void,
  onSeek: (time: number) => void,
  getSpeed: () => number,
): void {
  let urlDetected = false;
  let preparingBeatport = false;
  let pendingPlay = false;
  let pollForUrl: ReturnType<typeof setTimeout> | null = null;

  try {
    el.crossOrigin = 'anonymous';
  } catch {
    // ignore
  }

  const originalPlay = el.play.bind(el);
  let playRequested = false;

  el.play = function (): Promise<void> {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com')) return originalPlay();
    playRequested = true;
    pendingPlay = true;
    return Promise.resolve();
  };

  const onTrackChange = () => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com')) {
      preparingBeatport = false;
      try {
        el.volume = 0;
        el.muted = true;
      } catch {
        // ignore
      }
      if (pendingPlay) {
        pendingPlay = false;
        preparingBeatport = true;
        fetchAndDecodeBeatport(src, onAudioReady, getSpeed);
      }
    }
  };

  const startUrlPolling = () => {
    if (pollForUrl) return;
    let attempts = 0;
    const maxAttempts = 50;
    const check = () => {
      attempts++;
      const src = el.src || el.currentSrc || el.getAttribute('src') || '';
      if (src.includes('geo-samples.beatport.com')) {
        pollForUrl = null;
        pendingPlay = false;
        preparingBeatport = true;
        fetchAndDecodeBeatport(src, onAudioReady, getSpeed);
        return;
      }
      if (attempts >= maxAttempts) {
        pollForUrl = null;
        return;
      }
      pollForUrl = setTimeout(check, 200);
    };
    pollForUrl = setTimeout(check, 200);
  };

  const stopUrlPolling = () => {
    if (pollForUrl) {
      clearTimeout(pollForUrl);
      pollForUrl = null;
    }
  };

  const onPlayEvent = () => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (!preparingBeatport) {
      if (src.includes('geo-samples.beatport.com')) {
        preparingBeatport = true;
        pendingPlay = false;
        stopUrlPolling();
        fetchAndDecodeBeatport(src, onAudioReady, getSpeed);
      } else {
        pendingPlay = true;
        startUrlPolling();
      }
    }
    onPlay();
  };

  const onPauseEvent = () => {
    preparingBeatport = false;
    stopUrlPolling();
    onPause();
  };

  const onSeekedEvent = () => {
    onSeek(el.currentTime);
  };

  el.addEventListener('play', onPlayEvent);
  el.addEventListener('playing', onPlayEvent);
  el.addEventListener('pause', onPauseEvent);
  el.addEventListener('seeked', onSeekedEvent);
  el.addEventListener('loadstart', onTrackChange);

  const interval = setInterval(() => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com') && !urlDetected) {
      urlDetected = true;
      clearInterval(interval);
      if (pendingPlay && !preparingBeatport) {
        pendingPlay = false;
        preparingBeatport = true;
        fetchAndDecodeBeatport(src, onAudioReady, getSpeed);
      }
      if (playRequested) {
        playRequested = false;
        originalPlay().catch(() => {});
      }
    }
  }, 200);

  setTimeout(() => {
    clearInterval(interval);
  }, 30000);
}

function fetchAndDecodeBeatport(
  url: string,
  onAudioReady: (buffer: AudioBuffer, url: string) => void,
  getSpeed: () => number,
): void {
  const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
    .then((audioBuffer) => {
      onAudioReady(audioBuffer, url);
    })
    .catch(() => {
      fetchBeatportXHR(url, onAudioReady);
    });
}

function fetchBeatportXHR(
  url: string,
  onAudioReady: (buffer: AudioBuffer, url: string) => void,
): void {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = () => {
    if (xhr.status === 200 || xhr.status === 0) {
      const earlyContext = (window as any).___tp_earlyContext as AudioContext | undefined;
      if (earlyContext) {
        earlyContext
          .decodeAudioData(xhr.response)
          .then((audioBuffer) => {
            onAudioReady(audioBuffer, url);
          })
          .catch(() => {});
      }
    }
  };
  xhr.send();
}

function hijackPlaybackRate(el: HTMLMediaElement, speed: number): void {
  const clampedSpeed = Math.max(0.25, Math.min(16, speed));
  if ((el as any).__tp_playbackRateHijacked) {
    (el as any).__tp_playbackRateValue = clampedSpeed;
    try {
      el.playbackRate = clampedSpeed;
    } catch {
      // ignore
    }
    return;
  }

  const nativeDescriptor = (window as any).___tp_nativePlaybackRateDescriptor as
    | PropertyDescriptor
    | undefined;
  (el as any).__tp_playbackRateHijacked = true;
  (el as any).__tp_playbackRateValue = clampedSpeed;

  Object.defineProperty(el, 'playbackRate', {
    get(): number {
      return (this as any).__tp_playbackRateValue ?? 1;
    },
    set(value: number) {
      (this as any).__tp_playbackRateValue = value;
      if (nativeDescriptor?.set) nativeDescriptor.set.call(this, value);
    },
    configurable: true,
    enumerable: true,
  });

  try {
    el.playbackRate = clampedSpeed;
  } catch {
    // ignore
  }
}

function muteOriginalElement(el: HTMLMediaElement): void {
  try {
    el.volume = 0;
    el.muted = true;
  } catch {
    // ignore
  }
  try {
    Object.defineProperty(el, 'volume', {
      get: () => 0,
      set: () => {},
      configurable: true,
    });
  } catch {
    // ignore
  }
}

export function createBufferStrategy(): InterceptionStrategy {
  let audioBuffer: AudioBuffer | null = null;
  let bufferSource: AudioBufferSourceNode | null = null;
  let startOffset = 0;
  let startTime = 0;
  let isBufferPlaying = false;
  let isSeeking = false;
  let lastKnownSrc = '';
  let currentSpeed = 1;
  let detectedElement: HTMLMediaElement | null = null;

  function stopPlayback(): void {
    if (bufferSource) {
      bufferSource.onended = null;
      try {
        bufferSource.stop();
        bufferSource.disconnect();
      } catch {
        // ignore
      }
      bufferSource = null;
      isBufferPlaying = false;
    }
  }

  function getPlaybackRate(semitone: number): number {
    const pitchRatio = Math.pow(2, (semitone || 0) / 12);
    return Math.max(0.25, Math.min(16, currentSpeed * pitchRatio));
  }

  function startPlayback(ctx: AudioContext, workletNode?: AudioWorkletNode): void {
    if (!audioBuffer) return;
    stopPlayback();

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.playbackRate.value = getPlaybackRate(0);

    if (workletNode) {
      src.connect(workletNode);
    } else {
      src.connect(ctx.destination);
    }

    startTime = ctx.currentTime;
    const off = Math.max(0, startOffset);
    src.start(0, off >= audioBuffer.duration ? 0 : off);
    bufferSource = src;
    isBufferPlaying = true;

    src.onended = () => {
      if (!isSeeking) {
        isBufferPlaying = false;
        bufferSource = null;
      }
    };
  }

  return {
    level: 4,
    name: 'Buffer Fetch',

    async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      if (!isBeatportPage) {
        const src = el.src || el.currentSrc || el.getAttribute('src') || '';
        if (!src || src.startsWith('blob:')) {
          return {
            success: false,
            strategy: 4,
            reason: 'No fetchable audio URL',
            nextLevel: 5,
          };
        }
      }

      detectedElement = el;
      muteOriginalElement(el);
      hijackPlaybackRate(el, currentSpeed);

      watchBeatportElement(
        el,
        (buffer, url) => {
          audioBuffer = buffer;
          lastKnownSrc = url;
        },
        () => {
          if (audioBuffer) {
            const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
            if (ctx) startPlayback(ctx);
          }
        },
        () => {
          if (bufferSource && isBufferPlaying) {
            const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
            if (ctx) startOffset += ctx.currentTime - startTime;
            stopPlayback();
          }
        },
        (newTime) => {
          if (!audioBuffer) return;
          startOffset = Math.max(0, Math.min(newTime, audioBuffer.duration));
          if (isBufferPlaying) {
            isSeeking = true;
            const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
            if (ctx) startPlayback(ctx);
            isSeeking = false;
          }
        },
        () => currentSpeed,
      );

      return {
        success: false,
        strategy: 4,
        reason: 'Buffer strategy requires async audio fetch — awaiting playback',
        nextLevel: 5,
      };
    },
  };
}
