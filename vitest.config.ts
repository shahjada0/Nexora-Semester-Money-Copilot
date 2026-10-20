import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each test file gets its own in-memory sandbox DB; keep files isolated.
    pool: 'forks',
    env: { NEXORA_DB: ':memory:', FX_OFFLINE: '1', GROQ_API_KEY: '', COOLING_OFF_SECONDS: '30' },
  },
});
