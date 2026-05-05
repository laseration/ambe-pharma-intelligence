import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import {
  commercialIntelContextKey,
  loadApprovedCommercialIntelContextMap,
} from '../commercialIntelContext';

type TestIntelRecord = {
  id: string;
  itemType:
    | 'SUPPLIER_RELIABILITY_NOTE'
    | 'BUYER_DEMAND_SIGNAL'
    | 'MANUAL_BUY_TRIGGER'
    | 'MANUAL_SELL_TRIGGER'
    | 'MARKET_PRICE_INTEL'
    | 'EXPIRY_RISK_RULE'
    | 'PRODUCT_NOTE'
    | 'CONTACT_NOTE'
    | 'OTHER';
  productText: string | null;
  productId: string | null;
  supplierName: string | null;
  supplierId: string | null;
  customerName: string | null;
  priceThreshold: Prisma.Decimal | null;
  currency: string | null;
  availabilitySignal: string | null;
  riskLevel: string | null;
  urgency: string | null;
  signalEffect: string | null;
  evidenceText: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  validUntil: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
  status: 'APPROVED' | 'NEW' | 'REJECTED' | 'EXPIRED';
};

const now = new Date('2026-05-05T12:00:00.000Z');

function createRecord(overrides: Partial<TestIntelRecord>): TestIntelRecord {
  return {
    id: 'intel-1',
    itemType: 'MANUAL_BUY_TRIGGER',
    productText: 'Pregabalin 150mg',
    productId: 'product-1',
    supplierName: null,
    supplierId: null,
    customerName: null,
    priceThreshold: new Prisma.Decimal('3.20'),
    currency: 'GBP',
    availabilitySignal: null,
    riskLevel: null,
    urgency: 'HIGH',
    signalEffect: 'BUY',
    evidenceText: 'If anyone offers Pregabalin 150mg below GBP 3.20 buy quickly.',
    confidence: 'HIGH',
    validUntil: null,
    createdAt: new Date('2026-05-05T10:00:00.000Z'),
    approvedAt: new Date('2026-05-05T10:30:00.000Z'),
    status: 'APPROVED',
    ...overrides,
  };
}

function activeApproved(record: TestIntelRecord): boolean {
  return record.status === 'APPROVED' && (!record.validUntil || record.validUntil >= now);
}

test('loads only approved non-expired product, supplier, and global commercial intel context', async () => {
  const records = [
    createRecord({ id: 'approved-product', productId: 'product-1' }),
    createRecord({ id: 'rejected-product', status: 'REJECTED', productId: 'product-1' }),
    createRecord({
      id: 'expired-product',
      productId: 'product-1',
      validUntil: new Date('2026-05-01T00:00:00.000Z'),
    }),
    createRecord({
      id: 'approved-supplier',
      itemType: 'SUPPLIER_RELIABILITY_NOTE',
      productId: null,
      supplierId: 'supplier-1',
      supplierName: 'Medline',
    }),
    createRecord({
      id: 'approved-global',
      itemType: 'EXPIRY_RISK_RULE',
      productId: null,
      supplierId: null,
      evidenceText: 'Avoid short expiry under 6 months unless margin is huge.',
    }),
  ];

  const repository = {
    async listProductLinked(productIds: string[]) {
      return records.filter(
        (record) => activeApproved(record) && record.productId && productIds.includes(record.productId),
      );
    },
    async listSupplierLinked(supplierIds: string[]) {
      return records.filter(
        (record) => activeApproved(record) && record.supplierId && supplierIds.includes(record.supplierId),
      );
    },
    async listGlobal() {
      return records.filter(
        (record) => activeApproved(record) && !record.productId && !record.supplierId,
      );
    },
  };

  const contexts = await loadApprovedCommercialIntelContextMap(
    [{ productId: 'product-1', supplierId: 'supplier-1' }],
    now,
    repository,
  );
  const context = contexts.get(commercialIntelContextKey('product-1', 'supplier-1'));

  assert.ok(context);
  assert.deepEqual(context.productLinked.map((item) => item.id), ['approved-product']);
  assert.deepEqual(context.supplierLinked.map((item) => item.id), ['approved-supplier']);
  assert.deepEqual(context.global.map((item) => item.id), ['approved-global']);
});
