import { getOrCreateEarlyContext } from './context-provider';
import type { InterceptionStrategy, InterceptionResult } from './types';

function waitForUserGesture(): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', handler);
      resolve();
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('keydown', handler, { once: true });
  });
}

const connectedElements = new WeakSet<HTMLMediaElement>();

export function createDirectStrategy(): InterceptionStrategy {
  return {
    level: 1,
    name: 'Direct',

    async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      try {
        const ctx = getOrCreateEarlyContext();
        (ctx as any).__tp_owned = true;

        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {
            // ignore
          }
          if (ctx.state === 'suspended') {
            await waitForUserGesture();
            await ctx.resume();
          }
        }

        if (connectedElements.has(el)) {
          return {
            success: false,
            strategy: 1,
            reason: 'Element already connected to our AudioContext (previous attempt)',
            nextLevel: 2,
          };
        }

        const sourceNode = ctx.createMediaElementSource(el);
        connectedElements.add(el);

        return {
          success: true,
          strategy: 1,
          sourceNode,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (
          msg.includes('already connected') ||
          msg.includes('InvalidStateError') ||
          (err instanceof DOMException && err.name === 'InvalidStateError')
        ) {
          return {
            success: false,
            strategy: 1,
            reason: 'Media element already connected to another AudioContext',
            nextLevel: 2,
          };
        }

        return {
          success: false,
          strategy: 1,
          reason: msg || 'createMediaElementSource failed',
          nextLevel: 2,
        };
      }
    },
  };
}
