import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import type { BuyerTradeEnquiry, Prisma } from '@prisma/client';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { db } from '../../lib/db';
import { resetPublicTradeEnquiryRateLimitForTests } from '../routes';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
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

function createBuyerTradeEnquiryRecord(
  overrides: Partial<BuyerTradeEnquiry> = {},
): BuyerTradeEnquiry {
  return {
    id: 'trade-enquiry-1',
    status: 'NEW',
    priority: 'NORMAL',
    companyName: 'Buyer Pharmacy Ltd',
    contactName: 'Procurement Manager',
    contactEmail: 'buyer@example.test',
    contactPhone: null,
    businessType: null,
    country: null,
    productName: 'Comparator requirement',
    strength: null,
    packSize: null,
    quantityRequired: null,
    targetMarket: null,
    requiredBy: null,
    documentationNotes: null,
    additionalNotes: null,
    source: 'PUBLIC_TRADE_ACCESS',
    reviewNotes: null,
    statusUpdatedAt: null,
    statusUpdatedBy: null,
    createdAt: new Date('2026-06-07T09:00:00.000Z'),
    updatedAt: new Date('2026-06-07T09:00:00.000Z'),
    ...overrides,
  };
}

function installBuyerTradeEnquiryDbMock(context: TestContext) {
  const originalCreate = db.buyerTradeEnquiry.create;
  const originalFindFirst = db.buyerTradeEnquiry.findFirst;
  const originalFindMany = db.buyerTradeEnquiry.findMany;
  const originalFindUnique = db.buyerTradeEnquiry.findUnique;
  const originalUpdate = db.buyerTradeEnquiry.update;
  let createCount = 0;
  let records: BuyerTradeEnquiry[] = [
    createBuyerTradeEnquiryRecord({
      id: 'qa-new-enquiry',
      status: 'NEW',
      priority: 'NORMAL',
      companyName: 'QA Trade Buyer Ltd',
      contactName: 'QA Buyer',
      contactEmail: 'qa.trade.buyer@example.test',
      contactPhone: '+44 20 0000 0100',
      businessType: 'Pharmacy',
      country: 'United Kingdom',
      productName: 'QA Comparator Product 10mg tablets',
      strength: '10mg',
      packSize: '30 tablets',
      quantityRequired: '120 packs',
      targetMarket: 'United Kingdom',
      documentationNotes: 'Automated QA RFQ - no patient data',
      additionalNotes: 'Automated QA RFQ - no patient data',
      createdAt: new Date('2026-06-07T09:00:00.000Z'),
    }),
    createBuyerTradeEnquiryRecord({
      id: 'qa-urgent-reviewing-enquiry',
      status: 'REVIEWING',
      priority: 'URGENT',
      companyName: 'Urgent QA Buyer Ltd',
      contactEmail: 'urgent.qa.buyer@example.test',
      productName: 'Urgent comparator requirement',
      createdAt: new Date('2026-06-06T09:00:00.000Z'),
    }),
  ];

  db.buyerTradeEnquiry.findFirst = (async (
    args?: Prisma.BuyerTradeEnquiryFindFirstArgs,
  ) => {
    const contactEmail = args?.where?.contactEmail;
    const companyName = args?.where?.companyName;
    const productName = args?.where?.productName;

    return (
      records.find(
        (item) =>
          item.contactEmail === contactEmail &&
          item.companyName === companyName &&
          item.productName === productName,
      ) ?? null
    );
  }) as typeof db.buyerTradeEnquiry.findFirst;

  db.buyerTradeEnquiry.create = (async ({
    data,
  }: Prisma.BuyerTradeEnquiryCreateArgs) => {
    createCount += 1;
    const record = createBuyerTradeEnquiryRecord({
      id: `trade-enquiry-${createCount}`,
      priority: (data.priority as BuyerTradeEnquiry['priority']) ?? 'NORMAL',
      companyName: data.companyName as string,
      contactName: data.contactName as string,
      contactEmail: data.contactEmail as string,
      contactPhone: (data.contactPhone as string | null | undefined) ?? null,
      businessType: (data.businessType as string | null | undefined) ?? null,
      country: (data.country as string | null | undefined) ?? null,
      productName: data.productName as string,
      strength: (data.strength as string | null | undefined) ?? null,
      packSize: (data.packSize as string | null | undefined) ?? null,
      quantityRequired:
        (data.quantityRequired as string | null | undefined) ?? null,
      targetMarket: (data.targetMarket as string | null | undefined) ?? null,
      requiredBy: (data.requiredBy as Date | null | undefined) ?? null,
      documentationNotes:
        (data.documentationNotes as string | null | undefined) ?? null,
      additionalNotes:
        (data.additionalNotes as string | null | undefined) ?? null,
    });
    records = [record, ...records];
    return record;
  }) as unknown as typeof db.buyerTradeEnquiry.create;

  db.buyerTradeEnquiry.findMany = (async (
    args?: Prisma.BuyerTradeEnquiryFindManyArgs,
  ) => {
    let items = [...records];

    if (args?.where?.status) {
      items = items.filter((item) => item.status === args.where?.status);
    }

    if (args?.where?.priority) {
      items = items.filter((item) => item.priority === args.where?.priority);
    }

    const companyFilter = args?.where?.companyName;
    if (
      companyFilter &&
      typeof companyFilter === 'object' &&
      'contains' in companyFilter &&
      typeof companyFilter.contains === 'string'
    ) {
      const query = companyFilter.contains.toLowerCase();
      items = items.filter((item) =>
        item.companyName.toLowerCase().includes(query),
      );
    }

    const createdAtFilter = args?.where?.createdAt as
      | { gte?: Date; lte?: Date }
      | undefined;
    if (createdAtFilter?.gte) {
      items = items.filter(
        (item) => item.createdAt.getTime() >= createdAtFilter.gte!.getTime(),
      );
    }

    if (createdAtFilter?.lte) {
      items = items.filter(
        (item) => item.createdAt.getTime() <= createdAtFilter.lte!.getTime(),
      );
    }

    items.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return typeof args?.take === 'number' ? items.slice(0, args.take) : items;
  }) as typeof db.buyerTradeEnquiry.findMany;

  db.buyerTradeEnquiry.findUnique = (async ({
    where,
  }: Prisma.BuyerTradeEnquiryFindUniqueArgs) =>
    records.find((item) => item.id === where.id) ??
    null) as unknown as typeof db.buyerTradeEnquiry.findUnique;

  db.buyerTradeEnquiry.update = (async ({
    where,
    data,
  }: Prisma.BuyerTradeEnquiryUpdateArgs) => {
    const existing = records.find((item) => item.id === where.id);
    if (!existing) {
      throw new Error('Trade enquiry not found during update.');
    }

    const updated = {
      ...existing,
      status:
        (data.status as BuyerTradeEnquiry['status'] | undefined) ??
        existing.status,
      reviewNotes:
        (data.reviewNotes as string | null | undefined) ?? existing.reviewNotes,
      statusUpdatedAt:
        (data.statusUpdatedAt as Date | null | undefined) ??
        existing.statusUpdatedAt,
      statusUpdatedBy:
        (data.statusUpdatedBy as string | null | undefined) ??
        existing.statusUpdatedBy,
      updatedAt: new Date('2026-06-07T12:00:00.000Z'),
    };
    records = records.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  }) as unknown as typeof db.buyerTradeEnquiry.update;

  context.after(() => {
    db.buyerTradeEnquiry.create = originalCreate;
    db.buyerTradeEnquiry.findFirst = originalFindFirst;
    db.buyerTradeEnquiry.findMany = originalFindMany;
    db.buyerTradeEnquiry.findUnique = originalFindUnique;
    db.buyerTradeEnquiry.update = originalUpdate;
  });

  return {
    getCreateCount: () => createCount,
    getRecords: () => [...records],
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    companyName: 'QA Trade Buyer Ltd New',
    contactName: 'QA Buyer',
    contactEmail: 'new.qa.trade.buyer@example.test',
    contactPhone: '+44 20 0000 0101',
    businessType: 'Pharmacy',
    country: 'United Kingdom',
    productName: 'QA Comparator Product 10mg tablets',
    strength: '10mg',
    packSize: '30 tablets',
    quantityRequired: '120 packs',
    targetMarket: 'United Kingdom',
    documentationNotes: 'Automated QA RFQ - no patient data',
    additionalNotes: 'Automated QA RFQ - no patient data',
    ...overrides,
  };
}

