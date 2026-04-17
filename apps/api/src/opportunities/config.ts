export const opportunityConfig = {
  recentSalesWindowDays: 30,
  duplicateWindowDays: 7,
  buyPriceImprovementPct: 0.05,
  priceAlertChangePct: 0.08,
  lowMarginThresholdPct: 0.15,
  lowStockThresholdUnits: 80,
  highStockThresholdUnits: 250,
  positiveSalesVelocityUnits: 20,
  healthySalesVelocityUnits: 40,
  staleInventoryDays: 45,
  deadStockNoSalesDays: 30,
  restockBaseScore: 70,
  buyBaseScore: 72,
  pushBaseScore: 68,
  deadStockBaseScore: 78,
  priceAlertBaseScore: 64,
  lowMarginBaseScore: 66,
} as const;

export type OpportunityConfig = typeof opportunityConfig;
