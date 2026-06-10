import { db } from '../lib/db';
import { buildCommercialAuditMetadata } from '../audit/commercialAudit';
import { syncTradeOpportunityCommercialState } from '../deals/service';
import {
  assertBuyDecisionApprovedForExecution,
  assertOrderPlacementIsIdempotent,
  type AppliedCorrectionSnapshot,
} from '../safety/commercialApprovalGuard';

export type BuyDecisionOrderStatus =
  | 'NOT_ORDERED'
  | 'ORDERED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

export type BuyExecutionFulfillmentStatus =
  | 'NOT_STARTED'
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type BuyExecutionReconciliationStatus =
  | 'NOT_RECONCILED'
  | 'MATCHED'
  | 'PRICE_DRIFT'
  | 'QUANTITY_DRIFT'
  | 'CURRENCY_MISMATCH'
  | 'REQUIRES_REVIEW';

export type BuyExecutionActionType =
  | 'CREATED'
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'RECEIVED'
  | 'PARTIALLY_RECEIVED'
  | 'INVOICE_RECORDED'
  | 'CANCELLED'
  | 'RECONCILED'
  | 'NOTE_ADDED'
  | 'UPDATED_REFERENCE';

export type BuyExecutionActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type BuyExecutionRecord = {
  id: string;
  buyDecisionId: string;
  supplierId: string | null;
  productId: string | null;
  orderedQuantity: number | null;
  orderedUnitPrice: unknown;
  orderedCurrencyCode: string | null;
  orderedMinimumOrderQuantity: number | null;
  confirmedAvailability: boolean | null;
  externalOrderReference: string | null;
  orderPlacedAt: Date | null;
  orderConfirmedAt: Date | null;
  expectedDeliveryDate: Date | null;
  receivedQuantity: number | null;
  receivedAt: Date | null;
  invoicedUnitPrice: unknown;
  invoicedCurrencyCode: string | null;
  invoiceReference: string | null;
  invoicedAt: Date | null;
  fulfillmentStatus: BuyExecutionFulfillmentStatus;
  reconciliationStatus: BuyExecutionReconciliationStatus;
  hasPriceDrift: boolean;
  hasQuantityDrift: boolean;
  hasCurrencyMismatch: boolean;
  hasAvailabilityDrift: boolean;
  notes: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  buyDecision?: BuyDecisionExecutionSnapshot | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
  } | null;
  events?: BuyExecutionEventRecord[];
};

