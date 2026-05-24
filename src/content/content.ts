// ============================================================
// Content Script - runs in MAIN world
// Audio processing engine: manages playback rate, pitch, semitone,
// formant, and loop mode for media elements on the page.
// ============================================================

import { isBlockedUrl } from '../shared/types';

const INIT_FLAG = '___tp_isInitialized';

// ============================================================
// Monkey-patch для перехвата создания медиа-элементов
// SoundCloud и другие SPA создают <audio> через createElement,
// но НЕ добавляют их в DOM. MutationObserver не может их найти.
// Оригинальный Transpose использует такой же подход.
// ============================================================

let onMediaElementCreated: ((el: HTMLMediaElement) => void) | null = null;

/**
 * Очередь перехваченных медиа-элементов, которые ещё не имеют src.
 * SoundCloud создаёт <audio> через createElement с src=NONE,
 * а затем устанавливает blob: URL через некоторое время.
 * Мы сохраняем такие элементы и ждём появления src.
 */
const pendingMediaElements: HTMLMediaElement[] = [];

/**
 * Проверяет, есть ли у элемента валидный источник (src или srcObject).
 * Для SoundCloud blob: URL считается валидным.
 */
function hasValidSource(el: HTMLMediaElement): boolean {
  return !!(el.src || el.currentSrc || el.srcObject);
}

/**
 * Устанавливает слушатели на элемент, чтобы поймать момент появления src.
 * SoundCloud устанавливает src через loadstart после создания элемента.
 */
function waitForSource(el: HTMLMediaElement, callback: (el: HTMLMediaElement) => void): void {
  // Если src уже есть — вызываем сразу
  if (hasValidSource(el)) {
    callback(el);
    return;
  }

  // Слушаем loadstart — SoundCloud устанавливает blob: URL именно в этот момент
  const onLoadStart = () => {
    el.removeEventListener('loadstart', onLoadStart);
    el.removeEventListener('loadedmetadata', onMeta);
    callback(el);
  };
  const onMeta = () => {
    el.removeEventListener('loadstart', onLoadStart);
    el.removeEventListener('loadedmetadata', onMeta);
    callback(el);
  };
  el.addEventListener('loadstart', onLoadStart);
  el.addEventListener('loadedmetadata', onMeta);

  // Таймаут на случай, если src так и не появится
  setTimeout(() => {
    el.removeEventListener('loadstart', onLoadStart);
    el.removeEventListener('loadedmetadata', onMeta);
    if (hasValidSource(el)) {
      callback(el);
    }
  }, 10000);
}

(function patchCreateElement(): void {
  const originalCreateElement = document.createElement.bind(document);
  const originalAudio = window.Audio;

  // Перехватываем document.createElement('audio') и document.createElement('video')
  document.createElement = function <T extends HTMLElement>(
    tagName: string,
    options?: ElementCreationOptions,
  ): T {
    const el = originalCreateElement(tagName, options) as T;
    if ((tagName === 'audio' || tagName === 'video') && onMediaElementCreated) {
      onMediaElementCreated(el as unknown as HTMLMediaElement);
    }
    return el;
  } as typeof document.createElement;

  // Перехватываем new Audio()
  if (originalAudio) {
    class PatchedAudio extends originalAudio {
      constructor(src?: string) {
        super(src);
        if (onMediaElementCreated) {
          onMediaElementCreated(this);
        }
      }
    }
    // Сохраняем ссылку на оригинальный Audio для возможного восстановления
    (PatchedAudio as any).__original__ = originalAudio;
    window.Audio = PatchedAudio as any;
  }
})();

// Error logging helper
function logError(scope: string, event: string, data?: unknown): void {
  console.error(`[${scope}] ${event}`, data ?? '');
  try {
    chrome.runtime.sendMessage({
      type: 'logger-error',
      entry: {
        lvl: 'error',
        scope,
        event,
        msg: typeof data === 'string' ? data : undefined,
        ctx: data,
      },
      pageUrl: window.location.href,
    });
  } catch {
    /* ignore */
  }
}

