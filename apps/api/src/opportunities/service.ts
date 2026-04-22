import type { Opportunity, OpportunityStatus, OpportunityType } from '@prisma/client';

import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { opportunityConfig } from './config';
import { auditOpportunityScoring, scoreOpportunityCandidates } from './scoring';
import type { OpportunityCandidate, OpportunityScoringAudit, ScoringContext } from './types';

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
        productId: {
          not: null,
        },
      },
    }),
    db.salesRecord.findMany({
      where: {
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
}) {
  return db.opportunity.findMany({
    where: {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    include: {
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
    },
  });
}
