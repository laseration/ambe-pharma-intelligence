import type {
  OpportunityStatus,
  OpportunityType,
  Prisma,
} from '@prisma/client';

export type OpportunityMetrics = {
  currentStockQty: number | null;
  daysSinceInventorySnapshot: number | null;
  recentSalesUnits30d: number;
  recentSalesVelocity30d: number;
  lastSaleDaysAgo: number | null;
  latestSupplierBuyPrice: number | null;
  previousSupplierBuyPrice: number | null;
  supplierPriceChangePct: number | null;
  averageSalePrice: number | null;
  estimatedMarginPct: number | null;
};

export type OpportunityScoreBreakdown = {
  baseScore: number;
  adjustments: Array<{
    label: string;
    value: number;
  }>;
  finalScore: number;
};

export type OpportunityCandidate = {
  type: OpportunityType;
  status: OpportunityStatus;
  title: string;
  description: string;
  score: number;
  productId: string | null;
  supplierId: string | null;
  metadata: Prisma.InputJsonValue;
  dedupeKey: string;
};

export type ScoringAuditCheck = {
  label: string;
  passed: boolean;
  actual: number | string | boolean | null;
  threshold?: number | string | null;
};

export type OpportunityScoringAuditEntry = {
  type: OpportunityType;
  eligible: boolean;
  ruleChecks: ScoringAuditCheck[];
  blockingReasons: string[];
  scoreBreakdown: OpportunityScoreBreakdown | null;
  keyMetrics: Record<string, number | null>;
  thresholds: Record<string, number | string>;
};

export type OpportunityScoringAudit = {
  productId: string;
  productName: string;
  generatedOpportunityTypes: OpportunityType[];
  metrics: OpportunityMetrics;
  opportunities: OpportunityScoringAuditEntry[];
};

export type ScoringContext = {
  now: Date;
  product: {
    id: string;
    name: string;
  };
  latestInventory: {
    supplierId: string | null;
    snapshotDate: Date;
    quantityAvailable: number;
    quantityOnHand: number;
  } | null;
  latestSupplierPrice: {
    supplierId: string;
    unitPrice: number;
    createdAt: Date;
  } | null;
  previousSupplierPrice: {
    supplierId: string;
    unitPrice: number;
    createdAt: Date;
  } | null;
  recentSales: {
    units30d: number;
    averageSalePrice: number | null;
    lastSaleDate: Date | null;
  };
};
