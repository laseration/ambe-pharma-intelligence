import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.PLAYWRIGHT_LOCAL_RUNTIME_WEB_PORT ?? 3101);
const apiPort = Number(process.env.PLAYWRIGHT_LOCAL_RUNTIME_API_PORT ?? 4411);
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

const disabledIntegrationEnv = {
  ACCOUNT_OPENING_AUTO_FILE_SHAREPOINT_ENABLED: 'false',
  EMAIL_ALERTS_ENABLED: 'false',
  EMAIL_INBOUND_POLLING_ENABLED: 'false',
  GRAPH_MAIL_POLLING_ENABLED: 'false',
  MICROSOFT_GRAPH_CLIENT_ID: '',
  MICROSOFT_GRAPH_CLIENT_SECRET: '',
  MICROSOFT_GRAPH_REFRESH_TOKEN: '',
  MICROSOFT_GRAPH_SENDER_MAILBOX: '',
  MICROSOFT_GRAPH_TENANT_ID: '',
  MICROSOFT_MAIL_CLIENT_ID: '',
  MICROSOFT_MAIL_CLIENT_SECRET: '',
  MICROSOFT_MAIL_TENANT_ID: '',
  MICROSOFT_STORAGE_CLIENT_ID: '',
  MICROSOFT_STORAGE_CLIENT_SECRET: '',
  MICROSOFT_STORAGE_TENANT_ID: '',
  MICROSOFT_DRIVE_STORAGE_ENABLED: 'false',
  ONEDRIVE_ACCOUNT_OPENING_ENABLED: 'false',
  OPENAI_API_KEY: '',
  OPENAI_EMAIL_REVIEW_ENABLED: 'false',
  OPENAI_PARSER_ENABLED: 'false',
  SHAREPOINT_ACCOUNT_OPENING_ENABLED: 'false',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_DRY_RUN: 'true',
  TELEGRAM_INTERNAL_CHAT_ID: '',
  TELEGRAM_POLLING_ENABLED: 'false',
};

export default defineConfig({
  testDir: './e2e',
  testMatch: /pilot-local-runtime-smoke\.spec\.ts/,
  timeout: 60_000,
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
      command:
        'pnpm --dir ../.. --filter @ambe/api exec tsx src/scripts/localRuntimePilotBrowserServer.ts',
      env: {
        ...disabledIntegrationEnv,
        DATABASE_URL: process.env.DATABASE_URL ?? '',
        ENABLE_DEBUG_ROUTES: 'true',
        INTERNAL_ADMIN_API_KEY: 'local-runtime-e2e-admin-key',
        INTERNAL_API_KEY: 'local-runtime-e2e-internal-api-key',
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        PORT: String(apiPort),
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `http://127.0.0.1:${apiPort}/health`,
    },
    {
      command: `pnpm dev --hostname 127.0.0.1 --port ${webPort}`,
      env: {
        ...disabledIntegrationEnv,
        INTERNAL_API_BASE_URL: apiBaseUrl,
        INTERNAL_API_KEY: 'local-runtime-e2e-internal-api-key',
        NEXT_PUBLIC_INTERNAL_API_BASE_URL: apiBaseUrl,
        NODE_ENV: 'test',
        WEB_AUTH_PASSWORD: 'local-runtime-e2e-password',
        WEB_AUTH_ROLE: 'operator',
        WEB_AUTH_SESSION_SECRET:
          'local-runtime-e2e-session-secret-that-is-long-enough',
        WEB_AUTH_SESSION_TTL_SECONDS: '3600',
        WEB_AUTH_USERNAME: 'pilot.operator',
      },
      reuseExistingServer: false,
      timeout: 90_000,
      url: webBaseUrl,
    },
  ],
});
