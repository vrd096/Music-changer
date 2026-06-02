# ТЕХНОЛОГИЧЕСКИЙ СТЕК

## Обязательные версии

```json
{
  "react": "^18.5.0",
  "react-dom": "^18.5.0",
  "typescript": "^5.7.0",
  "vite": "^5.4.0",
  "tailwindcss": "^4.3.0"
}

Проверка перед использованием
Перед импортом:
Проверь наличие в package.json
Проверь версию
Если пакета нет → НЕ импортируй, предложи установить

// ❌ ЗАПРЕЩЕНО (пакета нет)
import { useQuery } from '@tanstack/react-query';

// ✅ ПРАВИЛЬНО
// Сначала: npm install @tanstack/react-query
import { useQuery } from '@tanstack/react-query';

Импорты
Абсолютные пути через Vite alias:
// ✅ ПРАВИЛЬНО
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

// ❌ ЗАПРЕЩЕНО
import { Button } from '../../../components/ui/Button';
Порядок импортов:
Внешние пакеты (алфавитный)
Внутренние модули
Типы
Стили
Tailwind CSS
Utility-first подход:
// ✅ ПРАВИЛЬНО
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
  Click me
</button>

// ❌ ЗАПРЕЩЕНО (inline styles без необходимости)
<button style={{ padding: '16px', backgroundColor: 'blue' }}>
  Click me
</button>

cn utility для условных классов:

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
