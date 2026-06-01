import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import {
  normalizeRequestId,
  requestContextMiddleware,
  REQUEST_ID_HEADER,
} from './requestContext';

test('normalizeRequestId accepts safe caller-supplied ids only', () => {
  assert.equal(normalizeRequestId('request-abcdef12'), 'request-abcdef12');
  assert.equal(normalizeRequestId(' short '), null);
  assert.equal(normalizeRequestId('bad id with spaces'), null);
  assert.equal(normalizeRequestId('x'.repeat(129)), null);
});

test('requestContextMiddleware reuses safe request id and sets response header', () => {
  const request = {
    headers: {
      [REQUEST_ID_HEADER]: 'request-abcdef12',
    },
  } as unknown as Request;
  const headers: Record<string, string> = {};
  const response = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
  } as Response;
  let nextCalled = false;

  requestContextMiddleware(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(request.requestId, 'request-abcdef12');
  assert.equal(headers[REQUEST_ID_HEADER], 'request-abcdef12');
});
