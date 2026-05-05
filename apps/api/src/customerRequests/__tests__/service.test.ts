import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductCandidates, normalizeText } from '../../imports/normalization';
import { createCustomerDemandParser } from '../aiParser';
import {
  createCustomerDemandService,
  hasCustomerDemandSignal,
} from '../service';
import type { AiCustomerDemandResponse } from '../schema';

function createHarness(response: AiCustomerDemandResponse) {
  const items: Array<Record<string, any>> = [];
  const products: Array<Record<string, any>> = [];
  const customers: Array<Record<string, any>> = [];
  const createdCanonicalRecords: Array<Record<string, any>> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const repository = {
    async findProductByStoredCanonicalField(storedCanonicalField: string) {
      return products.find((product) => product.normalizedName === storedCanonicalField) ?? null;
    },
    async findProductAliasByRawName() {
      return null;
    },
    async listProductAliasesForCanonicalComparison() {
      return [];
    },
    async findCustomerByNormalizedName(normalizedName: string) {
      return customers.find((customer) => customer.normalizedName === normalizedName) ?? null;
    },
    async upsertDemandSignal(data: Record<string, any>) {
      const existing = items.find(
        (item) =>
          item.inboundEmailId === data.inboundEmailId &&
          item.itemFingerprint === data.itemFingerprint,
      );

      if (existing) {
        Object.assign(existing, data, { updatedAt: new Date() });
        return existing;
      }

      const created = {
        id: nextId('demand'),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      items.push(created);
      return created;
    },
    async listDemandSignals(filters: Record<string, any>) {
      return items
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !filters.requestType || item.requestType === filters.requestType)
        .filter((item) => !filters.productId || item.productId === filters.productId)
        .filter((item) => !filters.customerId || item.customerId === filters.customerId)
        .slice(0, filters.take ?? 100);
    },
    async getDemandSignal(id: string) {
      return items.find((item) => item.id === id) ?? null;
    },
    async updateDemandSignal(id: string, data: Record<string, any>) {
      const existing = items.find((item) => item.id === id);
      if (!existing) {
        throw new Error('Customer demand signal not found.');
      }

      Object.assign(existing, data, { updatedAt: new Date() });
      return existing;
    },
  };

  const parser = {
    async parseText() {
      return {
        status: 'success' as const,
        reason: 'ok',
        decision: 'accepted' as const,
        result: response,
        requestId: 'req-1',
        promptVersion: 'customer-request-v1',
        reducedText: 'reduced',
      };
    },
  };

  return {
    items,
    products,
    customers,
    createdCanonicalRecords,
    service: createCustomerDemandService({
      repository: repository as never,
      parser,
    }),
  };
}

const baseResponse = (items: AiCustomerDemandResponse['items']): AiCustomerDemandResponse => ({
  intent: 'CUSTOMER_REQUEST',
  items,
  overallConfidence: 'MEDIUM',
  reviewRecommended: true,
  notes: [],
});

const baseItem = (overrides: Partial<AiCustomerDemandResponse['items'][number]> = {}) => ({
  requestType: 'SOURCE_PRODUCT' as const,
  customerName: null,
  contactName: null,
  contactEmail: null,
  productText: 'Pregabalin 150mg',
  quantityRequested: 200,
  targetPrice: null,
  currency: null,
  neededByDate: null,
  urgency: 'HIGH',
  evidenceText: 'Can you source Pregabalin 150mg? Need 200 packs.',
  confidence: 'MEDIUM' as const,
  reviewReason: null,
  validUntil: null,
  ...overrides,
});

test('disabled customer demand parser does not call OpenAI and fails safely', async () => {
  let fetchCalled = false;
  const parser = createCustomerDemandParser({
    enabled: false,
    apiKey: 'test-key',
    fetchImpl: (async () => {
      fetchCalled = true;
      throw new Error('OpenAI should not be called.');
    }) as typeof fetch,
  });

  const result = await parser.parseText({
    rawText: 'Can you source Pregabalin 150mg? Need 200 packs.',
    source: 'INBOUND_EMAIL',
  });

  assert.equal(result.status, 'disabled');
  assert.equal(fetchCalled, false);
});

test('customer asks for product and quantity creates CustomerDemandSignal', async () => {
  const harness = createHarness(baseResponse([baseItem()]));
  harness.products.push({
    id: 'product-1',
    name: 'Pregabalin 150mg',
    normalizedName: buildProductCandidates('Pregabalin 150mg').normalizedKey,
  });

  const result = await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'buyer@example.test',
    subject: 'Need stock',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Can you source Pregabalin 150mg? Need 200 packs.',
      },
    ],
  });

  assert.equal(result.createdOrUpdatedCount, 1);
  assert.equal(harness.items.length, 1);
  assert.equal(harness.items[0]?.requestType, 'SOURCE_PRODUCT');
  assert.equal(harness.items[0]?.quantityRequested, 200);
  assert.equal(harness.items[0]?.productId, 'product-1');
  assert.equal(harness.items[0]?.status, 'NEW');
});

test('availability and quote requests keep distinct request types', async () => {
  const harness = createHarness(
    baseResponse([
      baseItem({
        requestType: 'CHECK_AVAILABILITY',
        productText: 'Ozempic 0.5mg',
        quantityRequested: null,
        evidenceText: 'Do you have Ozempic 0.5mg available?',
      }),
      baseItem({
        requestType: 'REQUEST_QUOTE',
        productText: 'Metformin 500mg x 28',
        quantityRequested: null,
        evidenceText: 'Please quote us on Metformin 500mg x 28.',
      }),
    ]),
  );

  const result = await harness.service.processInboundEmail({
    inboundEmailId: 'email-2',
    senderEmail: 'buyer@example.test',
    subject: 'Requests',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Do you have Ozempic 0.5mg available?\nPlease quote us on Metformin 500mg x 28.',
      },
    ],
  });

  assert.equal(result.createdOrUpdatedCount, 2);
  assert.deepEqual(harness.items.map((item) => item.requestType), [
    'CHECK_AVAILABILITY',
    'REQUEST_QUOTE',
  ]);
});

