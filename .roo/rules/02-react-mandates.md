---

## 📄 `.agents/rules/02-react-mandates.md`

````markdown
# ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА REACT

## Компоненты

Базовая структура:

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  children
}: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded font-medium transition-colors',
        variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
        variant === 'secondary' && 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2 text-base',
        (disabled || loading) && 'opacity-50 cursor-not-allowed'
      )}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
Named export (кроме pages/routes):
// ✅ ПРАВИЛЬНО
export function UserCard({ user }: UserCardProps) { ... }

// ❌ ЗАПРЕЩЕНО
export default function UserCard({ user }: UserCardProps) { ... }

useEffect
// ✅ ПРАВИЛЬНО
useEffect(() => {
  const controller = new AbortController();

  async function loadData() {
    try {
      const data = await fetch(`/api/users/${userId}`, {
        signal: controller.signal
      });
      setUsers(await data.json());
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to load users:', error);
      }
    }
  }

  loadData();

  return () => controller.abort();
}, [userId]);

Всегда указывай зависимости. Возвращай cleanup для подписок и таймеров.

Мемоизация
Только при реальной необходимости:
// ✅ ПРАВИЛЬНО (передача в memoized child)
const MemoizedChild = React.memo(ChildComponent);

function Parent() {
  const config = useMemo(() => ({ id: 1, type: 'user' }), []);
  return <MemoizedChild config={config} />;
}

// ❌ ЗАПРЕЩЕНО (преждевременная оптимизация)
function Parent() {
  const config = useMemo(() => ({ id: 1 }), []);
  return <Child config={config} />;
}

Состояние
Локальное:
const [count, setCount] = useState(0);
const [isOpen, setIsOpen] = useState(false);

Глобальное (Zustand):
import { create } from 'zustand';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));

Accessibility
// ✅ ПРАВИЛЬНО
<button
  onClick={handleClick}
  aria-label="Close dialog"
  aria-expanded={isOpen}
>
  <XIcon />
</button>

// ❌ ЗАПРЕЩЕНО
<div onClick={handleClick}>
  <XIcon />
</div>
```
````
