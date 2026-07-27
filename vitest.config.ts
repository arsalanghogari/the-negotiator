import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      // Modules construct clients at import time; tests stub the network, never call it.
      OPENAI_API_KEY: 'test-key',
      ELEVENLABS_API_KEY: 'test-key',
    },
  },
});
