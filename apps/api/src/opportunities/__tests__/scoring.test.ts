import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOpportunityConfig } from '../config';
import { auditOpportunityScoring, scoreOpportunityCandidates } from '../scoring';
import type { ScoringContext } from '../types';

const baseNow = new Date('2026-04-20T00:00:00.000Z');

function createContext(overrides: Partial<ScoringContext>): ScoringContext {
  return {
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
    ...overrides,
  };
}

const stockholdingConfig = {
  ...buildOpportunityConfig('STOCKHOLDING'),
};

const tradingConfig = {
  ...buildOpportunityConfig('TRADING'),
};

const tradingBuyMarginRule =
  'Trading-mode estimated sell-side margin is available and not weak for BUY';

test('mode-specific opportunity thresholds split trading demand and margin inputs', () => {
  assert.equal(stockholdingConfig.healthyDemandUnits30d, 40);
  assert.equal(tradingConfig.healthyDemandUnits30d, 30);
  assert.equal(stockholdingConfig.lowMarginThresholdPct, 0.15);
  assert.equal(tradingConfig.lowMarginThresholdPct, 0.17);
});

test('creates restock candidate for low stock with recent sales', () => {
  const candidates = scoreOpportunityCandidates(createContext({}), stockholdingConfig);

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
  const candidates = scoreOpportunityCandidates(createContext({
    product: {
      id: 'product-2',
      name: 'Paracetamol 500mg Tablets',
    },
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
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
  }), stockholdingConfig);

  assert.ok(candidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.type === 'DEAD_STOCK' &&
        candidate.description === 'High stock with no recent sales; potential dead stock risk.',
    ),
  );
});

test('TRADING mode PUSH works on healthy demand without warehouse assumptions', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: null,
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
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    tradingConfig,
  );

  assert.ok(candidates.some((candidate) => candidate.type === 'PUSH'));
});

test('suppresses redundant PRICE_ALERT when BUY already captures the commercial action', () => {
  const candidates = scoreOpportunityCandidates(createContext({
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
  }), tradingConfig);

  assert.ok(candidates.some((candidate) => candidate.type === 'BUY'));
  assert.ok(!candidates.some((candidate) => candidate.type === 'PRICE_ALERT'));
});

test('BUY explanation is stronger when supplier price is the best recent known offer', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    product: {
      id: 'product-buy-explained',
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
  }), tradingConfig);

  const buyCandidate = candidates.find((candidate) => candidate.type === 'BUY');

  assert.ok(buyCandidate);
  assert.match(buyCandidate.description, /best recent known supplier offer/i);
  assert.match(buyCandidate.description, /estimated margin is about 40%/i);
  assert.equal(
    (buyCandidate.metadata as { commercialContext?: { hasBestRecentKnownOffer?: boolean } })
      .commercialContext?.hasBestRecentKnownOffer,
    true,
  );
});

test('PRICE_ALERT explanation is more commercially actionable', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    product: {
      id: 'product-price-alert',
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
      unitPrice: 2.2,
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
  }), tradingConfig);

  const priceAlertCandidate = candidates.find((candidate) => candidate.type === 'PRICE_ALERT');

  assert.ok(priceAlertCandidate);
  assert.match(priceAlertCandidate.description, /review selling price cover/i);
  assert.match(priceAlertCandidate.description, /estimated margin is now about 12%/i);
});

test('LOW_MARGIN explanation reflects the commercial issue clearly', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    product: {
      id: 'product-low-margin',
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
      unitPrice: 2.9,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    },
    previousSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 3,
      createdAt: new Date('2026-04-08T00:00:00.000Z'),
    },
    recentSales: {
      units30d: 90,
      averageSalePrice: 3.1,
      lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
    },
  }), tradingConfig);

  const lowMarginCandidate = candidates.find((candidate) => candidate.type === 'LOW_MARGIN');

  assert.ok(lowMarginCandidate);
  assert.match(lowMarginCandidate.description, /average sale price is 3\.10/i);
  assert.match(lowMarginCandidate.description, /supplier buy price of 2\.90/i);
  assert.match(lowMarginCandidate.description, /only about 6% margin/i);
});

