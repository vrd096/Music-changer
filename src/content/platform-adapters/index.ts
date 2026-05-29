import type { PlatformAdapter } from './types';
import { createYouTubeAdapter } from './youtube';
import { createSoundCloudAdapter } from './soundcloud';
import { createJunoDownloadAdapter } from './junodownload';
import { createBeatportAdapter } from './beatport';
import { createDefaultAdapter } from './default';

export type { PlatformAdapter } from './types';

const adapters: PlatformAdapter[] = [
  createYouTubeAdapter(),
  createSoundCloudAdapter(),
  createJunoDownloadAdapter(),
  createBeatportAdapter(),
  createDefaultAdapter(),
];

export function getAdapter(url?: string): PlatformAdapter {
  const targetUrl = url || window.location.href;
  for (const adapter of adapters) {
    if (adapter.canHandle(targetUrl)) return adapter;
  }
  return adapters[adapters.length - 1];
}
