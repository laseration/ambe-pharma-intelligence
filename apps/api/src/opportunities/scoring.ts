import type { OpportunityType, Prisma } from '@prisma/client';

import type { OpportunityBusinessMode, OpportunityConfig } from './config';
import { opportunityConfig } from './config';
import type {
  OpportunityCandidate,
  OpportunityMetrics,
  OpportunityScoreBreakdown,
  OpportunityScoringAudit,
  OpportunityScoringAuditEntry,
  ScoringAuditCheck,
  ScoringContext,
} from './types';

type ExtendedSupplierPriceHistoryItem = {
  supplierId: string;
  unitPrice: number;
  createdAt: Date;
  marketPriceEstimate: number | null;
  marketPriceConfidence: number | null;
  priceDeltaFromMarketPct: number | null;
  supplierReliabilityScore: number | null;
};

type ExtendedScoringContext = ScoringContext & {
  supplierPriceHistory?: ExtendedSupplierPriceHistoryItem[];
};

type ExtendedOpportunityMetrics = OpportunityMetrics & {
  rollingAverageSupplierPrice: number | null;
  bestSupplierBuyPrice: number | null;
  simulatedMarketPrice: number | null;
  marketPriceConfidence: number | null;
  priceDeltaVsMarketPct: number | null;
  supplierReliabilityScore: number | null;
  volatilityScore: number | null;
};

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

function getExtendedContext(context: ScoringContext): ExtendedScoringContext {
  return context as ExtendedScoringContext;
}

function calculatePriceDeltaFromMarketPct(
  currentPrice: number | null,
  marketPrice: number | null,
): number | null {
  if (currentPrice === null || marketPrice === null || marketPrice <= 0) {
    return null;
  }

  return round((currentPrice - marketPrice) / marketPrice, 4);
}

function calculateVolatilityScore(prices: number[]): number | null {
  if (prices.length === 0) {
    return null;
  }

  if (prices.length === 1) {
    return 0;
  }

  const averagePrice = prices.reduce((total, price) => total + price, 0) / prices.length;
  if (averagePrice <= 0) {
    return null;
  }

  const variance =
    prices.reduce((total, price) => total + (price - averagePrice) ** 2, 0) / prices.length;
  return round(Math.max(0, Math.min(1, Math.sqrt(variance) / averagePrice)), 4);
}

