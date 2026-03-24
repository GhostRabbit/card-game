import { defineConfig, devices } from '@playwright/test';

const TEST_CLIENT_PORT = 5273;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.ui.spec.ts',
  testIgnore: ['**/e2e/**', '**/ui/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'test-results-ui-latest', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: `http://localhost:${TEST_CLIENT_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:client',
      port: TEST_CLIENT_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        VITE_PORT: String(TEST_CLIENT_PORT),
        VITE_API_PORT: '3100',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
