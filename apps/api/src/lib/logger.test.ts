import assert from 'node:assert/strict';
import test from 'node:test';

import { logger, sanitizeLogMeta } from './logger';

test('sanitizeLogMeta redacts secrets, tokens, message bodies, and connection strings', () => {
  const sanitized = sanitizeLogMeta({
    authorization: 'Bearer live-token-value',
    databaseUrl: 'postgresql://user:password@db.example.test/app',
    nested: {
      apiKey: 'sk-live-looking-key',
      messageBody: 'Full supplier email body should not be logged.',
      safeCount: 3,
    },
    path: '/api/imports?token=unsafe-token-value',
  });

  assert.equal(sanitized.authorization, '[redacted]');
  assert.equal(sanitized.databaseUrl, '[redacted]');
  assert.deepEqual(sanitized.nested, {
    apiKey: '[redacted]',
    messageBody: '[redacted]',
    safeCount: 3,
  });
  assert.doesNotMatch(String(sanitized.path), /unsafe-token-value/);
  assert.match(String(sanitized.path), /\[redacted\]/);
});

test('logger writes redacted structured JSON', () => {
  const originalLog = console.log;
  let logged = '';

  console.log = (message?: unknown) => {
    logged = String(message);
  };

  try {
    logger.info('Connected to postgresql://user:pass@host.example/app', {
      bodyText: 'Raw attachment text',
      requestId: 'request-12345678',
    });
  } finally {
    console.log = originalLog;
  }

  const payload = JSON.parse(logged) as {
    message: string;
    meta: Record<string, unknown>;
  };

  assert.doesNotMatch(payload.message, /postgresql:\/\//);
  assert.match(payload.message, /\[redacted\]/);
  assert.equal(payload.meta.bodyText, '[redacted]');
  assert.equal(payload.meta.requestId, 'request-12345678');
});
