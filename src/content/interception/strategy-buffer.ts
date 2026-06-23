import { getOrCreateEarlyContext } from './context-provider';
import type { InterceptionStrategy, InterceptionResult } from './types';

const BUFFER_FETCH_TIMEOUT_MS = 15000;

function unmuteOriginalElement(el: HTMLMediaElement): void {
  try {
    el.volume = 1;
    el.muted = false;
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
}

async function fetchAndDecode(url: string, ctx: AudioContext, signal: AbortSignal): Promise<AudioBuffer> {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

export function createBufferStrategy(): InterceptionStrategy {
  return {
    level: 4,
    name: 'Buffer Fetch',

    detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      const src = el.src || el.currentSrc || '';

      if (!src || src.startsWith('blob:')) {
        return Promise.resolve({
          success: false,
          strategy: 4,
          reason: 'No fetchable audio URL (blob or empty)',
          nextLevel: 5,
        });
      }

      if (!src.startsWith('http://') && !src.startsWith('https://')) {
        return Promise.resolve({
          success: false,
          strategy: 4,
          reason: 'Unsupported URL protocol for buffer fetch',
          nextLevel: 5,
        });
      }

      const ctx = getOrCreateEarlyContext();

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), BUFFER_FETCH_TIMEOUT_MS);

      return fetchAndDecode(src, ctx, abortController.signal)
        .then((audioBuffer) => {
          clearTimeout(timeout);
          muteOriginalElement(el);
          const bufferSource = ctx.createBufferSource();
          bufferSource.buffer = audioBuffer;
          return {
            success: true,
            strategy: 4,
            sourceNode: bufferSource,
          } satisfies InterceptionResult;
        })
        .catch((err) => {
          clearTimeout(timeout);
          unmuteOriginalElement(el);
          console.warn('[BufferFetch] Failed:', err?.message || err);
          return {
            success: false,
            strategy: 4,
            reason: 'Buffer fetch/decode failed',
            nextLevel: 5,
          } satisfies InterceptionResult;
        });
    },
  };
}
