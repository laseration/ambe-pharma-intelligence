import { db } from '../lib/db';
import {
  calculateBuyExecutionReconciliation,
  type BuyDecisionExecutionSnapshot,
  type BuyExecutionRecord,
} from '../buyExecutions/service';

export type SupplierScorecardTier = 'STRONG' | 'WATCH' | 'RISKY';

type SupplierQualificationStatus =
  | 'UNKNOWN'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'RESTRICTED'
  | 'BLOCKED';

type SupplierWithPerformanceData = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  qualification: {
    qualificationStatus: SupplierQualificationStatus;
    trustTier: 'HIGH' | 'MEDIUM' | 'LOW';
    qualificationNote: string | null;
    lastReviewedAt: Date | null;
    requiresManualApproval: boolean;
    canAutoApproveBuyDecisions: boolean;
  } | null;
  buyDecisions: Array<
    BuyDecisionExecutionSnapshot & {
      hasQualificationRisk: boolean;
      execution: BuyExecutionRecord | null;
      updatedAt?: Date;
    }
  >;
  updatedAt: Date;
};

export type SupplierScorecardRecord = {
  supplierId: string;
  supplierName: string;
  supplierNormalizedName: string;
  isActive: boolean;
  qualificationStatus: SupplierQualificationStatus;
  trustTier: 'HIGH' | 'MEDIUM' | 'LOW';
  qualificationRiskCount: number;
  totalApprovedBuyDecisions: number;
  totalOrderedExecutions: number;
  totalReceivedExecutions: number;
  totalCancelledExecutions: number;
  fulfillmentRate: number | null;
  averageQuoteToOrderPriceDriftPct: number | null;
  averageQuoteToInvoicePriceDriftPct: number | null;
  priceDriftIncidentCount: number;
  quantityDriftIncidentCount: number;
  lastActivityAt: Date | null;
  score: number;
  tier: SupplierScorecardTier;
  scoreBreakdown: {
    qualificationComponent: number;
    fulfillmentComponent: number;
    volumeComponent: number;
    cancellationPenalty: number;
    driftPenalty: number;
    reviewBurdenPenalty: number;
  };
  summary: {
    recommendedAction: 'monitor' | 'investigate drift' | 'restrict supplier';
    hasQualificationRisk: boolean;
    hasRecentDrift: boolean;
  };
};

export type SupplierScorecardFilters = {
  supplierId?: string | null;
  supplierIds?: string[];
  qualificationStatus?: SupplierQualificationStatus | null;
  tier?: SupplierScorecardTier | null;
  take?: number;
};

export type SupplierScorecardRepository = {
  listSuppliers: (
    filters: SupplierScorecardFilters,
  ) => Promise<SupplierWithPerformanceData[]>;
  findSupplierById: (
    supplierId: string,
  ) => Promise<SupplierWithPerformanceData | null>;
};

function round(value: number | null, precision = 4): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
    6,
  );
}

