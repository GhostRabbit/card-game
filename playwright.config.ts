import { defineConfig, devices } from '@playwright/test';

/**
 * Test Configuration
 * Tests run on separate ports (5273/3100) to avoid conflicts with development servers
 */
const TEST_CLIENT_PORT = 5273;  // Separate from dev port 5173
const TEST_SERVER_PORT = 3100;  // Separate from dev port 3000

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'test-results-latest' }],
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
      command: `npm run dev:server`,
      port: TEST_SERVER_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(TEST_SERVER_PORT),
      },
    },
    {
      command: `npm run dev:client`,
      port: TEST_CLIENT_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        VITE_PORT: String(TEST_CLIENT_PORT),
        VITE_API_PORT: String(TEST_SERVER_PORT),
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
