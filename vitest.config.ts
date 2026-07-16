import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          environment: 'node',
          benchmark: { include: ['bench/**/*.bench.ts'] },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['e2e/**/*.e2e.test.ts'],
          environment: 'node',
          testTimeout: 30000,
          hookTimeout: 30000,
          retry: 2,
          fileParallelism: false,
          benchmark: { include: [] },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        statements: 99,
        branches: 96,
        functions: 99,
        lines: 99,
      },
    },
  },
});