async function readJson(response: Response) {
  return (await response.json()) as {
    error?: {
      code?: string;
      message?: string;
      details?: unknown;
    };
    item?: {
      id?: string;
      status?: string;
      createdAt?: string;
      reviewNotes?: string | null;
      statusUpdatedBy?: string | null;
    };
    items?: Array<{
      id: string;
      status: string;
      priority: string;
      companyName: string;
      productName: string;
      reviewNotes?: string | null;
      statusUpdatedBy?: string | null;
    }>;
    message?: string;
  };
}

test('public trade enquiry route accepts valid manual-review RFQs', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.10',
    },
    body: JSON.stringify(validPayload()),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(dbMock.getCreateCount(), 1);
  assert.equal(payload.item?.status, 'NEW');
  assert.match(payload.message ?? '', /manual review/i);
  assert.doesNotMatch(JSON.stringify(payload), /stack|postgresql:\/\//i);

  const created = dbMock.getRecords()[0];
  assert.equal(created?.status, 'NEW');
  assert.equal(created?.companyName, 'QA Trade Buyer Ltd New');
  assert.equal(created?.contactName, 'QA Buyer');
  assert.equal(created?.contactEmail, 'new.qa.trade.buyer@example.test');
  assert.equal(created?.productName, 'QA Comparator Product 10mg tablets');
  assert.equal(created?.quantityRequired, '120 packs');
});

