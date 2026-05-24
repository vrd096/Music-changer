# План исправления UI: Замена Angular Material custom elements на React-совместимые HTML-элементы

## Проблема

В React-коде используются Angular Material custom elements через `React.createElement`:

- `<mat-toolbar>` — через `el.toolbar()`
- `<mat-icon>` — через `el.icon()`
- `<mat-progress-bar>` — через `el.progressBar()`

Эти элементы — **Angular component selectors**, а не стандартные HTML-элементы. Без Angular Material JS runtime (`main-J6MTZYSA.js`) браузер рендерит их как неизвестные inline-элементы без стилей.

## Решение

Заменить все Angular custom elements на стандартные HTML-элементы с соответствующими CSS-классами. Оригинальный CSS уже содержит классы `.mat-mdc-*`, `.mdc-*`, `.material-icons` — их можно использовать напрямую. Для tag-селекторов (`mat-toolbar`, `mat-icon`, `mat-progress-bar`) добавим class-based селекторы.

## Схема замены

| Angular элемент        | React-замена                     | CSS класс                                      |
| ---------------------- | -------------------------------- | ---------------------------------------------- |
| `<mat-toolbar>`        | `<header>` / `<div>`             | `.mat-toolbar`                                 |
| `<mat-icon>`           | `<span>`                         | `.material-icons`                              |
| `<mat-progress-bar>`   | `<div>`                          | `.mat-progress-bar`                            |
| `<mat-card>`           | `<div>`                          | `.mat-mdc-card`                                |
| `<mat-card-header>`    | `<div>`                          | `.mat-mdc-card-header`                         |
| `<mat-card-title>`     | `<span>`                         | `.mat-mdc-card-title`                          |
| `<mat-card-content>`   | `<div>`                          | `.mat-mdc-card-content`                        |
| `<mat-card-actions>`   | `<div>`                          | `.mat-mdc-card-actions`                        |
| `<mat-slider>`         | `<div>` с `<input type="range">` | `.mdc-slider` (уже есть)                       |
| `<mat-tab-group>`      | `<div>`                          | `.mat-tab-group`                               |
| `<mat-tab>`            | `<button>`                       | `.mat-tab`                                     |
| `<mat-dialog>`         | `<div>`                          | `.dialog-overlay` / `.dialog-panel` (уже есть) |
| `<mat-dialog-content>` | `<div>`                          | `.dialog-content` (уже есть)                   |
| `<mat-dialog-actions>` | `<div>`                          | `.dialog-actions` (уже есть)                   |
| `<mat-form-field>`     | `<div>`                          | `.mat-form-field` (уже есть)                   |
| `<mat-label>`          | `<label>`                        | `.mat-label`                                   |
| `<mat-chip>`           | `<span>`                         | `.mat-chip`                                    |
| `<mat-menu>`           | `<div>`                          | `.mat-menu-panel` (уже есть)                   |

## Пошаговый план

### Шаг 1: Удалить el-хелпер из `src/popup/App.tsx`

Удалить блок `const el = { ... }` (строки 9-42).

### Шаг 2: Удалить el-хелпер из `src/sidepanel/App.tsx`

Удалить блок `const el = { ... }` (строки 9-42).

### Шаг 3: Переписать PopupApp toolbar (`src/popup/App.tsx` ~строки 746-795)

Заменить:

- `el.toolbar({}, ...)` → `<header className="mat-toolbar" role="toolbar">...</header>`
- `el.icon({ className: 'material-icons' }, 'icon_name')` → `<span className="material-icons">icon_name</span>`
- `el.progressBar({ mode: 'indeterminate', className: ... })` → `<div className="mat-progress-bar indeterminate visible">...</div>`
- Все `createElement('span', {}, ...)` → `<span>...</span>`
- Все `createElement('button', { ... }, ...)` → `<button {...}>...</button>`

### Шаг 4: Переписать SidePanelApp toolbar (`src/sidepanel/App.tsx` ~строки 1203-1316)

Аналогично шагу 3.

### Шаг 5: Переписать el.icon() в HistoryPage popup

Заменить все `el.icon({ className: 'material-icons' }, 'name')` на `<span className="material-icons">name</span>`.
Всего ~12 вхождений в MediaItemComponent, PlaylistRow, PlaylistTab.

### Шаг 6: Переписать el.icon() в HistoryPage sidepanel

Аналогично шагу 5.

### Шаг 7: Переписать AudioControls

Заменить `el.icon()` на `<span className="material-icons">` в:

- MaterialSlider (reset button, ~строка 669)
- LoopModeSelector (3 кнопки, ~строки 752-766)
- no-permission блок (~строка 813)

### Шаг 8: Обновить `src/popup/styles.css`

Добавить в конец файла CSS-правила для class-based селекторов:

```css
/* MatToolbar - class-based селектор */
.mat-toolbar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 48px;
  background: var(--mat-toolbar-bg, #1e1e1e);
  color: var(--mat-toolbar-color, #fff);
  position: relative;
  z-index: 10;
  gap: 4px;
}

.mat-toolbar > span {
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* MatProgressBar */
.mat-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.mat-progress-bar.visible {
  opacity: 1;
}

.mat-progress-bar.indeterminate::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 40%;
  background: linear-gradient(90deg, transparent, #7c4dff, transparent);
  animation: mat-progress-indeterminate 2s infinite linear;
}

@keyframes mat-progress-indeterminate {
  0% {
    left: -40%;
  }
  100% {
    left: 100%;
  }
}
```

### Шаг 9: Обновить `src/sidepanel/styles.css`

Аналогично шагу 8.

### Шаг 10: Очистить `src/shared/global.d.ts`

Удалить блок `declare namespace JSX { interface IntrinsicElements { ... } }` (строки 11-37).

### Шаг 11: Удалить `createElement` из импортов React

В обоих файлах:

- `import React, { useState, useEffect, useCallback, useRef, createElement }` → `import React, { useState, useEffect, useCallback, useRef }`

### Шаг 12: Собрать и протестировать

```bash
node scripts/build.mjs
```

## Функционал, который должен работать (уже реализован в React)

1. **Popup:**
   - Toolbar с кнопками History, PRO badge, Settings
   - HistoryPage с табами Recent / Library (Playlists)
   - Rename/Delete диалоги для плейлистов
   - Sort menu для плейлистов
   - Progress bar индикатор

2. **Sidepanel:**
   - Toolbar с кнопками History, Scene, PRO, Trial, Save, Share, Power, Settings
   - AudioControls с MaterialSlider (semitone, pitch, formant, speed)
   - MaterialToggle (varispeed, eq)
   - LoopModeSelector (off, loop, loop-one)
   - HistoryPage с табами Recent / Library
   - SubscriptionAlert, ProBanner
   - Progress bar индикатор

3. **Service Worker:**
   - Обработка команд (semitone, pitch, speed, formant, etc.)
   - Tab capture management
   - Content script messaging

4. **Content Script:**
   - Audio element detection
   - Web Audio API integration
   - Message relay между popup/sidepanel и страницей
