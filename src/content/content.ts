import { isBlockedUrl } from '../shared/helpers';
import { INIT_FLAG } from './media-detection';
import { createAudioEngine, type AudioEngineAPI } from './audio-engine';

let audioEngine: AudioEngineAPI | null = null;

document.addEventListener('transpose-dispatch-controls-to-content', ((event: CustomEvent) => {
  const msg = event.detail;
  if (!msg || typeof msg !== 'object') return;

  console.log('[Content] Received command from dispatcher:', msg);

  if (!audioEngine) {
    audioEngine = createAudioEngine();
  }

  const { sender, tabId, command, ...params } = msg;

  if (params.speed !== undefined) {
    audioEngine.setSpeed(params.speed);
  }

  if (params.semitone !== undefined) {
    audioEngine.setSemitone(params.semitone);
  }

  if (params.pitch !== undefined) {
    audioEngine.setPitch(params.pitch);
  }

  if (params.formant !== undefined) {
    audioEngine.setFormant(params.formant);
  }

  if (params.loopMode !== undefined) {
    audioEngine.setLoopMode(params.loopMode);
  }

  if (params.varispeed !== undefined) {
    audioEngine.setVarispeed(params.varispeed);
  }

  if (params.eqEnabled !== undefined) {
    audioEngine.setEqEnabled(params.eqEnabled);
  }

  if (params.eqBand !== undefined) {
    const { index, gain } = params.eqBand as { index: number; gain: number };
    audioEngine.setEqBand(index, gain);
  }

  if (command === 'transport') {
    if (params.action === 'play') {
      const mediaEl = audioEngine ? (audioEngine as any).mediaElement : null;
      if (mediaEl) {
        (mediaEl as HTMLMediaElement).play().catch(() => {});
      } else {
        document.querySelectorAll('video, audio').forEach((el) => {
          (el as HTMLMediaElement).play().catch(() => {});
        });
      }
    } else if (params.action === 'pause') {
      const mediaEl = audioEngine ? (audioEngine as any).mediaElement : null;
      if (mediaEl) {
        (mediaEl as HTMLMediaElement).pause();
      } else {
        document.querySelectorAll('video, audio').forEach((el) => {
          (el as HTMLMediaElement).pause();
        });
      }
    }
  }

  try {
    chrome.runtime.sendMessage({
      ...msg,
      sender: 'content',
      command: 'set-from-content',
    });
  } catch {}
}) as EventListener);

if (!(window as any)[INIT_FLAG]) {
  (window as any)[INIT_FLAG] = true;

  if (!isBlockedUrl(window.location.href)) {
    audioEngine = createAudioEngine();
    (window as any).___tp_audioEngine = audioEngine;

    try {
      chrome.runtime.sendMessage({
        type: 'enable-tab-connect',
        url: window.location.href,
        title: document.title,
      });
    } catch {}
  }
}
