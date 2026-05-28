import type { PlatformAdapter } from './types';

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'YouTube';

  canHandle(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  findMedia(): HTMLMediaElement | null {
    const videos = document.querySelectorAll<HTMLVideoElement>(
      'video.video-stream, video.html5-main-video',
    );
    if (videos.length > 0) {
      let best: HTMLVideoElement | null = null;
      let bestArea = 0;
      for (const v of videos) {
        if (v.classList.contains('ad-showing') || v.closest('.ad-container')) continue;
        const rect = v.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = v;
        }
      }
      if (best) return best;
      return videos[0];
    }

    const allVideos = document.querySelectorAll<HTMLVideoElement>('video');
    if (allVideos.length > 0) {
      let best: HTMLVideoElement | null = null;
      let bestArea = 0;
      for (const v of allVideos) {
        const rect = v.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = v;
        }
      }
      return best;
    }

    return null;
  }

  containsPlayableMedia(): boolean {
    return !!document.querySelector('video.video-stream, video.html5-main-video, video');
  }
}
