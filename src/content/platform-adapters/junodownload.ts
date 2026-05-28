import type { PlatformAdapter } from './types';

export function createJunoDownloadAdapter(): PlatformAdapter {
  return {
    platform: 'JunoDownload',

    canHandle(url: string): boolean {
      return url.includes('junodownload.com') || url.includes('juno.co.uk');
    },

    findMedia(): HTMLMediaElement | null {
      const audios = document.querySelectorAll('audio');
      const videos = document.querySelectorAll('video');
      const allMedia = [...audios, ...videos] as HTMLMediaElement[];
      if (allMedia.length === 0) return null;
      let best: HTMLMediaElement | null = null;
      let bestDuration = 0;
      for (const el of allMedia) {
        if (el.src && !el.src.includes('blob:')) {
          const d = el.duration || 0;
          if (d > bestDuration) {
            bestDuration = d;
            best = el;
          }
        }
      }
      return best || allMedia[0];
    },

    containsPlayableMedia(): boolean {
      return !!document.querySelector('audio, video');
    },
  };
}
