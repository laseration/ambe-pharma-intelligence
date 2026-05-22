import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCorrelationId, correlationLogMeta } from '../correlation';

test('correlation ID is deterministic from Graph external message ID', () => {
  const input = {
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: 'graph-message-1',
    messageId: '<internet-message-1>',
  };

  assert.equal(
    buildCorrelationId(input),
    buildCorrelationId({ ...input, messageId: '<different-message-id>' }),
  );
  assert.equal(buildCorrelationId(input), 'MICROSOFT_GRAPH:graph-message-1');
});

test('correlation ID falls back to message ID and source fingerprint', () => {
  assert.equal(
    buildCorrelationId({ messageId: '<internet-message-1>' }),
    'MESSAGE:<internet-message-1>',
  );
  assert.equal(
    buildCorrelationId({
      sourceFingerprint: '1234567890abcdef9999999999999999',
    }),
    'FINGERPRINT:1234567890abcdef',
  );
  assert.deepEqual(correlationLogMeta({}), {});
});
