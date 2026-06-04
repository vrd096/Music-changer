# Universal Audio Interception — Design Spec

**Date:** 2026-06-02  
**Status:** Approved — ready for implementation  
**Scope:** Chrome Extension «Music Pitch Changer» v6.4.0 — рефакторинг аудио-перехвата

---

## 1. Problem Statement

Текущий [`AudioEngine`](../../src/content/audio-engine.ts) (~900 строк) содержит платформо-специфичную логику, перемешанную с универсальным аудиопроцессингом. Каждый новый сайт требует ручного добавления кода. Невозможно масштабировать.

**Конкретные проблемы:**

- **SoundCloud:** `createMediaElementSource` падает (элемент уже занят) → только playbackRate, нет pitch shifting
- **Beatport:** ~300 строк спецкода только для одной платформы
- **VK Видео, Rutube и сотни других:** расширение их просто не видит
- **Нет универсальногоfallback'а:** неизвестный сайт = расширение бесполезно

## 2. Scope

Поддерживаемые сценарии перехвата (покрытие ~95% сайтов):

| #   | Сценарий                                                                | Примеры             |
| --- | ----------------------------------------------------------------------- | ------------------- |
| 1   | Standard MediaElement — `createMediaElementSource(el)` работает         | YouTube, VK, Rutube |
| 2   | MediaElement уже захвачен чужим AudioContext                            | SoundCloud          |
| 3   | Сайт использует Web Audio API напрямую (decodeAudioData + BufferSource) | Некоторые плееры    |
| 4   | MSE (Media Source Extensions) — покрывается сценарием 1                 | YouTube             |
| 5   | WebRTC/стриминг — **НЕ в scope,** уже есть tabCapture                   | Google Meet, Twitch |

## 3. Architecture

### 3.1 New Module Structure

```
src/content/
├── interception/
│   ├── types.ts             — InterceptionResult, InterceptionStrategy
│   ├── detector.ts          — MediaDetector: поиск audio/video на странице
│   ├── strategy-direct.ts   — Level 1: createMediaElementSource напрямую
│   ├── strategy-preclaim.ts — Level 2: перехват play() до сайта
│   ├── strategy-hook.ts     — Level 3: глобальный патч AudioContext.prototype
│   ├── strategy-buffer.ts   — Level 4: fetch + decode + BufferSource (Beatport)
│   └── strategy-fallback.ts — Level 5: playbackRate-only
│
├── processing/
│   ├── pipeline.ts          — ProcessingPipeline: SoundTouchJS + EQ
│   └── worklet-loader.ts    — загрузка и инициализация AudioWorklet
│
├── content.ts               — оркестратор (тонкий, ~100 строк)
├── content-dispatcher.ts    — без изменений
├── media-detection.ts       — упрощается: только универсальный детектор
│
└── platform-adapters/       — упрощаются: findMedia + recommendedLevel (подсказка)
    ├── types.ts
    ├── index.ts
    ├── youtube.ts
    ├── soundcloud.ts
    ├── beatport.ts
    ├── junodownload.ts
    └── default.ts
```

### 3.2 Data Flow

```
POPUP/SIDEPANEL
  │ chrome.tabs.sendMessage({semitone, speed, ...})
  ▼
CONTENT-DISPATCHER (ISOLATED world)
  │ chrome.runtime.onMessage → CustomEvent('transpose-dispatch-controls-to-content')
  ▼
CONTENT.TS (MAIN world) — Orchestrator
  │
  ├── MediaDetector.start()
  │   ├── querySelectorAll('audio, video')
  │   ├── MutationObserver(documentElement)
  │   ├── document.createElement patch
  │   └── window.Audio patch
  │
  ├── for each element → CascadeStrategies.detect(el)
  │   ├── Level 1 (Direct)    → ✅ или ↓
  │   ├── Level 2 (Pre-Claim) → ✅ или ↓
  │   ├── Level 3 (Hook)      → ✅ или ↓
  │   ├── Level 4 (Buffer)    → ✅ или ↓
  │   └── Level 5 (Fallback)  → playbackRate-only
  │
  └── Successful strategy returns sourceNode → Pipeline.connect(sourceNode)
      │
      ├── sourceNode → SoundTouchJS WorkletNode → BiquadFilter[6] → GainNode → destination
      │
      └── Commands from popup → Pipeline.setSemitone() / setSpeed() / setEqBand()
```

## 4. Strategy Cascade — Detailed Algorithm

### Level 1: Direct (`strategy-direct.ts`)

