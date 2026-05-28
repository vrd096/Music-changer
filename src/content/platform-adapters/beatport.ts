import type { PlatformAdapter } from './types';

export class BeatportAdapter implements PlatformAdapter {
  readonly platform = 'Beatport';

  canHandle(url: string): boolean {
    return url.includes('beatport.com');
  }

  findMedia(): HTMLMediaElement | null {
    return null;
  }

  containsPlayableMedia(): boolean {
    return true;
  }
}
