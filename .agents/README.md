# ТЕХКОНСТИТУЦИЯ ПРОЕКТА

## Контекст для AI-агента (DeepSeek-4-Pro + Roo Code)

Этот файл определяет архитектурные принципы и правила поведения AI-агента. Все генерации кода должны строго соответствовать правилам из `.agents/rules/`.

## Технологический стек (стабильные версии 2026)

- **React**: 18.5 (Functional Components + Hooks)
- **TypeScript**: 5.7+ (strict mode)
- **Сборка**: Vite 5.4+
- **Стили**: Tailwind CSS 4.3+
- **Роутинг**: React Router v6.4+
- **Стейт**: Zustand 4+ (клиент), TanStack Query v5 (сервер)
- **Формы**: React Hook Form v7 + Zod
- **Тесты**: Vitest 2+ + Testing Library

## Архитектурные принципы

1. **Feature-Sliced**: код по бизнес-фичам, не по типам
2. **State Colocation**: состояние максимально близко к месту использования
3. **Явные границы**: разделение UI, логики, данных
4. **Type Safety**: strict TypeScript, запрет `any`
5. **Accessibility**: семантика, ARIA, фокус-менеджмент
6. **DRY + KISS**: не повторяться, но и не усложнять

## Структурная карта проекта (актуальна на 2026-06-09)

### Архитектурные слои

| Слой                        | Директория                       | Роль                                                                                                                  |
| --------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Background (Service Worker) | `src/background/`                | Жизненный цикл расширения, регистрация content scripts, маршрутизация сообщений, UI-режим (popup/sidepanel), badge    |
| Content Scripts             | `src/content/`                   | Перехват аудио на странице, каскад стратегий, аудио-пайплайн (SoundTouchJS + EQ)                                      |
| Content: Interception       | `src/content/interception/`      | 6 стратегий перехвата аудио: Direct → PreClaim → AudioContextHook → BufferFetch → Fallback (+ TabCapture)             |
| Content: Processing         | `src/content/processing/`        | Универсальный пайплайн: WorkletLoader (SoundTouchJS), Pipeline (граф нод + EQ)                                        |
| Content: Platform Adapters  | `src/content/platform-adapters/` | Адаптеры поиска `<video>/<audio>` для YouTube, SoundCloud, Beatport, JunoDownload, Default                            |
| UI (Popup)                  | `src/popup/`                     | React-интерфейс всплывающего окна: карточки тональности, скорости, EQ, BPM/Key                                        |
| UI (SidePanel)              | `src/sidepanel/`                 | React-интерфейс боковой панели (переиспользует компоненты popup)                                                      |
| TabCapture                  | `src/tabcapture/`                | Отдельная вкладка для захвата аудио через `chrome.tabCapture` API                                                     |
| Shared                      | `src/shared/`                    | Типы (`types.ts`), хелперы (`helpers.ts`), хранилище (`storage.ts`), i18n (`i18n.ts`), логгер, хуки, общие компоненты |

### Ключевые инварианты

- **Два content-script мира**: `content.ts` (MAIN world, доступ к `window`) и `content-dispatcher.ts` (ISOLATED world, проброс сообщений через DOM CustomEvents)
- **Каскад стратегий**: при обнаружении медиа-элемента стратегии пробуются последовательно до первого успеха; порядок зависит от типа элемента (`<audio>` с HTTP-URL vs `<video>`/MSE)
- **early AudioContext**: создаётся до загрузки страницы для опережения сайта в гонке за `createMediaElementSource`
- **Два аудиодвижка**: универсальный `Pipeline` (для всех сайтов) и legacy `AudioEngine` (только Beatport)
- **SoundTouchJS**: `@soundtouchjs/audio-worklet` для pitch-shifting через Web Audio Worklet
- **CORS Beatport**: `declarativeNetRequest` правило (`rules.json`) подменяет `Access-Control-Allow-Origin: *` для `geo-samples.beatport.com`
- **Коммуникация**: Popup/SidePanel → Service Worker → Content Script (через `chrome.tabs.sendMessage` + `chrome.runtime.sendMessage`)

### Соглашения об именовании файлов

- `strategy-*.ts` — стратегии перехвата в `src/content/interception/`
- `*.tsx` — React-компоненты
- `types.ts` — типы модуля
- `index.ts` — точка входа/фабрика модуля

## Роль AI-агента

- Действовать как Senior Frontend Engineer
- Применять все правила из `.roo/rules/`
- При недостатке контекста — задавать вопросы, не изобретать
- Не писать комментарии без необходимости (см. `05-no-comments.md`)
- Использовать fallback-протокол при неуверенности (см. `03-anti-hallucinate.md`)

## Рабочий процесс

1. Анализ задачи → проверка контекста
2. Применение правил из `.roo/rules/`
3. Генерация кода → типизация
4. Резюме изменений → риски

## Правила Git

- Коммиты всегда на русском языке
- Формат: `тип: описание`
- Типы: feat (новая функциональность), fix (исправление), refactor (рефакторинг), docs (документация)