function maxDate(dates: Array<Date | null | undefined>): Date | null {
  const timestamps = dates
    .map((value) => value?.getTime() ?? null)
    .filter((value): value is number => value !== null);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

function defaultQualification(
  input: SupplierWithPerformanceData['qualification'],
) {
  return {
    qualificationStatus: input?.qualificationStatus ?? 'UNKNOWN',
    trustTier: input?.trustTier ?? 'LOW',
    qualificationNote: input?.qualificationNote ?? null,
    lastReviewedAt: input?.lastReviewedAt ?? null,
    requiresManualApproval: input?.requiresManualApproval ?? true,
    canAutoApproveBuyDecisions: input?.canAutoApproveBuyDecisions ?? false,
  };
}

function buildTier(score: number): SupplierScorecardTier {
  if (score >= 75) {
    return 'STRONG';
  }

  if (score >= 50) {
    return 'WATCH';
  }

  return 'RISKY';
}

function buildScorecard(
  supplier: SupplierWithPerformanceData,
): SupplierScorecardRecord {
  const qualification = defaultQualification(supplier.qualification);
  const approvedBuyDecisions = supplier.buyDecisions.filter((decision) =>
    Boolean(decision.approvedAt),
  );
  const executions = approvedBuyDecisions.flatMap((decision) =>
    decision.execution ? [{ decision, execution: decision.execution }] : [],
  );
  const orderedExecutions = executions.filter(
    ({ execution }) => execution.fulfillmentStatus !== 'NOT_STARTED',
  );
  const receivedExecutions = executions.filter(({ execution }) =>
    ['PARTIALLY_RECEIVED', 'RECEIVED'].includes(execution.fulfillmentStatus),
  );
  const cancelledExecutions = executions.filter(
    ({ execution }) => execution.fulfillmentStatus === 'CANCELLED',
  );
  const reconciliationMetrics = executions.map(({ decision, execution }) =>
    calculateBuyExecutionReconciliation(decision, execution),
  );
  const orderDriftPcts = reconciliationMetrics.flatMap((metric) =>
    metric.quoteToOrderPriceDriftPct === null
      ? []
      : [Math.abs(metric.quoteToOrderPriceDriftPct)],
  );
  const invoiceDriftPcts = reconciliationMetrics.flatMap((metric) =>
    metric.quoteToInvoicePriceDriftPct === null
      ? []
      : [Math.abs(metric.quoteToInvoicePriceDriftPct)],
  );
  const priceDriftIncidentCount = reconciliationMetrics.filter(
    (metric) => metric.hasPriceDrift,
  ).length;
  const quantityDriftIncidentCount = reconciliationMetrics.filter(
    (metric) => metric.hasQuantityDrift,
  ).length;
  const qualificationRiskCount = approvedBuyDecisions.filter(
    (decision) => decision.hasQualificationRisk,
  ).length;
  const fulfillmentRate =
    orderedExecutions.length > 0
      ? round(receivedExecutions.length / orderedExecutions.length, 4)
      : null;
  const cancellationRate =
    orderedExecutions.length > 0
      ? cancelledExecutions.length / orderedExecutions.length
      : 0;
  const averageOrderDrift = average(orderDriftPcts);
  const averageInvoiceDrift = average(invoiceDriftPcts);
  const qualificationComponent =
    qualification.qualificationStatus === 'APPROVED'
      ? 25
      : qualification.qualificationStatus === 'PENDING_REVIEW'
        ? 5
        : qualification.qualificationStatus === 'UNKNOWN'
          ? 0
          : qualification.qualificationStatus === 'RESTRICTED'
            ? -15
            : -35;
  const fulfillmentComponent =
    fulfillmentRate === null ? 0 : Math.round(fulfillmentRate * 30);
  const volumeComponent = Math.min(10, receivedExecutions.length * 2);
  const cancellationPenalty = -Math.round(cancellationRate * 15);
  const driftPenalty = -Math.min(
    20,
    Math.round((averageInvoiceDrift ?? averageOrderDrift ?? 0) * 100) +
      priceDriftIncidentCount * 2 +
      quantityDriftIncidentCount * 2,
  );
  const reviewBurdenPenalty = -Math.min(10, qualificationRiskCount * 2);
  const score = clampScore(
    50 +
      qualificationComponent +
      fulfillmentComponent +
      volumeComponent +
      cancellationPenalty +
      driftPenalty +
      reviewBurdenPenalty,
  );
  const tier = buildTier(score);
  const hasRecentDrift =
    priceDriftIncidentCount > 0 || quantityDriftIncidentCount > 0;
  const recommendedAction: SupplierScorecardRecord['summary']['recommendedAction'] =
    qualification.qualificationStatus === 'BLOCKED' ||
    qualification.qualificationStatus === 'RESTRICTED' ||
    tier === 'RISKY'
      ? 'restrict supplier'
      : hasRecentDrift
        ? 'investigate drift'
        : 'monitor';

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierNormalizedName: supplier.normalizedName,
    isActive: supplier.isActive,
    qualificationStatus: qualification.qualificationStatus,
    trustTier: qualification.trustTier,
    qualificationRiskCount,
    totalApprovedBuyDecisions: approvedBuyDecisions.length,
    totalOrderedExecutions: orderedExecutions.length,
    totalReceivedExecutions: receivedExecutions.length,
    totalCancelledExecutions: cancelledExecutions.length,
    fulfillmentRate,
    averageQuoteToOrderPriceDriftPct: averageOrderDrift,
    averageQuoteToInvoicePriceDriftPct: averageInvoiceDrift,
    priceDriftIncidentCount,
    quantityDriftIncidentCount,
    lastActivityAt: maxDate([
      supplier.updatedAt,
      qualification.lastReviewedAt,
      ...approvedBuyDecisions.flatMap((decision) => [
        decision.approvedAt,
        decision.orderedAt,
        decision.updatedAt,
        decision.execution?.updatedAt,
      ]),
    ]),
    score,
    tier,
    scoreBreakdown: {
      qualificationComponent,
      fulfillmentComponent,
      volumeComponent,
      cancellationPenalty,
      driftPenalty,
      reviewBurdenPenalty,
    },
    summary: {
      recommendedAction,
      hasQualificationRisk:
        qualification.qualificationStatus !== 'APPROVED' ||
        qualificationRiskCount > 0,
      hasRecentDrift,
    },
  };
}

