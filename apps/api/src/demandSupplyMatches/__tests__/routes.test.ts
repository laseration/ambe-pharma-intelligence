import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { demandSupplyMatchService } from '../service';

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

test('GET /api/demand-supply-matches lists match candidates', async (t) => {
  setupAuth(t);
  let capturedFilters: Record<string, unknown> | null = null;
  stubMethod(
    t,
    demandSupplyMatchService,
    'listDemandSupplyMatches',
    (async (filters) => {
      capturedFilters = filters as Record<string, unknown>;
      return [
        {
          id: 'match-1',
          status: 'NEW',
          confidence: 'HIGH',
          reason: 'TARGET_PRICE_MET',
        },
      ] as any;
    }) as typeof demandSupplyMatchService.listDemandSupplyMatches,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/demand-supply-matches?status=NEW&confidence=HIGH&productId=product-1&take=25`,
    { headers: authHeaders },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, 'match-1');
  assert.equal(capturedFilters?.['status'], 'NEW');
  assert.equal(capturedFilters?.['confidence'], 'HIGH');
  assert.equal(capturedFilters?.['productId'], 'product-1');
  assert.equal(capturedFilters?.['take'], 25);
});

test('GET /api/demand-supply-matches/:id returns match detail', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    demandSupplyMatchService,
    'getDemandSupplyMatch',
    (async (id) => ({
      id,
      status: 'NEW',
      confidence: 'MEDIUM',
      rationale: 'Approved customer demand exists for this product.',
    }) as any) as typeof demandSupplyMatchService.getDemandSupplyMatch,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/demand-supply-matches/match-1`, {
    headers: authHeaders,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.id, 'match-1');
  assert.equal(payload.item.confidence, 'MEDIUM');
});

test('POST /api/demand-supply-matches/generate-preview returns candidates without writing rows', async (t) => {
  setupAuth(t);
  let previewCalls = 0;
  let generateCalls = 0;
  stubMethod(
    t,
    demandSupplyMatchService,
    'previewDemandSupplyMatches',
    (async () => {
      previewCalls += 1;
      return {
        generatedAt: new Date('2026-05-06T09:00:00.000Z'),
        matchCount: 1,
        matches: [{ customerDemandSignalId: 'demand-1', supplierPriceItemId: 'price-1' }],
      } as any;
    }) as typeof demandSupplyMatchService.previewDemandSupplyMatches,
  );
  stubMethod(
    t,
    demandSupplyMatchService,
    'generateDemandSupplyMatches',
    (async () => {
      generateCalls += 1;
      throw new Error('preview should not generate rows');
    }) as typeof demandSupplyMatchService.generateDemandSupplyMatches,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/demand-supply-matches/generate-preview`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ lookbackDays: 45 }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.matchCount, 1);
  assert.equal(previewCalls, 1);
  assert.equal(generateCalls, 0);
});

test('POST /api/demand-supply-matches/generate writes match candidates', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    demandSupplyMatchService,
    'generateDemandSupplyMatches',
    (async () => ({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      createdOrUpdatedCount: 1,
      matches: [{ id: 'match-1', status: 'NEW' }],
    }) as any) as typeof demandSupplyMatchService.generateDemandSupplyMatches,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/demand-supply-matches/generate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ take: 10 }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.createdOrUpdatedCount, 1);
  assert.equal(payload.matches[0].id, 'match-1');
});

test('PATCH /api/demand-supply-matches/:id reviews match candidate with audit actor', async (t) => {
  setupAuth(t);
  stubMethod(
    t,
    demandSupplyMatchService,
    'updateDemandSupplyMatch',
    (async (id, input) => ({
      id,
      status: 'REVIEWED',
      reviewedByType: input.actorType,
      reviewedByIdentifier: input.actorIdentifier,
      reviewedAt: new Date('2026-05-06T09:00:00.000Z'),
    }) as any) as typeof demandSupplyMatchService.updateDemandSupplyMatch,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/demand-supply-matches/match-1`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ action: 'REVIEW', note: 'Looks useful' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.status, 'REVIEWED');
  assert.equal(payload.item.reviewedByType, 'OPERATOR');
  assert.equal(payload.item.reviewedByIdentifier, 'internal-operator:ops-console');
});

test('PATCH /api/demand-supply-matches/:id rejects promote actions safely', async (t) => {
  setupAuth(t);

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/demand-supply-matches/match-1`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ action: 'PROMOTE_TO_TRADE' }),
  });

  assert.equal(response.status, 422);
});