function calculateMarketConfidence(
  sampleCount: number,
  latestObservedAt: Date | null,
  prices: number[],
  now: Date,
  config: OpportunityConfig,
): number | null {
  if (sampleCount === 0 || !latestObservedAt || prices.length === 0) {
    return null;
  }

  const sampleScore = Math.max(
    0,
    Math.min(1, sampleCount / Math.max(1, config.marketMinSampleCount)),
  );
  const latestAgeDays = Math.max(
    0,
    (now.getTime() - latestObservedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const recencyScore = Math.max(
    0,
    Math.min(1, 1 - latestAgeDays / Math.max(1, config.marketLookbackDays)),
  );
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice = prices.reduce((total, price) => total + price, 0) / prices.length;
  const spreadConsistency =
    averagePrice > 0 ? Math.max(0, Math.min(1, 1 - (maxPrice - minPrice) / averagePrice)) : 0;

  return round(sampleScore * (0.5 + 0.3 * recencyScore + 0.2 * spreadConsistency), 4);
}

function buildMarketSimulation(
  context: ScoringContext,
  config: OpportunityConfig,
): Omit<
  ExtendedOpportunityMetrics,
  | 'currentStockQty'
  | 'daysSinceInventorySnapshot'
  | 'recentSalesUnits30d'
  | 'recentSalesVelocity30d'
  | 'lastSaleDaysAgo'
  | 'latestSupplierBuyPrice'
  | 'previousSupplierBuyPrice'
  | 'supplierPriceChangePct'
  | 'averageSalePrice'
  | 'estimatedMarginPct'
> {
  const extendedContext = getExtendedContext(context);
  const supplierPriceHistory = (extendedContext.supplierPriceHistory ?? []).filter((priceItem) => {
    const ageDays = diffDays(context.now, priceItem.createdAt);
    return ageDays !== null && ageDays <= config.marketLookbackDays;
  });
  const latestHistoryItem = supplierPriceHistory[0] ?? null;
  const latestSupplierBuyPrice = context.latestSupplierPrice?.unitPrice ?? latestHistoryItem?.unitPrice ?? null;
  const prices = supplierPriceHistory.map((priceItem) => priceItem.unitPrice);
  const rollingAverageSupplierPrice =
    prices.length > 0 ? round(prices.reduce((total, price) => total + price, 0) / prices.length) : null;
  const bestSupplierBuyPrice = prices.length > 0 ? round(Math.min(...prices)) : null;
  const weightedTotals = supplierPriceHistory.reduce(
    (totals, priceItem) => {
      const ageDays = Math.max(
        0,
        (context.now.getTime() - priceItem.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const weight = 1 / (1 + ageDays / Math.max(1, config.marketRecentWeightDays));

      return {
        weightTotal: totals.weightTotal + weight,
        weightedPriceTotal: totals.weightedPriceTotal + priceItem.unitPrice * weight,
      };
    },
    {
      weightTotal: 0,
      weightedPriceTotal: 0,
    },
  );
  const computedMarketPrice =
    weightedTotals.weightTotal > 0
      ? round(weightedTotals.weightedPriceTotal / weightedTotals.weightTotal)
      : null;
  const simulatedMarketPrice = computedMarketPrice ?? latestHistoryItem?.marketPriceEstimate ?? null;
  const marketPriceConfidence =
    calculateMarketConfidence(
      supplierPriceHistory.length,
      latestHistoryItem?.createdAt ?? null,
      prices,
      context.now,
      config,
    ) ?? latestHistoryItem?.marketPriceConfidence ?? null;

  return {
    rollingAverageSupplierPrice,
    bestSupplierBuyPrice,
    simulatedMarketPrice,
    marketPriceConfidence,
    priceDeltaVsMarketPct:
      calculatePriceDeltaFromMarketPct(latestSupplierBuyPrice, simulatedMarketPrice) ??
      latestHistoryItem?.priceDeltaFromMarketPct ??
      null,
    supplierReliabilityScore: latestHistoryItem?.supplierReliabilityScore ?? null,
    volatilityScore: calculateVolatilityScore(prices),
  };
}

function buildMetrics(
  context: ScoringContext,
  config: OpportunityConfig,
): ExtendedOpportunityMetrics {
  const latestSupplierBuyPrice = context.latestSupplierPrice?.unitPrice ?? null;
  const previousSupplierBuyPrice = context.previousSupplierPrice?.unitPrice ?? null;
  const averageSalePrice = context.recentSales.averageSalePrice;
  const marketSimulation = buildMarketSimulation(context, config);

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
      context.recentSales.units30d / config.recentSalesWindowDays,
      2,
    ) ?? 0,
    lastSaleDaysAgo: diffDays(context.now, context.recentSales.lastSaleDate),
    latestSupplierBuyPrice: round(latestSupplierBuyPrice),
    previousSupplierBuyPrice: round(previousSupplierBuyPrice),
    supplierPriceChangePct: round(supplierPriceChangePct),
    averageSalePrice: round(averageSalePrice),
    estimatedMarginPct: round(estimatedMarginPct),
    rollingAverageSupplierPrice: marketSimulation.rollingAverageSupplierPrice,
    bestSupplierBuyPrice: marketSimulation.bestSupplierBuyPrice,
    simulatedMarketPrice: marketSimulation.simulatedMarketPrice,
    marketPriceConfidence: marketSimulation.marketPriceConfidence,
    priceDeltaVsMarketPct: marketSimulation.priceDeltaVsMarketPct,
    supplierReliabilityScore: marketSimulation.supplierReliabilityScore,
    volatilityScore: marketSimulation.volatilityScore,
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

function formatPrice(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return `\u00A3${value.toFixed(2)}`;
}

function formatPct(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

function isBestRecentKnownSupplierOffer(metrics: ExtendedOpportunityMetrics): boolean {
  return (
    metrics.latestSupplierBuyPrice !== null &&
    ((metrics.previousSupplierBuyPrice !== null &&
      metrics.latestSupplierBuyPrice < metrics.previousSupplierBuyPrice) ||
      (metrics.bestSupplierBuyPrice !== null &&
        metrics.latestSupplierBuyPrice <= metrics.bestSupplierBuyPrice))
  );
}

function buildCommercialContext(metrics: ExtendedOpportunityMetrics) {
  const hasBestRecentKnownOffer = isBestRecentKnownSupplierOffer(metrics);
  const supplierSavingPct =
    metrics.latestSupplierBuyPrice !== null &&
    metrics.previousSupplierBuyPrice !== null &&
    metrics.previousSupplierBuyPrice > 0
      ? round(
          (metrics.previousSupplierBuyPrice - metrics.latestSupplierBuyPrice) /
            metrics.previousSupplierBuyPrice,
        )
      : null;

  return {
    hasBestRecentKnownOffer,
    supplierSavingPct,
    latestSupplierBuyPrice: metrics.latestSupplierBuyPrice,
    previousSupplierBuyPrice: metrics.previousSupplierBuyPrice,
    averageSalePrice: metrics.averageSalePrice,
    estimatedMarginPct: metrics.estimatedMarginPct,
    rollingAverageSupplierPrice: metrics.rollingAverageSupplierPrice,
    bestSupplierBuyPrice: metrics.bestSupplierBuyPrice,
    simulatedMarketPrice: metrics.simulatedMarketPrice,
    marketPriceConfidence: metrics.marketPriceConfidence,
    priceDeltaVsMarketPct: metrics.priceDeltaVsMarketPct,
    supplierReliabilityScore: metrics.supplierReliabilityScore,
    volatilityScore: metrics.volatilityScore,
  };
}

function joinSentences(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

function createCandidate(
  context: ScoringContext,
  type: OpportunityCandidate['type'],
  title: string,
  description: string,
  breakdown: OpportunityScoreBreakdown,
  metrics: ExtendedOpportunityMetrics,
  commercialContext?: Prisma.InputJsonObject,
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
      ...(commercialContext ? { commercialContext } : {}),
    } satisfies Prisma.InputJsonObject,
  };
}

type RuleEvaluation = {
  type: OpportunityType;
  eligible: boolean;
  ruleChecks: ScoringAuditCheck[];
  blockingReasons: string[];
  scoreBreakdown: OpportunityScoreBreakdown | null;
  keyMetrics: Record<string, number | null>;
  thresholds: Record<string, number | string>;
  candidate: OpportunityCandidate | null;
};

function check(
  label: string,
  passed: boolean,
  actual: number | string | boolean | null,
  threshold?: number | string | null,
): ScoringAuditCheck {
  return {
    label,
    passed,
    actual,
    ...(threshold !== undefined ? { threshold } : {}),
  };
}

function buildAuditEntry(evaluation: RuleEvaluation): OpportunityScoringAuditEntry {
  return {
    type: evaluation.type,
    eligible: evaluation.eligible,
    ruleChecks: evaluation.ruleChecks,
    blockingReasons: evaluation.blockingReasons,
    scoreBreakdown: evaluation.scoreBreakdown,
    keyMetrics: evaluation.keyMetrics,
    thresholds: evaluation.thresholds,
  };
}

function isOpportunityTypeEnabledForBusinessMode(
  type: OpportunityType,
  businessMode: OpportunityBusinessMode,
): boolean {
  if (businessMode === 'TRADING' && (type === 'RESTOCK' || type === 'DEAD_STOCK')) {
    return false;
  }

  return true;
}

function calculateStockCoverageDays(metrics: OpportunityMetrics): number | null {
  const stockQty = metrics.currentStockQty;
  const dailyVelocity = metrics.recentSalesVelocity30d;

  if (stockQty === null || dailyVelocity <= 0) {
    return null;
  }

  return round(stockQty / dailyVelocity, 1);
}

function evaluateBuyRule(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation {
  const salesUnits = metrics.recentSalesUnits30d;
  const stockQty = metrics.currentStockQty;
  const priceChange = metrics.supplierPriceChangePct;
  const inventoryAgeDays = metrics.daysSinceInventorySnapshot;
  const hasLatestSupplierPrice = metrics.latestSupplierBuyPrice !== null;
  const hasPriceChange = priceChange !== null;
  const priceImprovementThreshold = -config.buyPriceImprovementPct;
  const meetsPriceImprovement = hasPriceChange && priceChange <= priceImprovementThreshold;
  const priceDeltaVsMarketPct = metrics.priceDeltaVsMarketPct;
  const marketPriceConfidence = metrics.marketPriceConfidence;
  const supplierReliabilityScore = metrics.supplierReliabilityScore;
  const meetsMarketDiscount =
    priceDeltaVsMarketPct !== null && priceDeltaVsMarketPct <= -config.buyVsMarketDiscountPct;
  const marketConfidenceStrongEnough =
    !meetsMarketDiscount ||
    (marketPriceConfidence !== null &&
      marketPriceConfidence >= config.marketConfidenceMinForBuy);
  const supplierReliabilityNotWeak =
    !meetsMarketDiscount ||
    supplierReliabilityScore === null ||
    supplierReliabilityScore >= 0.35;
  const hasMeaningfulPricingEdge =
    meetsPriceImprovement ||
    (meetsMarketDiscount && marketConfidenceStrongEnough && supplierReliabilityNotWeak);
  const meetsDemand = salesUnits >= config.healthyDemandUnits30d;
  const inventoryNotAlreadyHigh =
    stockQty === null || stockQty < config.highStockThresholdUnits;
  const inventorySnapshotFreshEnough =
    inventoryAgeDays === null || inventoryAgeDays < config.maxInventorySnapshotAgeDays;

  const eligible =
    hasLatestSupplierPrice &&
    hasMeaningfulPricingEdge &&
    meetsDemand &&
    inventoryNotAlreadyHigh &&
    inventorySnapshotFreshEnough;

  const ruleChecks = [
    check('Latest supplier price available', hasLatestSupplierPrice, metrics.latestSupplierBuyPrice),
    check(
      'Supplier price improvement meets BUY threshold',
      hasMeaningfulPricingEdge,
      priceDeltaVsMarketPct ?? priceChange,
      'history_or_market_edge',
    ),
    check(
      'Recent sales demand meets BUY healthy-demand threshold',
      meetsDemand,
      salesUnits,
      config.healthyDemandUnits30d,
    ),
    check(
      'Current stock is below BUY stock-suppression threshold',
      inventoryNotAlreadyHigh,
      stockQty,
      config.highStockThresholdUnits,
    ),
    check(
      'Inventory snapshot is fresh enough for BUY',
      inventorySnapshotFreshEnough,
      inventoryAgeDays,
      config.maxInventorySnapshotAgeDays,
    ),
    check(
      'Market confidence is strong enough when simulated-market BUY path is used',
      marketConfidenceStrongEnough,
      marketPriceConfidence,
      config.marketConfidenceMinForBuy,
    ),
    check(
      'Supplier reliability is not weak when simulated-market BUY path is used',
      supplierReliabilityNotWeak,
      supplierReliabilityScore,
      0.35,
    ),
  ];

  const blockingReasons = ruleChecks
    .filter((ruleCheck) => !ruleCheck.passed)
    .map((ruleCheck) => ruleCheck.label);

  let scoreBreakdown: OpportunityScoreBreakdown | null = null;
  let candidate: OpportunityCandidate | null = null;

  if (eligible) {
    const builder = buildBreakdown(config.buyBaseScore);
    if (meetsPriceImprovement) {
      builder.add('Recent supplier price improved meaningfully', 12);
    }
    if (meetsMarketDiscount && priceDeltaVsMarketPct !== null) {
      builder.add(
        'Current supplier price is materially below simulated market',
        Math.min(14, Math.round(Math.abs(priceDeltaVsMarketPct) * 100)),
      );
    }
    if (
      marketPriceConfidence !== null &&
      marketPriceConfidence >= config.marketConfidenceMinForBuy
    ) {
      builder.add('Simulated market confidence supports the BUY signal', 6);
    }
    if (supplierReliabilityScore !== null && supplierReliabilityScore >= 0.65) {
      builder.add('Supplier reliability supports repeatable BUY execution', 4);
    }
    builder.add('Healthy recent sales demand', Math.min(10, Math.floor(salesUnits / 10)));
    scoreBreakdown = builder.finalize();
    const commercialContext = buildCommercialContext(metrics);
    candidate = createCandidate(
      context,
      'BUY',
      `Buy opportunity for ${context.product.name}`,
      joinSentences([
        'Supplier price is lower than the recent benchmark with healthy demand.',
        commercialContext.hasBestRecentKnownOffer
          ? 'This looks like the best recent known supplier offer for this product.'
          : null,
        commercialContext.simulatedMarketPrice !== null &&
        commercialContext.priceDeltaVsMarketPct !== null
          ? `Current supplier price sits about ${formatPct(Math.abs(commercialContext.priceDeltaVsMarketPct))} ${commercialContext.priceDeltaVsMarketPct < 0 ? 'below' : 'above'} the simulated market reference of ${formatPrice(commercialContext.simulatedMarketPrice)}.`
          : null,
        commercialContext.estimatedMarginPct !== null && commercialContext.averageSalePrice !== null
          ? `At the current average sale price of ${formatPrice(commercialContext.averageSalePrice)}, estimated margin is about ${formatPct(commercialContext.estimatedMarginPct)}.`
          : null,
      ]),
      scoreBreakdown,
      metrics,
      commercialContext,
    );
  }

  return {
    type: 'BUY',
    eligible,
    ruleChecks,
    blockingReasons,
    scoreBreakdown,
    keyMetrics: {
      latestSupplierBuyPrice: metrics.latestSupplierBuyPrice,
      supplierPriceChangePct: priceChange,
      priceDeltaVsMarketPct,
      marketPriceConfidence,
      supplierReliabilityScore,
      recentSalesUnits30d: salesUnits,
      currentStockQty: stockQty,
      daysSinceInventorySnapshot: inventoryAgeDays,
    },
    thresholds: {
      buyPriceImprovementPct: config.buyPriceImprovementPct,
      buyVsMarketDiscountPct: config.buyVsMarketDiscountPct,
      marketConfidenceMinForBuy: config.marketConfidenceMinForBuy,
      healthyDemandUnits30d: config.healthyDemandUnits30d,
      highStockThresholdUnits: config.highStockThresholdUnits,
      maxInventorySnapshotAgeDays: config.maxInventorySnapshotAgeDays,
      buyBaseScore: config.buyBaseScore,
    },
    candidate,
  };
}

function evaluatePriceAlertRule(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation {
  const priceChange = metrics.supplierPriceChangePct;
  const hasLatestSupplierPrice = metrics.latestSupplierBuyPrice !== null;
  const hasPriceChange = priceChange !== null;
  const meetsAlertThreshold =
    hasPriceChange && Math.abs(priceChange) >= config.priceAlertChangePct;
  const rollingAverageSupplierPrice = metrics.rollingAverageSupplierPrice;
  const priceDeltaVsMarketPct = metrics.priceDeltaVsMarketPct;
  const dropVsRollingAveragePct =
    metrics.latestSupplierBuyPrice !== null &&
    rollingAverageSupplierPrice !== null &&
    rollingAverageSupplierPrice > 0
      ? (metrics.latestSupplierBuyPrice - rollingAverageSupplierPrice) / rollingAverageSupplierPrice
      : null;
  const meetsHistoryDropThreshold =
    dropVsRollingAveragePct !== null &&
    dropVsRollingAveragePct <= -config.priceAlertDropVsHistoryPct;
  const meetsMarketDropThreshold =
    priceDeltaVsMarketPct !== null &&
    priceDeltaVsMarketPct <= -config.priceAlertDropVsHistoryPct;

  const eligible =
    hasLatestSupplierPrice &&
    (meetsAlertThreshold || meetsHistoryDropThreshold || meetsMarketDropThreshold);
  const ruleChecks = [
    check('Latest supplier price available', hasLatestSupplierPrice, metrics.latestSupplierBuyPrice),
    check(
      'Supplier price move meets alert threshold versus prior history and/or simulated market',
      meetsAlertThreshold || meetsHistoryDropThreshold || meetsMarketDropThreshold,
      priceDeltaVsMarketPct ?? dropVsRollingAveragePct ?? priceChange,
      'history_or_market_alert',
    ),
  ];
  const blockingReasons = ruleChecks
    .filter((ruleCheck) => !ruleCheck.passed)
    .map((ruleCheck) => ruleCheck.label);

  let scoreBreakdown: OpportunityScoreBreakdown | null = null;
  let candidate: OpportunityCandidate | null = null;

  if (eligible) {
    const directionalChanges = [priceChange, dropVsRollingAveragePct, priceDeltaVsMarketPct].filter(
      (value): value is number => value !== null,
    );
    const strongestDirectionalChange = directionalChanges.reduce((strongest, value) =>
      Math.abs(value) > Math.abs(strongest) ? value : strongest,
    );
    const strongestAbsoluteChange = Math.abs(strongestDirectionalChange);
    const builder = buildBreakdown(config.priceAlertBaseScore);
    builder.add(
      'Supplier price changed against prior reference',
      Math.min(18, Math.round(strongestAbsoluteChange * 100)),
    );
    if (meetsHistoryDropThreshold) {
      builder.add('Current supplier price dropped against rolling average', 8);
    }
    if (meetsMarketDropThreshold) {
      builder.add('Current supplier price dropped against simulated market', 8);
    }
    scoreBreakdown = builder.finalize();
    const direction = strongestDirectionalChange < 0 ? 'lower' : 'higher';
    const commercialContext = buildCommercialContext(metrics);
    candidate = createCandidate(
      context,
      'PRICE_ALERT',
      `Price alert for ${context.product.name}`,
      joinSentences([
        `Supplier price is meaningfully ${direction} than the recent benchmark.`,
        direction === 'lower' && commercialContext.hasBestRecentKnownOffer
          ? 'This is currently the best recent known supplier price on record.'
          : null,
        dropVsRollingAveragePct !== null && dropVsRollingAveragePct < 0
          ? `Current supplier price is about ${formatPct(Math.abs(dropVsRollingAveragePct))} below the rolling supplier average.`
          : null,
        priceDeltaVsMarketPct !== null && priceDeltaVsMarketPct < 0 && commercialContext.simulatedMarketPrice !== null
          ? `Current supplier price is about ${formatPct(Math.abs(priceDeltaVsMarketPct))} below the simulated market reference of ${formatPrice(commercialContext.simulatedMarketPrice)}.`
          : null,
        direction === 'higher' && commercialContext.estimatedMarginPct !== null
          ? `Review selling price cover because estimated margin is now about ${formatPct(commercialContext.estimatedMarginPct)}.`
          : null,
      ]),
      scoreBreakdown,
      metrics,
      commercialContext,
    );
  }

  return {
    type: 'PRICE_ALERT',
    eligible,
    ruleChecks,
    blockingReasons,
    scoreBreakdown,
    keyMetrics: {
      latestSupplierBuyPrice: metrics.latestSupplierBuyPrice,
      supplierPriceChangePct: priceChange,
      previousSupplierBuyPrice: metrics.previousSupplierBuyPrice,
      rollingAverageSupplierPrice,
      simulatedMarketPrice: metrics.simulatedMarketPrice,
      priceDeltaVsMarketPct,
    },
    thresholds: {
      priceAlertChangePct: config.priceAlertChangePct,
      priceAlertDropVsHistoryPct: config.priceAlertDropVsHistoryPct,
      priceAlertBaseScore: config.priceAlertBaseScore,
    },
    candidate,
  };
}

function evaluatePushRule(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation {
  const stockQty = metrics.currentStockQty ?? 0;
  const salesUnits = metrics.recentSalesUnits30d;
  const marginPct = metrics.estimatedMarginPct;
  const inventoryAgeDays = metrics.daysSinceInventorySnapshot;
  const priceDeltaVsMarketPct = metrics.priceDeltaVsMarketPct;
  const isTradingMode = config.businessMode === 'TRADING';
  const hasHealthyDemand = salesUnits >= config.healthyDemandUnits30d;
  const hasHighStock = stockQty >= config.highStockThresholdUnits;
  const marginNotWeak = marginPct === null || marginPct >= config.lowMarginThresholdPct;
  const strongMargin = marginPct !== null && marginPct >= config.pushMinMarginVsMarketPct;
  const buyPriceFavorableVsMarket = priceDeltaVsMarketPct !== null && priceDeltaVsMarketPct <= 0;
  const inventorySnapshotFreshEnough =
    inventoryAgeDays === null || inventoryAgeDays < config.maxInventorySnapshotAgeDays;
  const eligible = isTradingMode
    ? hasHealthyDemand && marginNotWeak
    : hasHighStock && hasHealthyDemand && marginNotWeak && inventorySnapshotFreshEnough;
  const ruleChecks = [
    check(
      'Recent sales demand meets PUSH healthy-demand threshold',
      hasHealthyDemand,
      salesUnits,
      config.healthyDemandUnits30d,
    ),
    check(
      'Estimated margin is not weak for PUSH',
      marginNotWeak,
      marginPct,
      config.lowMarginThresholdPct,
    ),
  ];

  if (!isTradingMode) {
    ruleChecks.push(
      check(
        'Current stock meets PUSH high-stock threshold',
        hasHighStock,
        stockQty,
        config.highStockThresholdUnits,
      ),
      check(
        'Inventory snapshot is fresh enough for PUSH',
        inventorySnapshotFreshEnough,
        inventoryAgeDays,
        config.maxInventorySnapshotAgeDays,
      ),
    );
  }
  const blockingReasons = ruleChecks
    .filter((ruleCheck) => !ruleCheck.passed)
    .map((ruleCheck) => ruleCheck.label);

  let scoreBreakdown: OpportunityScoreBreakdown | null = null;
  let candidate: OpportunityCandidate | null = null;

  if (eligible) {
    const builder = buildBreakdown(config.pushBaseScore);
    if (isTradingMode) {
      builder.add('Healthy recent demand for trading-led promotion', Math.min(12, Math.floor(salesUnits / 10)));
      builder.add(strongMargin ? 'Margin remains commercially strong' : 'Margin remains commercially acceptable', strongMargin ? 10 : 8);
    } else {
      builder.add('Healthy stock available', 10);
      builder.add('Healthy recent sales velocity', Math.min(12, Math.floor(salesUnits / 10)));
      if (marginPct !== null) {
        builder.add(
          strongMargin ? 'Margin remains commercially strong' : 'Margin remains commercially acceptable',
          strongMargin ? 8 : 6,
        );
      }
    }
    if (buyPriceFavorableVsMarket) {
      builder.add('Current buy price remains favorable versus simulated market', 6);
    }
    if (metrics.supplierReliabilityScore !== null && metrics.supplierReliabilityScore >= 0.65) {
      builder.add('Reliable supplier pricing improves push confidence', 3);
    }
    scoreBreakdown = builder.finalize();
    const commercialContext = buildCommercialContext(metrics);
    candidate = createCandidate(
      context,
      'PUSH',
      `Push ${context.product.name}`,
      isTradingMode
        ? joinSentences([
            'Healthy recent demand and acceptable margin suggest the product can be promoted more actively.',
            commercialContext.estimatedMarginPct !== null
              ? `Estimated margin is about ${formatPct(commercialContext.estimatedMarginPct)} at the current average sale price.`
              : null,
            commercialContext.priceDeltaVsMarketPct !== null && commercialContext.priceDeltaVsMarketPct <= 0
              ? 'Current supplier pricing also remains favorable against the simulated market reference.'
              : null,
          ])
        : joinSentences([
            'High stock with healthy recent sales velocity suggests the product can be sold more aggressively.',
            commercialContext.estimatedMarginPct !== null
              ? `Estimated margin remains about ${formatPct(commercialContext.estimatedMarginPct)}.`
              : null,
            commercialContext.priceDeltaVsMarketPct !== null && commercialContext.priceDeltaVsMarketPct <= 0
              ? 'Current buy price is also favorable versus the simulated market reference.'
              : null,
          ]),
      scoreBreakdown,
      metrics,
      commercialContext,
    );
  }

  return {
    type: 'PUSH',
    eligible,
    ruleChecks,
    blockingReasons,
    scoreBreakdown,
    keyMetrics: {
      currentStockQty: metrics.currentStockQty,
      recentSalesUnits30d: salesUnits,
      recentSalesVelocity30d: metrics.recentSalesVelocity30d,
      estimatedMarginPct: marginPct,
      priceDeltaVsMarketPct,
      simulatedMarketPrice: metrics.simulatedMarketPrice,
      daysSinceInventorySnapshot: inventoryAgeDays,
    },
    thresholds: {
      businessMode: config.businessMode,
      highStockThresholdUnits: config.highStockThresholdUnits,
      healthyDemandUnits30d: config.healthyDemandUnits30d,
      lowMarginThresholdPct: config.lowMarginThresholdPct,
      pushMinMarginVsMarketPct: config.pushMinMarginVsMarketPct,
      maxInventorySnapshotAgeDays: config.maxInventorySnapshotAgeDays,
      pushBaseScore: config.pushBaseScore,
    },
    candidate,
  };
}

function evaluateDeadStockRule(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation {
  const stockQty = metrics.currentStockQty ?? 0;
  const salesUnits = metrics.recentSalesUnits30d;
  const lastSaleDaysAgo = metrics.lastSaleDaysAgo;
  const inventoryAgeDays = metrics.daysSinceInventorySnapshot;
  const hasPositiveStock = stockQty > 0;
  const hasHighStock = stockQty >= config.highStockThresholdUnits;
  const hasWeakDemand = salesUnits < config.weakDemandMaxUnits30d;
  const hasNoRecentSales =
    salesUnits === 0 &&
    (lastSaleDaysAgo === null || lastSaleDaysAgo >= config.deadStockNoSalesWindowDays);
  const enabledForBusinessMode = isOpportunityTypeEnabledForBusinessMode(
    'DEAD_STOCK',
    config.businessMode,
  );
  const inventorySnapshotFreshEnough =
    inventoryAgeDays === null || inventoryAgeDays < config.maxInventorySnapshotAgeDays;
  const eligible =
    enabledForBusinessMode &&
    hasPositiveStock &&
    hasHighStock &&
    hasWeakDemand &&
    hasNoRecentSales &&
    inventorySnapshotFreshEnough;

  const ruleChecks = [
    check(
      'Opportunity type is enabled for current business mode',
      enabledForBusinessMode,
      config.businessMode,
      'STOCKHOLDING',
    ),
    check('Current stock is above zero', hasPositiveStock, stockQty, 0),
    check(
      'Current stock meets DEAD_STOCK high-stock threshold',
      hasHighStock,
      stockQty,
      config.highStockThresholdUnits,
    ),
    check(
      'Recent sales remain weak enough for DEAD_STOCK',
      hasWeakDemand,
      salesUnits,
      config.weakDemandMaxUnits30d,
    ),
    check(
      'Recent sales are absent long enough for DEAD_STOCK',
      hasNoRecentSales,
      lastSaleDaysAgo ?? salesUnits,
      config.deadStockNoSalesWindowDays,
    ),
    check(
      'Inventory snapshot is fresh enough for DEAD_STOCK',
      inventorySnapshotFreshEnough,
      inventoryAgeDays,
      config.maxInventorySnapshotAgeDays,
    ),
  ];
  const blockingReasons = ruleChecks
    .filter((ruleCheck) => !ruleCheck.passed)
    .map((ruleCheck) => ruleCheck.label);

  let scoreBreakdown: OpportunityScoreBreakdown | null = null;
  let candidate: OpportunityCandidate | null = null;

  if (eligible) {
    const builder = buildBreakdown(config.deadStockBaseScore);
    builder.add('High available stock', 12);
    builder.add('Weak or absent recent sales', 14);
    scoreBreakdown = builder.finalize();
    candidate = createCandidate(
      context,
      'DEAD_STOCK',
      `Dead stock risk for ${context.product.name}`,
      'High stock with no recent sales; potential dead stock risk.',
      scoreBreakdown,
      metrics,
    );
  }

  return {
    type: 'DEAD_STOCK',
    eligible,
    ruleChecks,
    blockingReasons,
    scoreBreakdown,
    keyMetrics: {
      currentStockQty: metrics.currentStockQty,
      recentSalesUnits30d: salesUnits,
      lastSaleDaysAgo,
      daysSinceInventorySnapshot: inventoryAgeDays,
    },
    thresholds: {
      businessMode: config.businessMode,
      highStockThresholdUnits: config.highStockThresholdUnits,
      weakDemandMaxUnits30d: config.weakDemandMaxUnits30d,
      deadStockNoSalesWindowDays: config.deadStockNoSalesWindowDays,
      maxInventorySnapshotAgeDays: config.maxInventorySnapshotAgeDays,
      deadStockBaseScore: config.deadStockBaseScore,
    },
    candidate,
  };
}

function evaluateLowMarginRule(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation {
  const marginPct = metrics.estimatedMarginPct;
  const salesUnits = metrics.recentSalesUnits30d;
  const hasMargin = marginPct !== null;
  const belowMarginThreshold = hasMargin && marginPct < config.lowMarginThresholdPct;
  const hasSales = salesUnits > 0;
  const eligible = hasMargin && belowMarginThreshold && hasSales;
  const ruleChecks = [
    check('Estimated margin available', hasMargin, marginPct),
    check(
      'Estimated margin is below LOW_MARGIN threshold',
      belowMarginThreshold,
      marginPct,
      config.lowMarginThresholdPct,
    ),
    check('Recent sales exist', hasSales, salesUnits, 0),
  ];
  const blockingReasons = ruleChecks
    .filter((ruleCheck) => !ruleCheck.passed)
    .map((ruleCheck) => ruleCheck.label);

  let scoreBreakdown: OpportunityScoreBreakdown | null = null;
  let candidate: OpportunityCandidate | null = null;

  if (eligible) {
    const builder = buildBreakdown(config.lowMarginBaseScore);
    builder.add('Estimated margin below threshold', 12);
    scoreBreakdown = builder.finalize();
    const commercialContext = buildCommercialContext(metrics);
    candidate = createCandidate(
      context,
      'LOW_MARGIN',
      `Low margin watch for ${context.product.name}`,
      joinSentences([
        'Estimated margin is below the configured threshold.',
        commercialContext.averageSalePrice !== null && commercialContext.latestSupplierBuyPrice !== null
          ? `Average sale price is ${formatPrice(commercialContext.averageSalePrice)} against a supplier buy price of ${formatPrice(commercialContext.latestSupplierBuyPrice)}, leaving only about ${formatPct(commercialContext.estimatedMarginPct)} margin.`
          : null,
      ]),
      scoreBreakdown,
      metrics,
      commercialContext,
    );
  }

  return {
    type: 'LOW_MARGIN',
    eligible,
    ruleChecks,
    blockingReasons,
    scoreBreakdown,
    keyMetrics: {
      estimatedMarginPct: marginPct,
      averageSalePrice: metrics.averageSalePrice,
      latestSupplierBuyPrice: metrics.latestSupplierBuyPrice,
      recentSalesUnits30d: salesUnits,
    },
    thresholds: {
      lowMarginThresholdPct: config.lowMarginThresholdPct,
      lowMarginBaseScore: config.lowMarginBaseScore,
    },
    candidate,
  };
}

function evaluateRestockRule(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation {
  const stockQty = metrics.currentStockQty ?? 0;
  const salesUnits = metrics.recentSalesUnits30d;
  const inventoryAgeDays = metrics.daysSinceInventorySnapshot;
  const stockCoverageDays = calculateStockCoverageDays(metrics);
  const lowStock = stockQty <= config.lowStockThresholdUnits;
  const hasDemand = salesUnits >= config.healthyDemandUnits30d;
  const lowStockRelativeToDemand =
    stockCoverageDays !== null && stockCoverageDays <= config.restockMaxCoverageDays;
  const inventorySnapshotFreshEnough =
    inventoryAgeDays === null || inventoryAgeDays < config.maxInventorySnapshotAgeDays;
  const enabledForBusinessMode = isOpportunityTypeEnabledForBusinessMode(
    'RESTOCK',
    config.businessMode,
  );
  const eligible =
    enabledForBusinessMode &&
    lowStock &&
    hasDemand &&
    lowStockRelativeToDemand &&
    inventorySnapshotFreshEnough;
  const ruleChecks = [
    check(
      'Opportunity type is enabled for current business mode',
      enabledForBusinessMode,
      config.businessMode,
      'STOCKHOLDING',
    ),
    check('Current stock is at or below RESTOCK threshold', lowStock, stockQty, config.lowStockThresholdUnits),
    check(
      'Recent sales demand meets RESTOCK healthy-demand threshold',
      hasDemand,
      salesUnits,
      config.healthyDemandUnits30d,
    ),
    check(
      'Current stock coverage is low enough for RESTOCK',
      lowStockRelativeToDemand,
      stockCoverageDays,
      config.restockMaxCoverageDays,
    ),
    check(
      'Inventory snapshot is fresh enough for RESTOCK',
      inventorySnapshotFreshEnough,
      inventoryAgeDays,
      config.maxInventorySnapshotAgeDays,
    ),
  ];
  const blockingReasons = ruleChecks
    .filter((ruleCheck) => !ruleCheck.passed)
    .map((ruleCheck) => ruleCheck.label);

  let scoreBreakdown: OpportunityScoreBreakdown | null = null;
  let candidate: OpportunityCandidate | null = null;

  if (eligible) {
    const builder = buildBreakdown(config.restockBaseScore);
    builder.add('Low stock position', 12);
    builder.add('Healthy recent sales velocity', Math.min(12, Math.floor(salesUnits / 10)));
    scoreBreakdown = builder.finalize();
    candidate = createCandidate(
      context,
      'RESTOCK',
      `Restock ${context.product.name}`,
      'Low stock with positive recent sales velocity over last 30 days.',
      scoreBreakdown,
      metrics,
    );
  }

  return {
    type: 'RESTOCK',
    eligible,
    ruleChecks,
    blockingReasons,
    scoreBreakdown,
    keyMetrics: {
      currentStockQty: metrics.currentStockQty,
      recentSalesUnits30d: salesUnits,
      recentSalesVelocity30d: metrics.recentSalesVelocity30d,
      stockCoverageDays,
      daysSinceInventorySnapshot: inventoryAgeDays,
    },
    thresholds: {
      businessMode: config.businessMode,
      lowStockThresholdUnits: config.lowStockThresholdUnits,
      healthyDemandUnits30d: config.healthyDemandUnits30d,
      restockMaxCoverageDays: config.restockMaxCoverageDays,
      maxInventorySnapshotAgeDays: config.maxInventorySnapshotAgeDays,
      restockBaseScore: config.restockBaseScore,
    },
    candidate,
  };
}

function evaluateOpportunityRules(
  context: ScoringContext,
  metrics: ExtendedOpportunityMetrics,
  config: OpportunityConfig,
): RuleEvaluation[] {
  return [
    evaluateBuyRule(context, metrics, config),
    evaluatePriceAlertRule(context, metrics, config),
    evaluatePushRule(context, metrics, config),
    evaluateDeadStockRule(context, metrics, config),
    evaluateLowMarginRule(context, metrics, config),
    evaluateRestockRule(context, metrics, config),
  ];
}

export function scoreOpportunityCandidates(
  context: ScoringContext,
  config: OpportunityConfig = opportunityConfig,
): OpportunityCandidate[] {
  const metrics = buildMetrics(context, config);

  return evaluateOpportunityRules(context, metrics, config)
    .flatMap((evaluation) => (evaluation.eligible && evaluation.candidate ? [evaluation.candidate] : []));
}

export function auditOpportunityScoring(
  context: ScoringContext,
  config: OpportunityConfig = opportunityConfig,
): OpportunityScoringAudit {
  const metrics = buildMetrics(context, config);
  const evaluations = evaluateOpportunityRules(context, metrics, config);

  return {
    productId: context.product.id,
    productName: context.product.name,
    generatedOpportunityTypes: evaluations
      .flatMap((evaluation) => (evaluation.eligible && evaluation.candidate ? [evaluation.type] : [])),
    metrics,
    opportunities: evaluations.map(buildAuditEntry),
  };
}
