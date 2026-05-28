import type { PlatformAdapter } from './types';

export function createSoundCloudAdapter(): PlatformAdapter {
  return {
    platform: 'SoundCloud',

    canHandle(url: string): boolean {
      return url.includes('soundcloud.com');
    },

    findMedia(): HTMLMediaElement | null {
      const playerEl = document.querySelector('.playControls');
      if (playerEl) {
        const audioInPlayer = playerEl.querySelector('audio');
        if (audioInPlayer) return audioInPlayer;
      }
      const audios = document.querySelectorAll('audio');
      if (audios.length > 0) {
        let best: HTMLAudioElement | null = null;
        let bestDuration = 0;
        for (const audio of audios) {
          if (!audio.src && !audio.srcObject) continue;
          const d = audio.duration || 0;
          if (d > bestDuration) {
            bestDuration = d;
            best = audio;
          }
        }
        if (best) return best;
        for (const audio of audios) {
          if (audio.src || audio.srcObject) return audio as HTMLAudioElement;
        }
        return audios[audios.length - 1] as HTMLAudioElement;
      }
      return null;
    },

    containsPlayableMedia(): boolean {
      return !!document.querySelector('.playControls') || !!document.querySelector('audio');
    },
  };
}
