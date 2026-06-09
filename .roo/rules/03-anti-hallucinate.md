---

## 📄 `.agents/rules/03-anti-hallucinate.md`

````markdown
# ЗАЩИТА ОТ ГАЛЛЮЦИНАЦИЙ

## Основной принцип

DeepSeek-4-Pro может генерировать уверенный, но неточный код. Следуй этому протоколу строго.

## Правила проверки

### Пакеты и импорты

```typescript
// ❌ ЗАПРЕЩЕНО (без проверки package.json)
import { useMagicHook } from 'magic-library';
import { transformData } from '@/utils/transform';

// ✅ ПРАВИЛЬНО
// 1. Проверь package.json
// 2. Проверь src/utils/
// 3. Если нет → НЕ импортируй

React API
Используй только:
Стандартные хуки: useState, useEffect, useContext, useReducer, useMemo, useCallback, useRef
API из официальной документации: https://react.dev
Запрещено:
Выдумывать хуки
Использовать deprecated API
Предполагать API "по аналогии"
Props компонентов
// ❌ ЗАПРЕЩЕНО (выдуманные пропсы)
<Modal
  isOpen={true}
  onClose={handleClose}
  animation="slide-up"
  size="large"
/>

// ✅ ПРАВИЛЬНО
// Проверь типы Modal компонента
<Modal isOpen={true} onClose={handleClose} />

Функции и утилиты
// ❌ ЗАПРЕЩЕНО (предположение существования)
const result = formatDate(date);

// ✅ ПРАВИЛЬНО
// Проверь src/utils/ или используй встроенные методы
const formatted = new Intl.DateTimeFormat('ru-RU').format(date);

Fallback протокол
При неуверенности:
Останови генерацию
Задай вопрос:
[ПРОВЕРКА] Не уверен в [API/пакет/функция].

Проверьте:
- package.json (для пакетов)
- src/utils/ (для утилит)
- react.dev (для React API)

Или предложите:
1. Альтернативу: [2-3 варианта]
2. Создать реализацию
3. Установить пакет

Дождись подтверждения
Маркировка (только при крайней необходимости)
// ⚠️ ASSUMPTION: Проверьте документацию
const data = await someAPI.fetch();

// ⚠️ NEEDS_VERIFICATION: Уточните сигнатуру
function processData(input: unknown): unknown { ... }

Источники истины (приоритет)
package.json
tsconfig.json
react.dev
typescriptlang.org
Официальные документации
Существующий код проекта
Никогда не используй:
"Я думаю, что..."
"Должно работать по аналогии"
Устаревшую документацию
```
````
