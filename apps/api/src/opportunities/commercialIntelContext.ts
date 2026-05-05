import type {
  CommercialIntelConfidence,
  CommercialIntelItemType,
  Prisma,
} from '@prisma/client';

import { db } from '../lib/db';
import { logger } from '../lib/logger';

const PRODUCT_LINKED_LIMIT = 5;
const SUPPLIER_LINKED_LIMIT = 5;
const GLOBAL_LIMIT = 3;

type CommercialIntelContextRecord = {
  id: string;
  itemType: CommercialIntelItemType;
  productText: string | null;
  productId: string | null;
  supplierName: string | null;
  supplierId: string | null;
  customerName: string | null;
  priceThreshold: Prisma.Decimal | null;
  currency: string | null;
  availabilitySignal: string | null;
  riskLevel: string | null;
  urgency: string | null;
  signalEffect: string | null;
  evidenceText: string;
  confidence: CommercialIntelConfidence;
  validUntil: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
};

export type CommercialIntelContextItem = {
  id: string;
  itemType: CommercialIntelItemType;
  productText: string | null;
  productId: string | null;
  supplierName: string | null;
  supplierId: string | null;
  customerName: string | null;
  priceThreshold: number | null;
  currency: string | null;
  availabilitySignal: string | null;
  riskLevel: string | null;
  urgency: string | null;
  signalEffect: string | null;
  evidenceText: string;
  confidence: CommercialIntelConfidence;
  validUntil: string | null;
  createdAt: string;
  approvedAt: string | null;
};

export type CommercialIntelContext = {
  productLinked: CommercialIntelContextItem[];
  supplierLinked: CommercialIntelContextItem[];
  global: CommercialIntelContextItem[];
  generatedAt: string;
};

type CommercialIntelContextKey = {
  productId: string;
  supplierId?: string | null;
};

type CommercialIntelContextRepository = {
  listProductLinked: (
    productIds: string[],
    now: Date,
  ) => Promise<CommercialIntelContextRecord[]>;
  listSupplierLinked: (
    supplierIds: string[],
    now: Date,
  ) => Promise<CommercialIntelContextRecord[]>;
  listGlobal: (now: Date) => Promise<CommercialIntelContextRecord[]>;
};

function activeApprovedWhere(now: Date): Pick<Prisma.CommercialIntelItemWhereInput, 'status' | 'OR'> {
  return {
    status: 'APPROVED',
    OR: [{ validUntil: null }, { validUntil: { gte: now } }],
  };
}

function createCommercialIntelContextRepository(
  client: typeof db = db,
): CommercialIntelContextRepository {
  const select = {
    id: true,
    itemType: true,
    productText: true,
    productId: true,
    supplierName: true,
    supplierId: true,
    customerName: true,
    priceThreshold: true,
    currency: true,
    availabilitySignal: true,
    riskLevel: true,
    urgency: true,
    signalEffect: true,
    evidenceText: true,
    confidence: true,
    validUntil: true,
    createdAt: true,
    approvedAt: true,
  } satisfies Prisma.CommercialIntelItemSelect;

  return {
    listProductLinked: (productIds, now) =>
      productIds.length === 0
        ? Promise.resolve([])
        : client.commercialIntelItem.findMany({
            where: {
              ...activeApprovedWhere(now),
              productId: { in: productIds },
            },
            select,
            orderBy: { createdAt: 'desc' },
            take: productIds.length * PRODUCT_LINKED_LIMIT,
          }),
    listSupplierLinked: (supplierIds, now) =>
      supplierIds.length === 0
        ? Promise.resolve([])
        : client.commercialIntelItem.findMany({
            where: {
              ...activeApprovedWhere(now),
              supplierId: { in: supplierIds },
            },
            select,
            orderBy: { createdAt: 'desc' },
            take: supplierIds.length * SUPPLIER_LINKED_LIMIT,
          }),
    listGlobal: (now) =>
      client.commercialIntelItem.findMany({
        where: {
          ...activeApprovedWhere(now),
          productId: null,
          supplierId: null,
        },
        select,
        orderBy: { createdAt: 'desc' },
        take: GLOBAL_LIMIT,
      }),
  };
}

function isMissingOptionalCommercialIntelTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /table `public\.CommercialIntelItem` does not exist/i.test(message);
}

function contextMapKey(productId: string, supplierId?: string | null): string {
  return `${productId}:${supplierId ?? ''}`;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function toContextItem(item: CommercialIntelContextRecord): CommercialIntelContextItem {
  return {
    id: item.id,
    itemType: item.itemType,
    productText: item.productText,
    productId: item.productId,
    supplierName: item.supplierName,
    supplierId: item.supplierId,
    customerName: item.customerName,
    priceThreshold: item.priceThreshold?.toNumber() ?? null,
    currency: item.currency,
    availabilitySignal: item.availabilitySignal,
    riskLevel: item.riskLevel,
    urgency: item.urgency,
    signalEffect: item.signalEffect,
    evidenceText: item.evidenceText,
    confidence: item.confidence,
    validUntil: item.validUntil?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    approvedAt: item.approvedAt?.toISOString() ?? null,
  };
}

function sortNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function hasCommercialIntelContext(context: CommercialIntelContext | null | undefined): boolean {
  return Boolean(
    context &&
      (context.productLinked.length > 0 ||
        context.supplierLinked.length > 0 ||
        context.global.length > 0),
  );
}

export async function loadApprovedCommercialIntelContextMap(
  keys: CommercialIntelContextKey[],
  now: Date,
  repository: CommercialIntelContextRepository = createCommercialIntelContextRepository(),
): Promise<Map<string, CommercialIntelContext>> {
  const productIds = uniqueValues(keys.map((key) => key.productId));
  const supplierIds = uniqueValues(keys.map((key) => key.supplierId));
  const generatedAt = now.toISOString();

  try {
    const [productItems, supplierItems, globalItems] = await Promise.all([
      repository.listProductLinked(productIds, now),
      repository.listSupplierLinked(supplierIds, now),
      repository.listGlobal(now),
    ]);

    const productItemsByProductId = new Map<string, CommercialIntelContextItem[]>();
    for (const item of productItems) {
      if (!item.productId) {
        continue;
      }

      const existing = productItemsByProductId.get(item.productId) ?? [];
      existing.push(toContextItem(item));
      productItemsByProductId.set(item.productId, existing);
    }

    const supplierItemsBySupplierId = new Map<string, CommercialIntelContextItem[]>();
    for (const item of supplierItems) {
      if (!item.supplierId) {
        continue;
      }

      const existing = supplierItemsBySupplierId.get(item.supplierId) ?? [];
      existing.push(toContextItem(item));
      supplierItemsBySupplierId.set(item.supplierId, existing);
    }

    const global = globalItems.map(toContextItem).slice(0, GLOBAL_LIMIT);
    const contexts = new Map<string, CommercialIntelContext>();

    for (const key of keys) {
      const productLinked = sortNewestFirst(productItemsByProductId.get(key.productId) ?? []).slice(
        0,
        PRODUCT_LINKED_LIMIT,
      );
      const supplierLinked = sortNewestFirst(
        key.supplierId ? supplierItemsBySupplierId.get(key.supplierId) ?? [] : [],
      ).slice(0, SUPPLIER_LINKED_LIMIT);

      contexts.set(contextMapKey(key.productId, key.supplierId), {
        productLinked,
        supplierLinked,
        global,
        generatedAt,
      });
    }

    return contexts;
  } catch (error) {
    if (isMissingOptionalCommercialIntelTable(error)) {
      return new Map();
    }

    logger.warn('Approved commercial intel context unavailable for opportunities', {
      error: error instanceof Error ? error.message : 'Unknown commercial intel context error.',
    });
    return new Map();
  }
}

export async function loadApprovedCommercialIntelContext(
  productId: string,
  supplierId?: string | null,
  now: Date = new Date(),
): Promise<CommercialIntelContext | null> {
  const contexts = await loadApprovedCommercialIntelContextMap([{ productId, supplierId }], now);
  return contexts.get(contextMapKey(productId, supplierId)) ?? null;
}

export function commercialIntelContextKey(productId: string, supplierId?: string | null): string {
  return contextMapKey(productId, supplierId);
}
