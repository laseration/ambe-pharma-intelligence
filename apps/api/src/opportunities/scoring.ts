import type { OpportunityConfig } from './config';
import { opportunityConfig } from './config';
import type {
  OpportunityCandidate,
  OpportunityMetrics,
  OpportunityScoreBreakdown,
  ScoringContext,
} from './types';

function round(value: number | null, precision = 2): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function diffDays(later: Date, earlier: Date | null): number | null {
  if (!earlier) {
    return null;
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / millisecondsPerDay));
}

function buildMetrics(context: ScoringContext): OpportunityMetrics {
  const latestSupplierBuyPrice = context.latestSupplierPrice?.unitPrice ?? null;
  const previousSupplierBuyPrice = context.previousSupplierPrice?.unitPrice ?? null;
  const averageSalePrice = context.recentSales.averageSalePrice;

  const supplierPriceChangePct =
    latestSupplierBuyPrice !== null &&
    previousSupplierBuyPrice !== null &&
    previousSupplierBuyPrice > 0
      ? (latestSupplierBuyPrice - previousSupplierBuyPrice) / previousSupplierBuyPrice
      : null;

  const estimatedMarginPct =
    latestSupplierBuyPrice !== null &&
    averageSalePrice !== null &&
    averageSalePrice > 0
      ? (averageSalePrice - latestSupplierBuyPrice) / averageSalePrice
      : null;

  return {
    currentStockQty: context.latestInventory?.quantityAvailable ?? null,
    daysSinceInventorySnapshot: diffDays(context.now, context.latestInventory?.snapshotDate ?? null),
    recentSalesUnits30d: context.recentSales.units30d,
    recentSalesVelocity30d: round(
      context.recentSales.units30d / opportunityConfig.recentSalesWindowDays,
      2,
    ) ?? 0,
    lastSaleDaysAgo: diffDays(context.now, context.recentSales.lastSaleDate),
    latestSupplierBuyPrice: round(latestSupplierBuyPrice),
    previousSupplierBuyPrice: round(previousSupplierBuyPrice),
    supplierPriceChangePct: round(supplierPriceChangePct),
    averageSalePrice: round(averageSalePrice),
    estimatedMarginPct: round(estimatedMarginPct),
  };
}

function buildBreakdown(baseScore: number) {
  const breakdown: OpportunityScoreBreakdown = {
    baseScore,
    adjustments: [],
    finalScore: baseScore,
  };

  return {
    add(label: string, value: number) {
      breakdown.adjustments.push({ label, value });
      breakdown.finalScore += value;
    },
    finalize() {
      breakdown.finalScore = clampScore(breakdown.finalScore);
      return breakdown;
    },
  };
}

function createCandidate(
  context: ScoringContext,
  type: OpportunityCandidate['type'],
  title: string,
  description: string,
  breakdown: OpportunityScoreBreakdown,
  metrics: OpportunityMetrics,
): OpportunityCandidate {
  const supplierId =
    context.latestSupplierPrice?.supplierId ?? context.latestInventory?.supplierId ?? null;

  return {
    type,
    status: 'OPEN',
    title,
    description,
    score: breakdown.finalScore,
    productId: context.product.id,
    supplierId,
    dedupeKey: [
      type,
      context.product.id,
      supplierId ?? 'none',
      context.now.toISOString().slice(0, 10),
    ].join(':'),
    metadata: {
      metrics,
      scoreBreakdown: breakdown,
      generatedAt: context.now.toISOString(),
    },
  };
}

