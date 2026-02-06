import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/helpers/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@lib': resolve(__dirname, 'extension/src/lib'),
      '@prompts': resolve(__dirname, 'extension/src/prompts'),
    },
  },
});
