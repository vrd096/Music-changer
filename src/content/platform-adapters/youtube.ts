import type { PlatformAdapter } from './types';

export function createYouTubeAdapter(): PlatformAdapter {
  return {
    platform: 'YouTube',

    canHandle(url: string): boolean {
      return url.includes('youtube.com') || url.includes('youtu.be');
    },

    findMedia(): HTMLMediaElement | null {
      const videos = document.querySelectorAll<HTMLVideoElement>(
        'video.video-stream, video.html5-main-video',
      );
      if (videos.length > 0) {
        let best: HTMLVideoElement | null = null;
        let bestArea = 0;
        for (const video of videos) {
          if (video.classList.contains('ad-showing') || video.closest('.ad-container')) continue;
          const rect = video.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > bestArea) {
            bestArea = area;
            best = video;
          }
        }
        if (best) return best;
        return videos[0];
      }
      const allVideos = document.querySelectorAll<HTMLVideoElement>('video');
      if (allVideos.length > 0) {
        let best: HTMLVideoElement | null = null;
        let bestArea = 0;
        for (const video of allVideos) {
          const rect = video.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > bestArea) {
            bestArea = area;
            best = video;
          }
        }
        return best;
      }
      return null;
    },

    containsPlayableMedia(): boolean {
      return !!document.querySelector('video.video-stream, video.html5-main-video, video');
    },
  };
}
