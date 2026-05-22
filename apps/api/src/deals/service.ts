import { createHash } from 'node:crypto';

import {
  automationService,
  type AutomationReadinessOverview,
  type OfferFeedbackSummary,
  recordOperatorValidationFeedbackWithRepository,
  type OperatorValidationFeedbackCreateInput,
  type TradeFeedbackSummary,
} from '../automation/service';
import { offerCorrectionService } from '../corrections/service';
import { db } from '../lib/db';

export type TradeOpportunityStatus =
  | 'OPEN'
  | 'ON_HOLD'
  | 'DROPPED'
  | 'WON'
  | 'LOST';

export type TradeOpportunityStage =
  | 'NEW'
  | 'REVIEW'
  | 'READY_FOR_SUPPLIER_OUTREACH'
  | 'READY_FOR_BUY'
  | 'BUY_APPROVED'
  | 'BUY_ORDERED'
  | 'READY_FOR_BUYER_OUTREACH'
  | 'BUYER_CONTACTED'
  | 'NEGOTIATING'
  | 'DEAL_CONFIRMED'
  | 'CLOSED';

export type TradeOpportunitySourceType =
  | 'EMAIL_DERIVED_OFFER'
  | 'WORKFLOW_ITEM'
  | 'BUY_DECISION'
  | 'OPERATOR_CREATED';

export type TradeOpportunityActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'STAGE_CHANGED'
  | 'STATUS_CHANGED'
  | 'SUPPLIER_OUTREACH_DRAFTED'
  | 'BUYER_OUTREACH_DRAFTED'
  | 'BUY_APPROVAL_LINKED'
  | 'BUY_ORDER_LINKED'
  | 'MARKED_NEGOTIATING'
  | 'WON'
  | 'LOST'
  | 'DROPPED'
  | 'NOTE_ADDED';

export type TradeMessageDraftDirection =
  | 'TO_SUPPLIER'
  | 'TO_BUYER'
  | 'INTERNAL';

export type TradeMessageDraftStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT'
  | 'CANCELLED';

export type TradeMessagePurpose =
  | 'INITIAL_BUYER_OFFER'
  | 'INITIAL_SUPPLIER_ENQUIRY'
  | 'PRICE_CONFIRMATION'
  | 'AVAILABILITY_CHECK'
  | 'NEGOTIATION_REPLY'
  | 'INTERNAL_SUMMARY';

export type SupplierQualificationStatus =
  | 'UNKNOWN'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'RESTRICTED'
  | 'BLOCKED';

export type TradeOpportunityActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type TradeOpportunityRecord = {
  id: string;
  status: TradeOpportunityStatus;
  stage: TradeOpportunityStage;
  sourceType: TradeOpportunitySourceType;
  emailDerivedOfferId: string | null;
  offerWorkflowItemId: string | null;
  inboundEmailId: string | null;
  buyDecisionId: string | null;
  buyExecutionId: string | null;
  supplierId: string | null;
  productId: string | null;
  ownerUserId: string | null;
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  sourceSupplierNameSnapshot: string | null;
  targetBuyerNameSnapshot: string | null;
  targetBuyerCompanySnapshot: string | null;
  supplierQualificationStatusSnapshot: SupplierQualificationStatus;
  quotedBuyUnitPrice: unknown;
  quotedBuyCurrencyCode: string | null;
  quotedBuyMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  targetSellUnitPrice: unknown;
  targetSellCurrencyCode: string | null;
  minimumMarginAmount: unknown;
  minimumMarginPct: unknown;
  estimatedMarginAmount: unknown;
  estimatedMarginPct: unknown;
  quantityTarget: number | null;
  rationale: string | null;
  riskFlags: unknown;
  hasQualificationBlock: boolean;
  isMarginFloorMet: boolean;
  isActionable: boolean;
  hasMessagingPolicyViolations: boolean;
  messagingPolicyViolationCount: number;
  ownerLabel: string | null;
  createdByType: string;
  createdByIdentifier: string | null;
  closeReason: string | null;
  metadata: unknown;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messagingPolicy?: TradeOpportunityMessagingPolicyRecord | null;
  drafts?: TradeMessageDraftRecord[];
  events?: TradeOpportunityEventRecord[];
  supplier?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
  } | null;
  buyDecision?: {
    id: string;
    approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    orderStatus:
      | 'NOT_ORDERED'
      | 'ORDERED'
      | 'PARTIALLY_FULFILLED'
      | 'FULFILLED'
      | 'CANCELLED';
    supplierQualificationStatus: SupplierQualificationStatus;
    hasQualificationRisk: boolean;
  } | null;
  buyExecution?: {
    id: string;
    fulfillmentStatus:
      | 'NOT_STARTED'
      | 'ORDER_PLACED'
      | 'ORDER_CONFIRMED'
      | 'PARTIALLY_RECEIVED'
      | 'RECEIVED'
      | 'CANCELLED';
    reconciliationStatus:
      | 'NOT_RECONCILED'
      | 'MATCHED'
      | 'PRICE_DRIFT'
      | 'QUANTITY_DRIFT'
      | 'CURRENCY_MISMATCH'
      | 'REQUIRES_REVIEW';
    hasPriceDrift: boolean;
    hasQuantityDrift: boolean;
    hasCurrencyMismatch: boolean;
    hasAvailabilityDrift: boolean;
  } | null;
};

