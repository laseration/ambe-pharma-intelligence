import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreOpportunityCandidates } from '../scoring';

const baseNow = new Date('2026-04-20T00:00:00.000Z');

test('creates restock candidate for low stock with recent sales', () => {
  const candidates = scoreOpportunityCandidates({
    now: baseNow,
    product: {
      id: 'product-1',
      name: 'Amlodipine 5mg Tablets',
    },
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 40,
      quantityOnHand: 50,
    },
    latestSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 2,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    },
    previousSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 2.2,
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
    },
    recentSales: {
      units30d: 120,
      averageSalePrice: 3.1,
      lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
    },
  });

  assert.ok(candidates.some((candidate) => candidate.type === 'RESTOCK'));
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.type === 'RESTOCK' &&
        candidate.description === 'Low stock with positive recent sales velocity over last 30 days.',
    ),
  );
});

test('creates dead stock candidate for high stock with no recent sales', () => {
  const candidates = scoreOpportunityCandidates({
    now: baseNow,
    product: {
      id: 'product-2',
      name: 'Paracetamol 500mg Tablets',
    },
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-03-01T00:00:00.000Z'),
      quantityAvailable: 400,
      quantityOnHand: 420,
    },
    latestSupplierPrice: null,
    previousSupplierPrice: null,
    recentSales: {
      units30d: 0,
      averageSalePrice: null,
      lastSaleDate: null,
    },
  });

  assert.ok(candidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.type === 'DEAD_STOCK' &&
        candidate.description === 'High stock with no recent sales; potential dead stock risk.',
    ),
  );
});

test('creates buy and price alert candidates for improved supplier pricing with demand', () => {
  const candidates = scoreOpportunityCandidates({
    now: baseNow,
    product: {
      id: 'product-3',
      name: 'Ibuprofen 200mg Tablets',
    },
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 180,
      quantityOnHand: 200,
    },
    latestSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 1.5,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    },
    previousSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 1.8,
      createdAt: new Date('2026-04-08T00:00:00.000Z'),
    },
    recentSales: {
      units30d: 90,
      averageSalePrice: 2.5,
      lastSaleDate: new Date('2026-04-19T00:00:00.000Z'),
    },
  });

  assert.ok(candidates.some((candidate) => candidate.type === 'BUY'));
  assert.ok(candidates.some((candidate) => candidate.type === 'PRICE_ALERT'));
});
