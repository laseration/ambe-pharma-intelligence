import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import {
  customerDemandContextKey,
  loadApprovedCustomerDemandContextMap,
} from '../customerDemandContext';

type TestDemandRecord = {
  id: string;
  requestType:
    | 'SOURCE_PRODUCT'
    | 'CHECK_AVAILABILITY'
    | 'REQUEST_QUOTE'
    | 'BUYER_INTEREST'
    | 'REPEAT_DEMAND'
    | 'OTHER';
  customerName: string | null;
  customerId: string | null;
  productText: string | null;
  productId: string | null;
  quantityRequested: number | null;
  targetPrice: Prisma.Decimal | null;
  currency: string | null;
  neededByDate: Date | null;
  urgency: string | null;
  evidenceText: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  validUntil: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
  status: 'APPROVED' | 'NEW' | 'REJECTED' | 'EXPIRED';
};

const now = new Date('2026-05-05T12:00:00.000Z');

function createRecord(overrides: Partial<TestDemandRecord>): TestDemandRecord {
  return {
    id: 'demand-1',
    requestType: 'SOURCE_PRODUCT',
    customerName: 'Customer A',
    customerId: 'customer-1',
    productText: 'Pregabalin 150mg',
    productId: 'product-1',
    quantityRequested: 200,
    targetPrice: new Prisma.Decimal('3.20'),
    currency: 'GBP',
    neededByDate: new Date('2026-05-08T00:00:00.000Z'),
    urgency: 'HIGH',
    evidenceText: 'Can you source Pregabalin 150mg? Need 200 packs.',
    confidence: 'HIGH',
    validUntil: null,
    createdAt: new Date('2026-05-05T10:00:00.000Z'),
    approvedAt: new Date('2026-05-05T10:30:00.000Z'),
    status: 'APPROVED',
    ...overrides,
  };
}

function activeApproved(record: TestDemandRecord): boolean {
  return record.status === 'APPROVED' && (!record.validUntil || record.validUntil >= now);
}

test('loads only approved non-expired product-linked customer demand context', async () => {
  const records = [
    createRecord({ id: 'approved-demand', productId: 'product-1' }),
    createRecord({ id: 'new-demand', status: 'NEW', productId: 'product-1' }),
    createRecord({ id: 'rejected-demand', status: 'REJECTED', productId: 'product-1' }),
    createRecord({
      id: 'expired-demand',
      productId: 'product-1',
      validUntil: new Date('2026-05-01T00:00:00.000Z'),
    }),
    createRecord({ id: 'other-product-demand', productId: 'product-2' }),
  ];

  const repository = {
    async listProductLinked(productIds: string[]) {
      return records.filter(
        (record) => activeApproved(record) && record.productId && productIds.includes(record.productId),
      );
    },
  };

  const contexts = await loadApprovedCustomerDemandContextMap(
    [{ productId: 'product-1' }],
    now,
    repository,
  );
  const context = contexts.get(customerDemandContextKey('product-1'));

  assert.ok(context);
  assert.deepEqual(context.productLinked.map((item) => item.id), ['approved-demand']);
  assert.equal(context.productLinked[0]?.targetPrice, 3.2);
  assert.equal(context.productLinked[0]?.neededByDate, '2026-05-08T00:00:00.000Z');
});

test('bounds customer demand context to the five newest items per product', async () => {
  const records = Array.from({ length: 7 }, (_, index) =>
    createRecord({
      id: `demand-${index + 1}`,
      createdAt: new Date(`2026-05-05T0${index}:00:00.000Z`),
    }),
  );

  const repository = {
    async listProductLinked(productIds: string[]) {
      return records.filter(
        (record) => activeApproved(record) && record.productId && productIds.includes(record.productId),
      );
    },
  };

  const contexts = await loadApprovedCustomerDemandContextMap(
    [{ productId: 'product-1' }],
    now,
    repository,
  );
  const context = contexts.get(customerDemandContextKey('product-1'));

  assert.ok(context);
  assert.deepEqual(context.productLinked.map((item) => item.id), [
    'demand-7',
    'demand-6',
    'demand-5',
    'demand-4',
    'demand-3',
  ]);
});
