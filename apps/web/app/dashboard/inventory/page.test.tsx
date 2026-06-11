import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

import { InventoryDashboardContent } from './InventoryDashboardContent';
import type {
  InventoryListResponse,
  StockRiskRow,
} from '../../../lib/inventoryApi';

function collectText(node: ReactNode): string {
  const parts: string[] = [];

  function walk(value: ReactNode) {
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!isValidElement(value)) {
      return;
    }

    Children.forEach(
      (value as { props: { children?: ReactNode } }).props.children,
      walk,
    );
  }

  walk(node);
  return parts.join(' ');
}

const inventory: InventoryListResponse = {
  page: 1,
  limit: 25,
  hasMore: true,
  items: [
    {
      id: 'snapshot-1',
      product: {
        id: 'product-1',
        name: 'Atorvastatin 20mg Tablets 28',
        sku: 'ATOR-20-28',
        manufacturer: 'Example Pharma',
        strength: '20mg',
        dosageForm: 'Tablets',
        packSize: '28',
      },
      supplier: {
        id: 'supplier-1',
        name: 'Example Supplier',
        country: 'GB',
        isActive: true,
      },
      warehouseCode: 'MAIN',
      snapshotDate: '2026-06-01T10:00:00.000Z',
      ageDays: 10,
      quantityOnHand: 12,
      quantityReserved: 4,
      quantityAvailable: 8,
      unitCost: 4.5,
      totalValue: 54,
      lowStock: true,
      stale: false,
      source: {
        rawProductName: 'Atorvastatin 20mg Tabs x28',
        rawSupplierName: 'Example Supplier Ltd',
      },
    },
  ],
};

const stockRisk: StockRiskRow[] = [
  {
    product: inventory.items[0]!.product,
    supplier: inventory.items[0]!.supplier,
    warehouseCode: 'MAIN',
    snapshotDate: '2026-06-01T10:00:00.000Z',
    quantityAvailable: 8,
    recentSalesQuantity: 20,
    openOpportunityCount: 1,
    riskScore: 75,
    reasons: [
      {
        code: 'LOW_STOCK',
        message: 'Available quantity is 8, at or below the threshold.',
      },
    ],
  },
];

test('inventory dashboard content renders stock risk and inventory summaries', () => {
  const text = collectText(
    InventoryDashboardContent({
      filters: {
        q: 'atorvastatin',
        lowStockOnly: true,
        staleOnly: false,
        page: 1,
      },
      inventory,
      stockRisk,
    }),
  );

  assert.match(text, /Stock and Snapshot Freshness/);
  assert.match(text, /Products needing stock attention/);
  assert.match(text, /Atorvastatin 20mg Tablets 28/);
  assert.match(text, /Available quantity is 8/);
  assert.match(text, /Low stock/);
  assert.match(text, /Next/);
});
