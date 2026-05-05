import assert from 'node:assert/strict';
import test from 'node:test';

import { emailIntelligenceAcceptanceFixtures } from '../../acceptance/emailIntelligenceFixtures';
import { buildProductCandidates, normalizeText } from '../../imports/normalization';
import { createCommercialIntelParser } from '../aiParser';
import { createCommercialIntelService } from '../service';
import type { AiCommercialIntelResponse } from '../schema';

function createHarness(response: AiCommercialIntelResponse) {
  const items: Array<Record<string, any>> = [];
  const products: Array<Record<string, any>> = [];
  const suppliers: Array<Record<string, any>> = [];
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
    async findSupplierByNormalizedName(normalizedName: string) {
      return suppliers.find((supplier) => supplier.normalizedName === normalizedName) ?? null;
    },
    async upsertIntelItem(data: Record<string, any>) {
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
        id: nextId('intel'),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      items.push(created);
      return created;
    },
    async listIntelItems(filters: Record<string, any>) {
      return items
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !filters.itemType || item.itemType === filters.itemType)
        .filter((item) => !filters.productId || item.productId === filters.productId)
        .filter((item) => !filters.supplierId || item.supplierId === filters.supplierId)
        .slice(0, filters.take ?? 100);
    },
    async getIntelItem(id: string) {
      return items.find((item) => item.id === id) ?? null;
    },
    async updateIntelItem(id: string, data: Record<string, any>) {
      const existing = items.find((item) => item.id === id);
      if (!existing) {
        throw new Error('Commercial intel item not found.');
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
        promptVersion: 'commercial-intel-v1',
        reducedText: 'reduced',
      };
    },
  };

  return {
    items,
    products,
    suppliers,
    service: createCommercialIntelService({
      repository: repository as never,
      parser,
    }),
  };
}

const baseResponse = (items: AiCommercialIntelResponse['items']): AiCommercialIntelResponse => ({
  intent: 'COMMERCIAL_INTEL',
  items,
  overallConfidence: 'MEDIUM',
  reviewRecommended: true,
  notes: [],
});

test('disabled commercial intel parser does not call OpenAI and fails safely', async () => {
  let fetchCalled = false;
  const parser = createCommercialIntelParser({
    enabled: false,
    apiKey: 'test-key',
    fetchImpl: (async () => {
      fetchCalled = true;
      throw new Error('OpenAI should not be called.');
    }) as typeof fetch,
  });

  const result = await parser.parseText({
    rawText: 'Dad says do not trust Medline on insulin.',
    source: 'INBOUND_EMAIL',
  });

  assert.equal(result.status, 'disabled');
  assert.equal(fetchCalled, false);
});

test('missing OpenAI key disables commercial intel parser without calling OpenAI', async () => {
  let fetchCalled = false;
  const parser = createCommercialIntelParser({
    enabled: true,
    apiKey: '',
    fetchImpl: (async () => {
      fetchCalled = true;
      throw new Error('OpenAI should not be called.');
    }) as typeof fetch,
  });

  const result = await parser.parseText({
    rawText: 'If anyone offers Pregabalin below GBP 3.20 buy quickly.',
    source: 'INBOUND_EMAIL',
  });

  assert.equal(result.status, 'disabled');
  assert.equal(fetchCalled, false);
});

test('inbound commercial intel service skips OpenAI when body has no intel signal', async () => {
  let parserCalls = 0;
  const service = createCommercialIntelService({
    repository: {} as never,
    parser: {
      async parseText() {
        parserCalls += 1;
        throw new Error('Parser should not run for non-intel text.');
      },
    },
  });

  const result = await service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'supplier@ambe.test',
    subject: 'Plain admin note',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Please see attached price list for this week.',
      },
    ],
  });

  assert.equal(result.attempted, false);
  assert.equal(result.createdOrUpdatedCount, 0);
  assert.equal(parserCalls, 0);
});