// Check if error is a security/frame blocking error
function isSecurityError(error: unknown, url: string): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const isBlocked = msg.includes('Blocked a frame with origin') || msg.includes('SecurityError');

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  if (isBlocked && hostname) {
    const knownHosts = new Set([
      'youtube.googleapis.com',
      'youtube.com',
      'www.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
      'w.soundcloud.com',
    ]);

    if (knownHosts.has(hostname)) return false;

    if (
      hostname.endsWith('.cloudfastcdn.net') ||
      hostname.endsWith('.webcloudcdn.net') ||
      hostname.endsWith('.youtube.googleapis.com')
    ) {
      return false;
    }
  }

  return isBlocked;
}

// ============================================================
// Platform Adapter System
// ============================================================

/**
 * Base adapter interface.
 * Каждый адаптер отвечает за поиск медиа-элементов на конкретной платформе.
 */
interface PlatformAdapter {
  readonly platform: string;
  /** Проверяет, подходит ли этот адаптер для текущего URL */
  canHandle(url: string): boolean;
  /** Находит подходящий медиа-элемент на странице */
  findMedia(): HTMLMediaElement | null;
  /** Проверяет, есть ли на странице воспроизводимый медиа-контент */
  containsPlayableMedia(): boolean;
}

/**
 * Адаптер по умолчанию — ищет любые <video> и <audio> элементы.
 * Использует систему скоринга для выбора наилучшего элемента.
 */
class DefaultAdapter implements PlatformAdapter {
  readonly platform = 'HTML';

  canHandle(_url: string): boolean {
    return true; // fallback — подходит для любого сайта
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

    // Prefer elements that are already playing
    if (!el.paused) score += 100;
    if (el.currentTime > 0) score += 50;

    // Prefer elements with audio
    if (!el.muted) score += 30;
    if (el.volume > 0) score += 20;

    // Prefer larger elements (video over audio)
    if (el instanceof HTMLVideoElement) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100) score += 40;
      if (rect.width > 400) score += 30;
      if (rect.top < window.innerHeight && rect.bottom > 0) score += 20;
    }

    // Prefer elements with duration
    if (el.duration > 0 && !isNaN(el.duration)) score += 10;

    // Prefer elements that have loaded data
    if (el.readyState >= 2) score += 15;

    // YouTube specific: prefer the main video (not ads)
    if (el.classList.contains('video-stream') || el.classList.contains('html5-main-video')) {
      score += 200;
    }

    return score;
  }
}

/**
 * SoundCloud adapter.
 * SoundCloud использует кастомный плеер с элементами <audio>,
 * которые могут быть созданы динамически через JavaScript.
 * Оригинальный Transpose проверяет наличие .playControls.
 */
class SoundCloudAdapter implements PlatformAdapter {
  readonly platform = 'SoundCloud';

  canHandle(url: string): boolean {
    return url.includes('soundcloud.com');
  }

  findMedia(): HTMLMediaElement | null {
    // Сначала пробуем найти audio элементы внутри плеера SoundCloud
    const playerEl = document.querySelector('.playControls');
    if (playerEl) {
      // Ищем audio внутри плеера или рядом с ним
      const audioInPlayer = playerEl.querySelector('audio');
      if (audioInPlayer) return audioInPlayer;
    }

    // Ищем все audio элементы на странице
    const audios = document.querySelectorAll('audio');
    if (audios.length > 0) {
      // SoundCloud использует audio с blob: URL или медиа-стримами
      // Выбираем audio с наибольшим duration (основной трек)
      let best: HTMLAudioElement | null = null;
      let bestDuration = 0;
      for (const audio of audios) {
        // Пропускаем пустые элементы
        if (!audio.src && !audio.srcObject) continue;
        const d = audio.duration || 0;
        if (d > bestDuration) {
          bestDuration = d;
          best = audio;
        }
      }
      if (best) return best;

      // Fallback: любой audio элемент с src или srcObject
      for (const audio of audios) {
        if (audio.src || audio.srcObject) return audio as HTMLAudioElement;
      }
      // Самый последний audio (часто самый актуальный)
      return audios[audios.length - 1] as HTMLAudioElement;
    }

    return null;
  }

  containsPlayableMedia(): boolean {
    return !!document.querySelector('.playControls') || !!document.querySelector('audio');
  }
}

/**
 * Адаптер для junodownload.com и похожих сайтов.
 * Эти сайты часто используют стандартные HTML5 audio/video элементы
 * или встраивают плеер через iframe.
 */
class JunoDownloadAdapter implements PlatformAdapter {
  readonly platform = 'JunoDownload';

  canHandle(url: string): boolean {
    return url.includes('junodownload.com') || url.includes('juno.co.uk');
  }

