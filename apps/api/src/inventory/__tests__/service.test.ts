import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryService,
  type InventoryRepository,
  type InventorySnapshotRecord,
} from '../service';

const now = new Date('2026-06-11T12:00:00.000Z');

const productA = {
  id: 'product-a',
  name: 'Atorvastatin 20mg Tablets',
  sku: 'ATOR-20',
  manufacturer: 'Example Pharma',
  strength: '20mg',
  dosageForm: 'Tablet',
  packSize: '28',
};

const productB = {
  id: 'product-b',
  name: 'Amoxicillin 500mg Capsules',
  sku: null,
  manufacturer: null,
  strength: '500mg',
  dosageForm: 'Capsule',
  packSize: '21',
};

const supplier = {
  id: 'supplier-a',
  name: 'Safe Supplier',
  country: 'GB',
  isActive: true,
};

const snapshots: InventorySnapshotRecord[] = [
  {
    id: 'snapshot-new',
    productId: productA.id,
    supplierId: supplier.id,
    rawProductName: productA.name,
    rawSupplierName: supplier.name,
    warehouseCode: 'MAIN',
    snapshotDate: new Date('2026-06-10T09:00:00.000Z'),
    quantityOnHand: 8,
    quantityReserved: 2,
    quantityAvailable: 6,
    unitCost: '3.50',
    totalValue: '28.00',
    createdAt: new Date('2026-06-10T09:01:00.000Z'),
    product: productA,
    supplier,
  },
  {
    id: 'snapshot-old-duplicate',
    productId: productA.id,
    supplierId: supplier.id,
    rawProductName: productA.name,
    rawSupplierName: supplier.name,
    warehouseCode: 'MAIN',
    snapshotDate: new Date('2026-05-01T09:00:00.000Z'),
    quantityOnHand: 40,
    quantityReserved: 0,
    quantityAvailable: 40,
    unitCost: '3.50',
    totalValue: '140.00',
    createdAt: new Date('2026-05-01T09:01:00.000Z'),
    product: productA,
    supplier,
  },
];

function createRepository(): InventoryRepository {
  return {
    async listSnapshots() {
      return snapshots;
    },
    async listRecentSales() {
      return [
        {
          productId: productA.id,
          quantity: 30,
          saleDate: new Date('2026-06-08T10:00:00.000Z'),
        },
      ];
    },
    async listOpenOpportunities() {
      return [
        {
          id: 'opportunity-a',
          productId: productA.id,
          type: 'RESTOCK',
          status: 'OPEN',
          score: 80,
          title: 'Restock product A',
          updatedAt: new Date('2026-06-10T12:00:00.000Z'),
        },
      ];
    },
    async listProductsMissingRecentSnapshot() {
      return [
        {
          ...productB,
          inventorySnapshots: [
            {
              snapshotDate: new Date('2026-04-01T10:00:00.000Z'),
              quantityAvailable: 12,
            },
          ],
        },
      ];
    },
  };
}

test('inventory list returns latest deterministic stock summaries', async () => {
  const service = createInventoryService(createRepository(), () => now);
  const result = await service.listInventory({ limit: 10 });
  const item = result.items[0];

  assert.equal(result.items.length, 1);
  assert.ok(item);
  assert.equal(item.id, 'snapshot-new');
  assert.equal(item.product.name, productA.name);
  assert.equal(item.supplier?.name, supplier.name);
  assert.equal(item.quantityAvailable, 6);
  assert.equal(item.unitCost, 3.5);
  assert.equal(item.lowStock, true);
  assert.equal(item.stale, false);
});

test('stock risk returns deterministic reason codes', async () => {
  const service = createInventoryService(createRepository(), () => now);
  const rows = await service.listStockRisk({ limit: 10 });
  const productRisk = rows.find((row) => row.product.id === productA.id);
  const missingSnapshotRisk = rows.find(
    (row) => row.product.id === productB.id,
  );

  assert.ok(productRisk);
  assert.deepEqual(
    productRisk.reasons.map((reason) => reason.code),
    ['LOW_STOCK', 'RECENT_SALES_VELOCITY', 'OPEN_OPPORTUNITY'],
  );
  assert.equal(productRisk.recentSalesQuantity, 30);
  assert.equal(productRisk.openOpportunityCount, 1);

  assert.ok(missingSnapshotRisk);
  assert.deepEqual(
    missingSnapshotRisk.reasons.map((reason) => reason.code),
    ['MISSING_RECENT_SNAPSHOT'],
  );
});
