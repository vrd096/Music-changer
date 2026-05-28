import type { PlatformAdapter } from './types';
import { YouTubeAdapter } from './youtube';
import { SoundCloudAdapter } from './soundcloud';
import { JunoDownloadAdapter } from './junodownload';
import { BeatportAdapter } from './beatport';
import { DefaultAdapter } from './default';

export type { PlatformAdapter } from './types';
export { DefaultAdapter } from './default';
export { YouTubeAdapter } from './youtube';
export { SoundCloudAdapter } from './soundcloud';
export { JunoDownloadAdapter } from './junodownload';
export { BeatportAdapter } from './beatport';

export class AdapterManager {
  private adapters: PlatformAdapter[];

  constructor() {
    this.adapters = [
      new YouTubeAdapter(),
      new SoundCloudAdapter(),
      new JunoDownloadAdapter(),
      new BeatportAdapter(),
      new DefaultAdapter(),
    ];
  }

  getAdapter(): PlatformAdapter {
    const url = window.location.href;
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url)) {
        return adapter;
      }
    }
    return this.adapters[this.adapters.length - 1];
  }
}
