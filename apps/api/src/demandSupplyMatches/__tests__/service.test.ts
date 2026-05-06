import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemandSupplyMatchService } from '../service';

const now = new Date('2026-05-06T09:00:00.000Z');
const recent = new Date('2026-05-01T09:00:00.000Z');
const stale = new Date('2026-01-01T09:00:00.000Z');

function baseDemand(overrides: Record<string, any> = {}) {
  return {
    id: 'demand-1',
    status: 'APPROVED',
    requestType: 'SOURCE_PRODUCT',
    customerName: 'Customer A',
    customerId: 'customer-1',
    contactName: 'Buyer One',
    contactEmail: 'buyer@example.test',
    productText: 'Pregabalin 150mg',
    productId: 'product-1',
    quantityRequested: 200,
    targetPrice: 3.2,
    currency: 'GBP',
    neededByDate: null,
    urgency: 'HIGH',
    evidenceText: 'Can you source Pregabalin 150mg? Need 200 packs.',
    confidence: 'MEDIUM',
    validUntil: null,
    createdAt: recent,
    approvedAt: recent,
    ...overrides,
  };
}

function baseSupplierPrice(overrides: Record<string, any> = {}) {
  return {
    id: 'price-1',
    supplierPriceListId: 'list-1',
    supplierId: 'supplier-1',
    productId: 'product-1',
    rawProductName: 'Pregabalin 150mg',
    unitPrice: 2.8,
    currencyCode: 'GBP',
    minimumOrderQuantity: 20,
    isAvailable: true,
    promotionFingerprint: 'fingerprint-1',
    rawRow: { source: 'approved-email-offer' },
    createdAt: recent,
    supplier: {
      id: 'supplier-1',
      name: 'Zenith',
      qualification: {
        qualificationStatus: 'APPROVED',
        trustTier: 'MEDIUM',
        requiresManualApproval: false,
      },
    },
    ...overrides,
  };
}

function baseIntel(overrides: Record<string, any> = {}) {
  return {
    id: 'intel-1',
    status: 'APPROVED',
    itemType: 'SUPPLIER_RELIABILITY_NOTE',
    productText: 'Pregabalin 150mg',
    productId: 'product-1',
    supplierName: 'Zenith',
    supplierId: 'supplier-1',
    customerName: null,
    riskLevel: 'HIGH',
    urgency: 'HIGH',
    evidenceText: 'Review Zenith reliability before trading.',
    confidence: 'MEDIUM',
    validUntil: null,
    createdAt: recent,
    approvedAt: recent,
    ...overrides,
  };
}

