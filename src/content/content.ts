import { isBlockedUrl } from '../shared/helpers';
import { INIT_FLAG, isBeatport } from './media-detection';
import { createAudioEngine, type AudioEngineAPI } from './audio-engine';
import { createMediaDetector } from './interception/detector';
import { createDirectStrategy } from './interception/strategy-direct';
import { createPreClaimStrategy } from './interception/strategy-preclaim';
import { createAudioContextHookStrategy } from './interception/strategy-hook';
import { createBufferStrategy } from './interception/strategy-buffer';
import { createFallbackStrategy } from './interception/strategy-fallback';
import { createPipeline, type ProcessingPipeline } from './processing/pipeline';
import type { InterceptionStrategy } from './interception/types';
import { getOrCreateEarlyContext } from './interception/context-provider';

const useLegacyEngine = isBeatport;

let pipeline: ProcessingPipeline | null = null;
let audioEngine: AudioEngineAPI | null = null;
let pipelineActive = false;
let currentStrategyLevel = 0;
let activeMediaElement: HTMLMediaElement | null = null;
let lastConnectedSrc = '';
const handledElements = new WeakSet<HTMLMediaElement>();

let cascadeLock: Promise<void> | null = null;

function isDirectHttpAudio(el: HTMLMediaElement): boolean {
  if (el instanceof HTMLVideoElement) return false;
  const src = el.src || el.currentSrc || '';
  if (src.startsWith('blob:')) return false;
  return src.startsWith('http://') || src.startsWith('https://');
}

function getStrategiesForElement(el: HTMLMediaElement): InterceptionStrategy[] {
  if (isDirectHttpAudio(el)) {
    console.log(
      '[Content] %c<audio> + direct HTTP URL detected — Buffer Fetch → Hook → PreClaim → Fallback',
      'color: orange',
      '\nsrc:',
      (el.src || el.currentSrc || '').substring(0, 120),
    );
    return [
      createBufferStrategy(),
      createAudioContextHookStrategy(),
      createPreClaimStrategy(),
      createFallbackStrategy(),
    ];
  }

  console.log(
    '[Content] %c<video> or blob MSE detected — using Direct strategy',
    'color: green',
    '\ntag:',
    el.tagName,
    '\nsrc:',
    (el.src || el.currentSrc || '').substring(0, 120),
  );
  window.postMessage({ __tp_drm: true }, '*');
  return [
    createDirectStrategy(),
    createPreClaimStrategy(),
    createAudioContextHookStrategy(),
    createBufferStrategy(),
    createFallbackStrategy(),
  ];
}

function applyFallback(el: HTMLMediaElement): void {
  console.log('[Content] All strategies failed — applying Fallback (Level 5)');
  activeMediaElement = el;
  try {
    el.preservesPitch = false;
  } catch {
    // ignore
  }

  let sourceNode: MediaElementAudioSourceNode | null = null;
  try {
    const ctx = getOrCreateEarlyContext();
    sourceNode = ctx.createMediaElementSource(el);
    console.log('[DEBUG] applyFallback: createMediaElementSource succeeded');
  } catch (e) {
    console.warn('[DEBUG] applyFallback: createMediaElementSource failed:', (e as Error).message);
  }

  pipeline?.connect(sourceNode, el);
  pipeline?.setStrategyLevel(5);
  pipelineActive = true;
  currentStrategyLevel = 5;
  lastConnectedSrc = el.src || el.currentSrc || '';
  handledElements.add(el);

  const src = el.src || el.currentSrc || '';
  if (src.startsWith('http://') || src.startsWith('https://')) {
    notifyPopupTabCaptureNeeded(el);
  }
}

function notifyPopupTabCaptureNeeded(el: HTMLMediaElement): void {
  try {
    console.log(
      '[Content] Notifying popup: TabCapture needed for',
      (el.src || el.currentSrc || '').substring(0, 120),
    );
    chrome.runtime.sendMessage({
      type: 'tabcapture-needed',
      url: (el.src || el.currentSrc || '').substring(0, 200),
    });
  } catch {
    // ignore
  }
}

