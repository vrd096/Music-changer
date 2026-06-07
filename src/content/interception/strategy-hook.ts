import { getOrCreateEarlyContext } from './context-provider';
import type { InterceptionStrategy, InterceptionResult } from './types';

const HOOK_BLACKLIST = [
  'soundation.com',
  'bandlab.com',
  'audiotool.com',
  'vcvrack.com',
  'websynths.com',
  'musiclab.chromeexperiments.com',
];

const HOOK_TIMEOUT_MS = 10000;

interface Originals {
  createMediaElementSource: typeof AudioContext.prototype.createMediaElementSource;
}

const originals: Originals = {} as Originals;

interface PendingResolver {
  resolve: (result: InterceptionResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pendingResolvers = new Map<HTMLMediaElement, PendingResolver>();
let isInstalled = false;

function isBlacklisted(): boolean {
  const hostname = window.location.hostname;
  return HOOK_BLACKLIST.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
}

function installHook(): void {
  if (isInstalled || isBlacklisted()) return;

  originals.createMediaElementSource = AudioContext.prototype.createMediaElementSource;

  AudioContext.prototype.createMediaElementSource = function (
    this: AudioContext,
    element: HTMLMediaElement,
  ): MediaElementAudioSourceNode {
    if ((this as any).__tp_owned) {
      return originals.createMediaElementSource.call(this, element);
    }

    const result = originals.createMediaElementSource.call(this, element);

    const entry = pendingResolvers.get(element);
    if (entry) {
      clearTimeout(entry.timeout);
      pendingResolvers.delete(element);
      entry.resolve({ success: true, strategy: 3, sourceNode: result });
    }

    return result;
  };

  isInstalled = true;
}

function uninstallHook(): void {
  if (!isInstalled) return;

  if (originals.createMediaElementSource) {
    AudioContext.prototype.createMediaElementSource = originals.createMediaElementSource;
  }

  isInstalled = false;

  for (const [element, entry] of pendingResolvers) {
    clearTimeout(entry.timeout);
    entry.resolve({
      success: false,
      strategy: 3,
      reason: 'Hook uninstalled',
      nextLevel: 4,
    });
  }
  pendingResolvers.clear();
}

export function createAudioContextHookStrategy(): InterceptionStrategy {
  return {
    level: 3,
    name: 'AudioContext Hook',

    detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      if (isBlacklisted()) {
        return Promise.resolve({
          success: false,
          strategy: 3,
          reason: 'Site is blacklisted for AudioContext hooking',
          nextLevel: 4,
        });
      }

      if (!isInstalled) {
        installHook();
      }

      if (!isInstalled) {
        return Promise.resolve({
          success: false,
          strategy: 3,
          reason: 'Hook installation failed (blacklisted)',
          nextLevel: 4,
        });
      }

      if (pendingResolvers.has(el)) {
        return Promise.resolve({
          success: false,
          strategy: 3,
          reason: 'Already waiting for hook on this element',
          nextLevel: 4,
        });
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pendingResolvers.delete(el);
          resolve({
            success: false,
            strategy: 3,
            reason: 'Hook timed out waiting for AudioContext creation',
            nextLevel: 4,
          });
        }, HOOK_TIMEOUT_MS);

        pendingResolvers.set(el, { resolve, timeout });
      });
    },
  };
}

export { installHook, uninstallHook, isBlacklisted };
