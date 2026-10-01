import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 5000,
    hookTimeout: 5000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          exclude: ['src/FirebaseFunctionsRateLimiter.mock.integration.test.ts'],
        },
      },
    ],
  },
})
