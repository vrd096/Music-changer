---
category: immutability
priority: HIGH
triggers:
  - "иммутабельность"
  - "мутация"
  - "readonly"
  - "as const"
  - "toSorted"
  - "toReversed"
  - "sort мутирует"
  - "глубокий readonly"
  - "ReadonlyDeep"
  - "неизменяемые данные"
  - "мутирует исходный массив"
  - "побочные эффекты на входных данных"
---

# Иммутабельность

**Влияние: HIGH**

Иммутабельные данные предсказуемы, легко тестируются и безопасны в конкурентных сценариях
(React, Redux). Используй `readonly`, `as const` и иммутабельные API массивов.

---

## 4.1 Используй readonly для массивов и объектов

**Impact: HIGH** — предотвращает случайные мутации.

Помечай массивы как `readonly T[]` (или `ReadonlyArray<T>`), а объекты — `Readonly<T>`,
если они не должны мутироваться. Компилятор запретит вызовы мутирующих методов (`push`,
`splice`) и присваивание полей.

**❌ Неправильно: мутация возможна и не отслеживается**

```ts
function processUsers(users: User[]): User[] {
  users.push({ id: 'new', name: 'New' }); // Мутирует входной массив!
  return users;
}

const list = getUsers();
processUsers(list); // list неожиданно изменён
```

**✅ Правильно: readonly запрещает мутацию**

```ts
function processUsers(users: readonly User[]): User[] {
  // users.push(...) — ошибка компиляции
  return [...users, { id: 'new', name: 'New' }];
}
```

---

## 4.2 Используй as const для литеральных конфигов

**Impact: MEDIUM** — сужает типы до литералов, делает их иммутабельными.

`as const` делает объект/массив глубоко `readonly` и сужает типы до литералов. Полезно для
конфигов, перечислений, маппингов.

**❌ Неправильно: типы широкие, объект мутируем**

```ts
const config = {
  endpoint: '/api',
  retries: 3,
  methods: ['GET', 'POST'],
};
// config.endpoint: string (широко), config.methods: string[]
config.endpoint = '/other'; // Мутация разрешена
```

**✅ Правильно: литеральные типы, иммутабельно**

```ts
const config = {
  endpoint: '/api',
  retries: 3,
  methods: ['GET', 'POST'],
} as const;
// config.endpoint: '/api' (литерал), config.methods: readonly ['GET', 'POST']
config.endpoint = '/other'; // ❌ Ошибка: readonly
```

---

## 4.3 Используй иммутабельные методы массивов

**Impact: MEDIUM** — предотвращает мутации входных данных.

`sort()`, `splice()`, `reverse()` мутируют массив на месте. В React/Redux это ломает
иммутабельную модель. Используй `toSorted()`, `toReversed()`, `toSpliced()`, `with()`,
создающие новый массив.

**❌ Неправильно: мутирует исходный массив**

```ts
function sortByName(users: User[]): User[] {
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

const list = getUsers();
const sorted = sortByName(list);
console.log(list === sorted); // true — list мутирован
```

**✅ Правильно: создаёт новый массив**

```ts
function sortByName(users: readonly User[]): User[] {
  return users.toSorted((a, b) => a.name.localeCompare(b.name));
}

const list = getUsers();
const sorted = sortByName(list);
console.log(list === sorted); // false — list не тронут
```

> `toSorted()` / `toReversed()` / `toSpliced()` / `with()` доступны в TypeScript 5.0+ и
> современных браузерах (Chrome 110+, Safari 16+, Firefox 115+). Для старых сред:
> `[...users].sort(...)`.

---

## 4.4 Глубокий readonly через утилиты

**Impact: MEDIUM** — защищает вложенные структуры.

`Readonly<T>` делает readonly только верхний уровень. Для глубокого readonly используй
рекурсивный утилитарный тип или библиотеку `type-fest` (`ReadonlyDeep<T>`) —
см. [`08-utilities.md`](08-utilities.md).

**❌ Неправильно: только верхний уровень защищён**

```ts
interface Config {
  nested: { value: number };
}

const config: Readonly<Config> = { nested: { value: 1 } };
config.nested.value = 2; // Мутация разрешена — вложенность не readonly
```

**✅ Правильно: глубокий readonly**

```ts
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

interface Config {
  nested: { value: number };
}

const config: DeepReadonly<Config> = { nested: { value: 1 } };
config.nested.value = 2; // ❌ Ошибка: readonly
```
