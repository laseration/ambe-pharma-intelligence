import type { Prisma, PrismaClient } from '@prisma/client';

import { db } from '../lib/db';

export type InventoryListFilters = {
  q?: string | null;
  productId?: string | null;
  supplierId?: string | null;
  lowStockOnly?: boolean | null;
  staleOnly?: boolean | null;
  limit?: number;
  page?: number;
};

export type InventoryStockRiskFilters = {
  limit?: number;
};

export type InventoryProductSummary = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
};

export type InventorySupplierSummary = {
  id: string;
  name: string;
  country: string | null;
  isActive: boolean;
};

export type InventorySnapshotRecord = {
  id: string;
  productId: string;
  supplierId: string | null;
  rawProductName: string;
  rawSupplierName: string | null;
  warehouseCode: string;
  snapshotDate: Date;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  unitCost: unknown;
  totalValue: unknown;
  createdAt: Date;
  product: InventoryProductSummary;
  supplier: InventorySupplierSummary | null;
};

export type InventorySalesRecord = {
  productId: string;
  quantity: number;
  saleDate: Date;
};

export type InventoryOpportunityRecord = {
  id: string;
  productId: string | null;
  type: string;
  status: string;
  score: number;
  title: string;
  updatedAt: Date;
};

export type InventoryProductRecord = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
  inventorySnapshots: Array<{
    snapshotDate: Date;
    quantityAvailable: number;
  }>;
};

export type InventoryRepository = {
  listSnapshots: (
    filters: Required<Pick<InventoryListFilters, 'limit' | 'page'>> &
      Omit<InventoryListFilters, 'limit' | 'page'>,
  ) => Promise<InventorySnapshotRecord[]>;
  listRecentSales: (since: Date) => Promise<InventorySalesRecord[]>;
  listOpenOpportunities: () => Promise<InventoryOpportunityRecord[]>;
  listProductsMissingRecentSnapshot: (
    since: Date,
    limit: number,
  ) => Promise<InventoryProductRecord[]>;
};

export type InventorySummaryRow = {
  id: string;
  product: InventoryProductSummary;
  supplier: InventorySupplierSummary | null;
  warehouseCode: string;
  snapshotDate: string;
  ageDays: number;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  unitCost: number | null;
  totalValue: number | null;
  lowStock: boolean;
  stale: boolean;
  source: {
    rawProductName: string;
    rawSupplierName: string | null;
  };
};

export type StockRiskReasonCode =
  | 'LOW_STOCK'
  | 'STALE_SNAPSHOT'
  | 'RECENT_SALES_VELOCITY'
  | 'OPEN_OPPORTUNITY'
  | 'MISSING_RECENT_SNAPSHOT';

export type StockRiskReason = {
  code: StockRiskReasonCode;
  message: string;
};

export type StockRiskRow = {
  product: InventoryProductSummary;
  supplier: InventorySupplierSummary | null;
  warehouseCode: string | null;
  snapshotDate: string | null;
  quantityAvailable: number | null;
  recentSalesQuantity: number;
  openOpportunityCount: number;
  riskScore: number;
  reasons: StockRiskReason[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const LOW_STOCK_THRESHOLD = 10;
const STALE_SNAPSHOT_DAYS = 30;
const RECENT_SALES_DAYS = 30;
const VELOCITY_DAYS_COVER_THRESHOLD = 14;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function pageOffset(page: number | undefined, limit: number): number {
  return Math.max((page ?? 1) - 1, 0) * limit;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysBetween(left: Date, right: Date): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.floor((left.getTime() - right.getTime()) / millisPerDay),
  );
}

function nowDate(): Date {
  return new Date();
}

function staleCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - STALE_SNAPSHOT_DAYS);
  return cutoff;
}

function recentSalesCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_SALES_DAYS);
  return cutoff;
}

function mapProduct(product: InventoryProductSummary): InventoryProductSummary {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? null,
    manufacturer: product.manufacturer ?? null,
    strength: product.strength ?? null,
    dosageForm: product.dosageForm ?? null,
    packSize: product.packSize ?? null,
  };
}

function mapSnapshot(
  snapshot: InventorySnapshotRecord,
  now: Date,
): InventorySummaryRow {
  const ageDays = daysBetween(now, snapshot.snapshotDate);

  return {
    id: snapshot.id,
    product: mapProduct(snapshot.product),
    supplier: snapshot.supplier
      ? {
          id: snapshot.supplier.id,
          name: snapshot.supplier.name,
          country: snapshot.supplier.country ?? null,
          isActive: snapshot.supplier.isActive,
        }
      : null,
    warehouseCode: snapshot.warehouseCode,
    snapshotDate: snapshot.snapshotDate.toISOString(),
    ageDays,
    quantityOnHand: snapshot.quantityOnHand,
    quantityReserved: snapshot.quantityReserved,
    quantityAvailable: snapshot.quantityAvailable,
    unitCost: toNumber(snapshot.unitCost),
    totalValue: toNumber(snapshot.totalValue),
    lowStock: snapshot.quantityAvailable <= LOW_STOCK_THRESHOLD,
    stale: ageDays > STALE_SNAPSHOT_DAYS,
    source: {
      rawProductName: snapshot.rawProductName,
      rawSupplierName: snapshot.rawSupplierName ?? null,
    },
  };
}

