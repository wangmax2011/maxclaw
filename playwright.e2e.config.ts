// Playwright E2E Test Configuration for MaxClaw Dashboard
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://127.0.0.1:9876',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['html', { open: 'never' }], ['list']],
  webServer: {
    command: 'npm start -- dashboard',
    port: 9876,
    timeout: 120000,
    reuseExistingServer: true,
    cwd: '.',
  },
});
