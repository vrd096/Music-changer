---
category: strictness
priority: CRITICAL
triggers:
  - "strict режим"
  - "tsconfig strict"
  - "any в коде"
  - "избегай any"
  - "заменить any"
  - "unknown вместо any"
  - "ts-ignore"
  - "ts-nocheck"
  - "подавление ошибки типов"
  - "приведение типов"
  - "type assertion"
  - "as приведение"
  - "narrowing"
  - "сужение типов"
  - "type guard"
  - "типобезопасность"
---

# Строгость и отказ от any

**Влияние: CRITICAL**

Строгий режим TypeScript — фундамент типобезопасности. `any` отключает проверку типов и
превращает TypeScript в JavaScript. Заменяй `any` на конкретные типы или `unknown`.

---

## 2.1 Включай strict-режим в tsconfig.json

**Impact: CRITICAL** — фундамент всей типобезопасности.

Включай `"strict": true` в `tsconfig.json`. Это активирует набор критичных проверок:
`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`,
`strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`.

**❌ Неправильно: проверки отключены, баги проходят**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": false
  }
}
```

**✅ Правильно: максимально строгий режим**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true, // arr[i] -> T | undefined
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true // строго для опциональных свойств
  }
}
```

---

## 2.2 Заменяй any на unknown

**Impact: HIGH** — сохраняет проверку типов вместо её отключения.

`any` полностью отключает проверку типов: с ним можно делать что угодно, и компилятор промолчит.
`unknown` — типобезопасная альтернатива: значение можно получить, но использовать только после
сужения (narrowing) через проверку типа.

**❌ Неправильно: any отключает все проверки**

```ts
function parseJson(raw: string): any {
  return JSON.parse(raw);
}

const data = parseJson('{"a":1}');
data.nonexistent.deeply.nested; // Компилируется, но упадёт в runtime
```

**✅ Правильно: unknown требует проверки перед использованием**

```ts
function parseJson(raw: string): unknown {
  return JSON.parse(raw);
}

const data = parseJson('{"a":1}');

if (typeof data === 'object' && data !== null && 'a' in data) {
  // Здесь data сужен, безопасно обращаться к полям
  console.log((data as { a: number }).a);
}
```

---

## 2.3 Не используй @ts-ignore / @ts-nocheck

**Impact: HIGH** — маскирует реальные ошибки типов.

`@ts-ignore` и `@ts-nocheck` отключают проверку типов для строки или файла целиком.
Это скрывает настоящие баги и копит технический долг. Если нужна точечная замена типа —
используй `@ts-expect-error` с комментарием, почему это необходимо: он выдаст ошибку,
если подавление больше не нужно.

**❌ Неправильно: молча глушит ошибку**

```ts
// @ts-ignore
const user: User = JSON.parse(raw);
```

**✅ Правильно: явная замена с объяснением или валидация**

```ts
// Если тип точно известен — assertion с комментарием
const user = JSON.parse(raw) as User;

// Лучше — валидация схемы (см. 07-validation.md)
const user = UserSchema.parse(JSON.parse(raw));
```

```ts
// @ts-expect-error — библиотека не обновила типы, заведён issue #123
const result = legacyApi.doThing();
```

---

## 2.4 Сужай типы вместо приведения (narrowing over casting)

**Impact: MEDIUM** — типобезопасность вместо слепых утверждений.

Предпочитай сужение типов через проверки (`typeof`, `instanceof`, `in`, type guards)
приведению через `as`. Сужение проверяется компилятором, `as` — нет: можно соврать системе типов.

**❌ Неправильно: слепое приведение может быть ложным**

```ts
function handle(value: unknown) {
  const obj = value as { name: string };
  console.log(obj.name.toUpperCase()); // Упадёт, если value не объект
}
```

**✅ Правильно: сужение через проверку**

```ts
function handle(value: unknown) {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    console.log((value.name as string).toUpperCase());
  }
}
```

```ts
// Type guard — переиспользуемое сужение
function hasName(value: unknown): value is { name: string } {
  return typeof value === 'object' && value !== null && 'name' in value;
}

function handle(value: unknown) {
  if (hasName(value)) {
    console.log(value.name.toUpperCase()); // value.name уже string
  }
}
```
