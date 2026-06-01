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