test('acceptance/demo: dad supplier reliability note creates review-first commercial intel only', async () => {
  const fixture = emailIntelligenceAcceptanceFixtures.dadSupplierReliabilityNote;
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'SUPPLIER_RELIABILITY_NOTE',
        productText: 'insulin',
        supplierName: 'Medline',
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: 'HIGH',
        urgency: null,
        signalEffect: 'REQUIRE_REVIEW',
        evidenceText: fixture.bodyText,
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );
  harness.suppliers.push({
    id: 'supplier-1',
    name: 'Medline',
    normalizedName: normalizeText('Medline'),
  });

  const result = await harness.service.processInboundEmail({
    inboundEmailId: 'acceptance-intel-email-1',
    senderEmail: fixture.from,
    subject: fixture.subject,
    documents: [{ id: 'doc-1', kind: 'BODY_MAIN', textContent: fixture.bodyText }],
  });

  assert.equal(result.createdOrUpdatedCount, 1);
  assert.equal(harness.items.length, 1);
  assert.equal(harness.items[0]?.itemType, 'SUPPLIER_RELIABILITY_NOTE');
  assert.equal(harness.items[0]?.status, 'NEW');
  assert.equal(harness.items[0]?.supplierId, 'supplier-1');
  assert.equal(harness.items[0]?.productId, null);
  assert.equal(harness.products.length, 0);
});

test('acceptance/demo: manual buy trigger extracts threshold and approval makes it context-eligible', async () => {
  const fixture = emailIntelligenceAcceptanceFixtures.manualBuyTrigger;
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'MANUAL_BUY_TRIGGER',
        productText: 'Pregabalin 150mg',
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: 3.2,
        currency: 'GBP',
        availabilitySignal: null,
        riskLevel: null,
        urgency: 'HIGH',
        signalEffect: 'BOOST_BUY_REVIEW',
        evidenceText: 'If anyone offers Pregabalin 150mg below £3.20 buy quickly',
        confidence: 'HIGH',
        reviewReason: null,
        validUntil: null,
      },
      {
        itemType: 'BUYER_DEMAND_SIGNAL',
        productText: 'Pregabalin 150mg',
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: null,
        urgency: 'MEDIUM',
        signalEffect: 'DEMAND_EXISTS',
        evidenceText: 'I know two buyers looking.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );
  harness.products.push({
    id: 'product-1',
    name: 'Pregabalin 150mg capsules',
    normalizedName: buildProductCandidates('Pregabalin 150mg').normalizedKey,
  });

  await harness.service.processInboundEmail({
    inboundEmailId: 'acceptance-intel-email-2',
    senderEmail: fixture.from,
    subject: fixture.subject,
    documents: [{ id: 'doc-1', kind: 'BODY_MAIN', textContent: fixture.bodyText }],
  });
  const approved = await harness.service.updateItemStatus(harness.items[0]!.id, {
    action: 'APPROVE',
    actorType: 'OPERATOR',
    actorIdentifier: 'acceptance-demo',
  });

  assert.equal(harness.items.length, 2);
  assert.equal(harness.items[0]?.itemType, 'MANUAL_BUY_TRIGGER');
  assert.equal(harness.items[0]?.priceThreshold, 3.2);
  assert.equal(harness.items[0]?.currency, 'GBP');
  assert.equal(harness.items[0]?.productId, 'product-1');
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedByIdentifier, 'acceptance-demo');
});