export type BuyExecutionEventRecord = {
  id: string;
  buyExecutionId: string;
  actionType: BuyExecutionActionType;
  previousFulfillmentStatus: BuyExecutionFulfillmentStatus | null;
  newFulfillmentStatus: BuyExecutionFulfillmentStatus | null;
  previousReconciliationStatus: BuyExecutionReconciliationStatus | null;
  newReconciliationStatus: BuyExecutionReconciliationStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type BuyDecisionExecutionSnapshot = {
  id: string;
  emailDerivedOfferId: string;
  supplierId: string | null;
  productId: string | null;
  quotedUnitPrice: unknown;
  quotedCurrencyCode: string | null;
  quotedMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  orderStatus: BuyDecisionOrderStatus;
  orderedAt: Date | null;
  externalOrderReference: string | null;
  supplierQualificationStatus:
    | 'UNKNOWN'
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'RESTRICTED'
    | 'BLOCKED';
  hasQualificationRisk: boolean;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvedAt: Date | null;
  metadata?: unknown;
  emailDerivedOffer?: {
    offerCorrections?: AppliedCorrectionSnapshot[];
  } | null;
};

export type BuyExecutionUpdateInput = BuyExecutionActor & {
  orderedQuantity?: number | null;
  orderedUnitPrice?: unknown;
  orderedCurrencyCode?: string | null;
  orderedMinimumOrderQuantity?: number | null;
  confirmedAvailability?: boolean | null;
  externalOrderReference?: string | null;
  orderPlacedAt?: Date | null;
  orderConfirmedAt?: Date | null;
  expectedDeliveryDate?: Date | null;
  receivedQuantity?: number | null;
  receivedAt?: Date | null;
  invoicedUnitPrice?: unknown;
  invoicedCurrencyCode?: string | null;
  invoiceReference?: string | null;
  invoicedAt?: Date | null;
  fulfillmentStatus?: BuyExecutionFulfillmentStatus;
  note?: string | null;
  notes?: string | null;
  metadata?: unknown;
};

export type BuyExecutionListFilters = {
  buyDecisionId?: string | null;
  supplierId?: string | null;
  fulfillmentStatus?: BuyExecutionFulfillmentStatus | null;
  reconciliationStatus?: BuyExecutionReconciliationStatus | null;
  hasDrift?: boolean | null;
  take?: number;
};

export type BuyExecutionReconciliation = {
  unitPriceDelta: number | null;
  unitPriceDeltaPct: number | null;
  quoteToOrderPriceDrift: number | null;
  quoteToOrderPriceDriftPct: number | null;
  quoteToInvoicePriceDrift: number | null;
  quoteToInvoicePriceDriftPct: number | null;
  quantityVariance: number | null;
  hasPriceDrift: boolean;
  hasQuantityDrift: boolean;
  hasCurrencyMismatch: boolean;
  hasAvailabilityDrift: boolean;
  reconciliationStatus: BuyExecutionReconciliationStatus;
};

export type BuyExecutionSummary = BuyExecutionReconciliation & {
  hasExecution: boolean;
  hasCommercialDrift: boolean;
  fulfillmentStatus: BuyExecutionFulfillmentStatus | null;
  recommendedNextAction:
    | 'place order'
    | 'confirm order'
    | 'record received quantity'
    | 'record invoice'
    | 'investigate drift'
    | 'restrict supplier'
    | 'monitor';
};

export const buyExecutionConfig = {
  priceDriftThresholdPct: 0.03,
  quantityDriftTolerancePct: 0.05,
  quantityDriftToleranceUnits: 1,
} as const;

export type BuyExecutionRepository = {
  transaction: <T>(
    callback: (repository: BuyExecutionRepository) => Promise<T>,
  ) => Promise<T>;
  findById: (buyExecutionId: string) => Promise<BuyExecutionRecord | null>;
  findByBuyDecisionId: (
    buyDecisionId: string,
  ) => Promise<BuyExecutionRecord | null>;
  create: (
    data: Partial<BuyExecutionRecord> &
      Pick<
        BuyExecutionRecord,
        | 'buyDecisionId'
        | 'fulfillmentStatus'
        | 'reconciliationStatus'
        | 'hasPriceDrift'
        | 'hasQuantityDrift'
        | 'hasCurrencyMismatch'
        | 'hasAvailabilityDrift'
      >,
  ) => Promise<BuyExecutionRecord>;
  update: (
    buyExecutionId: string,
    data: Partial<BuyExecutionRecord>,
  ) => Promise<BuyExecutionRecord>;
  createEvent: (
    data: Omit<BuyExecutionEventRecord, 'id' | 'createdAt'>,
  ) => Promise<BuyExecutionEventRecord>;
  list: (filters: BuyExecutionListFilters) => Promise<BuyExecutionRecord[]>;
  findBuyDecisionById: (
    buyDecisionId: string,
  ) => Promise<BuyDecisionExecutionSnapshot | null>;
  updateBuyDecision: (
    buyDecisionId: string,
    data: Partial<BuyDecisionExecutionSnapshot>,
  ) => Promise<BuyDecisionExecutionSnapshot>;
  listActiveTradeOpportunitiesByOfferId: (
    emailDerivedOfferId: string,
  ) => Promise<any[]>;
  updateTradeOpportunity: (
    tradeOpportunityId: string,
    data: Record<string, unknown>,
  ) => Promise<any>;
  createTradeOpportunityEvent: (data: Record<string, unknown>) => Promise<any>;
};

function normalizeActor(actor?: BuyExecutionActor): {
  actorType: string;
  actorIdentifier: string | null;
} {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function round(value: number | null, precision = 4): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toJsonSafeAuditValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === undefined) {
    return null;
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafeAuditValue(item, seen));
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  const numericValue = toNumber(value);
  if (numericValue !== null) {
    return numericValue;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      toJsonSafeAuditValue(item, seen),
    ]),
  );
}

function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase() || null;
  return normalized || null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

  return null;
}

function normalizeAvailabilityExpectation(
  value: string | null | undefined,
): boolean | null {
  const normalized = value?.trim().toLowerCase() || null;
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('available') ||
    normalized.includes('in stock') ||
    normalized.includes('yes') ||
    normalized.includes('confirmed')
  ) {
    return true;
  }

  if (
    normalized.includes('unavailable') ||
    normalized.includes('out of stock') ||
    normalized.includes('not available') ||
    normalized.includes('no')
  ) {
    return false;
  }

  return null;
}

function calculatePriceDrift(
  referencePrice: number | null,
  actualPrice: number | null,
) {
  if (referencePrice === null || actualPrice === null) {
    return {
      delta: null,
      deltaPct: null,
    };
  }

  const delta = round(actualPrice - referencePrice, 4);
  const deltaPct =
    referencePrice > 0
      ? round((actualPrice - referencePrice) / referencePrice, 6)
      : null;

  return {
    delta,
    deltaPct,
  };
}

function calculateQuantityVariance(
  expectedQuantity: number | null,
  actualQuantity: number | null,
): number | null {
  if (expectedQuantity === null || actualQuantity === null) {
    return null;
  }

  return actualQuantity - expectedQuantity;
}

