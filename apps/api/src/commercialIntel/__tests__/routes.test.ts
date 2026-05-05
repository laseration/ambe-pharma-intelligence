import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { commercialIntelService } from '../service';

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

test('GET /api/commercial-intel lists commercial intel items', async (t) => {
  setupAuth(t);
  let capturedFilters: Record<string, unknown> | null = null;
  stubMethod(
    t,
    commercialIntelService,
    'listItems',
    (async (filters) => {
      capturedFilters = filters as Record<string, unknown>;
      return [
        {
          id: 'intel-1',
          status: 'NEW',
          itemType: 'BUYER_DEMAND_SIGNAL',
          evidenceText: 'Customer X wants Dr Reddy stock.',
        },
      ] as any;
    }) as typeof commercialIntelService.listItems,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/commercial-intel?status=NEW&itemType=BUYER_DEMAND_SIGNAL&take=25`,
    {
      headers: authHeaders,
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, 'intel-1');
  assert.equal(capturedFilters?.['status'], 'NEW');
  assert.equal(capturedFilters?.['itemType'], 'BUYER_DEMAND_SIGNAL');
  assert.equal(capturedFilters?.['take'], 25);
});

test('GET /api/commercial-intel/:id returns commercial intel detail', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    commercialIntelService,
    'getItem',
    (async (id) => ({
      id,
      status: 'NEW',
      itemType: 'SUPPLIER_RELIABILITY_NOTE',
      evidenceText: "Don't trust Medline on insulin.",
    }) as any) as typeof commercialIntelService.getItem,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/commercial-intel/intel-1`, {
    headers: authHeaders,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.id, 'intel-1');
  assert.equal(payload.item.itemType, 'SUPPLIER_RELIABILITY_NOTE');
});

test('PATCH /api/commercial-intel/:id approve writes approved audit fields', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    commercialIntelService,
    'updateItemStatus',
    (async (id, input) => ({
      id,
      status: 'APPROVED',
      approvedByType: input.actorType,
      approvedByIdentifier: input.actorIdentifier,
      approvedAt: new Date('2026-05-05T09:00:00.000Z'),
    }) as any) as typeof commercialIntelService.updateItemStatus,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/commercial-intel/intel-1`, {
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

test('PATCH /api/commercial-intel/:id reject writes rejected audit fields', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    commercialIntelService,
    'updateItemStatus',
    (async (id, input) => ({
      id,
      status: 'REJECTED',
      rejectedByType: input.actorType,
      rejectedByIdentifier: input.actorIdentifier,
      rejectedAt: new Date('2026-05-05T10:00:00.000Z'),
      reviewReason: input.note,
    }) as any) as typeof commercialIntelService.updateItemStatus,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/commercial-intel/intel-1`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ action: 'REJECT', note: 'Too vague' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.status, 'REJECTED');
  assert.equal(payload.item.rejectedByType, 'OPERATOR');
  assert.equal(payload.item.rejectedByIdentifier, 'internal-operator:ops-console');
  assert.equal(payload.item.rejectedAt, '2026-05-05T10:00:00.000Z');
  assert.equal(payload.item.reviewReason, 'Too vague');
});

test('PATCH /api/commercial-intel/:id rejects invalid actions safely', async (t) => {
  setupAuth(t);

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/commercial-intel/intel-1`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ action: 'DELETE' }),
  });

  assert.equal(response.status, 422);
});

test('POST /api/commercial-intel/parse-preview returns parser preview without storing rows', async (t) => {
  setupAuth(t);
  let parsePreviewCalls = 0;
  let updateCalls = 0;
  stubMethod(
    t,
    commercialIntelService,
    'parsePreview',
    (async () => {
      parsePreviewCalls += 1;
      return {
        status: 'success',
        decision: 'accepted',
        reason: 'ok',
        result: {
          intent: 'COMMERCIAL_INTEL',
          items: [
            {
              itemType: 'MARKET_PRICE_INTEL',
              evidenceText: 'Ozempic stock is tight.',
              confidence: 'MEDIUM',
            },
          ],
        },
      } as any;
    }) as typeof commercialIntelService.parsePreview,
  );
  stubMethod(
    t,
    commercialIntelService,
    'updateItemStatus',
    (async () => {
      updateCalls += 1;
      throw new Error('parse preview should not update items');
    }) as typeof commercialIntelService.updateItemStatus,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/commercial-intel/parse-preview`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ rawText: 'Ozempic stock is tight.' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'success');
  assert.equal(payload.result.intent, 'COMMERCIAL_INTEL');
  assert.equal(parsePreviewCalls, 1);
  assert.equal(updateCalls, 0);
});
