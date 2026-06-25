---
category: error-handling
priority: HIGH
triggers:
  - "обработка ошибок"
  - "null в типе"
  - "возврат null"
  - "функция может не найти"
  - "Result тип"
  - "Either"
  - "обработка ошибок без throw"
  - "optional chaining"
  - "nullish coalescing"
  - "?. и ??"
  - "значение по умолчанию"
  - "пустой catch"
  - "проглоченная ошибка"
  - "try catch пустой"
---

# Обработка ошибок и null

**Влияние: HIGH**

Обрабатывай ошибки и отсутствующие значения явно через типы. `null`/`undefined` — часть
типа, а не исключение. Предпочитай возвращаемые ошибки (Result) выбросам исключений там,
где ошибка — ожидаемый путь.

---

## 5.1 Не возвращай null без необходимости — используй объединения

**Impact: MEDIUM** — явная обработка отсутствующего значения.

Когда функция может не найти значение, возвращай `T | null` (или `T | undefined`) и обязывай
вызывающего обработать оба случая через `if` или optional chaining.

**❌ Неправильно: неявный возврат null без типа**

```ts
function findUser(id: string) {
  const user = db.find(id);
  return user ?? null; // Возвращаемый тип выводится, но контракт неявный
}

const user = findUser('1');
user.name; // Упадёт, если user === null
```

**✅ Правильно: явный тип T | null**

```ts
function findUser(id: string): User | null {
  return db.find(id) ?? null;
}

const user = findUser('1');
if (user !== null) {
  console.log(user.name); // Безопасно
}
```

---

## 5.2 Используй Result-тип для ожидаемых ошибок

**Impact: HIGH** — ошибки становятся частью контракта.

Когда ошибка — ожидаемый путь (валидация, поиск, сетевой запрос), моделируй её через тип
`Result<T, E>` вместо `throw`. Вызывающий обязан обработать оба исхода.

**❌ Неправильно: ошибка скрыта в throw**

```ts
function parseConfig(raw: string): Config {
  const parsed = JSON.parse(raw);
  if (!isValid(parsed)) {
    throw new Error('Invalid config'); // Ошибка не видна в сигнатуре
  }
  return parsed;
}

// Вызывающий не знает, что функция может выбросить
const config = parseConfig(raw);
```

**✅ Правильно: ошибка в типе возврата**

```ts
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseConfig(raw: string): Result<Config, string> {
  try {
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) {
      return { ok: false, error: 'Invalid config' };
    }
    return { ok: true, value: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Parse error' };
  }
}

const result = parseConfig(raw);
if (result.ok) {
  console.log(result.value); // Config
} else {
  console.error(result.error); // string
}
```

> `Result` — это discriminated union, подробно описанный в [`01-type-first.md`](01-type-first.md).

---

## 5.3 Сужай null/undefined через optional chaining и nullish coalescing

**Impact: MEDIUM** — лаконичная и безопасная обработка.

Используй `?.` для безопасного доступа к вложенным свойствам и `??` для значений по умолчанию.
Не путай `??` с `||`: `||` ловит все falsy (включая `0`, `''`), `??` — только `null`/`undefined`.

**❌ Неправильно: многословно и небезопасно**

```ts
function getCity(user?: User): string {
  if (user && user.address && user.address.city) {
    return user.address.city;
  }
  return 'Unknown';
}

function getPort(config: Config): number {
  return config.port || 3000; // Ловит 0 — баг, если port: 0 валиден
}
```

**✅ Правильно: лаконично и точно**

```ts
function getCity(user?: User): string {
  return user?.address?.city ?? 'Unknown';
}

function getPort(config: Config): number {
  return config.port ?? 3000; // 0 проходит как валидное значение
}
```

---

## 5.4 Не глотай ошибки — логируй или пробрасывай

**Impact: HIGH** — предотвращает скрытые сбои.

Пустой `catch {}` маскирует ошибки и усложняет отладку. Логируй, пробрасывай или возвращай
как `Result`. Если игнорируешь намеренно — комментируй почему.

**❌ Неправильно: ошибка проглочена**

```ts
function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem('config') ?? '{}');
  } catch {
    // Тихо игнорируем — баг невидим
  }
}
```

**✅ Правильно: логируем или возвращаем результат**

```ts
function loadConfig(): Config {
  try {
    return JSON.parse(localStorage.getItem('config') ?? '{}');
  } catch (e) {
    console.error('Failed to load config, using defaults:', e);
    return DEFAULT_CONFIG;
  }
}

// Или через Result
function loadConfig(): Result<Config, Error> {
  try {
    return { ok: true, value: JSON.parse(localStorage.getItem('config') ?? '{}') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
```
