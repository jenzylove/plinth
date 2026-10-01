import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('../packages/core/src', import.meta.url)),
      '@data': fileURLToPath(new URL('../data', import.meta.url)),
    },
  },
  server: { fs: { allow: ['..'] } },
});
