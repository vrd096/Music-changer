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
 * Проверяет, является ли src элемента URL самой страницы (не аудио).
 * Некоторые расширения (Vibes Fast) создают <audio> с src=window.location.href
 * для перехвата аудио через AudioContext. Такие элементы нужно пропускать.
 */
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

/**
 * Проверяет, активен ли на странице Vibes Fast (или подобное расширение).
 * Определяем по наличию proxy audio элементов с src=URL страницы.
 */
function isVibesFastActive(): boolean {
  const audios = document.querySelectorAll<HTMLAudioElement>('audio');
  for (const audio of audios) {
    if (isPageUrlAsSrc(audio)) return true;
  }
  return false;
}

/**
 * Геттер для audioEngine с отложенным доступом.
 */
function getAudioEngine(): AudioEngine | null {
  return (window as any).___tp_audioEngine || null;
}

/**
 * Для Beatport: отслеживает элемент audio, созданный Vibes Fast,
 * перехватывает URL трека и воспроизводит через fetch + decodeAudioData.
 *
 * Vibes Fast полностью захватывает элемент (full capture) через
 * createMediaElementSource. Когда src меняется на geo-samples.beatport.com
 * (кросс-доменный), браузер мутирует звук из-за CORS (CORS muting).
 *
 * Решение:
 * 1. Добавляем CORS-заголовки через declarativeNetRequest (rules.json)
 * 2. Воспроизводим аудио через fetch + decodeAudioData + AudioBufferSourceNode
 *    на раннем AudioContext (созданном в IIFE до Vibes Fast)
 * 3. Контролируем скорость через playbackRate на AudioBufferSourceNode
 */
function watchBeatportElement(el: HTMLMediaElement): void {
  let urlDetected = false;
  let _preparingBeatport = false;
  const engine = getAudioEngine();

  // Устанавливаем crossOrigin = "anonymous" на элементе ДО того,
  // как Vibes Fast вызовет createMediaElementSource.
  // Это помогает избежать CORS muting при смене src на кросс-доменный URL.
  try {
    el.crossOrigin = 'anonymous';
  } catch {}

  /**
   * Сбрасывает состояние при смене трека (next/prev на Beatport).
   * Когда src элемента меняется на новый URL, нам нужно:
   * 1. Сбросить _preparingBeatport, чтобы новый play сработал
   * 2. Остановить старый буфер
   * 3. Сбросить закешированный буфер в AudioEngine
   * 4. Снова заглушить элемент, чтобы не было "заикания" пока
   *    загружается новый трек
   */
  const onTrackChange = () => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com')) {
      console.log('[Content] Beatport: track change detected, src:', src);
      _preparingBeatport = false;
      // Глушим элемент сразу при смене трека, чтобы новый трек
      // не начал играть через нативный аудио-выход до того, как
      // наш AudioBufferSourceNode будет готов
      try {
        el.volume = 0;
        el.muted = true;
      } catch {}
      if (engine) {
        engine.resetBeatportState();
      }
    }
  };

  // Слушатели play/playing/pause устанавливаем ДО обнаружения URL,
  // чтобы успеть перехватить воспроизведение.
  // Когда Vibes Fast начинает воспроизведение, он вызывает el.play().
  // Наш слушатель срабатывает, и мы запускаем fetch+decodeAudioData.
  //
  // ВАЖНО: используем флаг _preparingBeatport, чтобы избежать двойного
  // вызова prepareBeatportAudio (play + playing срабатывают оба).
  const onPlay = () => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';
    if (src.includes('geo-samples.beatport.com') && engine && !_preparingBeatport) {
      _preparingBeatport = true;
      console.log('[Content] Beatport play detected, preparing audio:', src);
      engine.prepareBeatportAudio(src);
    }
  };
  const onPause = () => {
    if (engine) {
      console.log('[Content] Beatport pause detected');
      engine.pauseBeatportPlayback();
      // Сбрасываем флаг, чтобы при следующем play можно было снова запустить трек
      _preparingBeatport = false;
    }
  };

  // Слушатель seeked — когда пользователь кликает на прогресс-бар Beatport,
  // оригинальный элемент audio меняет currentTime.
  // Нам нужно пересоздать AudioBufferSourceNode с новой позиции.
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

  // Слушаем loadstart для обнаружения смены трека.
  // Когда Beatport переключает трек (next/prev), src элемента меняется,
  // и браузер генерирует loadstart.
  el.addEventListener('loadstart', onTrackChange);

  // Ждём появления src, затем привязываем элемент
  const interval = setInterval(() => {
    const src = el.src || el.currentSrc || el.getAttribute('src') || '';

    if (src.includes('geo-samples.beatport.com') && !urlDetected) {
      urlDetected = true;
      clearInterval(interval);
      console.log('[Content] Beatport watch: Detected real audio URL:', src);

      // Привязываем элемент к AudioEngine с skipAudioWorklet=true,
      // так как Vibes Fast уже управляет аудио-графом.
      // Мы только контролируем playbackRate через hijackPlaybackRate.
      if (engine) {
        engine.attachToMedia(el, true);
      }
    }
  }, 200);

  // Очищаем интервал через 30 секунд, если URL так и не появился
  setTimeout(() => {
    clearInterval(interval);
    if (!urlDetected) {
      console.log('[Content] Beatport watch: timeout, no URL detected');
    }
  }, 30000);
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

  // Если элемент уже загружен (readyState >= HAVE_CURRENT_DATA) — подключаемся сразу
  // YouTube использует srcObject (MediaStream) и readyState может быть > 0 даже без src
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
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
  // Для YouTube видео может уже быть в DOM с готовым контентом — проверяем каждую секунду
  let attempts = 0;
  const checkInterval = setInterval(() => {
    attempts++;
    if (hasValidSource(el) || el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      clearInterval(checkInterval);
      el.removeEventListener('loadstart', onLoadStart);
      el.removeEventListener('loadedmetadata', onMeta);
      callback(el);
    } else if (attempts >= 10) {
      // 10 секунд прошло — сдаёмся, но всё равно пробуем подключиться
      clearInterval(checkInterval);
      el.removeEventListener('loadstart', onLoadStart);
      el.removeEventListener('loadedmetadata', onMeta);
      if (hasValidSource(el)) {
        callback(el);
      }
    }
  }, 1000);
}