async function tryCascadeStrategies(
  el: HTMLMediaElement,
  strategies: InterceptionStrategy[],
): Promise<void> {
  if (cascadeLock) {
    console.log('[Content] Cascade running, waiting...');
    await cascadeLock;
    if (pipelineActive && el === activeMediaElement) {
      console.log('[Content] Cascade completed for same element, skipping duplicate');
      return;
    }
  }

  if (handledElements.has(el) && pipelineActive && el !== activeMediaElement) {
    console.log('[Content] Element already handled, skipping cascade');
    return;
  }

  if (pipelineActive && el === activeMediaElement) {
    const currentSrc = el.src || el.currentSrc || '';
    if (currentSrc && currentSrc !== lastConnectedSrc) {
      console.log('[Content] Same element but src changed — stopping & muting');
      lastConnectedSrc = currentSrc;
      pipelineActive = false;
      pipeline?.stopCurrentAudio();
      try {
        (el as HTMLAudioElement).muted = true;
      } catch {}
    } else {
      console.log('[Content] Pipeline already active on same element, skipping cascade');
      return;
    }
  }

  if (pipelineActive && el !== activeMediaElement) {
    console.log('[Content] New media element detected, reconnecting pipeline');
    pipelineActive = false;
    activeMediaElement = null;
  }

  console.log('[Content] Starting cascade with', strategies.length, 'strategies');
  let resolveLock: () => void;
  cascadeLock = new Promise<void>((r) => {
    resolveLock = r;
  });

  for (const strategy of strategies) {
    if (pipelineActive) {
      resolveLock!();
      cascadeLock = null;
      return;
    }

    console.log('[Content] Trying', strategy.name, '(Level', strategy.level, ')');

    try {
      const result = await strategy.detect(el);

      console.log(
        '[Content]',
        strategy.name,
        '→',
        result.success ? '%cSUCCESS' : '%cFAILED',
        result.success ? 'color: green' : 'color: red',
        result.reason ? '| reason: ' + result.reason : '',
        result.nextLevel !== undefined ? '| nextLevel: ' + result.nextLevel : '',
      );

      if (result.success) {
        console.log(
          '[Content] %c✓ Pipeline connected via',
          strategy.name,
          '(Level',
          strategy.level,
          ')',
          'color: green; font-weight: bold',
        );
        pipeline?.connect(result.sourceNode ?? null, el);
        pipeline?.setStrategyLevel(strategy.level);
        pipelineActive = true;
        currentStrategyLevel = strategy.level;
        activeMediaElement = el;
        lastConnectedSrc = el.src || el.currentSrc || '';
        handledElements.add(el);
        resolveLock!();
        cascadeLock = null;
        setTimeout(() => pipeline?.setSemitone(0), 100);
        return;
      }
    } catch (err) {
      console.warn('[Content]', strategy.name, 'threw:', err);
      continue;
    }
  }

  if (!pipelineActive) {
    applyFallback(el);
  }
  resolveLock!();
  cascadeLock = null;
}

