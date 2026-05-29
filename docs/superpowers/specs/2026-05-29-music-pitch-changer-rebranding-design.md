# Спецификация: Ребрендинг и редизайн «Music Pitch Changer»

**Дата:** 2026-05-29
**Статус:** На ревью (v1.1)
**Версия:** 1.1

---

## 1. Обзор

Полный ребрендинг Chrome-расширения «Transpose ▲▼» → «Music Pitch Changer». Удаление всех упоминаний исходного бренда (название, логотипы, ссылки на transpose.video, иконки). Разработка нового современного UI в двух темах (тёмная/светлая) для Popup и SidePanel, ориентированного на диджеев и музыкантов. Подготовка дизайна к будущим фичам: BPM-детектор и определение ключа Камелота.

---

## 2. Ребрендинг — полный список изменений

### 2.1. Идентификаторы и метаданные

| Файл                                        | Что меняется     | Старое → Новое                                                                                                                                            |
| ------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`package.json`](package.json:2)            | `name`           | `"transpose-react"` → `"music-pitch-changer"`                                                                                                             |
| [`package.json`](package.json:5)            | `description`    | `"Transpose ▲▼ pitch ▹ speed ▹ loop — Chrome Extension (React port)"` → `"Music Pitch Changer — change pitch, speed, EQ and key of any audio on the web"` |
| [`package.json`](package.json:11)           | `package` script | `transpose-react-v6.4.0.zip` → `music-pitch-changer-v1.0.0.zip`                                                                                           |
| [`package.json`](package.json:13)           | `keywords`       | Заменить `"transpose"` → `"music-pitch-changer"`, `"pitch-shifter"`                                                                                       |
| [`src/manifest.json`](src/manifest.json:9)  | `name`           | `"__MSG_appName__"` — обновить переводы                                                                                                                   |
| [`src/manifest.json`](src/manifest.json:20) | `description`    | `"__MSG_appDesc__"` — обновить переводы                                                                                                                   |
| [`src/manifest.json`](src/manifest.json:46) | `short_name`     | `"__MSG_appShortName__"` — обновить переводы                                                                                                              |

### 2.2. Локализация

| Файл                                                           | Ключ           | Новое значение                                                                                                  |
| -------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| [`_locales/en/messages.json`](src/_locales/en/messages.json:2) | `appName`      | `"Music Pitch Changer — pitch · speed · EQ"`                                                                    |
| [`_locales/en/messages.json`](src/_locales/en/messages.json:5) | `appDesc`      | `"Change the pitch, speed and equalizer of music. Detect BPM and musical key. For DJs and musicians."`          |
| [`_locales/en/messages.json`](src/_locales/en/messages.json:8) | `appShortName` | `"Music Pitch Changer"`                                                                                         |
| [`_locales/ru/messages.json`](src/_locales/ru/messages.json:2) | `appName`      | `"Music Pitch Changer — тональность · скорость · эквалайзер"`                                                   |
| [`_locales/ru/messages.json`](src/_locales/ru/messages.json:5) | `appDesc`      | `"Меняйте тональность, скорость и эквалайзер музыки. Определение BPM и тональности. Для диджеев и музыкантов."` |
| [`_locales/ru/messages.json`](src/_locales/ru/messages.json:8) | `appShortName` | `"Music Pitch Changer"`                                                                                         |

### 2.3. Ссылки и домены

| Файл                                        | Что удалить/заменить                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`src/manifest.json`](src/manifest.json:21) | `"externally_connectable"` — удалить `"https://transpose.video/*"` или закомментировать |
| [`src/manifest.json`](src/manifest.json:47) | `"update_url"` — удалить ссылку на Google CWS (пока нет своего листинга)                |
| Все исходники                               | Удалить все упоминания `transpose.video`, `Transpose ▲▼`, `transpose-react`             |

### 2.4. Иконки и ассеты

| Действие | Описание                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| Заменить | Все файлы в [`src/assets/icons/`](src/assets/icons/) — новые иконки в стиле waveform/звуковой волны |
| Заменить | [`src/assets/images/`](src/assets/images/) — удалить pro-tilted изображения, использовать новые     |
| Удалить  | `icon-16-32x32-highlight.png` — подсветка больше не нужна (меняем механизм)                         |
| Создать  | Новый логотип: waveform SVG (звуковая волна из 7 столбцов, градиент фиолетовый→синий)               |

