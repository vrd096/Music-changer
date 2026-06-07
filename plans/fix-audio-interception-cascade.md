# План исправления каскада перехвата аудио (Гибридный подход)

**Дата:** 2026-06-07
**Статус:** На утверждении
**Основан на:** design-документах v1 и v2, обратная связь по Пути А

---

## 1. Почему гибрид, а не чистая авто-классификация

Авто-классификация (v2 design doc) предполагает, что `<audio>` + blob (MSE) всегда позволяет `createMediaElementSource`. Это не проверено для всех сайтов. В частности, SoundCloud по данным v1 doc не позволяет перехват через Direct (элемент уже занят сайтом).

**Гибридный подход:** пробуем ВСЕ стратегии каскада с реальным ожиданием результата. Если ни одна не сработала — тогда авто-классификация подсказывает, нужен ли TabCapture или достаточно Fallback.

---

## 2. Целевая архитектура каскада

```
┌─────────────────────────────────────────────────────────────────┐
│  DETECTOR находит mediaElement                                  │
│  │                                                              │
│  ├─ Beatport? → Legacy AudioEngine (fetch+decode)              │
│  │                                                              │
│  └─ ВСЕ ОСТАЛЬНЫЕ: CascadeStrategies.run(el)                   │
│       │                                                         │
│       ├─ Level 1: Direct                                        │
│       │   createMediaElementSource(el) в общем earlyContext     │
│       │   ├── Успех → Pipeline.connect(sourceNode, el) ✅       │
│       │   └── InvalidStateError → Level 2                       │
│       │                                                         │
│       ├─ Level 2: Pre-Claim (асинхронный, ждёт play())         │
│       │   Хукает el.play(), при вызове:                        │
│       │   earlyContext.createMediaElementSource(el)             │
│       │   ├── Успех → Pipeline.connect(sourceNode, el) ✅       │
│       │   └── Ошибка → Level 3                                  │
│       │   Таймаут 5 сек → Level 3                               │
│       │                                                         │
│       ├─ Level 3: AudioContext Hook (асинхронный, ждёт захват) │
│       │   Патчит AudioContext.prototype.createMediaElementSource│
│       │   Ждёт пока сайт вызовет его (или таймаут 10 сек)      │
│       │   ├── Захвачен sourceNode → Pipeline ✅                 │
│       │   └── Таймаут → Level 4                                 │
│       │                                                         │
│       ├─ Level 4: Buffer Fetch                                  │
│       │   Если src startsWith('http') → fetch + decode +        │
│       │   BufferSourceNode → Pipeline                           │
│       │   ├── Успех → Pipeline.connect(bufferSource, el) ✅     │
│       │   └── Ошибка/нет http-url → Level 5                     │
│       │                                                         │
│       └─ Level 5: Fallback                                      │
│           el.preservesPitch = false                             │
│           el.playbackRate = speed                               │
│           Pipeline.connect(null, el)                            │
│           │                                                     │
│           └─ Если src startsWith('http') → уведомить Popup:    │
│              показать кнопку TabCapture (Level 0)              │
│              └── Пользователь активирует → TabCapture          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Детальный план изменений по файлам

### Этап 1: Общий AudioContext — `src/content/context-provider.ts` (новый файл)

**Проблема:** каждая стратегия и Pipeline создают свой AudioContext. `createMediaElementSource` можно вызвать только один раз — кто первый, того и элемент.

**Решение:** единый модуль, предоставляющий общий AudioContext для всех стратегий.

```typescript
// context-provider.ts (новый)
let earlyContext: AudioContext | null = null;

export function getOrCreateEarlyContext(): AudioContext {
  if (!earlyContext) {
    earlyContext = new AudioContext();
    (window as any).___tp_earlyContext = earlyContext;
  }
  return earlyContext;
}

export function getEarlyContext(): AudioContext | null {
  return earlyContext;
}
```

**Затрагивает:**

- [`strategy-direct.ts`](src/content/interception/strategy-direct.ts) — использовать `getOrCreateEarlyContext()` вместо `new AudioContext()`
- [`strategy-preclaim.ts`](src/content/interception/strategy-preclaim.ts) — то же
- [`pipeline.ts`](src/content/processing/pipeline.ts) — использовать `getEarlyContext()` если не передан sourceNode.context
- [`media-detection.ts`](src/content/media-detection.ts) — вынести создание `___tp_earlyContext` в context-provider

---

### Этап 2: Strategy Direct — `src/content/interception/strategy-direct.ts`

**Текущая проблема:** создаёт новый AudioContext при каждом вызове. При ошибке `InvalidStateError` не отличает «уже захвачен сайтом» от «уже захвачен нами в предыдущей попытке».

**Исправления:**

```typescript
// Было:
const ctx = new AudioContext();