function createHarness(input: {
  demands?: Array<Record<string, any>>;
  supplierPrices?: Array<Record<string, any>>;
  commercialIntelItems?: Array<Record<string, any>>;
} = {}) {
  const demands = input.demands ?? [baseDemand()];
  const supplierPrices = input.supplierPrices ?? [baseSupplierPrice()];
  const commercialIntelItems = input.commercialIntelItems ?? [];
  const matches: Array<Record<string, any>> = [];
  const canonicalWrites: Array<Record<string, any>> = [];
  let idCounter = 0;

  const repository = {
    async listApprovedDemands(currentTime: Date, take: number) {
      return demands
        .filter((demand) => demand.status === 'APPROVED')
        .filter((demand) => Boolean(demand.productId))
        .filter((demand) => !demand.validUntil || demand.validUntil >= currentTime)
        .slice(0, take);
    },
    async listRecentSupplierPrices(productIds: string[], lookbackStart: Date) {
      return supplierPrices
        .filter((price) => productIds.includes(price.productId))
        .filter((price) => price.isAvailable)
        .filter((price) => price.createdAt >= lookbackStart);
    },
    async listApprovedCommercialIntel(productIds: string[], supplierIds: string[], currentTime: Date) {
      return commercialIntelItems
        .filter((item) => item.status === 'APPROVED')
        .filter((item) => !item.validUntil || item.validUntil >= currentTime)
        .filter(
          (item) =>
            (item.productId && productIds.includes(item.productId)) ||
            (item.supplierId && supplierIds.includes(item.supplierId)),
        );
    },
    async upsertMatch(data: Record<string, any>) {
      const existing = matches.find(
        (match) =>
          match.customerDemandSignalId === data.customerDemandSignalId &&
          match.supplierPriceItemId === data.supplierPriceItemId,
      );

      if (existing) {
        Object.assign(existing, data, { updatedAt: now });
        return existing;
      }

      const created = {
        id: `match-${++idCounter}`,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      matches.push(created);
      return created;
    },
    async listMatches(filters: Record<string, any>) {
      return matches
        .filter((match) => !filters.status || match.status === filters.status)
        .filter((match) => !filters.productId || match.productId === filters.productId)
        .filter((match) => !filters.customerId || match.customerId === filters.customerId)
        .filter((match) => !filters.supplierId || match.supplierId === filters.supplierId)
        .filter((match) => !filters.confidence || match.confidence === filters.confidence)
        .slice(0, filters.take ?? 100);
    },
    async getMatch(id: string) {
      return matches.find((match) => match.id === id) ?? null;
    },
    async updateMatch(id: string, data: Record<string, any>) {
      const existing = matches.find((match) => match.id === id);
      if (!existing) {
        throw new Error('Demand supply match not found.');
      }

      Object.assign(existing, data, { updatedAt: now });
      return existing;
    },
  };

  return {
    demands,
    supplierPrices,
    commercialIntelItems,
    matches,
    canonicalWrites,
    service: createDemandSupplyMatchService({
      repository: repository as never,
      now: () => now,
    }),
  };
}

test('approved demand and matching recent supplier price creates DemandSupplyMatch', async () => {
  const harness = createHarness();

  const result = await harness.service.generateDemandSupplyMatches();

  assert.equal(result.createdOrUpdatedCount, 1);
  assert.equal(harness.matches.length, 1);
  assert.equal(harness.matches[0]?.productId, 'product-1');
  assert.equal(harness.matches[0]?.customerDemandSignalId, 'demand-1');
  assert.equal(harness.matches[0]?.supplierPriceItemId, 'price-1');
  assert.equal(harness.matches[0]?.reason, 'TARGET_PRICE_MET');
  assert.equal(harness.matches[0]?.confidence, 'HIGH');
});

test('unapproved rejected expired and unresolved customer demand does not create matches', async () => {
  const harness = createHarness({
    demands: [
      baseDemand({ id: 'new-demand', status: 'NEW' }),
      baseDemand({ id: 'rejected-demand', status: 'REJECTED' }),
      baseDemand({ id: 'expired-demand', validUntil: new Date('2026-01-01T00:00:00.000Z') }),
      baseDemand({ id: 'no-product-demand', productId: null }),
    ],
  });

  const result = await harness.service.generateDemandSupplyMatches();

  assert.equal(result.createdOrUpdatedCount, 0);
  assert.equal(harness.matches.length, 0);
});

test('supplier price with a different product does not match', async () => {
  const harness = createHarness({
    supplierPrices: [baseSupplierPrice({ id: 'price-other', productId: 'product-2' })],
  });

  const result = await harness.service.generateDemandSupplyMatches();

  assert.equal(result.createdOrUpdatedCount, 0);
});

test('stale supplier price is skipped', async () => {
  const harness = createHarness({
    supplierPrices: [baseSupplierPrice({ createdAt: stale })],
  });

  const result = await harness.service.generateDemandSupplyMatches({ lookbackDays: 45 });

  assert.equal(result.createdOrUpdatedCount, 0);
});

test('currency mismatch creates low-confidence candidate with risk and no margin', async () => {
  const harness = createHarness({
    supplierPrices: [baseSupplierPrice({ currencyCode: 'EUR' })],
  });

  await harness.service.generateDemandSupplyMatches();

  assert.equal(harness.matches[0]?.confidence, 'LOW');
  assert.deepEqual(harness.matches[0]?.riskFlags.includes('currency_mismatch'), true);
  assert.equal(harness.matches[0]?.estimatedMarginAmount, null);
  assert.equal(harness.matches[0]?.marginExplanation, null);
});

test('target price above supplier price calculates positive per-unit margin', async () => {
  const harness = createHarness();

  await harness.service.generateDemandSupplyMatches();

  assert.equal(harness.matches[0]?.estimatedMarginAmount, 0.4);
  assert.equal(harness.matches[0]?.estimatedMarginPct, 0.125);
  assert.match(harness.matches[0]?.marginExplanation, /estimated per-unit margin GBP 0\.40/);
});

test('target price below supplier price adds negative margin risk', async () => {
  const harness = createHarness({
    demands: [baseDemand({ targetPrice: 2.5 })],
    supplierPrices: [baseSupplierPrice({ unitPrice: 2.8 })],
  });

  await harness.service.generateDemandSupplyMatches();

  assert.equal(harness.matches[0]?.confidence, 'LOW');
  assert.deepEqual(harness.matches[0]?.riskFlags.includes('negative_estimated_margin'), true);
  assert.equal(harness.matches[0]?.estimatedMarginAmount, -0.3);
});

test('generation is idempotent for the same demand and supplier price', async () => {
  const harness = createHarness();

  await harness.service.generateDemandSupplyMatches();
  await harness.service.generateDemandSupplyMatches();

  assert.equal(harness.matches.length, 1);
  assert.equal(harness.matches[0]?.customerDemandSignalId, 'demand-1');
});

test('preview generation does not write rows', async () => {
  const harness = createHarness();

  const preview = await harness.service.previewDemandSupplyMatches();

  assert.equal(preview.matchCount, 1);
  assert.equal(harness.matches.length, 0);
});

test('approved supplier reliability intel appears as context and risk, rejected intel is excluded', async () => {
  const harness = createHarness({
    commercialIntelItems: [
      baseIntel(),
      baseIntel({ id: 'rejected-intel', status: 'REJECTED', evidenceText: 'Rejected note.' }),
    ],
  });

  await harness.service.generateDemandSupplyMatches();

  assert.deepEqual(harness.matches[0]?.riskFlags.includes('supplier_reliability_warning'), true);
  assert.equal(harness.matches[0]?.commercialIntelContext.items.length, 1);
  assert.equal(harness.matches[0]?.commercialIntelContext.items[0].id, 'intel-1');
});

test('review reject and expire actions update status and block invalid transitions', async () => {
  const harness = createHarness();
  await harness.service.generateDemandSupplyMatches();
  const id = harness.matches[0]!.id;

  const reviewed = await harness.service.updateDemandSupplyMatch(id, {
    action: 'REVIEW',
    actorType: 'OPERATOR',
    actorIdentifier: 'desk',
  });
  assert.equal(reviewed.status, 'REVIEWED');
  assert.equal(reviewed.reviewedByIdentifier, 'desk');

  const repeatedReview = await harness.service.updateDemandSupplyMatch(id, { action: 'REVIEW' });
  assert.equal(repeatedReview.status, 'REVIEWED');

  const rejected = await harness.service.updateDemandSupplyMatch(id, {
    action: 'REJECT',
    actorType: 'OPERATOR',
    actorIdentifier: 'desk',
  });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.rejectedByIdentifier, 'desk');

  await assert.rejects(
    () => harness.service.updateDemandSupplyMatch(id, { action: 'REVIEW' }),
    /cannot transition/,
  );

  const expireHarness = createHarness();
  await expireHarness.service.generateDemandSupplyMatches();
  const expired = await expireHarness.service.updateDemandSupplyMatch(expireHarness.matches[0]!.id, {
    action: 'EXPIRE',
  });
  assert.equal(expired.status, 'EXPIRED');
});

test('match generation does not create canonical records or downstream trades/messages', async () => {
  const harness = createHarness();

  await harness.service.generateDemandSupplyMatches();

  assert.equal(harness.matches.length, 1);
  assert.equal(harness.canonicalWrites.length, 0);
  assert.equal(harness.demands.length, 1);
  assert.equal(harness.supplierPrices.length, 1);
});
