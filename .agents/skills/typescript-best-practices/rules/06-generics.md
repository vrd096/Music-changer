---
category: generics
priority: MEDIUM
triggers:
  - "дженерики"
  - "generics"
  - "обобщение типа"
  - "extends keyof"
  - "constraint на дженерик"
  - "T extends"
  - "сложные типы"
  - "упростить тип"
  - "KISS для типов"
  - "satisfies"
  - "mapped types"
  - "Partial / Pick / Omit"
  - "utility types"
  - "трансформация типов"
---

# Дженерики и продвинутые типы

**Влияние: MEDIUM**

Дженерики и продвинутые типы позволяют писать переиспользуемый, типобезопасный код.
Применяй их там, где они реально добавляют ценность — не усложняй без необходимости.

---

## 6.1 Ограничивай дженерики через extends

**Impact: MEDIUM** — безопасность и подсказки внутри функции.

Ограничивай (constrain) дженерики через `extends`, чтобы внутри функции можно было безопасно
обращаться к полям. Без ограничения дженерик — это `unknown`.

**❌ Неправильно: без ограничения нельзя обращаться к полям**

```ts
function getProperty<T>(obj: T, key: string) {
  return obj[key]; // ❌ Неявный any, нет безопасности по ключу
}
```

**✅ Правильно: ключ привязан к свойствам объекта**

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]; // Безопасно, тип T[K] выведен
}

const user = { id: 1, name: 'Alice' };
const name = getProperty(user, 'name'); // string
const age = getProperty(user, 'age'); // ❌ Ошибка: 'age' не является ключом
```

---

## 6.2 Не переусложняй типы — KISS

**Impact: MEDIUM** — читаемость важнее «умности».

Сложные условные типы с вложенными `infer` трудно читать и отлаживать. Если тип можно выразить
проще через объединение или utility — делай проще. Помни KISS.

**❌ Неправильно: избыточно сложный тип**

```ts
// Сложно понять с первого взгляда
type DeepPick<T, Paths extends string> = ... // 20 строк с вложенными infer
```

**✅ Правильно: проще и понятнее**

```ts
// Явное объединение вместо хитрого выведения
interface UserProfile {
  id: string;
  profile: { name: string; avatar: string };
}

type UserProfilePreview = Pick<UserProfile, 'id'> & {
  name: string;
};
```

---

## 6.3 Используй satisfies для проверки без расширения типа

**Impact: MEDIUM** — точная проверка соответствия типу.

`satisfies` (TypeScript 4.9+) проверяет, что значение соответствует типу, **не расширяя**
тип значения до целевого. Полезно, когда нужно убедиться в соответствии, но сохранить
литеральные типы.

**❌ Неправильно: тип расширяется до целевого, теряются литералы**

```ts
type Colors = 'red' | 'green' | 'blue';

const palette: Record<Colors, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
};
// palette.red: string — широкий тип, литерал '#ff0000' потерян
```

**✅ Правильно: проверка соответствия, литералы сохранены**

```ts
type Colors = 'red' | 'green' | 'blue';

const palette = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
} satisfies Record<Colors, string>;
// palette.red: '#ff0000' — литерал сохранён
// Если забыть ключ — ошибка компиляции
```

> ⚠️ `satisfies` доступен с TypeScript 4.9. **Проверь версию TypeScript в `package.json`**
> перед использованием. На старых версиях — явная аннотация `const x: T = ...`.

---

## 6.4 Используй mapped types для трансформации типов

**Impact: MEDIUM** — DRY при создании вариаций типов.

Mapped types (`{ [K in keyof T]: ... }`) позволяют создавать вариации типов
(опциональные, readonly, трансформированные) без дублирования.

**❌ Неправильно: типы дублированы**

```ts
interface User {
  id: string;
  name: string;
  email: string;
}

interface UserPatch {
  id?: string;
  name?: string;
  email?: string;
}

interface ReadonlyUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}
```

**✅ Правильно: выведено из источника**

```ts
interface User {
  id: string;
  name: string;
  email: string;
}

type UserPatch = Partial<User>; // все поля опциональны
type ReadonlyUser = Readonly<User>; // все поля readonly
type UserPreview = Pick<User, 'id' | 'name'>; // подмножество
type UserWithoutEmail = Omit<User, 'email'>; // без поля
```