```typescript
// Самый безопасный путь. Пробуется первым всегда.
async function detect(el: HTMLMediaElement): Promise<InterceptionResult> {
  const ctx = new AudioContext();
  try {
    const sourceNode = ctx.createMediaElementSource(el);
    return { success: true, strategy: 1, sourceNode };
  } catch (e) {
    if (e.name === 'InvalidStateError') {
      // Element already connected to another AudioContext
      return { success: false, strategy: 1, reason: 'already-connected', nextLevel: 2 };
    }
    throw e; // Unknown error — propagate
  }
}
```

### Level 2: Pre-Claim (`strategy-preclaim.ts`)

```typescript
// Перехватываем HTMLMediaElement.prototype.play ДО сайта.
// При первом вызове play() — мы создаём AudioContext и забираем элемент себе.
// Сайт вызывает play() → наш хук → createMediaElementSource(el) → оригинальный play()
// Сайт создаёт свой AudioContext позже → его createMediaElementSource падает.
//
// При неудаче (сайт первый): текущий трек → Level 5, глобально включаем Level 3.
```

### Level 3: AudioContext Hook (`strategy-hook.ts`)

```typescript
// Глобальный патч AudioContext.prototype:
// - createMediaElementSource → перенаправляем в наш AudioContext
// - decodeAudioData → перехватываем результат
// - createBufferSource → вставляем процессинг перед destination
//
// Механизм отката:
// - errorCount > 3 за 5 секунд → auto-uninstall → restore originals
// - Чёрный список сайтов (DAW, синтезаторы) → никогда не включается
//
// const HOOK_BLACKLIST = ['soundation.com', 'bandlab.com', 'audiotool.com', ...];
```

### Level 4: Buffer Fetch (`strategy-buffer.ts`)

```typescript
// Полный перенос текущей Beatport-логики:
// 1. Отслеживаем src у mediaElement
// 2. fetch(url) → arrayBuffer → decodeAudioData → AudioBuffer
// 3. AudioBufferSourceNode → Pipeline → destination
// 4. Управление play/pause/seek через наш код
// 5. Mute оригинального элемента
// 6. Hijack playbackRate на оригинале (предотвращение конфликтов)
//
// Fallback при ошибке fetch/decode: XHR → Level 5
```

### Level 5: Fallback (`strategy-fallback.ts`)

```typescript
// Минимальное вмешательство:
// - el.playbackRate = speed
// - el.preservesPitch = false
// - Pipeline.connect(null) — пайплайн не активен
//
// Периодически (раз в 30 сек) перепроверяем — может появиться новый элемент
// или AudioContext сайта освободился.
```

## 5. Processing Pipeline

### pipeline.ts

```typescript
interface ProcessingPipeline {
  connect(sourceNode: AudioNode | null): void;
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
```

Аудиограф: `sourceNode → SoundTouchJS WorkletNode → BiquadFilter[6] → GainNode → ctx.destination`

Pipeline не знает:

- Откуда пришёл sourceNode (стратегия абстрагирована)
- Какой сайт обрабатывается
- Beatport-специфику

Pipeline знает только:

- Подключить источник → применить pitch/speed/EQ → выдать в destination

### worklet-loader.ts

```typescript
interface WorkletLoader {
  load(ctx: AudioContext): Promise<AudioWorkletNode>;
}
```

Инкапсулирует:

- Регистрацию `soundtouch-processor.js` через `SoundTouchNode.register()`
- Создание `SoundTouchNode`
- Обработку ошибок загрузки с fallback на varispeed

## 6. Media Detector

```typescript
interface MediaDetector {
  start(): void;
  stop(): void;
  onElement(cb: (el: HTMLMediaElement) => void): void;
}
```

4 механизма обнаружения:

1. `querySelectorAll('audio, video')` — начальное сканирование
2. `MutationObserver(documentElement)` — с фазы `document_start`, ловит все добавления
3. `document.createElement` patch — `createElement('audio')`, `createElement('video')`
4. `window.Audio` patch — `new Audio()`

Фильтрация:

- YouTube sound effects (`/s/search/audio/`) — исключаются
- `isBlockedUrl(el.src)` — исключаются
- Без `src`/`currentSrc`/`srcObject` — помещаются в pending, ждут `waitForSource()`

## 7. Platform Adapters (simplified)

```typescript
interface PlatformAdapter {
  readonly platform: string;
  canHandle(url: string): boolean;
  findMedia(): HTMLMediaElement | null;
  recommendedLevel?: 1 | 2 | 3 | 4 | 5; // Подсказка для каскада
}
```