test('messy dad insider email creates commercial intel rows with buy threshold, supplier warning, and buyer demand', async () => {
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'SUPPLIER_RELIABILITY_NOTE',
        productText: 'insulin',
        supplierName: 'Medline',
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: 'HIGH',
        urgency: null,
        signalEffect: 'REQUIRE_REVIEW',
        evidenceText: "Don't trust Medline on insulin, they quote but never deliver.",
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
      {
        itemType: 'MANUAL_BUY_TRIGGER',
        productText: 'Pregabalin 150mg',
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: 3.2,
        currency: 'GBP',
        availabilitySignal: null,
        riskLevel: null,
        urgency: 'HIGH',
        signalEffect: 'BOOST_BUY_REVIEW',
        evidenceText: 'If anyone offers Pregabalin 150mg below £3.20 buy quickly',
        confidence: 'HIGH',
        reviewReason: null,
        validUntil: null,
      },
      {
        itemType: 'BUYER_DEMAND_SIGNAL',
        productText: 'Pregabalin 150mg',
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: null,
        urgency: 'MEDIUM',
        signalEffect: 'DEMAND_EXISTS',
        evidenceText: 'I know two buyers looking.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );
  const productCandidates = buildProductCandidates('Pregabalin 150mg');
  harness.products.push({
    id: 'product-1',
    name: 'Pregabalin 150mg capsules',
    normalizedName: productCandidates.normalizedKey,
  });
  harness.suppliers.push({
    id: 'supplier-1',
    name: 'Medline',
    normalizedName: normalizeText('Medline'),
  });

  const result = await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Intel',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: [
          "Don't trust Medline on insulin, they quote but never deliver.",
          'If anyone offers Pregabalin 150mg below £3.20 buy quickly, I know two buyers looking.',
        ].join('\n'),
      },
    ],
  });

  assert.equal(result.intent, 'COMMERCIAL_INTEL');
  assert.equal(result.createdOrUpdatedCount, 3);
  assert.equal(harness.items.length, 3);
  assert.equal(harness.items[0]?.itemType, 'SUPPLIER_RELIABILITY_NOTE');
  assert.equal(harness.items[0]?.supplierId, 'supplier-1');
  assert.equal(harness.items[0]?.productId, null);
  assert.equal(harness.items[1]?.itemType, 'MANUAL_BUY_TRIGGER');
  assert.equal(harness.items[1]?.productId, 'product-1');
  assert.equal(harness.items[1]?.priceThreshold, 3.2);
  assert.equal(harness.items[1]?.currency, 'GBP');
  assert.equal(harness.items[2]?.itemType, 'BUYER_DEMAND_SIGNAL');
});

test('vague note stores low-confidence review-oriented intel without guessing unresolved entities', async () => {
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'OTHER',
        productText: null,
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: null,
        urgency: null,
        signalEffect: null,
        evidenceText: 'Customer might want that thing from last week.',
        confidence: 'LOW',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );

  await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Note',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Customer might want that thing from last week.',
      },
    ],
  });

  assert.equal(harness.items.length, 1);
  assert.equal(harness.items[0]?.confidence, 'LOW');
  assert.equal(harness.items[0]?.reviewReason, 'low_confidence_requires_review');
  assert.equal(harness.items[0]?.productId, null);
  assert.equal(harness.items[0]?.supplierId, null);
});

test('unresolved product and supplier leave ids null without creating canonical records', async () => {
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'MARKET_PRICE_INTEL',
        productText: 'Ozempic',
        supplierName: 'Zenith',
        customerName: null,
        contactName: 'Amit',
        priceThreshold: null,
        currency: null,
        availabilitySignal: 'stock is tight',
        riskLevel: null,
        urgency: 'HIGH',
        signalEffect: 'PRICE_LIKELY_RISES',
        evidenceText: 'Amit from Zenith says Ozempic stock is tight and price likely rises next week.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );

  await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Market',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Amit from Zenith says Ozempic stock is tight and price likely rises next week.',
      },
    ],
  });

  assert.equal(harness.items.length, 1);
  assert.equal(harness.items[0]?.productText, 'Ozempic');
  assert.equal(harness.items[0]?.supplierName, 'Zenith');
  assert.equal(harness.items[0]?.productId, null);
  assert.equal(harness.items[0]?.supplierId, null);
  assert.equal(harness.products.length, 0);
  assert.equal(harness.suppliers.length, 0);
});

