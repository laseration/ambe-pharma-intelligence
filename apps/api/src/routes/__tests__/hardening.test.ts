import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { buyExecutionService } from '../../buyExecutions/service';
import { env } from '../../config/env';

function overrideEnv(
  context: TestContext,
  overrides: Partial<typeof env>,
) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function stubMethod<
  TObject extends Record<string, any>,
  TKey extends keyof TObject,
>(context: TestContext, object: TObject, key: TKey, replacement: TObject[TKey]) {
  const original = object[key];
  object[key] = replacement;
  context.after(() => {
    object[key] = original;
  });
}

async function startServer(context: TestContext) {
  const app = createApp();
  const server = app.listen(0);

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test('missing and invalid internal API keys are rejected for protected API routes', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
    enableDebugRoutes: true,
  });
  const baseUrl = await startServer(t);

  const missingAuthResponse = await fetch(`${baseUrl}/api/buy-executions`);
  assert.equal(missingAuthResponse.status, 401);

  const invalidAuthResponse = await fetch(`${baseUrl}/api/buy-executions`, {
    headers: {
      'x-internal-api-key': 'wrong-secret',
    },
  });
  assert.equal(invalidAuthResponse.status, 401);
});

test('valid internal API key is accepted for authenticated read routes', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(t, buyExecutionService, 'listBuyExecutions', async () => []);

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/buy-executions`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [],
  });
});

test('protected mutating routes derive audit actor metadata from authenticated request context', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(
    t,
    buyExecutionService,
    'updateBuyExecution',
    (async (_id, input) =>
      ({
        id: 'execution-1',
        ...input,
      }) as any) as typeof buyExecutionService.updateBuyExecution,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/buy-executions/execution-1`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': 'test-secret',
      'x-internal-caller-name': 'ops-console',
    },
    body: JSON.stringify({
      note: 'received update',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    item: {
      id: 'execution-1',
      note: 'received update',
      actorType: 'OPERATOR',
      actorIdentifier: 'internal-operator:ops-console',
    },
  });
});

test('invalid query, params, and body values are rejected with 422', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const baseUrl = await startServer(t);
  const headers = {
    'content-type': 'application/json',
    'x-internal-api-key': 'test-secret',
  };

  const invalidQueryResponse = await fetch(`${baseUrl}/api/automation/evaluation?days=abc`, {
    headers,
  });
  assert.equal(invalidQueryResponse.status, 422);

  const invalidParamResponse = await fetch(`${baseUrl}/api/sources/profiles/%20`, {
    headers,
  });
  assert.equal(invalidParamResponse.status, 422);

  const invalidBodyResponse = await fetch(`${baseUrl}/api/buy-executions/execution-1`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      actorType: 'OPERATOR',
      receivedAt: 'not-a-date',
    }),
  });
  assert.equal(invalidBodyResponse.status, 422);
});

test('null service lookups become 404 and unexpected service failures become 500', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });

  const baseUrl = await startServer(t);
  const headers = {
    'x-internal-api-key': 'test-secret',
  };

  stubMethod(t, buyExecutionService, 'getBuyExecution', async () => null);
  const notFoundResponse = await fetch(`${baseUrl}/api/buy-executions/execution-1`, {
    headers,
  });
  assert.equal(notFoundResponse.status, 404);

  stubMethod(t, buyExecutionService, 'getBuyExecution', async () => {
    throw new Error('boom');
  });
  const serverErrorResponse = await fetch(`${baseUrl}/api/buy-executions/execution-1`, {
    headers,
  });
  assert.equal(serverErrorResponse.status, 500);
});

test('debug, send-capable, and inbound-update routes are not publicly accessible', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
    enableDebugRoutes: true,
  });
  const baseUrl = await startServer(t);

  const debugWithoutAuth = await fetch(`${baseUrl}/api/debug/env`);
  assert.equal(debugWithoutAuth.status, 401);

  const debugWithOperatorKey = await fetch(`${baseUrl}/api/debug/env`, {
    headers: {
      'x-internal-api-key': 'test-secret',
      'x-internal-role': 'admin',
    },
  });
  assert.equal(debugWithOperatorKey.status, 403);

  const debugWithAdminKey = await fetch(`${baseUrl}/api/debug/env`, {
    headers: {
      'x-internal-api-key': 'admin-secret',
    },
  });
  assert.equal(debugWithAdminKey.status, 200);

  const sendWithoutAuth = await fetch(`${baseUrl}/api/email/daily-summary/send`, {
    method: 'POST',
  });
  assert.equal(sendWithoutAuth.status, 401);

  const inboundWithoutAuth = await fetch(`${baseUrl}/api/email/inbound/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'supplier@example.com',
    }),
  });
  assert.equal(inboundWithoutAuth.status, 401);
});

test('debug routes can be disabled outside safe environments', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
    enableDebugRoutes: false,
  });
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/api/debug/env`, {
    headers: {
      'x-internal-api-key': 'admin-secret',
    },
  });

  assert.equal(response.status, 404);
});
