# План реализации: Ребрендинг и редизайн «Music Pitch Changer»

**Дата:** 2026-05-29  
**Спецификация:** [`2026-05-29-music-pitch-changer-rebranding-design.md`](2026-05-29-music-pitch-changer-rebranding-design.md)  
**Статус:** Готов к реализации

---

## Фаза 1: Ребрендинг (≈30 мин)

| #   | Задача                                                               | Файлы                                                                                                                                          | Приоритет    |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1.1 | Обновить `package.json` — name, description, keywords, script        | [`package.json`](../../package.json)                                                                                                           | 🔴 Критично  |
| 1.2 | Обновить `manifest.json` — убрать externally_connectable, update_url | [`src/manifest.json`](../../src/manifest.json)                                                                                                 | 🔴 Критично  |
| 1.3 | Обновить локализацию EN/RU                                           | [`src/_locales/en/messages.json`](../../src/_locales/en/messages.json), [`src/_locales/ru/messages.json`](../../src/_locales/ru/messages.json) | 🔴 Критично  |
| 1.4 | Заменить все строки «Transpose» в коде                               | popup/App.tsx, sidepanel/App.tsx, shared/components/ProBanner.tsx                                                                              | 🔴 Критично  |
| 1.5 | Создать новый SVG-логотип (waveform)                                 | новый файл в `src/assets/`                                                                                                                     | 🟡 Важно     |
| 1.6 | Заменить иконки расширения                                           | [`src/assets/icons/`](../../src/assets/icons/)                                                                                                 | 🟡 Важно     |
| 1.7 | Обновить цвет бейджа                                                 | [`src/background/badge.ts`](../../src/background/badge.ts)                                                                                     | 🟢 Нормально |

## Фаза 2: Дизайн-система (≈45 мин)

| #   | Задача                                                                                                       | Приоритет   |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| 2.1 | Установить Tailwind CSS v4 + `@tailwindcss/vite`                                                             | 🔴 Критично |
| 2.2 | Создать `tailwind.config` с кастомными токенами (раздел 3.1 спеки)                                           | 🔴 Критично |
| 2.3 | Создать CSS-переменные для тёмной и светлой темы в `src/shared/styles/theme.css`                             | 🔴 Критично |
| 2.4 | Создать хук `useTheme` (чтение/запись `chrome.storage.sync`)                                                 | 🔴 Критично |
| 2.5 | Переписать `popup/styles.css` и `sidepanel/styles.css` — убрать старые стили, оставить только базовые сбросы | 🟡 Важно    |

## Фаза 3: Popup (≈1.5 часа)

| #   | Задача                                                                             | Файлы                                                                                                                                                                                      | Приоритет    |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 3.1 | Обновить `popup/index.html` — width: 300px                                         | [`src/popup/index.html`](../../src/popup/index.html)                                                                                                                                       | 🔴 Критично  |
| 3.2 | Переписать `popup/App.tsx` — новый хедер, навигация                                | [`src/popup/App.tsx`](../../src/popup/App.tsx)                                                                                                                                             | 🔴 Критично  |
| 3.3 | Создать `TonalityCard.tsx` — слайдер ±12, градиентный трек                         | новый: `src/popup/components/TonalityCard.tsx`                                                                                                                                             | 🔴 Критично  |
| 3.4 | Создать `SpeedCard.tsx` — BPM/множитель, кнопки ±                                  | новый: `src/popup/components/SpeedCard.tsx`                                                                                                                                                | 🔴 Критично  |
| 3.5 | Создать `EqCard.tsx` — 6 полос с подписями, toggle                                 | новый: `src/popup/components/EqCard.tsx`                                                                                                                                                   | 🔴 Критично  |
| 3.6 | Создать `BpmKeyCard.tsx` — спиннер/цифры, без layout shift                         | новый: `src/popup/components/BpmKeyCard.tsx`                                                                                                                                               | 🟡 Важно     |
| 3.7 | Обновить `ControlSlider` и `ControlToggle` (бывшие Material\*)                     | [`src/shared/components/MaterialSlider.tsx`](../../src/shared/components/MaterialSlider.tsx), [`src/shared/components/MaterialToggle.tsx`](../../src/shared/components/MaterialToggle.tsx) | 🟡 Важно     |
| 3.8 | Переписать Settings page — UI Mode, Theme, Language, Visible Components, Shortcuts | [`src/popup/App.tsx`](../../src/popup/App.tsx)                                                                                                                                             | 🟡 Важно     |
| 3.9 | Рестилизовать HistoryPage                                                          | [`src/shared/components/HistoryPage.tsx`](../../src/shared/components/HistoryPage.tsx)                                                                                                     | 🟢 Нормально |

## Фаза 4: SidePanel (≈1 час)

| #   | Задача                                                             | Файлы                                                        | Приоритет    |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------ | ------------ |
| 4.1 | Обновить `sidepanel/index.html` — width: 380px, height: 100vh      | [`src/sidepanel/index.html`](../../src/sidepanel/index.html) | 🔴 Критично  |
| 4.2 | Переписать `sidepanel/App.tsx` — полный тулбар, full-height layout | [`src/sidepanel/App.tsx`](../../src/sidepanel/App.tsx)       | 🔴 Критично  |
| 4.3 | Подключить те же карточки что в Popup (reuse)                      | импорт из `src/popup/components/`                            | 🔴 Критично  |
| 4.4 | Скрыть PRO-баннер и Share-кнопку                                   | [`src/sidepanel/App.tsx`](../../src/sidepanel/App.tsx)       | 🟡 Важно     |
| 4.5 | Расширенный EQ с типами фильтров (HP/LS/PK/HS) и dB-шкалой         | [`src/sidepanel/App.tsx`](../../src/sidepanel/App.tsx)       | 🟢 Нормально |

## Фаза 5: Фоновые скрипты (≈20 мин)

| #   | Задача                                       | Файлы                                                                          | Приоритет    |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| 5.1 | Обновить цвет бейджа на `#6e40c9`            | [`src/background/badge.ts`](../../src/background/badge.ts)                     | 🟡 Важно     |
| 5.2 | Убрать ссылки на Transpose из service worker | [`src/background/service-worker.ts`](../../src/background/service-worker.ts)   | 🟡 Важно     |
| 5.3 | Косметика в content-scripts                  | [`src/background/content-scripts.ts`](../../src/background/content-scripts.ts) | 🟢 Нормально |

---

## Порядок выполнения (рекомендуемый)

```
Фаза 1 (ребрендинг) → Фаза 2 (дизайн-система) → Фаза 3 (Popup) → Фаза 4 (SidePanel) → Фаза 5 (фон)
```

Фазы 1 и 2 можно делать параллельно. Фазы 3 и 4 зависят от фазы 2 (Tailwind + useTheme).

## Что НЕ трогаем

- `audio-engine.ts`, `media-detection.ts` — логика аудио
- `platform-adapters/*` — детекция платформ
- `worklets/*` — WASM-процессоры
- `tabcapture/*` — захват вкладки
- `content.ts`, `content-dispatcher.ts` — контент-скрипты
- `debug.ts` — диагностическая страница

## Общее время

≈ **3.5–4 часа** на всю реализацию.
