import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import {
  configurePollingWorkerStatus,
  resetPollingWorkerStatusesForTests,
} from '../../polling/status';
import {
  createSystemReadinessService,
  systemReadinessService,
  type SystemReadinessReport,
} from '../readiness';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function stubMethod<
  TObject extends Record<string, any>,
  TKey extends keyof TObject,
>(
  context: TestContext,
  object: TObject,
  key: TKey,
  replacement: TObject[TKey],
) {
  const original = object[key];
  object[key] = replacement;
  context.after(() => {
    object[key] = original;
  });
}

async function startServer(context: TestContext) {
  const app = createApp();
  const server = app.listen(0);

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test('system readiness report contains safe setup signals without secret values', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'production',
    databaseUrl:
      'postgresql://secret-user:secret-pass@db.example.test/ambe?sslmode=require',
    databaseHost: 'db.example.test',
    internalApiKey: 'internal-api-secret',
    internalAdminApiKey: 'internal-admin-secret',
    emailInboundPollingEnabled: true,
    emailInboundAllowedSenders: ['supplier.example'],
    emailInboundSupplierMappings: [
      {
        pattern: 'supplier.example',
        supplierName: 'Supplier Example',
      },
    ],
    microsoftMailTenantId: 'tenant-secret',
    microsoftMailClientId: 'client-secret',
    microsoftMailClientSecret: 'mail-client-secret',
    microsoftGraphRefreshToken: 'refresh-token-secret',
    microsoftGraphSenderMailbox: 'mailbox@example.test',
    microsoftMailCredentialSource: 'mail-specific',
    microsoftStorageTenantId: 'storage-tenant-secret',
    microsoftStorageClientId: 'storage-client-secret',
    microsoftStorageClientSecret: 'storage-client-secret',
    microsoftStorageCredentialSource: 'storage-specific',
    sharePointAccountOpeningEnabled: true,
    accountOpeningStorageProvider: 'SHAREPOINT',
    sharePointSiteId: 'sharepoint-site-secret',
    sharePointDriveId: 'sharepoint-drive-secret',
    telegramBotToken: 'telegram-token-secret',
    telegramInternalChatId: 'telegram-chat-secret',
    telegramPollingEnabled: true,
    telegramAllowedUserIds: ['123456'],
    telegramAllowedChatIds: ['-100123456'],
    openAiApiKey: 'openai-key-secret',
    openAiParserEnabled: true,
    openAiEmailReviewEnabled: true,
  });

  const service = createSystemReadinessService({
    now: () => new Date('2026-05-31T12:00:00.000Z'),
    pingDatabase: async () => undefined,
  });
  const report = await service.getReadinessReport();
  const serialized = JSON.stringify(report);

  assert.equal(report.generatedAt, '2026-05-31T12:00:00.000Z');
  assert.equal(report.status, 'ready');
  assert.equal(
    report.checks.some((check) => check.key === 'database'),
    true,
  );
  assert.doesNotMatch(serialized, /secret-user/);
  assert.doesNotMatch(serialized, /secret-pass/);
  assert.doesNotMatch(serialized, /postgresql:\/\//);
  assert.doesNotMatch(serialized, /internal-api-secret/);
  assert.doesNotMatch(serialized, /internal-admin-secret/);
  assert.doesNotMatch(serialized, /mail-client-secret/);
  assert.doesNotMatch(serialized, /refresh-token-secret/);
  assert.doesNotMatch(serialized, /telegram-token-secret/);
  assert.doesNotMatch(serialized, /telegram-chat-secret/);
  assert.doesNotMatch(serialized, /openai-key-secret/);
  assert.doesNotMatch(serialized, /sharepoint-site-secret/);
  assert.doesNotMatch(serialized, /sharepoint-drive-secret/);
});

test('system readiness reports configured but unreachable database as warning', async (t) => {
  overrideEnv(t, {
    databaseUrl: 'postgresql://redacted@db.example.test/ambe',
    databaseHost: 'db.example.test',
  });

  const service = createSystemReadinessService({
    pingDatabase: async () => {
      throw new Error('connection failed');
    },
  });
  const report = await service.getReadinessReport();
  const databaseCheck = report.checks.find((check) => check.key === 'database');

  assert.equal(databaseCheck?.status, 'warning');
  assert.equal(databaseCheck?.details.configured, true);
  assert.equal(databaseCheck?.details.reachable, false);
});

test('system readiness endpoint is protected and returns the safe report shape', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const safeReport: SystemReadinessReport = {
    generatedAt: '2026-05-31T12:00:00.000Z',
    status: 'warning',
    checks: [
      {
        key: 'database',
        title: 'Database',
        status: 'warning',
        meaning: 'A database URL is configured, but the read-only ping failed.',
        nextAction: 'Check database connectivity.',
        envVars: ['DATABASE_URL'],
        details: {
          configured: true,
          reachable: false,
        },
      },
    ],
  };
  stubMethod(
    t,
    systemReadinessService,
    'getReadinessReport',
    async () => safeReport,
  );

  const baseUrl = await startServer(t);
  const unauthenticatedResponse = await fetch(
    `${baseUrl}/api/system/readiness`,
  );
  assert.equal(unauthenticatedResponse.status, 401);

  const authenticatedResponse = await fetch(`${baseUrl}/api/system/readiness`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });
  assert.equal(authenticatedResponse.status, 200);
  assert.deepEqual(await authenticatedResponse.json(), {
    item: safeReport,
  });
});

test('system worker status endpoint is protected and returns safe runtime counters', async (t) => {
  resetPollingWorkerStatusesForTests();
  t.after(() => {
    resetPollingWorkerStatusesForTests();
  });
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  configurePollingWorkerStatus('email-inbound', {
    enabled: true,
    configured: true,
    active: true,
    intervalMs: 60000,
  });

  const baseUrl = await startServer(t);
  const unauthenticatedResponse = await fetch(`${baseUrl}/api/system/workers`);
  assert.equal(unauthenticatedResponse.status, 401);

  const authenticatedResponse = await fetch(`${baseUrl}/api/system/workers`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });
  assert.equal(authenticatedResponse.status, 200);
  const payload = await authenticatedResponse.json();
  assert.equal(Array.isArray(payload.items), true);
  const emailWorker = payload.items.find(
    (item: { name?: string }) => item.name === 'email-inbound',
  );
  assert.equal(emailWorker.enabled, true);
  assert.equal(emailWorker.configured, true);
  assert.equal(emailWorker.intervalMs, 60000);
  assert.equal(emailWorker.lastError, null);
  assert.doesNotMatch(JSON.stringify(payload), /secret/);
});
