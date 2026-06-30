import { createWorkletLoader, type WorkletLoader } from './worklet-loader';
import { DEFAULT_EQ_BANDS, type EqBand } from '../../shared/types';
import type { AudioEngineState } from '../interception/types';
import { BpmAnalyzer } from './bpm-analyzer';
import { KeyAnalyzer } from './key-analyzer';
import type { BpmResult } from './bpm-analyzer';
import type { KeyResult } from './key-analyzer';

export interface ProcessingPipeline {
  connect(sourceNode: AudioNode | null, mediaEl?: HTMLMediaElement | null): void;
  connectSourceNode(sourceNode: AudioNode): void;
  setSpeed(v: number): void;
  setSemitone(v: number): void;
  setPitch(v: number): void;
  setFormant(v: number): void;
  setLoopMode(m: 'off' | 'loop' | 'loop-one'): void;
  setVarispeed(v: boolean): void;
  setEqEnabled(v: boolean): void;
  setEqBand(index: number, gain: number): void;
  setMasterTempo(v: boolean): void;
  getState(): AudioEngineState;
  setStrategyLevel(level: number): void;
  stopCurrentAudio(): void;
  destroy(): void;
}

const DEFAULT_STATE: AudioEngineState = {
  speed: 1,
  semitone: 0,
  pitch: 0,
  formant: 0,
  loopMode: 'off',
  varispeed: false,
  eqEnabled: false,
  masterTempo: false,
};