### 2.5. Код: строки и константы

| Файл                                                                        | Что меняется                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`popup/App.tsx`](src/popup/App.tsx:257)                                    | `"Transpose ▲▼"` → `"MUSIC PITCH CHANGER"`                        |
| [`sidepanel/App.tsx`](src/sidepanel/App.tsx:47)                             | `"Transpose ▲▼ PRO"` → `"MUSIC PITCH CHANGER"`                    |
| [`sidepanel/App.tsx`](src/sidepanel/App.tsx:33)                             | `"Transpose ▲▼"` → `"MUSIC PITCH CHANGER"`                        |
| [`shared/components/ProBanner.tsx`](src/shared/components/ProBanner.tsx:1)  | `"Transpose ▲▼ PRO"` → `"MUSIC PITCH CHANGER PRO"`                |
| [`shared/components/ProBanner.tsx`](src/shared/components/ProBanner.tsx:32) | `"Transpose ▲▼"` → `"MUSIC PITCH CHANGER"`                        |
| [`background/badge.ts`](src/background/badge.ts:20)                         | Цвет бейджа `#4b60d8ff` → `#6e40c9` (фиолетовый из новой палитры) |

---

## 3. Дизайн-система

### 3.1. Цветовые токены

#### Тёмная тема (по умолчанию)

| Токен                | Значение            | Применение                      |
| -------------------- | ------------------- | ------------------------------- |
| `--bg-primary`       | `#0d1117`           | Фон страницы                    |
| `--bg-card`          | `#161b22`           | Карточки, панели                |
| `--border`           | `#21262d`           | Границы                         |
| `--text-primary`     | `#e6edf3`           | Основной текст                  |
| `--text-secondary`   | `#8b949e`           | Подписи, мета-текст             |
| `--text-muted`       | `#484f58`           | Неактивный текст                |
| `--accent-gradient`  | `#6e40c9 → #58a6ff` | Градиент на слайдерах, акцентах |
| `--accent-primary`   | `#6e40c9`           | Фиолетовый акцент               |
| `--accent-secondary` | `#58a6ff`           | Синий акцент                    |
| `--toggle-bg`        | `#30363d`           | Фон переключателя               |
| `--toggle-knob`      | `#58a6ff`           | Ручка переключателя (вкл)       |

#### Светлая тема

| Токен                | Значение            | Применение                                 |
| -------------------- | ------------------- | ------------------------------------------ |
| `--bg-primary`       | `#ffffff`           | Фон страницы                               |
| `--bg-card`          | `#f5f5f7`           | Карточки, панели                           |
| `--border`           | `#e8e8ed`           | Границы                                    |
| `--text-primary`     | `#1d1d1f`           | Основной текст                             |
| `--text-secondary`   | `#86868b`           | Подписи, мета-текст                        |
| `--text-muted`       | `#aeaeb2`           | Неактивный текст                           |
| `--accent-gradient`  | `#6e40c9 → #0071e3` | Градиент (тот же фиолетовый, другой синий) |
| `--accent-primary`   | `#6e40c9`           | Фиолетовый акцент                          |
| `--accent-secondary` | `#0071e3`           | Синий акцент (Apple-синий)                 |
| `--toggle-bg`        | `#d2d2d7`           | Фон переключателя                          |
| `--toggle-knob`      | `#ffffff`           | Ручка переключателя (вкл)                  |

### 3.2. Типографика

- Шрифт: `'SF Pro Display', system-ui, -apple-system, sans-serif`
- Размеры: заголовок `12px UPPERCASE weight:600`, подписи `10px UPPERCASE weight:500`, значения `14-16px weight:700`, мелкий текст `7-8px`
- Letter-spacing: заголовки `0.3px`, подписи `0.8px`
- Все заголовки в интерфейсе — UPPERCASE (единый стиль)

### 3.3. Скругления

