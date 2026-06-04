import { createWorkletLoader, type WorkletLoader } from './worklet-loader';
import { DEFAULT_EQ_BANDS, type EqBand } from '../../shared/types';
import type { AudioEngineState } from '../interception/types';

export interface ProcessingPipeline {
  connect(sourceNode: AudioNode | null, mediaEl?: HTMLMediaElement | null): void;
  setSpeed(v: number): void;
  setSemitone(v: number): void;
  setPitch(v: number): void;
  setFormant(v: number): void;
  setLoopMode(m: 'off' | 'loop' | 'loop-one'): void;
  setVarispeed(v: boolean): void;
  setEqEnabled(v: boolean): void;
  setEqBand(index: number, gain: number): void;
  getState(): AudioEngineState;
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
};

export function createPipeline(): ProcessingPipeline {
  const state: AudioEngineState = { ...DEFAULT_STATE };
  const eqBands: EqBand[] = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
  const eqFilters: BiquadFilterNode[] = [];

  let audioContext: AudioContext | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let gainNode: GainNode | null = null;
  let currentSource: AudioNode | null = null;
  let mediaElement: HTMLMediaElement | null = null;
  let isDestroyed = false;
  let workletConnected = false;

  const workletLoader: WorkletLoader = createWorkletLoader();

  function sendStateUpdate(): void {
    try {
      chrome.runtime?.sendMessage({
        sender: 'content',
        command: 'set-from-content',
        speed: state.speed,
        semitone: state.semitone,
        pitch: state.pitch,
        formant: state.formant,
        loopMode: state.loopMode,
        varispeed: state.varispeed,
        eqEnabled: state.eqEnabled,
        eqBands,
      });
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
    if (isDestroyed || workletConnected) return;
    if (!currentSource) return;

    const ctx = (audioContext || currentSource.context) as AudioContext;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!gainNode) {
      gainNode = ctx.createGain();
      gainNode.gain.value = 1;
    }

    const node = await workletLoader.load(ctx);
    if (!node) {
      if (currentSource && gainNode) {
        try {
          currentSource.disconnect();
        } catch {
          // ignore
        }
        currentSource.connect(gainNode);
        gainNode.connect(ctx.destination);
      }
      return;
    }

    workletNode = node;

    try {
      if (currentSource) {
        currentSource.disconnect();
      }
    } catch {
      // ignore
    }
    currentSource.connect(workletNode);

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

    if (eqFilters.length > 0) {
      workletNode.connect(eqFilters[0]);
      const lastFilter = eqFilters[eqFilters.length - 1];
      lastFilter.disconnect();
      lastFilter.connect(gainNode);
    } else {
      workletNode.connect(gainNode);
    }

    gainNode.connect(ctx.destination);
    workletConnected = true;

    applyPitchState();
    applyEqState();
  }

  function applyPitchState(): void {
    if (!workletNode) return;

    const semitone = state.semitone || 0;
    const speed = state.speed || 1;

    const stNode = workletNode as any;
    if (stNode.pitchSemitones) {
      stNode.pitchSemitones.value = semitone;
    }
    if (stNode.playbackRate) {
      stNode.playbackRate.value = speed;
    }

    const pitchParam = workletNode.parameters.get('pitchSemitones');
    if (pitchParam) pitchParam.value = semitone;

    const rateParam = workletNode.parameters.get('playbackRate');
    if (rateParam) rateParam.value = speed;
  }

  function applyPlaybackRate(speed: number): void {
    if (mediaElement) {
      const clampedSpeed = Math.max(0.25, Math.min(16, speed));
      try {
        mediaElement.playbackRate = clampedSpeed;
      } catch {
        // ignore
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
      if (isDestroyed) return;

      currentSource = sourceNode;
      if (mediaEl) {
        mediaElement = mediaEl;
      }

      if (sourceNode && sourceNode.context) {
        audioContext = sourceNode.context as AudioContext;
      }

      console.log('[Pipeline] connect', {
        hasSource: !!sourceNode,
        hasMediaEl: !!mediaEl,
        ctxState: audioContext?.state,
        ctxSampleRate: audioContext?.sampleRate,
      });

      if (sourceNode) {
        initWorkletAndConnect().catch((err) => {
          console.warn('[Pipeline] initWorkletAndConnect failed:', err);
        });
      }

      sendStateUpdate();
    },

    setSpeed(v: number) {
      state.speed = v;
      applyPlaybackRate(v);
      if (workletConnected) {
        applyPitchState();
      }
      sendStateUpdate();
    },

    setSemitone(v: number) {
      state.semitone = v;
      if (!workletConnected && currentSource) {
        initWorkletAndConnect();
      }
      applyPitchState();
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

    destroy() {
      isDestroyed = true;
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
    },
  };

  return pipeline;
}