export function createPipeline(): ProcessingPipeline {
  const state: AudioEngineState = { ...DEFAULT_STATE };
  const eqBands: EqBand[] = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
  const eqFilters: BiquadFilterNode[] = [];
  async function loadSavedEqBands(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(['eqSettings']);
      const saved = data['eqSettings'];
      if (saved && typeof saved === 'object') {
        if (saved.bands && Array.isArray(saved.bands) && saved.bands.length === 6) {
          saved.bands.forEach((band: any, i: number) => {
            if (i < eqBands.length && band.gain !== undefined) {
              eqBands[i] = { ...eqBands[i], gain: band.gain };
            }
          });
        }
        if (typeof saved.enabled === 'boolean') {
          state.eqEnabled = saved.enabled;
        }
      }
    } catch {
      // ignore
    }
  }

  loadSavedEqBands();

  let audioContext: AudioContext | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let captureNode: AudioWorkletNode | null = null;
  let gainNode: GainNode | null = null;
  let currentSource: AudioNode | null = null;
  let mediaElement: HTMLMediaElement | null = null;
  let isDestroyed = false;
  let workletConnected = false;
  let strategyLevel = 0;

  let isBufferSource = false;
  let bufferStartOffset = 0;
  let bufferStartTime = 0;
  let isBufferPlaying = false;
  let isBufferSeeking = false;
  let bufferPlayHandler: (() => void) | null = null;
  let bufferPauseHandler: (() => void) | null = null;
  let bufferSeekedHandler: (() => void) | null = null;

  const workletLoader: WorkletLoader = createWorkletLoader();

  let bpmAnalyzer: BpmAnalyzer | null = null;
  let keyAnalyzer: KeyAnalyzer | null = null;
  let captureReady = false;

  let lastBpm: number | null = null;
  let lastKey: string | null = null;

  function sendMetricsUpdate(): void {
    const msg = {
      type: 'METRICS_UPDATE',
      payload: { bpm: lastBpm, key: lastKey, isCapturing: true },
    };
    console.log('[Pipeline] sendMetricsUpdate:', { bpm: lastBpm, key: lastKey });
    try {
      window.postMessage({ __tp_metrics: true, detail: msg }, '*');
    } catch (err) {
      console.warn('[Pipeline] sendMetricsUpdate postMessage failed:', err);
    }
  }

  function sendBpmResult(result: BpmResult): void {
    lastBpm = result.bpm;
    sendMetricsUpdate();
  }

  function sendKeyResult(result: KeyResult): void {
    lastKey = result.key;
    sendMetricsUpdate();
  }

  function sendStateUpdate(): void {
    try {
      window.dispatchEvent(
        new CustomEvent('tp-command', {
          detail: {
            sender: 'content',
            command: 'set-from-content',
            speed: state.speed,
            semitone: state.semitone,
            pitch: state.pitch,
            formant: state.formant,
            loopMode: state.loopMode,
            varispeed: state.varispeed,
            eqEnabled: state.eqEnabled,
            masterTempo: state.masterTempo,
            eqBands,
            strategyLevel,
          },
        }),
      );
    } catch {
      // ignore
    }
  }

  function applyEqState(): void {
    for (let i = 0; i < eqFilters.length && i < eqBands.length; i++) {
      eqFilters[i].gain.value = state.eqEnabled ? eqBands[i].gain : 0;
    }
  }

  async function initWorkletAndConnect(): Promise<void> {
    console.log('[DEBUG] initWorkletAndConnect called', {
      isDestroyed,
      workletConnected,
      hasSource: !!currentSource,
      sourceType: currentSource?.constructor?.name,
      isBufferSource,
    });
    if (isDestroyed || workletConnected) return;
    await loadSavedEqBands();
    if (!currentSource) {
      console.log('[Pipeline] No source (fallback mode) — BPM/Key not available');
      sendMetricsUpdate();
      return;
    }

    const ctx = (audioContext || currentSource.context) as AudioContext;
    if (!ctx) {
      console.warn('[Pipeline] no AudioContext');
      return;
    }

    if (ctx.state === 'suspended') {
      const res = await ctx.resume();
      console.log('[Pipeline] AudioContext resume result:', ctx.state);
    }

    if (!gainNode) {
      gainNode = ctx.createGain();
      gainNode.gain.value = 1;
    }

    console.log('[Pipeline] Loading worklet...');
    const node = await workletLoader.load(ctx);

    if (!node) {
      console.log('[Pipeline] Worklet NULL — fallback to direct gain + EQ');
      if (eqFilters.length === 0) {
        for (const band of eqBands) {
          const filter = ctx.createBiquadFilter();
          filter.type = band.type;
          filter.frequency.value = band.frequency;
          filter.gain.value = band.gain;
          filter.Q.value = band.Q;
          eqFilters.push(filter);
        }
        if (eqFilters.length > 1) {
          for (let j = 0; j < eqFilters.length - 1; j++) {
            eqFilters[j].connect(eqFilters[j + 1]);
          }
        }
      }
      if (currentSource && gainNode) {
        try {
          currentSource.disconnect();
        } catch {}
        if (eqFilters.length > 0) {
          currentSource.connect(eqFilters[0]);
          eqFilters[eqFilters.length - 1].connect(gainNode);
        } else {
          currentSource.connect(gainNode);
        }
        gainNode.connect(ctx.destination);
      }
      workletConnected = true;
      applyEqState();
      return;
    }

    workletNode = node;
    try {
      workletNode.disconnect();
    } catch {}
    try {
      if (currentSource) currentSource.disconnect();
    } catch {}

    currentSource!.connect(workletNode);

    if (eqFilters.length === 0) {
      for (const band of eqBands) {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.frequency;
        filter.gain.value = band.gain;
        filter.Q.value = band.Q;
        eqFilters.push(filter);
      }
      if (eqFilters.length > 1) {
        for (let i = 0; i < eqFilters.length - 1; i++) {
          eqFilters[i].connect(eqFilters[i + 1]);
        }
      }
    }

    try {
      gainNode.disconnect();
    } catch {}

    if (eqFilters.length > 0) {
      workletNode.connect(eqFilters[0]);
      const lastFilter = eqFilters[eqFilters.length - 1];
      lastFilter.connect(gainNode);
    } else {
      workletNode.connect(gainNode);
    }

    gainNode.connect(ctx.destination);
    workletConnected = true;

    applyEqState();

    if (currentSource && currentSource.context) {
      initCaptureAndAnalyzers(currentSource.context as AudioContext).catch(() => {});
    }

    applyPitchState();
    applyEqState();
    applyBufferPlaybackRate();
  }

  async function initCaptureAndAnalyzers(ctx: AudioContext): Promise<void> {
    console.log(
      '[Pipeline] initCaptureAndAnalyzers: called, captureReady=',
      captureReady,
      'ctx.state=',
      ctx.state,
    );

    if (captureReady) {
      console.log('[Pipeline] initCaptureAndAnalyzers: resetting analyzers for new track');
      lastBpm = null;
      lastKey = null;
      bpmAnalyzer?.reset();
      keyAnalyzer?.reset();
      sendMetricsUpdate();
      return;
    }

    const extOrigin =
      (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('') : '') ||
      document.documentElement.dataset.tpExtensionOrigin ||
      '';
    console.log('[Pipeline] initCaptureAndAnalyzers: extOrigin=', extOrigin || 'EMPTY');
    if (!extOrigin) {
      console.warn('[Pipeline] initCaptureAndAnalyzers: no extOrigin, aborting');
      return;
    }

    try {
      console.log(
        '[Pipeline] initCaptureAndAnalyzers: loading capture-processor.js from',
        extOrigin + 'capture-processor.js',
      );
      await ctx.audioWorklet.addModule(extOrigin + 'capture-processor.js');
      console.log('[Pipeline] initCaptureAndAnalyzers: capture-processor.js loaded OK');
    } catch (err) {
      console.warn('[Pipeline] capture-processor.js load FAILED:', err);
      return;
    }

    captureNode = new AudioWorkletNode(ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    console.log('[Pipeline] initCaptureAndAnalyzers: captureNode created');

    if (currentSource) {
      try {
        currentSource.connect(captureNode);
        console.log('[Pipeline] initCaptureAndAnalyzers: currentSource → captureNode');
      } catch (err) {
        console.warn('[Pipeline] initCaptureAndAnalyzers: source→capture connect failed:', err);
      }
    } else {
      console.warn('[Pipeline] initCaptureAndAnalyzers: no source to connect');
    }

    if (!bpmAnalyzer) {
      bpmAnalyzer = new BpmAnalyzer(ctx.sampleRate);
      bpmAnalyzer.setCallback((result) => {
        console.log('[Pipeline] BPM callback:', result);
        sendBpmResult(result);
      });
      console.log(
        '[Pipeline] initCaptureAndAnalyzers: BpmAnalyzer created, sampleRate=',
        ctx.sampleRate,
      );
    }
    if (!keyAnalyzer) {
      keyAnalyzer = new KeyAnalyzer(ctx.sampleRate);
      keyAnalyzer.setCallback((result) => {
        console.log('[Pipeline] KEY callback:', result);
        sendKeyResult(result);
      });
      keyAnalyzer.start();
      console.log('[Pipeline] initCaptureAndAnalyzers: KeyAnalyzer created and started');
    }

    let chunkCount = 0;
    captureNode.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'audio' && event.data.samples instanceof Float32Array) {
        chunkCount++;

        if (chunkCount <= 5 || chunkCount % 100 === 0) {
          const samples = event.data.samples;
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
          const rms = Math.sqrt(sum / samples.length);
          console.log(
            '[Pipeline] CAPTURE chunk #' + chunkCount,
            'len=' + samples.length,
            'rms=' + rms.toFixed(6),
          );
        }

        bpmAnalyzer?.addChunk(event.data.samples);
        keyAnalyzer?.addChunk(event.data.samples);
      }
    };

    captureReady = true;
    console.log('[Pipeline] initCaptureAndAnalyzers: ✅ DONE, captureReady=true');
  }

  function getBufferPlaybackRate(): number {
    if (workletConnected) {
      return Math.max(0.25, Math.min(16, state.speed || 1));
    }
    const pitchRatio = Math.pow(2, (state.semitone || 0) / 12);
    return Math.max(0.25, Math.min(16, (state.speed || 1) * pitchRatio));
  }

  function applyBufferPlaybackRate(): void {
    if (!isBufferSource || !currentSource) return;
    const rate = getBufferPlaybackRate();
    const src = currentSource as any;
    if (src.playbackRate && typeof src.playbackRate.value === 'number') {
      src.playbackRate.value = rate;
    }
  }

  function stopBufferPlayback(): void {
    if (!isBufferSource || !currentSource) return;
    const src = currentSource as any;
    if (src.stop && typeof src.stop === 'function') {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // ignore
      }
      try {
        src.disconnect();
      } catch {
        // ignore
      }
    }
    isBufferPlaying = false;
  }

  function startBufferPlayback(): void {
    console.log('[Pipeline] startBufferPlayback called', {
      isBufferSource,
      hasSource: !!currentSource,
      hasAudioCtx: !!audioContext,
      workletConnected,
    });
    if (!isBufferSource || !audioContext) return;
    const ctx = audioContext;

    stopBufferPlayback();

    const newSrc = ctx.createBufferSource();
    const oldSrc = currentSource as any;
    newSrc.buffer = oldSrc.buffer;
    newSrc.playbackRate.value = getBufferPlaybackRate();

    const worklet = workletNode;
    if (worklet) {
      newSrc.connect(worklet);
    } else {
      newSrc.connect(gainNode || ctx.destination);
    }

    if (captureNode) {
      try {
        newSrc.connect(captureNode);
      } catch {
        // ignore
      }
    }

    bufferStartTime = ctx.currentTime;
    const off = Math.max(0, bufferStartOffset);
    const duration = newSrc.buffer?.duration ?? 0;
    newSrc.start(0, off >= duration ? 0 : off);
    currentSource = newSrc;
    isBufferPlaying = true;

    newSrc.onended = () => {
      if (!isBufferSeeking) {
        isBufferPlaying = false;
      }
    };

    applyPitchState();
    applyBufferPlaybackRate();
  }

  function setupBufferElementHooks(el: HTMLMediaElement): void {
    bufferPlayHandler = () => {
      if (isBufferSource && !isBufferPlaying) {
        bufferStartOffset = el.currentTime;
        startBufferPlayback();
      }
    };

    bufferPauseHandler = () => {
      if (isBufferSource && isBufferPlaying && audioContext) {
        bufferStartOffset += audioContext.currentTime - bufferStartTime;
        stopBufferPlayback();
      }
    };

    bufferSeekedHandler = () => {
      if (isBufferSource) {
        bufferStartOffset = Math.max(0, el.currentTime);
        if (isBufferPlaying) {
          isBufferSeeking = true;
          startBufferPlayback();
          isBufferSeeking = false;
        }
      }
    };

    el.addEventListener('play', bufferPlayHandler);
    el.addEventListener('playing', bufferPlayHandler);
    el.addEventListener('pause', bufferPauseHandler);
    el.addEventListener('seeked', bufferSeekedHandler);
  }

  function cleanupBufferElementHooks(): void {
    if (!mediaElement) return;
    if (bufferPlayHandler) {
      mediaElement.removeEventListener('play', bufferPlayHandler);
      mediaElement.removeEventListener('playing', bufferPlayHandler);
      bufferPlayHandler = null;
    }
    if (bufferPauseHandler) {
      mediaElement.removeEventListener('pause', bufferPauseHandler);
      bufferPauseHandler = null;
    }
    if (bufferSeekedHandler) {
      mediaElement.removeEventListener('seeked', bufferSeekedHandler);
      bufferSeekedHandler = null;
    }
  }

  function getEffectiveSemitone(): number {
    if (!state.masterTempo) return state.semitone || 0;
    const speed = state.speed || 1;
    const compensation = -12 * Math.log2(Math.max(0.25, Math.min(16, speed)));
    return (state.semitone || 0) + compensation;
  }

  function applyPitchState(): void {
    if (!workletNode) return;

    const semitone = getEffectiveSemitone();

    const stNode = workletNode as any;
    if (stNode.pitchSemitones) {
      stNode.pitchSemitones.value = semitone;
    }

    const pitchParam = workletNode.parameters.get('pitchSemitones');
    if (pitchParam) pitchParam.value = semitone;
  }

  function applyPlaybackRate(speed: number): void {
    if (isBufferSource) {
      applyBufferPlaybackRate();
      return;
    }
    if (mediaElement) {
      const clampedSpeed = Math.max(0.25, Math.min(16, speed));
      try {
        mediaElement.playbackRate = clampedSpeed;
      } catch (err) {
        console.warn('[Pipeline] applyPlaybackRate FAILED:', err);
      }
    }
  }

  function applyLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    if (mediaElement) {
      mediaElement.loop = mode === 'loop' || mode === 'loop-one';
    }
  }

  const pipeline: ProcessingPipeline = {
    connect(sourceNode: AudioNode | null, mediaEl?: HTMLMediaElement | null) {
      console.log(
        '[DEBUG] pipeline.connect: source=',
        sourceNode ? sourceNode.constructor.name : 'NULL',
        'isBuffer=',
        !!(sourceNode && 'start' in sourceNode && 'buffer' in sourceNode),
        'mediaEl=',
        mediaEl ? mediaEl.tagName : 'NULL',
      );
      if (isDestroyed) {
        console.log('[DEBUG] pipeline.connect: destroyed, skipping');
        return;
      }

      cleanupBufferElementHooks();
      stopBufferPlayback();

      const prevWorkletSource = currentSource;
      currentSource = sourceNode;
      isBufferSource = !!(sourceNode && 'start' in sourceNode && 'buffer' in sourceNode);
      isBufferPlaying = false;
      bufferStartOffset = 0;
      bufferStartTime = 0;
      const wasWorkletConnected = workletConnected;
      workletConnected = false;

      if (prevWorkletSource && sourceNode && prevWorkletSource !== sourceNode) {
        try {
          (prevWorkletSource as any).stop?.();
        } catch {}
        try {
          prevWorkletSource.disconnect();
        } catch {}
      } else if (sourceNode === prevWorkletSource && wasWorkletConnected) {
        workletConnected = true;
        return;
      }

      if (mediaEl) {
        mediaElement = mediaEl;
      }

      if (sourceNode && sourceNode.context) {
        audioContext = sourceNode.context as AudioContext;
      }

      if (sourceNode && !isBufferSource) {
        initWorkletAndConnect().catch((err) => {
          console.warn('[Pipeline] initWorkletAndConnect failed:', err);
        });
      }

      if (!sourceNode) {
        console.log('[Pipeline] Fallback mode — no source, clearing BPM/Key');
        sendMetricsUpdate();
      }

      if (isBufferSource && mediaEl) {
        setupBufferElementHooks(mediaEl);
        initWorkletAndConnect()
          .then(() => {
            if (mediaEl && !mediaEl.paused) {
              console.log('[Pipeline] Element already playing — starting buffer playback');
              bufferStartOffset = mediaEl.currentTime;
              startBufferPlayback();
            }
          })
          .catch((err) => {
            console.warn('[Pipeline] Buffer init failed:', err);
          });
      }

      sendStateUpdate();
    },

    setSpeed(v: number) {
      state.speed = v;
      console.log(
        '[Pipeline] setSpeed:',
        v,
        '| workletConnected:',
        workletConnected,
        '| isBuffer:',
        isBufferSource,
      );
      applyPlaybackRate(v);
      if (workletConnected) {
        applyPitchState();
      }
      sendStateUpdate();
    },

    setSemitone(v: number) {
      state.semitone = v;
      console.log(
        '[Pipeline] setSemitone:',
        v,
        '| workletConnected:',
        workletConnected,
        '| isBuffer:',
        isBufferSource,
      );
      if (!workletConnected && currentSource && !isBufferSource) {
        console.log('[Pipeline] Worklet not connected — trying to init');
        initWorkletAndConnect();
      }
      applyPitchState();
      applyBufferPlaybackRate();
      sendStateUpdate();
    },

    setPitch(v: number) {
      state.pitch = v;
      if (!workletConnected && currentSource) {
        initWorkletAndConnect();
      }
      applyPitchState();
      sendStateUpdate();
    },

    setFormant(v: number) {
      state.formant = v;
      if (!workletConnected && currentSource) {
        initWorkletAndConnect();
      }
      applyPitchState();
      sendStateUpdate();
    },

    setLoopMode(m: 'off' | 'loop' | 'loop-one') {
      state.loopMode = m;
      applyLoopMode(m);
      sendStateUpdate();
    },

    setVarispeed(v: boolean) {
      state.varispeed = v;
      applyPlaybackRate(state.speed);
      sendStateUpdate();
    },

    setMasterTempo(v: boolean) {
      state.masterTempo = v;
      if (v && !workletConnected && currentSource) {
        initWorkletAndConnect();
      }
      if (workletConnected) {
        applyPitchState();
      }
      sendStateUpdate();
    },

    setEqEnabled(v: boolean) {
      state.eqEnabled = v;
      if (v && !workletConnected && currentSource) {
        initWorkletAndConnect().then(() => applyEqState());
      } else {
        applyEqState();
      }
      sendStateUpdate();
    },

    setEqBand(index: number, gain: number) {
      if (index >= 0 && index < eqBands.length) {
        eqBands[index].gain = gain;
        applyEqState();
        sendStateUpdate();
      }
    },

    getState() {
      return { ...state };
    },

    connectSourceNode(sourceNode: AudioNode) {
      if (isDestroyed) return;
      currentSource = sourceNode;
      if (sourceNode.context) {
        audioContext = sourceNode.context as AudioContext;
      }
      workletConnected = false;
      initWorkletAndConnect().catch((err) => {
        console.warn('[Pipeline] connectSourceNode initWorkletAndConnect failed:', err);
      });
      sendStateUpdate();
    },

    setStrategyLevel(level: number) {
      strategyLevel = level;
      sendStateUpdate();
    },

    stopCurrentAudio() {
      if (currentSource) {
        try {
          (currentSource as any).stop?.();
        } catch {}
        try {
          currentSource.disconnect();
        } catch {}
      }
    },

    destroy() {
      isDestroyed = true;
      cleanupBufferElementHooks();
      stopBufferPlayback();
      try {
        workletNode?.disconnect();
      } catch {
        // ignore
      }
      try {
        gainNode?.disconnect();
      } catch {
        // ignore
      }
      try {
        audioContext?.close();
      } catch {
        // ignore
      }
      workletNode = null;
      gainNode = null;
      audioContext = null;
      currentSource = null;
      mediaElement = null;
      workletConnected = false;
      isBufferSource = false;
      bpmAnalyzer?.destroy();
      bpmAnalyzer = null;
      keyAnalyzer?.destroy();
      keyAnalyzer = null;
      captureNode?.disconnect();
      captureNode = null;
      captureReady = false;
    },
  };

  return pipeline;
}
