import { isBlockedUrl } from '../shared/helpers';
import { INIT_FLAG, isBeatport } from './media-detection';
import { createAudioEngine, type AudioEngineAPI } from './audio-engine';
import { createMediaDetector } from './interception/detector';
import { createDirectStrategy } from './interception/strategy-direct';
import { createPreClaimStrategy } from './interception/strategy-preclaim';
import { createAudioContextHookStrategy } from './interception/strategy-hook';
import { createFallbackStrategy } from './interception/strategy-fallback';
import { createPipeline, type ProcessingPipeline } from './processing/pipeline';
import type { InterceptionStrategy } from './interception/types';

const useLegacyEngine =
  isBeatport ||
  window.location.href.includes('soundcloud.com') ||
  window.location.hostname.includes('music.yandex') ||
  window.location.hostname.includes('bandcamp.com') ||
  window.location.hostname.includes('bleep.com') ||
  window.location.hostname.includes('hardwax.com') ||
  window.location.hostname.includes('redeyerecords.co.uk') ||
  window.location.hostname.includes('boomkat.com') ||
  window.location.hostname.includes('clone.nl') ||
  window.location.hostname.includes('decks.de') ||
  window.location.hostname.includes('juno.co.uk') ||
  window.location.hostname.includes('phonicarecords.com');

let pipeline: ProcessingPipeline | null = null;
let audioEngine: AudioEngineAPI | null = null;
let pipelineActive = false;
let currentStrategyLevel = 0;
let activeMediaElement: HTMLMediaElement | null = null;

function getStrategies(): InterceptionStrategy[] {
  return [
    createDirectStrategy(),
    createPreClaimStrategy(),
    createAudioContextHookStrategy(),
    createFallbackStrategy(),
  ];
}

async function tryCascadeStrategies(
  el: HTMLMediaElement,
  strategies: InterceptionStrategy[],
): Promise<void> {
  if (pipelineActive) return;
  for (const strategy of strategies) {
    if (pipelineActive) return;
    try {
      const result = await strategy.detect(el);
      if (result.success) {
        pipeline?.connect(result.sourceNode ?? null, el);
        pipelineActive = true;
        currentStrategyLevel = strategy.level;
        activeMediaElement = el;
        return;
      }
      if (result.nextLevel !== undefined) continue;
    } catch {
      continue;
    }
  }
  if (!pipelineActive && pipeline) {
    activeMediaElement = el;
    try {
      el.preservesPitch = false;
    } catch {
      /* ignore */
    }
    pipeline.connect(null, el);
    pipelineActive = true;
    currentStrategyLevel = 5;
  }
}

document.addEventListener('transpose-dispatch-controls-to-content', ((event: CustomEvent) => {
  const msg = event.detail;
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
    return;
  }

  if (!pipeline) pipeline = createPipeline();
  if (params.speed !== undefined) {
    pipeline.setSpeed(params.speed);
    if (currentStrategyLevel === 5 && activeMediaElement) {
      try {
        activeMediaElement.playbackRate = Math.max(0.25, Math.min(16, params.speed));
      } catch {
        /* ignore */
      }
    }
  }
  if (params.semitone !== undefined) pipeline.setSemitone(params.semitone);
  if (params.pitch !== undefined) pipeline.setPitch(params.pitch);
  if (params.formant !== undefined) pipeline.setFormant(params.formant);
  if (params.loopMode !== undefined) pipeline.setLoopMode(params.loopMode);
  if (params.varispeed !== undefined) pipeline.setVarispeed(params.varispeed);
  if (params.eqEnabled !== undefined) pipeline.setEqEnabled(params.eqEnabled);
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
}) as EventListener);

if (!(window as any)[INIT_FLAG]) {
  (window as any)[INIT_FLAG] = true;
  if (!isBlockedUrl(window.location.href)) {
    if (useLegacyEngine) {
      audioEngine = createAudioEngine();
      (window as any).___tp_audioEngine = audioEngine;
    } else {
      pipeline = createPipeline();
      const detector = createMediaDetector();
      const strategies = getStrategies();
      detector.onElement((el) => tryCascadeStrategies(el, strategies));
      detector.start();
    }
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            type: 'enable-tab-connect',
            url: window.location.href,
            title: document.title,
          })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}