export function createSupplierScorecardRepository(
  client: typeof db = db,
): SupplierScorecardRepository {
  return {
    listSuppliers: async (filters) =>
      client.supplier.findMany({
        where: {
          id: filters.supplierId
            ? filters.supplierId
            : filters.supplierIds?.length
              ? { in: filters.supplierIds }
              : undefined,
          qualification: filters.qualificationStatus
            ? {
                qualificationStatus: filters.qualificationStatus,
              }
            : undefined,
        },
        include: {
          qualification: true,
          buyDecisions: {
            include: {
              execution: true,
            },
            orderBy: {
              approvedAt: 'desc',
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: filters.take ?? 100,
      }) as Promise<SupplierWithPerformanceData[]>,
    findSupplierById: async (supplierId) =>
      client.supplier.findUnique({
        where: { id: supplierId },
        include: {
          qualification: true,
          buyDecisions: {
            include: {
              execution: true,
            },
            orderBy: {
              approvedAt: 'desc',
            },
          },
        },
      }) as Promise<SupplierWithPerformanceData | null>,
  };
}

export function createSupplierScorecardService(
  overrides?: Partial<SupplierScorecardRepository>,
) {
  const repository: SupplierScorecardRepository = {
    ...createSupplierScorecardRepository(),
    ...overrides,
  };

  return {
    async listScorecards(
      filters: SupplierScorecardFilters = {},
    ): Promise<SupplierScorecardRecord[]> {
      const items = await repository.listSuppliers(filters);
      const scorecards = items.map(buildScorecard);

      return filters.tier
        ? scorecards.filter((scorecard) => scorecard.tier === filters.tier)
        : scorecards;
    },

    async getScorecardForSupplier(
      supplierId: string,
    ): Promise<SupplierScorecardRecord | null> {
      const supplier = await repository.findSupplierById(supplierId);
      return supplier ? buildScorecard(supplier) : null;
    },

    async getScorecardsForSupplierIds(
      supplierIds: string[],
    ): Promise<Record<string, SupplierScorecardRecord>> {
      const uniqueSupplierIds = Array.from(
        new Set(supplierIds.filter(Boolean)),
      );
      if (uniqueSupplierIds.length === 0) {
        return {};
      }

      const suppliers = await repository.listSuppliers({
        supplierIds: uniqueSupplierIds,
        take: uniqueSupplierIds.length,
      });

      return Object.fromEntries(
        suppliers.map((supplier) => [supplier.id, buildScorecard(supplier)]),
      );
    },
  };
}

export const supplierScorecardService = createSupplierScorecardService();