// Стало:
const ctx = getOrCreateEarlyContext();
(ctx as any).__tp_owned = true;
```

Добавить проверку: если `ctx` уже имеет подключенный `MediaElementAudioSourceNode` для этого элемента — возвращать кешированный sourceNode.

---

### Этап 3: Strategy Pre-Claim — `src/content/interception/strategy-preclaim.ts`

**Текущая проблема:** `detect()` хукает `el.play()` но сразу возвращает `success: false`. Каскад не ждёт.

**Исправление:** `detect()` возвращает Promise, который резолвится когда:

- Пользователь/сайт вызывает `play()` → мы перехватываем и создаём sourceNode
- Или таймаут 5 секунд → возвращаем `success: false, nextLevel: 3`

```typescript
async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Восстановить оригинальный play
      if (originalPlay) el.play = originalPlay;
      resolve({
        success: false, strategy: 2,
        reason: 'Pre-claim timed out waiting for play()',
        nextLevel: 3,
      });
    }, 5000);

    const originalPlay = el.play.bind(el);
    el.play = function(this: HTMLMediaElement) {
      clearTimeout(timeout);
      el.play = originalPlay; // восстановить

      try {
        const ctx = getOrCreateEarlyContext();
        const sourceNode = ctx.createMediaElementSource(el);
        resolve({ success: true, strategy: 2, sourceNode });
      } catch (e) {
        resolve({
          success: false, strategy: 2,
          reason: 'Site claimed element before us',
          nextLevel: 3,
        });
      }
      return originalPlay();
    };
  });
}
```

---

### Этап 4: Strategy Hook — `src/content/interception/strategy-hook.ts`

**Текущая проблема:** устанавливает патч на `AudioContext.prototype.createMediaElementSource`, но `detect()` сразу возвращает `success: false`. Каскад не ждёт.

**Исправление:** `detect()` возвращает Promise, который резолвится когда:

- Сайт вызывает `createMediaElementSource` → мы захватываем sourceNode
- Или таймаут 10 секунд → возвращаем `success: false, nextLevel: 4`

```typescript
async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
  installHook(); // один раз при первом вызове

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      capturedResolvers.delete(el);
      resolve({
        success: false, strategy: 3,
        reason: 'Hook timed out waiting for AudioContext creation',
        nextLevel: 4,
      });
    }, 10000);

    // Сохраняем resolver — когда хук поймает createMediaElementSource,
    // вызовется capturedResolvers.get(el) и зарезолвит Promise
    capturedResolvers.set(el, { resolve, timeout });
  });
}
```

В `installHook()` нужно добавить вызов resolver'а при захвате:

```typescript
AudioContext.prototype.createMediaElementSource = function (element) {
  const result = originals.createMediaElementSource.call(this, element);
  const entry = capturedResolvers.get(element);
  if (entry) {
    clearTimeout(entry.timeout);
    capturedResolvers.delete(element);
    entry.resolve({ success: true, strategy: 3, sourceNode: result });
  }
  return result;
};
```

---

### Этап 5: Strategy Buffer Fetch — `src/content/interception/strategy-buffer.ts`

**Текущая проблема:** не в `getStrategies()`, не вызывается.

**Исправление:** добавить в каскад. `detect()` проверяет, что src — прямой http(s) URL, запускает fetch+decode и резолвится при успехе или ошибке.

```typescript
async detect(el: HTMLMediaElement): Promise<InterceptionResult> {
  const src = el.src || el.currentSrc || '';
  if (!src || src.startsWith('blob:')) {
    return {
      success: false, strategy: 4,
      reason: 'No fetchable URL (blob or empty)',
      nextLevel: 5,
    };
  }

  return new Promise((resolve) => {
    const ctx = getOrCreateEarlyContext();
    fetch(src)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(audioBuffer => {
        const bufferSource = ctx.createBufferSource();
        bufferSource.buffer = audioBuffer;
        // Mute оригинальный элемент
        el.volume = 0;
        el.muted = true;
        resolve({ success: true, strategy: 4, sourceNode: bufferSource });
      })
      .catch(() => {
        resolve({
          success: false, strategy: 4,
          reason: 'Buffer fetch/decode failed',
          nextLevel: 5,
        });
      });
  });
}
```

**Важно:** Buffer Fetch не должен дублироваться с Beatport (legacy engine). Оставляем Beatport на legacy-движке, этот Level 4 — для не-Beatport сайтов с прямыми URL.

---

### Этап 6: Strategy Fallback — `src/content/interception/strategy-fallback.ts`

Без изменений. Всегда возвращает `success: true` с `sourceNode: undefined`. Добавить только пометку в результате: `needsTabCapture: true` если src — http URL.

---

### Этап 7: Новый оркестратор — `src/content/content.ts`

**Ключевое изменение:** `getStrategies()` включает ВСЕ 5 стратегий + TabCapture как завершающий этап.

```typescript
function getStrategies(): InterceptionStrategy[] {
  return [
    createDirectStrategy(), // Level 1
    createPreClaimStrategy(), // Level 2
    createAudioContextHookStrategy(), // Level 3
    createBufferStrategy(), // Level 4
    createFallbackStrategy(), // Level 5
  ];
}
```

**Каскад теперь ждёт каждую стратегию:**

```typescript
async function tryCascadeStrategies(
  el: HTMLMediaElement,
  strategies: InterceptionStrategy[],
): Promise<void> {
  if (pipelineActive) return;

  for (const strategy of strategies) {
    if (pipelineActive) return;

    const result = await strategy.detect(el); // ← реально ждёт!

    if (result.success) {
      pipeline?.connect(result.sourceNode ?? null, el);
      pipelineActive = true;
      currentStrategyLevel = strategy.level;
      activeMediaElement = el;
      notifyPopupStrategyLevel(strategy.level);
      return;
    }
    // result.nextLevel указывает на следующий уровень (или undefined = стоп)
  }

  // Все стратегии провалились — крайний Fallback
  applyFallback(el);
}
```

**`useLegacyEngine` сокращается до Beatport-only:**

```typescript
const useLegacyEngine = isBeatport;
```

Все остальные домены (SoundCloud, Bandcamp, Bleep, Яндекс.Музыка и др.) идут через новый каскад.

---

### Этап 8: Pipeline — `src/content/processing/pipeline.ts`

**Исправление `connect(null)`:** не прерывать инициализацию, разрешить playbackRate-only режим.

```typescript
connect(sourceNode: AudioNode | null, mediaEl?: HTMLMediaElement | null) {
  currentSource = sourceNode;
  if (mediaEl) mediaElement = mediaEl;

  if (sourceNode) {
    audioContext = sourceNode.context as AudioContext;
    initWorkletAndConnect(); // строит полный граф
  }
  // Если sourceNode = null: playbackRate-only, Worklet не нужен

  sendStateUpdate();
}
```

**Исправление `setSemitone`:** при отсутствии Worklet не падать, а запоминать значение. При появлении sourceNode позже — применить.

```typescript
setSemitone(v: number) {
  state.semitone = v;
  if (workletConnected) {
    applyPitchState();
  }
  sendStateUpdate(); // UI всегда знает текущее значение
}
```

**Добавить `connectSourceNode` для динамического подключения:**
Если Hook или Pre-Claim захватили sourceNode ПОСЛЕ того как Pipeline уже в Fallback-режиме, метод `connectSourceNode` позволяет «переподключиться»:

```typescript
connectSourceNode(sourceNode: AudioNode) {
  currentSource = sourceNode;
  audioContext = sourceNode.context as AudioContext;
  initWorkletAndConnect(); // теперь Worklet подключится!
  sendStateUpdate();
}
```

---

### Этап 9: UI — `src/popup/App.tsx`, `src/sidepanel/App.tsx`

**Добавить приём `strategyLevel` из `sendStateUpdate()`:**

- Уровни 1-4: показывать «Полный контроль» (pitch + speed + EQ активны)
- Уровень 5 без http-URL: «Только скорость» (pitch и EQ заблокированы)
- Уровень 5 с http-URL: показывать кнопку «Включить TabCapture для pitch-контроля»

**Индикатор уже частично есть:** `tabCaptureNeeded` в [`App.tsx:37`](src/popup/App.tsx:37) и кнопка в [`App.tsx:279-293`](src/popup/App.tsx:279).

---

### Этап 10: TabCapture как Level 0

**Не в автоматическом каскаде**, а как действие пользователя после Fallback (Level 5). Когда `notifyPopupTabCaptureNeeded()` срабатывает:

1. Popup показывает кнопку «Enable TabCapture»
2. Пользователь нажимает → service worker открывает helper tab
3. Helper tab захватывает аудио через `getUserMedia` + `chrome.tabCapture.getMediaStreamId`
4. Контент-скрипт получает флаг `tabcapture-active` и отключает локальный перехват

Этот механизм уже работает в текущем коде, требуется только:

- Автоматический вызов `notifyPopupTabCaptureNeeded()` из Fallback при http-URL
- Флаг `tabcapture-active`/`tabcapture-inactive` в content.ts

---

### Этап 11: Очистка `audio-engine.ts`

Удалить всё кроме Beatport-логики:

- `watchBeatportElement()` — оставить
- `prepareBeatportAudio()`, `startBeatportPlayback()`, etc. — оставить
- Весь универсальный код (`attachToMedia`, `initMediaDetection`, `findMediaElement`) — удалить
- SoundCloud/Яндекс.Музыка/Bandcamp/... специфика — удалить

---

### Этап 12: Очистка `media-detection.ts`

- Перенести `___tp_earlyContext` создание в `context-provider.ts`
- Удалить Beatport-специфичный патч `createMediaElementSource`
- Оставить: `hasValidSource`, `waitForSource`, `pendingMediaElements`, `logError`, `isSecurityError`

---

## 4. Порядок реализации

| Шаг | Файлы                                | Суть                                                                                 | Риск                |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------ | ------------------- |
| 1   | `context-provider.ts` (новый)        | Общий AudioContext для всех стратегий                                                | Низкий — новый файл |
| 2   | `strategy-direct.ts`                 | Использовать `getOrCreateEarlyContext()`                                             | Низкий              |
| 3   | `strategy-preclaim.ts`               | Переписать на асинхронный Promise с таймаутом                                        | Средний             |
| 4   | `strategy-hook.ts`                   | Переписать на асинхронный Promise + resolver-ы                                       | Средний             |
| 5   | `strategy-buffer.ts`                 | Добавить универсальный fetch+decode, не только Beatport                              | Средний             |
| 6   | `pipeline.ts`                        | `connect(null)` не ломает инициализацию, `connectSourceNode`                         | Средний             |
| 7   | `content.ts`                         | Новый оркестратор: `getStrategies()` из 5 уровней, `useLegacyEngine` только Beatport | Высокий             |
| 8   | `audio-engine.ts`                    | Вырезать не-Beatport код                                                             | Высокий             |
| 9   | `media-detection.ts`                 | Вынести earlyContext, удалить Beatport-патч                                          | Средний             |
| 10  | `popup/App.tsx`, `sidepanel/App.tsx` | Индикация уровня стратегии                                                           | Низкий              |

---

## 5. Ожидаемый результат

| Сайт                        | Текущее состояние    | После исправлений                        |
| --------------------------- | -------------------- | ---------------------------------------- |
| YouTube (`<video>` blob)    | ❓ Pitch не работает | ✅ Direct (Level 1) — pitch + speed + EQ |
| VK (`<video>` blob)         | ❓ Pitch не работает | ✅ Direct (Level 1)                      |
| Spotify (`<video>` blob)    | ❓ Pitch не работает | ✅ Direct (Level 1)                      |
| Mixcloud (`<audio>` blob)   | ❓ Pitch не работает | ✅ Direct (Level 1)                      |
| SoundCloud (`<audio>` blob) | ❓ Legacy engine     | ✅ Direct или Pre-Claim (Level 1→2)      |
| Traxsource (`<audio>` blob) | ❓ Pitch не работает | ✅ Direct (Level 1)                      |
| Boomkat (`<audio>` http)    | ❌ Ничего            | ✅ Buffer (Level 4) или TabCapture       |
| Bandcamp (`<audio>` http)   | ❓ Legacy engine     | ✅ Buffer (Level 4) или TabCapture       |
| Beatport                    | ✅ Работает          | ✅ Без изменений (legacy)                |
| Яндекс.Музыка               | ❓ Legacy engine     | ✅ Каскад (Level 1→5)                    |

---

## 6. Стратегия безопасного внедрения

Каждый этап делать с feature-флагом:

```typescript
// content.ts
const USE_FIXED_CASCADE = localStorage.getItem('tp_fixed_cascade') !== 'false';

if (useLegacyEngine) {
  // Beatport — без изменений
  audioEngine = createAudioEngine();
} else if (USE_FIXED_CASCADE) {
  // Новый каскад
  pipeline = createPipeline();
  const detector = createMediaDetector();
  detector.onElement((el) => tryCascadeStrategies(el, getStrategies()));
  detector.start();
} else {
  // Старый путь (откат)
  // ... текущий код
}
```

После тестирования на 5+ платформах — удалить флаг и старый код.
