import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configurePollingWorkerStatusStore,
  configurePollingWorkerStatus,
  getPollingWorkerStatus,
  listPollingWorkerStatusesWithStore,
  markPollingRunFinished,
  markPollingRunStarted,
  markPollingWorkerStarted,
  markPollingWorkerStopped,
  recordPollingWorkerError,
  resetPollingWorkerStatusesForTests,
  type PollingWorkerSnapshot,
} from '../status';

test('polling worker status records lifecycle counters and safe errors', () => {
  resetPollingWorkerStatusesForTests();

  configurePollingWorkerStatus('email-inbound', {
    enabled: true,
    configured: true,
    active: true,
    intervalMs: 30000,
  });
  markPollingWorkerStarted('email-inbound');
  markPollingRunStarted('email-inbound');
  recordPollingWorkerError(
    'email-inbound',
    new Error(`failed with token=${'x'.repeat(600)}`),
  );
  markPollingRunFinished('email-inbound', {
    itemsSeen: 3,
    itemsProcessed: 1,
    itemsSkipped: 1,
    itemsFailed: 1,
    duplicateItemsSkipped: 1,
  });
  markPollingWorkerStopped('email-inbound');

  const status = getPollingWorkerStatus('email-inbound');
  assert.equal(status.enabled, true);
  assert.equal(status.configured, true);
  assert.equal(status.active, true);
  assert.equal(status.running, false);
  assert.equal(status.inFlight, false);
  assert.equal(status.intervalMs, 30000);
  assert.equal(status.totalRuns, 1);
  assert.equal(status.totalItemsSeen, 3);
  assert.equal(status.totalItemsProcessed, 1);
  assert.equal(status.totalItemsSkipped, 1);
  assert.equal(status.totalItemsFailed, 1);
  assert.equal(status.duplicateItemsSkipped, 1);
  assert.equal(status.consecutiveFailures, 1);
  assert.equal(
    status.lastError?.startsWith('failed with token=[redacted]'),
    true,
  );
  assert.ok((status.lastError?.length ?? 0) <= 500);
});

test('polling worker status can persist safe snapshots through an optional store', async () => {
  resetPollingWorkerStatusesForTests();
  let persistedSnapshot: unknown;
  let resolvePersisted: (() => void) | null = null;
  const persisted = new Promise<void>((resolve) => {
    resolvePersisted = resolve;
  });

  configurePollingWorkerStatusStore({
    async upsertStatus(snapshot) {
      persistedSnapshot = snapshot;
      resolvePersisted?.();
    },
    async listStatuses() {
      return [
        {
          name: 'email-inbound',
          enabled: true,
          configured: true,
          active: true,
          running: true,
          inFlight: false,
          intervalMs: 30000,
          startedAt: '2026-05-31T10:00:00.000Z',
          stoppedAt: null,
          lastRunStartedAt: '2026-05-31T10:01:00.000Z',
          lastRunFinishedAt: '2026-05-31T10:01:01.000Z',
          lastSuccessAt: '2026-05-31T10:01:01.000Z',
          lastFailureAt: null,
          lastErrorAt: '2026-05-31T10:02:00.000Z',
          lastError: 'previous safe error',
          consecutiveFailures: 1,
          totalRuns: 7,
          totalItemsSeen: 10,
          totalItemsProcessed: 8,
          totalItemsSkipped: 1,
          totalItemsFailed: 1,
          duplicateItemsSkipped: 1,
        },
      ];
    },
  });

  recordPollingWorkerError(
    'email-inbound',
    new Error('Graph failed authorization=secret-value'),
  );
  await persisted;

  assert.match(JSON.stringify(persistedSnapshot), /authorization=\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(persistedSnapshot), /secret-value/);

  const statuses = await listPollingWorkerStatusesWithStore();
  const emailStatus = statuses.find(
    (status) => status.name === 'email-inbound',
  );

  assert.equal(emailStatus?.totalRuns, 7);
  assert.equal(emailStatus?.totalItemsProcessed, 8);
  assert.equal(emailStatus?.lastError?.includes('redacted'), true);
});

