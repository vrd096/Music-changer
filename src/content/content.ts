// ============================================================
// Content Script - runs in MAIN world
// Audio processing engine: manages playback rate, pitch, semitone,
// formant, and loop mode for media elements on the page.
// ============================================================

import { isBlockedUrl } from '../shared/types';
import { INIT_FLAG } from './media-detection';
import { AudioEngine } from './audio-engine';

// ============================================================
// Main initialization
// ============================================================

let audioEngine: AudioEngine | null = null;

// Listen for commands from content-dispatcher (ISOLATED world)
// Content-dispatcher получает команды от popup/sidepanel через chrome.tabs.sendMessage
// и пересылает их в MAIN world через CustomEvent 'transpose-dispatch-controls-to-content'
window.addEventListener('transpose-dispatch-controls-to-content', ((event: CustomEvent) => {
  const msg = event.detail;
  if (!msg || typeof msg !== 'object') return;

  console.log('[Content] Received command from dispatcher:', msg);

  // Initialize AudioEngine if needed
  if (!audioEngine) {
    audioEngine = new AudioEngine();
  }

  // Process command
  const { sender, tabId, command, ...params } = msg;

  // Handle 'set' commands (from popup/sidepanel controls)
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

  // Handle 'transport' commands
  if (command === 'transport') {
    if (params.action === 'play') {
      // Используем адаптер для поиска медиа, либо все video/audio
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

  // Forward state back to service worker for badge update
  try {
    chrome.runtime.sendMessage({
      ...msg,
      sender: 'content',
      command: 'set-from-content',
    });
  } catch {
    /* ignore */
  }
}) as EventListener);

// Initialize if URL is not blocked
if (!(window as any)[INIT_FLAG]) {
  (window as any)[INIT_FLAG] = true;

  if (!isBlockedUrl(window.location.href)) {
    // Initialize AudioEngine
    audioEngine = new AudioEngine();
    (window as any).___tp_audioEngine = audioEngine;

    // Signal that content script is ready
    try {
      chrome.runtime.sendMessage({
        type: 'enable-tab-connect',
        url: window.location.href,
        title: document.title,
      });
    } catch {
      /* ignore */
    }
  }
}
