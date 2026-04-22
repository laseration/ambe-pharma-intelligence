import assert from 'node:assert/strict';
import test from 'node:test';

import { createSupplierScorecardService } from '../scorecardService';

function createSupplier(overrides?: Record<string, any>) {
  return {
    id: 'supplier-1',
    name: 'Supplier One',
    normalizedName: 'supplier-one',
    isActive: true,
    updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    qualification: {
      qualificationStatus: 'APPROVED',
      trustTier: 'HIGH',
      qualificationNote: 'Approved',
      lastReviewedAt: new Date('2026-04-20T12:00:00.000Z'),
      requiresManualApproval: false,
      canAutoApproveBuyDecisions: true,
    },
    buyDecisions: [
      {
        id: 'buy-1',
        supplierId: 'supplier-1',
        productId: 'product-1',
        quotedUnitPrice: { toString: () => '10.00' },
        quotedCurrencyCode: 'GBP',
        quotedMinimumOrderQuantity: 100,
        quotedAvailability: 'available',
        orderStatus: 'FULFILLED',
        orderedAt: new Date('2026-04-21T09:00:00.000Z'),
        externalOrderReference: 'PO-001',
        supplierQualificationStatus: 'APPROVED',
        hasQualificationRisk: false,
        approvalStatus: 'APPROVED',
        approvedAt: new Date('2026-04-21T08:00:00.000Z'),
        updatedAt: new Date('2026-04-21T12:00:00.000Z'),
        execution: {
          id: 'execution-1',
          buyDecisionId: 'buy-1',
          supplierId: 'supplier-1',
          productId: 'product-1',
          orderedQuantity: 100,
          orderedUnitPrice: { toString: () => '9.90' },
          orderedCurrencyCode: 'GBP',
          orderedMinimumOrderQuantity: 100,
          confirmedAvailability: true,
          externalOrderReference: 'PO-001',
          orderPlacedAt: new Date('2026-04-21T09:00:00.000Z'),
          orderConfirmedAt: new Date('2026-04-21T09:30:00.000Z'),
          expectedDeliveryDate: new Date('2026-04-22T09:00:00.000Z'),
          receivedQuantity: 100,
          receivedAt: new Date('2026-04-22T09:00:00.000Z'),
          invoicedUnitPrice: { toString: () => '10.10' },
          invoicedCurrencyCode: 'GBP',
          invoiceReference: 'INV-001',
          invoicedAt: new Date('2026-04-22T12:00:00.000Z'),
          fulfillmentStatus: 'RECEIVED',
          reconciliationStatus: 'MATCHED',
          hasPriceDrift: false,
          hasQuantityDrift: false,
          hasCurrencyMismatch: false,
          hasAvailabilityDrift: false,
          notes: null,
          metadata: null,
          createdAt: new Date('2026-04-21T09:00:00.000Z'),
          updatedAt: new Date('2026-04-22T12:00:00.000Z'),
        },
      },
      {
        id: 'buy-2',
        supplierId: 'supplier-1',
        productId: 'product-2',
        quotedUnitPrice: { toString: () => '20.00' },
        quotedCurrencyCode: 'GBP',
        quotedMinimumOrderQuantity: 50,
        quotedAvailability: 'available',
        orderStatus: 'CANCELLED',
        orderedAt: new Date('2026-04-21T11:00:00.000Z'),
        externalOrderReference: 'PO-002',
        supplierQualificationStatus: 'APPROVED',
        hasQualificationRisk: true,
        approvalStatus: 'APPROVED',
        approvedAt: new Date('2026-04-21T10:00:00.000Z'),
        updatedAt: new Date('2026-04-21T13:00:00.000Z'),
        execution: {
          id: 'execution-2',
          buyDecisionId: 'buy-2',
          supplierId: 'supplier-1',
          productId: 'product-2',
          orderedQuantity: 50,
          orderedUnitPrice: { toString: () => '21.50' },
          orderedCurrencyCode: 'GBP',
          orderedMinimumOrderQuantity: 50,
          confirmedAvailability: false,
          externalOrderReference: 'PO-002',
          orderPlacedAt: new Date('2026-04-21T11:00:00.000Z'),
          orderConfirmedAt: null,
          expectedDeliveryDate: null,
          receivedQuantity: null,
          receivedAt: null,
          invoicedUnitPrice: null,
          invoicedCurrencyCode: null,
          invoiceReference: null,
          invoicedAt: null,
          fulfillmentStatus: 'CANCELLED',
          reconciliationStatus: 'PRICE_DRIFT',
          hasPriceDrift: true,
          hasQuantityDrift: false,
          hasCurrencyMismatch: false,
          hasAvailabilityDrift: true,
          notes: null,
          metadata: null,
          createdAt: new Date('2026-04-21T11:00:00.000Z'),
          updatedAt: new Date('2026-04-21T11:30:00.000Z'),
        },
      },
    ],
    ...overrides,
  };
}

test('supplier scorecard aggregates execution metrics and drift incidents deterministically', async () => {
  const service = createSupplierScorecardService({
    async listSuppliers() {
      return [createSupplier()] as never;
    },
    async findSupplierById() {
      return createSupplier() as never;
    },
  });

  const scorecard = await service.getScorecardForSupplier('supplier-1');

  assert.equal(scorecard?.totalApprovedBuyDecisions, 2);
  assert.equal(scorecard?.totalOrderedExecutions, 2);
  assert.equal(scorecard?.totalReceivedExecutions, 1);
  assert.equal(scorecard?.totalCancelledExecutions, 1);
  assert.equal(scorecard?.fulfillmentRate, 0.5);
  assert.equal(scorecard?.priceDriftIncidentCount, 1);
  assert.equal(scorecard?.quantityDriftIncidentCount, 0);
  assert.equal(scorecard?.qualificationRiskCount, 1);
  assert.equal(scorecard?.summary.recommendedAction, 'investigate drift');
});

test('blocked and unknown supplier states remain visible in scorecard context', async () => {
  const blockedSupplier = createSupplier({
    id: 'supplier-blocked',
    name: 'Blocked Supplier',
    normalizedName: 'blocked-supplier',
    qualification: {
      qualificationStatus: 'BLOCKED',
      trustTier: 'LOW',
      qualificationNote: 'Blocked',
      lastReviewedAt: new Date('2026-04-21T12:00:00.000Z'),
      requiresManualApproval: true,
      canAutoApproveBuyDecisions: false,
    },
    buyDecisions: [],
  });
  const unknownSupplier = createSupplier({
    id: 'supplier-unknown',
    name: 'Unknown Supplier',
    normalizedName: 'unknown-supplier',
    qualification: null,
    buyDecisions: [],
  });
  const service = createSupplierScorecardService({
    async listSuppliers() {
      return [blockedSupplier, unknownSupplier] as never;
    },
    async findSupplierById(supplierId) {
      return [blockedSupplier, unknownSupplier].find((item) => item.id === supplierId) as never;
    },
  });

  const blocked = await service.getScorecardForSupplier('supplier-blocked');
  const unknown = await service.getScorecardForSupplier('supplier-unknown');

  assert.equal(blocked?.qualificationStatus, 'BLOCKED');
  assert.equal(blocked?.summary.recommendedAction, 'restrict supplier');
  assert.equal(blocked?.tier, 'RISKY');
  assert.equal(unknown?.qualificationStatus, 'UNKNOWN');
  assert.equal(unknown?.trustTier, 'LOW');
  assert.equal(unknown?.summary.hasQualificationRisk, true);
});