test('lastFailureAt is stamped on a failed run and left alone on a successful run', () => {
  resetPollingWorkerStatusesForTests();

  // A successful run records lastSuccessAt and never touches lastFailureAt.
  markPollingRunStarted('email-inbound');
  markPollingRunFinished('email-inbound', { itemsSeen: 1, itemsProcessed: 1 });
  let status = getPollingWorkerStatus('email-inbound');
  assert.equal(status.lastFailureAt, null);
  assert.ok(status.lastSuccessAt);
  assert.equal(status.consecutiveFailures, 0);

  // A run that ends with failed items stamps lastFailureAt to the finish time.
  markPollingRunStarted('email-inbound');
  status = markPollingRunFinished('email-inbound', {
    itemsSeen: 1,
    itemsFailed: 1,
  });
  assert.ok(
    status.lastFailureAt,
    'lastFailureAt should be set after a failed run',
  );
  assert.equal(status.lastFailureAt, status.lastRunFinishedAt);
  assert.equal(status.consecutiveFailures, 1);
});

test('a recovered successful run clears consecutive failures and records success', () => {
  resetPollingWorkerStatusesForTests();

  for (let i = 0; i < 3; i += 1) {
    markPollingRunStarted('email-inbound');
    markPollingRunFinished('email-inbound', { itemsSeen: 1, itemsFailed: 1 });
  }
  let status = getPollingWorkerStatus('email-inbound');
  assert.equal(status.consecutiveFailures, 3);
  const failureAt = status.lastFailureAt;
  assert.ok(failureAt);

  markPollingRunStarted('email-inbound');
  status = markPollingRunFinished('email-inbound', {
    itemsSeen: 1,
    itemsProcessed: 1,
  });
  assert.equal(status.consecutiveFailures, 0);
  assert.ok(status.lastSuccessAt);
  // The historical failure timestamp is retained for observability.
  assert.equal(status.lastFailureAt, failureAt);
});

test('persisted worker truth is not clobbered by API-process memory defaults', async () => {
  resetPollingWorkerStatusesForTests();

  // Split deployment: this API process never started the email poller, so its
  // in-memory snapshot is the initial all-false/zero default. The worker
  // process persisted a live, running, partially-failing snapshot.
  const persisted: PollingWorkerSnapshot = {
    name: 'email-inbound',
    enabled: true,
    configured: true,
    active: true,
    running: true,
    inFlight: true,
    intervalMs: 30000,
    startedAt: '2026-06-15T10:00:00.000Z',
    stoppedAt: null,
    lastRunStartedAt: '2026-06-15T10:05:00.000Z',
    lastRunFinishedAt: '2026-06-15T10:04:30.000Z',
    lastSuccessAt: '2026-06-15T10:04:30.000Z',
    lastFailureAt: '2026-06-15T10:03:00.000Z',
    lastErrorAt: '2026-06-15T10:03:00.000Z',
    lastError: 'previous safe error',
    consecutiveFailures: 2,
    totalRuns: 12,
    totalItemsSeen: 30,
    totalItemsProcessed: 24,
    totalItemsSkipped: 3,
    totalItemsFailed: 3,
    duplicateItemsSkipped: 2,
  };

  configurePollingWorkerStatusStore({
    async upsertStatus() {},
    async listStatuses() {
      return [persisted];
    },
  });

  const statuses = await listPollingWorkerStatusesWithStore();
  const email = statuses.find((status) => status.name === 'email-inbound');

  assert.equal(email?.enabled, true);
  assert.equal(email?.configured, true);
  assert.equal(email?.active, true);
  assert.equal(email?.running, true);
  assert.equal(email?.inFlight, true);
  assert.equal(email?.consecutiveFailures, 2);
  assert.equal(email?.totalRuns, 12);
  assert.equal(email?.totalItemsProcessed, 24);
  assert.equal(email?.lastFailureAt, '2026-06-15T10:03:00.000Z');
});

test('worker status works memory-only when no persisted store is configured', async () => {
  resetPollingWorkerStatusesForTests();

  configurePollingWorkerStatus('email-inbound', {
    enabled: true,
    configured: true,
    active: true,
    intervalMs: 30000,
  });
  markPollingWorkerStarted('email-inbound');

  const direct = getPollingWorkerStatus('email-inbound');
  assert.equal(direct.enabled, true);
  assert.equal(direct.running, true);

  // With no store configured, the store-backed accessor falls back to memory.
  const statuses = await listPollingWorkerStatusesWithStore();
  const email = statuses.find((status) => status.name === 'email-inbound');
  assert.equal(email?.enabled, true);
  assert.equal(email?.running, true);
});
