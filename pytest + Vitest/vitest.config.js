/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // setupFiles paths are resolved relative to project root (where package.json is)
    setupFiles: ['./pytest + Vitest/tests/frontend/setup.js'],
    css: false,
  },
});
