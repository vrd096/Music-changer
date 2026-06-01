import { getAdapter, type PlatformAdapter } from './platform-adapters';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { DEFAULT_EQ_BANDS, type EqBand } from '../shared/types';
import {
  isBeatport,
  logError,
  hasValidSource,
  waitForSource,
  pendingMediaElements,
  setMediaElementHandler,
} from './media-detection';

function isPageUrlAsSrc(el: HTMLMediaElement): boolean {
  if (!el.src) return false;
  try {
    const srcUrl = new URL(el.src);
    const pageUrl = new URL(window.location.href);
    return (
      srcUrl.href === pageUrl.href ||
      (srcUrl.origin === pageUrl.origin && srcUrl.pathname === pageUrl.pathname)
    );
  } catch {
    return false;
  }
}

function isVibesFastActive(): boolean {
  for (const audio of document.querySelectorAll<HTMLAudioElement>('audio')) {
    if (isPageUrlAsSrc(audio)) return true;
  }
  return false;
}

function getAudioEngine(): AudioEngineAPI | null {
  return (window as any).___tp_audioEngine || null;
}

function watchBeatportElement(el: HTMLMediaElement): void {
  let urlDetected = false,
    _preparingBeatport = false,
    _pendingPlay = false,
    _pollForUrl: (() => void) | null = null;
  const engine = getAudioEngine();
  try {
    el.crossOrigin = 'anonymous';
  } catch {}
  const originalPlay = el.play.bind(el);
  let _playRequested = false;
  el.play = function (): Promise<void> {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com')) return originalPlay();
    _playRequested = true;
    _pendingPlay = true;
    console.log('[Content] Beatport: play() intercepted, src not ready yet, deferring play');
    return Promise.resolve();
  };
  const onTrackChange = () => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com')) {
      console.log('[Content] Beatport: track change detected, src:', src);
      _preparingBeatport = false;
      try {
        el.volume = 0;
        el.muted = true;
      } catch {}
      if (engine) engine.resetBeatportState();
      if (_pendingPlay && engine) {
        _pendingPlay = false;
        _preparingBeatport = true;
        console.log('[Content] Beatport: pending play detected in trackChange');
        engine.prepareBeatportAudio(src);
      }
    }
  };
  const startUrlPolling = () => {
    if (_pollForUrl) return;
    let attempts = 0;
    const maxAttempts = 50;
    const check = () => {
      attempts++;
      const src = el.src || el.currentSrc || el.getAttribute('src') || '';
      if (src.includes('geo-samples.beatport.com')) {
        _pollForUrl = null;
        _pendingPlay = false;
        _preparingBeatport = true;
        if (engine) engine.prepareBeatportAudio(src);
        return;
      }
      if (attempts >= maxAttempts) {
        _pollForUrl = null;
        console.log('[Content] Beatport: URL polling timeout');
        return;
      }
      _pollForUrl = setTimeout(check, 200) as unknown as () => void;
    };
    _pollForUrl = setTimeout(check, 200) as unknown as () => void;
  };
  const stopUrlPolling = () => {
    if (_pollForUrl) {
      clearTimeout(_pollForUrl as unknown as number);
      _pollForUrl = null;
    }
  };
  const onPlay = () => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (engine && !_preparingBeatport) {
      if (src.includes('geo-samples.beatport.com')) {
        _preparingBeatport = true;
        _pendingPlay = false;
        stopUrlPolling();
        engine.prepareBeatportAudio(src);
      } else {
        _pendingPlay = true;
        console.log('[Content] Beatport: play but no real URL yet');
        startUrlPolling();
      }
    }
  };
  const onPause = () => {
    if (engine) {
      engine.pauseBeatportPlayback();
      _preparingBeatport = false;
      stopUrlPolling();
    }
  };
  const onSeeked = () => {
    if (engine && engine.isBeatportBufferPlaying()) {
      engine.seekBeatportPlayback(el.currentTime);
    }
  };
  el.addEventListener('play', onPlay);
  el.addEventListener('playing', onPlay);
  el.addEventListener('pause', onPause);
  el.addEventListener('seeked', onSeeked);
  el.addEventListener('loadstart', onTrackChange);
  const interval = setInterval(() => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com') && !urlDetected) {
      urlDetected = true;
      clearInterval(interval);
      if (engine) engine.attachToMedia(el, true);
      if (_pendingPlay && !_preparingBeatport && engine) {
        _pendingPlay = false;
        _preparingBeatport = true;
        engine.prepareBeatportAudio(src);
      }
      if (_playRequested) {
        _playRequested = false;
        originalPlay().catch(() => {});
      }
    }
  }, 200);
  setTimeout(() => {
    clearInterval(interval);
    if (!urlDetected) console.log('[Content] Beatport watch: timeout');
  }, 30000);
}