test('BUY explanation uses supplier currency code when supplier price history provides it', () => {
  const candidates = scoreOpportunityCandidates(
    {
      ...createContext({
        product: {
          id: 'product-buy-currency',
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
      }),
      supplierPriceHistory: [
        {
          supplierId: 'supplier-1',
          unitPrice: 1.5,
          currencyCode: 'USD',
          createdAt: new Date('2026-04-19T00:00:00.000Z'),
          marketPriceEstimate: 1.9,
          marketPriceConfidence: 0.8,
          priceDeltaFromMarketPct: -0.21,
          supplierReliabilityScore: 0.7,
        },
        {
          supplierId: 'supplier-1',
          unitPrice: 1.8,
          currencyCode: 'USD',
          createdAt: new Date('2026-04-08T00:00:00.000Z'),
          marketPriceEstimate: null,
          marketPriceConfidence: null,
          priceDeltaFromMarketPct: null,
          supplierReliabilityScore: 0.7,
        },
      ],
    } as ScoringContext,
    tradingConfig,
  );

  const buyCandidate = candidates.find((candidate) => candidate.type === 'BUY');

  assert.ok(buyCandidate);
  assert.match(buyCandidate.description, /simulated market reference of USD 1\.61/i);
});

test('TRADING mode BUY is not suppressed when stock is already high', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 260,
      quantityOnHand: 275,
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
  }), tradingConfig);

  assert.ok(candidates.some((candidate) => candidate.type === 'BUY'));
});

test('TRADING mode BUY is not suppressed when inventory snapshot is stale', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
      quantityAvailable: 60,
      quantityOnHand: 70,
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
  }), tradingConfig);

  assert.ok(candidates.some((candidate) => candidate.type === 'BUY'));
});

test('STOCKHOLDING mode BUY is still suppressed when stock is already high', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 260,
      quantityOnHand: 275,
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
  }), stockholdingConfig);

  assert.ok(!candidates.some((candidate) => candidate.type === 'BUY'));
});

test('STOCKHOLDING mode BUY is still suppressed when inventory snapshot is stale', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
      quantityAvailable: 60,
      quantityOnHand: 70,
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
  }), stockholdingConfig);

  assert.ok(!candidates.some((candidate) => candidate.type === 'BUY'));
});

test('TRADING mode PUSH requires explicit margin visibility', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: null,
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
        units30d: 90,
        averageSalePrice: null,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    tradingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'PUSH'));
});

test('TRADING mode BUY is blocked when margin is missing', () => {
  const context = createContext({
    latestInventory: null,
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
      averageSalePrice: null,
      lastSaleDate: new Date('2026-04-19T00:00:00.000Z'),
    },
  });
  const candidates = scoreOpportunityCandidates(context, tradingConfig);
  const audit = auditOpportunityScoring(context, tradingConfig);
  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(!candidates.some((candidate) => candidate.type === 'BUY'));
  assert.equal(buyAudit?.eligible, false);
  assert.ok(buyAudit?.blockingReasons.includes(tradingBuyMarginRule));
});

test('TRADING mode BUY is blocked when margin is below threshold', () => {
  const context = createContext({
    latestInventory: null,
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
      averageSalePrice: 1.75,
      lastSaleDate: new Date('2026-04-19T00:00:00.000Z'),
    },
  });
  const candidates = scoreOpportunityCandidates(context, tradingConfig);
  const audit = auditOpportunityScoring(context, tradingConfig);
  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(!candidates.some((candidate) => candidate.type === 'BUY'));
  assert.equal(buyAudit?.eligible, false);
  assert.ok(buyAudit?.blockingReasons.includes(tradingBuyMarginRule));
});

