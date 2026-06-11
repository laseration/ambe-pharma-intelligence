import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyDatabaseUrlForLocalSmoke,
  evaluateExternalIntegrationsForLocalSmoke,
} from './localSmokeSafety';

const safeIntegrationConfig = {
  openAiApiKey: '',
  startWorkersWithApi: false,
  openAiParserEnabled: false,
  openAiEmailReviewEnabled: false,
  telegramBotToken: '',
  telegramInternalChatId: '',
  telegramDryRun: true,
  telegramPollingEnabled: false,
  emailAlertsEnabled: false,
  emailInboundPollingEnabled: false,
  microsoftMailTenantId: '',
  microsoftMailClientId: '',
  microsoftMailClientSecret: '',
  microsoftGraphRefreshToken: '',
  microsoftGraphSenderMailbox: '',
  microsoftStorageTenantId: '',
  microsoftStorageClientId: '',
  microsoftStorageClientSecret: '',
  sharePointAccountOpeningEnabled: false,
  oneDriveAccountOpeningEnabled: false,
};

test('local runtime smoke accepts loopback database with disposable name', () => {
  const result = classifyDatabaseUrlForLocalSmoke(
    'postgresql://ambe:secret@localhost:5432/ambe_local?schema=public',
  );

  assert.equal(result.safe, true);
  assert.equal(result.classification, 'local');
  assert.equal(result.host, 'localhost');
  assert.equal(result.databaseName, 'ambe_local');
});

test('local runtime smoke accepts docker-compose postgres service with disposable name', () => {
  const result = classifyDatabaseUrlForLocalSmoke(
    'postgresql://ambe:secret@postgres:5432/ambe_dev',
  );

  assert.equal(result.safe, true);
  assert.equal(result.classification, 'docker-local');
  assert.equal(result.host, 'postgres');
  assert.equal(result.databaseName, 'ambe_dev');
});

test('local runtime smoke accepts demo smoke and ci database names', () => {
  const demo = classifyDatabaseUrlForLocalSmoke(
    'postgresql://ambe:secret@localhost:5432/ambe_demo?schema=public',
  );
  const smoke = classifyDatabaseUrlForLocalSmoke(
    'postgresql://ambe:secret@127.0.0.1:5432/ambe_smoke?schema=public',
  );
  const ci = classifyDatabaseUrlForLocalSmoke(
    'postgresql://ci:ci@localhost:5432/ambe_ci?schema=public',
  );

  assert.equal(demo.safe, true);
  assert.equal(demo.databaseName, 'ambe_demo');
  assert.equal(smoke.safe, true);
  assert.equal(smoke.databaseName, 'ambe_smoke');
  assert.equal(ci.safe, true);
  assert.equal(ci.databaseName, 'ambe_ci');
});

test('local runtime smoke rejects Neon database URLs', () => {
  const result = classifyDatabaseUrlForLocalSmoke(
    'postgresql://user:redacted@ep-example.eu-west-2.aws.neon.tech/ambe_demo?sslmode=require',
  );

  assert.equal(result.safe, false);
  assert.equal(result.classification, 'managed-neon');
  assert.equal(result.host, 'ep-example.eu-west-2.aws.neon.tech');
});

test('local runtime smoke rejects invalid and empty database URLs', () => {
  const invalid = classifyDatabaseUrlForLocalSmoke('not a database url');
  const empty = classifyDatabaseUrlForLocalSmoke('');
  const wrongProtocol = classifyDatabaseUrlForLocalSmoke(
    'mysql://ambe:secret@localhost:3306/ambe_local',
  );

  assert.equal(invalid.safe, false);
  assert.equal(invalid.classification, 'invalid');
  assert.equal(empty.safe, false);
  assert.equal(empty.classification, 'missing');
  assert.equal(wrongProtocol.safe, false);
  assert.equal(wrongProtocol.classification, 'invalid');
});

test('local runtime smoke rejects public-looking database domains', () => {
  const result = classifyDatabaseUrlForLocalSmoke(
    'postgresql://user:redacted@db.example.com/ambe_local',
  );

  assert.equal(result.safe, false);
  assert.equal(result.classification, 'external');
  assert.equal(result.host, 'db.example.com');
});

test('local runtime smoke classifies known managed database providers', () => {
  const cases = [
    {
      url: 'postgresql://user:redacted@project.supabase.co/ambe_local',
      classification: 'managed-supabase',
    },
    {
      url: 'postgresql://user:redacted@ambe.abc123.eu-west-2.rds.amazonaws.com/ambe_local',
      classification: 'managed-aws-rds',
    },
    {
      url: 'postgresql://user:redacted@ambe.postgres.database.azure.com/ambe_local',
      classification: 'managed-azure-postgres',
    },
  ] as const;

  for (const item of cases) {
    const result = classifyDatabaseUrlForLocalSmoke(item.url);

    assert.equal(result.safe, false);
    assert.equal(result.classification, item.classification);
  }
});

test('local runtime smoke rejects local hosts without disposable database names', () => {
  const result = classifyDatabaseUrlForLocalSmoke(
    'postgresql://ambe:secret@localhost:5432/ambe',
  );

  assert.equal(result.safe, false);
  assert.equal(result.classification, 'local');
  assert.match(result.reason, /local, dev, test, demo, smoke, or ci/i);
});

test('local runtime smoke integration guard accepts disabled integrations with present credentials', () => {
  const result = evaluateExternalIntegrationsForLocalSmoke({
    ...safeIntegrationConfig,
    openAiApiKey: 'configured-openai-key-redacted',
    microsoftMailClientId: 'configured-mail-client-redacted',
    microsoftStorageClientSecret: 'configured-storage-secret-redacted',
    telegramBotToken: 'configured-telegram-token-redacted',
  });

  assert.equal(result.safe, true);
  assert.equal(result.unsafeReasons.length, 0);
  assert.ok(result.checks.some((check) => check.status === 'present-disabled'));
});

test('local runtime smoke integration guard rejects enabled live-capable modes', () => {
  const result = evaluateExternalIntegrationsForLocalSmoke({
    ...safeIntegrationConfig,
    startWorkersWithApi: true,
    openAiApiKey: 'configured-openai-key-redacted',
    openAiParserEnabled: true,
    telegramBotToken: 'configured-telegram-token-redacted',
    telegramInternalChatId: 'configured-chat-redacted',
    telegramDryRun: false,
    emailAlertsEnabled: true,
    emailInboundPollingEnabled: true,
    sharePointAccountOpeningEnabled: true,
  });

  assert.equal(result.safe, false);
  assert.match(result.unsafeReasons.join('\n'), /OpenAI parser/i);
  assert.match(result.unsafeReasons.join('\n'), /START_WORKERS_WITH_API/i);
  assert.match(result.unsafeReasons.join('\n'), /Telegram dry-run/i);
  assert.match(result.unsafeReasons.join('\n'), /EMAIL_ALERTS_ENABLED/i);
  assert.match(
    result.unsafeReasons.join('\n'),
    /EMAIL_INBOUND_POLLING_ENABLED/i,
  );
  assert.match(result.unsafeReasons.join('\n'), /SharePoint or OneDrive/i);
});
