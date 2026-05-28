import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

const src = (p: string) => resolve(__dirname, 'src', p);

export default defineConfig({
  root: 'src',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: '_locales', dest: '.' },
        { src: 'assets/icons', dest: 'assets' },
        { src: 'assets/images', dest: 'assets' },
        { src: 'assets/i18n', dest: 'assets' },
        { src: 'assets/debug/audio-worklet-test.js', dest: 'assets/debug' },
        { src: 'worklets/*', dest: '.' },
        { src: 'rules.json', dest: '.' },
        { src: 'rb.wasm', dest: '.' },
      ],
    }),
  ],
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
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': src('background/service-worker.ts'),
        'popup/index': src('popup/index.html'),
        'sidepanel/index': src('sidepanel/index.html'),
        'tabcapture/tabcapture': src('tabcapture/tabcapture.html'),
        'assets/debug/debug': src('assets/debug/debug.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