- Карточки: `8px` (Popup), `10px` (SidePanel)
- Кнопки ±: круглые (50%)
- Слайдер-трек: `2-3px`
- Thumb (ручка слайдера): круглый, с внешним свечением (`box-shadow: 0 0 8px`)

### 3.4. Иконки

Используются Unicode-эмодзи как база (в будущем — Material Symbols или SVG):

- 🌙/☀️ — тема
- 📋 — история
- ⚙ — настройки
- 💾 — сохранить текущий трек
- ↗ — поделиться (PRO, пока отключена)
- ⏻ — power on/off

Логотип: SVG waveform (7 столбцов разной высоты, градиент #6e40c9 → #58a6ff).

---

## 4. Компоненты UI и UX-логика

### 4.1. Popup (PopupApp)

**Размеры:**

- Ширина: **300px** (через `<body style="width:300px">`)
- Высота: **авто** — Chrome сам задаёт высоту popup по содержимому
- При скрытии компонента (EQ, BPM/Key) popup автоматически уменьшается
- Скролл допустим для History (длинный список) — это нормально для popup
- Пользователь может скрыть любой компонент в Settings → popup адаптируется

**Хедер (высота: 40px, фиксирован):**

```
[waveform-logo] MUSIC PITCH CHANGER    [📋] [⚙] [🌙 ●]
```

- Слева: SVG-логотип (waveform, 16×12px) + название
- Справа: История, Настройки, иконка темы + переключатель (pill)
- Кнопка «MUSIC PITCH CHANGER» при клике возвращает на главную (main)

**Страницы (переключение без скачков высоты):**

1. **Main** — карточки Тональность, Скорость, Эквалайзер, BPM/Key
2. **History** — история сохранённых треков + плейлисты (рестилизовать)
3. **Settings** — см. раздел 4.3

**Карточка «Тональность» (фикс. высота ~65px):**

- Заголовок: «ТОНАЛЬНОСТЬ» слева, значение `+2 st` справа
- Слайдер: −12 … 0 … +12, трек 4px с градиентом
- Thumb: 12px круг с синим свечением (`box-shadow: 0 0 8px`)

**Карточка «Скорость» (адаптивная, фикс. высота ~70px):**

- Заголовок: «СКОРОСТЬ» слева, значение + единицы справа
- **Аудио-режим (по умолчанию):** значение `128 BPM`, бегунок от BPM−30 до BPM+30
- **Видео-режим (автопереключение):** значение `1.25x`, бегунок 0.25x–2x
- Кнопки `−` и `+` по краям бегунка (шаг ±1 BPM / ±0.05x)
- **Важно:** высота компонента НЕ меняется при переключении аудио↔видео

**Карточка «Эквалайзер»:**

- Заголовок + toggle вкл/выкл
- 6 полос с подписями частот (30, 120, 350, 1.2k, 3.5k, 9k)
- Когда toggle выключен: полосы скрываются, карточка схлопывается до заголовка (30px)
- Когда toggle включен: полосы показываются (карточка ~100px)
- **Высота popup адаптируется** — Chrome сам изменяет размер окна
- Разница высоты компенсируется скроллом — popup не меняет общую высоту

**Карточки «BPM» / «KEY» (фикс. высота ~70px):**

- Две карточки рядом (flex: 1, gap: 8px)
- Состояние загрузки: спиннер (18×18px) + «analyzing...» (фикс. высота — не скачет)
- После загрузки: крупная цифра (20px weight:700) + подпись «Detected» / «Camelot»
- Анимация: fade-in + scale (200ms)

### 4.2. SidePanel (SidePanelApp)

**Фиксированная ширина, полная высота:**

- Ширина: 380px (рекомендуемая), диапазон 350–500px
- Высота: 100vh, хедер фиксирован сверху (flex-shrink: 0), контент скроллится

**Хедер (высота: 40px):**

```
[☀️] [📋]   MUSIC PITCH CHANGER   [💾] [↗] [⏻] [⚙] [🌙 ●]
```

**Назначение кнопок тулбара:**

| Кнопка         | Действие                        | Пояснение                                                                                                                                                               |
| -------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☀️ (сцена)     | Цикл: 4 визуальные сцены        | Меняет фоновый узор/ambient-подсветку                                                                                                                                   |
| 📋 (история)   | Страница History                | Сохранённые треки и плейлисты                                                                                                                                           |
| 💾 (сохранить) | `save-media` → content script   | Сохраняет **текущие настройки трека** (тональность, скорость, EQ, URL, название) в `chrome.storage.local`. Пользователь может потом вернуться — настройки восстановятся |
| ↗ (поделиться) | `share-media` → content script  | Генерирует ссылку с настройками. Пока отключена (opacity 0.5, не кликабельна)                                                                                           |
| ⏻ (power)      | `toggle-power` → content script | Вкл/выкл обработку аудио. Синий = активен, серый = выключен                                                                                                             |
| ⚙ (настройки)  | Страница Settings               | Переход на страницу настроек                                                                                                                                            |
| 🌙/☀️ ●        | Переключатель темы              | Тёмная ↔ светлая, сохраняется в `chrome.storage.sync`                                                                                                                   |

**PRO-баннер:**

- Текст «MUSIC PITCH CHANGER PRO» + «Unlock all features» + кнопка Upgrade
- **Пока скрыт** (`display: none` / закомментирован), так как страницы апгрейда нет

### 4.3. Страница Settings

**Содержимое:**

- **UI Mode** — Radio/select: Popup / SidePanel. Хранение: `chrome.storage.sync.uiMode`
- **Theme** — Переключатель тёмная/светлая. Хранение: `chrome.storage.sync.theme`
- **Language** — Select: English / Русский. Хранение: `chrome.storage.sync.uiLanguage`
- **Visible Components** — Чекбоксы: Тональность / Скорость / Эквалайзер / BPM & Key. Хранение: `chrome.storage.sync.visibleComponents`
- **Keyboard Shortcuts** — Ссылка → `chrome://extensions/shortcuts`

**Видимость компонентов:**

- По умолчанию всё включено
- Пользователь может скрыть любой блок — он исчезает с Main-страницы
- Popup/sidepanel автоматически адаптирует высоту (Chrome управляет размером окна)

**Popup ↔ SidePanel переключение:**

- В Settings: пользователь выбирает режим → сохраняется в `chrome.storage.sync.uiMode`
- Service Worker ([`service-worker.ts`](src/background/service-worker.ts:292)) слушает `chrome.storage.onChanged` → при смене `uiMode`:
  - `'sidepanel'`: `chrome.action.setPopup({popup: ''})` + открыть side panel
  - `'popup'`: `chrome.action.setPopup({popup: 'popup/index.html'})`

### 4.4. Общие компоненты

- **MaterialSlider** → `ControlSlider`: трек 4px с градиентом, круглый thumb со свечением, кнопка сброса при hover
- **MaterialToggle** → `ControlToggle`: pill-форма (28×14px), анимированный knob
- **HistoryPage** — рестилизовать, логика без изменений
- **ProBanner** — заменить текст и скрыть до появления страницы апгрейда

---

## 5. Технические решения

### 5.1. CSS-подход

Tailwind CSS v4 + CSS-переменные для тем. `darkMode: 'class'`, плагин `@tailwindcss/vite`.

### 5.2. Хранение и переключение тем

```tsx
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    chrome.storage.sync.get('theme', (data) => {
      if (data.theme) setTheme(data.theme);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    chrome.storage.sync.set({ theme });
  }, [theme]);

  return { theme, setTheme };
}
```

**Почему `chrome.storage.sync`, а не `localStorage`:**

- `localStorage` привязан к URL расширения, может сбрасываться при обновлении
- `chrome.storage.sync` — нативное API, синхронизируется между устройствами, выдерживает перезагрузки

### 5.3. Адаптивный Speed-компонент

```tsx
interface SpeedControlProps {
  mediaType: 'audio' | 'video';
  bpm: number;
  speed: number;
  onBpmChange: (bpm: number) => void;
  onSpeedChange: (speed: number) => void;
}
```

Один компонент, фикс. высота 70px. Внутренний контент переключается без изменения высоты.

### 5.4. Поведение Popup (авто-высота, Chrome управляет)

1. `<body>`: `width: 300px` (без фикс. высоты — Chrome сам задаёт по содержимому)
2. Хедер: `height: 40px; flex-shrink: 0`
3. Компоненты скрываются/показываются — Chrome адаптирует высоту окна
4. Скролл допустим: History с длинным списком, Settings с многими опциями
5. BPM/Key: спиннер и цифры в контейнере одинаковой высоты (избегаем скачков внутри компонента)
6. Переключение страниц: контент заменяется, Chrome подстраивает высоту

### 5.5. BPM/Key loading state

Контейнер фиксированной высоты (70px). Внутри: спиннер (при загрузке) или цифра с анимацией fade+scale (после загрузки). Без layout shift.

---

## 6. Этапы реализации

### Фаза 1: Ребрендинг (удаление Transpose)

1. Обновить [`package.json`](package.json:1) — name, description, keywords
2. Обновить [`src/manifest.json`](src/manifest.json:1) — убрать externally_connectable, update_url
3. Обновить [`_locales/en/`](src/_locales/en/messages.json:1) и [`_locales/ru/`](src/_locales/ru/messages.json:1)
4. Найти и заменить все строки «Transpose» в коде (popup, sidepanel, shared)
5. Заменить иконки в [`assets/icons/`](src/assets/icons/)
6. Создать новый SVG-логотип (waveform)

### Фаза 2: Дизайн-система

7. Установить и настроить Tailwind CSS в Vite
8. Определить CSS-переменные для обеих тем в `tailwind.config`
9. Создать хук `useTheme` (с `chrome.storage.sync`)
10. Переписать [`popup/styles.css`](src/popup/styles.css:1) и [`sidepanel/styles.css`](src/sidepanel/styles.css:1) — только фиксированные размеры

### Фаза 3: Popup (без layout shift)

11. Переписать [`popup/index.html`](src/popup/index.html:1) — body: 300×500px, overflow: hidden
12. Переписать [`popup/App.tsx`](src/popup/App.tsx:1) — новый хедер, навигация без скачков
13. Создать компоненты: `TonalityCard`, `SpeedCard`, `EqCard`, `BpmKeyCard` (с фикс. высотой)
14. Адаптировать [`AudioControls.tsx`](src/shared/AudioControls.tsx:1) под новый дизайн
15. Переписать Settings page (UI mode, theme, language, shortcuts)
16. Обновить `ControlSlider` / `ControlToggle`

### Фаза 4: SidePanel

17. [`sidepanel/index.html`](src/sidepanel/index.html:1) — width: 380px
18. Переписать [`sidepanel/App.tsx`](src/sidepanel/App.tsx:1) — полный тулбар, full-height
19. Расширенный EQ с типами фильтров и dB-шкалой
20. PRO-баннер — скрыть/закомментировать

### Фаза 5: Фон и бейдж

21. Обновить [`background/badge.ts`](src/background/badge.ts:1) — цвет `#6e40c9`
22. Обновить [`background/service-worker.ts`](src/background/service-worker.ts:1) — убрать ссылки на Transpose

---

## 7. Мокапы (утверждены)

- **Popup v5 + SidePanel v2:** [`hybrid-design-v4.html`](.superpowers/brainstorm/session/content/hybrid-design-v4.html), [`popup-v5-sidepanel-v2.html`](.superpowers/brainstorm/session/content/popup-v5-sidepanel-v2.html)
- **Сравнение стилей:** [`visual-style-comparison.html`](.superpowers/brainstorm/session/content/visual-style-comparison.html)

---

## 8. Границы и исключения

- **НЕ трогаем:** audio-engine.ts, worklets, WASM-модули, platform-adapters, tabcapture, debug-страницу (только косметика)
- **НЕ добавляем:** реальную детекцию BPM/Key (только UI-заглушки)
- **НЕ меняем:** структуру сообщений (ServiceWorker ↔ Content ↔ UI), логику content-scripts
- **Иконки:** на первом этапе — Unicode-эмодзи, в будущем — Material Symbols или SVG
- **PRO-баннер:** скрыт до появления страницы апгрейда
- **Share-кнопка:** отключена (серый цвет), включится с PRO
- **Тема:** хранится в `chrome.storage.sync` (персистентно между сессиями и устройствами)
