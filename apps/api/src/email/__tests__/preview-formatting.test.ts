import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOpportunityMessage } from '../../telegram/templates';

test('simplified opportunity template is easy to read for push signals', () => {
  const message = buildOpportunityMessage({
    id: 'opp-2',
    type: 'PUSH',
    status: 'OPEN',
    title: 'Push Paracetamol',
    description: 'We have a lot in stock.',
    score: 90,
    metadata: {
      metrics: {
        currentStockQty: 320,
      },
    },
    customerId: null,
    productId: 'product-2',
    supplierId: 'supplier-2',
    ownerUserId: null,
    dueDate: null,
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    product: { name: 'Atorvastatin 20mg 28' },
    supplier: { name: 'Acme Supplier' },
  });

  assert.ok(message.startsWith('📦 TRY TO SELL THIS'));
  assert.ok(message.includes('Stock: 320'));
  assert.ok(message.includes('What to do: Offer this to customers'));
});