function uniqueLatestSnapshots(
  snapshots: InventorySnapshotRecord[],
): InventorySnapshotRecord[] {
  const seen = new Set<string>();
  const result: InventorySnapshotRecord[] = [];

  for (const snapshot of snapshots) {
    const key = [
      snapshot.productId,
      snapshot.supplierId ?? 'none',
      snapshot.warehouseCode,
    ].join(':');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(snapshot);
  }

  return result;
}

function buildSnapshotWhere(
  filters: Omit<InventoryListFilters, 'limit' | 'page'>,
  now: Date,
): Prisma.InventorySnapshotWhereInput {
  const where: Prisma.InventorySnapshotWhereInput = {};

  if (filters.productId) {
    where.productId = filters.productId;
  }

  if (filters.supplierId) {
    where.supplierId = filters.supplierId;
  }

  if (filters.lowStockOnly === true) {
    where.quantityAvailable = {
      lte: LOW_STOCK_THRESHOLD,
    };
  }

  if (filters.staleOnly === true) {
    where.snapshotDate = {
      lt: staleCutoff(now),
    };
  }

  if (filters.q) {
    where.OR = [
      { rawProductName: { contains: filters.q, mode: 'insensitive' } },
      { rawSupplierName: { contains: filters.q, mode: 'insensitive' } },
      { warehouseCode: { contains: filters.q, mode: 'insensitive' } },
      { product: { name: { contains: filters.q, mode: 'insensitive' } } },
      { product: { sku: { contains: filters.q, mode: 'insensitive' } } },
      { supplier: { name: { contains: filters.q, mode: 'insensitive' } } },
    ];
  }

  return where;
}

