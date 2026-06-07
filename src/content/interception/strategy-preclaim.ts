import { getOrCreateEarlyContext } from './context-provider';
import type { InterceptionStrategy, InterceptionResult } from './types';

const PRECLAIM_TIMEOUT_MS = 5000;

const preClaimedElements = new WeakSet<HTMLMediaElement>();
const playOriginals = new WeakMap<HTMLMediaElement, () => Promise<void>>();

export function createPreClaimStrategy(): InterceptionStrategy {
  return {
    level: 2,
    name: 'Pre-Claim',

    detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      if (preClaimedElements.has(el)) {
        return Promise.resolve({
          success: false,
          strategy: 2,
          reason: 'Already attempted pre-claim on this element',
          nextLevel: 3,
        });
      }

      preClaimedElements.add(el);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          el.play = originalPlay;
          resolve({
            success: false,
            strategy: 2,
            reason: 'Pre-claim timed out waiting for play()',
            nextLevel: 3,
          });
        }, PRECLAIM_TIMEOUT_MS);

        const originalPlay = el.play.bind(el);
        playOriginals.set(el, originalPlay);

        el.play = function (this: HTMLMediaElement): Promise<void> {
          clearTimeout(timeout);
          el.play = originalPlay;

          try {
            const ctx = getOrCreateEarlyContext();
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {});
            }
            const sourceNode = ctx.createMediaElementSource(el);
            resolve({ success: true, strategy: 2, sourceNode });
          } catch {
            resolve({
              success: false,
              strategy: 2,
              reason: 'Site claimed element before us on play()',
              nextLevel: 3,
            });
          }

          return originalPlay();
        };
      });
    },
  };
}
