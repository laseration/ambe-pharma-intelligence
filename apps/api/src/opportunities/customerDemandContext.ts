import type {
  CustomerDemandConfidence,
  CustomerDemandRequestType,
  Prisma,
} from '@prisma/client';

import { db } from '../lib/db';
import { logger } from '../lib/logger';

const PRODUCT_LINKED_LIMIT = 5;

type CustomerDemandContextRecord = {
  id: string;
  requestType: CustomerDemandRequestType;
  customerName: string | null;
  customerId: string | null;
  productText: string | null;
  productId: string | null;
  quantityRequested: number | null;
  targetPrice: Prisma.Decimal | null;
  currency: string | null;
  neededByDate: Date | null;
  urgency: string | null;
  evidenceText: string;
  confidence: CustomerDemandConfidence;
  validUntil: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
};

export type CustomerDemandContextItem = {
  id: string;
  requestType: CustomerDemandRequestType;
  customerName: string | null;
  customerId: string | null;
  productText: string | null;
  productId: string | null;
  quantityRequested: number | null;
  targetPrice: number | null;
  currency: string | null;
  neededByDate: string | null;
  urgency: string | null;
  evidenceText: string;
  confidence: CustomerDemandConfidence;
  validUntil: string | null;
  createdAt: string;
  approvedAt: string | null;
};

export type CustomerDemandContext = {
  productLinked: CustomerDemandContextItem[];
  generatedAt: string;
};

type CustomerDemandContextKey = {
  productId: string;
};

type CustomerDemandContextRepository = {
  listProductLinked: (
    productIds: string[],
    now: Date,
  ) => Promise<CustomerDemandContextRecord[]>;
};

function activeApprovedWhere(now: Date): Pick<Prisma.CustomerDemandSignalWhereInput, 'status' | 'OR'> {
  return {
    status: 'APPROVED',
    OR: [{ validUntil: null }, { validUntil: { gte: now } }],
  };
}

function createCustomerDemandContextRepository(
  client: typeof db = db,
): CustomerDemandContextRepository {
  const select = {
    id: true,
    requestType: true,
    customerName: true,
    customerId: true,
    productText: true,
    productId: true,
    quantityRequested: true,
    targetPrice: true,
    currency: true,
    neededByDate: true,
    urgency: true,
    evidenceText: true,
    confidence: true,
    validUntil: true,
    createdAt: true,
    approvedAt: true,
  } satisfies Prisma.CustomerDemandSignalSelect;

  return {
    listProductLinked: (productIds, now) =>
      productIds.length === 0
        ? Promise.resolve([])
        : client.customerDemandSignal.findMany({
            where: {
              ...activeApprovedWhere(now),
              productId: { in: productIds },
            },
            select,
            orderBy: { createdAt: 'desc' },
            take: productIds.length * PRODUCT_LINKED_LIMIT,
          }),
  };
}

function isMissingOptionalCustomerDemandTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /table `public\.CustomerDemandSignal` does not exist/i.test(message);
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function toContextItem(item: CustomerDemandContextRecord): CustomerDemandContextItem {
  return {
    id: item.id,
    requestType: item.requestType,
    customerName: item.customerName,
    customerId: item.customerId,
    productText: item.productText,
    productId: item.productId,
    quantityRequested: item.quantityRequested,
    targetPrice: item.targetPrice?.toNumber() ?? null,
    currency: item.currency,
    neededByDate: item.neededByDate?.toISOString() ?? null,
    urgency: item.urgency,
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

function contextMapKey(productId: string): string {
  return productId;
}

export function hasCustomerDemandContext(context: CustomerDemandContext | null | undefined): boolean {
  return Boolean(context && context.productLinked.length > 0);
}

export async function loadApprovedCustomerDemandContextMap(
  keys: CustomerDemandContextKey[],
  now: Date,
  repository: CustomerDemandContextRepository = createCustomerDemandContextRepository(),
): Promise<Map<string, CustomerDemandContext>> {
  const productIds = uniqueValues(keys.map((key) => key.productId));
  const generatedAt = now.toISOString();

  try {
    const productItems = await repository.listProductLinked(productIds, now);
    const productItemsByProductId = new Map<string, CustomerDemandContextItem[]>();

    for (const item of productItems) {
      if (!item.productId) {
        continue;
      }

      const existing = productItemsByProductId.get(item.productId) ?? [];
      existing.push(toContextItem(item));
      productItemsByProductId.set(item.productId, existing);
    }

    const contexts = new Map<string, CustomerDemandContext>();
    for (const key of keys) {
      const productLinked = sortNewestFirst(productItemsByProductId.get(key.productId) ?? []).slice(
        0,
        PRODUCT_LINKED_LIMIT,
      );

      contexts.set(contextMapKey(key.productId), {
        productLinked,
        generatedAt,
      });
    }

    return contexts;
  } catch (error) {
    if (isMissingOptionalCustomerDemandTable(error)) {
      return new Map();
    }

    logger.warn('Approved customer demand context unavailable for opportunities', {
      error: error instanceof Error ? error.message : 'Unknown customer demand context error.',
    });
    return new Map();
  }
}

export async function loadApprovedCustomerDemandContext(
  productId: string,
  now: Date = new Date(),
): Promise<CustomerDemandContext | null> {
  const contexts = await loadApprovedCustomerDemandContextMap([{ productId }], now);
  return contexts.get(contextMapKey(productId)) ?? null;
}

export function customerDemandContextKey(productId: string): string {
  return contextMapKey(productId);
}
