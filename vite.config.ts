/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Builds a Chrome (Manifest V3) extension into dist/.
// - newtab.html  -> the main app (replaces Chrome's new-tab page)
// - background.js -> service worker that checks for space updates on a timer
export default defineConfig(({ command }) => {
  // A machine-wide NODE_ENV=development would otherwise ship React's slow dev build.
  if (command === 'build') process.env.NODE_ENV = 'production';
  return {
  plugins: [react()],
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        newtab: resolve(__dirname, 'newtab.html'),
        print: resolve(__dirname, 'print.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  server: { open: false },
  test: { environment: 'jsdom' },
  };
});
