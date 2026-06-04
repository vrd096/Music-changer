import type { InterceptionStrategy, InterceptionResult } from './types';

export function createFallbackStrategy(): InterceptionStrategy {
  return {
    level: 5,
    name: 'Fallback',

    async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
      try {
        el.preservesPitch = false;
      } catch {
        // preservesPitch may not be supported everywhere
      }

      return {
        success: true,
        strategy: 5,
        sourceNode: undefined,
      };
    },
  };
}