Адаптеры больше НЕ управляют аудиографом. Только:

- `findMedia()` — найти подходящий элемент на странице
- `recommendedLevel` — подсказать каскаду оптимальный уровень (может быть переопределено автоопределением)

Приоритет: YouTube → SoundCloud → JunoDownload → Beatport → Default.

## 8. Platform-Specific Code Migration

### Beatport → strategy-buffer.ts (preserved 1:1)

| Current location            | Code                                                                                                     | Moves to                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| `media-detection.ts:60-111` | `isBeatport`, `___tp_earlyContext`, createMediaElementSource patch, playbackRate descriptor save         | `strategy-buffer.ts` init |
| `audio-engine.ts:38-157`    | `watchBeatportElement()`                                                                                 | `strategy-buffer.ts`      |
| `audio-engine.ts:681-694`   | `_muteOriginalElement()`                                                                                 | `strategy-buffer.ts`      |
| `audio-engine.ts:696-741`   | `stopBeatportPlayback()`, `startBeatportPlayback()`                                                      | `strategy-buffer.ts`      |
| `audio-engine.ts:743-792`   | `prepareBeatportAudio()`                                                                                 | `strategy-buffer.ts`      |
| `audio-engine.ts:794-813`   | `_fetchBeatportAudioXHR()`                                                                               | `strategy-buffer.ts`      |
| `audio-engine.ts:815-844`   | `pauseBeatportPlayback()`, `seekBeatportPlayback()`, `resetBeatportState()`, `isBeatportBufferPlaying()` | `strategy-buffer.ts`      |
| `audio-engine.ts:265-297`   | `hijackPlaybackRate()`                                                                                   | `strategy-buffer.ts`      |
| `audio-engine.ts:595-623`   | `_getBeatportPlaybackRate()`, `_updateBeatportPlaybackRate()`                                            | `strategy-buffer.ts`      |

### YouTube → stays in platform-adapters/youtube.ts

YouTube-специфичная логика поиска видео (`video.video-stream`, `html5-main-video`, фильтр рекламы, выбор по площади) остаётся в адаптере. Но адаптер только возвращает элемент — перехват делает Level 1 (Direct).

## 9. Error Handling & Rollback

### Finite State Machine

```
IDLE → DETECTING → DIRECT | PRECLAIM | HOOKED | BUFFER | FALLBACK
                         │         │         │       │        │
                         └────┬────┴────┬────┴───┬───┴────┬───┘
                              │         │        │        │
                           ERROR ←── ERROR ←── ERROR ←── ERROR
                              │
                           retry after 30s → DETECTING
```

### Transition Rules

| From     | Trigger                                             | To                                         |
| -------- | --------------------------------------------------- | ------------------------------------------ |
| DIRECT   | `createMediaElementSource` throws InvalidStateError | PRECLAIM                                   |
| PRECLAIM | Site claimed element first                          | HOOKED (global) + current track → FALLBACK |
| HOOKED   | Error count > 3 in 5s                               | uninstall → FALLBACK                       |
| HOOKED   | Site in blacklist                                   | never install, skip to BUFFER or FALLBACK  |
| BUFFER   | fetch/decode fails                                  | FALLBACK                                   |
| FALLBACK | Timer (30s)                                         | DETECTING (retry)                          |
| ANY      | Unhandled exception                                 | FALLBACK                                   |

### Level 3 Uninstall Protocol

```typescript
// Save originals before patching
const originals = {
  createMediaElementSource: AudioContext.prototype.createMediaElementSource,
  decodeAudioData: AudioContext.prototype.decodeAudioData,
  createBufferSource: AudioContext.prototype.createBufferSource,
};

// install() — replace with patched versions
// Each patched method increments errorCount on exception
// errorCount >= 3 → scheduleUninstall() — 1s delay then restore originals
```

### Blacklist (Level 3 never installed)

```
soundation.com, bandlab.com, audiotool.com, vcvrack.com,
websynths.com, musiclab.chromeexperiments.com
```

### UI Degradation

| Active Level | Pitch Ctrl  | Speed Ctrl | EQ Ctrl     | UI Hint                                             |
| ------------ | ----------- | ---------- | ----------- | --------------------------------------------------- |
| 1, 2, 3, 4   | ✅ Active   | ✅ Active  | ✅ Active   | None                                                |
| 5 (fallback) | ❌ Disabled | ✅ Active  | ❌ Disabled | "Pitch shifting unavailable on this site"           |
| Blacklist    | ❌ Disabled | ✅ Active  | ❌ Disabled | "Limited mode — this site uses Web Audio synthesis" |