test('vague admin email skips parser and creates no item', async () => {
  let parserCalls = 0;
  const service = createCustomerDemandService({
    repository: {} as never,
    parser: {
      async parseText() {
        parserCalls += 1;
        throw new Error('Parser should not run for admin text.');
      },
    },
  });

  const result = await service.processInboundEmail({
    inboundEmailId: 'email-admin',
    senderEmail: 'buyer@example.test',
    subject: 'Invoice',
    documents: [{ id: 'doc-1', kind: 'BODY_MAIN', textContent: 'Thanks, see attached invoice. Regards.' }],
  });

  assert.equal(result.attempted, false);
  assert.equal(result.createdOrUpdatedCount, 0);
  assert.equal(parserCalls, 0);
});

test('supplier offer email does not become customer demand', async () => {
  assert.equal(hasCustomerDemandSignal('Hi, can do Amlodipine 5mg tabs 28 at £8.40, MOQ 20.'), false);
});

test('unresolved product and customer preserve raw text without creating canonical records', async () => {
  const harness = createHarness(
    baseResponse([
      baseItem({
        customerName: 'Customer A',
        productText: 'Unknown Brand Stock',
        evidenceText: 'Customer A wants 100 packs of Unknown Brand Stock next week.',
      }),
    ]),
  );

  await harness.service.processInboundEmail({
    inboundEmailId: 'email-3',
    senderEmail: 'ops@example.test',
    subject: 'Customer demand',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Customer A wants 100 packs of Unknown Brand Stock next week.',
      },
    ],
  });

  assert.equal(harness.items[0]?.productText, 'Unknown Brand Stock');
  assert.equal(harness.items[0]?.productId, null);
  assert.equal(harness.items[0]?.customerName, 'Customer A');
  assert.equal(harness.items[0]?.customerId, null);
  assert.equal(harness.products.length, 0);
  assert.equal(harness.customers.length, 0);
  assert.equal(harness.createdCanonicalRecords.length, 0);
});

test('existing safe customer match is linked without customer creation', async () => {
  const harness = createHarness(
    baseResponse([
      baseItem({
        customerName: 'Customer A',
        evidenceText: 'Customer A wants 100 packs of Amlodipine 5mg 28 next week.',
      }),
    ]),
  );
  harness.customers.push({ id: 'customer-1', name: 'Customer A', normalizedName: normalizeText('Customer A') });

  await harness.service.processInboundEmail({
    inboundEmailId: 'email-4',
    senderEmail: 'ops@example.test',
    subject: 'Customer demand',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Customer A wants 100 packs of Amlodipine 5mg 28 next week.',
      },
    ],
  });

  assert.equal(harness.items[0]?.customerId, 'customer-1');
});

test('approve reject and expire transitions update audit fields and block invalid transitions', async () => {
  const harness = createHarness(baseResponse([baseItem()]));
  await harness.service.processInboundEmail({
    inboundEmailId: 'email-5',
    senderEmail: 'buyer@example.test',
    subject: 'Need stock',
    documents: [{ id: 'doc-1', kind: 'BODY_MAIN', textContent: 'Can you source Pregabalin 150mg? Need 200 packs.' }],
  });

  const id = harness.items[0]!.id;
  const approved = await harness.service.updateSignalStatus(id, {
    action: 'APPROVE',
    actorType: 'OPERATOR',
    actorIdentifier: 'buyer-desk',
  });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedByIdentifier, 'buyer-desk');

  const repeated = await harness.service.updateSignalStatus(id, { action: 'APPROVE' });
  assert.equal(repeated.status, 'APPROVED');

  await assert.rejects(
    () => harness.service.updateSignalStatus(id, { action: 'REJECT' }),
    /cannot transition/,
  );

  const expired = await harness.service.updateSignalStatus(id, { action: 'EXPIRE' });
  assert.equal(expired.status, 'EXPIRED');
});

test('repeated extraction is idempotent and different requests do not collide', async () => {
  const harness = createHarness(
    baseResponse([
      baseItem({ evidenceText: 'Can you source Pregabalin 150mg? Need 200 packs.' }),
      baseItem({
        requestType: 'CHECK_AVAILABILITY',
        productText: 'Ozempic 0.5mg',
        quantityRequested: null,
        evidenceText: 'Do you have Ozempic 0.5mg available?',
      }),
    ]),
  );
  const input = {
    inboundEmailId: 'email-6',
    senderEmail: 'buyer@example.test',
    subject: 'Two requests',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Can you source Pregabalin 150mg? Need 200 packs.\nDo you have Ozempic 0.5mg available?',
      },
    ],
  };

  await harness.service.processInboundEmail(input);
  await harness.service.processInboundEmail(input);

  assert.equal(harness.items.length, 2);
  assert.notEqual(harness.items[0]?.itemFingerprint, harness.items[1]?.itemFingerprint);
});

test('parse preview returns parser output without storing rows', async () => {
  const harness = createHarness(baseResponse([baseItem()]));

  const preview = await harness.service.parsePreview('Can you source Pregabalin 150mg? Need 200 packs.');

  assert.equal(preview.status, 'success');
  assert.equal(harness.items.length, 0);
});
