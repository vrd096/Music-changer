---
category: type-first
priority: CRITICAL
triggers:
  - "состояние загрузки"
  - "состояние ошибки"
  - "loading/error/success"
  - "discriminated union"
  - "невозможные состояния"
  - "branded types"
  - "UserId / OrderId"
  - "как не перепутать id"
  - "as const"
  - "литеральные объединения"
  - "exhaustive switch"
  - "never check"
  - "забытый case в switch"
  - "make illegal states unrepresentable"
---

# Type-First — Make Illegal States Unrepresentable

**Влияние: CRITICAL**

Используй систему типов, чтобы предотвратить некорректные состояния ещё на этапе компиляции.
Если тип делает невозможным создание неверного значения — баги ловятся до запуска.

---

## 1.1 Discriminated unions для взаимоисключающих состояний

**Impact: CRITICAL** — устраняет невозможные комбинации полей.

Когда состояние имеет несколько взаимоисключающих вариантов, моделируй его через
discriminated union (объединение с общим полем-дискриминатором). Это исключает невалидные
комбинации вроде `{ loading: true, error: Error, data: T }` одновременно.

**❌ Неправильно: позволяет невалидные комбинации**

```ts
// Допускает { loading: true, error: Error } и { data: T, error: Error }
type RequestState<T> = {
  loading: boolean;
  data?: T;
  error?: Error;
};
```

**✅ Правильно: только валидные комбинации**

```ts
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };
```

Теперь компилятор гарантирует: если `status === 'success'`, то поле `data` точно есть,
а `error` — отсутствует.

---

## 1.2 Branded types для доменных примитивов

**Impact: HIGH** — предотвращает путаницу семантически разных значений.

Когда несколько сущностей представлены одним примитивом (например, `UserId` и `OrderId` —
оба `string`), их легко перепутать и передать не туда. Branded (opaque) типы добавляют
«метку», которую компилятор различает.

**❌ Неправильно: компилятор не отличает идентификаторы**

```ts
function getUser(id: string): Promise<User> {
  /* ... */
}

const orderId: string = 'order-123';
getUser(orderId); // Компилируется — баг!
```

**✅ Правильно: компилятор предотвращает передачу чужого идентификатора**

```ts
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };

function getUser(id: UserId): Promise<User> {
  /* ... */
}

const orderId = 'order-123' as OrderId;
getUser(orderId);
// ❌ Ошибка: Argument of type 'OrderId' is not assignable to parameter of type 'UserId'.
```

Создавай branded-значения через функцию-конструктор, которая при необходимости валидирует
значение во время выполнения. Более чистый вариант через `type-fest` — см. [`08-utilities.md`](08-utilities.md).

---

## 1.3 Const assertions для литеральных объединений

**Impact: MEDIUM** — держит массив и тип синхронизированными.

Когда нужен набор строковых/числовых констант и производный тип-объединение, используй
`as const` — массив и тип всегда будут синхронны, не нужно дублировать значения.

**❌ Неправильно: тип и массив рассинхронизируются при изменении**

```ts
type Role = 'admin' | 'user' | 'guest';

const ROLES = ['admin', 'user', 'guest'];
// Забыл добавить 'superadmin' в оба места — баг

function isValidRole(role: string): role is Role {
  return (ROLES as string[]).includes(role);
}
```

**✅ Правильно: массив и тип в синхронизации автоматически**

```ts
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = (typeof ROLES)[number]; // 'admin' | 'user' | 'guest'

function isValidRole(role: string): role is Role {
  return ROLES.includes(role as Role);
}
```

---

## 1.4 Exhaustive switch с проверкой never

**Impact: HIGH** — ловит забытые ветки при расширении объединения.

Когда обрабатываешь все варианты discriminated union через `switch`, добавляй ветку `default`
с присвоением значения типу `never`. Если в объединение добавят новый вариант и забудут
обработать — компилятор выдаст ошибку.

**❌ Неправильно: добавили кейс, но не обновили switch — баг пройдёт незамеченным**

```ts
type Status = 'active' | 'inactive' | 'pending';

function processStatus(status: Status): string {
  switch (status) {
    case 'active':
      return 'processing';
    case 'inactive':
      return 'skipped';
    // 'pending' забыт — функция вернёт undefined
  }
}
```

**✅ Правильно: компилятор ловит забытый кейс**

```ts
type Status = 'active' | 'inactive' | 'pending';

function processStatus(status: Status): string {
  switch (status) {
    case 'active':
      return 'processing';
    case 'inactive':
      return 'skipped';
    case 'pending':
      return 'waiting';
    default: {
      // Если добавят новый кейс и забудут обработать — ошибка компиляции:
      // Type 'string' is not assignable to type 'never'.
      const _exhaustive: never = status;
      throw new Error(`unhandled status: ${_exhaustive}`);
    }
  }
}
```