interface AudioEngineState {
  speed: number;
  semitone: number;
  pitch: number;
  formant: number;
  loopMode: 'off' | 'loop' | 'loop-one';
  varispeed: boolean;
  eqEnabled: boolean;
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

export interface AudioEngineAPI {
  setSpeed(speed: number): void;
  setSemitone(semitone: number): void;
  setPitch(pitch: number): void;
  setFormant(formant: number): void;
  setLoopMode(mode: 'off' | 'loop' | 'loop-one'): void;
  setVarispeed(varispeed: boolean): void;
  setEqEnabled(enabled: boolean): void;
  setEqBand(index: number, gain: number): void;
  attachToMedia(element: HTMLMediaElement, skipAudioWorklet?: boolean): void;
  prepareBeatportAudio(url: string): void;
  pauseBeatportPlayback(): void;
  seekBeatportPlayback(newTime: number): void;
  isBeatportBufferPlaying(): boolean;
  resetBeatportState(): void;
  getState(): AudioEngineState;
  destroy(): void;
}

export function createAudioEngine(): AudioEngineAPI {
  const state: AudioEngineState = { ...DEFAULT_STATE };
  let mediaElement: HTMLMediaElement | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;
  let tpWorkletNode: AudioWorkletNode | null = null;
  let stWorkletNode: AudioWorkletNode | null = null;
  let gainNode: GainNode | null = null;
  let isTpReady = false,
    isStReady = false;
  let workletInitPromise: Promise<void> | null = null;
  let isDestroyed = false;
  let findMediaInterval: ReturnType<typeof setInterval> | null = null;
  let mutationObserver: MutationObserver | null = null;
  const currentAdapter: PlatformAdapter = getAdapter();
  let skipAudioWorklet = false;
  const eqFilters: BiquadFilterNode[] = [];
  const eqBands: EqBand[] = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
  let bufferSource: AudioBufferSourceNode | null = null;
  let _beatportAudioBuffer: AudioBuffer | null = null;
  let _beatportStartOffset = 0,
    _beatportStartTime = 0;
  let _lastKnownSrc = '';
  let _isBufferPlaying = false,
    _isBeatportSeeking = false;

  console.log(`[Content] Platform adapter: ${currentAdapter.platform}`);

  const isYouTubeSoundEffect = (mediaElement: HTMLMediaElement): boolean => {
    if (!(mediaElement instanceof HTMLAudioElement)) return false;
    const srcAttr = mediaElement.getAttribute('src') || '',
      srcProp = mediaElement.src || '';
    return srcAttr.includes('/s/search/audio/') || srcProp.includes('/s/search/audio/');
  };

  setMediaElementHandler((el: HTMLMediaElement) => {
    if (isBeatport) {
      try {
        el.volume = 0;
        el.muted = true;
      } catch {}
      hijackPlaybackRate(el, state.speed);
      watchBeatportElement(el);
      return;
    }
    if (mediaElement) return;
    if (isYouTubeSoundEffect(el)) return;
    if (hasValidSource(el)) {
      attachToMedia(el);
      return;
    }
    pendingMediaElements.push(el);
    waitForSource(el, (readyEl: HTMLMediaElement) => {
      const index = pendingMediaElements.indexOf(readyEl);
      if (index !== -1) pendingMediaElements.splice(index, 1);
      if (!mediaElement) {
        if (!isYouTubeSoundEffect(readyEl)) attachToMedia(readyEl);
      }
    });
  });

  if (!isBeatport) {
    initMediaDetection();
    setTimeout(() => {
      if (!mediaElement) findMediaElement();
    }, 500);
  }

  function hijackPlaybackRate(el: HTMLMediaElement, speed: number): void {
    const clampedSpeed = Math.max(0.25, Math.min(16, speed));
    if (!isBeatport) {
      el.playbackRate = clampedSpeed;
      return;
    }
    if ((el as any).__tp_playbackRateHijacked) {
      (el as any).__tp_playbackRateValue = clampedSpeed;
      try {
        el.playbackRate = clampedSpeed;
      } catch {}
      return;
    }
    const nativeDescriptor = (window as any).___tp_nativePlaybackRateDescriptor as
      | PropertyDescriptor
      | undefined;
    (el as any).__tp_playbackRateHijacked = true;
    (el as any).__tp_playbackRateValue = clampedSpeed;
    Object.defineProperty(el, 'playbackRate', {
      get(): number {
        return (this as any).__tp_playbackRateValue ?? 1;
      },
      set(value: number) {
        (this as any).__tp_playbackRateValue = value;
        if (nativeDescriptor?.set) nativeDescriptor.set.call(this, value);
      },
      configurable: true,
      enumerable: true,
    });
    try {
      el.playbackRate = clampedSpeed;
    } catch {}
  }

  function applyPlaybackRate(speed: number): void {
    if (!mediaElement) return;
    const clampedSpeed = Math.max(0.25, Math.min(16, speed));
    mediaElement.playbackRate = clampedSpeed;
    applyPitchState();
    if (mediaElement) hijackPlaybackRate(mediaElement, speed);
  }
  function applyLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    if (mediaElement) mediaElement.loop = mode === 'loop' || mode === 'loop-one';
  }