test('public trade enquiry route rejects honeypot spam without persistence', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.11',
    },
    body: JSON.stringify(validPayload({ website: 'https://spam.test' })),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(dbMock.getCreateCount(), 0);
  assert.equal(payload.error?.code, 'BAD_REQUEST');
  assert.doesNotMatch(
    JSON.stringify(payload),
    /stack|honeypot|postgresql:\/\//i,
  );
});

test('public trade enquiry route rejects invalid fields without persistence', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.12',
    },
    body: JSON.stringify(validPayload({ productName: '' })),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 422);
  assert.equal(dbMock.getCreateCount(), 0);
  assert.equal(payload.error?.code, 'VALIDATION_ERROR');
  assert.doesNotMatch(JSON.stringify(payload), /stack|postgresql:\/\//i);
});

test('public trade enquiry route rejects duplicate RFQs before creation', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.15',
    },
    body: JSON.stringify(
      validPayload({
        companyName: 'QA Trade Buyer Ltd',
        contactEmail: 'qa.trade.buyer@example.test',
      }),
    ),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(dbMock.getCreateCount(), 0);
  assert.equal(dbMock.getRecords().length, 2);
  assert.equal(payload.error?.code, 'CONFLICT');
  assert.doesNotMatch(JSON.stringify(payload), /stack|postgresql:\/\//i);
});

test('public trade enquiry route rejects obvious spam without persistence', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.16',
    },
    body: JSON.stringify(
      validPayload({
        productName:
          'Casino backlinks http://one.test http://two.test http://three.test',
      }),
    ),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(dbMock.getCreateCount(), 0);
  assert.equal(payload.error?.code, 'BAD_REQUEST');
  assert.doesNotMatch(JSON.stringify(payload), /stack|postgresql:\/\//i);
});