  findMedia(): HTMLMediaElement | null {
    // Ищем audio/video элементы на странице
    const audios = document.querySelectorAll('audio');
    const videos = document.querySelectorAll('video');
    const allMedia = [...audios, ...videos] as HTMLMediaElement[];

    if (allMedia.length === 0) return null;

    // Выбираем элемент с наибольшим duration (основной трек)
    let best: HTMLMediaElement | null = null;
    let bestDuration = 0;
    for (const el of allMedia) {
      if (el.src && !el.src.includes('blob:')) {
        const d = el.duration || 0;
        if (d > bestDuration) {
          bestDuration = d;
          best = el;
        }
      }
    }

    return best || allMedia[0];
  }

  containsPlayableMedia(): boolean {
    return !!document.querySelector('audio, video');
  }
}

/**
 * Адаптер менеджер — выбирает подходящий адаптер для текущего URL.
 * Порядок важен: специфичные адаптеры идут первыми, DefaultAdapter — последним.
 */
class AdapterManager {
  private adapters: PlatformAdapter[];

  constructor() {
    this.adapters = [
      new SoundCloudAdapter(),
      new JunoDownloadAdapter(),
      new DefaultAdapter(), // должен быть последним (fallback)
    ];
  }

  getAdapter(): PlatformAdapter {
    const url = window.location.href;
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url)) {
        return adapter;
      }
    }
    return this.adapters[this.adapters.length - 1];
  }

  getAllAdapters(): PlatformAdapter[] {
    return this.adapters;
  }
}

// ============================================================
// AudioEngine — manages audio processing for media elements
// ============================================================

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

class AudioEngine {
  private state: AudioEngineState = { ...DEFAULT_STATE };
  private mediaElement: HTMLMediaElement | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private tpWorkletNode: AudioWorkletNode | null = null; // Rubberband WASM pitch shifter
  private stWorkletNode: AudioWorkletNode | null = null; // SoundTouch speed/pitch shifter
  private gainNode: GainNode | null = null;
  private isTpReady = false;
  private isStReady = false;
  private workletInitPromise: Promise<void> | null = null;
  private originalPlaybackRate = 1;
  private isDestroyed = false;
  private findMediaInterval: ReturnType<typeof setInterval> | null = null;
  private mutationObserver: MutationObserver | null = null;
  private adapterManager: AdapterManager;
  private currentAdapter: PlatformAdapter;

  constructor() {
    this.adapterManager = new AdapterManager();
    this.currentAdapter = this.adapterManager.getAdapter();
    console.log(`[Content] Platform adapter: ${this.currentAdapter.platform}`);

    // Подписываемся на перехват создания медиа-элементов (для SoundCloud и других SPA)
    onMediaElementCreated = (el: HTMLMediaElement) => {
      if (this.mediaElement) return; // уже есть элемент

      // Если у элемента уже есть src — подключаемся сразу
      if (hasValidSource(el)) {
        console.log(`[Content] Intercepted media element with src:`, el);
        this.attachToMedia(el);
        return;
      }

      // Иначе — ставим в очередь и ждём появления src
      console.log(`[Content] Queuing media element (no src yet):`, el);
      pendingMediaElements.push(el);
      waitForSource(el, (readyEl) => {
        // Удаляем из очереди
        const idx = pendingMediaElements.indexOf(readyEl);
        if (idx !== -1) pendingMediaElements.splice(idx, 1);

        if (!this.mediaElement) {
          console.log(`[Content] Media element now has src:`, readyEl);
          this.attachToMedia(readyEl);
        }
      });
    };

    this.initMediaDetection();
  }

  // --- Media element detection ---

