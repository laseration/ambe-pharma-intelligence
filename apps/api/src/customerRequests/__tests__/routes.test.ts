import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { customerDemandService } from '../service';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
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

function setupAuth(context: TestContext) {
  overrideEnv(context, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
}

const authHeaders = {
  'content-type': 'application/json',
  'x-internal-api-key': 'test-secret',
  'x-internal-caller-name': 'ops-console',
};

test('GET /api/customer-requests lists customer demand signals', async (t) => {
  setupAuth(t);
  let capturedFilters: Record<string, unknown> | null = null;
  stubMethod(
    t,
    customerDemandService,
    'listSignals',
    (async (filters) => {
      capturedFilters = filters as Record<string, unknown>;
      return [
        {
          id: 'demand-1',
          status: 'NEW',
          requestType: 'SOURCE_PRODUCT',
          evidenceText: 'Can you source Pregabalin 150mg?',
        },
      ] as any;
    }) as typeof customerDemandService.listSignals,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/customer-requests?status=NEW&requestType=SOURCE_PRODUCT&take=25`,
    { headers: authHeaders },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, 'demand-1');
  assert.equal(capturedFilters?.['status'], 'NEW');
  assert.equal(capturedFilters?.['requestType'], 'SOURCE_PRODUCT');
  assert.equal(capturedFilters?.['take'], 25);
});

test('GET /api/customer-requests/:id returns signal detail', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    customerDemandService,
    'getSignal',
    (async (id) => ({
      id,
      status: 'NEW',
      requestType: 'CHECK_AVAILABILITY',
      evidenceText: 'Do you have Ozempic available?',
    }) as any) as typeof customerDemandService.getSignal,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/customer-requests/demand-1`, {
    headers: authHeaders,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.id, 'demand-1');
  assert.equal(payload.item.requestType, 'CHECK_AVAILABILITY');
});

test('PATCH /api/customer-requests/:id approve writes approved audit fields', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    customerDemandService,
    'updateSignalStatus',
    (async (id, input) => ({
      id,
      status: 'APPROVED',
      approvedByType: input.actorType,
      approvedByIdentifier: input.actorIdentifier,
      approvedAt: new Date('2026-05-05T09:00:00.000Z'),
    }) as any) as typeof customerDemandService.updateSignalStatus,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/customer-requests/demand-1`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ action: 'APPROVE' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.status, 'APPROVED');
  assert.equal(payload.item.approvedByType, 'OPERATOR');
  assert.equal(payload.item.approvedByIdentifier, 'internal-operator:ops-console');
  assert.equal(payload.item.approvedAt, '2026-05-05T09:00:00.000Z');
});

test('PATCH /api/customer-requests/:id rejects invalid actions safely', async (t) => {
  setupAuth(t);

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/customer-requests/demand-1`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ action: 'MATCH' }),
  });

  assert.equal(response.status, 422);
});

test('POST /api/customer-requests/parse-preview returns preview without storing rows', async (t) => {
  setupAuth(t);
  let parsePreviewCalls = 0;
  let updateCalls = 0;
  stubMethod(
    t,
    customerDemandService,
    'parsePreview',
    (async () => {
      parsePreviewCalls += 1;
      return {
        status: 'success',
        decision: 'accepted',
        reason: 'ok',
        result: {
          intent: 'CUSTOMER_REQUEST',
          items: [
            {
              requestType: 'SOURCE_PRODUCT',
              evidenceText: 'Can you source Pregabalin 150mg?',
              confidence: 'MEDIUM',
            },
          ],
        },
      } as any;
    }) as typeof customerDemandService.parsePreview,
  );
  stubMethod(
    t,
    customerDemandService,
    'updateSignalStatus',
    (async () => {
      updateCalls += 1;
      throw new Error('parse preview should not update items');
    }) as typeof customerDemandService.updateSignalStatus,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/customer-requests/parse-preview`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ rawText: 'Can you source Pregabalin 150mg?' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'success');
  assert.equal(payload.result.intent, 'CUSTOMER_REQUEST');
  assert.equal(parsePreviewCalls, 1);
  assert.equal(updateCalls, 0);
});
