# Universal Audio Interception v2 — Design Spec

**Date:** 2026-06-04  
**Status:** Approved — ready for implementation  
**Replaces:** 2026-06-02-universal-audio-interception-design.md

---

## 1. Problem Statement (updated)

v1 показал 50% отказов на новых сайтах. Корневая причина: хардкод-списки сайтов + неработающий TabCapture. Нужен полностью автоматический алгоритм без привязки к доменам.

**Ключевой инсайт из тестирования 20+ сайтов:**

| Тип элемента | Источник           | createMediaElementSource         | Примеры                     |
| ------------ | ------------------ | -------------------------------- | --------------------------- |
| `<video>`    | blob (MSE)         | ✅ Работает                      | YouTube, VK                 |
| `<audio>`    | blob (MSE)         | ✅ Работает                      | Mixcloud, Audiomack         |
| `<audio>`    | прямой http(s) URL | ❌ Подключается, но не процессит | Boomkat, Decks.de, Clone.nl |
| Beatport     | fetch+decode       | Специфичная логика               | Beatport                    |

## 2. Architecture — Auto-Classification (NO hardcoded sites)

```
Найден mediaElement
  │
  ├─ Beatport? → Legacy AudioEngine (fetch+decode + SoundTouchJS)
  │
  ├─ <video>? → Direct (createMediaElementSource + SoundTouchJS pipeline)
  │
  ├─ <audio> + src.startsWith('blob:')? → Direct (MSE streaming)
  │
  ├─ <audio> + src.startsWith('http')? → TabCapture
  │     │
  │     └─ Popup показывает кнопку «Активировать TabCapture»
  │        Пользователь нажимает → permission → helper tab → Bungee WASM
  │
  └─ <audio> без src (dynamic) → ждать src → переклассифицировать
```

### Why this works universally

- `<video>` + blob: браузер направляет аудио через MSE → `createMediaElementSource` перехватывает декодированный поток → SoundTouchJS работает
- `<audio>` + blob: аналогично видео — MSE-based стриминг → работает
- `<audio>` + прямой URL: браузер играет аудио напрямую → `createMediaElementSource` НЕ перенаправляет → нужен TabCapture
- Beatport: особая логика fetch+decode, оставляем legacy engine

## 3. TabCapture Flow (fixed)

### 3.1 UI: Popup notification

Когда определён `<audio>` с прямым URL, popup показывает:

```
┌─────────────────────────┐
│ ⚠️ TabCapture required   │
│                         │
│ This site uses direct   │
│ audio URLs. Click below │
│ to enable full control. │
│                         │
│ [Enable TabCapture]     │
└─────────────────────────┘
```

### 3.2 Service Worker handler

```typescript
// service-worker.ts
if (msg.type === 'request-tabcapture') {
  const targetTabId = msg.tabId;

  // 1. Request permission (now from user gesture via popup button)
  const granted = await chrome.permissions.request({
    permissions: ['tabCapture'],
  });
  if (!granted) return { status: 'error', message: 'Permission denied' };

  // 2. Get stream ID
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (id) =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(id),
    );
  });

  // 3. Open helper tab (inactive)
  const helperUrl = `tabcapture/tabcapture.html?tabId=${targetTabId}&streamId=${streamId}`;
  await chrome.tabs.create({ url: helperUrl, active: false });

  return { status: 'success' };
}
```

### 3.3 TabCapture page

Уже существует: `src/tabcapture/tabcapture.ts`. Захватывает аудио через `getUserMedia` со streamId, обрабатывает через Bungee WASM, выводит в динамики.

## 4. Content Script — Simplified Orchestrator

```typescript
// content.ts (simplified)

// ONLY Beatport uses legacy engine
if (isBeatport) {
  audioEngine = createAudioEngine();
  return;
}

// Universal pipeline for everything else
pipeline = createPipeline();
detector.onElement((el) => {
  const src = el.src || el.currentSrc || '';

  if (el instanceof HTMLVideoElement || src.startsWith('blob:')) {
    // Direct strategy — createMediaElementSource + SoundTouchJS
    const result = await createDirectStrategy().detect(el);
    if (result.success) pipeline.connect(result.sourceNode, el);
    else pipeline.connect(null, el); // fallback
  } else if (src.startsWith('http')) {
    // Need TabCapture — notify popup
    chrome.runtime.sendMessage({
      type: 'tabcapture-needed',
      url: src.substring(0, 100),
    });
    pipeline.connect(null, el); // playbackRate-only until TabCapture active
  }
});
```

## 5. File Changes Summary

### Modified

- `src/content/content.ts` — remove `useLegacyEngine` site list, add auto-classification, TabCapture popup notification
- `src/background/service-worker.ts` — fix `request-tabcapture` handler (already done in v1)
- `src/content/interception/strategy-direct.ts` — remove heuristic, always try createMediaElementSource
- `src/content/audio-engine.ts` — only used for Beatport

### Removed / Simplified

- Remove `useLegacyEngine` list (Bandcamp, Bleep, Hardwax, Redeye, Яндекс Музыка, SoundCloud)
- Remove varispeed hacks from audio-engine.ts

### New

- Popup UI: TabCapture activation button + connection status

### Unchanged

- `src/content/interception/` — all 6 strategies preserved
- `src/content/processing/` — pipeline + worklet-loader
- `src/tabcapture/` — helper page (already exists)
- `src/popup/`, `src/sidepanel/` — UI (minor changes for TabCapture button)

## 6. What Does NOT Change

| Component               | Reason                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| Popup/Sidepanel main UI | Same controls, same `sendCommand`                                 |
| Content-dispatcher      | Bridge unchanged                                                  |
| Worklet files           | soundtouch-processor.js, bungee-processor.js                      |
| TabCapture page         | Already handles capture + Bungee processing                       |
| Detection filters       | createElement patch, Audio constructor patch, sound effect filter |
| Cascade strategies      | Direct, PreClaim, Hook, Buffer, Fallback — all preserved          |

## 7. Expected Results After v2

| Сайт       | Классификация    | Стратегия                         | Pitch | Speed |
| ---------- | ---------------- | --------------------------------- | ----- | ----- |
| YouTube    | `<video>` + blob | Direct                            | ✅    | ✅    |
| VK         | `<video>` + blob | Direct                            | ✅    | ✅    |
| Mixcloud   | `<audio>` + blob | Direct                            | ✅    | ✅    |
| Audiomack  | `<audio>` + blob | Direct                            | ✅    | ✅    |
| Traxsource | `<audio>` + blob | Direct                            | ✅    | ✅    |
| SoundCloud | `<audio>` + blob | Direct (fail → Hook → TabCapture) | ✅    | ✅    |
| Spotify    | `<video>` + blob | Direct                            | ✅    | ✅    |
| Beatport   | beatport.com     | Legacy                            | ✅    | ✅    |
| Boomkat    | `<audio>` + http | TabCapture                        | ✅    | ✅    |
| Clone.nl   | `<audio>` + http | TabCapture                        | ✅    | ✅    |
| Decks.de   | `<audio>` + http | TabCapture                        | ✅    | ✅    |
| Bleep      | `<audio>` + http | TabCapture                        | ✅    | ✅    |
| Bandcamp   | `<audio>` + http | TabCapture                        | ✅    | ✅    |
| Hardwax    | `<audio>` + http | TabCapture                        | ✅    | ✅    |
| Redeye     | `<audio>` + http | TabCapture                        | ✅    | ✅    |
