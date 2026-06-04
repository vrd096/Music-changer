import type { InterceptionStrategy, InterceptionResult } from './types';

export function createPreClaimStrategy(): InterceptionStrategy {
  let preClaimedElements = new WeakSet<HTMLMediaElement>();
  let preClaimSuccess = false;

  return {
    level: 2,
    name: 'Pre-Claim',

    async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      if (preClaimedElements.has(el)) {
        if (preClaimSuccess) {
          const ctx = new AudioContext();
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          try {
            const sourceNode = ctx.createMediaElementSource(el);
            return {
              success: true,
              strategy: 2,
              sourceNode,
            };
          } catch {
            preClaimSuccess = false;
            return {
              success: false,
              strategy: 2,
              reason: 'Pre-claim lost after initial success',
              nextLevel: 3,
            };
          }
        }

        return {
          success: false,
          strategy: 2,
          reason: 'Site claimed element before us',
          nextLevel: 3,
        };
      }

      preClaimedElements.add(el);

      const originalPlay = el.play.bind(el);
      let playIntercepted = false;

      el.play = function (this: HTMLMediaElement): Promise<void> {
        if (!playIntercepted) {
          playIntercepted = true;

          const ctx = new AudioContext();
          try {
            ctx.createMediaElementSource(el);
            preClaimSuccess = true;
            console.log('[PreClaim] Successfully claimed media element before site');
          } catch {
            preClaimSuccess = false;
          }
        }
        return originalPlay();
      };

      if (!preClaimSuccess) {
        return {
          success: false,
          strategy: 2,
          reason: 'Awaiting play() to attempt pre-claim',
          nextLevel: 3,
        };
      }

      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      try {
        const sourceNode = ctx.createMediaElementSource(el);
        return {
          success: true,
          strategy: 2,
          sourceNode,
        };
      } catch {
        return {
          success: false,
          strategy: 2,
          reason: 'Pre-claim failed on retry',
          nextLevel: 3,
        };
      }
    },
  };
}