test('approve reject and expire update status and actor audit fields', async () => {
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'EXPIRY_RISK_RULE',
        productText: null,
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: 'MEDIUM',
        urgency: null,
        signalEffect: 'REQUIRE_REVIEW',
        evidenceText: 'Avoid short expiry under 6 months unless margin is huge.',
        confidence: 'HIGH',
        reviewReason: null,
        validUntil: null,
      },
      {
        itemType: 'PRODUCT_NOTE',
        productText: 'Ozempic',
        supplierName: null,
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: 'tight stock',
        riskLevel: null,
        urgency: 'MEDIUM',
        signalEffect: 'REVIEW_CONTEXT',
        evidenceText: 'Ozempic stock is tight.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
      {
        itemType: 'CONTACT_NOTE',
        productText: null,
        supplierName: 'Zenith',
        customerName: null,
        contactName: 'Amit',
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: null,
        urgency: null,
        signalEffect: 'REVIEW_CONTEXT',
        evidenceText: 'Amit at Zenith has market colour.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );

  await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Rule',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Avoid short expiry under 6 months unless margin is huge.',
      },
    ],
  });

  const approved = await harness.service.updateItemStatus(harness.items[0]!.id, {
    action: 'APPROVE',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedByType, 'USER');
  assert.equal(approved.approvedByIdentifier, 'buyer-1');
  assert.ok(approved.approvedAt instanceof Date);

  const rejected = await harness.service.updateItemStatus(harness.items[1]!.id, {
    action: 'REJECT',
    actorType: 'USER',
    actorIdentifier: 'buyer-2',
    note: 'Not actionable',
  });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.rejectedByIdentifier, 'buyer-2');
  assert.equal(rejected.reviewReason, 'Not actionable');

  const expired = await harness.service.updateItemStatus(harness.items[2]!.id, {
    action: 'EXPIRE',
    actorType: 'USER',
    actorIdentifier: 'buyer-3',
  });
  assert.equal(expired.status, 'EXPIRED');
  assert.equal(expired.reviewReason, 'expired_by_operator');
});

test('commercial intel status transitions block unsafe changes and keep repeated actions idempotent', async () => {
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'SUPPLIER_RELIABILITY_NOTE',
        productText: 'insulin',
        supplierName: 'Medline',
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: 'HIGH',
        urgency: null,
        signalEffect: 'REQUIRE_REVIEW',
        evidenceText: "Don't trust Medline on insulin.",
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );

  await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Risk',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: "Don't trust Medline on insulin.",
      },
    ],
  });

  const id = harness.items[0]!.id;
  const rejected = await harness.service.updateItemStatus(id, {
    action: 'REJECT',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  const repeatedReject = await harness.service.updateItemStatus(id, {
    action: 'REJECT',
    actorType: 'USER',
    actorIdentifier: 'buyer-2',
  });

  assert.equal(repeatedReject.rejectedByIdentifier, rejected.rejectedByIdentifier);
  await assert.rejects(
    () =>
      harness.service.updateItemStatus(id, {
        action: 'APPROVE',
        actorType: 'USER',
        actorIdentifier: 'buyer-3',
      }),
    /cannot transition/,
  );
});

test('commercial intel extraction is idempotent for the same inbound email and evidence', async () => {
  const harness = createHarness(
    baseResponse([
      {
        itemType: 'BUYER_DEMAND_SIGNAL',
        productText: 'Dr Reddy stock',
        supplierName: null,
        customerName: 'Customer X',
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: null,
        urgency: 'MEDIUM',
        signalEffect: 'DEMAND_EXISTS',
        evidenceText: 'Customer X wants Dr Reddy stock if we can get it cheap.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
  );
  const input = {
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Demand',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Customer X wants Dr Reddy stock if we can get it cheap.',
      },
    ],
  };

  await harness.service.processInboundEmail(input);
  await harness.service.processInboundEmail(input);

  assert.equal(harness.items.length, 1);
  assert.equal(harness.items[0]?.itemType, 'BUYER_DEMAND_SIGNAL');
  assert.equal(harness.items[0]?.customerName, 'Customer X');
});

test('mixed intent can store commercial intel without interfering with supplier-offer handling', async () => {
  const harness = createHarness({
    ...baseResponse([
      {
        itemType: 'SUPPLIER_RELIABILITY_NOTE',
        productText: null,
        supplierName: 'Medline',
        customerName: null,
        contactName: null,
        priceThreshold: null,
        currency: null,
        availabilitySignal: null,
        riskLevel: 'HIGH',
        urgency: null,
        signalEffect: 'REQUIRE_REVIEW',
        evidenceText: 'Medline quote but never deliver.',
        confidence: 'MEDIUM',
        reviewReason: null,
        validUntil: null,
      },
    ]),
    intent: 'MIXED',
  });

  const result = await harness.service.processInboundEmail({
    inboundEmailId: 'email-1',
    senderEmail: 'dad@ambe.test',
    subject: 'Mixed',
    documents: [
      {
        id: 'doc-1',
        kind: 'BODY_MAIN',
        textContent: 'Amlodipine £8.40. Medline quote but never deliver.',
      },
    ],
  });

  assert.equal(result.intent, 'MIXED');
  assert.equal(harness.items.length, 1);
});
