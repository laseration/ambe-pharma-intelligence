import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPollingWorkerRuntime,
  startApiPollingWorkersIfEnabled,
  stopPollingRuntimeAndDisconnect,
  type PollingWorkerHandle,
} from './pollingWorkers';

function createTestWorker(name: string, events: string[]): PollingWorkerHandle {
  return {
    start() {
      events.push(`${name}:start`);
    },
    stop() {
      events.push(`${name}:stop`);
    },
  };
}

function createTestLogger() {
  const entries: Array<{ level: 'info' | 'warn'; message: string; meta?: any }> =
    [];

  return {
    entries,
    logger: {
      info(message: string, meta?: any) {
        entries.push({ level: 'info', message, meta });
      },
      warn(message: string, meta?: any) {
        entries.push({ level: 'warn', message, meta });
      },
    },
  };
}

function createRuntimeConfig(overrides: Record<string, unknown> = {}) {
  return {
    startWorkersWithApi: false,
    telegramPollingEnabled: false,
    telegramBotToken: '',
    telegramPollingIntervalMs: 5000,
    emailInboundPollingEnabled: false,
    emailInboundPollingIntervalMs: 30000,
    microsoftGraphSenderMailbox: '',
    ...overrides,
  };
}

test('API startup leaves polling workers stopped when START_WORKERS_WITH_API is disabled', () => {
  const events: string[] = [];
  const { logger, entries } = createTestLogger();
  const runtime = createPollingWorkerRuntime({
    config: createRuntimeConfig(),
    createTelegramWorker: () => createTestWorker('telegram', events),
    createEmailWorker: () => createTestWorker('email', events),
    isTelegramActive: () => true,
    isEmailActive: () => true,
    logger,
  });

  const started = startApiPollingWorkersIfEnabled(
    runtime,
    { startWorkersWithApi: false },
    logger,
  );

  assert.deepEqual(started, []);
  assert.deepEqual(events, []);
  assert.equal(
    entries.some((entry) =>
      entry.message.includes('disabled in the API process'),
    ),
    true,
  );
});

test('worker runtime starts and stops configured polling workers', () => {
  const events: string[] = [];
  const { logger } = createTestLogger();
  const runtime = createPollingWorkerRuntime({
    config: createRuntimeConfig({
      telegramPollingEnabled: true,
      telegramBotToken: 'redacted-token',
      emailInboundPollingEnabled: true,
      microsoftGraphSenderMailbox: 'inbox@example.test',
    }),
    createTelegramWorker: () => createTestWorker('telegram', events),
    createEmailWorker: () => createTestWorker('email', events),
    isTelegramActive: () => true,
    isEmailActive: () => true,
    logger,
  });

  assert.deepEqual(runtime.startConfiguredWorkers(), [
    'telegram',
    'email-inbound',
  ]);
  runtime.stop();

  assert.deepEqual(events, [
    'telegram:start',
    'email:start',
    'telegram:stop',
    'email:stop',
  ]);
});

test('incomplete optional polling configuration logs safe warnings only', () => {
  const events: string[] = [];
  const { logger, entries } = createTestLogger();
  const runtime = createPollingWorkerRuntime({
    config: createRuntimeConfig({
      telegramPollingEnabled: true,
      telegramBotToken: '',
      emailInboundPollingEnabled: true,
      microsoftGraphSenderMailbox: 'secret-mailbox@example.test',
    }),
    createTelegramWorker: () => createTestWorker('telegram', events),
    createEmailWorker: () => createTestWorker('email', events),
    isTelegramActive: () => false,
    isEmailActive: () => false,
    logger,
  });

  runtime.logConfiguration('worker');

  const serializedWarnings = JSON.stringify(
    entries.filter((entry) => entry.level === 'warn'),
  );
  assert.match(serializedWarnings, /TELEGRAM_BOT_TOKEN/);
  assert.match(serializedWarnings, /Microsoft Graph mail configuration/);
  assert.doesNotMatch(serializedWarnings, /secret-mailbox@example\.test/);
});

test('worker shutdown stops polling workers before disconnecting Prisma', async () => {
  const events: string[] = [];
  const { logger } = createTestLogger();
  await stopPollingRuntimeAndDisconnect({
    disconnect: async () => {
      events.push('db:disconnect');
    },
    logger,
    processRole: 'worker',
    runtime: {
      logConfiguration() {
        events.push('runtime:log');
      },
      startConfiguredWorkers() {
        events.push('runtime:start');
        return [];
      },
      stop() {
        events.push('runtime:stop');
      },
    },
    signal: 'SIGTERM',
  });

  assert.deepEqual(events, ['runtime:stop', 'db:disconnect']);
});