export function scoreOpportunityCandidates(
  context: ScoringContext,
  config: OpportunityConfig = opportunityConfig,
): OpportunityCandidate[] {
  const metrics = buildMetrics(context);
  const candidates: OpportunityCandidate[] = [];
  const stockQty = metrics.currentStockQty ?? 0;
  const salesUnits = metrics.recentSalesUnits30d;
  const priceChange = metrics.supplierPriceChangePct;
  const marginPct = metrics.estimatedMarginPct;
  const lastSaleDaysAgo = metrics.lastSaleDaysAgo;

  if (
    metrics.latestSupplierBuyPrice !== null &&
    priceChange !== null &&
    priceChange <= -config.buyPriceImprovementPct &&
    salesUnits >= config.positiveSalesVelocityUnits
  ) {
    const builder = buildBreakdown(config.buyBaseScore);
    builder.add('Recent supplier price improved meaningfully', 12);
    builder.add('Positive recent sales demand', Math.min(10, Math.floor(salesUnits / 10)));

    const breakdown = builder.finalize();
    candidates.push(
      createCandidate(
        context,
        'BUY',
        `Buy opportunity for ${context.product.name}`,
        'Supplier price lower than recent benchmark with acceptable demand.',
        breakdown,
        metrics,
      ),
    );
  }

  if (
    metrics.latestSupplierBuyPrice !== null &&
    priceChange !== null &&
    Math.abs(priceChange) >= config.priceAlertChangePct
  ) {
    const builder = buildBreakdown(config.priceAlertBaseScore);
    builder.add('Supplier price changed against prior reference', Math.min(18, Math.round(Math.abs(priceChange) * 100)));
    const breakdown = builder.finalize();
    const direction = priceChange < 0 ? 'lower' : 'higher';

    candidates.push(
      createCandidate(
        context,
        'PRICE_ALERT',
        `Price alert for ${context.product.name}`,
        `Supplier price is meaningfully ${direction} than the recent benchmark.`,
        breakdown,
        metrics,
      ),
    );
  }

  if (
    stockQty >= config.highStockThresholdUnits &&
    salesUnits >= config.positiveSalesVelocityUnits
  ) {
    const builder = buildBreakdown(config.pushBaseScore);
    builder.add('Healthy stock available', 10);
    builder.add('Positive recent sales velocity', Math.min(12, Math.floor(salesUnits / 10)));
    const breakdown = builder.finalize();

    candidates.push(
      createCandidate(
        context,
        'PUSH',
        `Push ${context.product.name}`,
        'High stock with recent sales velocity suggests the product can be sold more aggressively.',
        breakdown,
        metrics,
      ),
    );
  }

  if (
    stockQty > 0 &&
    stockQty >= config.highStockThresholdUnits &&
    (salesUnits === 0 ||
      (lastSaleDaysAgo !== null && lastSaleDaysAgo >= config.deadStockNoSalesDays))
  ) {
    const builder = buildBreakdown(config.deadStockBaseScore);
    builder.add('High available stock', 12);
    builder.add('Weak or absent recent sales', 14);
    if (
      metrics.daysSinceInventorySnapshot !== null &&
      metrics.daysSinceInventorySnapshot >= config.staleInventoryDays
    ) {
      builder.add('Inventory snapshot itself is old', 6);
    }

    const breakdown = builder.finalize();
    candidates.push(
      createCandidate(
        context,
        'DEAD_STOCK',
        `Dead stock risk for ${context.product.name}`,
        'High stock with no recent sales; potential dead stock risk.',
        breakdown,
        metrics,
      ),
    );
  }

  if (
    marginPct !== null &&
    marginPct < config.lowMarginThresholdPct &&
    salesUnits > 0
  ) {
    const builder = buildBreakdown(config.lowMarginBaseScore);
    builder.add('Estimated margin below threshold', 12);
    const breakdown = builder.finalize();

    candidates.push(
      createCandidate(
        context,
        'LOW_MARGIN',
        `Low margin watch for ${context.product.name}`,
        'Estimated margin is below the configured threshold.',
        breakdown,
        metrics,
      ),
    );
  }

  if (
    stockQty <= config.lowStockThresholdUnits &&
    salesUnits >= config.positiveSalesVelocityUnits
  ) {
    const builder = buildBreakdown(config.restockBaseScore);
    builder.add('Low stock position', 12);
    builder.add('Positive recent sales velocity', Math.min(12, Math.floor(salesUnits / 10)));
    const breakdown = builder.finalize();

    candidates.push(
      createCandidate(
        context,
        'RESTOCK',
        `Restock ${context.product.name}`,
        'Low stock with positive recent sales velocity over last 30 days.',
        breakdown,
        metrics,
      ),
    );
  }

  return candidates;
}
