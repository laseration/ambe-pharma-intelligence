import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { inventoryService } from '../service';

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
>(
  context: TestContext,
  object: TObject,
  key: TKey,
  replacement: TObject[TKey],
) {
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

function configureAuth(context: TestContext) {
  overrideEnv(context, {
    nodeEnv: 'test',
    internalViewerApiKey: 'viewer-secret',
    internalApiKey: 'operator-secret',
    internalAdminApiKey: 'admin-secret',
  });
}

test('/api/inventory is a real viewer-readable endpoint', async (t) => {
  configureAuth(t);
  stubMethod(t, inventoryService, 'listInventory', async () => ({
    items: [
      {
        id: 'snapshot-1',
        product: {
          id: 'product-1',
          name: 'Atorvastatin',
          sku: null,
          manufacturer: null,
          strength: null,
          dosageForm: null,
          packSize: null,
        },
        supplier: null,
        warehouseCode: 'MAIN',
        snapshotDate: '2026-06-10T00:00:00.000Z',
        ageDays: 1,
        quantityOnHand: 8,
        quantityReserved: 0,
        quantityAvailable: 8,
        unitCost: null,
        totalValue: null,
        lowStock: true,
        stale: false,
        source: {
          rawProductName: 'Atorvastatin',
          rawSupplierName: null,
        },
      },
    ],
    page: 1,
    limit: 50,
    hasMore: false,
  }));

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/inventory`, {
    headers: {
      'x-internal-api-key': 'viewer-secret',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, 'snapshot-1');
  assert.equal(payload.message, undefined);
  assert.notEqual(payload.message, 'inventory endpoint placeholder');
});

test('/api/inventory/stock-risk returns deterministic reasons', async (t) => {
  configureAuth(t);
  stubMethod(t, inventoryService, 'listStockRisk', async () => [
    {
      product: {
        id: 'product-1',
        name: 'Atorvastatin',
        sku: null,
        manufacturer: null,
        strength: null,
        dosageForm: null,
        packSize: null,
      },
      supplier: null,
      warehouseCode: 'MAIN',
      snapshotDate: '2026-06-10T00:00:00.000Z',
      quantityAvailable: 3,
      recentSalesQuantity: 12,
      openOpportunityCount: 1,
      riskScore: 75,
      reasons: [
        {
          code: 'LOW_STOCK',
          message: 'Available quantity is low.',
        },
      ],
    },
  ]);

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/inventory/stock-risk`, {
    headers: {
      'x-internal-api-key': 'viewer-secret',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].reasons[0].code, 'LOW_STOCK');
});

test('/api/inventory rejects unauthenticated and invalid query requests', async (t) => {
  configureAuth(t);
  const baseUrl = await startServer(t);

  const unauthenticated = await fetch(`${baseUrl}/api/inventory`);
  assert.equal(unauthenticated.status, 401);

  const invalidQuery = await fetch(
    `${baseUrl}/api/inventory?lowStockOnly=yes&limit=500`,
    {
      headers: {
        'x-internal-api-key': 'viewer-secret',
      },
    },
  );
  assert.equal(invalidQuery.status, 422);
  const payload = await invalidQuery.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});
