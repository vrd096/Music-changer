import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  // Load saved theme on mount
  useEffect(() => {
    chrome.storage.sync.get('theme', (data) => {
      if (data.theme === 'light' || data.theme === 'dark') {
        setTheme(data.theme);
      }
    });
  }, []);

  // Apply theme class and persist
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    chrome.storage.sync.set({ theme });
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const isDark = theme === 'dark';

  return { theme, isDark, setTheme, toggleTheme };
}
