import type { PlatformAdapter } from './types';

export class DefaultAdapter implements PlatformAdapter {
  readonly platform = 'HTML';

  canHandle(_url: string): boolean {
    return true;
  }

  findMedia(): HTMLMediaElement | null {
    const videos = document.querySelectorAll('video');
    const audios = document.querySelectorAll('audio');
    const allMedia = [...videos, ...audios] as HTMLMediaElement[];

    if (allMedia.length === 0) return null;

    let bestScore = -1;
    let bestElement: HTMLMediaElement | null = null;

    for (const el of allMedia) {
      const score = this.scoreMediaElement(el);
      if (score > bestScore) {
        bestScore = score;
        bestElement = el;
      }
    }

    return bestElement;
  }

  containsPlayableMedia(): boolean {
    return !!document.querySelector('video, audio');
  }

  private scoreMediaElement(el: HTMLMediaElement): number {
    let score = 0;

    if (!el.paused) score += 100;
    if (el.currentTime > 0) score += 50;
    if (!el.muted) score += 30;
    if (el.volume > 0) score += 20;

    if (el instanceof HTMLVideoElement) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100) score += 40;
      if (rect.width > 400) score += 30;
      if (rect.top < window.innerHeight && rect.bottom > 0) score += 20;
    }

    if (el.duration > 0 && !isNaN(el.duration)) score += 10;
    if (el.readyState >= 2) score += 15;

    if (el.classList.contains('video-stream') || el.classList.contains('html5-main-video')) {
      score += 200;
    }

    return score;
  }
}
