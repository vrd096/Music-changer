---

## 📄 `.agents/rules/06-security.md`

````markdown
# БЕЗОПАСНОСТЬ

## XSS защита

React автоматически экранирует JSX:

```typescript
// ✅ БЕЗОПАСНО
const userInput = '<script>alert("xss")</script>';
return <div>{userInput}</div>;

dangerouslySetInnerHTML только с санитайзером:
import DOMPurify from 'dompurify';

// ✅ ПРАВИЛЬНО
const sanitizedHTML = DOMPurify.sanitize(userHTML);
return <div dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />;

// ❌ ЗАПРЕЩЕНО
return <div dangerouslySetInnerHTML={{ __html: userHTML }} />;

Валидация данных
Zod для runtime валидации:

import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
});

type User = z.infer<typeof UserSchema>;

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();
  return UserSchema.parse(data);
}

Обработка ошибок
Не раскрывай детали ошибок:

// ❌ ЗАПРЕЩЕНО
try {
  await api.deleteUser(userId);
} catch (error) {
  alert(`Error: ${error.message} at ${error.stack}`);
}

// ✅ ПРАВИЛЬНО
try {
  await api.deleteUser(userId);
} catch (error) {
  console.error('Failed to delete user:', error);
  alert('Не удалось удалить пользователя. Попробуйте позже.');
}

Аутентификация
// ❌ ЗАПРЕЩЕНО (XSS уязвимость)
localStorage.setItem('token', jwtToken);

// ✅ ПРАВИЛЬНО
// Backend устанавливает httpOnly cookie
// Set-Cookie: token=xxx; HttpOnly; Secure; SameSite=Strict

Зависимости
# Проверяй уязвимости
npm audit

# Обновляй пакеты
npm audit fix

# Production builds
npm ci
```
````