test('TRADING mode BUY still appears when price edge demand and margin all pass', () => {
  const context = createContext({
    latestInventory: null,
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
  const candidates = scoreOpportunityCandidates(context, tradingConfig);
  const audit = auditOpportunityScoring(context, tradingConfig);
  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(candidates.some((candidate) => candidate.type === 'BUY'));
  assert.equal(buyAudit?.eligible, true);
  assert.deepEqual(buyAudit?.blockingReasons, []);
});

test('STOCKHOLDING mode BUY is not blocked by the trading margin rule', () => {
  const context = createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 60,
      quantityOnHand: 70,
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
      averageSalePrice: null,
      lastSaleDate: new Date('2026-04-19T00:00:00.000Z'),
    },
  });
  const candidates = scoreOpportunityCandidates(context, stockholdingConfig);
  const audit = auditOpportunityScoring(context, stockholdingConfig);
  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(candidates.some((candidate) => candidate.type === 'BUY'));
  assert.equal(buyAudit?.eligible, true);
  assert.ok(!buyAudit?.blockingReasons.includes(tradingBuyMarginRule));
});

test('TRADING mode BUY uses a lower healthy-demand threshold than STOCKHOLDING mode', () => {
  const context = createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 60,
      quantityOnHand: 70,
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
      units30d: 30,
      averageSalePrice: 2.5,
      lastSaleDate: new Date('2026-04-19T00:00:00.000Z'),
    },
  });

  const tradingCandidates = scoreOpportunityCandidates(context, tradingConfig);
  const stockholdingCandidates = scoreOpportunityCandidates(context, stockholdingConfig);

  assert.ok(tradingCandidates.some((candidate) => candidate.type === 'BUY'));
  assert.ok(!stockholdingCandidates.some((candidate) => candidate.type === 'BUY'));
});

test('TRADING mode PUSH uses a lower healthy-demand threshold than STOCKHOLDING mode', () => {
  const context = createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 320,
      quantityOnHand: 340,
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
      units30d: 30,
      averageSalePrice: 3.1,
      lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
    },
  });

  const tradingCandidates = scoreOpportunityCandidates(context, tradingConfig);
  const stockholdingCandidates = scoreOpportunityCandidates(context, stockholdingConfig);

  assert.ok(tradingCandidates.some((candidate) => candidate.type === 'PUSH'));
  assert.ok(!stockholdingCandidates.some((candidate) => candidate.type === 'PUSH'));
});

test('audit suppresses redundant PRICE_ALERT when BUY is already eligible', () => {
  const audit = auditOpportunityScoring(
    createContext({
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
    }),
    tradingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');
  const priceAlertAudit = audit.opportunities.find((entry) => entry.type === 'PRICE_ALERT');

  assert.ok(buyAudit);
  assert.equal(buyAudit?.eligible, true);
  assert.ok(priceAlertAudit);
  assert.equal(priceAlertAudit?.eligible, false);
  assert.equal(priceAlertAudit?.scoreBreakdown, null);
  assert.ok(
    priceAlertAudit?.blockingReasons.includes(
      'Actionable BUY opportunity already captures this supplier price move',
    ),
  );
});

test('TRADING mode LOW_MARGIN uses a tighter margin threshold than STOCKHOLDING mode', () => {
  const context = createContext({
    latestSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 2.6,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    },
    previousSupplierPrice: {
      supplierId: 'supplier-1',
      unitPrice: 2.7,
      createdAt: new Date('2026-04-08T00:00:00.000Z'),
    },
    recentSales: {
      units30d: 30,
      averageSalePrice: 3.1,
      lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
    },
  });

  const tradingCandidates = scoreOpportunityCandidates(context, tradingConfig);
  const stockholdingCandidates = scoreOpportunityCandidates(context, stockholdingConfig);

  assert.ok(tradingCandidates.some((candidate) => candidate.type === 'LOW_MARGIN'));
  assert.ok(!stockholdingCandidates.some((candidate) => candidate.type === 'LOW_MARGIN'));
});

