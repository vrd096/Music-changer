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
  const audios = document.querySelectorAll<HTMLAudioElement>('audio');
  for (const audio of audios) {
    if (isPageUrlAsSrc(audio)) return true;
  }
  return false;
}

function getAudioEngine(): AudioEngine | null {
  return (window as any).___tp_audioEngine || null;
}

function watchBeatportElement(el: HTMLMediaElement): void {
  let urlDetected = false;
  let _preparingBeatport = false;
  let _pendingPlay = false;
  let _pollForUrl: (() => void) | null = null;
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
        console.log(
          '[Content] Beatport: pending play detected in trackChange, starting audio preparation:',
          src,
        );
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
        console.log(
          '[Content] Beatport: URL detected via polling, starting audio preparation:',
          src,
        );
        if (engine) engine.prepareBeatportAudio(src);
        return;
      }
      if (attempts >= maxAttempts) {
        _pollForUrl = null;
        console.log('[Content] Beatport: URL polling timeout, giving up');
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
        console.log('[Content] Beatport play detected, preparing audio:', src);
        engine.prepareBeatportAudio(src);
      } else {
        _pendingPlay = true;
        console.log('[Content] Beatport play detected but no real URL yet, starting URL polling');
        startUrlPolling();
      }
    }
  };

  const onPause = () => {
    if (engine) {
      console.log('[Content] Beatport pause detected');
      engine.pauseBeatportPlayback();
      _preparingBeatport = false;
      stopUrlPolling();
    }
  };

  const onSeeked = () => {
    if (engine && engine.isBeatportBufferPlaying()) {
      const newTime = el.currentTime;
      console.log('[Content] Beatport seeked detected, new time:', newTime);
      engine.seekBeatportPlayback(newTime);
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
      console.log('[Content] Beatport watch: Detected real audio URL:', src);
      if (engine) engine.attachToMedia(el, true);
      if (_pendingPlay && !_preparingBeatport && engine) {
        _pendingPlay = false;
        _preparingBeatport = true;
        console.log('[Content] Beatport: pending play detected, starting audio preparation:', src);
        engine.prepareBeatportAudio(src);
      }
      if (_playRequested) {
        _playRequested = false;
        console.log('[Content] Beatport: calling deferred play() on element with real URL');
        originalPlay().catch((err) => {
          console.log(
            '[Content] Beatport: deferred play() result:',
            (err as Error)?.message || err,
          );
        });
      }
    }
  }, 200);

  setTimeout(() => {
    clearInterval(interval);
    if (!urlDetected) console.log('[Content] Beatport watch: timeout, no URL detected');
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

export class AudioEngine {
  private state: AudioEngineState = { ...DEFAULT_STATE };
  private mediaElement: HTMLMediaElement | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private tpWorkletNode: AudioWorkletNode | null = null;
  private stWorkletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private isTpReady = false;
  private isStReady = false;
  private workletInitPromise: Promise<void> | null = null;
  private originalPlaybackRate = 1;
  private isDestroyed = false;
  private findMediaInterval: ReturnType<typeof setInterval> | null = null;
  private mutationObserver: MutationObserver | null = null;
  private currentAdapter: PlatformAdapter = getAdapter();
  private skipAudioWorklet = false;
  private eqFilters: BiquadFilterNode[] = [];
  private eqBands: EqBand[] = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
  private bufferSource: AudioBufferSourceNode | null = null;
  private _beatportAudioBuffer: AudioBuffer | null = null;
  private _pendingStartRequest: boolean = false;
  private _beatportStartOffset: number = 0;
  private _beatportStartTime: number = 0;
  private _lastKnownSrc: string = '';
  private _isBufferPlaying: boolean = false;
  private _isBeatportSeeking: boolean = false;

  constructor() {
    this.currentAdapter = getAdapter();
    console.log(`[Content] Platform adapter: ${this.currentAdapter.platform}`);

    const isYouTubeSoundEffect = (el: HTMLMediaElement): boolean => {
      if (!(el instanceof HTMLAudioElement)) return false;
      const srcAttr = el.getAttribute('src') || '';
      const srcProp = el.src || '';
      return srcAttr.includes('/s/search/audio/') || srcProp.includes('/s/search/audio/');
    };

    setMediaElementHandler((el: HTMLMediaElement) => {
      if (isBeatport) {
        console.log('[Content] Beatport: Intercepted audio element creation, starting watch');
        try {
          el.volume = 0;
          el.muted = true;
        } catch {}
        this.hijackPlaybackRate(el, this.state.speed);
        watchBeatportElement(el);
        return;
      }
      if (this.mediaElement) return;
      if (isYouTubeSoundEffect(el)) {
        console.log(`[Content] Skipping YouTube sound effect (intercepted):`, el);
        return;
      }
      if (hasValidSource(el)) {
        console.log(`[Content] Intercepted media element with src:`, el);
        this.attachToMedia(el);
        return;
      }
      console.log(`[Content] Queuing media element (no src yet):`, el);
      pendingMediaElements.push(el);
      waitForSource(el, (readyEl: HTMLMediaElement) => {
        const idx = pendingMediaElements.indexOf(readyEl);
        if (idx !== -1) pendingMediaElements.splice(idx, 1);
        if (!this.mediaElement) {
          if (isYouTubeSoundEffect(readyEl)) {
            console.log(`[Content] Skipping YouTube sound effect (after wait):`, readyEl.src);
            return;
          }
          console.log(`[Content] Media element now has src:`, readyEl);
          this.attachToMedia(readyEl);
        }
      });
    });

    if (!isBeatport) {
      this.initMediaDetection();
    }
    if (!isBeatport) {
      setTimeout(() => {
        if (!this.mediaElement) {
          console.log(`[Content] Delayed media search for ${this.currentAdapter.platform}...`);
          this.findMediaElement();
        }
      }, 500);
    }
  }

  private initMediaDetection(): void {
    this.findMediaElement();
    this.mutationObserver = new MutationObserver(() => {
      if (!this.mediaElement) this.findMediaElement();
    });
    const startObserver = () => {
      if (document.body) {
        this.mutationObserver?.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            if (document.body && this.mutationObserver)
              this.mutationObserver.observe(document.body, { childList: true, subtree: true });
          },
          { once: true },
        );
      }
    };
    startObserver();
    this.findMediaInterval = setInterval(() => {
      if (!this.mediaElement) this.findMediaElement();
    }, 2000);
  }

  private findMediaElement(): void {
    for (let i = pendingMediaElements.length - 1; i >= 0; i--) {
      const pending = pendingMediaElements[i];
      if (hasValidSource(pending)) {
        pendingMediaElements.splice(i, 1);
        console.log(`[Content] Pending media element now has src:`, pending);
        this.attachToMedia(pending);
        return;
      }
    }
    const element = this.currentAdapter.findMedia();
    if (element && element !== this.mediaElement) {
      console.log(`[Content] Found media via ${this.currentAdapter.platform} adapter:`, element);
      this.attachToMedia(element);
    }
  }

  public attachToMedia(element: HTMLMediaElement, skipAudioWorklet = false): void {
    if (this.mediaElement === element) return;
    console.log('[Content] Attaching to media element:', element, { skipAudioWorklet });
    this.mediaElement = element;
    this.skipAudioWorklet = skipAudioWorklet;
    this.originalPlaybackRate = element.playbackRate || 1;
    if (!skipAudioWorklet) {
      this.applyPlaybackRate(this.state.speed);
      this.applyLoopMode(this.state.loopMode);
    }
    const needsWorklet =
      this.state.semitone !== 0 ||
      this.state.pitch !== 0 ||
      this.state.formant !== 0 ||
      this.state.speed !== 1;
    if (!skipAudioWorklet && needsWorklet) this.initAudioWorklet();
    if (!skipAudioWorklet) {
      element.addEventListener('play', () => {
        if (needsWorklet) this.initAudioWorklet();
        this.applyPlaybackRate(this.state.speed);
      });
    }
    this.sendStateUpdate();
  }

  private async initAudioWorklet(): Promise<void> {
    if (this.workletInitPromise) return this.workletInitPromise;
    this.workletInitPromise = this._initAudioWorklet();
    return this.workletInitPromise;
  }

  private async _initAudioWorklet(): Promise<void> {
    if (!this.mediaElement) return;
    try {
      const runtimeGetUrl =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL.bind(chrome.runtime)
          : null;
      if (!runtimeGetUrl) {
        console.warn('[Content] chrome.runtime.getURL not available, worklets disabled');
        return;
      }
      if (!this.audioContext) {
        const ec = (window as any).___tp_earlyContext;
        this.audioContext = ec || new AudioContext();
        if (ec) console.log('[Content] Using early AudioContext for worklet');
      }
      if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
      const ctx = this.audioContext;
      if (!ctx) return;
      if (!this.gainNode) {
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1;
        this.gainNode.connect(ctx.destination);
      }
      if (!this.sourceNode) this.sourceNode = ctx.createMediaElementSource(this.mediaElement);
      if (!this.isTpReady) {
        try {
          await ctx.audioWorklet.addModule(runtimeGetUrl('aw-tp-processor.js'));
          this.tpWorkletNode = new AudioWorkletNode(ctx, 'aw-tp-processor', {
            processorOptions: { wasmUrl: runtimeGetUrl('rb.wasm') },
          });
          this.tpWorkletNode.port.onmessage = (e) => {
            if (e.data?.type === 'ready') {
              this.isTpReady = true;
              console.log('[Content] TP worklet ready');
              this.applyPitchState();
            }
          };
          this.sourceNode.disconnect();
          this.sourceNode.connect(this.tpWorkletNode);
          this.tpWorkletNode.connect(this.gainNode!);
        } catch (err) {
          console.warn('[Content] TP worklet not available, falling back to ST worklet:', err);
        }
      }
      if (!this.isStReady) {
        try {
          await ctx.audioWorklet.addModule(runtimeGetUrl('aw-st-processor.js'));
          this.stWorkletNode = new AudioWorkletNode(ctx, 'aw-st-processor', {
            processorOptions: {},
          });
          this.stWorkletNode.port.onmessage = (e) => {
            if (e.data?.type === 'ready') {
              this.isStReady = true;
              console.log('[Content] ST worklet ready');
              this.applyPitchState();
            }
          };
          if (!this.tpWorkletNode) {
            this.sourceNode!.disconnect();
            this.sourceNode!.connect(this.stWorkletNode);
            this.stWorkletNode.connect(this.gainNode!);
          }
        } catch (err) {
          console.warn('[Content] ST worklet not available:', err);
        }
      }
      this._ensureEqChain();
      this.applyPitchState();
    } catch (err) {
      logError('Content', 'AudioWorklet init failed', err);
      this.workletInitPromise = null;
    }
  }

  private _ensureEqChain(): void {
    if (this.eqFilters.length > 0) return;
    const ctx = this.audioContext;
    if (!ctx || !this.gainNode) return;
    for (const band of this.eqBands) {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.frequency;
      f.gain.value = band.gain;
      f.Q.value = band.Q;
      this.eqFilters.push(f);
    }
    const worklet = this.tpWorkletNode || this.stWorkletNode;
    if (worklet && this.eqFilters.length > 0) {
      worklet.disconnect();
      worklet.connect(this.eqFilters[0]);
      for (let i = 0; i < this.eqFilters.length - 1; i++)
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      this.eqFilters[this.eqFilters.length - 1].connect(this.gainNode);
    }
  }

  private _applyEqState(): void {
    for (let i = 0; i < this.eqFilters.length && i < this.eqBands.length; i++)
      this.eqFilters[i].gain.value = this.state.eqEnabled ? this.eqBands[i].gain : 0;
  }

  private hijackPlaybackRate(el: HTMLMediaElement, speed: number): void {
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
    const nd = (window as any).___tp_nativePlaybackRateDescriptor as PropertyDescriptor | undefined;
    (el as any).__tp_playbackRateHijacked = true;
    (el as any).__tp_playbackRateValue = clampedSpeed;
    Object.defineProperty(el, 'playbackRate', {
      get(): number {
        return (this as any).__tp_playbackRateValue ?? 1;
      },
      set(value: number) {
        (this as any).__tp_playbackRateValue = value;
        if (nd?.set) nd.set.call(this, value);
      },
      configurable: true,
      enumerable: true,
    });
    try {
      el.playbackRate = clampedSpeed;
    } catch {}
  }

  private applyPlaybackRate(speed: number): void {
    if (!this.mediaElement) return;
    const cs = Math.max(0.25, Math.min(16, speed));
    this.mediaElement.playbackRate = cs;
    this.applyPitchState();
    if (this.mediaElement) this.hijackPlaybackRate(this.mediaElement, speed);
  }

  private applyLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    if (!this.mediaElement) return;
    this.mediaElement.loop = mode === 'loop' || mode === 'loop-one';
  }

  private applyPitchState(): void {
    if (this.tpWorkletNode && this.isTpReady) {
      this.tpWorkletNode.port.postMessage({
        type: 'set-params',
        semitone: this.state.semitone || 0,
        pitch: this.state.pitch || 0,
        formant: this.state.formant || 0,
        speed: this.state.speed,
        enabled:
          this.state.semitone !== 0 ||
          this.state.pitch !== 0 ||
          this.state.formant !== 0 ||
          this.state.speed !== 1,
      });
    }
    if (this.stWorkletNode && this.isStReady) {
      this.stWorkletNode.port.postMessage({
        type: 'set-params',
        semitone: this.state.semitone || 0,
        pitch: this.state.pitch || 0,
        speed: this.state.speed || 1,
        enabled: this.state.semitone !== 0 || this.state.pitch !== 0 || this.state.speed !== 1,
      });
    }
  }

  setSpeed(speed: number): void {
    this.state.speed = speed;
    this.applyPlaybackRate(speed);
    const rgu =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL.bind(chrome.runtime)
        : null;
    if (speed !== 1 && !this.skipAudioWorklet && rgu) this.initAudioWorklet();
    this.applyPitchState();
    this.sendStateUpdate();
    if (isBeatport && this.bufferSource && this._isBufferPlaying) {
      this.bufferSource.playbackRate.value = Math.max(0.25, Math.min(16, speed));
      console.log(
        '[Content] Beatport: updated buffer source speed to:',
        this.bufferSource.playbackRate.value,
      );
    }
    if (isBeatport && this.mediaElement) {
      [100, 300, 800, 2000].forEach((d) =>
        setTimeout(() => {
          if (this.mediaElement && this.state.speed === speed) {
            this.hijackPlaybackRate(this.mediaElement, speed);
            this.mediaElement.playbackRate = Math.max(0.25, Math.min(16, speed));
          }
        }, d),
      );
    }
  }

  setSemitone(s: number): void {
    this.state.semitone = s;
    if (s !== 0) this.initAudioWorklet();
    this.applyPitchState();
    this.sendStateUpdate();
  }
  setPitch(p: number): void {
    this.state.pitch = p;
    if (p !== 0) this.initAudioWorklet();
    this.applyPitchState();
    this.sendStateUpdate();
  }
  setFormant(f: number): void {
    this.state.formant = f;
    if (f !== 0) this.initAudioWorklet();
    this.applyPitchState();
    this.sendStateUpdate();
  }
  setLoopMode(m: 'off' | 'loop' | 'loop-one'): void {
    this.state.loopMode = m;
    this.applyLoopMode(m);
    this.sendStateUpdate();
  }
  setVarispeed(v: boolean): void {
    this.state.varispeed = v;
    this.applyPlaybackRate(this.state.speed);
    this.sendStateUpdate();
  }
  setEqEnabled(e: boolean): void {
    this.state.eqEnabled = e;
    if (e) this.initAudioWorklet().then(() => this._applyEqState());
    else this._applyEqState();
    this.sendStateUpdate();
  }
  setEqBand(i: number, g: number): void {
    if (i >= 0 && i < this.eqBands.length) {
      this.eqBands[i].gain = g;
      this._applyEqState();
      this.sendStateUpdate();
    }
  }

  public prepareBeatportAudio(url: string): void {
    if (this._lastKnownSrc === url && this._beatportAudioBuffer) {
      console.log('[Content] Beatport: resuming playback from offset:', this._beatportStartOffset);
      this.startBeatportPlayback();
      return;
    }
    if (this._lastKnownSrc !== url) {
      console.log('[Content] Beatport: new track URL detected, stopping old buffer');
      this._beatportStartOffset = 0;
      this.stopBeatportPlayback();
      this._beatportAudioBuffer = null;
    }
    this._lastKnownSrc = url;
    console.log('[Content] Beatport: preparing audio from:', url);
    this._muteOriginalElement();
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx) {
      console.warn('[Content] Beatport: no early AudioContext available');
      return;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        console.log('[Content] Beatport: decoded audio buffer, duration:', buf.duration);
        this._beatportAudioBuffer = buf;
        this.startBeatportPlayback();
      })
      .catch((err) => {
        console.warn('[Content] Beatport: fetch/decode failed:', err);
        this._fetchBeatportAudioXHR(url);
      });
  }

  private _fetchBeatportAudioXHR(url: string): void {
    console.log('[Content] Beatport: trying XHR fallback for:', url);
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
              console.log('[Content] Beatport: XHR decoded audio buffer');
              this._beatportAudioBuffer = b;
              this.startBeatportPlayback();
            })
            .catch((e) => console.warn('[Content] Beatport: XHR decode failed:', e));
      } else console.warn('[Content] Beatport: XHR failed with status:', x.status);
    };
    x.onerror = () => console.warn('[Content] Beatport: XHR error');
    x.send();
  }

  private startBeatportPlayback(): void {
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx || !this._beatportAudioBuffer) {
      console.warn('[Content] Beatport: cannot start playback, no context or buffer');
      return;
    }
    this.stopBeatportPlayback();
    const src = ctx.createBufferSource();
    src.buffer = this._beatportAudioBuffer;
    src.playbackRate.value = Math.max(0.25, Math.min(16, this.state.speed || 1));
    src.connect(ctx.destination);
    this._beatportStartTime = ctx.currentTime;
    const off = Math.max(0, this._beatportStartOffset);
    const dur = this._beatportAudioBuffer.duration;
    src.start(0, off >= dur ? 0 : off);
    this.bufferSource = src;
    this._isBufferPlaying = true;
    console.log('[Content] Beatport: playback started');
    src.onended = () => {
      if (!this._isBeatportSeeking) {
        this._isBufferPlaying = false;
        this.bufferSource = null;
      } else console.log('[Content] Beatport: ignoring ended during seek');
    };
  }

  private stopBeatportPlayback(): void {
    if (this.bufferSource) {
      this.bufferSource.onended = null;
      try {
        this.bufferSource.stop();
        this.bufferSource.disconnect();
      } catch {}
      this.bufferSource = null;
      this._isBufferPlaying = false;
    }
  }

  public pauseBeatportPlayback(): void {
    if (this.bufferSource && this._isBufferPlaying) {
      const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
      if (ctx) this._beatportStartOffset += ctx.currentTime - this._beatportStartTime;
      this.stopBeatportPlayback();
      console.log('[Content] Beatport: playback paused');
    }
  }

  public seekBeatportPlayback(newTime: number): void {
    if (!this._beatportAudioBuffer) {
      console.warn('[Content] Beatport: cannot seek, no audio buffer loaded');
      return;
    }
    this._beatportStartOffset = Math.max(0, Math.min(newTime, this._beatportAudioBuffer.duration));
    if (this._isBufferPlaying) {
      console.log('[Content] Beatport: seeking to:', this._beatportStartOffset);
      this._isBeatportSeeking = true;
      this.startBeatportPlayback();
      this._isBeatportSeeking = false;
    }
  }

  public isBeatportBufferPlaying(): boolean {
    return this._isBufferPlaying;
  }

  public resetBeatportState(): void {
    console.log('[Content] Beatport: resetting state for track change');
    this.stopBeatportPlayback();
    this._beatportAudioBuffer = null;
    this._lastKnownSrc = '';
    this._beatportStartOffset = 0;
    this._beatportStartTime = 0;
    this._isBeatportSeeking = false;
  }

  private _muteOriginalElement(): void {
    if (!this.mediaElement) return;
    try {
      this.mediaElement.volume = 0;
      this.mediaElement.muted = true;
    } catch {}
    try {
      Object.defineProperty(this.mediaElement, 'volume', {
        get: () => 0,
        set: () => {},
        configurable: true,
      });
    } catch {}
    console.log('[Content] Beatport: muted original Vibes Fast element');
  }

  getState(): AudioEngineState {
    return { ...this.state };
  }

  private sendStateUpdate(): void {
    try {
      chrome.runtime?.sendMessage({
        sender: 'content',
        command: 'set-from-content',
        speed: this.state.speed,
        semitone: this.state.semitone,
        pitch: this.state.pitch,
        formant: this.state.formant,
        loopMode: this.state.loopMode,
        varispeed: this.state.varispeed,
        eqEnabled: this.state.eqEnabled,
        eqBands: this.eqBands,
      });
    } catch {}
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.findMediaInterval) {
      clearInterval(this.findMediaInterval);
      this.findMediaInterval = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    try {
      this.tpWorkletNode?.disconnect();
      this.stWorkletNode?.disconnect();
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
    } catch {}
    try {
      const ec = (window as any).___tp_earlyContext;
      if (this.audioContext && this.audioContext !== ec) this.audioContext.close();
    } catch {}
    this.stopBeatportPlayback();
    this.mediaElement = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.tpWorkletNode = null;
    this.stWorkletNode = null;
    this.gainNode = null;
    this.workletInitPromise = null;
    this.bufferSource = null;
    this._beatportAudioBuffer = null;
    this._pendingStartRequest = false;
    this._beatportStartOffset = 0;
    this._beatportStartTime = 0;
    this._lastKnownSrc = '';
    this._isBufferPlaying = false;
    setMediaElementHandler(null);
  }
}
