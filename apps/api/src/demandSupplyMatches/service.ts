import { createHash } from 'node:crypto';

import type {
  CommercialIntelConfidence,
  CommercialIntelItemType,
  CustomerDemandConfidence,
  CustomerDemandRequestType,
  DemandSupplyMatchConfidence,
  DemandSupplyMatchReason,
  DemandSupplyMatchStatus,
  Prisma,
  SupplierQualificationStatus,
} from '@prisma/client';

import { ConflictError } from '../http/errors';
import { db } from '../lib/db';
import { opportunityConfig } from '../opportunities/config';

const DEFAULT_TAKE = 100;
const MAX_TAKE = 250;

type DemandSupplyActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type DemandSupplyMatchListFilters = {
  status?: DemandSupplyMatchStatus | null;
  productId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  confidence?: DemandSupplyMatchConfidence | null;
  take?: number | null;
};

export type DemandSupplyMatchGenerationOptions = {
  lookbackDays?: number | null;
  take?: number | null;
};

export type DemandSupplyMatchActionInput = DemandSupplyActor & {
  action: 'REVIEW' | 'REJECT' | 'EXPIRE';
  note?: string | null;
};

type DemandRecord = {
  id: string;
  requestType: CustomerDemandRequestType;
  customerName: string | null;
  customerId: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  productText: string | null;
  productId: string | null;
  quantityRequested: number | null;
  targetPrice: unknown;
  currency: string | null;
  neededByDate: Date | null;
  urgency: string | null;
  evidenceText: string;
  confidence: CustomerDemandConfidence;
  validUntil: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
};

type SupplierPriceRecord = {
  id: string;
  supplierPriceListId?: string | null;
  supplierId: string | null;
  productId: string | null;
  rawProductName: string;
  unitPrice: unknown;
  currencyCode: string | null;
  minimumOrderQuantity: number | null;
  isAvailable: boolean;
  promotionFingerprint?: string | null;
  rawRow?: unknown;
  createdAt: Date;
  supplier?: {
    id: string;
    name: string;
    qualification?: {
      qualificationStatus: SupplierQualificationStatus;
      trustTier?: string | null;
      requiresManualApproval?: boolean | null;
    } | null;
  } | null;
};

type CommercialIntelRecord = {
  id: string;
  itemType: CommercialIntelItemType;
  productText: string | null;
  productId: string | null;
  supplierName: string | null;
  supplierId: string | null;
  customerName: string | null;
  riskLevel: string | null;
  urgency: string | null;
  evidenceText: string;
  confidence: CommercialIntelConfidence;
  validUntil: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
};

type DemandSupplyMatchRepository = {
  listApprovedDemands: (now: Date, take: number) => Promise<DemandRecord[]>;
  listRecentSupplierPrices: (productIds: string[], lookbackStart: Date) => Promise<SupplierPriceRecord[]>;
  listApprovedCommercialIntel: (
    productIds: string[],
    supplierIds: string[],
    now: Date,
  ) => Promise<CommercialIntelRecord[]>;
  upsertMatch: (data: Prisma.DemandSupplyMatchUncheckedCreateInput) => Promise<any>;
  listMatches: (filters: DemandSupplyMatchListFilters) => Promise<any[]>;
  getMatch: (id: string) => Promise<any | null>;
  updateMatch: (id: string, data: Prisma.DemandSupplyMatchUncheckedUpdateInput) => Promise<any>;
};

type CandidateBuildContext = {
  demand: DemandRecord;
  supplierPrice: SupplierPriceRecord;
  commercialIntelItems: CommercialIntelRecord[];
  now: Date;
  lookbackDays: number;
};

type DemandSupplyMatchCandidate = Prisma.DemandSupplyMatchUncheckedCreateInput;

function boundedTake(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_TAKE;
  }

  return Math.max(1, Math.min(MAX_TAKE, Math.floor(value)));
}