export type TradeOpportunityEventRecord = {
  id: string;
  tradeOpportunityId: string;
  actionType: TradeOpportunityActionType;
  previousStatus: TradeOpportunityStatus | null;
  newStatus: TradeOpportunityStatus | null;
  previousStage: TradeOpportunityStage | null;
  newStage: TradeOpportunityStage | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type TradeOpportunityMessagingPolicyRecord = {
  id: string;
  tradeOpportunityId: string;
  allowSupplierOutreachDrafts: boolean;
  allowBuyerOutreachDrafts: boolean;
  blockSupplierIdentityLeak: boolean;
  blockBuyerIdentityLeak: boolean;
  requireHumanApprovalBeforeSend: boolean;
  allowedMessageTypes: unknown;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TradeMessageDraftRecord = {
  id: string;
  tradeOpportunityId: string;
  direction: TradeMessageDraftDirection;
  status: TradeMessageDraftStatus;
  audienceLabel: string | null;
  recipientNameSnapshot: string | null;
  recipientCompanySnapshot: string | null;
  subject: string;
  body: string;
  messagePurpose: TradeMessagePurpose;
  policyFlags: unknown;
  policyViolations: unknown;
  contentHash: string | null;
  containsSupplierIdentity: boolean;
  containsBuyerIdentity: boolean;
  containsExternalContactDetails: boolean;
  containsForwardedContent: boolean;
  approvedByType: string | null;
  approvedByIdentifier: string | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type EmailDerivedOfferSource = {
  id: string;
  inboundEmailId: string;
  status: 'STAGED' | 'AUTO_PROMOTED' | 'REVIEW_REQUIRED' | 'REJECTED';
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  supplierCandidate: string | null;
  priceCandidate: unknown;
  currencyCandidate: string | null;
  minimumOrderQuantityCandidate: number | null;
  availabilityCandidate: string | null;
  aiAssisted: boolean;
  fieldConfidence: number | null;
  metadata: unknown;
  resolutionCandidates?: Array<{
    entityType: 'PRODUCT' | 'SUPPLIER' | 'MANUFACTURER';
    candidateId: string | null;
    candidateName: string;
    selected: boolean;
  }>;
  workflowItem?: {
    id: string;
    status: string;
    supplierQualificationStatus: SupplierQualificationStatus;
    qualificationRiskNote: string | null;
    ownerLabel?: string | null;
  } | null;
  inboundEmail?: {
    id: string;
    subject: string | null;
    fromEmail: string;
  } | null;
};

type WorkflowSource = {
  id: string;
  emailDerivedOfferId: string;
  inboundEmailId: string | null;
  status: string;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  supplierQualificationStatus: SupplierQualificationStatus;
  qualificationRiskNote: string | null;
  emailDerivedOffer?: EmailDerivedOfferSource | null;
  buyDecision?: {
    id: string;
  } | null;
};

type BuyDecisionSource = {
  id: string;
  emailDerivedOfferId: string;
  offerWorkflowItemId: string | null;
  inboundEmailId: string | null;
  supplierId: string | null;
  productId: string | null;
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  quotedUnitPrice: unknown;
  quotedCurrencyCode: string | null;
  quotedMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  orderStatus:
    | 'NOT_ORDERED'
    | 'ORDERED'
    | 'PARTIALLY_FULFILLED'
    | 'FULFILLED'
    | 'CANCELLED';
  supplierQualificationStatus: SupplierQualificationStatus;
  hasQualificationRisk: boolean;
  qualificationRiskNote: string | null;
  execution?: BuyExecutionSource | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
};

type BuyExecutionSource = {
  id: string;
  buyDecisionId: string;
  supplierId: string | null;
  productId: string | null;
  fulfillmentStatus:
    | 'NOT_STARTED'
    | 'ORDER_PLACED'
    | 'ORDER_CONFIRMED'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CANCELLED';
  reconciliationStatus:
    | 'NOT_RECONCILED'
    | 'MATCHED'
    | 'PRICE_DRIFT'
    | 'QUANTITY_DRIFT'
    | 'CURRENCY_MISMATCH'
    | 'REQUIRES_REVIEW';
  hasPriceDrift: boolean;
  hasQuantityDrift: boolean;
  hasCurrencyMismatch: boolean;
  hasAvailabilityDrift: boolean;
};

export type TradeOpportunityCreateInput = TradeOpportunityActor & {
  sourceType?: TradeOpportunitySourceType;
  emailDerivedOfferId?: string | null;
  offerWorkflowItemId?: string | null;
  buyDecisionId?: string | null;
  buyExecutionId?: string | null;
  supplierId?: string | null;
  productId?: string | null;
  rawProductText?: string | null;
  normalizedProductNameCandidate?: string | null;
  manufacturerCandidate?: string | null;
  sourceSupplierNameSnapshot?: string | null;
  targetBuyerNameSnapshot?: string | null;
  targetBuyerCompanySnapshot?: string | null;
  quotedBuyUnitPrice?: unknown;
  quotedBuyCurrencyCode?: string | null;
  quotedBuyMinimumOrderQuantity?: number | null;
  quotedAvailability?: string | null;
  targetSellUnitPrice?: unknown;
  targetSellCurrencyCode?: string | null;
  minimumMarginAmount?: unknown;
  minimumMarginPct?: unknown;
  quantityTarget?: number | null;
  rationale?: string | null;
  ownerUserId?: string | null;
  ownerLabel?: string | null;
  allowDuplicateActiveDeal?: boolean;
  metadata?: unknown;
};

export type TradeOpportunityUpdateInput = TradeOpportunityActor & {
  status?: TradeOpportunityStatus;
  stage?: TradeOpportunityStage;
  targetBuyerNameSnapshot?: string | null;
  targetBuyerCompanySnapshot?: string | null;
  targetSellUnitPrice?: unknown;
  targetSellCurrencyCode?: string | null;
  minimumMarginAmount?: unknown;
  minimumMarginPct?: unknown;
  quantityTarget?: number | null;
  rationale?: string | null;
  ownerUserId?: string | null;
  ownerLabel?: string | null;
  closeReason?: string | null;
  note?: string | null;
  metadata?: unknown;
  policy?: Partial<TradeOpportunityMessagingPolicyRecord>;
};

export type TradeMessageDraftGenerateInput = TradeOpportunityActor & {
  direction: TradeMessageDraftDirection;
  messagePurpose: TradeMessagePurpose;
  audienceLabel?: string | null;
  recipientNameSnapshot?: string | null;
  recipientCompanySnapshot?: string | null;
  subject?: string | null;
  body?: string | null;
  note?: string | null;
  metadata?: unknown;
};

export type TradeMessageDraftUpdateInput = TradeOpportunityActor & {
  action?: 'UPDATE' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'MARK_SENT';
  subject?: string | null;
  body?: string | null;
  note?: string | null;
  metadata?: unknown;
  feedback?: Omit<
    OperatorValidationFeedbackCreateInput,
    'tradeMessageDraftId' | 'tradeOpportunityId'
  > | null;
};

export type TradeOpportunityListFilters = {
  status?: TradeOpportunityStatus | null;
  stage?: TradeOpportunityStage | null;
  supplierId?: string | null;
  productId?: string | null;
  emailDerivedOfferId?: string | null;
  hasMessagingPolicyViolations?: boolean | null;
  take?: number;
};

export type TradeOpportunitySummary = {
  riskFlags: string[];
  estimatedMarginAmount: number | null;
  estimatedMarginPct: number | null;
  marginSpreadAmount: number | null;
  hasMessagingPolicyViolations: boolean;
  hasBuyDecision: boolean;
  hasBuyExecution: boolean;
  hasPriceDrift: boolean;
  hasOperatorFeedback: boolean;
  hasOfferCorrection: boolean;
  sourceReliabilityTier: string | null;
  sourceReliabilityScore: number | null;
  hasLearnedSupplierSuggestion: boolean;
  learnedSupplierName: string | null;
  hasLearnedProductSuggestion: boolean;
  learnedProductName: string | null;
  hasLearnedManufacturerSuggestion: boolean;
  learnedManufacturer: string | null;
  learningRecommendedAction:
    | 'apply learned mapping'
    | 'review manually'
    | 'trust but verify'
    | 'downgrade source'
    | 'qualify supplier'
    | 'create alias';
  extractionFeedbackVerdict: string | null;
  supplierResolutionFeedbackVerdict: string | null;
  dealFeedbackVerdict: string | null;
  latestDraftFeedbackVerdict: string | null;
  automationMode: string | null;
  automationBlockedReasons: string[];
  automationRecommendedAction:
    | 'review more samples'
    | 'fix supplier mapping'
    | 'improve draft policy cleanliness'
    | 'remain drafts-only'
    | 'internal signals only'
    | 'monitor';
  recommendedNextStep:
    | 'qualify supplier'
    | 'approve to buy'
    | 'generate buyer draft'
    | 'review buyer draft'
    | 'review supplier draft'
    | 'investigate price drift'
    | 'drop deal'
    | 'monitor';
};

export type EnrichedTradeOpportunityRecord = TradeOpportunityRecord & {
  summary: TradeOpportunitySummary;
};

type TradeOpportunityDependencies = {
  getOfferFeedbackSummariesForOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<Record<string, OfferFeedbackSummary>>;
  getOfferLearningSummariesForOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<
    Record<
      string,
      Awaited<
        ReturnType<
          typeof offerCorrectionService.getOfferLearningSummariesForOfferIds
        >
      >[string]
    >
  >;
  getTradeFeedbackSummariesForTradeOpportunityIds: (
    tradeOpportunityIds: string[],
  ) => Promise<Record<string, TradeFeedbackSummary>>;
  getAutomationReadinessOverview: () => Promise<AutomationReadinessOverview>;
};

type RecentProductDemandRecord = {
  customerId: string;
  customerName: string;
  quantity: number;
  unitPrice: unknown;
  totalRevenue: unknown;
  saleDate: Date;
  currencyCode: string;
};

type TradeOpportunityBuyDecisionLink = {
  id: string;
  emailDerivedOfferId: string;
  offerWorkflowItemId?: string | null;
  inboundEmailId?: string | null;
  supplierId: string | null;
  productId: string | null;
  rawProductText?: string | null;
  normalizedProductNameCandidate?: string | null;
  manufacturerCandidate?: string | null;
  quotedUnitPrice: unknown;
  quotedCurrencyCode: string | null;
  quotedMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  orderStatus:
    | 'NOT_ORDERED'
    | 'ORDERED'
    | 'PARTIALLY_FULFILLED'
    | 'FULFILLED'
    | 'CANCELLED';
  supplierQualificationStatus: SupplierQualificationStatus;
  hasQualificationRisk: boolean;
  execution?: {
    id: string;
  } | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
};

export type TradeOpportunitySyncInput = {
  emailDerivedOfferId: string | null;
  buyDecision?: TradeOpportunityBuyDecisionLink | null;
  buyExecution?: BuyExecutionSource | null;
  actor?: {
    actorType: string;
    actorIdentifier: string | null;
  };
  note?: string | null;
};

export type TradeOpportunitySyncRepository = {
  listActiveByOfferId: (
    emailDerivedOfferId: string,
  ) => Promise<TradeOpportunityRecord[]>;
  updateTradeOpportunity: (
    tradeOpportunityId: string,
    data: Partial<TradeOpportunityRecord>,
  ) => Promise<TradeOpportunityRecord>;
  createTradeOpportunityEvent: (
    data: Omit<TradeOpportunityEventRecord, 'id' | 'createdAt'>,
  ) => Promise<TradeOpportunityEventRecord | void>;
};

export type DemandMatchedTradeOpportunityRepository = Pick<
  TradeOpportunityRepository,
  | 'listActiveByOfferId'
  | 'create'
  | 'createPolicy'
  | 'createTradeOpportunityEvent'
> & {
  listRecentSalesByProductId: (input: {
    productId: string;
    windowStart: Date;
    currencyCode: string;
  }) => Promise<RecentProductDemandRecord[]>;
};

export type DemandMatchedTradeOpportunityOutcome =
  | 'CREATED'
  | 'EXISTING_ACTIVE'
  | 'SKIPPED_NOT_APPROVED'
  | 'SKIPPED_MISSING_CONTEXT'
  | 'SKIPPED_MISSING_PRICE'
  | 'SKIPPED_NO_RECENT_DEMAND'
  | 'SKIPPED_NON_POSITIVE_MARGIN';

export type DemandMatchedTradeOpportunityResult = {
  outcome: DemandMatchedTradeOpportunityOutcome;
  tradeOpportunity: TradeOpportunityRecord | null;
};

export type TradeOpportunityRepository = TradeOpportunitySyncRepository & {
  transaction: <T>(
    callback: (repository: TradeOpportunityRepository) => Promise<T>,
  ) => Promise<T>;
  findById: (
    tradeOpportunityId: string,
  ) => Promise<TradeOpportunityRecord | null>;
  list: (
    filters: TradeOpportunityListFilters,
  ) => Promise<TradeOpportunityRecord[]>;
  create: (data: Record<string, unknown>) => Promise<TradeOpportunityRecord>;
  update: (
    tradeOpportunityId: string,
    data: Record<string, unknown>,
  ) => Promise<TradeOpportunityRecord>;
  listEvents: (
    tradeOpportunityId: string,
  ) => Promise<TradeOpportunityEventRecord[]>;
  findPolicyByTradeOpportunityId: (
    tradeOpportunityId: string,
  ) => Promise<TradeOpportunityMessagingPolicyRecord | null>;
  createPolicy: (
    data: Record<string, unknown>,
  ) => Promise<TradeOpportunityMessagingPolicyRecord>;
  updatePolicy: (
    tradeOpportunityId: string,
    data: Record<string, unknown>,
  ) => Promise<TradeOpportunityMessagingPolicyRecord>;
  listDrafts: (
    tradeOpportunityId: string,
  ) => Promise<TradeMessageDraftRecord[]>;
  findDraftById: (draftId: string) => Promise<TradeMessageDraftRecord | null>;
  findMatchingDraft: (
    tradeOpportunityId: string,
    contentHash: string,
    direction: TradeMessageDraftDirection,
    messagePurpose: TradeMessagePurpose,
  ) => Promise<TradeMessageDraftRecord | null>;
  createDraft: (
    data: Record<string, unknown>,
  ) => Promise<TradeMessageDraftRecord>;
  updateDraft: (
    draftId: string,
    data: Record<string, unknown>,
  ) => Promise<TradeMessageDraftRecord>;
  findRecentMatchingFeedback: Parameters<
    typeof recordOperatorValidationFeedbackWithRepository
  >[0]['findRecentMatchingFeedback'];
  createFeedback: Parameters<
    typeof recordOperatorValidationFeedbackWithRepository
  >[0]['createFeedback'];
  findTradeMessageDraftById: Parameters<
    typeof recordOperatorValidationFeedbackWithRepository
  >[0]['findTradeMessageDraftById'];
  findOfferById: (
    emailDerivedOfferId: string,
  ) => Promise<EmailDerivedOfferSource | null>;
  findWorkflowById: (workflowItemId: string) => Promise<WorkflowSource | null>;
  findBuyDecisionById: (
    buyDecisionId: string,
  ) => Promise<BuyDecisionSource | null>;
  findBuyExecutionById: (
    buyExecutionId: string,
  ) => Promise<BuyExecutionSource | null>;
  listActiveByOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<TradeOpportunityRecord[]>;
  listRecentSalesByProductId: (input: {
    productId: string;
    windowStart: Date;
    currencyCode: string;
  }) => Promise<RecentProductDemandRecord[]>;
};

const ACTIVE_TRADE_STATUSES = new Set<TradeOpportunityStatus>([
  'OPEN',
  'ON_HOLD',
]);

const STAGE_ORDER: TradeOpportunityStage[] = [
  'NEW',
  'REVIEW',
  'READY_FOR_SUPPLIER_OUTREACH',
  'READY_FOR_BUY',
  'BUY_APPROVED',
  'BUY_ORDERED',
  'READY_FOR_BUYER_OUTREACH',
  'BUYER_CONTACTED',
  'NEGOTIATING',
  'DEAL_CONFIRMED',
  'CLOSED',
];

function normalizeActor(actor?: TradeOpportunityActor): {
  actorType: string;
  actorIdentifier: string | null;
} {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null;
  return normalized || null;
}

function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  return normalizeString(value)?.toUpperCase() ?? null;
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

function round(value: number | null, precision = 4): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stageRank(stage: TradeOpportunityStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function dedupeRiskFlags(flags: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(flags.filter((flag): flag is string => Boolean(flag))),
  ).sort();
}

function marginMetrics(input: {
  quotedBuyUnitPrice: unknown;
  targetSellUnitPrice: unknown;
  minimumMarginAmount: unknown;
  minimumMarginPct: unknown;
}) {
  const quotedBuyUnitPrice = toNumber(input.quotedBuyUnitPrice);
  const targetSellUnitPrice = toNumber(input.targetSellUnitPrice);
  const minimumMarginAmount = toNumber(input.minimumMarginAmount);
  const minimumMarginPct = toNumber(input.minimumMarginPct);

  const estimatedMarginAmount =
    quotedBuyUnitPrice !== null && targetSellUnitPrice !== null
      ? round(targetSellUnitPrice - quotedBuyUnitPrice, 2)
      : null;
  const estimatedMarginPct =
    estimatedMarginAmount !== null &&
    targetSellUnitPrice &&
    targetSellUnitPrice > 0
      ? round(estimatedMarginAmount / targetSellUnitPrice, 6)
      : null;
  const amountFloorMet =
    minimumMarginAmount === null || estimatedMarginAmount === null
      ? true
      : estimatedMarginAmount >= minimumMarginAmount;
  const pctFloorMet =
    minimumMarginPct === null || estimatedMarginPct === null
      ? true
      : estimatedMarginPct >= minimumMarginPct;

  return {
    estimatedMarginAmount,
    estimatedMarginPct,
    isMarginFloorMet: amountFloorMet && pctFloorMet,
  };
}

function findSelectedCandidateName(
  candidates: EmailDerivedOfferSource['resolutionCandidates'] | undefined,
  entityType: 'SUPPLIER' | 'PRODUCT',
): { id: string | null; name: string | null } {
  const selected = candidates?.find(
    (candidate) => candidate.entityType === entityType && candidate.selected,
  );

  return {
    id: selected?.candidateId ?? null,
    name: selected?.candidateName ?? null,
  };
}

function buildRiskFlags(input: {
  supplierId: string | null;
  sourceSupplierNameSnapshot: string | null;
  supplierQualificationStatusSnapshot: SupplierQualificationStatus;
  quotedBuyUnitPrice: unknown;
  targetSellUnitPrice: unknown;
  minimumMarginAmount: unknown;
  minimumMarginPct: unknown;
  isMarginFloorMet: boolean;
  buyDecisionId: string | null;
  buyDecision?: TradeOpportunityRecord['buyDecision'] | null;
  buyExecutionId: string | null;
  buyExecution?:
    | BuyExecutionSource
    | TradeOpportunityRecord['buyExecution']
    | null;
  metadata: unknown;
}): string[] {
  const metadata =
    input.metadata &&
    typeof input.metadata === 'object' &&
    !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : null;
  const weakConfidence =
    input.quotedBuyUnitPrice === null ||
    input.quotedBuyUnitPrice === undefined ||
    metadata?.aiAssisted === true ||
    (typeof metadata?.fieldConfidence === 'number' &&
      metadata.fieldConfidence < 60);
  const hasPriceDrift = Boolean(
    input.buyExecution?.hasPriceDrift ||
    input.buyExecution?.hasQuantityDrift ||
    input.buyExecution?.hasCurrencyMismatch ||
    input.buyExecution?.hasAvailabilityDrift,
  );

  return dedupeRiskFlags([
    !input.supplierId && !input.sourceSupplierNameSnapshot
      ? 'unresolved_supplier'
      : null,
    input.supplierQualificationStatusSnapshot === 'BLOCKED'
      ? 'blocked_supplier'
      : null,
    input.supplierQualificationStatusSnapshot === 'RESTRICTED'
      ? 'restricted_supplier'
      : null,
    input.supplierQualificationStatusSnapshot === 'UNKNOWN' ||
    input.supplierQualificationStatusSnapshot === 'PENDING_REVIEW'
      ? 'unknown_supplier_qualification'
      : null,
    weakConfidence ? 'weak_buy_price_confidence' : null,
    toNumber(input.targetSellUnitPrice) === null
      ? 'no_target_sell_price'
      : null,
    !input.isMarginFloorMet ? 'margin_below_floor' : null,
    !input.buyDecisionId ||
    (input.buyDecision &&
      input.buyDecision.approvalStatus !== 'APPROVED' &&
      input.buyDecision.orderStatus === 'NOT_ORDERED')
      ? 'no_buy_approval'
      : null,
    !input.buyExecutionId ? 'no_execution' : null,
    hasPriceDrift ? 'price_drift_detected' : null,
    input.supplierQualificationStatusSnapshot !== 'APPROVED' || hasPriceDrift
      ? 'supplier_watch_or_risky'
      : null,
  ]);
}

function deriveSuggestedStage(
  tradeOpportunity: TradeOpportunityRecord,
): TradeOpportunityStage {
  if (
    tradeOpportunity.status === 'WON' ||
    tradeOpportunity.status === 'LOST' ||
    tradeOpportunity.status === 'DROPPED'
  ) {
    return 'CLOSED';
  }

  if (tradeOpportunity.buyExecutionId) {
    return 'BUY_ORDERED';
  }

  if (
    tradeOpportunity.buyDecisionId &&
    (tradeOpportunity.buyDecision?.approvalStatus === 'APPROVED' ||
      tradeOpportunity.buyDecision?.orderStatus !== 'NOT_ORDERED')
  ) {
    return 'BUY_APPROVED';
  }

  if (tradeOpportunity.supplierQualificationStatusSnapshot === 'APPROVED') {
    return 'READY_FOR_BUY';
  }

  return tradeOpportunity.offerWorkflowItemId ||
    tradeOpportunity.emailDerivedOfferId
    ? 'REVIEW'
    : 'NEW';
}

function deriveStatus(current: TradeOpportunityRecord): TradeOpportunityStatus {
  if (
    current.status === 'WON' ||
    current.status === 'LOST' ||
    current.status === 'DROPPED'
  ) {
    return current.status;
  }

  const riskFlags = Array.isArray(current.riskFlags)
    ? (current.riskFlags as string[])
    : [];
  const blockingFlags = new Set([
    'blocked_supplier',
    'restricted_supplier',
    'unknown_supplier_qualification',
    'margin_below_floor',
    'price_drift_detected',
    'unresolved_supplier',
  ]);
  const shouldHold =
    current.hasMessagingPolicyViolations ||
    riskFlags.some((flag) => blockingFlags.has(flag));

  if (shouldHold) {
    return 'ON_HOLD';
  }

  return 'OPEN';
}

function recommendedNextStep(
  tradeOpportunity: TradeOpportunityRecord,
  drafts: TradeMessageDraftRecord[],
): TradeOpportunitySummary['recommendedNextStep'] {
  const riskFlags = Array.isArray(tradeOpportunity.riskFlags)
    ? (tradeOpportunity.riskFlags as string[])
    : [];

  if (
    riskFlags.includes('blocked_supplier') ||
    riskFlags.includes('restricted_supplier') ||
    riskFlags.includes('unknown_supplier_qualification') ||
    riskFlags.includes('unresolved_supplier')
  ) {
    return 'qualify supplier';
  }

  if (riskFlags.includes('price_drift_detected')) {
    return 'investigate price drift';
  }

  if (!tradeOpportunity.buyDecisionId) {
    return 'approve to buy';
  }

  const buyerDrafts = drafts.filter(
    (draft) => draft.direction === 'TO_BUYER' && draft.status !== 'CANCELLED',
  );
  if (
    buyerDrafts.some(
      (draft) =>
        draft.status === 'DRAFT' || draft.status === 'READY_FOR_REVIEW',
    )
  ) {
    return 'review buyer draft';
  }

  if (tradeOpportunity.buyExecutionId && !buyerDrafts.length) {
    return 'generate buyer draft';
  }

  if (riskFlags.includes('margin_below_floor')) {
    return 'drop deal';
  }

  return 'monitor';
}

function summarizeTradeOpportunity(
  tradeOpportunity: TradeOpportunityRecord,
  drafts: TradeMessageDraftRecord[],
): TradeOpportunitySummary {
  const riskFlags = Array.isArray(tradeOpportunity.riskFlags)
    ? (tradeOpportunity.riskFlags as string[])
    : [];
  const estimatedMarginAmount = toNumber(
    tradeOpportunity.estimatedMarginAmount,
  );
  const estimatedMarginPct = toNumber(tradeOpportunity.estimatedMarginPct);
  const marginSpreadAmount =
    toNumber(tradeOpportunity.targetSellUnitPrice) !== null &&
    toNumber(tradeOpportunity.quotedBuyUnitPrice) !== null
      ? round(
          (toNumber(tradeOpportunity.targetSellUnitPrice) ?? 0) -
            (toNumber(tradeOpportunity.quotedBuyUnitPrice) ?? 0),
          2,
        )
      : null;

  return {
    riskFlags,
    estimatedMarginAmount,
    estimatedMarginPct,
    marginSpreadAmount,
    hasMessagingPolicyViolations: tradeOpportunity.hasMessagingPolicyViolations,
    hasBuyDecision: Boolean(tradeOpportunity.buyDecisionId),
    hasBuyExecution: Boolean(tradeOpportunity.buyExecutionId),
    hasPriceDrift: riskFlags.includes('price_drift_detected'),
    hasOperatorFeedback: false,
    hasOfferCorrection: false,
    sourceReliabilityTier: null,
    sourceReliabilityScore: null,
    hasLearnedSupplierSuggestion: false,
    learnedSupplierName: null,
    hasLearnedProductSuggestion: false,
    learnedProductName: null,
    hasLearnedManufacturerSuggestion: false,
    learnedManufacturer: null,
    learningRecommendedAction: 'review manually',
    extractionFeedbackVerdict: null,
    supplierResolutionFeedbackVerdict: null,
    dealFeedbackVerdict: null,
    latestDraftFeedbackVerdict: null,
    automationMode: null,
    automationBlockedReasons: [],
    automationRecommendedAction: 'monitor',
    recommendedNextStep: recommendedNextStep(tradeOpportunity, drafts),
  };
}

function buildDefaultPolicy(
  tradeOpportunityId: string,
): Record<string, unknown> {
  return {
    tradeOpportunityId,
    allowSupplierOutreachDrafts: true,
    allowBuyerOutreachDrafts: true,
    blockSupplierIdentityLeak: true,
    blockBuyerIdentityLeak: true,
    requireHumanApprovalBeforeSend: true,
    allowedMessageTypes: null,
    notes: null,
  };
}

const DEMAND_MATCH_WINDOW_DAYS = 90;

function startOfDemandWindow(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function buildLikelyBuyers(sales: RecentProductDemandRecord[]) {
  const grouped = new Map<
    string,
    {
      customerId: string;
      name: string;
      units: number;
      orderCount: number;
      lastSaleAt: Date;
    }
  >();

  for (const sale of sales) {
    const existing = grouped.get(sale.customerId);
    if (!existing) {
      grouped.set(sale.customerId, {
        customerId: sale.customerId,
        name: sale.customerName,
        units: sale.quantity,
        orderCount: 1,
        lastSaleAt: sale.saleDate,
      });
      continue;
    }

    existing.units += sale.quantity;
    existing.orderCount += 1;
    if (sale.saleDate > existing.lastSaleAt) {
      existing.lastSaleAt = sale.saleDate;
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => {
      if (right.units !== left.units) {
        return right.units - left.units;
      }
      if (right.orderCount !== left.orderCount) {
        return right.orderCount - left.orderCount;
      }
      return right.lastSaleAt.getTime() - left.lastSaleAt.getTime();
    })
    .slice(0, 3)
    .map((buyer) => ({
      customerId: buyer.customerId,
      name: buyer.name,
      units: buyer.units,
      orderCount: buyer.orderCount,
      lastSaleAt: buyer.lastSaleAt.toISOString(),
    }));
}

export async function createDemandMatchedTradeOpportunityFromApprovedBuyDecision(
  repository: DemandMatchedTradeOpportunityRepository,
  input: {
    buyDecision: TradeOpportunityBuyDecisionLink;
    sourceSupplierNameSnapshot?: string | null;
    actor?: TradeOpportunityActor;
    recentDemandWindowDays?: number;
  },
): Promise<DemandMatchedTradeOpportunityResult> {
  if (input.buyDecision.approvalStatus !== 'APPROVED') {
    return {
      outcome: 'SKIPPED_NOT_APPROVED',
      tradeOpportunity: null,
    };
  }

  if (!input.buyDecision.emailDerivedOfferId || !input.buyDecision.productId) {
    return {
      outcome: 'SKIPPED_MISSING_CONTEXT',
      tradeOpportunity: null,
    };
  }

  const quotedBuyUnitPrice = toNumber(input.buyDecision.quotedUnitPrice);
  const quotedBuyCurrencyCode = normalizeCurrencyCode(
    input.buyDecision.quotedCurrencyCode,
  );

  if (quotedBuyUnitPrice === null || !quotedBuyCurrencyCode) {
    return {
      outcome: 'SKIPPED_MISSING_PRICE',
      tradeOpportunity: null,
    };
  }

  const existingActive = await repository.listActiveByOfferId(
    input.buyDecision.emailDerivedOfferId,
  );
  const duplicate = existingActive.find(
    (opportunity) =>
      opportunity.buyDecisionId === input.buyDecision.id ||
      opportunity.offerWorkflowItemId ===
        input.buyDecision.offerWorkflowItemId ||
      opportunity.emailDerivedOfferId === input.buyDecision.emailDerivedOfferId,
  );

  if (duplicate) {
    return {
      outcome: 'EXISTING_ACTIVE',
      tradeOpportunity: duplicate,
    };
  }

  const actor = normalizeActor(input.actor);
  const now = new Date();
  const recentDemandWindowDays =
    input.recentDemandWindowDays ?? DEMAND_MATCH_WINDOW_DAYS;
  const windowStart = startOfDemandWindow(now, recentDemandWindowDays);
  const recentSales = await repository.listRecentSalesByProductId({
    productId: input.buyDecision.productId,
    windowStart,
    currencyCode: quotedBuyCurrencyCode,
  });

  if (recentSales.length === 0) {
    return {
      outcome: 'SKIPPED_NO_RECENT_DEMAND',
      tradeOpportunity: null,
    };
  }

  const recentUnitsSold = recentSales.reduce(
    (total, sale) => total + sale.quantity,
    0,
  );
  const recentRevenue = round(
    recentSales.reduce(
      (total, sale) => total + (toNumber(sale.totalRevenue) ?? 0),
      0,
    ),
    2,
  );
  const recentAverageSalePrice =
    recentUnitsSold > 0
      ? round((recentRevenue ?? 0) / recentUnitsSold, 2)
      : null;

  if (
    !recentUnitsSold ||
    recentAverageSalePrice === null ||
    recentAverageSalePrice <= quotedBuyUnitPrice
  ) {
    return {
      outcome: !recentUnitsSold
        ? 'SKIPPED_NO_RECENT_DEMAND'
        : 'SKIPPED_NON_POSITIVE_MARGIN',
      tradeOpportunity: null,
    };
  }

  const estimatedMarginAmount = round(
    recentAverageSalePrice - quotedBuyUnitPrice,
    2,
  );
  const estimatedMarginPct =
    estimatedMarginAmount !== null && recentAverageSalePrice > 0
      ? round(estimatedMarginAmount / recentAverageSalePrice, 6)
      : null;

  if (estimatedMarginAmount === null || estimatedMarginAmount <= 0) {
    return {
      outcome: 'SKIPPED_NON_POSITIVE_MARGIN',
      tradeOpportunity: null,
    };
  }

  const likelyBuyers = buildLikelyBuyers(recentSales);
  const baseRecord = {
    id: 'pending-trade-opportunity',
    status: 'OPEN' as const,
    stage: 'REVIEW' as const,
    sourceType: 'BUY_DECISION' as const,
    emailDerivedOfferId: input.buyDecision.emailDerivedOfferId,
    offerWorkflowItemId: input.buyDecision.offerWorkflowItemId ?? null,
    inboundEmailId: input.buyDecision.inboundEmailId ?? null,
    buyDecisionId: input.buyDecision.id,
    buyExecutionId: input.buyDecision.execution?.id ?? null,
    supplierId: input.buyDecision.supplierId,
    productId: input.buyDecision.productId,
    ownerUserId: null,
    rawProductText: input.buyDecision.rawProductText ?? null,
    normalizedProductNameCandidate:
      input.buyDecision.normalizedProductNameCandidate ?? null,
    manufacturerCandidate: input.buyDecision.manufacturerCandidate ?? null,
    sourceSupplierNameSnapshot:
      normalizeString(input.sourceSupplierNameSnapshot) ??
      normalizeString(input.buyDecision.supplier?.name ?? null),
    targetBuyerNameSnapshot: likelyBuyers[0]?.name ?? null,
    targetBuyerCompanySnapshot: null,
    supplierQualificationStatusSnapshot:
      input.buyDecision.supplierQualificationStatus,
    quotedBuyUnitPrice,
    quotedBuyCurrencyCode,
    quotedBuyMinimumOrderQuantity: input.buyDecision.quotedMinimumOrderQuantity,
    quotedAvailability: input.buyDecision.quotedAvailability,
    targetSellUnitPrice: recentAverageSalePrice,
    targetSellCurrencyCode: quotedBuyCurrencyCode,
    minimumMarginAmount: null,
    minimumMarginPct: null,
    estimatedMarginAmount,
    estimatedMarginPct,
    quantityTarget:
      input.buyDecision.quotedMinimumOrderQuantity ?? recentUnitsSold,
    rationale:
      `Approved supplier offer matched recent demand for ${recentUnitsSold} units across ${likelyBuyers.length} likely buyer${likelyBuyers.length === 1 ? '' : 's'}. ` +
      `Recent average sale price is ${quotedBuyCurrencyCode} ${recentAverageSalePrice.toFixed(2)} versus buy price ${quotedBuyCurrencyCode} ${quotedBuyUnitPrice.toFixed(2)}.`,
    riskFlags: [],
    hasQualificationBlock:
      input.buyDecision.supplierQualificationStatus === 'BLOCKED' ||
      input.buyDecision.supplierQualificationStatus === 'RESTRICTED',
    isMarginFloorMet: true,
    isActionable: true,
    hasMessagingPolicyViolations: false,
    messagingPolicyViolationCount: 0,
    ownerLabel: null,
    createdByType: actor.actorType,
    createdByIdentifier: actor.actorIdentifier,
    closeReason: null,
    metadata: {
      createdFrom: 'approved_buy_decision_demand_match',
      recentDemandWindowDays,
      recentUnitsSold,
      recentRevenue,
      recentAverageSalePrice,
      likelyBuyers,
    },
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    buyDecision: {
      id: input.buyDecision.id,
      approvalStatus: input.buyDecision.approvalStatus,
      orderStatus: input.buyDecision.orderStatus,
      supplierQualificationStatus:
        input.buyDecision.supplierQualificationStatus,
      hasQualificationRisk: input.buyDecision.hasQualificationRisk,
    },
    buyExecution: input.buyDecision.execution
      ? {
          id: input.buyDecision.execution.id,
          fulfillmentStatus: 'NOT_STARTED' as const,
          reconciliationStatus: 'NOT_RECONCILED' as const,
          hasPriceDrift: false,
          hasQuantityDrift: false,
          hasCurrencyMismatch: false,
          hasAvailabilityDrift: false,
        }
      : null,
    supplier: input.buyDecision.supplier ?? null,
  };

  const riskFlags = buildRiskFlags(baseRecord);
  const created = await repository.create({
    status: 'OPEN',
    stage: 'REVIEW',
    sourceType: 'BUY_DECISION',
    emailDerivedOfferId: input.buyDecision.emailDerivedOfferId,
    offerWorkflowItemId: input.buyDecision.offerWorkflowItemId ?? null,
    inboundEmailId: input.buyDecision.inboundEmailId ?? null,
    buyDecisionId: input.buyDecision.id,
    buyExecutionId: input.buyDecision.execution?.id ?? null,
    supplierId: input.buyDecision.supplierId,
    productId: input.buyDecision.productId,
    rawProductText: input.buyDecision.rawProductText ?? null,
    normalizedProductNameCandidate:
      input.buyDecision.normalizedProductNameCandidate ?? null,
    manufacturerCandidate: input.buyDecision.manufacturerCandidate ?? null,
    sourceSupplierNameSnapshot: baseRecord.sourceSupplierNameSnapshot,
    targetBuyerNameSnapshot: likelyBuyers[0]?.name ?? null,
    targetBuyerCompanySnapshot: null,
    supplierQualificationStatusSnapshot:
      input.buyDecision.supplierQualificationStatus,
    quotedBuyUnitPrice,
    quotedBuyCurrencyCode,
    quotedBuyMinimumOrderQuantity: input.buyDecision.quotedMinimumOrderQuantity,
    quotedAvailability: input.buyDecision.quotedAvailability,
    targetSellUnitPrice: recentAverageSalePrice,
    targetSellCurrencyCode: quotedBuyCurrencyCode,
    minimumMarginAmount: null,
    minimumMarginPct: null,
    estimatedMarginAmount,
    estimatedMarginPct,
    quantityTarget:
      input.buyDecision.quotedMinimumOrderQuantity ?? recentUnitsSold,
    rationale: baseRecord.rationale,
    riskFlags,
    hasQualificationBlock: baseRecord.hasQualificationBlock,
    isMarginFloorMet: true,
    isActionable: true,
    hasMessagingPolicyViolations: false,
    messagingPolicyViolationCount: 0,
    ownerLabel: null,
    createdByType: actor.actorType,
    createdByIdentifier: actor.actorIdentifier,
    metadata: baseRecord.metadata,
  });

  await repository.createPolicy(buildDefaultPolicy(created.id));
  await logTradeOpportunityEvent(
    repository as Pick<
      TradeOpportunityRepository,
      'createTradeOpportunityEvent'
    >,
    {
      tradeOpportunityId: created.id,
      actionType: 'CREATED',
      previousStatus: null,
      newStatus: created.status,
      previousStage: null,
      newStage: created.stage,
      actorType: actor.actorType,
      actorIdentifier: actor.actorIdentifier,
      note: 'Created from an approved supplier offer with recent customer demand and positive margin.',
      metadata: {
        createdFrom: 'approved_buy_decision_demand_match',
        buyDecisionId: input.buyDecision.id,
        recentDemandWindowDays,
        recentUnitsSold,
        recentAverageSalePrice,
        likelyBuyerCount: likelyBuyers.length,
      },
    },
  );

  return {
    outcome: 'CREATED',
    tradeOpportunity: created,
  };
}

function eventMetadataFromDraft(
  draft: TradeMessageDraftRecord,
): Record<string, unknown> {
  return {
    draftId: draft.id,
    direction: draft.direction,
    messagePurpose: draft.messagePurpose,
    status: draft.status,
    policyViolations: draft.policyViolations,
  };
}

function logTradeOpportunityEvent(
  repository: Pick<TradeOpportunityRepository, 'createTradeOpportunityEvent'>,
  data: Omit<TradeOpportunityEventRecord, 'id' | 'createdAt'>,
) {
  return repository.createTradeOpportunityEvent(data);
}

function extractPolicyTerms(deal: TradeOpportunityRecord) {
  const supplierTerms = dedupeRiskFlags([
    normalizeString(deal.sourceSupplierNameSnapshot),
    normalizeString(deal.supplier?.name ?? null),
  ]);
  const buyerTerms = dedupeRiskFlags([
    normalizeString(deal.targetBuyerNameSnapshot),
    normalizeString(deal.targetBuyerCompanySnapshot),
  ]);

  return {
    supplierTerms,
    buyerTerms,
  };
}

export function validateTradeMessageDraft(
  tradeOpportunity: TradeOpportunityRecord,
  policy: TradeOpportunityMessagingPolicyRecord,
  input: {
    direction: TradeMessageDraftDirection;
    messagePurpose: TradeMessagePurpose;
    subject: string;
    body: string;
  },
) {
  const text = `${input.subject}\n${input.body}`;
  const lowerText = text.toLowerCase();
  const { supplierTerms, buyerTerms } = extractPolicyTerms(tradeOpportunity);
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phonePattern = /(?:\+?\d[\d\s().-]{6,}\d)/g;
  const headerPattern = /(^|\n)\s*(from|sent|to|subject):/i;
  const urlPattern = /https?:\/\/|www\./i;
  const containsSupplierIdentity = supplierTerms.some((term) =>
    lowerText.includes(term.toLowerCase()),
  );
  const containsBuyerIdentity = buyerTerms.some((term) =>
    lowerText.includes(term.toLowerCase()),
  );
  const containsExternalContactDetails =
    emailPattern.test(text) || phonePattern.test(text) || urlPattern.test(text);
  const containsForwardedContent = headerPattern.test(text);
  const allowedMessageTypes = Array.isArray(policy.allowedMessageTypes)
    ? (policy.allowedMessageTypes as unknown[])
    : null;
  const violations = dedupeRiskFlags([
    input.direction === 'TO_SUPPLIER' && !policy.allowSupplierOutreachDrafts
      ? 'supplier_outreach_blocked'
      : null,
    input.direction === 'TO_BUYER' && !policy.allowBuyerOutreachDrafts
      ? 'buyer_outreach_blocked'
      : null,
    allowedMessageTypes && !allowedMessageTypes.includes(input.messagePurpose)
      ? 'message_type_not_allowed'
      : null,
    containsForwardedContent ? 'forwarded_header_content_detected' : null,
    containsExternalContactDetails ? 'external_contact_details_detected' : null,
    input.direction === 'TO_BUYER' &&
    policy.blockSupplierIdentityLeak &&
    containsSupplierIdentity
      ? 'supplier_identity_leak_detected'
      : null,
    input.direction === 'TO_SUPPLIER' &&
    policy.blockBuyerIdentityLeak &&
    containsBuyerIdentity
      ? 'buyer_identity_leak_detected'
      : null,
  ]);

  return {
    policyFlags: {
      requireHumanApprovalBeforeSend: policy.requireHumanApprovalBeforeSend,
      blockSupplierIdentityLeak: policy.blockSupplierIdentityLeak,
      blockBuyerIdentityLeak: policy.blockBuyerIdentityLeak,
      allowedMessageTypes: policy.allowedMessageTypes,
      containsSupplierIdentity,
      containsBuyerIdentity,
      containsExternalContactDetails,
      containsForwardedContent,
    },
    policyViolations: violations,
    containsSupplierIdentity,
    containsBuyerIdentity,
    containsExternalContactDetails,
    containsForwardedContent,
    status: (violations.length > 0
      ? 'DRAFT'
      : 'READY_FOR_REVIEW') as TradeMessageDraftStatus,
  };
}

function renderTradeMessageDraft(
  tradeOpportunity: TradeOpportunityRecord,
  input: Pick<TradeMessageDraftGenerateInput, 'direction' | 'messagePurpose'>,
) {
  const productLabel =
    normalizeString(tradeOpportunity.rawProductText) ||
    normalizeString(tradeOpportunity.normalizedProductNameCandidate) ||
    'product line';
  const quantityLabel =
    tradeOpportunity.quantityTarget ??
    tradeOpportunity.quotedBuyMinimumOrderQuantity ??
    null;
  const buyPrice = toNumber(tradeOpportunity.quotedBuyUnitPrice);
  const sellPrice = toNumber(tradeOpportunity.targetSellUnitPrice);

  if (input.direction === 'TO_SUPPLIER') {
    return {
      subject: `Availability enquiry: ${productLabel}`,
      body: [
        'Hello,',
        '',
        `We are reviewing current interest in ${productLabel}.`,
        quantityLabel
          ? `Please confirm current availability for approximately ${quantityLabel} units.`
          : 'Please confirm current availability.',
        buyPrice !== null
          ? `We are also reviewing whether terms around ${tradeOpportunity.quotedBuyCurrencyCode ?? 'the quoted currency'} ${buyPrice.toFixed(2)} per unit remain achievable.`
          : 'Please advise your current best buy terms, MOQ, and lead time.',
        '',
        'Please reply with current availability, lead time, and commercial terms.',
        '',
        'Regards,',
        'Trading Desk',
      ].join('\n'),
    };
  }

  if (input.direction === 'TO_BUYER') {
    return {
      subject: `Indicative availability: ${productLabel}`,
      body: [
        'Hello,',
        '',
        `We are reviewing indicative availability for ${productLabel}.`,
        quantityLabel
          ? `Potential quantity range is around ${quantityLabel} units, subject to confirmation.`
          : 'Indicative quantity is subject to confirmation.',
        sellPrice !== null
          ? `Indicative sell terms are currently being reviewed around ${tradeOpportunity.targetSellCurrencyCode ?? 'the working currency'} ${sellPrice.toFixed(2)} per unit, subject to confirmation and timing.`
          : 'Indicative sell terms are still being reviewed internally.',
        '',
        'If this product is of interest, please confirm your approximate requirement and timing window.',
        '',
        'Regards,',
        'Trading Desk',
      ].join('\n'),
    };
  }

  return {
    subject: `Internal deal summary: ${productLabel}`,
    body: [
      `Deal ID: ${tradeOpportunity.id}`,
      `Status / Stage: ${tradeOpportunity.status} / ${tradeOpportunity.stage}`,
      `Product: ${productLabel}`,
      `Supplier snapshot: ${tradeOpportunity.sourceSupplierNameSnapshot ?? 'unresolved'}`,
      `Quoted buy: ${buyPrice !== null ? `${tradeOpportunity.quotedBuyCurrencyCode ?? ''} ${buyPrice.toFixed(2)}`.trim() : 'unknown'}`,
      `Target sell: ${sellPrice !== null ? `${tradeOpportunity.targetSellCurrencyCode ?? ''} ${sellPrice.toFixed(2)}`.trim() : 'unset'}`,
      `Quantity target: ${tradeOpportunity.quantityTarget ?? tradeOpportunity.quotedBuyMinimumOrderQuantity ?? 'unset'}`,
      `Rationale: ${tradeOpportunity.rationale ?? 'none recorded'}`,
    ].join('\n'),
  };
}

function recomputeTradeOpportunityState(
  base: TradeOpportunityRecord,
): Partial<TradeOpportunityRecord> {
  const margin = marginMetrics({
    quotedBuyUnitPrice: base.quotedBuyUnitPrice,
    targetSellUnitPrice: base.targetSellUnitPrice,
    minimumMarginAmount: base.minimumMarginAmount,
    minimumMarginPct: base.minimumMarginPct,
  });
  const riskFlags = buildRiskFlags({
    supplierId: base.supplierId,
    sourceSupplierNameSnapshot: base.sourceSupplierNameSnapshot,
    supplierQualificationStatusSnapshot:
      base.supplierQualificationStatusSnapshot,
    quotedBuyUnitPrice: base.quotedBuyUnitPrice,
    targetSellUnitPrice: base.targetSellUnitPrice,
    minimumMarginAmount: base.minimumMarginAmount,
    minimumMarginPct: base.minimumMarginPct,
    isMarginFloorMet: margin.isMarginFloorMet,
    buyDecisionId: base.buyDecisionId,
    buyDecision: base.buyDecision,
    buyExecutionId: base.buyExecutionId,
    buyExecution: base.buyExecution,
    metadata: base.metadata,
  });
  const nextStatus = deriveStatus({
    ...base,
    riskFlags,
    estimatedMarginAmount: margin.estimatedMarginAmount,
    estimatedMarginPct: margin.estimatedMarginPct,
    isMarginFloorMet: margin.isMarginFloorMet,
  });
  const nextStage = deriveSuggestedStage({
    ...base,
    riskFlags,
    status: nextStatus,
    estimatedMarginAmount: margin.estimatedMarginAmount,
    estimatedMarginPct: margin.estimatedMarginPct,
    isMarginFloorMet: margin.isMarginFloorMet,
  });

  return {
    estimatedMarginAmount: margin.estimatedMarginAmount,
    estimatedMarginPct: margin.estimatedMarginPct,
    isMarginFloorMet: margin.isMarginFloorMet,
    hasQualificationBlock:
      base.supplierQualificationStatusSnapshot === 'BLOCKED' ||
      base.supplierQualificationStatusSnapshot === 'RESTRICTED',
    isActionable:
      nextStatus === 'OPEN' &&
      !riskFlags.includes('unresolved_supplier') &&
      !riskFlags.includes('blocked_supplier') &&
      !riskFlags.includes('restricted_supplier') &&
      !riskFlags.includes('unknown_supplier_qualification') &&
      !riskFlags.includes('margin_below_floor') &&
      !riskFlags.includes('price_drift_detected'),
    riskFlags,
    status: nextStatus,
    stage:
      base.stage === 'BUYER_CONTACTED' ||
      base.stage === 'NEGOTIATING' ||
      base.stage === 'DEAL_CONFIRMED' ||
      base.stage === 'CLOSED'
        ? base.stage
        : stageRank(nextStage) > stageRank(base.stage)
          ? nextStage
          : base.stage,
    closedAt:
      nextStatus === 'WON' || nextStatus === 'LOST' || nextStatus === 'DROPPED'
        ? (base.closedAt ?? new Date())
        : null,
  };
}

async function refreshTradeOpportunityMessagingState(
  repository: Pick<
    TradeOpportunityRepository,
    'listDrafts' | 'updateTradeOpportunity'
  >,
  tradeOpportunity: TradeOpportunityRecord,
) {
  const drafts = await repository.listDrafts(tradeOpportunity.id);
  const violationCount = drafts.reduce((count, draft) => {
    const violations = Array.isArray(draft.policyViolations)
      ? draft.policyViolations.length
      : 0;
    return count + violations;
  }, 0);

  return repository.updateTradeOpportunity(tradeOpportunity.id, {
    hasMessagingPolicyViolations: violationCount > 0,
    messagingPolicyViolationCount: violationCount,
  } as never);
}

export async function syncTradeOpportunityCommercialState(
  repository: TradeOpportunitySyncRepository,
  input: TradeOpportunitySyncInput,
) {
  if (!input.emailDerivedOfferId) {
    return [];
  }

  const opportunities = await repository.listActiveByOfferId(
    input.emailDerivedOfferId,
  );
  const actor = input.actor ?? { actorType: 'SYSTEM', actorIdentifier: null };
  const results: TradeOpportunityRecord[] = [];

  for (const opportunity of opportunities) {
    const previousStatus = opportunity.status;
    const previousStage = opportunity.stage;
    const nextBase: TradeOpportunityRecord = {
      ...opportunity,
      buyDecisionId: input.buyDecision?.id ?? opportunity.buyDecisionId,
      buyExecutionId: input.buyExecution?.id ?? opportunity.buyExecutionId,
      supplierId:
        input.buyDecision?.supplierId ??
        input.buyExecution?.supplierId ??
        opportunity.supplierId,
      productId:
        input.buyDecision?.productId ??
        input.buyExecution?.productId ??
        opportunity.productId,
      quotedBuyUnitPrice:
        input.buyDecision?.quotedUnitPrice ?? opportunity.quotedBuyUnitPrice,
      quotedBuyCurrencyCode:
        input.buyDecision?.quotedCurrencyCode ??
        opportunity.quotedBuyCurrencyCode,
      quotedBuyMinimumOrderQuantity:
        input.buyDecision?.quotedMinimumOrderQuantity ??
        opportunity.quotedBuyMinimumOrderQuantity,
      quotedAvailability:
        input.buyDecision?.quotedAvailability ?? opportunity.quotedAvailability,
      supplierQualificationStatusSnapshot:
        input.buyDecision?.supplierQualificationStatus ??
        opportunity.supplierQualificationStatusSnapshot,
      buyDecision: input.buyDecision
        ? {
            id: input.buyDecision.id,
            approvalStatus: input.buyDecision.approvalStatus,
            orderStatus: input.buyDecision.orderStatus,
            supplierQualificationStatus:
              input.buyDecision.supplierQualificationStatus,
            hasQualificationRisk: input.buyDecision.hasQualificationRisk,
          }
        : opportunity.buyDecision,
      buyExecution: input.buyExecution
        ? {
            id: input.buyExecution.id,
            fulfillmentStatus: input.buyExecution.fulfillmentStatus,
            reconciliationStatus: input.buyExecution.reconciliationStatus,
            hasPriceDrift: input.buyExecution.hasPriceDrift,
            hasQuantityDrift: input.buyExecution.hasQuantityDrift,
            hasCurrencyMismatch: input.buyExecution.hasCurrencyMismatch,
            hasAvailabilityDrift: input.buyExecution.hasAvailabilityDrift,
          }
        : opportunity.buyExecution,
    };
    const statePatch = recomputeTradeOpportunityState(nextBase);
    const updated = await repository.updateTradeOpportunity(opportunity.id, {
      buyDecisionId: nextBase.buyDecisionId,
      buyExecutionId: nextBase.buyExecutionId,
      supplierId: nextBase.supplierId,
      productId: nextBase.productId,
      quotedBuyUnitPrice: nextBase.quotedBuyUnitPrice,
      quotedBuyCurrencyCode: nextBase.quotedBuyCurrencyCode,
      quotedBuyMinimumOrderQuantity: nextBase.quotedBuyMinimumOrderQuantity,
      quotedAvailability: nextBase.quotedAvailability,
      supplierQualificationStatusSnapshot:
        nextBase.supplierQualificationStatusSnapshot,
      ...statePatch,
    } as never);

    const actionType: TradeOpportunityActionType =
      input.buyExecution && opportunity.buyExecutionId !== input.buyExecution.id
        ? 'BUY_ORDER_LINKED'
        : input.buyDecision &&
            opportunity.buyDecisionId !== input.buyDecision.id
          ? 'BUY_APPROVAL_LINKED'
          : updated.status !== previousStatus
            ? 'STATUS_CHANGED'
            : updated.stage !== previousStage
              ? 'STAGE_CHANGED'
              : 'UPDATED';

    if (
      actionType !== 'UPDATED' ||
      updated.status !== previousStatus ||
      updated.stage !== previousStage
    ) {
      await logTradeOpportunityEvent(repository as any, {
        tradeOpportunityId: updated.id,
        actionType,
        previousStatus,
        newStatus: updated.status,
        previousStage,
        newStage: updated.stage,
        actorType: actor.actorType,
        actorIdentifier: actor.actorIdentifier,
        note: input.note ?? null,
        metadata:
          actionType === 'BUY_ORDER_LINKED'
            ? {
                buyExecutionId: updated.buyExecutionId,
                buyDecisionId: updated.buyDecisionId,
              }
            : actionType === 'BUY_APPROVAL_LINKED'
              ? { buyDecisionId: updated.buyDecisionId }
              : null,
      });
    }

    results.push(updated);
  }

  return results;
}

export function createTradeOpportunityRepository(
  client: typeof db = db,
  inTransaction = false,
): TradeOpportunityRepository {
  return {
    transaction: async (callback) => {
      if (inTransaction) {
        return callback(createTradeOpportunityRepository(client, true));
      }

      return db.$transaction(async (tx) =>
        callback(createTradeOpportunityRepository(tx as never, true)),
      );
    },
    findById: async (tradeOpportunityId) =>
      client.tradeOpportunity.findUnique({
        where: { id: tradeOpportunityId },
        include: {
          messagingPolicy: true,
          drafts: {
            orderBy: { updatedAt: 'desc' },
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
          supplier: {
            select: { id: true, name: true },
          },
          product: {
            select: { id: true, name: true },
          },
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
      }) as Promise<TradeOpportunityRecord | null>,
    list: async (filters) => {
      const where: Record<string, unknown> = {};
      if (filters.status) {
        where.status = filters.status;
      }
      if (filters.stage) {
        where.stage = filters.stage;
      }
      if (filters.supplierId) {
        where.supplierId = filters.supplierId;
      }
      if (filters.productId) {
        where.productId = filters.productId;
      }
      if (filters.emailDerivedOfferId) {
        where.emailDerivedOfferId = filters.emailDerivedOfferId;
      }
      if (typeof filters.hasMessagingPolicyViolations === 'boolean') {
        where.hasMessagingPolicyViolations =
          filters.hasMessagingPolicyViolations;
      }

      return (await client.tradeOpportunity.findMany({
        where,
        include: {
          messagingPolicy: true,
          drafts: {
            orderBy: { updatedAt: 'desc' },
          },
          supplier: {
            select: { id: true, name: true },
          },
          product: {
            select: { id: true, name: true },
          },
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
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] as never,
        take: filters.take ?? 100,
      })) as TradeOpportunityRecord[];
    },
    create: async (data) =>
      client.tradeOpportunity.create({
        data: data as never,
        include: {
          messagingPolicy: true,
          drafts: true,
        },
      }) as Promise<TradeOpportunityRecord>,
    update: async (tradeOpportunityId, data) =>
      client.tradeOpportunity.update({
        where: { id: tradeOpportunityId },
        data: data as never,
        include: {
          messagingPolicy: true,
          drafts: {
            orderBy: { updatedAt: 'desc' },
          },
          supplier: {
            select: { id: true, name: true },
          },
          product: {
            select: { id: true, name: true },
          },
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
      }) as Promise<TradeOpportunityRecord>,
    createTradeOpportunityEvent: async (data) =>
      client.tradeOpportunityEvent.create({
        data: data as never,
      }) as Promise<TradeOpportunityEventRecord>,
    listEvents: async (tradeOpportunityId) =>
      client.tradeOpportunityEvent.findMany({
        where: { tradeOpportunityId },
        orderBy: { createdAt: 'asc' },
      }) as Promise<TradeOpportunityEventRecord[]>,
    findPolicyByTradeOpportunityId: async (tradeOpportunityId) =>
      client.tradeOpportunityMessagingPolicy.findUnique({
        where: { tradeOpportunityId },
      }) as Promise<TradeOpportunityMessagingPolicyRecord | null>,
    createPolicy: async (data) =>
      client.tradeOpportunityMessagingPolicy.create({
        data: data as never,
      }) as Promise<TradeOpportunityMessagingPolicyRecord>,
    updatePolicy: async (tradeOpportunityId, data) =>
      client.tradeOpportunityMessagingPolicy.update({
        where: { tradeOpportunityId },
        data: data as never,
      }) as Promise<TradeOpportunityMessagingPolicyRecord>,
    listDrafts: async (tradeOpportunityId) =>
      client.tradeMessageDraft.findMany({
        where: { tradeOpportunityId },
        orderBy: { updatedAt: 'desc' },
      }) as Promise<TradeMessageDraftRecord[]>,
    findDraftById: async (draftId) =>
      client.tradeMessageDraft.findUnique({
        where: { id: draftId },
      }) as Promise<TradeMessageDraftRecord | null>,
    findMatchingDraft: async (
      tradeOpportunityId,
      contentHash,
      direction,
      messagePurpose,
    ) =>
      client.tradeMessageDraft.findFirst({
        where: {
          tradeOpportunityId,
          contentHash,
          direction,
          messagePurpose,
          status: {
            notIn: ['REJECTED', 'CANCELLED'],
          },
        },
        orderBy: { updatedAt: 'desc' },
      }) as Promise<TradeMessageDraftRecord | null>,
    createDraft: async (data) =>
      client.tradeMessageDraft.create({
        data: data as never,
      }) as Promise<TradeMessageDraftRecord>,
    updateDraft: async (draftId, data) =>
      client.tradeMessageDraft.update({
        where: { id: draftId },
        data: data as never,
      }) as Promise<TradeMessageDraftRecord>,
    findRecentMatchingFeedback: async (input) =>
      client.operatorValidationFeedback.findFirst({
        where: {
          emailDerivedOfferId: input.emailDerivedOfferId,
          offerWorkflowItemId: input.offerWorkflowItemId,
          tradeOpportunityId: input.tradeOpportunityId,
          tradeMessageDraftId: input.tradeMessageDraftId,
          feedbackType: input.feedbackType,
          verdict: input.verdict,
          actorType: input.actorType,
          actorIdentifier: input.actorIdentifier,
          createdAt: {
            gte: input.createdAfter,
          },
        },
        orderBy: { createdAt: 'desc' },
      }) as Promise<any>,
    createFeedback: async (data) =>
      client.operatorValidationFeedback.create({
        data: data as never,
      }) as Promise<any>,
    findTradeMessageDraftById: async (draftId) =>
      client.tradeMessageDraft.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          tradeOpportunityId: true,
        },
      }) as Promise<any>,
    findOfferById: async (emailDerivedOfferId) =>
      client.emailDerivedOffer.findUnique({
        where: { id: emailDerivedOfferId },
        include: {
          resolutionCandidates: true,
          workflowItem: true,
          inboundEmail: true,
        },
      }) as Promise<EmailDerivedOfferSource | null>,
    findWorkflowById: async (workflowItemId) =>
      client.offerWorkflowItem.findUnique({
        where: { id: workflowItemId },
        include: {
          emailDerivedOffer: {
            include: {
              resolutionCandidates: true,
              inboundEmail: true,
            },
          },
          buyDecision: true,
        },
      }) as Promise<WorkflowSource | null>,
    findBuyDecisionById: async (buyDecisionId) =>
      client.buyDecision.findUnique({
        where: { id: buyDecisionId },
        include: {
          execution: true,
          supplier: {
            select: { id: true, name: true },
          },
        },
      }) as Promise<BuyDecisionSource | null>,
    findBuyExecutionById: async (buyExecutionId) =>
      client.buyExecution.findUnique({
        where: { id: buyExecutionId },
      }) as Promise<BuyExecutionSource | null>,
    listActiveByOfferIds: async (emailDerivedOfferIds) =>
      client.tradeOpportunity.findMany({
        where: {
          emailDerivedOfferId: {
            in: emailDerivedOfferIds,
          },
          status: {
            in: Array.from(ACTIVE_TRADE_STATUSES),
          },
        },
        include: {
          messagingPolicy: true,
          drafts: {
            orderBy: { updatedAt: 'desc' },
          },
          supplier: {
            select: { id: true, name: true },
          },
          product: {
            select: { id: true, name: true },
          },
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
      }) as Promise<TradeOpportunityRecord[]>,
    listRecentSalesByProductId: async ({
      productId,
      windowStart,
      currencyCode,
    }) =>
      client.salesRecord
        .findMany({
          where: {
            productId,
            saleDate: {
              gte: windowStart,
            },
            currencyCode,
          },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ saleDate: 'desc' }],
        })
        .then((items) =>
          items.map((item) => ({
            customerId: item.customerId,
            customerName: item.customer.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalRevenue: item.totalRevenue,
            saleDate: item.saleDate,
            currencyCode: item.currencyCode,
          })),
        ) as Promise<RecentProductDemandRecord[]>,
    listActiveByOfferId: async (emailDerivedOfferId) =>
      client.tradeOpportunity.findMany({
        where: {
          emailDerivedOfferId,
          status: {
            in: Array.from(ACTIVE_TRADE_STATUSES),
          },
        },
        include: {
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
      }) as Promise<TradeOpportunityRecord[]>,
    updateTradeOpportunity: async (tradeOpportunityId, data) =>
      client.tradeOpportunity.update({
        where: { id: tradeOpportunityId },
        data: data as never,
      }) as Promise<TradeOpportunityRecord>,
  };
}

async function enrichTradeOpportunities(
  repository: TradeOpportunityRepository,
  opportunities: TradeOpportunityRecord[],
  dependencies: TradeOpportunityDependencies,
) {
  const draftMap = new Map<string, TradeMessageDraftRecord[]>();
  await Promise.all(
    opportunities.map(async (opportunity) => {
      draftMap.set(
        opportunity.id,
        opportunity.drafts ?? (await repository.listDrafts(opportunity.id)),
      );
    }),
  );
  const offerIds = opportunities.flatMap((opportunity) =>
    opportunity.emailDerivedOfferId ? [opportunity.emailDerivedOfferId] : [],
  );
  const tradeIds = opportunities.map((opportunity) => opportunity.id);
  const [
    offerFeedbackSummaries,
    offerLearningSummaries,
    tradeFeedbackSummaries,
    readinessOverview,
  ] = await Promise.all([
    dependencies.getOfferFeedbackSummariesForOfferIds(
      Array.from(new Set(offerIds)),
    ),
    dependencies.getOfferLearningSummariesForOfferIds(
      Array.from(new Set(offerIds)),
    ),
    dependencies.getTradeFeedbackSummariesForTradeOpportunityIds(
      Array.from(new Set(tradeIds)),
    ),
    dependencies.getAutomationReadinessOverview(),
  ]);
  const draftBlockedReasons = Array.from(
    new Set([
      ...readinessOverview.decisions.supplierDrafts.blockedReasons,
      ...readinessOverview.decisions.buyerDrafts.blockedReasons,
    ]),
  );

  return opportunities.map((opportunity) => ({
    ...opportunity,
    drafts: draftMap.get(opportunity.id) ?? [],
    summary: {
      ...summarizeTradeOpportunity(
        opportunity,
        draftMap.get(opportunity.id) ?? [],
      ),
      hasOperatorFeedback:
        (opportunity.emailDerivedOfferId
          ? offerFeedbackSummaries[opportunity.emailDerivedOfferId]?.hasFeedback
          : false) ||
        tradeFeedbackSummaries[opportunity.id]?.hasFeedback ||
        false,
      hasOfferCorrection: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.hasCorrection ?? false)
        : false,
      sourceReliabilityTier: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.sourceReliabilityTier ?? null)
        : null,
      sourceReliabilityScore: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.sourceReliabilityScore ?? null)
        : null,
      hasLearnedSupplierSuggestion: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.hasLearnedSupplierSuggestion ?? false)
        : false,
      learnedSupplierName: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.learnedSupplierName ?? null)
        : null,
      hasLearnedProductSuggestion: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.hasLearnedProductSuggestion ?? false)
        : false,
      learnedProductName: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.learnedProductName ?? null)
        : null,
      hasLearnedManufacturerSuggestion: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.hasLearnedManufacturerSuggestion ?? false)
        : false,
      learnedManufacturer: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.learnedManufacturer ?? null)
        : null,
      learningRecommendedAction: opportunity.emailDerivedOfferId
        ? (offerLearningSummaries[opportunity.emailDerivedOfferId]
            ?.recommendedNextAction ?? 'review manually')
        : 'review manually',
      extractionFeedbackVerdict: opportunity.emailDerivedOfferId
        ? (offerFeedbackSummaries[opportunity.emailDerivedOfferId]
            ?.extractionVerdict ?? null)
        : null,
      supplierResolutionFeedbackVerdict: opportunity.emailDerivedOfferId
        ? (offerFeedbackSummaries[opportunity.emailDerivedOfferId]
            ?.supplierResolutionVerdict ?? null)
        : null,
      dealFeedbackVerdict:
        tradeFeedbackSummaries[opportunity.id]?.dealVerdict ?? null,
      latestDraftFeedbackVerdict:
        tradeFeedbackSummaries[opportunity.id]?.latestDraftVerdict ?? null,
      automationMode: readinessOverview.policy.globalMode,
      automationBlockedReasons: draftBlockedReasons,
      automationRecommendedAction: readinessOverview.recommendedAction,
    },
  }));
}

