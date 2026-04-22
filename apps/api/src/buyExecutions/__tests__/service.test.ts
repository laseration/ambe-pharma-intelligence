import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBuyExecutionService,
  upsertExecutionForBuyDecision,
  type BuyDecisionExecutionSnapshot,
} from '../service';

function createHarness() {
  const buyDecisions: Array<Record<string, any>> = [
    {
      id: 'buy-decision-1',
      supplierId: 'supplier-1',
      productId: 'product-1',
      quotedUnitPrice: { toString: () => '10.00' },
      quotedCurrencyCode: 'GBP',
      quotedMinimumOrderQuantity: 100,
      quotedAvailability: 'available',
      orderStatus: 'ORDERED',
      orderedAt: new Date('2026-04-21T09:00:00.000Z'),
      externalOrderReference: 'PO-001',
      supplierQualificationStatus: 'APPROVED',
      hasQualificationRisk: false,
      approvalStatus: 'APPROVED',
      approvedAt: new Date('2026-04-21T08:00:00.000Z'),
    },
  ];
  const executions: Array<Record<string, any>> = [];
  const executionEvents: Array<Record<string, any>> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const cloneState = () => ({
    buyDecisions: buyDecisions.map((item) => ({ ...item })),
    executions: executions.map((item) => ({ ...item })),
    executionEvents: executionEvents.map((item) => ({ ...item })),
  });

  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    buyDecisions.splice(0, buyDecisions.length, ...snapshot.buyDecisions);
    executions.splice(0, executions.length, ...snapshot.executions);
    executionEvents.splice(0, executionEvents.length, ...snapshot.executionEvents);
  };

  const repository = {
    async transaction(callback: (repo: any) => Promise<any>) {
      const snapshot = cloneState();
      try {
        return await callback(this);
      } catch (error) {
        restoreState(snapshot);
        throw error;
      }
    },
    async findById(buyExecutionId: string) {
      return (executions.find((item) => item.id === buyExecutionId) ?? null) as never;
    },
    async findByBuyDecisionId(buyDecisionId: string) {
      return (executions.find((item) => item.buyDecisionId === buyDecisionId) ?? null) as never;
    },
    async create(data: Record<string, any>) {
      const created = {
        id: nextId('execution'),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      executions.push(created);
      return created as never;
    },
    async update(buyExecutionId: string, data: Record<string, any>) {
      const index = executions.findIndex((item) => item.id === buyExecutionId);
      const existing = index >= 0 ? executions[index] : null;
      if (!existing) {
        throw new Error('execution not found');
      }

      const updated = { ...existing, ...data, updatedAt: new Date() };
      executions[index] = updated;
      return updated as never;
    },
    async createEvent(data: Record<string, any>) {
      const created = {
        id: nextId('execution-event'),
        createdAt: new Date(),
        ...data,
      };
      executionEvents.push(created);
      return created as never;
    },
    async list() {
      return executions as never;
    },
    async findBuyDecisionById(buyDecisionId: string) {
      return (buyDecisions.find((item) => item.id === buyDecisionId) ?? null) as never;
    },
    async updateBuyDecision(buyDecisionId: string, data: Record<string, any>) {
      const index = buyDecisions.findIndex((item) => item.id === buyDecisionId);
      const existing = index >= 0 ? buyDecisions[index] : null;
      if (!existing) {
        throw new Error('buy decision not found');
      }

      const updated = { ...existing, ...data };
      buyDecisions[index] = updated;
      return updated as never;
    },
  };

  return {
    buyDecisions,
    executions,
    executionEvents,
    repository,
    service: createBuyExecutionService(repository as never),
  };
}

async function createOrderedExecution(harness: ReturnType<typeof createHarness>) {
  return upsertExecutionForBuyDecision(
    harness.repository as never,
    harness.buyDecisions[0] as BuyDecisionExecutionSnapshot,
    {
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
      externalOrderReference: 'PO-001',
      orderPlacedAt: new Date('2026-04-21T09:00:00.000Z'),
      orderedQuantity: 100,
      orderedUnitPrice: '10.00',
      orderedCurrencyCode: 'GBP',
      fulfillmentStatus: 'ORDER_PLACED',
    },
  );
}

test('recording invoice reconciles matched terms and does not duplicate events on repeat update', async () => {
  const harness = createHarness();
  const execution = await createOrderedExecution(harness);

  const first = await harness.service.updateBuyExecution(execution.id, {
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    invoicedUnitPrice: '10.00',
    invoicedCurrencyCode: 'GBP',
    invoiceReference: 'INV-001',
    invoicedAt: new Date('2026-04-22T10:00:00.000Z'),
  });
  const second = await harness.service.updateBuyExecution(execution.id, {
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    invoicedUnitPrice: '10.00',
    invoicedCurrencyCode: 'GBP',
    invoiceReference: 'INV-001',
    invoicedAt: new Date('2026-04-22T10:00:00.000Z'),
  });

  assert.equal(first.summary.reconciliationStatus, 'MATCHED');
  assert.equal(first.summary.hasCommercialDrift, false);
  assert.equal(second.summary.reconciliationStatus, 'MATCHED');
  assert.equal(
    harness.executionEvents.filter((event) => event.actionType === 'INVOICE_RECORDED').length,
    1,
  );
});

test('price drift is flagged when invoiced unit price exceeds the configured threshold', async () => {
  const harness = createHarness();
  const execution = await createOrderedExecution(harness);

  const updated = await harness.service.updateBuyExecution(execution.id, {
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    invoicedUnitPrice: '10.50',
    invoicedCurrencyCode: 'GBP',
    invoiceReference: 'INV-DRIFT',
    invoicedAt: new Date('2026-04-22T10:00:00.000Z'),
  });

  assert.equal(updated.summary.reconciliationStatus, 'PRICE_DRIFT');
  assert.equal(updated.summary.hasPriceDrift, true);
  assert.equal(updated.summary.quoteToInvoicePriceDrift, 0.5);
  assert.equal(updated.summary.quoteToInvoicePriceDriftPct, 0.05);
});

test('quantity drift is flagged when received quantity materially differs from the quote expectation', async () => {
  const harness = createHarness();
  const execution = await createOrderedExecution(harness);

  const updated = await harness.service.updateBuyExecution(execution.id, {
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    receivedQuantity: 80,
    receivedAt: new Date('2026-04-23T12:00:00.000Z'),
  });

  assert.equal(updated.summary.reconciliationStatus, 'QUANTITY_DRIFT');
  assert.equal(updated.summary.hasQuantityDrift, true);
  assert.equal(updated.summary.quantityVariance, -20);
  assert.equal(harness.buyDecisions[0]?.orderStatus, 'PARTIALLY_FULFILLED');
});
