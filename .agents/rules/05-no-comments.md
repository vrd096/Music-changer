---

## 📄 `.agents/rules/05-no-comments.md`

````markdown
# КОММЕНТАРИИ: ТОЛЬКО ПРИ НЕОБХОДИМОСТИ

## Основной принцип

Код должен быть самодокументируемым. Комментарии нужны только когда код не может выразить намерение.

## Запрещено (бесполезные комментарии)

```typescript
// ❌ Очевидные комментарии
// Устанавливаем значение count
setCount(0);

// ❌ Комментарии к типам
interface User {
  id: string; // ID пользователя
  name: string; // Имя пользователя
}

// ❌ Закомментированный код
// const oldImplementation = () => { ... }

// ❌ Комментарии в JSX без необходимости
return (
  <div>
    {/* Отображаем имя */}
    <span>{user.name}</span>
  </div>
);

// ❌ Комментарии к импортам
// Импортируем React
import { useState } from 'react';

Разрешено (полезные комментарии)
// ✅ Объяснение ПОЧЕМУ
// Используем AbortController для отмены запросов при unmount
// Это предотвращает memory leaks
useEffect(() => {
  const controller = new AbortController();
  fetchData(controller.signal);
  return () => controller.abort();
}, []);

// ✅ TODO/FIXME
// TODO: Заменить на серверную пагинацию при >1000 элементов
const paginatedItems = items.slice(page * pageSize, (page + 1) * pageSize);

// ✅ Предупреждения о side effects
// ВНИМАНИЕ: Эта функция модифицирует исходный массив!
function sortItems(items: Item[]) {
  items.sort((a, b) => a.id - b.id);
}

// ✅ Нетривиальная логика
// Debounce 300ms выбран на основе A/B тестирования
// (конверсия +15%, нагрузка на API -40%)
const debouncedSearch = useDebounce(searchTerm, 300);

Правило проверки
Перед добавлением комментария:
Можно ли улучшить код, чтобы комментарий стал не нужен?
Да → улучши код
Нет → продолжай
Комментарий объясняет ЧТО или ПОЧЕМУ?
ЧТО → удали
ПОЧЕМУ → оставь
Дублирует ли типизацию TypeScript?
Да → удали
Нет → оставь
Альтернативы комментариям

// ❌ ПЛОХО
// Проверяем, авторизован ли пользователь
if (user && user.token && user.token.expiresAt > Date.now()) { ... }

// ✅ ХОРОШО
function isUserAuthenticated(user: User | null): boolean {
  if (!user?.token) return false;
  return user.token.expiresAt > Date.now();
}

if (isUserAuthenticated(user)) { ... }

// ❌ ПЛОХО
// Максимум попыток = 3, потому что больше нагружает сервер
const maxRetries = 3;

// ✅ ХОРОШО
const MAX_RETRIES_BEFORE_SERVER_OVERLOAD = 3;
```
````
