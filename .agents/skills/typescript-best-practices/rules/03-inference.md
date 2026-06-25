---
category: inference
priority: HIGH
triggers:
  - "выведение типов"
  - "type inference"
  - "аннотация типов"
  - "явный тип"
  - "явные аннотации"
  - "ReturnType"
  - "Parameters"
  - "Awaited"
  - "тип возвращаемого значения"
  - "дублирование типов"
  - "публичный контракт функции"
---

# Выведение и аннотирование типов

**Влияние: HIGH**

TypeScript умеет выводить типы. Избыточные аннотации засоряют код и создают точки отказа
синхронизации. Аннотируй публичные контракты, доверяй выводу в деталях реализации.

---

## 3.1 Доверяй выводу типов для локальных переменных

**Impact: MEDIUM** — меньше шума, меньше точек рассинхронизации.

Для локальных переменных, тип которых очевиден из правой части, не дублируй аннотацию.
Избыточные аннотации — лишний шум и риск рассинхронизации при изменении.

**❌ Неправильно: избыточная аннотация**

```ts
const age: number = 42;
const name: string = 'Alice';
const isActive: boolean = true;
const users: User[] = getUsers();
```

**✅ Правильно: тип выводится из значения**

```ts
const age = 42; // number
const name = 'Alice'; // string
const isActive = true; // boolean
const users = getUsers(); // User[]
```

---

## 3.2 Аннотируй сигнатуры функций (публичный API)

**Impact: HIGH** — явный контракт, стабильность рефакторинга.

Всегда аннотируй типы параметров и возвращаемого значения для **экспортируемых** функций —
это публичный контракт. Для локальных коллбэков тип часто выводится из контекста.

**❌ Неправильно: неявный контракт публичной функции**

```ts
export function createUser(data) {
  // Неявный any — тип data неизвестен
  return { id: generateId(), ...data };
}
```

**✅ Правильно: явный контракт для публичного API**

```ts
export function createUser(data: UserInput): User {
  return { id: generateId(), ...data };
}

// Локальный коллбэк — тип выводится из контекста, аннотация не нужна
users.forEach((user) => console.log(user.name)); // user: User выводится
```

---

## 3.3 Возвращаемые типы — аннотируй для публичных функций

**Impact: MEDIUM** — предотвращает случайное изменение контракта.

Аннотация возвращаемого значения для публичных функций фиксирует контракт: если внутренняя
реформация случайно изменит возвращаемый тип, компилятор сообщит об этом. Для приватных
хелперов возвращаемый тип можно не аннотировать.

**❌ Неправильно: контракт может измениться незаметно**

```ts
export function getUser(id: string) {
  // Если кто-то добавит поле — возвращаемый тип изменится без предупреждения
  return db.users.findOne({ id });
}
```

**✅ Правильно: контракт зафиксирован**

```ts
export function getUser(id: string): Promise<User | null> {
  return db.users.findOne({ id });
}
```

---

## 3.4 Не повторяй типы, используй ReturnType / Parameters / Awaited

**Impact: MEDIUM** — DRY, автоматическая синхронизация с источником.

Если тип уже определён elsewhere (возвращаемое значение функции, элемент массива, промис),
выводи его через utility types вместо дублирования.

**❌ Неправильно: тип дублирован, рассинхронизируется**

```ts
function fetchUser(): Promise<{ id: string; name: string; email: string }> {
  /* ... */
}

// Дубликат — забыл обновить при изменении fetchUser
type User = { id: string; name: string; email: string };
```

**✅ Правильно: тип выводится из источника**

```ts
function fetchUser(): Promise<{ id: string; name: string; email: string }> {
  /* ... */
}

// Всегда синхронно с fetchUser
type User = Awaited<ReturnType<typeof fetchUser>>;

// Тип элемента массива
type UserArray = User[];
type SingleUser = UserArray[number]; // User
```
