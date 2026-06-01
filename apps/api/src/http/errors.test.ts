import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import { BadRequestError, errorHandler, ValidationError } from './errors';

type MockResponse = Response & {
  body?: unknown;
  statusCodeValue?: number;
  headers: Record<string, string>;
};

function createResponse(): MockResponse {
  const response = {
    headers: {},
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCodeValue = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as MockResponse;

  return response;
}

function createRequest(): Request {
  return {
    method: 'POST',
    originalUrl: '/api/imports?token=unsafe-token-value',
    url: '/api/imports',
    requestId: 'request-abcdef12',
  } as Request;
}

function silenceConsole<T>(callback: () => T): T {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = () => undefined;
  console.error = () => undefined;

  try {
    return callback();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

test('errorHandler returns standardized safe payload with request id and next action', () => {
  const response = createResponse();

  silenceConsole(() => {
    errorHandler(
      new BadRequestError('Bad supplier row.', {
        bodyText: 'full raw supplier email',
        field: 'price',
      }),
      createRequest(),
      response,
      (() => undefined) as NextFunction,
    );
  });

  assert.equal(response.statusCodeValue, 400);
  assert.deepEqual(response.body, {
    error: {
      message: 'Bad supplier row.',
      code: 'BAD_REQUEST',
      requestId: 'request-abcdef12',
      nextAction: 'Check the submitted fields and try again.',
      details: {
        bodyText: '[redacted]',
        field: 'price',
      },
    },
  });
});

test('errorHandler does not expose stack traces for unexpected errors', () => {
  const response = createResponse();

  silenceConsole(() => {
    errorHandler(
      new Error('Database password=unsafe-secret failed.'),
      createRequest(),
      response,
      (() => undefined) as NextFunction,
    );
  });

  assert.equal(response.statusCodeValue, 500);
  assert.deepEqual(response.body, {
    error: {
      message: 'Internal server error.',
      code: 'INTERNAL_ERROR',
      requestId: 'request-abcdef12',
      nextAction:
        'Check the API logs with this request id, then verify database and integration configuration.',
    },
  });
});

test('errorHandler keeps validation details but redacts sensitive fields', () => {
  const response = createResponse();

  silenceConsole(() => {
    errorHandler(
      new ValidationError('Request validation failed.', {
        fieldErrors: {
          token: ['invalid'],
          supplierName: ['required'],
        },
      }),
      createRequest(),
      response,
      (() => undefined) as NextFunction,
    );
  });

  assert.equal(response.statusCodeValue, 422);
  assert.deepEqual(response.body, {
    error: {
      message: 'Request validation failed.',
      code: 'VALIDATION_ERROR',
      requestId: 'request-abcdef12',
      nextAction: 'Check the submitted fields and try again.',
      details: {
        fieldErrors: {
          token: '[redacted]',
          supplierName: ['required'],
        },
      },
    },
  });
});
