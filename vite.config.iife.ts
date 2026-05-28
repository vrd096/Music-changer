import { defineConfig } from 'vite';
import { resolve } from 'path';

const src = (p: string) => resolve(__dirname, 'src', p);
const entry = process.env.VITE_IIFE_ENTRY || 'content';

export default defineConfig({
  root: 'src',
  resolve: {
    alias: {
      '@': src(''),
      '@shared': src('shared'),
      '@background': src('background'),
      '@content': src('content'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        [entry]: src(`content/${entry}.ts`),
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
      },
    },
  },
});
