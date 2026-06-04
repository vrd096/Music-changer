import type { InterceptionStrategy, InterceptionResult } from './types';

const HOOK_BLACKLIST = [
  'soundation.com',
  'bandlab.com',
  'audiotool.com',
  'vcvrack.com',
  'websynths.com',
  'musiclab.chromeexperiments.com',
];

let isInstalled = false;
let capturedSourceNode: MediaElementAudioSourceNode | null = null;
let isHooking = false;

interface Originals {
  createMediaElementSource: typeof AudioContext.prototype.createMediaElementSource;
}

const originals: Originals = {} as Originals;

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
    capturedSourceNode = result;
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
  capturedSourceNode = null;
}

export function createAudioContextHookStrategy(): InterceptionStrategy {
  return {
    level: 3,
    name: 'AudioContext Hook',

    async detect(_el: HTMLMediaElement): Promise<InterceptionResult> {
      if (isBlacklisted()) {
        return {
          success: false,
          strategy: 3,
          reason: 'Site is blacklisted for AudioContext hooking',
          nextLevel: 4,
        };
      }

      if (!isInstalled) {
        installHook();
        return {
          success: false,
          strategy: 3,
          reason: 'Hook installed — waiting for site to create AudioContext',
          nextLevel: 4,
        };
      }

      if (capturedSourceNode) {
        const node = capturedSourceNode;
        capturedSourceNode = null;
        return {
          success: true,
          strategy: 3,
          sourceNode: node,
        };
      }

      return {
        success: false,
        strategy: 3,
        reason: 'Hook active but no source captured yet',
        nextLevel: 4,
      };
    },
  };
}

export { installHook, uninstallHook, isBlacklisted };