test('audit shows BUY as eligible with score breakdown when thresholds pass', () => {
  const audit = auditOpportunityScoring(
    createContext({
      product: {
        id: 'product-buy',
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
    }),
    tradingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(buyAudit);
  assert.equal(buyAudit.eligible, true);
  assert.ok(buyAudit.scoreBreakdown);
  assert.deepEqual(buyAudit.blockingReasons, []);
  assert.ok(audit.generatedOpportunityTypes.includes('BUY'));
});

test('audit metrics use the passed recent-sales window config', () => {
  const audit = auditOpportunityScoring(
    createContext({
      recentSales: {
        units30d: 120,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    {
      ...stockholdingConfig,
      recentSalesWindowDays: 10,
    },
  );

  assert.equal(audit.metrics.recentSalesVelocity30d, 12);
});

test('audit shows BUY blocked when price improvement is too small', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestSupplierPrice: {
        supplierId: 'supplier-1',
        unitPrice: 2.12,
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
    }),
    tradingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(buyAudit);
  assert.equal(buyAudit.eligible, false);
  assert.ok(
    buyAudit.blockingReasons.includes('Supplier price improvement meets BUY threshold'),
  );
  assert.equal(buyAudit.scoreBreakdown, null);
  assert.ok(!audit.generatedOpportunityTypes.includes('BUY'));
});

test('audit shows RESTOCK blocked when sales velocity is too low', () => {
  const audit = auditOpportunityScoring(
    createContext({
      recentSales: {
        units30d: 8,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  const restockAudit = audit.opportunities.find((entry) => entry.type === 'RESTOCK');

  assert.ok(restockAudit);
  assert.equal(restockAudit.eligible, false);
  assert.ok(
    restockAudit.blockingReasons.includes('Recent sales demand meets RESTOCK healthy-demand threshold'),
  );
});

test('STOCKHOLDING mode PUSH still requires stock and demand', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 120,
        quantityOnHand: 140,
      },
      recentSales: {
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'PUSH'));
});

test('STOCKHOLDING mode PUSH is suppressed on low margin', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 320,
        quantityOnHand: 340,
      },
      latestSupplierPrice: {
        supplierId: 'supplier-1',
        unitPrice: 2.9,
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      },
      previousSupplierPrice: {
        supplierId: 'supplier-1',
        unitPrice: 3,
        createdAt: new Date('2026-04-10T00:00:00.000Z'),
      },
      recentSales: {
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'PUSH'));
});

test('suppresses RESTOCK when inventory snapshot is stale', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
      quantityAvailable: 30,
      quantityOnHand: 35,
    },
    recentSales: {
      units30d: 120,
      averageSalePrice: 3.1,
      lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
    },
  }), stockholdingConfig);

  assert.ok(!candidates.some((candidate) => candidate.type === 'RESTOCK'));
});

test('RESTOCK still triggers for genuinely low stock with healthy demand', () => {
  const candidates = scoreOpportunityCandidates(createContext({
    latestInventory: {
      supplierId: 'supplier-1',
      snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
      quantityAvailable: 30,
      quantityOnHand: 35,
    },
    recentSales: {
      units30d: 150,
      averageSalePrice: 3.1,
      lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
    },
  }), stockholdingConfig);

  assert.ok(candidates.some((candidate) => candidate.type === 'RESTOCK'));
});

test('audit shows DEAD_STOCK as eligible for stale no-sales inventory', () => {
  const audit = auditOpportunityScoring(
    createContext({
      product: {
        id: 'product-dead',
        name: 'Paracetamol 500mg Tablets',
      },
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
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
    }),
    stockholdingConfig,
  );

  const deadStockAudit = audit.opportunities.find((entry) => entry.type === 'DEAD_STOCK');

  assert.ok(deadStockAudit);
  assert.equal(deadStockAudit.eligible, true);
  assert.ok(deadStockAudit.scoreBreakdown);
  assert.ok(audit.generatedOpportunityTypes.includes('DEAD_STOCK'));
});