test('public trade enquiry route rate-limits repeated submissions', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);
  const headers = {
    'content-type': 'application/json',
    'x-forwarded-for': '198.51.100.13',
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        validPayload({
          productName: `Comparator requirement ${index}`,
        }),
      ),
    });
    assert.equal(response.status, 201);
  }

  const blockedResponse = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(validPayload({ productName: 'Sixth requirement' })),
  });
  const blockedPayload = await readJson(blockedResponse);

  assert.equal(blockedResponse.status, 429);
  assert.equal(dbMock.getCreateCount(), 5);
  assert.equal(blockedPayload.error?.code, 'RATE_LIMITED');
  assert.doesNotMatch(JSON.stringify(blockedPayload), /stack|postgresql:\/\//i);
});

test('public trade enquiry route enforces request body limit', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.14',
    },
    body: JSON.stringify(validPayload({ additionalNotes: 'x'.repeat(20_000) })),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 413);
  assert.equal(dbMock.getCreateCount(), 0);
  assert.equal(payload.error?.code, 'PAYLOAD_TOO_LARGE');
  assert.doesNotMatch(JSON.stringify(payload), /stack|postgresql:\/\//i);
});

test('public trade enquiry route enforces field length limits', async (t) => {
  overrideEnv(t, { nodeEnv: 'test' });
  resetPublicTradeEnquiryRateLimitForTests();
  const dbMock = installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/public/trade-enquiries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.17',
    },
    body: JSON.stringify(validPayload({ companyName: 'x'.repeat(181) })),
  });
  const payload = await readJson(response);

  assert.equal(response.status, 422);
  assert.equal(dbMock.getCreateCount(), 0);
  assert.equal(payload.error?.code, 'VALIDATION_ERROR');
  assert.doesNotMatch(JSON.stringify(payload), /stack|postgresql:\/\//i);
});

test('internal trade enquiry routes remain protected', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/api/trade/buyer-enquiries`);

  assert.equal(response.status, 401);
});

test('internal trade enquiry detail routes remain protected', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const baseUrl = await startServer(t);

  const response = await fetch(
    `${baseUrl}/api/trade/buyer-enquiries/qa-new-enquiry`,
  );

  assert.equal(response.status, 401);
});

test('internal trade enquiry route filters dashboard RFQ lists', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);

  const response = await fetch(
    `${baseUrl}/api/trade/buyer-enquiries?status=NEW&priority=NORMAL&company=trade&createdFrom=2026-06-07&createdTo=2026-06-07`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.items?.length, 1);
  assert.equal(payload.items?.[0]?.id, 'qa-new-enquiry');
  assert.equal(payload.items?.[0]?.companyName, 'QA Trade Buyer Ltd');
});

test('internal trade enquiry route updates valid workflow statuses and rejects invalid transitions', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  installBuyerTradeEnquiryDbMock(t);
  const baseUrl = await startServer(t);
  const headers = {
    'content-type': 'application/json',
    'x-internal-api-key': 'test-secret',
    'x-internal-caller-name': 'web-dashboard',
  };

  const reviewingResponse = await fetch(
    `${baseUrl}/api/trade/buyer-enquiries/qa-new-enquiry/status`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: 'REVIEWING',
        reviewNotes: 'Operator checked QA route coverage.',
        actorType: 'OPERATOR',
        actorIdentifier: 'web-dashboard',
      }),
    },
  );
  const reviewingPayload = await readJson(reviewingResponse);

  assert.equal(reviewingResponse.status, 200);
  assert.equal(reviewingPayload.item?.status, 'REVIEWING');

  const invalidResponse = await fetch(
    `${baseUrl}/api/trade/buyer-enquiries/qa-new-enquiry/status`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: 'NEW',
        reviewNotes: 'This invalid reversal must not persist.',
        actorType: 'OPERATOR',
        actorIdentifier: 'web-dashboard',
      }),
    },
  );
  const invalidPayload = await readJson(invalidResponse);

  assert.equal(invalidResponse.status, 409);
  assert.equal(invalidPayload.error?.code, 'CONFLICT');

  const detailResponse = await fetch(
    `${baseUrl}/api/trade/buyer-enquiries/qa-new-enquiry`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );
  const detailPayload = await readJson(detailResponse);

  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.item?.status, 'REVIEWING');
});
