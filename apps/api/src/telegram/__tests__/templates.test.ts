import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDailySummaryMessage,
  buildOpportunityMessage,
} from '../templates';

test('formats buy opportunity Telegram message', () => {
  const message = buildOpportunityMessage({
    id: 'opp-1',
    type: 'BUY',
    status: 'OPEN',
    title: 'Buy opportunity',
    description: 'Good price and worth buying.',
    score: 82,
    metadata: {
      metrics: {
        currentStockQty: 25,
        latestSupplierBuyPrice: 2.35,
      },
    },
    customerId: null,
    productId: 'product-1',
    supplierId: 'supplier-1',
    ownerUserId: null,
    dueDate: null,
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    product: { name: 'Amlodipine 5mg 28' },
    supplier: { name: 'Acme Supplier' },
  });

  assert.ok(message.startsWith('✅ BUY THIS'));
  assert.ok(message.includes('Product: Amlodipine 5mg 28'));
  assert.ok(message.includes('Supplier: Acme Supplier'));
  assert.ok(message.includes('Price: 2.35'));
  assert.ok(message.includes('What to do: Check and buy if stock is needed'));
});

test('formats daily summary Telegram message', () => {
  const message = buildDailySummaryMessage(
    [
      {
        id: 'opp-1',
        type: 'RESTOCK',
        status: 'OPEN',
        title: 'Restock Amlodipine',
        description: 'It sells and stock is low.',
        score: 79,
        metadata: null,
        customerId: null,
        productId: 'product-1',
        supplierId: 'supplier-1',
        ownerUserId: null,
        dueDate: null,
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T00:00:00.000Z'),
        product: { name: 'Amlodipine 5mg 28' },
        supplier: { name: 'Acme Supplier' },
      },
    ],
    new Date('2026-04-20T00:00:00.000Z'),
  );

  assert.ok(message.startsWith("📋 TODAY'S SIGNALS"));
  assert.ok(message.includes('Open opportunities: 1'));
  assert.ok(message.includes('RESTOCK: 1'));
  assert.ok(message.includes('What to do: Reorder soon'));
});