## 10. Migration Plan (4 Phases)

### Phase 1: Create New Modules (no changes to existing code)

All new files in `interception/` and `processing/` created. Old `audio-engine.ts`, `media-detection.ts`, `content.ts` untouched.

### Phase 2: Bridge in content.ts

```typescript
// Temporary flag for safe testing
const USE_NEW_PIPELINE = localStorage.getItem('tp_use_new_pipeline') === 'true';

if (USE_NEW_PIPELINE) {
  // New path
  const detector = createMediaDetector();
  const cascade = createCascadeStrategies();
  const pipeline = createPipeline();
  // ...
} else {
  // Old path (unchanged)
  audioEngine = createAudioEngine();
}
```

### Phase 3: Platform Testing

| Platform   | Test Criteria                                                      |
| ---------- | ------------------------------------------------------------------ |
| YouTube    | Pitch ±12, Speed 0.25-2x, EQ 6 bands — identical to current        |
| Beatport   | Fetch+decode, play/pause/seek, pitch, speed — identical to current |
| SoundCloud | Pre-Claim race, fallback on failure — pitch works or playbackRate  |
| VK Video   | Video detection, pitch + speed — full control                      |
| Rutube     | Same as VK                                                         |

### Phase 4: Cleanup

- Remove `USE_NEW_PIPELINE` flag
- Delete `audio-engine.ts`
- Simplify `media-detection.ts` (remove Beatport-specific code)
- Simplify `platform-adapters/` (remove audio graph management)

## 11. What Does NOT Change

| Component                                                   | Reason                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `content-dispatcher.ts`                                     | Bridge between ISOLATED and MAIN worlds — untouched                           |
| `content.ts` CustomEvent listener                           | Same event, same payload — just routes to `pipeline` instead of `audioEngine` |
| `chrome.runtime.sendMessage` format                         | `sendStateUpdate()` format preserved                                          |
| Popup (`App.tsx`, components)                               | Same `sendCommand({semitone, speed, ...})`                                    |
| Sidepanel (`App.tsx`)                                       | Same as popup                                                                 |
| Service Worker                                              | Badge, connect, permissions — untouched                                       |
| TabCapture                                                  | Separate subsystem — untouched                                                |
| Worklets (`bungee-processor.js`, `soundtouch-processor.js`) | Untouched                                                                     |
| i18n, storage, helpers, types                               | Untouched                                                                     |

## 12. Key Interfaces Reference

```typescript
// interception/types.ts

interface InterceptionResult {
  success: boolean;
  strategy: 1 | 2 | 3 | 4 | 5;
  sourceNode?: AudioNode;
  reason?: string;
  nextLevel?: number;
}

interface InterceptionStrategy {
  readonly level: number;
  readonly name: string;
  detect(el: HTMLMediaElement): Promise<InterceptionResult>;
}

// interception/detector.ts

type MediaElementCallback = (el: HTMLMediaElement) => void;

interface MediaDetector {
  start(): void;
  stop(): void;
  onElement(cb: MediaElementCallback): void;
}

// processing/pipeline.ts

interface ProcessingPipeline {
  connect(sourceNode: AudioNode | null): void;
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

// processing/worklet-loader.ts

interface WorkletLoader {
  load(ctx: AudioContext): Promise<AudioWorkletNode>;
}

// platform-adapters/types.ts (simplified)

interface PlatformAdapter {
  readonly platform: string;
  canHandle(url: string): boolean;
  findMedia(): HTMLMediaElement | null;
  recommendedLevel?: 1 | 2 | 3 | 4 | 5;
}
```

## 13. Risks & Mitigations

| Risk                                                          | Severity | Mitigation                                                                                 |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| Level 3 (AudioContext Hook) breaks site audio                 | High     | Error counter → auto-uninstall; blacklist for DAWs; Phase 2 flag for instant rollback      |
| Level 2 (Pre-Claim) race condition unstable                   | Medium   | Fallback to Level 3 or Level 5; no worse than current SoundCloud behavior                  |
| Beatport regression                                           | Critical | Strategy-buffer.ts contains EXACT copy of current Beatport code; Phase 3 dedicated testing |
| Performance overhead from MutationObserver on documentElement | Low      | Observer only active until first media element found; debounced callbacks                  |
| New modules introduce import complexity                       | Low      | Clear boundaries; each module has one purpose; circular dependencies prevented by design   |