function hasQuantityDrift(
  expectedQuantity: number | null,
  actualQuantity: number | null,
): boolean {
  if (expectedQuantity === null || actualQuantity === null) {
    return false;
  }

  const delta = Math.abs(actualQuantity - expectedQuantity);
  if (delta === 0) {
    return false;
  }

  if (delta > buyExecutionConfig.quantityDriftToleranceUnits) {
    return true;
  }

  return expectedQuantity > 0
    ? delta / expectedQuantity > buyExecutionConfig.quantityDriftTolerancePct
    : delta > 0;
}

function mapFulfillmentStatusToOrderStatus(
  fulfillmentStatus: BuyExecutionFulfillmentStatus,
): BuyDecisionOrderStatus {
  switch (fulfillmentStatus) {
    case 'ORDER_PLACED':
    case 'ORDER_CONFIRMED':
      return 'ORDERED';
    case 'PARTIALLY_RECEIVED':
      return 'PARTIALLY_FULFILLED';
    case 'RECEIVED':
      return 'FULFILLED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'NOT_ORDERED';
  }
}

function deriveFulfillmentStatus(
  current: BuyExecutionRecord | null,
  input: BuyExecutionUpdateInput,
  orderedQuantity: number | null,
  receivedQuantity: number | null,
): BuyExecutionFulfillmentStatus {
  if (input.fulfillmentStatus) {
    return input.fulfillmentStatus;
  }

  if (receivedQuantity !== null && receivedQuantity > 0) {
    if (orderedQuantity !== null && receivedQuantity < orderedQuantity) {
      return 'PARTIALLY_RECEIVED';
    }

    return 'RECEIVED';
  }

  if (input.orderConfirmedAt !== undefined) {
    return input.orderConfirmedAt
      ? 'ORDER_CONFIRMED'
      : (current?.fulfillmentStatus ?? 'NOT_STARTED');
  }

  if (
    input.orderPlacedAt !== undefined ||
    input.externalOrderReference !== undefined ||
    input.orderedQuantity !== undefined ||
    input.orderedUnitPrice !== undefined
  ) {
    const hasPlacedSignal =
      Boolean(input.orderPlacedAt) ||
      Boolean(input.externalOrderReference?.trim()) ||
      orderedQuantity !== null ||
      toNumber(input.orderedUnitPrice) !== null;

    if (hasPlacedSignal) {
      return current?.orderConfirmedAt ? 'ORDER_CONFIRMED' : 'ORDER_PLACED';
    }
  }

  return current?.fulfillmentStatus ?? 'NOT_STARTED';
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber !== null || rightNumber !== null) {
    return leftNumber === rightNumber;
  }

  return false;
}

function datesEqual(
  left: Date | null | undefined,
  right: Date | null | undefined,
): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function latestAppliedCorrection(
  buyDecision: BuyDecisionExecutionSnapshot,
): AppliedCorrectionSnapshot {
  return buyDecision.emailDerivedOffer?.offerCorrections?.[0] ?? null;
}

