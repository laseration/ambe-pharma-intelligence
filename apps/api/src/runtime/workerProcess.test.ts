import assert from 'node:assert/strict';
import test from 'node:test';

import type { PollingWorkerRuntime } from './pollingWorkers';
import {
  startDefaultIdleKeepAlive,
  startWorkerProcess,
  type WorkerProcessDependencies,
} from './workerProcess';

function createTestLogger() {
  const entries: Array<{ level: string; message: string; meta?: any }> = [];
  return {
    entries,
    logger: {
      info: (message: string, meta?: any) =>
        entries.push({ level: 'info', message, meta }),
      warn: (message: string, meta?: any) =>
        entries.push({ level: 'warn', message, meta }),
      error: (message: string, meta?: any) =>
        entries.push({ level: 'error', message, meta }),
    },
  };
}

function createTestConfig(
  overrides: Partial<WorkerProcessDependencies['config']> = {},
): WorkerProcessDependencies['config'] {
  return {
    databaseUrl: 'postgresql://test',
    databaseHost: 'test-host',
    nodeEnv: 'test',
    logLevel: 'info',
    telegramPollingEnabled: false,
    emailInboundPollingEnabled: false,
    ...overrides,
  };
}

function createFakeRuntime(
  startedWorkers: string[],
  events: string[],
): PollingWorkerRuntime {
  return {
    logConfiguration() {
      events.push('runtime:logConfiguration');
    },
    startConfiguredWorkers() {
      events.push('runtime:startConfiguredWorkers');
      return [...startedWorkers];
    },
    stop() {
      events.push('runtime:stop');
    },
  };
}

function buildDeps(
  opts: {
    startedWorkers?: string[];
    config?: Partial<WorkerProcessDependencies['config']>;
    connect?: () => Promise<void>;
    verifyReadiness?: () => Promise<void>;
  } = {},
) {
  const events: string[] = [];
  const { logger, entries } = createTestLogger();
  const counts = { keepAliveStarted: 0, keepAliveStopped: 0 };

  const deps: WorkerProcessDependencies = {
    config: createTestConfig(opts.config),
    connect:
      opts.connect ??
      (async () => {
        events.push('connect');
      }),
    disconnect: async () => {
      events.push('disconnect');
    },
    verifyReadiness:
      opts.verifyReadiness ??
      (async () => {
        events.push('verifyReadiness');
      }),
    configureStatusStore: () => {
      events.push('configureStatusStore');
    },
    createRuntime: () => createFakeRuntime(opts.startedWorkers ?? [], events),
    startIdleKeepAlive: () => {
      counts.keepAliveStarted += 1;
      events.push('keepAlive:start');
      return {
        stop: () => {
          counts.keepAliveStopped += 1;
          events.push('keepAlive:stop');
        },
      };
    },
    logger,
  };

  return { deps, events, entries, counts };
}

test('worker stays alive in idle mode when no pollers are active', async () => {
  const { deps, events, entries, counts } = buildDeps({ startedWorkers: [] });

  const handle = await startWorkerProcess(deps);

  assert.equal(handle.idle, true);
  assert.deepEqual(handle.startedWorkers, []);
  // The idle keepalive holds the process open instead of exiting (no crash loop).
  assert.equal(counts.keepAliveStarted, 1);
  assert.equal(counts.keepAliveStopped, 0);
  // Full safe-startup ordering, ending in idle keepalive (no poller loop kicked off).
  assert.deepEqual(events, [
    'connect',
    'verifyReadiness',
    'configureStatusStore',
    'runtime:logConfiguration',
    'runtime:startConfiguredWorkers',
    'keepAlive:start',
  ]);
  // It clearly logs that polling is disabled and nothing is being polled.
  assert.equal(
    entries.some(
      (entry) =>
        /idle mode/i.test(entry.message) &&
        /no Graph calls/i.test(entry.message) &&
        entry.meta?.emailInboundPollingEnabled === false,
    ),
    true,
  );
});

test('worker starts the normal polling runtime when a poller is active', async () => {
  const { deps, events, counts } = buildDeps({
    startedWorkers: ['email-inbound'],
    config: { emailInboundPollingEnabled: true },
  });

  const handle = await startWorkerProcess(deps);

  assert.equal(handle.idle, false);
  assert.deepEqual(handle.startedWorkers, ['email-inbound']);
  // No idle keepalive when a real poller keeps the loop alive.
  assert.equal(counts.keepAliveStarted, 0);
  assert.ok(events.includes('runtime:startConfiguredWorkers'));
  assert.ok(!events.includes('keepAlive:start'));
});

test('worker startup rejects when DATABASE_URL is missing (caller exits non-zero)', async () => {
  const { deps, events } = buildDeps({ config: { databaseUrl: '' } });

  await assert.rejects(() => startWorkerProcess(deps), /DATABASE_URL/);
  // It fails before connecting or starting anything.
  assert.deepEqual(events, []);
});

test('worker startup rejects when database readiness fails', async () => {
  const { deps, events, counts } = buildDeps({
    verifyReadiness: async () => {
      throw new Error('Database readiness check failed for InboundEmail.');
    },
  });

  await assert.rejects(
    () => startWorkerProcess(deps),
    /readiness check failed/i,
  );
  // Connected, then failed readiness — no workers started, no keepalive.
  assert.deepEqual(events, ['connect']);
  assert.equal(counts.keepAliveStarted, 0);
});

test('worker shutdown stops the idle keepalive, then the runtime, then disconnects', async () => {
  const { deps, events, counts } = buildDeps({ startedWorkers: [] });
  const handle = await startWorkerProcess(deps);

  events.length = 0;
  await handle.shutdown('SIGTERM');

  assert.equal(counts.keepAliveStopped, 1);
  assert.deepEqual(events, ['keepAlive:stop', 'runtime:stop', 'disconnect']);
});

test('worker shutdown without an idle keepalive still stops runtime and disconnects', async () => {
  const { deps, events, counts } = buildDeps({ startedWorkers: ['telegram'] });
  const handle = await startWorkerProcess(deps);

  events.length = 0;
  await handle.shutdown('SIGINT');

  assert.equal(counts.keepAliveStopped, 0);
  assert.deepEqual(events, ['runtime:stop', 'disconnect']);
});

test('default idle keepalive creates a stoppable timer', () => {
  const keepAlive = startDefaultIdleKeepAlive(60_000);
  assert.equal(typeof keepAlive.stop, 'function');
  // Clear the interval so this test process can exit cleanly.
  keepAlive.stop();
});
