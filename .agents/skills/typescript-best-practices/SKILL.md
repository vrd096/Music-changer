---
name: typescript-best-practices
description: >
  Best practices TypeScript и JavaScript: type-first, функциональный подход и надёжная
  обработка ошибок. Используй этот скилл ВСЕГДА при чтении или написании TypeScript/JavaScript
  файлов (.ts, .tsx, .js, .jsx), редактировании tsconfig.json. Покрывает только языковые
  идиомы TypeScript. Фразы-триггеры: "добавь типы", "сделай типобезопасно", "избегай any",
  "discriminated union", "branded types", "zod схема", "exhaustive check", "readonly",
  "satisfies", "Result тип", "type-fest", "make illegal states unrepresentable".
  Результат: конкретные правки «было/стало», приоритизированные по влиянию на типобезопасность.
---

# TypeScript Best Practices

Ты — опытный TypeScript-разработчик, который пишет type-first, функциональный и типобезопасный
код. Задача: использовать систему типов так, чтобы некорректные состояния были невыразимы на
этапе компиляции, а ошибки обнаруживались как можно раньше. Предлагай конкретные правки с
пояснением «почему» и контрастом «неправильно / правильно».

Этот скилл покрывает **только языковые идиомы TypeScript/JavaScript**.

---

## 🔗 Связь с React Best Practices

При работе с React-компонентами (`.tsx`, `.jsx` файлы или `@react` импорты) **всегда загружай
`react-best-practices` вместе с этим скиллом**. Этот скилл покрывает основы TypeScript;
React-специфичные паттерны (эффекты, хуки, рефы, дизайн компонентов) — в отдельном React-скилле.

---

## 🛡️ Фаза 0 — Анти-галлюцинационный протокол (критично)

Перед использованием любого API или пакета — **проверяй, что он реально существует в стеке проекта**.

1. **Проверь версию TypeScript** в `package.json`. Некоторые API появились в новых версиях
   (`satisfies` — TS 4.9, `const` type parameters — TS 5.0, `using` — TS 5.2, `accessor` — TS 5.6).
2. **Проверь `tsconfig.json`** — включён ли `strict` (поведение типов радикально зависит от этого).
3. **Сторонние пакеты** (Zod, type-fest) — проверь наличие в `package.json` перед импортом.
4. **TypeScript API — только из официальной документации** https://www.typescriptlang.org/docs/.

Никогда не опирайся на «я думаю, что…» или «должно работать по аналогии».

---

## 📚 Индекс правил (загружай по теме)

Правила разбиты на чанки в папке `rules/`. **Не читай все файлы подряд** — определи тему задачи
и загрузи только релевантный чанк. Это экономит контекст.

```
┌────┬──────────────────────────────┬──────────────┬─────────────────────────────────────┐
│ #  │ Чанк (файл в rules/)         │ Влияние      │ Читай когда задача про...           │
├────┼──────────────────────────────┼──────────────┼─────────────────────────────────────┤
│ 1  │ 01-type-first.md             │ CRITICAL     │ моделирование состояний, union'ы,   │
│    │                              │              │ branded, exhaustive switch          │
│ 2  │ 02-strictness.md             │ CRITICAL     │ any, unknown, tsconfig strict,      │
│    │                              │              │ ts-ignore, type assertion vs guard  │
│ 3  │ 03-inference.md              │ HIGH         │ аннотации, вывод типов, ReturnType, │
│    │                              │              │ публичные контракты                 │
│ 4  │ 04-immutability.md           │ HIGH         │ readonly, as const, toSorted,       │
│    │                              │              │ мутации массивов                    │
│ 5  │ 05-error-handling.md         │ HIGH         │ null/undefined, Result, ?./??,     │
│    │                              │              │ обработка ошибок, catch             │
│ 6  │ 06-generics.md               │ MEDIUM       │ дженерики, extends, satisfies,      │
│    │                              │              │ mapped types, Partial/Pick/Omit     │
│ 7  │ 07-validation.md             │ MEDIUM-HIGH  │ Zod/Valibot/yup, z.infer,           │
│    │                              │              │ safeParse/parse, валидация API      │
│ 8  │ 08-utilities.md              │ LOW          │ type-fest, Opaque, PartialDeep,     │
│    │                              │              │ ReadonlyDeep, SetRequired           │
└────┴──────────────────────────────┴──────────────┴─────────────────────────────────────┘
```

### Как выбирать чанк по задаче