  function _setAudioParam(node: AudioWorkletNode | null, name: string, value: number): void {
    if (!node) return;
    const param = node.parameters.get(name);
    if (param) param.value = value;
  }

  function applyPitchState(): void {
    const semitone = state.semitone || 0;
    const speed = state.speed || 1;

    if (tpWorkletNode) {
      const stNode = tpWorkletNode as SoundTouchNode;
      stNode.pitchSemitones.value = semitone;
      stNode.playbackRate.value = speed;
      console.log('[AudioEngine] SoundTouchJS pitch:', semitone, 'rate:', speed);
    } else if (semitone !== 0) {
      console.log('[AudioEngine] Varispeed pitch:', semitone);
    }
  }

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
    } catch {}
  }

  function findMediaElement(): void {
    for (let i = pendingMediaElements.length - 1; i >= 0; i--) {
      const pending = pendingMediaElements[i];
      if (hasValidSource(pending)) {
        pendingMediaElements.splice(i, 1);
        attachToMedia(pending);
        return;
      }
    }
    const el = currentAdapter.findMedia();
    if (el && el !== mediaElement) attachToMedia(el);
  }

  function initMediaDetection(): void {
    findMediaElement();
    mutationObserver = new MutationObserver(() => {
      if (!mediaElement) findMediaElement();
    });
    const so = () => {
      if (document.body)
        mutationObserver?.observe(document.body, { childList: true, subtree: true });
      else
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            if (document.body && mutationObserver)
              mutationObserver.observe(document.body, { childList: true, subtree: true });
          },
          { once: true },
        );
    };
    so();
    findMediaInterval = setInterval(() => {
      if (!mediaElement) findMediaElement();
    }, 2000);
  }

  function _ensureEqChain(): void {
    if (eqFilters.length > 0) return;
    if (!audioContext || !gainNode) return;
    for (const band of eqBands) {
      const filter = audioContext.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.Q;
      eqFilters.push(filter);
    }
    const worklet = tpWorkletNode || stWorkletNode;
    if (worklet && eqFilters.length > 0) {
      worklet.disconnect();
      worklet.connect(eqFilters[0]);
      for (let i = 0; i < eqFilters.length - 1; i++) eqFilters[i].connect(eqFilters[i + 1]);
      eqFilters[eqFilters.length - 1].connect(gainNode);
    }
  }

  function _applyEqState(): void {
    for (let i = 0; i < eqFilters.length && i < eqBands.length; i++)
      eqFilters[i].gain.value = state.eqEnabled ? eqBands[i].gain : 0;
  }

  async function initAudioWorklet(): Promise<void> {
    if (workletInitPromise) return workletInitPromise;
    workletInitPromise = _initAudioWorklet();
    return workletInitPromise;
  }

  function _rerouteBeatportIfNeeded(): void {
    if (!isBeatport || !_isBufferPlaying || !_beatportAudioBuffer) return;
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx) return;
    const worklet = tpWorkletNode || stWorkletNode;
    if (!worklet) return;
    console.log('[AudioEngine] Rerouting Beatport BufferSource through worklet');

    // Stop current direct-to-destination playback
    if (bufferSource) {
      bufferSource.onended = null;
      try {
        bufferSource.stop();
        bufferSource.disconnect();
      } catch {}
      bufferSource = null;
    }

    // Create new BufferSource connected through worklet
    const newSrc = ctx.createBufferSource();
    newSrc.buffer = _beatportAudioBuffer;
    newSrc.playbackRate.value = _getBeatportPlaybackRate();
    newSrc.connect(worklet);
    const elapsed = ctx.currentTime - _beatportStartTime;
    const newOff = Math.max(0, _beatportStartOffset + elapsed);
    newSrc.start(0, newOff >= (_beatportAudioBuffer?.duration ?? 0) ? 0 : newOff);
    bufferSource = newSrc;
    _isBufferPlaying = true;
    _beatportStartTime = ctx.currentTime;
    _beatportStartOffset = newOff;
    newSrc.onended = () => {
      if (!_isBeatportSeeking) {
        _isBufferPlaying = false;
        bufferSource = null;
      }
    };
    applyPitchState();
  }

  async function _initAudioWorklet(): Promise<void> {
    if (!mediaElement && !isBeatport) {
      workletInitPromise = null;
      return;
    }
    try {
      // Try chrome.runtime.getURL first, fallback to DOM attribute from dispatcher
      const extOrigin: string =
        (typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('')
          : '') ||
        document.documentElement.dataset.tpExtensionOrigin ||
        '';
      if (!extOrigin) {
        console.warn('[Content] Extension origin not available');
        workletInitPromise = null;
        return;
      }
      const rgu = (path: string) => extOrigin + path;
      if (!audioContext) {
        const ec = (window as any).___tp_earlyContext;
        audioContext = ec || new AudioContext();
        if (ec) console.log('[Content] Using early AudioContext');
      }
      if (audioContext?.state === 'suspended') await audioContext.resume();
      const ctx = audioContext;
      if (!ctx) {
        workletInitPromise = null;
        return;
      }
      if (!gainNode) {
        gainNode = ctx.createGain();
        gainNode.gain.value = 1;
        gainNode.connect(ctx.destination);
      }
      if (!sourceNode && !isBeatport) {
        sourceNode = ctx.createMediaElementSource(mediaElement!);
      }
      // SoundTouchJS AudioWorklet (MPL-2.0 license)
      if (!isTpReady) {
        try {
          await SoundTouchNode.register(ctx, rgu('soundtouch-processor.js'));
          console.log('[AudioEngine] soundtouch-processor.js registered');

          tpWorkletNode = new SoundTouchNode({ context: ctx });

          // Connect audio graph
          if (sourceNode) {
            sourceNode.disconnect();
            sourceNode.connect(tpWorkletNode);
            tpWorkletNode.connect(gainNode!);
            console.log('[AudioEngine] SoundTouchJS: sourceNode → processor → gainNode');
          } else if (isBeatport) {
            tpWorkletNode.connect(gainNode!);
            console.log('[AudioEngine] SoundTouchJS: Beatport mode → gainNode');
          } else {
            tpWorkletNode.connect(gainNode!);
            console.log('[AudioEngine] SoundTouchJS: → gainNode');
          }

          isTpReady = true;
          isStReady = true;
          stWorkletNode = tpWorkletNode;
          console.log('[AudioEngine] SoundTouchJS processor ready');
          applyPitchState();
          _rerouteBeatportIfNeeded();
        } catch (err) {
          console.warn('[Content] SoundTouchJS setup failed, falling back to varispeed:', err);
          isTpReady = true;
          isStReady = true;
          workletInitPromise = null;
        }
      }
      if (!isBeatport && sourceNode) _ensureEqChain();
      applyPitchState();
    } catch (err) {
      logError('Content', 'AudioWorklet init failed', err);
      workletInitPromise = null;
    }
  }

  function attachToMedia(element: HTMLMediaElement, skp = false): void {
    if (mediaElement === element) return;
    mediaElement = element;
    skipAudioWorklet = skp;
    if (!skp) {
      applyPlaybackRate(state.speed);
      applyLoopMode(state.loopMode);
    }
    const nw =
      state.semitone !== 0 || state.pitch !== 0 || state.formant !== 0 || state.speed !== 1;
    if (!skp && nw) initAudioWorklet();
    if (!skp)
      element.addEventListener('play', () => {
        if (nw) initAudioWorklet();
        applyPlaybackRate(state.speed);
      });
    sendStateUpdate();
  }

  function setSpeed(speed: number): void {
    state.speed = speed;
    applyPlaybackRate(speed);
    const rgu =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL.bind(chrome.runtime)
        : null;
    if (speed !== 1 && !skipAudioWorklet && rgu) initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
    if (isBeatport && bufferSource && _isBufferPlaying) {
      _updateBeatportPlaybackRate();
    }
    if (isBeatport && mediaElement) {
      [100, 300, 800, 2000].forEach((d) =>
        setTimeout(() => {
          if (mediaElement && state.speed === speed) {
            hijackPlaybackRate(mediaElement, speed);
            mediaElement.playbackRate = Math.max(0.25, Math.min(16, speed));
          }
        }, d),
      );
    }
  }
  function _getBeatportPlaybackRate(): number {
    // If SoundTouchJS is active, pitch is handled by the worklet — only apply speed
    if (tpWorkletNode) {
      return Math.max(0.25, Math.min(16, state.speed || 1));
    }
    // Fallback: varispeed = speed × pitch ratio
    const pitchRatio = Math.pow(2, (state.semitone || 0) / 12);
    return Math.max(0.25, Math.min(16, (state.speed || 1) * pitchRatio));
  }

  function _updateBeatportPlaybackRate(): void {
    const rate = _getBeatportPlaybackRate();
    console.log(
      '[AudioEngine] _updateBeatportPlaybackRate: isBeatport=',
      isBeatport,
      'hasBuffer=',
      !!bufferSource,
      'isPlaying=',
      _isBufferPlaying,
      'rate=',
      rate,
      'semitone=',
      state.semitone,
      'speed=',
      state.speed,
    );
    if (isBeatport && bufferSource && _isBufferPlaying) {
      bufferSource.playbackRate.value = rate;
    }
  }

  function setSemitone(semitone: number): void {
    console.log(
      '[AudioEngine] setSemitone:',
      semitone,
      'isBeatport:',
      isBeatport,
      'hasWorklet:',
      !!(tpWorkletNode || stWorkletNode),
      'tpReady:',
      isTpReady,
      'stReady:',
      isStReady,
    );
    state.semitone = semitone;
    initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
    _updateBeatportPlaybackRate();
  }
  function setPitch(pitch: number): void {
    state.pitch = pitch;
    if (pitch !== 0) initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
  }
  function setFormant(formant: number): void {
    state.formant = formant;
    if (formant !== 0) initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
  }
  function setLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    state.loopMode = mode;
    applyLoopMode(mode);
    sendStateUpdate();
  }
  function setVarispeed(varispeed: boolean): void {
    state.varispeed = varispeed;
    applyPlaybackRate(state.speed);
    sendStateUpdate();
  }
  function setEqEnabled(enabled: boolean): void {
    state.eqEnabled = enabled;
    if (enabled) initAudioWorklet().then(() => _applyEqState());
    else _applyEqState();
    sendStateUpdate();
  }
  function setEqBand(index: number, gain: number): void {
    if (index >= 0 && index < eqBands.length) {
      eqBands[index].gain = gain;
      _applyEqState();
      sendStateUpdate();
    }
  }

  function _muteOriginalElement(): void {
    if (!mediaElement) return;
    try {
      mediaElement.volume = 0;
      mediaElement.muted = true;
    } catch {}
    try {
      Object.defineProperty(mediaElement, 'volume', {
        get: () => 0,
        set: () => {},
        configurable: true,
      });
    } catch {}
  }

  function stopBeatportPlayback(): void {
    if (bufferSource) {
      bufferSource.onended = null;
      try {
        bufferSource.stop();
        bufferSource.disconnect();
      } catch {}
      bufferSource = null;
      _isBufferPlaying = false;
    }
  }

  function startBeatportPlayback(): void {
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx || !_beatportAudioBuffer) return;
    stopBeatportPlayback();
    const src = ctx.createBufferSource();
    src.buffer = _beatportAudioBuffer;
    src.playbackRate.value = _getBeatportPlaybackRate();
    src.connect(ctx.destination);

    _beatportStartTime = ctx.currentTime;
    const off = Math.max(0, _beatportStartOffset);
    src.start(0, off >= _beatportAudioBuffer.duration ? 0 : off);
    bufferSource = src;
    _isBufferPlaying = true;
    src.onended = () => {
      if (!_isBeatportSeeking) {
        _isBufferPlaying = false;
        bufferSource = null;
      }
    };
  }

  function prepareBeatportAudio(url: string): void {
    if (_lastKnownSrc === url && _beatportAudioBuffer) {
      // Ensure worklet is initialized before playback
      const nw =
        state.semitone !== 0 || state.pitch !== 0 || state.formant !== 0 || state.speed !== 1;
      if (nw) {
        initAudioWorklet().then(() => {
          console.log('[AudioEngine] Beatport: worklet ready, starting cached playback');
          startBeatportPlayback();
        });
      } else {
        startBeatportPlayback();
      }
      return;
    }
    if (_lastKnownSrc !== url) {
      _beatportStartOffset = 0;
      stopBeatportPlayback();
      _beatportAudioBuffer = null;
    }
    _lastKnownSrc = url;
    _muteOriginalElement();
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    // Start worklet init early (in parallel with fetch)
    const nw =
      state.semitone !== 0 || state.pitch !== 0 || state.formant !== 0 || state.speed !== 1;
    const workletPromise = nw ? initAudioWorklet() : Promise.resolve();

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        _beatportAudioBuffer = audioBuffer;
        return workletPromise;
      })
      .then(() => {
        console.log('[AudioEngine] Beatport: fetch + worklet done, starting playback');
        startBeatportPlayback();
      })
      .catch((err) => {
        console.warn('[Content] Beatport: fetch/decode failed:', err);
        _fetchBeatportAudioXHR(url);
      });
  }

  function _fetchBeatportAudioXHR(url: string): void {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        const earlyContext = (window as any).___tp_earlyContext as AudioContext | undefined;
        if (earlyContext)
          earlyContext
            .decodeAudioData(xhr.response)
            .then((audioBuffer) => {
              _beatportAudioBuffer = audioBuffer;
              startBeatportPlayback();
            })
            .catch(() => {});
      }
    };
    xhr.onerror = () => {};
    xhr.send();
  }

  function pauseBeatportPlayback(): void {
    if (bufferSource && _isBufferPlaying) {
      const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
      if (ctx) _beatportStartOffset += ctx.currentTime - _beatportStartTime;
      stopBeatportPlayback();
    }
  }

  function seekBeatportPlayback(newTime: number): void {
    if (!_beatportAudioBuffer) return;
    _beatportStartOffset = Math.max(0, Math.min(newTime, _beatportAudioBuffer.duration));
    if (_isBufferPlaying) {
      _isBeatportSeeking = true;
      startBeatportPlayback();
      _isBeatportSeeking = false;
    }
  }

  function isBeatportBufferPlaying(): boolean {
    return _isBufferPlaying;
  }

  function resetBeatportState(): void {
    stopBeatportPlayback();
    _beatportAudioBuffer = null;
    _lastKnownSrc = '';
    _beatportStartOffset = 0;
    _beatportStartTime = 0;
    _isBeatportSeeking = false;
  }

  function destroy(): void {
    isDestroyed = true;
    if (findMediaInterval) {
      clearInterval(findMediaInterval);
      findMediaInterval = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    try {
      tpWorkletNode?.disconnect();
      stWorkletNode?.disconnect();
      sourceNode?.disconnect();
      gainNode?.disconnect();
    } catch {}
    try {
      const ec = (window as any).___tp_earlyContext;
      if (audioContext && audioContext !== ec) audioContext.close();
    } catch {}
    stopBeatportPlayback();
    mediaElement = null;
    audioContext = null;
    sourceNode = null;
    tpWorkletNode = null;
    stWorkletNode = null;
    gainNode = null;
    workletInitPromise = null;
    bufferSource = null;
    _beatportAudioBuffer = null;
    _beatportStartOffset = 0;
    _beatportStartTime = 0;
    _lastKnownSrc = '';
    _isBufferPlaying = false;
    setMediaElementHandler(null);
  }

  return {
    setSpeed,
    setSemitone,
    setPitch,
    setFormant,
    setLoopMode,
    setVarispeed,
    setEqEnabled,
    setEqBand,
    attachToMedia,
    prepareBeatportAudio,
    pauseBeatportPlayback,
    seekBeatportPlayback,
    isBeatportBufferPlaying,
    resetBeatportState,
    getState: () => ({ ...state }),
    destroy,
  };
}
