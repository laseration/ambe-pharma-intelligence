import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Opportunity, Prisma } from '@prisma/client';

import { db } from '../../lib/db';
import { publishOpportunity } from '../service';

function createOpportunity(
  overrides?: Partial<Opportunity>,
): Opportunity & {
  product: { name: string } | null;
  supplier: { name: string } | null;
} {
  return {
    id: 'opportunity-1',
    type: 'BUY',
    status: 'OPEN',
    title: 'Buy opportunity',
    description: 'Supplier price is attractive.',
    score: 82,
    metadata: {
      metrics: {
        latestSupplierBuyPrice: 8.4,
      },
    } satisfies Prisma.JsonObject,
    customerId: null,
    productId: 'product-1',
    supplierId: 'supplier-1',
    ownerUserId: null,
    dueDate: null,
    createdAt: new Date('2026-04-23T00:00:00.000Z'),
    updatedAt: new Date('2026-04-23T00:00:00.000Z'),
    product: { name: 'Amlodipine 5mg tabs 28' },
    supplier: { name: 'Supplier Co' },
    ...overrides,
  };
}

function installOpportunityMock(t: TestContext, opportunity: ReturnType<typeof createOpportunity>) {
  const originalFindUnique = db.opportunity.findUnique;

  db.opportunity.findUnique = (async ({ where }) => {
    return where.id === opportunity.id ? opportunity : null;
  }) as typeof db.opportunity.findUnique;

  t.after(() => {
    db.opportunity.findUnique = originalFindUnique;
  });
}

test('Telegram publish blocks unreviewed opportunity notifications before integration calls', async (t) => {
  installOpportunityMock(t, createOpportunity({ status: 'OPEN' }));

  await assert.rejects(
    () => publishOpportunity('opportunity-1'),
    /Needs review before execution/i,
  );
});
