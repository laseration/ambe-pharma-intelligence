import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 3100);
const mockApiPort = Number(process.env.PLAYWRIGHT_MOCK_API_PORT ?? 4410);
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const mockApiBaseUrl = `http://127.0.0.1:${mockApiPort}/api`;

export default defineConfig({
  testDir: './e2e',
  testIgnore:
    /(pilot-local-runtime-smoke|operator-commercial-workflow)\.spec\.ts/,
  timeout: 45_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `pnpm exec tsx e2e/mock-internal-api.ts --port ${mockApiPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${mockApiBaseUrl}/health`,
    },
    {
      command: `pnpm dev --hostname 127.0.0.1 --port ${webPort}`,
      env: {
        GRAPH_MAIL_POLLING_ENABLED: 'false',
        INTERNAL_API_BASE_URL: mockApiBaseUrl,
        INTERNAL_API_KEY: 'local-e2e-internal-api-key',
        MICROSOFT_DRIVE_STORAGE_ENABLED: 'false',
        NEXT_PUBLIC_INTERNAL_API_BASE_URL: mockApiBaseUrl,
        OPENAI_API_KEY: '',
        TELEGRAM_POLLING_ENABLED: 'false',
        WEB_AUTH_PASSWORD: 'local-e2e-password',
        WEB_AUTH_ROLE: 'operator',
        WEB_AUTH_SESSION_SECRET: 'local-e2e-session-secret-that-is-long-enough',
        WEB_AUTH_SESSION_TTL_SECONDS: '3600',
        WEB_AUTH_USERNAME: 'pilot.operator',
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: webBaseUrl,
    },
  ],
});
