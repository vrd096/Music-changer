---
category: utilities
priority: LOW
triggers:
  - "type-fest"
  - "Opaque"
  - "PartialDeep"
  - "ReadonlyDeep"
  - "SetRequired"
  - "SetOptional"
  - "Simplify"
  - "продвинутые типовые утилиты"
  - "рекурсивный partial"
  - "рекурсивный readonly"
  - "библиотека типов"
---

# Utility-библиотеки (опционально)

**Влияние: LOW**

Для продвинутых типовых утилит сверх встроенных средств TypeScript, рассмотрите
[type-fest](https://github.com/sindresorhus/type-fest).

---

## 8.1 type-fest для продвинутых утилит

**Impact: LOW** — готовые утилиты вместо ручного написания.

Для продвинутых типовых утилит, выходящих за рамки встроенных средств TypeScript, рассмотрите
[type-fest](https://github.com/sindresorhus/type-fest):

- `Opaque<T, Token>` — чистые branded-типы вместо ручного `& { __brand }` паттерна
- `PartialDeep<T>` — рекурсивный partial для вложенных объектов
- `ReadonlyDeep<T>` — рекурсивный readonly для иммутабельных данных
- `SetRequired<T, K>` / `SetOptional<T, K>` — точечное изменение обязательности полей
- `Simplify<T>` — упрощает сложные пересечения типов в подсказках IDE

```ts
import type { Opaque, PartialDeep, ReadonlyDeep, SetRequired } from 'type-fest';

type UserId = Opaque<string, 'UserId'>;
type UserPatch = PartialDeep<User>;
type FrozenUser = ReadonlyDeep<User>;

type UserWithEmail = SetRequired<User, 'email'>; // email становится обязательным
```

> ⚠️ Перед использованием **проверь наличие `type-fest` в `package.json`**. Это `devDependency` —
> не влияет на runtime-бандл. Если библиотеки нет — реализуй нужный утилитарный тип вручную
> (как `DeepReadonly` в [`04-immutability.md`](04-immutability.md)) или предложи установить.

---

## Связь с другими чанками

- Branded types вручную — [`01-type-first.md`](01-type-first.md) (правило 1.2)
- Глубокий readonly вручную — [`04-immutability.md`](04-immutability.md) (правило 4.4)
