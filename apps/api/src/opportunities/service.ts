import type { Opportunity, OpportunityStatus, OpportunityType, Prisma } from '@prisma/client';

import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { opportunityConfig } from './config';
import { auditOpportunityScoring, scoreOpportunityCandidates } from './scoring';
import type { OpportunityCandidate, OpportunityScoringAudit, ScoringContext } from './types';

const opportunityListInclude = {
  product: {
    select: {
      id: true,
      name: true,
      normalizedName: true,
    },
  },
  supplier: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.OpportunityInclude;

type OpportunityTriageActor = {
  actorType: string;
  actorIdentifier: string | null;
};

type OpportunityTriageInput = OpportunityTriageActor & {
  opportunityId: string;
  status: Extract<OpportunityStatus, 'REVIEWED' | 'ACTIONED' | 'DISMISSED'>;
  note?: string | null;
};

type OpportunityWithListRelations = Prisma.OpportunityGetPayload<{
  include: typeof opportunityListInclude;
}>;

function startOfWindow(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

async function buildScoringContexts(now: Date, productId?: string): Promise<ScoringContext[]> {
  const windowStart = startOfWindow(now, opportunityConfig.recentSalesWindowDays);

  const [products, inventorySnapshots, supplierPriceItems, salesRecords] = await Promise.all([
    db.product.findMany({
      where: productId ? { id: productId } : undefined,
      select: {
        id: true,
        name: true,
      },
    }),
    db.inventorySnapshot.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { snapshotDate: 'desc' },
      select: {
        productId: true,
        supplierId: true,
        snapshotDate: true,
        quantityAvailable: true,
        quantityOnHand: true,
      },
    }),
    db.supplierPriceItem.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: {
        productId: true,
        supplierId: true,
        unitPrice: true,
        currencyCode: true,
        createdAt: true,
        marketPriceEstimate: true,
        marketPriceConfidence: true,
        priceDeltaFromMarketPct: true,
        supplier: {
          select: {
            reliabilityScore: true,
          },
        },
      },
      where: {
        ...(productId
          ? {
              AND: [
                {
                  productId: {
                    not: null,
                  },
                },
                { productId },
              ],
            }
          : {
              productId: {
                not: null,
              },
            }),
      },
    }),
    db.salesRecord.findMany({
      where: {
        ...(productId ? { productId } : {}),
        saleDate: {
          gte: windowStart,
        },
      },
      orderBy: { saleDate: 'desc' },
      select: {
        productId: true,
        saleDate: true,
        quantity: true,
        unitPrice: true,
      },
    }),
  ]);

  const latestInventoryByProduct = new Map<string, (typeof inventorySnapshots)[number]>();
  for (const snapshot of inventorySnapshots) {
    if (!latestInventoryByProduct.has(snapshot.productId)) {
      latestInventoryByProduct.set(snapshot.productId, snapshot);
    }
  }

  const supplierPricesByProduct = new Map<string, Array<(typeof supplierPriceItems)[number]>>();
  for (const priceItem of supplierPriceItems) {
    if (!priceItem.productId) {
      continue;
    }

    const existing = supplierPricesByProduct.get(priceItem.productId) ?? [];
    existing.push(priceItem);
    supplierPricesByProduct.set(priceItem.productId, existing);
  }

  const salesByProduct = new Map<string, Array<(typeof salesRecords)[number]>>();
  for (const salesRecord of salesRecords) {
    const existing = salesByProduct.get(salesRecord.productId) ?? [];
    existing.push(salesRecord);
    salesByProduct.set(salesRecord.productId, existing);
  }

  return products.map((product) => {
    const latestInventory = latestInventoryByProduct.get(product.id) ?? null;
    const supplierPriceHistory = supplierPricesByProduct.get(product.id) ?? [];
    const recentSales = salesByProduct.get(product.id) ?? [];
    const latestSupplierPriceItem = supplierPriceHistory[0] ?? null;
    const comparableSupplierPriceHistory = latestSupplierPriceItem
      ? supplierPriceHistory.filter(
          (priceItem) => priceItem.currencyCode === latestSupplierPriceItem.currencyCode,
        )
      : supplierPriceHistory;

    return {
      now,
      product,
      latestInventory,
      latestSupplierPrice: comparableSupplierPriceHistory[0]
        ? {
            supplierId: comparableSupplierPriceHistory[0].supplierId,
            unitPrice: comparableSupplierPriceHistory[0].unitPrice.toNumber(),
            createdAt: comparableSupplierPriceHistory[0].createdAt,
          }
        : null,
      previousSupplierPrice: comparableSupplierPriceHistory[1]
        ? {
            supplierId: comparableSupplierPriceHistory[1].supplierId,
            unitPrice: comparableSupplierPriceHistory[1].unitPrice.toNumber(),
            createdAt: comparableSupplierPriceHistory[1].createdAt,
          }
        : null,
      recentSales: {
        units30d: recentSales.reduce((total, record) => total + record.quantity, 0),
        averageSalePrice: average(recentSales.map((record) => record.unitPrice.toNumber())),
        lastSaleDate: recentSales[0]?.saleDate ?? null,
      },
      supplierPriceHistory: comparableSupplierPriceHistory.map((priceItem) => ({
        supplierId: priceItem.supplierId,
        unitPrice: priceItem.unitPrice.toNumber(),
        currencyCode: priceItem.currencyCode,
        createdAt: priceItem.createdAt,
        marketPriceEstimate: priceItem.marketPriceEstimate?.toNumber() ?? null,
        marketPriceConfidence: priceItem.marketPriceConfidence ?? null,
        priceDeltaFromMarketPct: priceItem.priceDeltaFromMarketPct ?? null,
        supplierReliabilityScore: priceItem.supplier.reliabilityScore,
      })),
    } as ScoringContext;
  });
}

