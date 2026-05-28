import { getAdapter, type PlatformAdapter } from './platform-adapters';
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
    const su = new URL(el.src);
    const pu = new URL(window.location.href);
    return su.href === pu.href || (su.origin === pu.origin && su.pathname === pu.pathname);
  } catch {
    return false;
  }
}

function isVibesFastActive(): boolean {
  for (const a of document.querySelectorAll<HTMLAudioElement>('audio')) {
    if (isPageUrlAsSrc(a)) return true;
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
  setSemitone(s: number): void;
  setPitch(p: number): void;
  setFormant(f: number): void;
  setLoopMode(m: 'off' | 'loop' | 'loop-one'): void;
  setVarispeed(v: boolean): void;
  setEqEnabled(e: boolean): void;
  setEqBand(i: number, g: number): void;
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

  const isYouTubeSoundEffect = (el: HTMLMediaElement): boolean => {
    if (!(el instanceof HTMLAudioElement)) return false;
    const sa = el.getAttribute('src') || '',
      sp = el.src || '';
    return sa.includes('/s/search/audio/') || sp.includes('/s/search/audio/');
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
      const idx = pendingMediaElements.indexOf(readyEl);
      if (idx !== -1) pendingMediaElements.splice(idx, 1);
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
    const cs = Math.max(0.25, Math.min(16, speed));
    if (!isBeatport) {
      el.playbackRate = cs;
      return;
    }
    if ((el as any).__tp_playbackRateHijacked) {
      (el as any).__tp_playbackRateValue = cs;
      try {
        el.playbackRate = cs;
      } catch {}
      return;
    }
    const nd = (window as any).___tp_nativePlaybackRateDescriptor as PropertyDescriptor | undefined;
    (el as any).__tp_playbackRateHijacked = true;
    (el as any).__tp_playbackRateValue = cs;
    Object.defineProperty(el, 'playbackRate', {
      get(): number {
        return (this as any).__tp_playbackRateValue ?? 1;
      },
      set(v: number) {
        (this as any).__tp_playbackRateValue = v;
        if (nd?.set) nd.set.call(this, v);
      },
      configurable: true,
      enumerable: true,
    });
    try {
      el.playbackRate = cs;
    } catch {}
  }

  function applyPlaybackRate(speed: number): void {
    if (!mediaElement) return;
    const cs = Math.max(0.25, Math.min(16, speed));
    mediaElement.playbackRate = cs;
    applyPitchState();
    if (mediaElement) hijackPlaybackRate(mediaElement, speed);
  }
  function applyLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    if (mediaElement) mediaElement.loop = mode === 'loop' || mode === 'loop-one';
  }

  function applyPitchState(): void {
    if (tpWorkletNode && isTpReady) {
      tpWorkletNode.port.postMessage({
        type: 'set-params',
        semitone: state.semitone || 0,
        pitch: state.pitch || 0,
        formant: state.formant || 0,
        speed: state.speed,
        enabled:
          state.semitone !== 0 || state.pitch !== 0 || state.formant !== 0 || state.speed !== 1,
      });
    }
    if (stWorkletNode && isStReady) {
      stWorkletNode.port.postMessage({
        type: 'set-params',
        semitone: state.semitone || 0,
        pitch: state.pitch || 0,
        speed: state.speed || 1,
        enabled: state.semitone !== 0 || state.pitch !== 0 || state.speed !== 1,
      });
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
      const p = pendingMediaElements[i];
      if (hasValidSource(p)) {
        pendingMediaElements.splice(i, 1);
        attachToMedia(p);
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
    for (const b of eqBands) {
      const f = audioContext.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.frequency;
      f.gain.value = b.gain;
      f.Q.value = b.Q;
      eqFilters.push(f);
    }
    const w = tpWorkletNode || stWorkletNode;
    if (w && eqFilters.length > 0) {
      w.disconnect();
      w.connect(eqFilters[0]);
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

  async function _initAudioWorklet(): Promise<void> {
    if (!mediaElement) return;
    try {
      const rgu =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL.bind(chrome.runtime)
          : null;
      if (!rgu) {
        console.warn('[Content] chrome.runtime.getURL not available');
        return;
      }
      if (!audioContext) {
        const ec = (window as any).___tp_earlyContext;
        audioContext = ec || new AudioContext();
        if (ec) console.log('[Content] Using early AudioContext');
      }
      if (audioContext?.state === 'suspended') await audioContext.resume();
      const ctx = audioContext;
      if (!ctx) return;
      if (!gainNode) {
        gainNode = ctx.createGain();
        gainNode.gain.value = 1;
        gainNode.connect(ctx.destination);
      }
      if (!sourceNode) sourceNode = ctx.createMediaElementSource(mediaElement);
      if (!isTpReady) {
        try {
          await ctx.audioWorklet.addModule(rgu('aw-tp-processor.js'));
          tpWorkletNode = new AudioWorkletNode(ctx, 'aw-tp-processor', {
            processorOptions: { wasmUrl: rgu('rb.wasm') },
          });
          tpWorkletNode.port.onmessage = (e) => {
            if (e.data?.type === 'ready') {
              isTpReady = true;
              applyPitchState();
            }
          };
          sourceNode.disconnect();
          sourceNode.connect(tpWorkletNode);
          tpWorkletNode.connect(gainNode!);
        } catch (err) {
          console.warn('[Content] TP worklet not available:', err);
        }
      }
      if (!isStReady) {
        try {
          await ctx.audioWorklet.addModule(rgu('aw-st-processor.js'));
          stWorkletNode = new AudioWorkletNode(ctx, 'aw-st-processor', { processorOptions: {} });
          stWorkletNode.port.onmessage = (e) => {
            if (e.data?.type === 'ready') {
              isStReady = true;
              applyPitchState();
            }
          };
          if (!tpWorkletNode) {
            sourceNode!.disconnect();
            sourceNode!.connect(stWorkletNode);
            stWorkletNode.connect(gainNode!);
          }
        } catch (err) {
          console.warn('[Content] ST worklet not available:', err);
        }
      }
      _ensureEqChain();
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
      bufferSource.playbackRate.value = Math.max(0.25, Math.min(16, speed));
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
  function setSemitone(s: number): void {
    state.semitone = s;
    if (s !== 0) initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
  }
  function setPitch(p: number): void {
    state.pitch = p;
    if (p !== 0) initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
  }
  function setFormant(f: number): void {
    state.formant = f;
    if (f !== 0) initAudioWorklet();
    applyPitchState();
    sendStateUpdate();
  }
  function setLoopMode(m: 'off' | 'loop' | 'loop-one'): void {
    state.loopMode = m;
    applyLoopMode(m);
    sendStateUpdate();
  }
  function setVarispeed(v: boolean): void {
    state.varispeed = v;
    applyPlaybackRate(state.speed);
    sendStateUpdate();
  }
  function setEqEnabled(e: boolean): void {
    state.eqEnabled = e;
    if (e) initAudioWorklet().then(() => _applyEqState());
    else _applyEqState();
    sendStateUpdate();
  }
  function setEqBand(i: number, g: number): void {
    if (i >= 0 && i < eqBands.length) {
      eqBands[i].gain = g;
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
    src.playbackRate.value = Math.max(0.25, Math.min(16, state.speed || 1));
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
      startBeatportPlayback();
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
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        _beatportAudioBuffer = buf;
        startBeatportPlayback();
      })
      .catch((err) => {
        console.warn('[Content] Beatport: fetch/decode failed:', err);
        _fetchBeatportAudioXHR(url);
      });
  }

  function _fetchBeatportAudioXHR(url: string): void {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.responseType = 'arraybuffer';
    x.onload = () => {
      if (x.status === 200 || x.status === 0) {
        const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
        if (ctx)
          ctx
            .decodeAudioData(x.response)
            .then((b) => {
              _beatportAudioBuffer = b;
              startBeatportPlayback();
            })
            .catch(() => {});
      }
    };
    x.onerror = () => {};
    x.send();
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
