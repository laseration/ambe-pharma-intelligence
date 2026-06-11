import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { customerService } from '../service';

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

const customerSummary = {
  id: 'customer-1',
  name: 'Central Pharmacy',
  legalEntityName: 'Central Pharmacy Ltd',
  country: 'GB',
  city: 'London',
  isActive: true,
  contactEmailPreview: '***@central.example',
  contactEmailDomain: 'central.example',
  lastSaleAt: '2026-06-01T00:00:00.000Z',
  salesRecordCount: 2,
  openOpportunityCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

test('/api/customers is a real viewer-readable endpoint', async (t) => {
  configureAuth(t);
  stubMethod(t, customerService, 'listCustomers', async () => ({
    items: [customerSummary],
    page: 1,
    limit: 50,
    hasMore: false,
  }));

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/customers`, {
    headers: {
      'x-internal-api-key': 'viewer-secret',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, 'customer-1');
  assert.equal(payload.message, undefined);
  assert.notEqual(payload.message, 'customers endpoint placeholder');
});

test('/api/customers/:id returns customer detail with safe context', async (t) => {
  configureAuth(t);
  stubMethod(t, customerService, 'getCustomer', async () => ({
    ...customerSummary,
    recentSales: [],
    openOpportunities: [],
    tradeEnquiries: [
      {
        id: 'rfq-1',
        status: 'NEW',
        priority: 'HIGH',
        companyName: 'Central Pharmacy Ltd',
        contactName: 'Buyer One',
        contactEmailPreview: '***@central.example',
        country: 'GB',
        productName: 'Atorvastatin',
        strength: '20mg',
        packSize: '28',
        quantityRequired: '50',
        requiredBy: null,
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  }));

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/customers/customer-1`, {
    headers: {
      'x-internal-api-key': 'viewer-secret',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(
    payload.item.tradeEnquiries[0].contactEmailPreview,
    '***@central.example',
  );
  assert.doesNotMatch(JSON.stringify(payload), /buyer@central\.example/);
});

test('/api/customers/contact-opportunities is read-only and deterministic', async (t) => {
  configureAuth(t);
  stubMethod(t, customerService, 'listContactOpportunities', async () => [
    {
      customer: customerSummary,
      suggestedPriority: 'HIGH',
      lastSaleAt: '2026-06-01T00:00:00.000Z',
      recentProducts: [
        {
          productId: 'product-1',
          productName: 'Atorvastatin',
          lastSaleAt: '2026-06-01T00:00:00.000Z',
          quantity: 10,
        },
      ],
      openOpportunities: [],
      tradeEnquiries: [],
      reasons: [
        {
          code: 'OPEN_OPPORTUNITY',
          message: '1 open opportunity signal references this customer.',
        },
      ],
    },
  ]);

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/customers/contact-opportunities`,
    {
      headers: {
        'x-internal-api-key': 'viewer-secret',
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].suggestedPriority, 'HIGH');
  assert.equal(payload.items[0].reasons[0].code, 'OPEN_OPPORTUNITY');
});

test('/api/customers rejects unauthenticated and invalid query requests', async (t) => {
  configureAuth(t);
  const baseUrl = await startServer(t);

  const unauthenticated = await fetch(`${baseUrl}/api/customers`);
  assert.equal(unauthenticated.status, 401);

  const invalidQuery = await fetch(
    `${baseUrl}/api/customers?activeOnly=yes&limit=500`,
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
