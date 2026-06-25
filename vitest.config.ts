/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const src = (p: string) => resolve(__dirname, 'src', p);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': src(''),
      '@shared': src('shared'),
      '@background': src('background'),
      '@content': src('content'),
      '@popup': src('popup'),
      '@sidepanel': src('sidepanel'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