document.addEventListener('transpose-dispatch-controls-to-content', ((event: CustomEvent) => {
  const msg = event.detail;
  console.log(
    '[DEBUG] content.ts received dispatch:',
    msg
      ? JSON.stringify({
          command: msg.command,
          hasSpeed: msg.speed !== undefined,
          hasSemitone: msg.semitone !== undefined,
        })
      : 'NULL',
  );
  if (!msg || typeof msg !== 'object') return;
  const { command, ...params } = msg;

  if (useLegacyEngine && audioEngine) {
    if (params.speed !== undefined) audioEngine.setSpeed(params.speed);
    if (params.semitone !== undefined) audioEngine.setSemitone(params.semitone);
    if (params.pitch !== undefined) audioEngine.setPitch(params.pitch);
    if (params.formant !== undefined) audioEngine.setFormant(params.formant);
    if (params.loopMode !== undefined) audioEngine.setLoopMode(params.loopMode);
    if (params.varispeed !== undefined) audioEngine.setVarispeed(params.varispeed);
    if (params.eqEnabled !== undefined) audioEngine.setEqEnabled(params.eqEnabled);
    if (params.eqBand !== undefined) {
      const { index, gain } = params.eqBand as { index: number; gain: number };
      audioEngine.setEqBand(index, gain);
    }
    chrome?.storage?.local?.set({
      popupSpeed: audioEngine.getState().speed ?? 1,
      popupSemitone: audioEngine.getState().semitone ?? 0,
      popupMasterTempo: false,
    });
    return;
  }

  if (!pipeline) pipeline = createPipeline();

  console.log(
    '[Content] Received command from popup:',
    JSON.stringify({ command, ...params }),
    '| strategyLevel:',
    currentStrategyLevel,
  );

  if (params.speed !== undefined) {
    pipeline.setSpeed(params.speed);
    const media = activeMediaElement || document.querySelector('audio, video');
    if (media) {
      try {
        media.playbackRate = Math.max(0.25, Math.min(16, params.speed));
      } catch {
        // ignore
      }
    }
  }
  if (params.semitone !== undefined) {
    console.log('[Content] Applying semitone:', params.semitone);
    pipeline.setSemitone(params.semitone);
  }
  if (params.pitch !== undefined) pipeline.setPitch(params.pitch);
  if (params.formant !== undefined) pipeline.setFormant(params.formant);
  if (params.loopMode !== undefined) pipeline.setLoopMode(params.loopMode);
  if (params.varispeed !== undefined) pipeline.setVarispeed(params.varispeed);
  if (params.eqEnabled !== undefined) pipeline.setEqEnabled(params.eqEnabled);
  if (params.masterTempo !== undefined) pipeline.setMasterTempo(params.masterTempo);
  if (params.eqBand !== undefined) {
    const { index, gain } = params.eqBand as { index: number; gain: number };
    pipeline.setEqBand(index, gain);
  }
  if (command === 'transport') {
    document.querySelectorAll('video, audio').forEach((el) => {
      if (params.action === 'play') (el as HTMLMediaElement).play().catch(() => {});
      else if (params.action === 'pause') (el as HTMLMediaElement).pause();
    });
  }

  if (
    params.speed !== undefined ||
    params.semitone !== undefined ||
    params.masterTempo !== undefined
  ) {
    chrome?.storage?.local?.set({
      popupSpeed: pipeline?.getState().speed ?? 1,
      popupSemitone: pipeline?.getState().semitone ?? 0,
      popupMasterTempo: pipeline?.getState().masterTempo ?? false,
    });
  }
}) as EventListener);

if (!(window as any)[INIT_FLAG]) {
  (window as any)[INIT_FLAG] = true;

  if (!isBlockedUrl(window.location.href)) {
    if (useLegacyEngine) {
      console.log('[Content] Beatport detected — using legacy AudioEngine');
      audioEngine = createAudioEngine();
      (window as any).___tp_audioEngine = audioEngine;
    } else {
      console.log('[Content] Universal pipeline mode — detecting media elements');
      console.log('[DEBUG] Page URL:', window.location.href);
      pipeline = createPipeline();
      const detector = createMediaDetector();
      detector.onElement((el) => {
        console.log(
          '[DEBUG] detector.onElement fired:',
          'tag=' + el.tagName,
          'src=' + ((el.src || el.currentSrc || '').substring(0, 120) || '(empty)'),
          'readyState=' + el.readyState,
          'paused=' + el.paused,
          'duration=' + el.duration,
        );
        const strategies = getStrategiesForElement(el);
        tryCascadeStrategies(el, strategies);
      });
      detector.start();
    }

    try {
      chrome.runtime
        .sendMessage({
          type: 'enable-tab-connect',
          url: window.location.href,
          title: document.title,
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }
}
