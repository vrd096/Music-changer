---
category: validation
priority: MEDIUM-HIGH
triggers:
  - "runtime валидация"
  - "валидация данных"
  - "zod"
  - "valibot"
  - "io-ts"
  - "yup"
  - "z.infer"
  - "safeParse"
  - "parse"
  - "схема валидации"
  - "валидация API ответа"
  - "ввод пользователя"
  - "граница доверия"
  - "compose schemas"
  - "transform в схеме"
  - "extend / pick / omit"
---

# Runtime-валидация

**Влияние: MEDIUM-HIGH**

Система типов существует только на этапе компиляции. На границах доверия (API, localStorage,
ввод пользователя) данные приходят нетипизированными. Используй runtime-валидацию, чтобы
гарантировать соответствие типов во время выполнения.

> ⚠️ Перед использованием **проверь `package.json`**, какая библиотека валидации установлена
> (Zod, Valibot, TypeBox, io-ts, yup). Ниже — паттерны на примере Zod; применяй API именно
> той библиотеки, что в проекте.

---

## 7.1 Единый источник истины: схема + z.infer

**Impact: HIGH** — устраняет дублирование типов и схем.

Определяй схему валидации как единый источник истины и выводи TypeScript-тип через `z.infer`.
Не дублируй тип и схему — они рассинхронизируются.

**❌ Неправильно: тип и схема дублированы**

```ts
interface User {
  id: string;
  email: string;
  name: string;
}

// Придётся держать в синхронизации вручную
const validateUser = (data: unknown): data is User => {
  return typeof data === 'object' && data !== null && 'id' in data /* ... */;
};
```

**✅ Правильно: схема — единственный источник истины**

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});

type User = z.infer<typeof UserSchema>;
// Тип всегда синхронен со схемой
```

---

## 7.2 safeParse для ввода пользователя, parse на границах доверия

**Impact: MEDIUM** — корректная обработка ожидаемых и неожиданных ошибок.

Используй `safeParse` для пользовательского ввода, где ошибка ожидаема и должна быть показана.
Используй `parse` на границах доверия (ответ API), где невалидные данные — это баг, который
должен выбросить исключение.

**❌ Неправильно: parse на пользовательском вводе — исключение вместо валидации**

```ts
function handleSubmit(formData: unknown) {
  const user = UserSchema.parse(formData); // Выбросит при невалидных данных
  saveUser(user);
}
```

**✅ Правильно: safeParse для пользовательского ввода**

```ts
// Ввод пользователя — ошибка ожидаема, показываем её
function handleSubmit(formData: unknown) {
  const result = UserSchema.safeParse(formData);
  if (!result.success) {
    setErrors(result.error.flatten().fieldErrors);
    return;
  }
  saveUser(result.data);
}

// Граница доверия — невалидные данные это баг, выбрасываем
export async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    throw new Error(`fetch user ${id} failed: ${response.status}`);
  }
  return UserSchema.parse(await response.json());
}
```

---

## 7.3 Композиция и трансформация схем для DRY

**Impact: MEDIUM** — переиспользование и нормализация данных.

Композируй схемы через `.extend()`, `.pick()`, `.omit()`, `.merge()` для DRY. Добавляй
`.transform()` для нормализации данных в момент парсинга (trim строк, парсинг дат).

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.string().transform((s) => new Date(s)),
});

type User = z.infer<typeof UserSchema>;

// Переиспользование: схема для создания пользователя без id и createdAt
const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true });
type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Расширение: схема пользователя с аватаром
const UserWithAvatarSchema = UserSchema.extend({
  avatarUrl: z.string().url(),
});

// Нормализация: trim и lowercase email
const EmailSchema = z
  .string()
  .email()
  .transform((s) => s.trim().toLowerCase());
```