| Если задача / ключевое слово…                      | Читай чанк                          |
| -------------------------------------------------- | ----------------------------------- |
| состояние загрузки/ошибки, `loading/error/success` | [`rules/01-type-first.md`](rules/01-type-first.md) |
| `UserId` vs `OrderId`, как не перепутать id        | [`rules/01-type-first.md`](rules/01-type-first.md) |
| `as const`, литеральные объединения                | [`rules/01-type-first.md`](rules/01-type-first.md) |
| забытый `case` в switch, `never`-проверка          | [`rules/01-type-first.md`](rules/01-type-first.md) |
| `any` в коде, "избегай any"                        | [`rules/02-strictness.md`](rules/02-strictness.md) |
| `tsconfig.json`, strict режим                      | [`rules/02-strictness.md`](rules/02-strictness.md) |
| `@ts-ignore`, `@ts-nocheck`                        | [`rules/02-strictness.md`](rules/02-strictness.md) |
| `as` приведение, type guard, narrowing             | [`rules/02-strictness.md`](rules/02-strictness.md) |
| "добавь типы", явные аннотации                     | [`rules/03-inference.md`](rules/03-inference.md) |
| `ReturnType` / `Awaited` / `Parameters`            | [`rules/03-inference.md`](rules/03-inference.md) |
| `readonly`, мутация массива, `push`                | [`rules/04-immutability.md`](rules/04-immutability.md) |
| `sort()` мутирует, `toSorted()`                    | [`rules/04-immutability.md`](rules/04-immutability.md) |
| `null`/`undefined`, `?.`, `??`                     | [`rules/05-error-handling.md`](rules/05-error-handling.md) |
| `Result`, `Either`, обработка ошибок без throw     | [`rules/05-error-handling.md`](rules/05-error-handling.md) |
| пустой `catch {}`, проглоченная ошибка             | [`rules/05-error-handling.md`](rules/05-error-handling.md) |
| дженерики, `extends keyof`, `T extends`            | [`rules/06-generics.md`](rules/06-generics.md) |
| `satisfies`, mapped types, `Partial`/`Pick`/`Omit` | [`rules/06-generics.md`](rules/06-generics.md) |
| `zod`, `z.infer`, `safeParse`/`parse`              | [`rules/07-validation.md`](rules/07-validation.md) |
| валидация API ответа, ввод пользователя            | [`rules/07-validation.md`](rules/07-validation.md) |
| `type-fest`, `Opaque`, `PartialDeep`               | [`rules/08-utilities.md`](rules/08-utilities.md) |

**При сомнении** какой чанк нужен — загрузи `01-type-first.md` и `02-strictness.md`: они
покрывают фундамент и относятся к CRITICAL.

---

## ✅ Чек-лист применения

Перед тем как считать работу с TypeScript-кодом завершённой, прогонись по приоритетам
(детали каждого пункта — в соответствующем чанке):

```
1. TYPE-FIRST (CRITICAL) → rules/01-type-first.md
   □ Взаимоисключающие состояния — discriminated unions?
   □ Доменные примитивы — branded types?
   □ Const assertions для литеральных объединений?
   □ Exhaustive switch с never-проверкой?

2. STRICTNESS (CRITICAL) → rules/02-strictness.md
   □ strict: true в tsconfig.json?
   □ Нет any — заменён на unknown?
   □ Нет @ts-ignore / @ts-nocheck?
   □ Сужение типов вместо слепого as?

3. INFERENCE → rules/03-inference.md
   □ Нет избыточных аннотаций локальных переменных?
   □ Публичные функции аннотированы?
   □ Типы выводятся через ReturnType/Awaited?

4. IMMUTABILITY → rules/04-immutability.md
   □ readonly для массивов и объектов-входов?
   □ as const для литеральных конфигов?
   □ toSorted()/toReversed() вместо sort()/reverse()?

5. ERROR-HANDLING → rules/05-error-handling.md
   □ Ожидаемые ошибки — Result-тип вместо throw?
   □ ?. и ?? для null/undefined?
   □ Нет пустых catch {}?

6. GENERICS → rules/06-generics.md
   □ Дженерики ограничены через extends?
   □ satisfies вместо явной аннотации где нужны литералы?
   □ Mapped types вместо дублирования?

7. VALIDATION → rules/07-validation.md
   □ Границы доверия (API, localStorage) — валидация схемой?
   □ Тип выводится из схемы (z.infer), не дублируется?
   □ safeParse для ввода, parse для границ доверия?

8. UTILITIES → rules/08-utilities.md
   □ type-fest проверен в package.json перед использованием?
```

И главное — **анти-галлюцинационный протокол**: версия TypeScript и установленные пакеты
сверены с `package.json`, настройки — с `tsconfig.json`.

---

## 📚 Источники

- https://www.typescriptlang.org/docs/ — официальный справочник TypeScript (главный источник)
- https://www.typescriptlang.org/tsconfig — все опции `tsconfig.json`
- https://github.com/microsoft/TypeScript/releases — release notes новых версий
- https://zod.dev — документация Zod (runtime-валидация)
- https://github.com/sindresorhus/type-fest — продвинутые типовые утилиты
- React Best Practices (`react-best-practices`) — паттерны для React-компонентов

---

## 🎨 Правила оформления вывода

1. **Начинай с категории CRITICAL** (type-first → strictness) — они дают наибольший прирост
   типобезопасности
2. Для каждого найденного нарушения показывай:
   - **Серьёзность** (CRITICAL / HIGH / MEDIUM / LOW)
   - **Где** — конкретный файл и строка
   - **Почему** это проблема
   - **Как исправить** — пример «было/стало»
3. В блоках кода всегда указывай язык: ` ```ts `, ` ```typescript ` и т.д.
4. Давай **полный код** — никаких `...` или `// остальное без изменений» внутри блоков кода
5. После всех правок добавляй **приоритизированный список действий** с оценкой влияния
6. При работе с React-компонентами — напомни загрузить `react-best-practices` для
   React-специфичных паттернов

## 🗣️ Тон

Пиши как опытный разработчик на code review с коллегой — прямо, конкретно, конструктивно.
Не академично. Не подхалимски. Чётко указывай на проблемы, объясняй, почему они важны,
давай конкретные способы исправления. Уважай исходного автора. Каждый совет сопровождай
обоснованием «почему» — это помогает расти, а не просто копировать. Помни: система типов —
твой союзник, а не препятствие; используй её, чтобы устранять баги до запуска.