test('STOCKHOLDING mode DEAD_STOCK is suppressed on stale inventory data', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
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
    }),
    stockholdingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
});

test('STOCKHOLDING mode DEAD_STOCK is suppressed on healthy demand', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 400,
        quantityOnHand: 420,
      },
      latestSupplierPrice: null,
      previousSupplierPrice: null,
      recentSales: {
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
});

test('STOCKHOLDING mode DEAD_STOCK triggers on real stale stock risk', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 400,
        quantityOnHand: 420,
      },
      latestSupplierPrice: null,
      previousSupplierPrice: null,
      recentSales: {
        units30d: 0,
        averageSalePrice: null,
        lastSaleDate: new Date('2026-03-01T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  assert.ok(candidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
});

test('audit eligibility remains aligned with generated candidates', () => {
  const context = createContext({
    product: {
      id: 'product-alignment',
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
  const candidates = scoreOpportunityCandidates(context);
  const audit = auditOpportunityScoring(context, tradingConfig);

  assert.deepEqual(
    audit.generatedOpportunityTypes.sort(),
    candidates.map((candidate) => candidate.type).sort(),
  );

  for (const opportunityAudit of audit.opportunities) {
    assert.equal(
      opportunityAudit.eligible,
      candidates.some((candidate) => candidate.type === opportunityAudit.type),
    );
  }
});

test('audit shows TRADING mode BUY is not blocked by high stock', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 260,
        quantityOnHand: 275,
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
    }),
    tradingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(buyAudit);
  assert.equal(buyAudit.eligible, true);
  assert.ok(!buyAudit.blockingReasons.includes('Current stock is below BUY stock-suppression threshold'));
});

test('audit shows TRADING mode BUY is not blocked by stale inventory', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
        quantityAvailable: 60,
        quantityOnHand: 70,
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
    }),
    tradingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(buyAudit);
  assert.equal(buyAudit.eligible, true);
  assert.ok(!buyAudit.blockingReasons.includes('Inventory snapshot is fresh enough for BUY'));
});

test('audit shows STOCKHOLDING mode BUY blocked when stock is already high', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 260,
        quantityOnHand: 275,
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
    }),
    stockholdingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(buyAudit);
  assert.equal(buyAudit.eligible, false);
  assert.ok(
    buyAudit.blockingReasons.includes('Current stock is below BUY stock-suppression threshold'),
  );
});

test('audit shows STOCKHOLDING mode BUY blocked when inventory snapshot is stale', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
        quantityAvailable: 60,
        quantityOnHand: 70,
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
    }),
    stockholdingConfig,
  );

  const buyAudit = audit.opportunities.find((entry) => entry.type === 'BUY');

  assert.ok(buyAudit);
  assert.equal(buyAudit.eligible, false);
  assert.ok(
    buyAudit.blockingReasons.includes('Inventory snapshot is fresh enough for BUY'),
  );
});

test('audit shows RESTOCK blocked when inventory snapshot is stale', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
        quantityAvailable: 30,
        quantityOnHand: 35,
      },
      recentSales: {
        units30d: 120,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  const restockAudit = audit.opportunities.find((entry) => entry.type === 'RESTOCK');

  assert.ok(restockAudit);
  assert.equal(restockAudit.eligible, false);
  assert.ok(
    restockAudit.blockingReasons.includes('Inventory snapshot is fresh enough for RESTOCK'),
  );
});

test('TRADING mode suppresses RESTOCK', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 30,
        quantityOnHand: 35,
      },
      recentSales: {
        units30d: 150,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    tradingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'RESTOCK'));
});

test('TRADING mode suppresses DEAD_STOCK', () => {
  const candidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
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
    }),
    tradingConfig,
  );

  assert.ok(!candidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
});