  private initMediaDetection(): void {
    // Try to find existing media elements
    this.findMediaElement();

    // Watch for dynamically added media elements
    this.mutationObserver = new MutationObserver(() => {
      if (!this.mediaElement) {
        this.findMediaElement();
      }
    });

    // Некоторые SPA сайты (SoundCloud) могут загружаться до появления document.body
    const startObserver = () => {
      if (document.body) {
        this.mutationObserver?.observe(document.body, {
          childList: true,
          subtree: true,
        });
      } else {
        // Если body ещё нет, ждём DOMContentLoaded
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            if (document.body && this.mutationObserver) {
              this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
              });
            }
          },
          { once: true },
        );
      }
    };
    startObserver();

    // Periodic check for media elements (for SPA navigation)
    this.findMediaInterval = setInterval(() => {
      if (!this.mediaElement) {
        this.findMediaElement();
      }
    }, 2000);
  }

  private findMediaElement(): void {
    // Сначала проверяем очередь перехваченных элементов — возможно, у них уже появился src
    for (let i = pendingMediaElements.length - 1; i >= 0; i--) {
      const pending = pendingMediaElements[i];
      if (hasValidSource(pending)) {
        pendingMediaElements.splice(i, 1);
        console.log(`[Content] Pending media element now has src:`, pending);
        this.attachToMedia(pending);
        return;
      }
    }

    // Используем текущий адаптер для поиска медиа-элемента
    const element = this.currentAdapter.findMedia();

    if (element && element !== this.mediaElement) {
      console.log(`[Content] Found media via ${this.currentAdapter.platform} adapter:`, element);
      this.attachToMedia(element);
    }
  }

  private attachToMedia(element: HTMLMediaElement): void {
    if (this.mediaElement === element) return;

    console.log('[Content] Attaching to media element:', element);
    this.mediaElement = element;
    this.originalPlaybackRate = element.playbackRate || 1;

    // Apply current state immediately
    this.applyPlaybackRate(this.state.speed);
    this.applyLoopMode(this.state.loopMode);

    // Initialize AudioWorklet for pitch/semitone/formant processing
    if (this.state.semitone !== 0 || this.state.pitch !== 0 || this.state.formant !== 0) {
      this.initAudioWorklet();
    }

    // Listen for play/pause to re-attach AudioContext
    element.addEventListener('play', () => {
      if (this.state.semitone !== 0 || this.state.pitch !== 0 || this.state.formant !== 0) {
        this.initAudioWorklet();
      }
    });

    // Send state update to service worker
    this.sendStateUpdate();
  }

  // --- AudioWorklet initialization ---

  private async initAudioWorklet(): Promise<void> {
    if (this.workletInitPromise) return this.workletInitPromise;

    this.workletInitPromise = this._initAudioWorklet();
    return this.workletInitPromise;
  }

  private async _initAudioWorklet(): Promise<void> {
    if (!this.mediaElement) return;

    try {
      // Create AudioContext if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Resume if suspended (autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const ctx = this.audioContext;

      // Create gain node
      if (!this.gainNode) {
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1;
        this.gainNode.connect(ctx.destination);
      }

      // Create source from media element
      if (!this.sourceNode) {
        this.sourceNode = ctx.createMediaElementSource(this.mediaElement);
      }

      // Load and register the Transpose (Rubberband WASM) worklet
      if (!this.isTpReady) {
        try {
          const tpUrl = chrome.runtime.getURL('aw-tp-processor.js');
          await ctx.audioWorklet.addModule(tpUrl);
          this.tpWorkletNode = new AudioWorkletNode(ctx, 'aw-tp-processor', {
            processorOptions: {
              wasmUrl: chrome.runtime.getURL('rb.wasm'),
            },
          });

          this.tpWorkletNode.port.onmessage = (event) => {
            if (event.data?.type === 'ready') {
              this.isTpReady = true;
              console.log('[Content] TP worklet ready');
              this.applyPitchState();
            }
          };

          // Connect: source -> tpWorklet -> gain -> destination
          this.sourceNode.disconnect();
          this.sourceNode.connect(this.tpWorkletNode);
          this.tpWorkletNode.connect(this.gainNode!);
        } catch (err) {
          console.warn('[Content] TP worklet not available, falling back to ST worklet:', err);
        }
      }

      // Load and register the SoundTouch worklet
      if (!this.isStReady) {
        try {
          const stUrl = chrome.runtime.getURL('aw-st-processor.js');
          await ctx.audioWorklet.addModule(stUrl);
          this.stWorkletNode = new AudioWorkletNode(ctx, 'aw-st-processor', {
            processorOptions: {},
          });

          this.stWorkletNode.port.onmessage = (event) => {
            if (event.data?.type === 'ready') {
              this.isStReady = true;
              console.log('[Content] ST worklet ready');
              this.applyPitchState();
            }
          };

          // If TP worklet wasn't loaded, connect source -> stWorklet -> gain
          if (!this.tpWorkletNode) {
            this.sourceNode!.disconnect();
            this.sourceNode!.connect(this.stWorkletNode);
            this.stWorkletNode.connect(this.gainNode!);
          }
        } catch (err) {
          console.warn('[Content] ST worklet not available:', err);
        }
      }

      this.applyPitchState();
    } catch (err) {
      logError('Content', 'AudioWorklet init failed', err);
      this.workletInitPromise = null;
    }
  }

  // --- Apply state to media element ---

  private applyPlaybackRate(speed: number): void {
    if (!this.mediaElement) return;

    // Clamp speed to reasonable range
    const clampedSpeed = Math.max(0.25, Math.min(16, speed));

    if (this.state.varispeed) {
      // Varispeed mode: change playback rate directly (affects pitch naturally)
      this.mediaElement.playbackRate = clampedSpeed;
    } else {
      // Normal mode: keep playback rate at 1, use AudioWorklet for pitch shifting
      this.mediaElement.playbackRate = clampedSpeed;
    }
  }

  private applyLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    if (!this.mediaElement) return;

    switch (mode) {
      case 'loop':
      case 'loop-one':
        this.mediaElement.loop = true;
        break;
      case 'off':
      default:
        this.mediaElement.loop = false;
        break;
    }
  }

  private applyPitchState(): void {
    // Send parameters to worklet nodes
    if (this.tpWorkletNode && this.isTpReady) {
      const semitone = this.state.semitone || 0;
      const pitch = this.state.pitch || 0;
      const formant = this.state.formant || 0;

      // TP worklet uses Rubberband WASM for high-quality pitch shifting
      this.tpWorkletNode.port.postMessage({
        type: 'set-params',
        semitone,
        pitch,
        formant,
        speed: this.state.speed,
        enabled: semitone !== 0 || pitch !== 0 || formant !== 0 || this.state.speed !== 1,
      });
    }

    if (this.stWorkletNode && this.isStReady) {
      const semitone = this.state.semitone || 0;
      const pitch = this.state.pitch || 0;

      this.stWorkletNode.port.postMessage({
        type: 'set-params',
        semitone,
        pitch,
        enabled: semitone !== 0 || pitch !== 0,
      });
    }
  }

  // --- Public API ---

  setSpeed(speed: number): void {
    this.state.speed = speed;
    this.applyPlaybackRate(speed);
    this.sendStateUpdate();
  }

  setSemitone(semitone: number): void {
    this.state.semitone = semitone;
    if (semitone !== 0) {
      this.initAudioWorklet();
    }
    this.applyPitchState();
    this.sendStateUpdate();
  }

  setPitch(pitch: number): void {
    this.state.pitch = pitch;
    if (pitch !== 0) {
      this.initAudioWorklet();
    }
    this.applyPitchState();
    this.sendStateUpdate();
  }

  setFormant(formant: number): void {
    this.state.formant = formant;
    if (formant !== 0) {
      this.initAudioWorklet();
    }
    this.applyPitchState();
    this.sendStateUpdate();
  }

  setLoopMode(mode: 'off' | 'loop' | 'loop-one'): void {
    this.state.loopMode = mode;
    this.applyLoopMode(mode);
    this.sendStateUpdate();
  }

  setVarispeed(enabled: boolean): void {
    this.state.varispeed = enabled;
    this.applyPlaybackRate(this.state.speed);
    this.sendStateUpdate();
  }

  setEqEnabled(enabled: boolean): void {
    this.state.eqEnabled = enabled;
    this.sendStateUpdate();
  }

  getState(): AudioEngineState {
    return { ...this.state };
  }

  private sendStateUpdate(): void {
    try {
      chrome.runtime.sendMessage({
        sender: 'content',
        command: 'set-from-content',
        speed: this.state.speed,
        semitone: this.state.semitone,
        pitch: this.state.pitch,
        formant: this.state.formant,
        loopMode: this.state.loopMode,
        varispeed: this.state.varispeed,
        eqEnabled: this.state.eqEnabled,
      });
    } catch {
      /* ignore */
    }
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
    } catch {
      /* ignore */
    }

    try {
      this.audioContext?.close();
    } catch {
      /* ignore */
    }

    this.mediaElement = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.tpWorkletNode = null;
    this.stWorkletNode = null;
    this.gainNode = null;
    this.workletInitPromise = null;

    // Сбрасываем перехват создания медиа-элементов
    onMediaElementCreated = null;
  }
}

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