const isBeatport = window.location.href.includes('beatport.com');

(function patchCreateElement(): void {
  const originalCreateElement = document.createElement.bind(document);
  const originalAudio = window.Audio;

  // Сохраняем оригинальный дескриптор playbackRate из прототипа ДО того,
  // как Vibes Fast загрузится и переопределит его.
  // Используется в hijackPlaybackRate для гарантии, что мы вызываем
  // настоящий нативный setter, а не перехваченный Vibes Fast.
  const nativePlaybackRateDescriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'playbackRate',
  );
  (window as any).___tp_nativePlaybackRateDescriptor = nativePlaybackRateDescriptor;

  // ============================================================
  // Перехватываем AudioContext.prototype.createMediaElementSource
  // на ВСЕХ AudioContext (включая тот, что создаёт Vibes Fast),
  // чтобы вернуть заглушку (dummy source), которая не подключается
  // к destination. Это предотвращает воспроизведение аудио через
  // граф Vibes Fast, когда мы используем параллельный
  // AudioBufferSourceNode (например, на Beatport).
  //
  // Проблема: _muteOriginalElement() устанавливает volume=0 на
  // элементе, но createMediaElementSource перенаправляет аудио
  // в Web Audio граф, где volume элемента не действует.
  //
  // Решение: перехватываем createMediaElementSource и возвращаем
  // dummy-ноду, которая не подключена к destination. Vibes Fast
  // думает, что захватил элемент, но звука нет.
  //
  // Для платформ, где мы НЕ используем параллельный AudioBufferSourceNode
  // (SoundCloud, YouTube, junodownload), этот перехват НЕ включаем,
  // так как там мы полагаемся на граф Vibes Fast для воспроизведения.
  // ============================================================
  const originalCreateMediaElementSource = AudioContext.prototype.createMediaElementSource.bind(
    AudioContext.prototype,
  );

  // Создаём dummy AudioContext для создания заглушек
  let dummyCtx: AudioContext | null = null;
  try {
    dummyCtx = new AudioContext();
  } catch {}

  AudioContext.prototype.createMediaElementSource = function (
    this: AudioContext,
    element: HTMLMediaElement,
  ): MediaElementAudioSourceNode {
    // Для Beatport: возвращаем заглушку, чтобы Vibes Fast не захватил звук
    if (isBeatport && dummyCtx) {
      console.log(
        '[Content] Intercepted createMediaElementSource for Beatport, returning dummy source',
      );
      // Создаём реальный MediaElementAudioSourceNode, но на dummy-контексте
      // и НЕ подключаем его к destination. Vibes Fast получит ноду,
      // но звук никуда не пойдёт.
      const dummySource = originalCreateMediaElementSource.call(dummyCtx, element);
      // Не подключаем dummySource к dummyCtx.destination — звука не будет
      return dummySource;
    }
    // Для всех остальных платформ — стандартное поведение
    return originalCreateMediaElementSource.call(this, element);
  };
  // ============================================================

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

  // Перехватываем new Audio() — НЕ для Beatport, т.к. Vibes Fast тоже патентует Audio
  // и это приводит к конфликтам
  if (originalAudio && !isBeatport) {
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

  // Создаём ранний AudioContext ДО загрузки Vibes Fast,
  // чтобы Vibes Fast не перехватил его.
  // Это нужно для ВСЕХ платформ (SoundCloud, YouTube и т.д.),
  // так как Vibes Fast может быть активен на любом сайте.
  try {
    const earlyCtx = new AudioContext();
    (window as any).___tp_earlyContext = earlyCtx;
    console.log('[Content] Created early AudioContext before Vibes Fast');
  } catch (err) {
    console.warn('[Content] Failed to create early AudioContext:', err);
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
 * YouTube adapter.
 * YouTube использует <video> с классами video-stream или html5-main-video.
 * Видео может находиться в Shadow DOM, поэтому ищем через querySelectorAll.
 * Оригинальный Transpose проверяет host на наличие "youtu".
 */
class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'YouTube';

  canHandle(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  findMedia(): HTMLMediaElement | null {
    // YouTube использует video с классами video-stream или html5-main-video
    const videos = document.querySelectorAll<HTMLVideoElement>(
      'video.video-stream, video.html5-main-video',
    );
    if (videos.length > 0) {
      // Выбираем видео с наибольшей площадью (основное, не реклама)
      let best: HTMLVideoElement | null = null;
      let bestArea = 0;
      for (const v of videos) {
        // Пропускаем рекламу
        if (v.classList.contains('ad-showing') || v.closest('.ad-container')) continue;
        const rect = v.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = v;
        }
      }
      if (best) return best;
      return videos[0];
    }

    // Fallback: ищем все video на странице
    const allVideos = document.querySelectorAll<HTMLVideoElement>('video');
    if (allVideos.length > 0) {
      let best: HTMLVideoElement | null = null;
      let bestArea = 0;
      for (const v of allVideos) {
        const rect = v.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = v;
        }
      }
      return best;
    }

    return null;
  }

  containsPlayableMedia(): boolean {
    return !!document.querySelector('video.video-stream, video.html5-main-video, video');
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
 * Адаптер для beatport.com.
 * На Beatport audio создаётся расширением Vibes Fast, а не самим сайтом.
 * Мы не ищем audio через DOM — вместо этого используем watchBeatportElement
 * для перехвата элемента, созданного Vibes Fast.
 */
class BeatportAdapter implements PlatformAdapter {
  readonly platform = 'Beatport';

  canHandle(url: string): boolean {
    return url.includes('beatport.com');
  }

  findMedia(): HTMLMediaElement | null {
    // На Beatport audio элементы создаются Vibes Fast и не добавляются в DOM.
    // Мы полагаемся на patchCreateElement + watchBeatportElement.
    return null;
  }

  containsPlayableMedia(): boolean {
    // Beatport всегда содержит playable media, если это страница трека
    return true;
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
      new YouTubeAdapter(),
      new SoundCloudAdapter(),
      new JunoDownloadAdapter(),
      new BeatportAdapter(),
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

  private skipAudioWorklet = false;

  // --- Beatport-specific fields ---
  private bufferSource: AudioBufferSourceNode | null = null;
  private _beatportAudioBuffer: AudioBuffer | null = null;
  private _pendingStartRequest: boolean = false;
  private _beatportStartOffset: number = 0;
  private _beatportStartTime: number = 0;
  private _lastKnownSrc: string = '';
  private _isBufferPlaying: boolean = false;
  private _isBeatportSeeking: boolean = false;

  constructor() {
    this.adapterManager = new AdapterManager();
    this.currentAdapter = this.adapterManager.getAdapter();
    console.log(`[Content] Platform adapter: ${this.currentAdapter.platform}`);

    // Подписываемся на перехват создания медиа-элементов (для SoundCloud и других SPA)
    /**
     * Проверяет, является ли медиа-элемент YouTube звуковым эффектом.
     * YouTube создаёт <audio> для звуков навигации, поиска и т.д.
     * Их нужно пропускать, чтобы не привязаться к ним вместо основного видео.
     *
     * el.src возвращает абсолютный URL (https://www.youtube.com/s/search/audio/...),
     * поэтому проверяем и el.getAttribute('src') (оригинальный атрибут).
     */
    const isYouTubeSoundEffect = (el: HTMLMediaElement): boolean => {
      if (!(el instanceof HTMLAudioElement)) return false;
      const srcAttr = el.getAttribute('src') || '';
      const srcProp = el.src || '';
      return srcAttr.includes('/s/search/audio/') || srcProp.includes('/s/search/audio/');
    };

    onMediaElementCreated = (el: HTMLMediaElement) => {
      // Для Beatport: перехватываем playbackRate и запускаем watchBeatportElement
      if (isBeatport) {
        console.log('[Content] Beatport: Intercepted audio element creation, starting watch');
        // Перехватываем playbackRate на элементе СРАЗУ после создания,
        // чтобы мы могли контролировать скорость через Vibes Fast.
        // Vibes Fast полностью захватывает элемент (full capture) через
        // createMediaElementSource. Когда src меняется на кросс-доменный URL,
        // браузер мутирует звук (CORS muting).
        //
        // Решение:
        // 1. Добавляем CORS-заголовки через declarativeNetRequest (rules.json)
        // 2. Воспроизводим аудио через fetch + decodeAudioData + AudioBufferSourceNode
        //    на раннем AudioContext (созданном в IIFE до Vibes Fast)
        // 3. Контролируем скорость через playbackRate на AudioBufferSourceNode
        //
        // Глушим элемент СРАЗУ при создании, чтобы предотвратить "заикание"
        // (доли секунды звука из оригинального элемента до того, как наш
        // AudioBufferSourceNode будет готов к воспроизведению).
        try {
          el.volume = 0;
          el.muted = true;
        } catch {}
        this.hijackPlaybackRate(el, this.state.speed);
        watchBeatportElement(el);
        return;
      }

      if (this.mediaElement) return; // уже есть элемент

      // Пропускаем YouTube звуковые эффекты
      if (isYouTubeSoundEffect(el)) {
        console.log(`[Content] Skipping YouTube sound effect (intercepted):`, el);
        return;
      }

      // Перехватываем playbackRate на элементе СРАЗУ после создания,
      // ДО того как Vibes Fast успеет установить свой перехват.
      // Это гарантирует, что наше значение playbackRate не сбрасывается.
      this.hijackPlaybackRate(el, this.state.speed);

      // Если у элемента уже есть src — подключаемся
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
          // Повторная проверка: YouTube звуковой эффект?
          if (isYouTubeSoundEffect(readyEl)) {
            console.log(`[Content] Skipping YouTube sound effect (after wait):`, readyEl.src);
            return;
          }
          console.log(`[Content] Media element now has src:`, readyEl);
          this.attachToMedia(readyEl);
        }
      });
    };

    // Для Beatport не запускаем initMediaDetection — audio элементы не в DOM
    if (!isBeatport) {
      this.initMediaDetection();
    }

    // Для YouTube и других платформ, где видео создаётся через Polymer
    // (не через document.createElement), делаем дополнительный поиск
    // с задержкой, чтобы дать странице время инициализировать плеер.
    if (!isBeatport) {
      setTimeout(() => {
        if (!this.mediaElement) {
          console.log(`[Content] Delayed media search for ${this.currentAdapter.platform}...`);
          this.findMediaElement();
        }
      }, 500);
    }
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
      // Перехватываем playbackRate на найденном элементе ДО attachToMedia,
      // чтобы гарантировать, что наше значение не сбрасывается Vibes Fast
      this.hijackPlaybackRate(element, this.state.speed);
      this.attachToMedia(element);
    }
  }

  public attachToMedia(element: HTMLMediaElement, skipAudioWorklet = false): void {
    if (this.mediaElement === element) return;

    console.log('[Content] Attaching to media element:', element, { skipAudioWorklet });
    this.mediaElement = element;
    this.skipAudioWorklet = skipAudioWorklet;
    this.originalPlaybackRate = element.playbackRate || 1;

    // Apply current state immediately
    // Если skipAudioWorklet=true — не трогаем playbackRate и loop,
    // так как элемент уже используется другим AudioContext (Vibes Fast)
    if (!skipAudioWorklet) {
      this.applyPlaybackRate(this.state.speed);
      this.applyLoopMode(this.state.loopMode);
    }

    // Initialize AudioWorklet for pitch/semitone/formant/speed processing
    // Пропускаем, если skipAudioWorklet=true
    // Инициализируем worklet если есть изменения в pitch/semitone/formant ИЛИ speed !== 1
    const needsWorklet =
      this.state.semitone !== 0 ||
      this.state.pitch !== 0 ||
      this.state.formant !== 0 ||
      this.state.speed !== 1;

    if (!skipAudioWorklet && needsWorklet) {
      this.initAudioWorklet();
    }

    // Listen for play/pause to re-attach AudioContext
    // Не добавляем слушатель, если skipAudioWorklet=true
    if (!skipAudioWorklet) {
      element.addEventListener('play', () => {
        if (needsWorklet) {
          this.initAudioWorklet();
        }
        // Переустанавливаем playbackRate при каждом play,
        // так как Vibes Fast может сбросить его
        this.applyPlaybackRate(this.state.speed);
      });
    }

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
      // Проверяем доступность chrome.runtime.getURL ДО создания gainNode.
      // На некоторых сайтах (junodownload.com) chrome.runtime может быть undefined
      // из-за CSP. В этом случае worklet'ы недоступны, используем playbackRate.
      // НЕ создаём gainNode и не подключаем его к destination, так как это
      // нарушает аудио-граф Vibes Fast (который уже захватил элемент через
      // createMediaElementSource) и приводит к остановке воспроизведения.
      const runtimeGetUrl =
        typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
          ? chrome.runtime.getURL.bind(chrome.runtime)
          : null;

      if (!runtimeGetUrl) {
        console.warn('[Content] chrome.runtime.getURL not available, worklets disabled');
        return;
      }

      // Create AudioContext if needed
      if (!this.audioContext) {
        // Используем ранний контекст (созданный в IIFE до Vibes Fast),
        // чтобы Vibes Fast не перехватил AudioContext
        const earlyCtx = (window as any).___tp_earlyContext;
        if (earlyCtx) {
          this.audioContext = earlyCtx;
          console.log('[Content] Using early AudioContext for worklet');
        } else {
          this.audioContext = new AudioContext();
        }
      }

      // Resume if suspended (autoplay policy)
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const ctx = this.audioContext;
      if (!ctx) return;

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
          const tpUrl = runtimeGetUrl('aw-tp-processor.js');
          await ctx.audioWorklet.addModule(tpUrl);
          this.tpWorkletNode = new AudioWorkletNode(ctx, 'aw-tp-processor', {
            processorOptions: {
              wasmUrl: runtimeGetUrl('rb.wasm'),
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
          const stUrl = runtimeGetUrl('aw-st-processor.js');
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

  /**
   * Перехватывает setter playbackRate на элементе, чтобы гарантировать,
   * что наше значение не сбрасывается другими расширениями (Vibes Fast).
   * Использует Object.defineProperty на самом экземпляре элемента.
   */
  private hijackPlaybackRate(el: HTMLMediaElement, speed: number): void {
    const clampedSpeed = Math.max(0.25, Math.min(16, speed));

    // Если мы уже перехватили этот элемент — просто обновляем значение
    if ((el as any).__tp_playbackRateHijacked) {
      (el as any).__tp_playbackRateValue = clampedSpeed;
      // Пробуем установить напрямую (может не сработать из-за Vibes Fast)
      try {
        el.playbackRate = clampedSpeed;
      } catch {}
      return;
    }

    // Используем оригинальный нативный дескриптор, сохранённый в IIFE
    // ДО загрузки Vibes Fast. Это гарантирует, что мы вызываем
    // настоящий нативный setter, а не перехваченный Vibes Fast.
    const nativeDescriptor = (window as any).___tp_nativePlaybackRateDescriptor as
      | PropertyDescriptor
      | undefined;

    (el as any).__tp_playbackRateHijacked = true;
    (el as any).__tp_playbackRateValue = clampedSpeed;

    // Перехватываем playbackRate на этом элементе
    Object.defineProperty(el, 'playbackRate', {
      get(): number {
        return (this as any).__tp_playbackRateValue ?? 1;
      },
      set(value: number) {
        // Сохраняем наше значение
        (this as any).__tp_playbackRateValue = value;
        // Пробуем вызвать оригинальный нативный setter (не перехваченный Vibes Fast)
        if (nativeDescriptor?.set) {
          nativeDescriptor.set.call(this, value);
        }
      },
      configurable: true,
      enumerable: true,
    });

    // Устанавливаем начальное значение
    try {
      el.playbackRate = clampedSpeed;
    } catch {}
  }

  private applyPlaybackRate(speed: number): void {
    if (!this.mediaElement) return;

    // Clamp speed to reasonable range
    const clampedSpeed = Math.max(0.25, Math.min(16, speed));

    if (this.state.varispeed) {
      // Varispeed mode: change playback rate directly (affects pitch naturally)
      this.mediaElement.playbackRate = clampedSpeed;
    } else {
      // Normal mode: keep playback rate at clampedSpeed, use AudioWorklet for pitch shifting
      this.mediaElement.playbackRate = clampedSpeed;
    }

    // Send speed to worklet if initialized
    this.applyPitchState();

    // Vibes Fast может перехватывать setter playbackRate и сбрасывать его.
    // Используем hijackPlaybackRate для гарантии, что наше значение остаётся.
    if (this.mediaElement) {
      this.hijackPlaybackRate(this.mediaElement, speed);
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
      const speed = this.state.speed || 1;

      this.stWorkletNode.port.postMessage({
        type: 'set-params',
        semitone,
        pitch,
        speed,
        enabled: semitone !== 0 || pitch !== 0 || speed !== 1,
      });
    }
  }

  // --- Public API ---

  setSpeed(speed: number): void {
    this.state.speed = speed;
    this.applyPlaybackRate(speed);

    // Проверяем, доступны ли AudioWorklet'ы на этом сайте.
    // На некоторых сайтах (junodownload.com) chrome.runtime.getURL заблокирован CSP,
    // поэтому worklet'ы не могут загрузиться. В этом случае полагаемся только
    // на playbackRate через hijackPlaybackRate.
    const runtimeGetUrl =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
        ? chrome.runtime.getURL.bind(chrome.runtime)
        : null;
    const workletsAvailable = runtimeGetUrl !== null;

    // Инициализируем worklet если скорость изменилась (для YouTube и других платформ,
    // где playbackRate может игнорироваться).
    // НЕ вызываем initAudioWorklet если worklet'ы недоступны — создание gainNode
    // и подключение к ctx.destination без sourceNode нарушает аудио-граф Vibes Fast,
    // что приводит к остановке воспроизведения на junodownload.com.
    if (speed !== 1 && !this.skipAudioWorklet && workletsAvailable) {
      this.initAudioWorklet();
    }
    this.applyPitchState();
    this.sendStateUpdate();

    // Для Beatport: обновляем playbackRate на AudioBufferSourceNode
    if (isBeatport && this.bufferSource && this._isBufferPlaying) {
      const clampedSpeed = Math.max(0.25, Math.min(16, speed));
      this.bufferSource.playbackRate.value = clampedSpeed;
      console.log('[Content] Beatport: updated buffer source speed to:', clampedSpeed);
    }

    // Vibes Fast может сбросить playbackRate после нашей установки.
    // Переустанавливаем с небольшой задержкой для надёжности.
    // Используем множественные попытки с увеличивающейся задержкой,
    // чтобы гарантировать, что наше значение остаётся.
    if (this.mediaElement) {
      const delays = [100, 300, 800, 2000];
      for (const delay of delays) {
        setTimeout(() => {
          if (this.mediaElement && this.state.speed === speed) {
            // Переустанавливаем hijackPlaybackRate, т.к. Vibes Fast мог перезаписать
            // наш Object.defineProperty на экземпляре элемента
            this.hijackPlaybackRate(this.mediaElement, speed);
            this.mediaElement.playbackRate = Math.max(0.25, Math.min(16, speed));
          }
        }, delay);
      }
    }
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

  // --- Beatport-specific methods ---

  /**
   * Загружает аудио с geo-samples.beatport.com через fetch + decodeAudioData
   * и воспроизводит через AudioBufferSourceNode на раннем AudioContext.
   * CORS-заголовки добавляются через declarativeNetRequest (rules.json).
   */
  public prepareBeatportAudio(url: string): void {
    // Если это тот же URL и буфер уже загружен — просто возобновляем воспроизведение
    // с сохранённой позиции (offset), не перезапрашивая fetch.
    if (this._lastKnownSrc === url && this._beatportAudioBuffer) {
      console.log('[Content] Beatport: resuming playback from offset:', this._beatportStartOffset);
      this.startBeatportPlayback();
      return;
    }

    // Если это новый URL — сбрасываем offset и останавливаем старый буфер,
    // так как начинаем новый трек
    if (this._lastKnownSrc !== url) {
      console.log('[Content] Beatport: new track URL detected, stopping old buffer');
      this._beatportStartOffset = 0;
      // Останавливаем старый буфер немедленно, чтобы старый трек не продолжал играть
      // пока загружается новый
      this.stopBeatportPlayback();
      this._beatportAudioBuffer = null;
    }
    this._lastKnownSrc = url;

    console.log('[Content] Beatport: preparing audio from:', url);

    // Заглушаем оригинальный элемент Vibes Fast, чтобы не было двойного звука.
    // Vibes Fast воспроизводит аудио через createMediaElementSource,
    // а мы запускаем параллельный AudioBufferSourceNode.
    // Устанавливаем volume=0 и muted=true на элементе, чтобы заглушить Vibes Fast.
    this._muteOriginalElement();

    // Используем ранний AudioContext (созданный в IIFE до Vibes Fast)
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx) {
      console.warn('[Content] Beatport: no early AudioContext available');
      return;
    }

    // Resume if suspended
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err) => {
        console.warn('[Content] Beatport: failed to resume context:', err);
      });
    }

    // Fetch audio data
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        return ctx.decodeAudioData(arrayBuffer);
      })
      .then((audioBuffer) => {
        console.log('[Content] Beatport: decoded audio buffer, duration:', audioBuffer.duration);
        this._beatportAudioBuffer = audioBuffer;
        this.startBeatportPlayback();
      })
      .catch((err) => {
        console.warn('[Content] Beatport: fetch/decode failed:', err);
        // Fallback: пробуем XHR если fetch не сработал
        this._fetchBeatportAudioXHR(url);
      });
  }

  private _fetchBeatportAudioXHR(url: string): void {
    console.log('[Content] Beatport: trying XHR fallback for:', url);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
        if (!ctx) return;

        ctx
          .decodeAudioData(xhr.response)
          .then((audioBuffer) => {
            console.log('[Content] Beatport: XHR decoded audio buffer');
            this._beatportAudioBuffer = audioBuffer;
            this.startBeatportPlayback();
          })
          .catch((decodeErr) => {
            console.warn('[Content] Beatport: XHR decode failed:', decodeErr);
          });
      } else {
        console.warn('[Content] Beatport: XHR failed with status:', xhr.status);
      }
    };

    xhr.onerror = () => {
      console.warn('[Content] Beatport: XHR error');
    };

    xhr.send();
  }

  private startBeatportPlayback(): void {
    const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
    if (!ctx || !this._beatportAudioBuffer) {
      console.warn('[Content] Beatport: cannot start playback, no context or buffer');
      return;
    }

    // Останавливаем предыдущий источник, если есть
    this.stopBeatportPlayback();

    // Создаём новый источник
    const source = ctx.createBufferSource();
    source.buffer = this._beatportAudioBuffer;

    // Применяем текущую скорость
    const speed = this.state.speed || 1;
    source.playbackRate.value = Math.max(0.25, Math.min(16, speed));

    // Подключаем к destination напрямую (без worklet'ов, так как Vibes Fast
    // уже управляет основным аудио-графом, а мы создаём параллельный поток)
    source.connect(ctx.destination);

    // Запоминаем время старта для возможной паузы.
    // Используем сохранённый _beatportStartOffset, чтобы при возобновлении
    // после паузы трек продолжился с того же места, а не с начала.
    this._beatportStartTime = ctx.currentTime;

    const offset = Math.max(0, this._beatportStartOffset);
    const duration = this._beatportAudioBuffer.duration;
    // Если offset превышает длительность трека, начинаем с начала
    const startOffset = offset >= duration ? 0 : offset;

    console.log(
      '[Content] Beatport: starting playback at offset:',
      startOffset,
      '/ duration:',
      duration,
    );

    source.start(0, startOffset);
    this.bufferSource = source;
    this._isBufferPlaying = true;

    console.log('[Content] Beatport: playback started with speed:', speed);

    // Обработка окончания воспроизведения
    source.onended = () => {
      console.log('[Content] Beatport: playback ended');
      // Если мы в процессе seek — не сбрасываем флаги,
      // так как новый источник уже создан и управляется отдельно
      if (this._isBeatportSeeking) {
        console.log('[Content] Beatport: ignoring ended during seek');
        return;
      }
      this._isBufferPlaying = false;
      this.bufferSource = null;
    };
  }

  private stopBeatportPlayback(): void {
    if (this.bufferSource) {
      // ВАЖНО: очищаем onended ДО вызова stop(), чтобы prevent
      // асинхронного срабатывания onended после того, как мы уже
      // создали новый источник (при seek). Иначе старый onended
      // сбросит _isBufferPlaying и bufferSource нового источника.
      this.bufferSource.onended = null;
      try {
        this.bufferSource.stop();
        this.bufferSource.disconnect();
      } catch {
        /* ignore */
      }
      this.bufferSource = null;
      this._isBufferPlaying = false;
    }
  }

  public pauseBeatportPlayback(): void {
    if (this.bufferSource && this._isBufferPlaying) {
      const ctx = (window as any).___tp_earlyContext as AudioContext | undefined;
      if (ctx) {
        this._beatportStartOffset += ctx.currentTime - this._beatportStartTime;
      }
      this.stopBeatportPlayback();
      console.log('[Content] Beatport: playback paused');
    }
  }

  /**
   * Обрабатывает seek на Beatport — пересоздаёт AudioBufferSourceNode
   * с новой позиции, когда пользователь кликает на прогресс-бар.
   */
  public seekBeatportPlayback(newTime: number): void {
    if (!this._beatportAudioBuffer) {
      console.warn('[Content] Beatport: cannot seek, no audio buffer loaded');
      return;
    }

    // Обновляем offset до новой позиции
    this._beatportStartOffset = Math.max(0, Math.min(newTime, this._beatportAudioBuffer.duration));

    // Если буфер сейчас играет — пересоздаём источник с новой позиции
    if (this._isBufferPlaying) {
      console.log('[Content] Beatport: seeking to:', this._beatportStartOffset);
      // Устанавливаем флаг seek, чтобы onended от старого источника
      // не сбросил флаги нового источника
      this._isBeatportSeeking = true;
      this.startBeatportPlayback();
      this._isBeatportSeeking = false;
    }
    // Если буфер на паузе — просто обновляем offset,
    // при следующем play воспроизведение начнётся с новой позиции
  }

  /**
   * Возвращает true, если Beatport буфер в данный момент воспроизводится.
   */
  public isBeatportBufferPlaying(): boolean {
    return this._isBufferPlaying;
  }

  /**
   * Сбрасывает состояние Beatport при смене трека (next/prev).
   * Останавливает текущее воспроизведение и очищает закешированный буфер,
   * чтобы при новом play загрузился актуальный трек.
   */
  public resetBeatportState(): void {
    console.log('[Content] Beatport: resetting state for track change');
    this.stopBeatportPlayback();
    this._beatportAudioBuffer = null;
    this._lastKnownSrc = '';
    this._beatportStartOffset = 0;
    this._beatportStartTime = 0;
    this._isBeatportSeeking = false;
  }

  /**
   * Заглушает оригинальный элемент audio, созданный Vibes Fast,
   * чтобы избежать двойного воспроизведения (наш AudioBufferSourceNode
   * + звук через граф Vibes Fast).
   *
   * Устанавливаем volume=0 и muted=true на элементе.
   * Также перехватываем setter volume через Object.defineProperty,
   * чтобы Vibes Fast не смог вернуть звук.
   */
  private _muteOriginalElement(): void {
    if (!this.mediaElement) return;

    // Устанавливаем volume=0 и muted=true
    try {
      this.mediaElement.volume = 0;
      this.mediaElement.muted = true;
    } catch {}

    // Перехватываем setter volume, чтобы Vibes Fast не смог его восстановить
    try {
      Object.defineProperty(this.mediaElement, 'volume', {
        get(): number {
          return 0;
        },
        set(_value: number) {
          // Игнорируем любые попытки установить volume
          // Наш AudioBufferSourceNode управляет звуком
        },
        configurable: true,
      });
    } catch {}

    console.log('[Content] Beatport: muted original Vibes Fast element');
  }

  getState(): AudioEngineState {
    return { ...this.state };
  }

  // --- State update ---

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
      // Не закрываем ранний контекст (созданный в IIFE), если он используется
      const earlyCtx = (window as any).___tp_earlyContext;
      if (this.audioContext && this.audioContext !== earlyCtx) {
        this.audioContext.close();
      }
    } catch {
      /* ignore */
    }

    // Останавливаем Beatport playback
    this.stopBeatportPlayback();

    this.mediaElement = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.tpWorkletNode = null;
    this.stWorkletNode = null;
    this.gainNode = null;
    this.workletInitPromise = null;

    // Сбрасываем Beatport-специфичные поля
    this.bufferSource = null;
    this._beatportAudioBuffer = null;
    this._pendingStartRequest = false;
    this._beatportStartOffset = 0;
    this._beatportStartTime = 0;
    this._lastKnownSrc = '';
    this._isBufferPlaying = false;

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