export function createInventoryRepository(
  client: PrismaClient = db,
): InventoryRepository {
  return {
    listSnapshots: async (filters) => {
      const limit = clampLimit(filters.limit);
      const now = nowDate();

      return (await client.inventorySnapshot.findMany({
        where: buildSnapshotWhere(filters, now),
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              manufacturer: true,
              strength: true,
              dosageForm: true,
              packSize: true,
            },
          },
          supplier: {
            select: {
              id: true,
              name: true,
              country: true,
              isActive: true,
            },
          },
        },
        orderBy: [
          { snapshotDate: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        skip: pageOffset(filters.page, limit) * 4,
        take: limit * 4,
      })) as InventorySnapshotRecord[];
    },

    listRecentSales: async (since) =>
      client.salesRecord.findMany({
        where: {
          saleDate: {
            gte: since,
          },
        },
        select: {
          productId: true,
          quantity: true,
          saleDate: true,
        },
      }),

    listOpenOpportunities: async () =>
      client.opportunity.findMany({
        where: {
          status: 'OPEN',
          productId: {
            not: null,
          },
        },
        select: {
          id: true,
          productId: true,
          type: true,
          status: true,
          score: true,
          title: true,
          updatedAt: true,
        },
      }) as Promise<InventoryOpportunityRecord[]>,

    listProductsMissingRecentSnapshot: async (since, limit) =>
      client.product.findMany({
        where: {
          isActive: true,
          inventorySnapshots: {
            none: {
              snapshotDate: {
                gte: since,
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          sku: true,
          manufacturer: true,
          strength: true,
          dosageForm: true,
          packSize: true,
          inventorySnapshots: {
            orderBy: {
              snapshotDate: 'desc',
            },
            take: 1,
            select: {
              snapshotDate: true,
              quantityAvailable: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        take: limit,
      }),
  };
}

function sumSalesByProduct(
  salesRecords: InventorySalesRecord[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const sale of salesRecords) {
    totals.set(
      sale.productId,
      (totals.get(sale.productId) ?? 0) + sale.quantity,
    );
  }

  return totals;
}

function countOpportunitiesByProduct(
  opportunities: InventoryOpportunityRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const opportunity of opportunities) {
    if (!opportunity.productId) {
      continue;
    }

    counts.set(
      opportunity.productId,
      (counts.get(opportunity.productId) ?? 0) + 1,
    );
  }

  return counts;
}

function buildRiskRow(
  snapshot: InventorySummaryRow,
  recentSalesQuantity: number,
  openOpportunityCount: number,
): StockRiskRow | null {
  const reasons: StockRiskReason[] = [];
  const averageDailySales = recentSalesQuantity / RECENT_SALES_DAYS;
  const daysCover =
    averageDailySales > 0
      ? snapshot.quantityAvailable / averageDailySales
      : null;

  if (snapshot.lowStock) {
    reasons.push({
      code: 'LOW_STOCK',
      message: `Available quantity is ${snapshot.quantityAvailable}, at or below the ${LOW_STOCK_THRESHOLD} unit threshold.`,
    });
  }

  if (snapshot.stale) {
    reasons.push({
      code: 'STALE_SNAPSHOT',
      message: `Latest snapshot is ${snapshot.ageDays} days old.`,
    });
  }

  if (daysCover !== null && daysCover <= VELOCITY_DAYS_COVER_THRESHOLD) {
    reasons.push({
      code: 'RECENT_SALES_VELOCITY',
      message: `Recent sales quantity is ${recentSalesQuantity}, leaving about ${Math.max(0, Math.round(daysCover))} days of cover.`,
    });
  }

  if (openOpportunityCount > 0) {
    reasons.push({
      code: 'OPEN_OPPORTUNITY',
      message: `${openOpportunityCount} open opportunity signal(s) reference this product.`,
    });
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    product: snapshot.product,
    supplier: snapshot.supplier,
    warehouseCode: snapshot.warehouseCode,
    snapshotDate: snapshot.snapshotDate,
    quantityAvailable: snapshot.quantityAvailable,
    recentSalesQuantity,
    openOpportunityCount,
    riskScore:
      (snapshot.lowStock ? 40 : 0) +
      (snapshot.stale ? 25 : 0) +
      (daysCover !== null && daysCover <= VELOCITY_DAYS_COVER_THRESHOLD
        ? 25
        : 0) +
      Math.min(openOpportunityCount * 10, 20),
    reasons,
  };
}

export function createInventoryService(
  repository: InventoryRepository = createInventoryRepository(),
  now: () => Date = nowDate,
) {
  return {
    async listInventory(filters: InventoryListFilters = {}) {
      const limit = clampLimit(filters.limit);
      const snapshots = await repository.listSnapshots({
        q: filters.q?.trim() || null,
        productId: filters.productId?.trim() || null,
        supplierId: filters.supplierId?.trim() || null,
        lowStockOnly: filters.lowStockOnly ?? null,
        staleOnly: filters.staleOnly ?? null,
        limit,
        page: filters.page ?? 1,
      });
      const items = uniqueLatestSnapshots(snapshots)
        .slice(0, limit)
        .map((snapshot) => mapSnapshot(snapshot, now()));

      return {
        items,
        page: filters.page ?? 1,
        limit,
        hasMore: snapshots.length > limit,
      };
    },

    async listStockRisk(filters: InventoryStockRiskFilters = {}) {
      const limit = clampLimit(filters.limit);
      const currentTime = now();
      const [inventory, sales, opportunities, productsMissingRecentSnapshot] =
        await Promise.all([
          this.listInventory({ limit: MAX_LIMIT }),
          repository.listRecentSales(recentSalesCutoff(currentTime)),
          repository.listOpenOpportunities(),
          repository.listProductsMissingRecentSnapshot(
            staleCutoff(currentTime),
            limit,
          ),
        ]);
      const salesByProduct = sumSalesByProduct(sales);
      const opportunitiesByProduct = countOpportunitiesByProduct(opportunities);
      const riskRows = inventory.items
        .map((snapshot) =>
          buildRiskRow(
            snapshot,
            salesByProduct.get(snapshot.product.id) ?? 0,
            opportunitiesByProduct.get(snapshot.product.id) ?? 0,
          ),
        )
        .filter((row): row is StockRiskRow => row !== null);
      const missingSnapshotRows: StockRiskRow[] =
        productsMissingRecentSnapshot.map((product) => {
          const latestSnapshot = product.inventorySnapshots[0] ?? null;
          return {
            product: mapProduct(product),
            supplier: null,
            warehouseCode: null,
            snapshotDate: latestSnapshot?.snapshotDate.toISOString() ?? null,
            quantityAvailable: latestSnapshot?.quantityAvailable ?? null,
            recentSalesQuantity: salesByProduct.get(product.id) ?? 0,
            openOpportunityCount: opportunitiesByProduct.get(product.id) ?? 0,
            riskScore: 30,
            reasons: [
              {
                code: 'MISSING_RECENT_SNAPSHOT',
                message:
                  'No inventory snapshot exists inside the recent freshness window.',
              },
            ],
          };
        });

      return [...riskRows, ...missingSnapshotRows]
        .sort((left, right) => {
          if (right.riskScore !== left.riskScore) {
            return right.riskScore - left.riskScore;
          }

          return left.product.name.localeCompare(right.product.name);
        })
        .slice(0, limit);
    },
  };
}

export const inventoryService = createInventoryService();