function buildSourceSnapshot(input: {
  offer?: EmailDerivedOfferSource | null;
  workflow?: WorkflowSource | null;
  buyDecision?: BuyDecisionSource | null;
  explicit: TradeOpportunityCreateInput;
}) {
  const offer = input.offer ?? input.workflow?.emailDerivedOffer ?? null;
  const workflow = input.workflow ?? null;
  const fallbackWorkflow = offer?.workflowItem ?? null;
  const buyDecision = input.buyDecision ?? null;
  const selectedSupplier = findSelectedCandidateName(
    offer?.resolutionCandidates,
    'SUPPLIER',
  );
  const selectedProduct = findSelectedCandidateName(
    offer?.resolutionCandidates,
    'PRODUCT',
  );
  const supplierQualificationStatusSnapshot =
    buyDecision?.supplierQualificationStatus ??
    workflow?.supplierQualificationStatus ??
    offer?.workflowItem?.supplierQualificationStatus ??
    'UNKNOWN';

  return {
    sourceType:
      input.explicit.sourceType ??
      (buyDecision
        ? 'BUY_DECISION'
        : workflow || fallbackWorkflow
          ? 'WORKFLOW_ITEM'
          : offer
            ? 'EMAIL_DERIVED_OFFER'
            : 'OPERATOR_CREATED'),
    emailDerivedOfferId:
      buyDecision?.emailDerivedOfferId ??
      workflow?.emailDerivedOfferId ??
      offer?.id ??
      null,
    offerWorkflowItemId:
      buyDecision?.offerWorkflowItemId ??
      workflow?.id ??
      fallbackWorkflow?.id ??
      null,
    inboundEmailId:
      buyDecision?.inboundEmailId ??
      workflow?.inboundEmailId ??
      offer?.inboundEmailId ??
      null,
    buyDecisionId: buyDecision?.id ?? null,
    buyExecutionId:
      input.explicit.buyExecutionId ?? buyDecision?.execution?.id ?? null,
    supplierId:
      input.explicit.supplierId ??
      buyDecision?.supplierId ??
      selectedSupplier.id,
    productId:
      input.explicit.productId ?? buyDecision?.productId ?? selectedProduct.id,
    rawProductText:
      input.explicit.rawProductText ??
      buyDecision?.rawProductText ??
      offer?.rawProductText ??
      null,
    normalizedProductNameCandidate:
      input.explicit.normalizedProductNameCandidate ??
      buyDecision?.normalizedProductNameCandidate ??
      offer?.normalizedProductNameCandidate ??
      null,
    manufacturerCandidate:
      input.explicit.manufacturerCandidate ??
      buyDecision?.manufacturerCandidate ??
      offer?.manufacturerCandidate ??
      null,
    sourceSupplierNameSnapshot:
      input.explicit.sourceSupplierNameSnapshot ??
      buyDecision?.supplier?.name ??
      selectedSupplier.name ??
      offer?.supplierCandidate ??
      null,
    supplierQualificationStatusSnapshot,
    quotedBuyUnitPrice:
      input.explicit.quotedBuyUnitPrice ??
      buyDecision?.quotedUnitPrice ??
      offer?.priceCandidate ??
      null,
    quotedBuyCurrencyCode: normalizeCurrencyCode(
      input.explicit.quotedBuyCurrencyCode ??
        buyDecision?.quotedCurrencyCode ??
        offer?.currencyCandidate ??
        null,
    ),
    quotedBuyMinimumOrderQuantity:
      input.explicit.quotedBuyMinimumOrderQuantity ??
      buyDecision?.quotedMinimumOrderQuantity ??
      offer?.minimumOrderQuantityCandidate ??
      null,
    quotedAvailability:
      input.explicit.quotedAvailability ??
      buyDecision?.quotedAvailability ??
      offer?.availabilityCandidate ??
      null,
    metadata: {
      ...(input.explicit.metadata &&
      typeof input.explicit.metadata === 'object' &&
      !Array.isArray(input.explicit.metadata)
        ? (input.explicit.metadata as Record<string, unknown>)
        : {}),
      aiAssisted: offer?.aiAssisted ?? null,
      fieldConfidence: offer?.fieldConfidence ?? null,
      offerStatus: offer?.status ?? null,
      workflowStatus: workflow?.status ?? null,
      workflowQualificationRiskNote:
        workflow?.qualificationRiskNote ??
        offer?.workflowItem?.qualificationRiskNote ??
        null,
      sourceInboundEmailSubject: offer?.inboundEmail?.subject ?? null,
      sourceInboundSender: offer?.inboundEmail?.fromEmail ?? null,
    },
  };
}

