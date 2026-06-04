import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { logError } from '../media-detection';

export interface WorkletLoader {
  load(ctx: AudioContext): Promise<AudioWorkletNode | null>;
}

export function createWorkletLoader(): WorkletLoader {
  let workletInitPromise: Promise<AudioWorkletNode | null> | null = null;
  let isTpReady = false;

  return {
    async load(ctx: AudioContext): Promise<AudioWorkletNode | null> {
      if (isTpReady && workletInitPromise) {
        return workletInitPromise;
      }

      if (workletInitPromise) {
        return workletInitPromise;
      }

      workletInitPromise = initWorklet(ctx);
      return workletInitPromise;
    },
  };

  async function initWorklet(ctx: AudioContext): Promise<AudioWorkletNode | null> {
    const extOrigin: string =
      (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('') : '') ||
      document.documentElement.dataset.tpExtensionOrigin ||
      '';

    if (!extOrigin) {
      console.warn('[WorkletLoader] Extension origin not available');
      workletInitPromise = null;
      return null;
    }

    const rgu = (path: string) => extOrigin + path;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      await SoundTouchNode.register(ctx, rgu('soundtouch-processor.js'));
      console.log('[WorkletLoader] soundtouch-processor.js registered');

      const workletNode = new SoundTouchNode({ context: ctx });
      isTpReady = true;
      console.log('[WorkletLoader] SoundTouchJS processor ready');

      return workletNode;
    } catch (err) {
      logError('WorkletLoader', 'SoundTouchJS setup failed', err);
      workletInitPromise = null;
      return null;
    }
  }
}
