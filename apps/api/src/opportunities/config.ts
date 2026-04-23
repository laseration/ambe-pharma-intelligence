import { env } from '../config/env';

export type OpportunityBusinessMode = 'STOCKHOLDING' | 'TRADING';

export type OpportunityConfig = {
  businessMode: OpportunityBusinessMode;
  recentSalesWindowDays: number;
  duplicateWindowDays: number;
  buyPriceImprovementPct: number;
  priceAlertChangePct: number;
  marketLookbackDays: number;
  marketRecentWeightDays: number;
  marketMinSampleCount: number;
  buyVsMarketDiscountPct: number;
  pushMinMarginVsMarketPct: number;
  priceAlertDropVsHistoryPct: number;
  supplierReliabilityAdjustmentStep: number;
  marketConfidenceMinForBuy: number;
  lowMarginThresholdPct: number;
  lowStockThresholdUnits: number;
  highStockThresholdUnits: number;
  healthyDemandUnits30d: number;
  weakDemandMaxUnits30d: number;
  maxInventorySnapshotAgeDays: number;
  deadStockNoSalesWindowDays: number;
  restockMaxCoverageDays: number;
  restockBaseScore: number;
  buyBaseScore: number;
  pushBaseScore: number;
  deadStockBaseScore: number;
  priceAlertBaseScore: number;
  lowMarginBaseScore: number;
};

const sharedOpportunityThresholds = {
  recentSalesWindowDays: 30,
  duplicateWindowDays: 7,
  buyPriceImprovementPct: 0.05,
  priceAlertChangePct: 0.08,
  marketLookbackDays: 45,
  marketRecentWeightDays: 14,
  marketMinSampleCount: 3,
  buyVsMarketDiscountPct: 0.06,
  pushMinMarginVsMarketPct: 0.18,
  priceAlertDropVsHistoryPct: 0.08,
  supplierReliabilityAdjustmentStep: 0.02,
  marketConfidenceMinForBuy: 0.45,
  lowStockThresholdUnits: 80,
  highStockThresholdUnits: 250,
  weakDemandMaxUnits30d: 20,
  maxInventorySnapshotAgeDays: 45,
  deadStockNoSalesWindowDays: 30,
  restockMaxCoverageDays: 21,
  restockBaseScore: 70,
  buyBaseScore: 72,
  pushBaseScore: 68,
  deadStockBaseScore: 78,
  priceAlertBaseScore: 64,
  lowMarginBaseScore: 66,
} as const;

const modeSpecificOpportunityThresholds: Record<
  OpportunityBusinessMode,
  Pick<OpportunityConfig, 'healthyDemandUnits30d' | 'lowMarginThresholdPct'>
> = {
  STOCKHOLDING: {
    healthyDemandUnits30d: 40,
    lowMarginThresholdPct: 0.15,
  },
  TRADING: {
    healthyDemandUnits30d: 30,
    lowMarginThresholdPct: 0.17,
  },
};

export function buildOpportunityConfig(businessMode: OpportunityBusinessMode): OpportunityConfig {
  return {
    businessMode,
    ...sharedOpportunityThresholds,
    ...modeSpecificOpportunityThresholds[businessMode],
  };
}

export const opportunityConfig: OpportunityConfig = buildOpportunityConfig(
  env.opportunityBusinessMode as OpportunityBusinessMode,
);
