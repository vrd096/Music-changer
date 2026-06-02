---

## 📄 `.agents/rules/04-code-quality.md`

````markdown
# КАЧЕСТВО КОДА

## TypeScript Strict Mode

tsconfig.json:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true
  }
}

Запрещённые паттерны
// ❌ ЗАПРЕЩЕНО
const data: any = fetchData();
// @ts-ignore
someFunction();
// @ts-nocheck
function badCode() { ... }
function processData(data) { ... } // неявный any
<Component style={{ color: 'red' }} /> // inline без необходимости

// ✅ ПРАВИЛЬНО
function processData(data: unknown) {
  if (typeof data === 'string') {
    return data.toUpperCase();
  }
  throw new Error('Invalid data type');
}

interface UserData {
  id: string;
  name: string;
}

function processData(data: UserData) { ... }
<Component className="text-red-500" />

Именование
// Компоненты: PascalCase
export function UserProfile() { ... }

// Функции/переменные: camelCase
const userName = 'John';
const handleClick = () => { ... };

// Константы: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';

// Типы: PascalCase с суффиксом
interface UserProps { ... }
type ButtonVariant = 'primary' | 'secondary';

// Хуки: camelCase с префиксом use
export function useAuth() { ... }

Структура файлов
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── types.ts
│   └── users/
├── components/
│   ├── ui/
│   └── layout/
├── hooks/
├── utils/
└── types/

Error Handling
Error Boundaries:
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Что-то пошло не так</div>;
    }
    return this.props.children;
  }
}

Try-catch для async:
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to fetch:', error.message);
    }
    throw error;
  }
}
```
````