function buildEventAction(
  previous: BuyExecutionRecord | null,
  next: BuyExecutionRecord,
  input: BuyExecutionUpdateInput,
  changedFields: string[],
): BuyExecutionActionType {
  if (!previous) {
    if (next.fulfillmentStatus === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (next.invoiceReference || next.invoicedAt || next.invoicedUnitPrice) {
      return 'INVOICE_RECORDED';
    }
    if (next.fulfillmentStatus === 'RECEIVED') {
      return 'RECEIVED';
    }
    if (next.fulfillmentStatus === 'PARTIALLY_RECEIVED') {
      return 'PARTIALLY_RECEIVED';
    }
    if (next.fulfillmentStatus === 'ORDER_CONFIRMED') {
      return 'ORDER_CONFIRMED';
    }
    if (next.fulfillmentStatus === 'ORDER_PLACED') {
      return 'ORDER_PLACED';
    }
    return 'CREATED';
  }

  if (
    next.fulfillmentStatus === 'CANCELLED' &&
    previous.fulfillmentStatus !== 'CANCELLED'
  ) {
    return 'CANCELLED';
  }

  if (
    changedFields.some((field) =>
      [
        'invoiceReference',
        'invoicedAt',
        'invoicedCurrencyCode',
        'invoicedUnitPrice',
      ].includes(field),
    )
  ) {
    return 'INVOICE_RECORDED';
  }

  if (
    next.fulfillmentStatus === 'RECEIVED' &&
    previous.fulfillmentStatus !== 'RECEIVED'
  ) {
    return 'RECEIVED';
  }

  if (
    next.fulfillmentStatus === 'PARTIALLY_RECEIVED' &&
    previous.fulfillmentStatus !== 'PARTIALLY_RECEIVED'
  ) {
    return 'PARTIALLY_RECEIVED';
  }

  if (
    next.fulfillmentStatus === 'ORDER_CONFIRMED' &&
    previous.fulfillmentStatus !== 'ORDER_CONFIRMED'
  ) {
    return 'ORDER_CONFIRMED';
  }

  if (
    next.fulfillmentStatus === 'ORDER_PLACED' &&
    previous.fulfillmentStatus !== 'ORDER_PLACED'
  ) {
    return 'ORDER_PLACED';
  }

  if (
    next.reconciliationStatus !== previous.reconciliationStatus ||
    next.hasPriceDrift !== previous.hasPriceDrift ||
    next.hasQuantityDrift !== previous.hasQuantityDrift ||
    next.hasCurrencyMismatch !== previous.hasCurrencyMismatch ||
    next.hasAvailabilityDrift !== previous.hasAvailabilityDrift
  ) {
    return 'RECONCILED';
  }

  if (changedFields.length === 1 && changedFields[0] === 'notes') {
    return 'NOTE_ADDED';
  }

  return 'UPDATED_REFERENCE';
}

export function calculateBuyExecutionReconciliation(
  buyDecision: BuyDecisionExecutionSnapshot,
  execution: Pick<
    BuyExecutionRecord,
    | 'orderedQuantity'
    | 'orderedUnitPrice'
    | 'orderedCurrencyCode'
    | 'orderedMinimumOrderQuantity'
    | 'confirmedAvailability'
    | 'receivedQuantity'
    | 'invoicedUnitPrice'
    | 'invoicedCurrencyCode'
  >,
): BuyExecutionReconciliation {
  const quotedUnitPrice = toNumber(buyDecision.quotedUnitPrice);
  const orderedUnitPrice = toNumber(execution.orderedUnitPrice);
  const invoicedUnitPrice = toNumber(execution.invoicedUnitPrice);
  const quotedCurrencyCode = normalizeCurrencyCode(
    buyDecision.quotedCurrencyCode,
  );
  const orderedCurrencyCode = normalizeCurrencyCode(
    execution.orderedCurrencyCode,
  );
  const invoicedCurrencyCode = normalizeCurrencyCode(
    execution.invoicedCurrencyCode,
  );
  const orderPriceDrift = calculatePriceDrift(
    quotedUnitPrice,
    orderedUnitPrice,
  );
  const invoicePriceDrift = calculatePriceDrift(
    quotedUnitPrice,
    invoicedUnitPrice,
  );
  const quantityVariance = calculateQuantityVariance(
    buyDecision.quotedMinimumOrderQuantity ?? null,
    execution.receivedQuantity ?? execution.orderedQuantity ?? null,
  );
  const hasOrderPriceDrift =
    Math.abs(orderPriceDrift.deltaPct ?? 0) >
    buyExecutionConfig.priceDriftThresholdPct;
  const hasInvoicePriceDrift =
    Math.abs(invoicePriceDrift.deltaPct ?? 0) >
    buyExecutionConfig.priceDriftThresholdPct;
  const hasPriceDrift = hasOrderPriceDrift || hasInvoicePriceDrift;
  const hasCurrencyMismatch =
    Boolean(quotedCurrencyCode) &&
    ((Boolean(orderedCurrencyCode) &&
      orderedCurrencyCode !== quotedCurrencyCode) ||
      (Boolean(invoicedCurrencyCode) &&
        invoicedCurrencyCode !== quotedCurrencyCode));
  const hasQuantityDriftFlag = hasQuantityDrift(
    buyDecision.quotedMinimumOrderQuantity ?? null,
    execution.receivedQuantity ?? execution.orderedQuantity ?? null,
  );
  const expectedAvailability = normalizeAvailabilityExpectation(
    buyDecision.quotedAvailability,
  );
  const hasAvailabilityDrift =
    expectedAvailability !== null &&
    execution.confirmedAvailability !== null &&
    execution.confirmedAvailability !== expectedAvailability;
  const hasComparableValues =
    orderPriceDrift.delta !== null ||
    invoicePriceDrift.delta !== null ||
    quantityVariance !== null ||
    hasCurrencyMismatch ||
    hasAvailabilityDrift;

  const reconciliationStatus: BuyExecutionReconciliationStatus =
    !hasComparableValues
      ? 'NOT_RECONCILED'
      : hasCurrencyMismatch
        ? 'CURRENCY_MISMATCH'
        : hasPriceDrift && hasQuantityDriftFlag
          ? 'REQUIRES_REVIEW'
          : hasAvailabilityDrift
            ? 'REQUIRES_REVIEW'
            : hasPriceDrift
              ? 'PRICE_DRIFT'
              : hasQuantityDriftFlag
                ? 'QUANTITY_DRIFT'
                : 'MATCHED';

  return {
    unitPriceDelta: invoicePriceDrift.delta ?? orderPriceDrift.delta,
    unitPriceDeltaPct: invoicePriceDrift.deltaPct ?? orderPriceDrift.deltaPct,
    quoteToOrderPriceDrift: orderPriceDrift.delta,
    quoteToOrderPriceDriftPct: orderPriceDrift.deltaPct,
    quoteToInvoicePriceDrift: invoicePriceDrift.delta,
    quoteToInvoicePriceDriftPct: invoicePriceDrift.deltaPct,
    quantityVariance,
    hasPriceDrift,
    hasQuantityDrift: hasQuantityDriftFlag,
    hasCurrencyMismatch,
    hasAvailabilityDrift,
    reconciliationStatus,
  };
}

export function summarizeBuyExecution(
  buyDecision: BuyDecisionExecutionSnapshot,
  execution: BuyExecutionRecord | null,
): BuyExecutionSummary {
  const fallbackReconciliation: BuyExecutionReconciliation = {
    unitPriceDelta: null,
    unitPriceDeltaPct: null,
    quoteToOrderPriceDrift: null,
    quoteToOrderPriceDriftPct: null,
    quoteToInvoicePriceDrift: null,
    quoteToInvoicePriceDriftPct: null,
    quantityVariance: null,
    hasPriceDrift: false,
    hasQuantityDrift: false,
    hasCurrencyMismatch: false,
    hasAvailabilityDrift: false,
    reconciliationStatus: 'NOT_RECONCILED',
  };

  const reconciliation = execution
    ? calculateBuyExecutionReconciliation(buyDecision, execution)
    : fallbackReconciliation;
  const hasCommercialDrift =
    reconciliation.hasPriceDrift ||
    reconciliation.hasQuantityDrift ||
    reconciliation.hasCurrencyMismatch ||
    reconciliation.hasAvailabilityDrift;
  const recommendedNextAction: BuyExecutionSummary['recommendedNextAction'] =
    buyDecision.supplierQualificationStatus === 'BLOCKED' ||
    buyDecision.supplierQualificationStatus === 'RESTRICTED'
      ? 'restrict supplier'
      : hasCommercialDrift
        ? 'investigate drift'
        : !execution || execution.fulfillmentStatus === 'NOT_STARTED'
          ? 'place order'
          : execution.fulfillmentStatus === 'ORDER_PLACED'
            ? 'confirm order'
            : execution.fulfillmentStatus === 'ORDER_CONFIRMED'
              ? 'record received quantity'
              : execution.fulfillmentStatus === 'PARTIALLY_RECEIVED'
                ? 'record received quantity'
                : execution.fulfillmentStatus === 'RECEIVED' &&
                    (!execution.invoiceReference ||
                      !execution.invoicedAt ||
                      toNumber(execution.invoicedUnitPrice) === null)
                  ? 'record invoice'
                  : 'monitor';

  return {
    hasExecution: Boolean(execution),
    hasCommercialDrift,
    fulfillmentStatus: execution?.fulfillmentStatus ?? null,
    recommendedNextAction,
    ...reconciliation,
  };
}

function buildBuyDecisionUpdateFromExecution(
  buyDecision: BuyDecisionExecutionSnapshot,
  execution: BuyExecutionRecord,
): Partial<BuyDecisionExecutionSnapshot> {
  return {
    supplierId: execution.supplierId ?? buyDecision.supplierId,
    productId: execution.productId ?? buyDecision.productId,
    orderStatus: mapFulfillmentStatusToOrderStatus(execution.fulfillmentStatus),
    orderedAt: execution.orderPlacedAt ?? buyDecision.orderedAt,
    externalOrderReference:
      execution.externalOrderReference ??
      buyDecision.externalOrderReference ??
      null,
  };
}

async function logExecutionEvent(
  repository: Pick<BuyExecutionRepository, 'createEvent'>,
  buyExecutionId: string,
  actionType: BuyExecutionActionType,
  previousFulfillmentStatus: BuyExecutionFulfillmentStatus | null,
  newFulfillmentStatus: BuyExecutionFulfillmentStatus | null,
  previousReconciliationStatus: BuyExecutionReconciliationStatus | null,
  newReconciliationStatus: BuyExecutionReconciliationStatus | null,
  actor: { actorType: string; actorIdentifier: string | null },
  note?: string | null,
  metadata?: unknown,
): Promise<void> {
  await repository.createEvent({
    buyExecutionId,
    actionType,
    previousFulfillmentStatus,
    newFulfillmentStatus,
    previousReconciliationStatus,
    newReconciliationStatus,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note: note?.trim() || null,
    metadata: buildCommercialAuditMetadata(
      {
        entityType: 'BUY_EXECUTION',
        entityId: buyExecutionId,
        action: actionType,
        fulfillmentStatus: {
          previous: previousFulfillmentStatus,
          next: newFulfillmentStatus,
        },
        reconciliationStatus: {
          previous: previousReconciliationStatus,
          next: newReconciliationStatus,
        },
        changedFields:
          metadata &&
          typeof metadata === 'object' &&
          !Array.isArray(metadata) &&
          Array.isArray((metadata as { changedFields?: unknown }).changedFields)
            ? (metadata as { changedFields: string[] }).changedFields
            : undefined,
      },
      toJsonSafeAuditValue(metadata),
    ),
  });
}

export async function upsertExecutionForBuyDecision(
  repository: Pick<
    BuyExecutionRepository,
    'findByBuyDecisionId' | 'create' | 'update' | 'createEvent'
  >,
  buyDecision: BuyDecisionExecutionSnapshot,
  input: BuyExecutionUpdateInput,
): Promise<BuyExecutionRecord> {
  const actor = normalizeActor(input);
  const existing = await repository.findByBuyDecisionId(buyDecision.id);
  assertBuyDecisionApprovedForExecution({
    buyDecision,
    latestAppliedCorrection: latestAppliedCorrection(buyDecision),
  });

  const orderedQuantity =
    input.orderedQuantity === undefined
      ? (existing?.orderedQuantity ?? null)
      : input.orderedQuantity;
  const orderedUnitPrice =
    input.orderedUnitPrice === undefined
      ? (existing?.orderedUnitPrice ?? null)
      : input.orderedUnitPrice;
  const orderedCurrencyCode =
    input.orderedCurrencyCode === undefined
      ? (existing?.orderedCurrencyCode ??
        buyDecision.quotedCurrencyCode ??
        null)
      : normalizeCurrencyCode(input.orderedCurrencyCode);
  const orderedMinimumOrderQuantity =
    input.orderedMinimumOrderQuantity === undefined
      ? (existing?.orderedMinimumOrderQuantity ??
        buyDecision.quotedMinimumOrderQuantity ??
        null)
      : input.orderedMinimumOrderQuantity;
  const confirmedAvailability =
    input.confirmedAvailability === undefined
      ? (existing?.confirmedAvailability ?? null)
      : input.confirmedAvailability;
  const externalOrderReference =
    input.externalOrderReference === undefined
      ? (existing?.externalOrderReference ??
        buyDecision.externalOrderReference ??
        null)
      : input.externalOrderReference?.trim() || null;
  const orderPlacedAt =
    input.orderPlacedAt === undefined
      ? (existing?.orderPlacedAt ?? buyDecision.orderedAt ?? null)
      : input.orderPlacedAt;
  const orderConfirmedAt =
    input.orderConfirmedAt === undefined
      ? (existing?.orderConfirmedAt ?? null)
      : input.orderConfirmedAt;
  const expectedDeliveryDate =
    input.expectedDeliveryDate === undefined
      ? (existing?.expectedDeliveryDate ?? null)
      : input.expectedDeliveryDate;
  const receivedQuantity =
    input.receivedQuantity === undefined
      ? (existing?.receivedQuantity ?? null)
      : input.receivedQuantity;
  const receivedAt =
    input.receivedAt === undefined
      ? (existing?.receivedAt ?? null)
      : input.receivedAt;
  const invoicedUnitPrice =
    input.invoicedUnitPrice === undefined
      ? (existing?.invoicedUnitPrice ?? null)
      : input.invoicedUnitPrice;
  const invoicedCurrencyCode =
    input.invoicedCurrencyCode === undefined
      ? (existing?.invoicedCurrencyCode ?? orderedCurrencyCode)
      : normalizeCurrencyCode(input.invoicedCurrencyCode);
  const invoiceReference =
    input.invoiceReference === undefined
      ? (existing?.invoiceReference ?? null)
      : input.invoiceReference?.trim() || null;
  const invoicedAt =
    input.invoicedAt === undefined
      ? (existing?.invoicedAt ?? null)
      : input.invoicedAt;
  const notes =
    input.notes === undefined
      ? (existing?.notes ?? null)
      : input.notes?.trim() || null;
  const metadata =
    input.metadata === undefined
      ? (existing?.metadata ?? null)
      : input.metadata;
  const fulfillmentStatus = deriveFulfillmentStatus(
    existing,
    input,
    orderedQuantity,
    receivedQuantity,
  );
  const reconciliation = calculateBuyExecutionReconciliation(buyDecision, {
    orderedQuantity,
    orderedUnitPrice,
    orderedCurrencyCode,
    orderedMinimumOrderQuantity,
    confirmedAvailability,
    receivedQuantity,
    invoicedUnitPrice,
    invoicedCurrencyCode,
  });
  const nextData = {
    buyDecisionId: buyDecision.id,
    supplierId: buyDecision.supplierId,
    productId: buyDecision.productId,
    orderedQuantity,
    orderedUnitPrice,
    orderedCurrencyCode,
    orderedMinimumOrderQuantity,
    confirmedAvailability,
    externalOrderReference,
    orderPlacedAt,
    orderConfirmedAt,
    expectedDeliveryDate,
    receivedQuantity,
    receivedAt,
    invoicedUnitPrice,
    invoicedCurrencyCode,
    invoiceReference,
    invoicedAt,
    fulfillmentStatus,
    reconciliationStatus: reconciliation.reconciliationStatus,
    hasPriceDrift: reconciliation.hasPriceDrift,
    hasQuantityDrift: reconciliation.hasQuantityDrift,
    hasCurrencyMismatch: reconciliation.hasCurrencyMismatch,
    hasAvailabilityDrift: reconciliation.hasAvailabilityDrift,
    notes,
    metadata,
  };

  if (!existing) {
    const created = await repository.create(nextData);
    await logExecutionEvent(
      repository,
      created.id,
      buildEventAction(null, created, input, Object.keys(nextData)),
      null,
      created.fulfillmentStatus,
      null,
      created.reconciliationStatus,
      actor,
      input.note ?? notes,
      {
        orderedQuantity: created.orderedQuantity,
        orderedUnitPrice: created.orderedUnitPrice,
        receivedQuantity: created.receivedQuantity,
        invoicedUnitPrice: created.invoicedUnitPrice,
        reconciliation,
      },
    );

    return created;
  }

  const changedFields = Object.entries(nextData)
    .filter(([field, value]) => {
      const previousValue = existing[field as keyof typeof nextData];

      if (field.endsWith('At')) {
        return !datesEqual(
          previousValue as Date | null | undefined,
          value as Date | null | undefined,
        );
      }

      if (typeof value === 'string' || value === null) {
        return (previousValue as string | null) !== value;
      }

      if (typeof value === 'boolean') {
        return previousValue !== value;
      }

      if (typeof value === 'object') {
        return !valuesEqual(previousValue, value);
      }

      return previousValue !== value;
    })
    .map(([field]) => field);

  assertOrderPlacementIsIdempotent({
    existingExecution: existing,
    nextFulfillmentStatus: fulfillmentStatus,
    changedFields,
    requestedOrderPlacement:
      input.fulfillmentStatus === 'ORDER_PLACED' ||
      input.orderPlacedAt !== undefined,
  });

  if (changedFields.length === 0 && !input.note?.trim()) {
    return existing;
  }

  const updated = await repository.update(existing.id, nextData);
  await logExecutionEvent(
    repository,
    updated.id,
    buildEventAction(existing, updated, input, changedFields),
    existing.fulfillmentStatus,
    updated.fulfillmentStatus,
    existing.reconciliationStatus,
    updated.reconciliationStatus,
    actor,
    input.note ?? (changedFields.includes('notes') ? updated.notes : null),
    {
      changedFields,
      reconciliation,
    },
  );

  return updated;
}

export function createBuyExecutionRepository(
  client: typeof db = db,
  inTransaction = false,
): BuyExecutionRepository {
  return {
    transaction: async (callback) => {
      if (inTransaction) {
        return callback(createBuyExecutionRepository(client, true));
      }

      return db.$transaction(async (tx) =>
        callback(createBuyExecutionRepository(tx as never, true)),
      );
    },
    findById: async (buyExecutionId) =>
      client.buyExecution.findUnique({
        where: { id: buyExecutionId },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          buyDecision: true,
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyExecutionRecord | null>,
    findByBuyDecisionId: async (buyDecisionId) =>
      client.buyExecution.findUnique({
        where: { buyDecisionId },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          buyDecision: true,
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyExecutionRecord | null>,
    create: async (data) =>
      client.buyExecution.create({
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          buyDecision: true,
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyExecutionRecord>,
    update: async (buyExecutionId, data) =>
      client.buyExecution.update({
        where: { id: buyExecutionId },
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          buyDecision: true,
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyExecutionRecord>,
    createEvent: async (data) =>
      client.buyExecutionEvent.create({
        data: data as never,
      }) as Promise<BuyExecutionEventRecord>,
    list: async (filters) => {
      const where: Record<string, unknown> = {};

      if (filters.buyDecisionId) {
        where.buyDecisionId = filters.buyDecisionId;
      }
      if (filters.supplierId) {
        where.supplierId = filters.supplierId;
      }
      if (filters.fulfillmentStatus) {
        where.fulfillmentStatus = filters.fulfillmentStatus;
      }
      if (filters.reconciliationStatus) {
        where.reconciliationStatus = filters.reconciliationStatus;
      }
      if (filters.hasDrift === true) {
        where.OR = [
          { hasPriceDrift: true },
          { hasQuantityDrift: true },
          { hasCurrencyMismatch: true },
          { hasAvailabilityDrift: true },
        ];
      }
      if (filters.hasDrift === false) {
        where.AND = [
          { hasPriceDrift: false },
          { hasQuantityDrift: false },
          { hasCurrencyMismatch: false },
          { hasAvailabilityDrift: false },
        ];
      }

      return (await client.buyExecution.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          buyDecision: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] as never,
        take: filters.take ?? 100,
      })) as BuyExecutionRecord[];
    },
    findBuyDecisionById: async (buyDecisionId) =>
      client.buyDecision.findUnique({
        where: { id: buyDecisionId },
        include: {
          emailDerivedOffer: {
            select: {
              offerCorrections: {
                where: { correctionStatus: 'APPLIED' },
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      }) as Promise<BuyDecisionExecutionSnapshot | null>,
    updateBuyDecision: async (buyDecisionId, data) =>
      client.buyDecision.update({
        where: { id: buyDecisionId },
        data: data as never,
      }) as Promise<BuyDecisionExecutionSnapshot>,
    listActiveTradeOpportunitiesByOfferId: async (emailDerivedOfferId) =>
      client.tradeOpportunity.findMany({
        where: {
          emailDerivedOfferId,
          status: {
            in: ['OPEN', 'ON_HOLD'],
          },
        },
        include: {
          buyDecision: {
            select: {
              id: true,
              approvalStatus: true,
              orderStatus: true,
              supplierQualificationStatus: true,
              hasQualificationRisk: true,
            },
          },
          buyExecution: {
            select: {
              id: true,
              fulfillmentStatus: true,
              reconciliationStatus: true,
              hasPriceDrift: true,
              hasQuantityDrift: true,
              hasCurrencyMismatch: true,
              hasAvailabilityDrift: true,
            },
          },
        },
      }) as Promise<any[]>,
    updateTradeOpportunity: async (tradeOpportunityId, data) =>
      client.tradeOpportunity.update({
        where: { id: tradeOpportunityId },
        data: data as never,
      }) as Promise<any>,
    createTradeOpportunityEvent: async (data) =>
      client.tradeOpportunityEvent.create({
        data: data as never,
      }) as Promise<any>,
  };
}

function enrichExecution(
  execution: BuyExecutionRecord,
): BuyExecutionRecord & { summary: BuyExecutionSummary } {
  return {
    ...execution,
    summary: execution.buyDecision
      ? summarizeBuyExecution(execution.buyDecision, execution)
      : {
          hasExecution: true,
          hasCommercialDrift: Boolean(
            execution.hasPriceDrift ||
            execution.hasQuantityDrift ||
            execution.hasCurrencyMismatch ||
            execution.hasAvailabilityDrift,
          ),
          fulfillmentStatus: execution.fulfillmentStatus,
          recommendedNextAction: 'monitor',
          unitPriceDelta: null,
          unitPriceDeltaPct: null,
          quoteToOrderPriceDrift: null,
          quoteToOrderPriceDriftPct: null,
          quoteToInvoicePriceDrift: null,
          quoteToInvoicePriceDriftPct: null,
          quantityVariance: null,
          hasPriceDrift: execution.hasPriceDrift,
          hasQuantityDrift: execution.hasQuantityDrift,
          hasCurrencyMismatch: execution.hasCurrencyMismatch,
          hasAvailabilityDrift: execution.hasAvailabilityDrift,
          reconciliationStatus: execution.reconciliationStatus,
        },
  };
}

export function createBuyExecutionService(
  overrides?: Partial<BuyExecutionRepository>,
) {
  const repository: BuyExecutionRepository = {
    ...createBuyExecutionRepository(),
    ...overrides,
  };

  return {
    async getBuyExecution(buyExecutionId: string) {
      const item = await repository.findById(buyExecutionId);
      return item ? enrichExecution(item) : null;
    },

    async listBuyExecutions(filters: BuyExecutionListFilters = {}) {
      const items = await repository.list(filters);
      return items.map(enrichExecution);
    },

    async updateBuyExecution(
      buyExecutionId: string,
      input: BuyExecutionUpdateInput,
    ) {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findById(buyExecutionId);
        if (!existing) {
          throw new Error('Buy execution not found.');
        }

        const buyDecision = await txRepository.findBuyDecisionById(
          existing.buyDecisionId,
        );
        if (!buyDecision) {
          throw new Error('Linked buy decision not found.');
        }

        const updatedExecution = await upsertExecutionForBuyDecision(
          txRepository,
          buyDecision,
          input,
        );
        const buyDecisionPatch = buildBuyDecisionUpdateFromExecution(
          buyDecision,
          updatedExecution,
        );
        const shouldUpdateBuyDecision =
          buyDecision.orderStatus !== buyDecisionPatch.orderStatus ||
          buyDecision.externalOrderReference !==
            buyDecisionPatch.externalOrderReference ||
          !datesEqual(buyDecision.orderedAt, buyDecisionPatch.orderedAt);

        const updatedBuyDecision = shouldUpdateBuyDecision
          ? await txRepository.updateBuyDecision(
              buyDecision.id,
              buyDecisionPatch,
            )
          : buyDecision;

        await syncTradeOpportunityCommercialState(
          {
            listActiveByOfferId:
              txRepository.listActiveTradeOpportunitiesByOfferId,
            updateTradeOpportunity: txRepository.updateTradeOpportunity,
            createTradeOpportunityEvent:
              txRepository.createTradeOpportunityEvent,
          },
          {
            emailDerivedOfferId: updatedBuyDecision.emailDerivedOfferId,
            buyDecision: updatedBuyDecision,
            buyExecution: updatedExecution,
            actor: {
              actorType: input.actorType?.trim() || 'SYSTEM',
              actorIdentifier: input.actorIdentifier?.trim() || null,
            },
            note: input.note ?? null,
          },
        );

        return enrichExecution({
          ...updatedExecution,
          buyDecision: updatedBuyDecision,
        });
      });
    },
  };
}

export const buyExecutionService = createBuyExecutionService();