function createDemandSupplyMatchRepository(client: typeof db = db): DemandSupplyMatchRepository {
  const matchInclude = {
    customerDemandSignal: true,
    supplierPriceItem: {
      include: {
        supplier: true,
        product: true,
      },
    },
    product: true,
    customer: true,
    supplier: true,
  } satisfies Prisma.DemandSupplyMatchInclude;

  return {
    listApprovedDemands: (now, take) =>
      client.customerDemandSignal.findMany({
        where: {
          status: 'APPROVED',
          productId: { not: null },
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          requestType: true,
          customerName: true,
          customerId: true,
          contactName: true,
          contactEmail: true,
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
        },
      }),
    listRecentSupplierPrices: (productIds, lookbackStart) =>
      productIds.length === 0
        ? Promise.resolve([])
        : client.supplierPriceItem.findMany({
            where: {
              productId: { in: productIds },
              isAvailable: true,
              createdAt: { gte: lookbackStart },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              supplierPriceListId: true,
              supplierId: true,
              productId: true,
              rawProductName: true,
              unitPrice: true,
              currencyCode: true,
              minimumOrderQuantity: true,
              isAvailable: true,
              promotionFingerprint: true,
              rawRow: true,
              createdAt: true,
              supplier: {
                select: {
                  id: true,
                  name: true,
                  qualification: {
                    select: {
                      qualificationStatus: true,
                      trustTier: true,
                      requiresManualApproval: true,
                    },
                  },
                },
              },
            },
          }),
    listApprovedCommercialIntel: (productIds, supplierIds, now) => {
      const orClauses: Prisma.CommercialIntelItemWhereInput[] = [];

      if (productIds.length > 0) {
        orClauses.push({ productId: { in: productIds } });
      }

      if (supplierIds.length > 0) {
        orClauses.push({ supplierId: { in: supplierIds } });
      }

      if (orClauses.length === 0) {
        return Promise.resolve([]);
      }

      return client.commercialIntelItem.findMany({
        where: {
          status: 'APPROVED',
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
          AND: [{ OR: orClauses }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          itemType: true,
          productText: true,
          productId: true,
          supplierName: true,
          supplierId: true,
          customerName: true,
          riskLevel: true,
          urgency: true,
          evidenceText: true,
          confidence: true,
          validUntil: true,
          createdAt: true,
          approvedAt: true,
        },
      });
    },
    upsertMatch: (data) =>
      client.demandSupplyMatch.upsert({
        where: {
          customerDemandSignalId_supplierPriceItemId: {
            customerDemandSignalId: data.customerDemandSignalId,
            supplierPriceItemId: data.supplierPriceItemId,
          },
        },
        update: {
          productId: data.productId,
          customerId: data.customerId,
          supplierId: data.supplierId,
          reason: data.reason,
          confidence: data.confidence,
          matchScore: data.matchScore,
          rawCustomerProductText: data.rawCustomerProductText,
          rawSupplierProductText: data.rawSupplierProductText,
          quantityRequested: data.quantityRequested,
          requestedTargetPrice: data.requestedTargetPrice,
          requestedCurrency: data.requestedCurrency,
          supplierUnitPrice: data.supplierUnitPrice,
          supplierCurrency: data.supplierCurrency,
          estimatedMarginAmount: data.estimatedMarginAmount,
          estimatedMarginPct: data.estimatedMarginPct,
          marginExplanation: data.marginExplanation,
          urgency: data.urgency,
          riskFlags: data.riskFlags,
          rationale: data.rationale,
          evidence: data.evidence,
          commercialIntelContext: data.commercialIntelContext,
          customerDemandContext: data.customerDemandContext,
          supplierOfferContext: data.supplierOfferContext,
          matchFingerprint: data.matchFingerprint,
          expiresAt: data.expiresAt,
          metadata: data.metadata,
        },
        create: data,
        include: matchInclude,
      }),
    listMatches: (filters) =>
      client.demandSupplyMatch.findMany({
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
          ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
          ...(filters.confidence ? { confidence: filters.confidence } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: boundedTake(filters.take),
        include: matchInclude,
      }),
    getMatch: (id) =>
      client.demandSupplyMatch.findUnique({
        where: { id },
        include: matchInclude,
      }),
    updateMatch: (id, data) =>
      client.demandSupplyMatch.update({
        where: { id },
        data,
        include: matchInclude,
      }),
  };
}

function normalizeActor(actor: DemandSupplyActor) {
  return {
    actorType: actor.actorType?.trim() || 'OPERATOR',
    actorIdentifier: actor.actorIdentifier?.trim() || null,
  };
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object' && value && 'toNumber' in value) {
    const decimalLike = value as { toNumber?: () => number };
    if (typeof decimalLike.toNumber !== 'function') {
      return null;
    }

    const parsed = decimalLike.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function round(value: number | null, precision = 2): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function buildFingerprint(demandId: string, supplierPriceItemId: string, productId: string): string {
  return createHash('sha256')
    .update([demandId, supplierPriceItemId, productId].join('|'))
    .digest('hex');
}

function riskFlagsForContext(input: {
  demand: DemandRecord;
  supplierPrice: SupplierPriceRecord;
  targetPrice: number | null;
  requestedCurrency: string | null;
  supplierUnitPrice: number | null;
  supplierCurrency: string | null;
  commercialIntelItems: CommercialIntelRecord[];
  estimatedMarginAmount: number | null;
}): string[] {
  const flags = new Set<string>();
  const supplierQualification = input.supplierPrice.supplier?.qualification?.qualificationStatus ?? null;

  if (input.targetPrice === null) {
    flags.add('no_target_price');
  }

  if (!input.demand.quantityRequested) {
    flags.add('no_quantity');
  }

  if (!input.supplierPrice.supplierId) {
    flags.add('supplier_unknown');
  }

  if (!input.demand.customerId) {
    flags.add('customer_unknown');
  }

  if (!supplierQualification || supplierQualification === 'UNKNOWN') {
    flags.add('supplier_qualification_unknown');
  }

  if (
    input.requestedCurrency &&
    input.supplierCurrency &&
    input.requestedCurrency !== input.supplierCurrency
  ) {
    flags.add('currency_mismatch');
  }

  if (input.demand.confidence === 'LOW') {
    flags.add('weak_customer_demand_confidence');
  }

  if (!input.supplierPrice.rawRow && !input.supplierPrice.promotionFingerprint) {
    flags.add('weak_supplier_offer_context');
  }

  if (input.estimatedMarginAmount !== null && input.estimatedMarginAmount < 0) {
    flags.add('negative_estimated_margin');
  }

  if (input.commercialIntelItems.some((item) => item.itemType === 'SUPPLIER_RELIABILITY_NOTE')) {
    flags.add('supplier_reliability_warning');
  }

  return Array.from(flags);
}

function selectConfidence(input: {
  demand: DemandRecord;
  targetPrice: number | null;
  quantityRequested: number | null;
  estimatedMarginAmount: number | null;
  riskFlags: string[];
}): DemandSupplyMatchConfidence {
  if (
    input.riskFlags.includes('currency_mismatch') ||
    input.riskFlags.includes('negative_estimated_margin') ||
    input.riskFlags.includes('weak_customer_demand_confidence')
  ) {
    return 'LOW';
  }

  if (!input.targetPrice && !input.quantityRequested) {
    return 'MEDIUM';
  }

  if (input.targetPrice !== null && input.estimatedMarginAmount === null) {
    return 'LOW';
  }

  return 'HIGH';
}

function matchScoreFor(confidence: DemandSupplyMatchConfidence, riskFlags: string[]): number {
  const baseScore = confidence === 'HIGH' ? 85 : confidence === 'MEDIUM' ? 65 : 40;
  return Math.max(0, Math.min(100, baseScore - riskFlags.length * 2));
}

function selectReason(input: {
  targetPrice: number | null;
  estimatedMarginAmount: number | null;
  commercialIntelItems: CommercialIntelRecord[];
}): DemandSupplyMatchReason {
  if (input.targetPrice !== null && input.estimatedMarginAmount !== null && input.estimatedMarginAmount >= 0) {
    return 'TARGET_PRICE_MET';
  }

  if (input.commercialIntelItems.length > 0) {
    return 'CUSTOMER_DEMAND_WITH_COMMERCIAL_INTEL';
  }

  return 'CUSTOMER_DEMAND_WITH_SUPPLIER_PRICE';
}

function buildMarginExplanation(input: {
  targetPrice: number | null;
  requestedCurrency: string | null;
  supplierUnitPrice: number | null;
  supplierCurrency: string | null;
  marginAmount: number | null;
  marginPct: number | null;
}): string | null {
  if (
    input.targetPrice === null ||
    input.supplierUnitPrice === null ||
    input.marginAmount === null ||
    input.marginPct === null ||
    !input.requestedCurrency ||
    !input.supplierCurrency ||
    input.requestedCurrency !== input.supplierCurrency
  ) {
    return null;
  }

  return `Customer target price ${input.requestedCurrency} ${input.targetPrice.toFixed(2)} minus supplier unit price ${input.supplierCurrency} ${input.supplierUnitPrice.toFixed(2)} gives estimated per-unit margin ${input.requestedCurrency} ${input.marginAmount.toFixed(2)} (${Math.round(input.marginPct * 100)}%).`;
}

function buildRationale(input: {
  confidence: DemandSupplyMatchConfidence;
  riskFlags: string[];
  marginAmount: number | null;
  requestedCurrency: string | null;
}): string {
  const parts = ['Approved customer demand exists for this product and a recent supplier price is available.'];

  if (input.marginAmount !== null && input.requestedCurrency) {
    parts.push(
      input.marginAmount >= 0
        ? 'Customer target price appears to leave a positive margin against supplier price.'
        : 'Customer target price appears below supplier price; review margin before acting.',
    );
  } else if (input.riskFlags.includes('no_target_price')) {
    parts.push('Supplier price is recent but customer did not specify a target price.');
  }

  if (input.riskFlags.includes('supplier_reliability_warning')) {
    parts.push('Supplier reliability warning exists in approved commercial intel; review carefully.');
  }

  if (input.confidence === 'LOW') {
    parts.push('This match is low confidence and should be reviewed carefully.');
  }

  return parts.join(' ');
}

function toCommercialIntelContext(items: CommercialIntelRecord[]): Prisma.InputJsonValue {
  return {
    items: items.slice(0, 10).map((item) => ({
      id: item.id,
      itemType: item.itemType,
      productText: item.productText,
      productId: item.productId,
      supplierName: item.supplierName,
      supplierId: item.supplierId,
      customerName: item.customerName,
      riskLevel: item.riskLevel,
      urgency: item.urgency,
      evidenceText: item.evidenceText,
      confidence: item.confidence,
      validUntil: item.validUntil?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      approvedAt: item.approvedAt?.toISOString() ?? null,
    })),
  };
}

function buildCandidate(input: CandidateBuildContext): DemandSupplyMatchCandidate | null {
  const demand = input.demand;
  const supplierPrice = input.supplierPrice;

  if (!demand.productId || !supplierPrice.productId || demand.productId !== supplierPrice.productId) {
    return null;
  }

  const targetPrice = toNumber(demand.targetPrice);
  const supplierUnitPrice = toNumber(supplierPrice.unitPrice);
  const requestedCurrency = normalizeCurrency(demand.currency);
  const supplierCurrency = normalizeCurrency(supplierPrice.currencyCode);

  if (supplierUnitPrice === null || !supplierCurrency) {
    return null;
  }

  const currenciesMatch =
    targetPrice !== null &&
    requestedCurrency !== null &&
    supplierCurrency !== null &&
    requestedCurrency === supplierCurrency;
  const marginAmount = currenciesMatch ? round(targetPrice - supplierUnitPrice, 2) : null;
  const marginPct =
    currenciesMatch && marginAmount !== null && targetPrice > 0
      ? round(marginAmount / targetPrice, 4)
      : null;
  const riskFlags = riskFlagsForContext({
    demand,
    supplierPrice,
    targetPrice,
    requestedCurrency,
    supplierUnitPrice,
    supplierCurrency,
    commercialIntelItems: input.commercialIntelItems,
    estimatedMarginAmount: marginAmount,
  });
  const confidence = selectConfidence({
    demand,
    targetPrice,
    quantityRequested: demand.quantityRequested,
    estimatedMarginAmount: marginAmount,
    riskFlags,
  });
  const reason = selectReason({
    targetPrice,
    estimatedMarginAmount: marginAmount,
    commercialIntelItems: input.commercialIntelItems,
  });
  const matchFingerprint = buildFingerprint(demand.id, supplierPrice.id, demand.productId);

  return {
    customerDemandSignalId: demand.id,
    supplierPriceItemId: supplierPrice.id,
    productId: demand.productId,
    customerId: demand.customerId,
    supplierId: supplierPrice.supplierId,
    status: 'NEW',
    reason,
    confidence,
    matchScore: matchScoreFor(confidence, riskFlags),
    rawCustomerProductText: demand.productText,
    rawSupplierProductText: supplierPrice.rawProductName,
    quantityRequested: demand.quantityRequested,
    requestedTargetPrice: targetPrice,
    requestedCurrency,
    supplierUnitPrice,
    supplierCurrency,
    estimatedMarginAmount: marginAmount,
    estimatedMarginPct: marginPct,
    marginExplanation: buildMarginExplanation({
      targetPrice,
      requestedCurrency,
      supplierUnitPrice,
      supplierCurrency,
      marginAmount,
      marginPct,
    }),
    urgency: demand.urgency,
    riskFlags,
    rationale: buildRationale({
      confidence,
      riskFlags,
      marginAmount,
      requestedCurrency,
    }),
    evidence: {
      customerDemandSignalId: demand.id,
      supplierPriceItemId: supplierPrice.id,
      customerEvidenceText: demand.evidenceText,
      supplierRawRow: supplierPrice.rawRow ?? null,
      supplierPriceCreatedAt: supplierPrice.createdAt.toISOString(),
      matchedAt: input.now.toISOString(),
    },
    commercialIntelContext: toCommercialIntelContext(input.commercialIntelItems),
    customerDemandContext: {
      id: demand.id,
      requestType: demand.requestType,
      customerName: demand.customerName,
      customerId: demand.customerId,
      contactName: demand.contactName ?? null,
      contactEmail: demand.contactEmail ?? null,
      productText: demand.productText,
      productId: demand.productId,
      quantityRequested: demand.quantityRequested,
      targetPrice,
      currency: requestedCurrency,
      neededByDate: demand.neededByDate?.toISOString() ?? null,
      urgency: demand.urgency,
      evidenceText: demand.evidenceText,
      confidence: demand.confidence,
      validUntil: demand.validUntil?.toISOString() ?? null,
      createdAt: demand.createdAt.toISOString(),
      approvedAt: demand.approvedAt?.toISOString() ?? null,
    },
    supplierOfferContext: {
      id: supplierPrice.id,
      supplierPriceListId: supplierPrice.supplierPriceListId ?? null,
      supplierId: supplierPrice.supplierId,
      supplierName: supplierPrice.supplier?.name ?? null,
      productId: supplierPrice.productId,
      rawProductName: supplierPrice.rawProductName,
      unitPrice: supplierUnitPrice,
      currencyCode: supplierCurrency,
      minimumOrderQuantity: supplierPrice.minimumOrderQuantity,
      isAvailable: supplierPrice.isAvailable,
      promotionFingerprint: supplierPrice.promotionFingerprint ?? null,
      createdAt: supplierPrice.createdAt.toISOString(),
      supplierQualificationStatus:
        supplierPrice.supplier?.qualification?.qualificationStatus ?? 'UNKNOWN',
    },
    matchFingerprint,
    expiresAt: demand.validUntil,
    metadata: {
      generatedBy: 'demand_supply_match_v0',
      lookbackDays: input.lookbackDays,
      ruleVersion: 'demand-supply-match-v0',
    },
  };
}

function groupByProductId<T extends { productId: string | null }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    if (!item.productId) {
      continue;
    }

    const existing = groups.get(item.productId) ?? [];
    existing.push(item);
    groups.set(item.productId, existing);
  }

  return groups;
}

function relevantCommercialIntelFor(
  demand: DemandRecord,
  supplierPrice: SupplierPriceRecord,
  intelItems: CommercialIntelRecord[],
): CommercialIntelRecord[] {
  return intelItems.filter(
    (item) =>
      (item.productId && item.productId === demand.productId) ||
      (item.supplierId && item.supplierId === supplierPrice.supplierId),
  );
}

function buildGenerationInputs(options: DemandSupplyMatchGenerationOptions | undefined) {
  const lookbackDays = options?.lookbackDays && options.lookbackDays > 0
    ? Math.floor(options.lookbackDays)
    : opportunityConfig.marketLookbackDays;
  const take = boundedTake(options?.take);

  return { lookbackDays, take };
}

async function buildCandidates(
  repository: DemandSupplyMatchRepository,
  now: Date,
  options?: DemandSupplyMatchGenerationOptions,
): Promise<DemandSupplyMatchCandidate[]> {
  const { lookbackDays, take } = buildGenerationInputs(options);
  const lookbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const demands = await repository.listApprovedDemands(now, take);
  const productIds = Array.from(new Set(demands.map((demand) => demand.productId).filter((id): id is string => Boolean(id))));
  const supplierPrices = await repository.listRecentSupplierPrices(productIds, lookbackStart);
  const supplierIds = Array.from(new Set(supplierPrices.map((price) => price.supplierId).filter((id): id is string => Boolean(id))));
  const commercialIntelItems = await repository.listApprovedCommercialIntel(productIds, supplierIds, now);
  const supplierPricesByProductId = groupByProductId(supplierPrices);
  const candidates: DemandSupplyMatchCandidate[] = [];

  for (const demand of demands) {
    if (!demand.productId) {
      continue;
    }

    for (const supplierPrice of supplierPricesByProductId.get(demand.productId) ?? []) {
      const candidate = buildCandidate({
        demand,
        supplierPrice,
        commercialIntelItems: relevantCommercialIntelFor(demand, supplierPrice, commercialIntelItems),
        now,
        lookbackDays,
      });

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function metadataWithStatusNote(existing: any, input: DemandSupplyMatchActionInput, now: Date) {
  const current = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};
  const note = input.note?.trim() || null;

  return {
    ...current,
    latestStatusAction: {
      action: input.action,
      note,
      actorType: input.actorType ?? null,
      actorIdentifier: input.actorIdentifier ?? null,
      updatedAt: now.toISOString(),
    },
  } satisfies Prisma.InputJsonObject;
}

function assertStatusTransitionAllowed(
  currentStatus: DemandSupplyMatchStatus,
  action: DemandSupplyMatchActionInput['action'],
): void {
  if (action === 'REVIEW' && (currentStatus === 'NEW' || currentStatus === 'REVIEWED')) {
    return;
  }

  if (action === 'REJECT' && (currentStatus === 'NEW' || currentStatus === 'REVIEWED' || currentStatus === 'REJECTED')) {
    return;
  }

  if (action === 'EXPIRE' && (currentStatus === 'NEW' || currentStatus === 'REVIEWED' || currentStatus === 'EXPIRED')) {
    return;
  }

  throw new ConflictError(`Demand supply match cannot transition from ${currentStatus} with ${action}.`);
}

export function createDemandSupplyMatchService(overrides?: {
  repository?: DemandSupplyMatchRepository;
  now?: () => Date;
}) {
  const repository = overrides?.repository ?? createDemandSupplyMatchRepository();
  const getNow = overrides?.now ?? (() => new Date());

  return {
    async previewDemandSupplyMatches(options?: DemandSupplyMatchGenerationOptions) {
      const now = getNow();
      const matches = await buildCandidates(repository, now, options);
      return {
        generatedAt: now,
        matchCount: matches.length,
        matches,
      };
    },

    async generateDemandSupplyMatches(options?: DemandSupplyMatchGenerationOptions) {
      const now = getNow();
      const candidates = await buildCandidates(repository, now, options);
      const matches = [];

      for (const candidate of candidates) {
        matches.push(await repository.upsertMatch(candidate));
      }

      return {
        generatedAt: now,
        createdOrUpdatedCount: matches.length,
        matches,
      };
    },

    listDemandSupplyMatches(filters: DemandSupplyMatchListFilters = {}) {
      return repository.listMatches({
        ...filters,
        take: boundedTake(filters.take),
      });
    },

    getDemandSupplyMatch(id: string) {
      return repository.getMatch(id);
    },

    async updateDemandSupplyMatch(id: string, input: DemandSupplyMatchActionInput) {
      const existing = await repository.getMatch(id);
      if (!existing) {
        throw new Error('Demand supply match not found.');
      }

      assertStatusTransitionAllowed(existing.status, input.action);

      if (
        (input.action === 'REVIEW' && existing.status === 'REVIEWED') ||
        (input.action === 'REJECT' && existing.status === 'REJECTED') ||
        (input.action === 'EXPIRE' && existing.status === 'EXPIRED')
      ) {
        return existing;
      }

      const actor = normalizeActor(input);
      const now = getNow();
      const metadata = metadataWithStatusNote(existing, { ...input, ...actor }, now);

      if (input.action === 'REVIEW') {
        return repository.updateMatch(id, {
          status: 'REVIEWED',
          reviewedByType: actor.actorType,
          reviewedByIdentifier: actor.actorIdentifier,
          reviewedAt: now,
          metadata,
        });
      }

      if (input.action === 'REJECT') {
        return repository.updateMatch(id, {
          status: 'REJECTED',
          rejectedByType: actor.actorType,
          rejectedByIdentifier: actor.actorIdentifier,
          rejectedAt: now,
          metadata,
        });
      }

      return repository.updateMatch(id, {
        status: 'EXPIRED',
        expiresAt: now,
        metadata,
      });
    },
  };
}

export const demandSupplyMatchService = createDemandSupplyMatchService();
