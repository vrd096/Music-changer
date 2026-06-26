# metadata

- **Название:** typescript-best-practices
- **Версия:** 1.0.0
- **Описание:** Навык с best practices TypeScript и JavaScript: type-first подход, функциональное программирование и надёжная обработка ошибок. Структура разбита на индекс-навигатор (SKILL.md) и тематические чанки в папке `rules/` для точечной загрузки — агент читает только релевантную тему, экономя контекст. Содержит анти-галлюцинационный протокол (проверка версии TypeScript и пакетов в package.json перед использованием API).
- **Применимость:** Написание, ревью и рефакторинг TypeScript/JavaScript кода (.ts, .tsx, .js, .jsx), настройка tsconfig.json, runtime-валидация данных, проектирование типобезопасных контрактов. Покрывает только языковые идиомы TypeScript — React-специфичные паттерны в отдельном умении `vercel-react-best-practices`.
- **Использование:** Рекомендуется установить в домашнюю директорию для доступа во всех проектах в `~/.agents/skills/` . Активируется автоматически при работе с TypeScript/JavaScript файлами. Для запуска вручную используйте `/skills typescript-best-practices`, после чего агент подгрузит нужный чанк из `rules/` по теме задачи.
- **Структура навыка:**
  - `SKILL.md` — компактный индекс-навигатор: роль агента, анти-галлюцинационный протокол, таблица из 8 чанков с маршрутами «ключевое слово → файл»
  - `rules/01-type-first.md` — CRITICAL: Make Illegal States Unrepresentable (discriminated unions, branded types, const assertions, exhaustive switch)
  - `rules/02-strictness.md` — CRITICAL: strict режим, any→unknown, запрет ts-ignore, сужение вместо as
  - `rules/03-inference.md` — HIGH: выведение типов, аннотации публичного API, ReturnType/Awaited
  - `rules/04-immutability.md` — HIGH: readonly, as const, toSorted/toReversed, глубокий readonly
  - `rules/05-error-handling.md` — HIGH: null/undefined, Result-тип, ?./??, обработка catch
  - `rules/06-generics.md` — MEDIUM: extends constraint, satisfies, mapped types, Partial/Pick/Omit
  - `rules/07-validation.md` — MEDIUM-HIGH: Zod/Valibot/yup, z.infer, safeParse/parse, композиция схем
  - `rules/08-utilities.md` — LOW: type-fest (Opaque, PartialDeep, ReadonlyDeep, SetRequired)
- **Эксперимент:**
  1. Личный эксперимент: навык позволил агенту выявить и исправить типичные проблемы в легаси-коде: заменил `any` на `unknown` с сужением, переделал размазанное состояние `{ loading, data?, error? }` в discriminated union `{ status: 'idle' | 'loading' | 'success' | 'error' }`, заменил мутирующий `.sort()` на иммутабельный `.toSorted()`, добавил exhaustive check с `never` в switch, предложил Result-тип вместо throw для ожидаемых ошибок.
  2. Протестировать этот skill можно на примерах ниже. Примеры использования:

     ````
     1. /skills typescript-best-practices

        Перед агентом код:
        ```ts
        type State = { loading: boolean; data?: User; error?: string };
        function fetchUser(id: string): any { ... }
        const sorted = users.sort((a, b) => a.name.localeCompare(b.name));
     ````

     Агент подгрузит чанки 01-type-first.md, 02-strictness.md, 04-immutability.md и предложит:

     ❌ Неправильно → ✅ Правильно:
     - { loading, data?, error? } → discriminated union со status-дискриминатором
     - any → unknown с narrowing / либо возвращаемый тип Promise<User | null>
     - users.sort() (мутирует) → users.toSorted() (иммутабельно)
     2. добавь zod-схему для ответа API /api/users

        Агент подгрузит чанк 07-validation.md и предложит схему как единый источник истины:

        ```ts
        const UserSchema = z.object({
          id: z.string().uuid(),
          email: z.string().email(),
          name: z.string().min(1),
        });
        type User = z.infer<typeof UserSchema>; // тип выводится из схемы, без дублирования
        ```

     3. почему TS ругается на этот switch?

        Перед агентом switch без default-ветки. Агент подгрузит чанк 01-type-first.md и
        объяснит правило exhaustive switch с never-проверкой, показав как сделать так,
        чтобы компилятор ловил забытые case.

     ```

     ```
