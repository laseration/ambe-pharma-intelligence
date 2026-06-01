import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configurePollingWorkerStatus,
  getPollingWorkerStatus,
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