export function createTradeOpportunityService(
  overrides?: Partial<TradeOpportunityRepository>,
  dependencyOverrides?: Partial<TradeOpportunityDependencies>,
) {
  const repository: TradeOpportunityRepository = {
    ...createTradeOpportunityRepository(),
    ...overrides,
  };
  const dependencies: TradeOpportunityDependencies = {
    getOfferFeedbackSummariesForOfferIds: async (emailDerivedOfferIds) =>
      automationService.getOfferFeedbackSummariesForOfferIds(
        emailDerivedOfferIds,
      ),
    getOfferLearningSummariesForOfferIds: async (emailDerivedOfferIds) =>
      offerCorrectionService.getOfferLearningSummariesForOfferIds(
        emailDerivedOfferIds,
      ),
    getTradeFeedbackSummariesForTradeOpportunityIds: async (
      tradeOpportunityIds,
    ) =>
      automationService.getTradeFeedbackSummariesForTradeOpportunityIds(
        tradeOpportunityIds,
      ),
    getAutomationReadinessOverview: async () =>
      automationService.getReadinessOverview(),
    ...dependencyOverrides,
  };

  return {
    async getTradeOpportunity(
      tradeOpportunityId: string,
    ): Promise<EnrichedTradeOpportunityRecord | null> {
      const item = await repository.findById(tradeOpportunityId);
      if (!item) {
        return null;
      }

      return (
        (await enrichTradeOpportunities(repository, [item], dependencies))[0] ??
        null
      );
    },

    async listTradeOpportunities(
      filters: TradeOpportunityListFilters = {},
    ): Promise<EnrichedTradeOpportunityRecord[]> {
      return enrichTradeOpportunities(
        repository,
        await repository.list(filters),
        dependencies,
      );
    },

    async listTradeOpportunityEvents(tradeOpportunityId: string) {
      return repository.listEvents(tradeOpportunityId);
    },

    async listTradeMessageDrafts(tradeOpportunityId: string) {
      return repository.listDrafts(tradeOpportunityId);
    },

    async createTradeOpportunity(
      input: TradeOpportunityCreateInput,
    ): Promise<EnrichedTradeOpportunityRecord> {
      const actor = normalizeActor(input);

      const opportunity = await repository.transaction(async (txRepository) => {
        const workflow = input.offerWorkflowItemId
          ? await txRepository.findWorkflowById(input.offerWorkflowItemId)
          : null;
        const buyDecision = input.buyDecisionId
          ? await txRepository.findBuyDecisionById(input.buyDecisionId)
          : null;
        const offerId =
          input.emailDerivedOfferId ??
          workflow?.emailDerivedOfferId ??
          buyDecision?.emailDerivedOfferId ??
          null;
        const offer =
          input.emailDerivedOfferId &&
          (!workflow ||
            workflow.emailDerivedOfferId !== input.emailDerivedOfferId)
            ? await txRepository.findOfferById(input.emailDerivedOfferId)
            : (workflow?.emailDerivedOffer ??
              (offerId ? await txRepository.findOfferById(offerId) : null));

        if (
          (offer?.status === 'REJECTED' || workflow?.status === 'REJECTED') &&
          input.allowDuplicateActiveDeal !== true
        ) {
          throw new Error(
            'Rejected offers cannot create a new active deal by default.',
          );
        }

        if (offerId && input.allowDuplicateActiveDeal !== true) {
          const existing =
            (await txRepository.listActiveByOfferId(offerId))[0] ?? null;
          if (existing) {
            return existing;
          }
        }

        const snapshot = buildSourceSnapshot({
          offer,
          workflow,
          buyDecision,
          explicit: input,
        });

        const created = await txRepository.create({
          status: 'OPEN',
          stage:
            snapshot.sourceType === 'BUY_DECISION'
              ? buyDecision?.orderStatus &&
                buyDecision.orderStatus !== 'NOT_ORDERED'
                ? 'BUY_ORDERED'
                : 'BUY_APPROVED'
              : snapshot.sourceType === 'WORKFLOW_ITEM' ||
                  snapshot.sourceType === 'EMAIL_DERIVED_OFFER'
                ? 'REVIEW'
                : 'NEW',
          sourceType: snapshot.sourceType,
          emailDerivedOfferId: snapshot.emailDerivedOfferId,
          offerWorkflowItemId: snapshot.offerWorkflowItemId,
          inboundEmailId: snapshot.inboundEmailId,
          buyDecisionId: snapshot.buyDecisionId,
          buyExecutionId: snapshot.buyExecutionId,
          supplierId: snapshot.supplierId,
          productId: snapshot.productId,
          ownerUserId: input.ownerUserId ?? workflow?.assigneeUserId ?? null,
          rawProductText: snapshot.rawProductText,
          normalizedProductNameCandidate:
            snapshot.normalizedProductNameCandidate,
          manufacturerCandidate: snapshot.manufacturerCandidate,
          sourceSupplierNameSnapshot: snapshot.sourceSupplierNameSnapshot,
          targetBuyerNameSnapshot: normalizeString(
            input.targetBuyerNameSnapshot,
          ),
          targetBuyerCompanySnapshot: normalizeString(
            input.targetBuyerCompanySnapshot,
          ),
          supplierQualificationStatusSnapshot:
            snapshot.supplierQualificationStatusSnapshot,
          quotedBuyUnitPrice: snapshot.quotedBuyUnitPrice,
          quotedBuyCurrencyCode: snapshot.quotedBuyCurrencyCode,
          quotedBuyMinimumOrderQuantity: snapshot.quotedBuyMinimumOrderQuantity,
          quotedAvailability: snapshot.quotedAvailability,
          targetSellUnitPrice: input.targetSellUnitPrice ?? null,
          targetSellCurrencyCode: normalizeCurrencyCode(
            input.targetSellCurrencyCode,
          ),
          minimumMarginAmount: input.minimumMarginAmount ?? null,
          minimumMarginPct: input.minimumMarginPct ?? null,
          quantityTarget:
            input.quantityTarget ??
            snapshot.quotedBuyMinimumOrderQuantity ??
            null,
          rationale: normalizeString(input.rationale),
          ownerLabel: normalizeString(
            input.ownerLabel ?? workflow?.assigneeLabel,
          ),
          createdByType: actor.actorType,
          createdByIdentifier: actor.actorIdentifier,
          metadata: snapshot.metadata,
        });
        const withState = await txRepository.update(
          created.id,
          recomputeTradeOpportunityState(created) as never,
        );
        await txRepository.createPolicy(buildDefaultPolicy(withState.id));
        await logTradeOpportunityEvent(txRepository, {
          tradeOpportunityId: withState.id,
          actionType: 'CREATED',
          previousStatus: null,
          newStatus: withState.status,
          previousStage: null,
          newStage: withState.stage,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: withState.rationale,
          metadata: {
            sourceType: withState.sourceType,
            emailDerivedOfferId: withState.emailDerivedOfferId,
            buyDecisionId: withState.buyDecisionId,
          },
        });

        return txRepository.findById(
          withState.id,
        ) as Promise<TradeOpportunityRecord>;
      });

      return (
        await enrichTradeOpportunities(repository, [opportunity], dependencies)
      )[0]!;
    },

    async updateTradeOpportunity(
      tradeOpportunityId: string,
      input: TradeOpportunityUpdateInput,
    ): Promise<EnrichedTradeOpportunityRecord> {
      const actor = normalizeActor(input);

      const opportunity = await repository.transaction(async (txRepository) => {
        const existing = await txRepository.findById(tradeOpportunityId);
        if (!existing) {
          throw new Error('Trade opportunity not found.');
        }

        if (input.policy) {
          const existingPolicy =
            await txRepository.findPolicyByTradeOpportunityId(existing.id);
          if (!existingPolicy) {
            await txRepository.createPolicy({
              ...buildDefaultPolicy(existing.id),
              ...input.policy,
            });
          } else {
            await txRepository.updatePolicy(existing.id, {
              allowSupplierOutreachDrafts:
                typeof input.policy.allowSupplierOutreachDrafts === 'boolean'
                  ? input.policy.allowSupplierOutreachDrafts
                  : existingPolicy.allowSupplierOutreachDrafts,
              allowBuyerOutreachDrafts:
                typeof input.policy.allowBuyerOutreachDrafts === 'boolean'
                  ? input.policy.allowBuyerOutreachDrafts
                  : existingPolicy.allowBuyerOutreachDrafts,
              blockSupplierIdentityLeak:
                typeof input.policy.blockSupplierIdentityLeak === 'boolean'
                  ? input.policy.blockSupplierIdentityLeak
                  : existingPolicy.blockSupplierIdentityLeak,
              blockBuyerIdentityLeak:
                typeof input.policy.blockBuyerIdentityLeak === 'boolean'
                  ? input.policy.blockBuyerIdentityLeak
                  : existingPolicy.blockBuyerIdentityLeak,
              requireHumanApprovalBeforeSend:
                typeof input.policy.requireHumanApprovalBeforeSend === 'boolean'
                  ? input.policy.requireHumanApprovalBeforeSend
                  : existingPolicy.requireHumanApprovalBeforeSend,
              allowedMessageTypes:
                input.policy.allowedMessageTypes === undefined
                  ? existingPolicy.allowedMessageTypes
                  : input.policy.allowedMessageTypes,
              notes:
                input.policy.notes === undefined
                  ? existingPolicy.notes
                  : normalizeString(input.policy.notes),
            });
          }
        }

        const nextStatus = input.status ?? existing.status;
        let nextStage = input.stage ?? existing.stage;
        let nextClosedAt = existing.closedAt;
        if (
          nextStatus === 'WON' ||
          nextStatus === 'LOST' ||
          nextStatus === 'DROPPED'
        ) {
          nextStage = 'CLOSED';
          nextClosedAt = existing.closedAt ?? new Date();
        }
        const updatedBase = await txRepository.update(existing.id, {
          status: nextStatus,
          stage: nextStage,
          targetBuyerNameSnapshot:
            input.targetBuyerNameSnapshot === undefined
              ? existing.targetBuyerNameSnapshot
              : normalizeString(input.targetBuyerNameSnapshot),
          targetBuyerCompanySnapshot:
            input.targetBuyerCompanySnapshot === undefined
              ? existing.targetBuyerCompanySnapshot
              : normalizeString(input.targetBuyerCompanySnapshot),
          targetSellUnitPrice:
            input.targetSellUnitPrice === undefined
              ? existing.targetSellUnitPrice
              : input.targetSellUnitPrice,
          targetSellCurrencyCode:
            input.targetSellCurrencyCode === undefined
              ? existing.targetSellCurrencyCode
              : normalizeCurrencyCode(input.targetSellCurrencyCode),
          minimumMarginAmount:
            input.minimumMarginAmount === undefined
              ? existing.minimumMarginAmount
              : input.minimumMarginAmount,
          minimumMarginPct:
            input.minimumMarginPct === undefined
              ? existing.minimumMarginPct
              : input.minimumMarginPct,
          quantityTarget:
            input.quantityTarget === undefined
              ? existing.quantityTarget
              : input.quantityTarget,
          rationale:
            input.rationale === undefined
              ? existing.rationale
              : normalizeString(input.rationale),
          ownerUserId:
            input.ownerUserId === undefined
              ? existing.ownerUserId
              : normalizeString(input.ownerUserId),
          ownerLabel:
            input.ownerLabel === undefined
              ? existing.ownerLabel
              : normalizeString(input.ownerLabel),
          closeReason:
            input.closeReason === undefined
              ? existing.closeReason
              : normalizeString(input.closeReason),
          metadata:
            input.metadata === undefined ? existing.metadata : input.metadata,
          closedAt: nextClosedAt,
        });
        const updated = await txRepository.update(
          existing.id,
          recomputeTradeOpportunityState(updatedBase) as never,
        );

        const actionType: TradeOpportunityActionType = input.note?.trim()
          ? 'NOTE_ADDED'
          : updated.status !== existing.status
            ? updated.status === 'WON'
              ? 'WON'
              : updated.status === 'LOST'
                ? 'LOST'
                : updated.status === 'DROPPED'
                  ? 'DROPPED'
                  : 'STATUS_CHANGED'
            : updated.stage !== existing.stage
              ? updated.stage === 'NEGOTIATING'
                ? 'MARKED_NEGOTIATING'
                : 'STAGE_CHANGED'
              : 'UPDATED';

        await logTradeOpportunityEvent(txRepository, {
          tradeOpportunityId: updated.id,
          actionType,
          previousStatus: existing.status,
          newStatus: updated.status,
          previousStage: existing.stage,
          newStage: updated.stage,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: normalizeString(input.note ?? input.rationale ?? null),
          metadata: input.metadata ?? null,
        });

        return txRepository.findById(
          updated.id,
        ) as Promise<TradeOpportunityRecord>;
      });

      return (
        await enrichTradeOpportunities(repository, [opportunity], dependencies)
      )[0]!;
    },

    async generateTradeMessageDraft(
      tradeOpportunityId: string,
      input: TradeMessageDraftGenerateInput,
    ): Promise<TradeMessageDraftRecord> {
      const actor = normalizeActor(input);

      return repository.transaction(async (txRepository) => {
        const tradeOpportunity =
          await txRepository.findById(tradeOpportunityId);
        if (!tradeOpportunity) {
          throw new Error('Trade opportunity not found.');
        }

        const policy =
          (await txRepository.findPolicyByTradeOpportunityId(
            tradeOpportunityId,
          )) ??
          (await txRepository.createPolicy(
            buildDefaultPolicy(tradeOpportunityId),
          ));
        const rendered = {
          ...renderTradeMessageDraft(tradeOpportunity, input),
          subject:
            normalizeString(input.subject) ??
            renderTradeMessageDraft(tradeOpportunity, input).subject,
          body:
            normalizeString(input.body) ??
            renderTradeMessageDraft(tradeOpportunity, input).body,
        };
        const validation = validateTradeMessageDraft(tradeOpportunity, policy, {
          direction: input.direction,
          messagePurpose: input.messagePurpose,
          subject: rendered.subject,
          body: rendered.body,
        });
        const contentHash = hashContent(
          JSON.stringify({
            direction: input.direction,
            messagePurpose: input.messagePurpose,
            audienceLabel: normalizeString(input.audienceLabel),
            recipientNameSnapshot: normalizeString(input.recipientNameSnapshot),
            recipientCompanySnapshot: normalizeString(
              input.recipientCompanySnapshot,
            ),
            subject: rendered.subject,
            body: rendered.body,
            policyViolations: validation.policyViolations,
          }),
        );
        const existing = await txRepository.findMatchingDraft(
          tradeOpportunityId,
          contentHash,
          input.direction,
          input.messagePurpose,
        );
        if (existing) {
          return existing;
        }

        const draft = await txRepository.createDraft({
          tradeOpportunityId,
          direction: input.direction,
          status: validation.status,
          audienceLabel: normalizeString(input.audienceLabel),
          recipientNameSnapshot: normalizeString(input.recipientNameSnapshot),
          recipientCompanySnapshot: normalizeString(
            input.recipientCompanySnapshot,
          ),
          subject: rendered.subject,
          body: rendered.body,
          messagePurpose: input.messagePurpose,
          policyFlags: validation.policyFlags,
          policyViolations: validation.policyViolations,
          contentHash,
          containsSupplierIdentity: validation.containsSupplierIdentity,
          containsBuyerIdentity: validation.containsBuyerIdentity,
          containsExternalContactDetails:
            validation.containsExternalContactDetails,
          containsForwardedContent: validation.containsForwardedContent,
          metadata: input.metadata ?? null,
        });

        const refreshedTradeOpportunity =
          await refreshTradeOpportunityMessagingState(
            txRepository,
            tradeOpportunity,
          );
        await logTradeOpportunityEvent(txRepository, {
          tradeOpportunityId,
          actionType:
            input.direction === 'TO_SUPPLIER'
              ? 'SUPPLIER_OUTREACH_DRAFTED'
              : input.direction === 'TO_BUYER'
                ? 'BUYER_OUTREACH_DRAFTED'
                : 'UPDATED',
          previousStatus: tradeOpportunity.status,
          newStatus: refreshedTradeOpportunity.status,
          previousStage: tradeOpportunity.stage,
          newStage: refreshedTradeOpportunity.stage,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: normalizeString(input.note),
          metadata: eventMetadataFromDraft(draft),
        });

        return draft;
      });
    },

    async updateTradeMessageDraft(
      draftId: string,
      input: TradeMessageDraftUpdateInput,
    ): Promise<TradeMessageDraftRecord> {
      const actor = normalizeActor(input);

      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findDraftById(draftId);
        if (!existing) {
          throw new Error('Trade message draft not found.');
        }

        const tradeOpportunity = await txRepository.findById(
          existing.tradeOpportunityId,
        );
        if (!tradeOpportunity) {
          throw new Error('Linked trade opportunity not found.');
        }

        const policy =
          (await txRepository.findPolicyByTradeOpportunityId(
            tradeOpportunity.id,
          )) ??
          (await txRepository.createPolicy(
            buildDefaultPolicy(tradeOpportunity.id),
          ));
        const subject = normalizeString(input.subject) ?? existing.subject;
        const body = normalizeString(input.body) ?? existing.body;
        const validation = validateTradeMessageDraft(tradeOpportunity, policy, {
          direction: existing.direction,
          messagePurpose: existing.messagePurpose,
          subject,
          body,
        });

        const nextStatus: TradeMessageDraftStatus =
          input.action === 'APPROVE'
            ? 'APPROVED'
            : input.action === 'REJECT'
              ? 'REJECTED'
              : input.action === 'CANCEL'
                ? 'CANCELLED'
                : input.action === 'MARK_SENT'
                  ? 'SENT'
                  : validation.status;

        if (
          input.action === 'APPROVE' &&
          validation.policyViolations.length > 0
        ) {
          throw new Error(
            'Draft has messaging policy violations and cannot be approved.',
          );
        }
        if (input.action === 'MARK_SENT' && existing.status !== 'APPROVED') {
          throw new Error('Only approved drafts can be marked as sent.');
        }

        const updated = await txRepository.updateDraft(draftId, {
          subject,
          body,
          status: nextStatus,
          policyFlags: validation.policyFlags,
          policyViolations: validation.policyViolations,
          containsSupplierIdentity: validation.containsSupplierIdentity,
          containsBuyerIdentity: validation.containsBuyerIdentity,
          containsExternalContactDetails:
            validation.containsExternalContactDetails,
          containsForwardedContent: validation.containsForwardedContent,
          approvedByType:
            input.action === 'APPROVE'
              ? actor.actorType
              : input.action === 'REJECT'
                ? null
                : existing.approvedByType,
          approvedByIdentifier:
            input.action === 'APPROVE'
              ? actor.actorIdentifier
              : input.action === 'REJECT'
                ? null
                : existing.approvedByIdentifier,
          approvedAt:
            input.action === 'APPROVE'
              ? new Date()
              : input.action === 'REJECT'
                ? null
                : existing.approvedAt,
          sentAt: input.action === 'MARK_SENT' ? new Date() : existing.sentAt,
          metadata:
            input.metadata === undefined ? existing.metadata : input.metadata,
        });
        if (
          input.action === 'APPROVE' ||
          input.action === 'REJECT' ||
          input.feedback
        ) {
          await recordOperatorValidationFeedbackWithRepository(txRepository, {
            feedbackType: input.feedback?.feedbackType ?? 'DRAFT',
            verdict:
              input.feedback?.verdict ??
              (input.action === 'APPROVE'
                ? 'SAFE'
                : validation.policyViolations.length > 0
                  ? 'POLICY_ISSUE'
                  : 'NOT_USEFUL'),
            note: input.feedback?.note ?? input.note,
            flags: input.feedback?.flags ?? {
              policyViolationCount: validation.policyViolations.length,
            },
            metadata: input.feedback?.metadata ?? {
              action: input.action ?? 'UPDATE',
              draftStatus: updated.status,
            },
            productTextCorrect: input.feedback?.productTextCorrect,
            priceCorrect: input.feedback?.priceCorrect,
            currencyCorrect: input.feedback?.currencyCorrect,
            supplierCorrect: input.feedback?.supplierCorrect,
            manufacturerCorrect: input.feedback?.manufacturerCorrect,
            availabilityCorrect: input.feedback?.availabilityCorrect,
            moqCorrect: input.feedback?.moqCorrect,
            tradeMessageDraftId: updated.id,
            tradeOpportunityId: tradeOpportunity.id,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
          });
        }

        const refreshedTradeOpportunity =
          await refreshTradeOpportunityMessagingState(
            txRepository,
            tradeOpportunity,
          );
        await logTradeOpportunityEvent(txRepository, {
          tradeOpportunityId: tradeOpportunity.id,
          actionType: 'UPDATED',
          previousStatus: tradeOpportunity.status,
          newStatus: refreshedTradeOpportunity.status,
          previousStage: tradeOpportunity.stage,
          newStage: refreshedTradeOpportunity.stage,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: normalizeString(input.note),
          metadata: eventMetadataFromDraft(updated),
        });

        return updated;
      });
    },

    async getActiveTradeOpportunitiesForOfferIds(
      emailDerivedOfferIds: string[],
    ): Promise<Record<string, EnrichedTradeOpportunityRecord>> {
      if (emailDerivedOfferIds.length === 0) {
        return {};
      }

      const opportunities = await repository.listActiveByOfferIds(
        Array.from(new Set(emailDerivedOfferIds)),
      );
      const enriched = await enrichTradeOpportunities(
        repository,
        opportunities,
        dependencies,
      );

      return Object.fromEntries(
        enriched
          .filter((opportunity) => Boolean(opportunity.emailDerivedOfferId))
          .map((opportunity) => [
            opportunity.emailDerivedOfferId!,
            opportunity,
          ]),
      );
    },
  };
}

export const tradeOpportunityService = createTradeOpportunityService();