async function persistCandidate(candidate: OpportunityCandidate, now: Date): Promise<Opportunity> {
  const dedupeWindowStart = startOfWindow(now, opportunityConfig.duplicateWindowDays);

  const existing = await db.opportunity.findFirst({
    where: {
      type: candidate.type,
      status: 'OPEN',
      productId: candidate.productId,
      supplierId: candidate.supplierId,
      createdAt: {
        gte: dedupeWindowStart,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    logger.info('Opportunity scoring updated existing opportunity', {
      opportunityId: existing.id,
      productId: candidate.productId,
      score: candidate.score,
      type: candidate.type,
    });

    return db.opportunity.update({
      where: { id: existing.id },
      data: {
        title: candidate.title,
        description: candidate.description,
        score: candidate.score,
        metadata: candidate.metadata,
      },
    });
  }

  logger.info('Opportunity scoring created opportunity', {
    productId: candidate.productId,
    score: candidate.score,
    type: candidate.type,
  });

  return db.opportunity.create({
    data: {
      type: candidate.type,
      status: candidate.status,
      title: candidate.title,
      description: candidate.description,
      score: candidate.score,
      metadata: candidate.metadata,
      productId: candidate.productId,
      supplierId: candidate.supplierId,
    },
  });
}

export async function regenerateOpportunities() {
  const now = new Date();
  const contexts = await buildScoringContexts(now);
  const candidates = contexts.flatMap((context) => scoreOpportunityCandidates(context));
  const persisted: Opportunity[] = [];

  for (const candidate of candidates) {
    persisted.push(await persistCandidate(candidate, now));
  }

  return {
    generatedCount: persisted.length,
    candidates,
    thresholds: opportunityConfig,
  };
}

function getMetadataObject(metadata: Prisma.JsonValue | null): Prisma.JsonObject {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Prisma.JsonObject) };
}

function getTriageHistory(metadata: Prisma.JsonObject): Prisma.JsonObject[] {
  const triageValue = metadata.triage;
  if (!triageValue || typeof triageValue !== 'object' || Array.isArray(triageValue)) {
    return [];
  }

  const historyValue = (triageValue as Prisma.JsonObject).history;
  if (!Array.isArray(historyValue)) {
    return [];
  }

  return historyValue.filter(
    (entry): entry is Prisma.JsonObject =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
  );
}

function buildTriageMetadata(
  opportunity: Opportunity,
  input: OpportunityTriageInput,
): Prisma.InputJsonValue {
  const metadata = getMetadataObject(opportunity.metadata);
  const history = getTriageHistory(metadata);
  const triageEntry: Prisma.JsonObject = {
    previousStatus: opportunity.status,
    newStatus: input.status,
    actorType: input.actorType,
    actorIdentifier: input.actorIdentifier,
    note: input.note?.trim() || null,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...metadata,
    triage: {
      latest: triageEntry,
      history: [...history.slice(-9), triageEntry],
    },
  } satisfies Prisma.InputJsonObject;
}

function isAllowedOpportunityStatusTransition(
  currentStatus: OpportunityStatus,
  nextStatus: OpportunityTriageInput['status'],
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (currentStatus === 'OPEN') {
    return true;
  }

  if (currentStatus === 'REVIEWED') {
    return nextStatus === 'ACTIONED' || nextStatus === 'DISMISSED';
  }

  return false;
}

export async function updateOpportunityStatus(
  input: OpportunityTriageInput,
): Promise<OpportunityWithListRelations | null> {
  const opportunity = await db.opportunity.findUnique({
    where: { id: input.opportunityId },
    include: opportunityListInclude,
  });

  if (!opportunity) {
    return null;
  }

  if (!isAllowedOpportunityStatusTransition(opportunity.status, input.status)) {
    throw new Error(
      `Opportunity cannot move from ${opportunity.status} to ${input.status}.`,
    );
  }

  return db.opportunity.update({
    where: { id: input.opportunityId },
    data: {
      status: input.status,
      metadata: buildTriageMetadata(opportunity, input),
    },
    include: opportunityListInclude,
  });
}

export async function getOpportunityScoringAudit(productId: string): Promise<OpportunityScoringAudit | null> {
  const [context] = await buildScoringContexts(new Date(), productId);

  if (!context) {
    return null;
  }

  return auditOpportunityScoring(context);
}

export async function listOpportunities(filters: {
  type?: OpportunityType;
  status?: OpportunityStatus;
  sortBy?: 'score' | 'updatedAt';
  take?: number;
}) {
  return db.opportunity.findMany({
    where: {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy:
      filters.sortBy === 'updatedAt'
        ? [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
        : [{ score: 'desc' }, { createdAt: 'desc' }],
    ...(filters.take ? { take: filters.take } : {}),
    include: opportunityListInclude,
  });
}