test('TRADING mode still allows BUY and PUSH on their valid contexts', () => {
  const buyCandidates = scoreOpportunityCandidates(
    createContext({
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
    }),
    tradingConfig,
  );

  const pushCandidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 320,
        quantityOnHand: 340,
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
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    tradingConfig,
  );

  assert.ok(buyCandidates.some((candidate) => candidate.type === 'BUY'));
  assert.ok(pushCandidates.some((candidate) => candidate.type === 'PUSH'));
});

test('PUSH explanation is more useful in TRADING mode than STOCKHOLDING mode', () => {
  const tradingPushCandidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: null,
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
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    tradingConfig,
  );
  const stockholdingPushCandidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 320,
        quantityOnHand: 340,
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
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  const tradingPush = tradingPushCandidates.find((candidate) => candidate.type === 'PUSH');
  const stockholdingPush = stockholdingPushCandidates.find((candidate) => candidate.type === 'PUSH');

  assert.ok(tradingPush);
  assert.ok(stockholdingPush);
  assert.match(tradingPush.description, /promoted more actively/i);
  assert.match(tradingPush.description, /estimated margin is about 35%/i);
  assert.match(stockholdingPush.description, /high stock/i);
  assert.match(stockholdingPush.description, /estimated margin remains about 35%/i);
});

test('audit shows mode-aware PUSH blocking reasons clearly', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 320,
        quantityOnHand: 340,
      },
      latestSupplierPrice: {
        supplierId: 'supplier-1',
        unitPrice: 2.9,
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      },
      previousSupplierPrice: {
        supplierId: 'supplier-1',
        unitPrice: 3,
        createdAt: new Date('2026-04-10T00:00:00.000Z'),
      },
      recentSales: {
        units30d: 90,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );

  const pushAudit = audit.opportunities.find((entry) => entry.type === 'PUSH');

  assert.ok(pushAudit);
  assert.equal(pushAudit.eligible, false);
  assert.ok(
    pushAudit.blockingReasons.includes('Estimated margin is not weak for PUSH'),
  );
});

test('audit shows mode-aware DEAD_STOCK blocking reasons clearly', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-02-20T00:00:00.000Z'),
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
    }),
    stockholdingConfig,
  );

  const deadStockAudit = audit.opportunities.find((entry) => entry.type === 'DEAD_STOCK');

  assert.ok(deadStockAudit);
  assert.equal(deadStockAudit.eligible, false);
  assert.ok(
    deadStockAudit.blockingReasons.includes('Inventory snapshot is fresh enough for DEAD_STOCK'),
  );
});

test('audit shows business-mode suppression clearly for RESTOCK in TRADING mode', () => {
  const audit = auditOpportunityScoring(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 30,
        quantityOnHand: 35,
      },
      recentSales: {
        units30d: 150,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    tradingConfig,
  );

  const restockAudit = audit.opportunities.find((entry) => entry.type === 'RESTOCK');

  assert.ok(restockAudit);
  assert.equal(restockAudit.eligible, false);
  assert.ok(
    restockAudit.blockingReasons.includes('Opportunity type is enabled for current business mode'),
  );
  assert.equal(restockAudit.thresholds.businessMode, 'TRADING');
});

test('STOCKHOLDING mode preserves RESTOCK and DEAD_STOCK behavior', () => {
  const restockCandidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
        quantityAvailable: 30,
        quantityOnHand: 35,
      },
      recentSales: {
        units30d: 150,
        averageSalePrice: 3.1,
        lastSaleDate: new Date('2026-04-18T00:00:00.000Z'),
      },
    }),
    stockholdingConfig,
  );
  const deadStockCandidates = scoreOpportunityCandidates(
    createContext({
      latestInventory: {
        supplierId: 'supplier-1',
        snapshotDate: new Date('2026-04-19T00:00:00.000Z'),
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
    }),
    stockholdingConfig,
  );

  assert.ok(restockCandidates.some((candidate) => candidate.type === 'RESTOCK'));
  assert.ok(deadStockCandidates.some((candidate) => candidate.type === 'DEAD_STOCK'));
});
