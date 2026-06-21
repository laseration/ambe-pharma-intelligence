import { db } from '../lib/db';
import { env } from '../config/env';
import {
  upsertExecutionForBuyDecision,
  type BuyExecutionRecord,
  type BuyExecutionUpdateInput,
} from '../buyExecutions/service';
import {
  recordOperatorValidationFeedbackWithRepository,
  type OperatorValidationFeedbackCreateInput,
} from '../automation/service';
import {
  buildCommercialAuditMetadata,
  type CommercialAuditMetadataInput,
} from '../audit/commercialAudit';
import {
  createDemandMatchedTradeOpportunityFromApprovedBuyDecision,
  type DemandMatchedTradeOpportunityOutcome,
  syncTradeOpportunityCommercialState,
} from '../deals/service';
import { buildSideEffectAuditMetadata } from '../safety/sideEffectPolicy';
import type { AppliedCorrectionSnapshot } from '../safety/commercialApprovalGuard';
import type { SupplierQualificationStatus } from '../suppliers/qualificationService';

type WorkflowStatus =
  | 'NEW'
  | 'IN_REVIEW'
  | 'NEEDS_INFO'
  | 'APPROVED_TO_BUY'
  | 'REJECTED'
  | 'ORDERED'
  | 'CLOSED';

type WorkflowPriority = 'HIGH' | 'MEDIUM' | 'LOW';

type WorkflowActionType =
  | 'CREATED'
  | 'REOPENED'
  | 'ASSIGNED'
  | 'STARTED_REVIEW'
  | 'MARKED_NEEDS_INFO'
  | 'APPROVED_TO_BUY'
  | 'REJECTED'
  | 'MARKED_ORDERED'
  | 'CLOSED'
  | 'NOTE_ADDED'
  | 'AUTO_CLOSED';

type BuyDecisionApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type BuyDecisionOrderStatus =
  | 'NOT_ORDERED'
  | 'ORDERED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

type BuyDecisionActionType =
  | 'CREATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'MARKED_ORDERED'
  | 'MARKED_PARTIALLY_FULFILLED'
  | 'MARKED_FULFILLED'
  | 'CANCELLED'
  | 'NOTE_ADDED'
  | 'UPDATED_REFERENCE';

type ResolutionCandidate = {
  entityType: 'PRODUCT' | 'SUPPLIER' | 'MANUFACTURER';
  candidateId: string | null;
  candidateName: string;
  confidence: number;
  reason: string;
  selected: boolean;
  metadata?: unknown;
};

export type WorkflowActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type SupplierReviewDetails = {
  supplierName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type SyncWorkflowItemInput = {
  emailDerivedOfferId: string;
  inboundEmailId: string | null;
  offerStatus: 'AUTO_PROMOTED' | 'REVIEW_REQUIRED' | 'REJECTED';
  sourceKind: string | null;
  reviewReason: string | null;
  aiAssisted: boolean;
  sourceTrustScore: number | null;
  promotionConfidence: number | null;
  pricePresent: boolean;
  supplierCandidate: string | null;
  manufacturerCandidate: string | null;
  resolutionCandidates: ResolutionCandidate[];
  supplierQualificationStatus?: SupplierQualificationStatus | null;
  supplierQualificationExpiresAt?: Date | null;
};

export type WorkflowListFilters = {
  status?: WorkflowStatus | null;
  inboundEmailId?: string | null;
  assigneeUserId?: string | null;
  assigneeLabel?: string | null;
  priority?: WorkflowPriority | null;
  sourceKind?: string | null;
  onlyOpen?: boolean;
  staleFirst?: boolean;
  unresolvedSupplier?: boolean;
  conflictingSupplierCues?: boolean;
  manufacturerAmbiguity?: boolean;
  supplierQualificationStatus?: SupplierQualificationStatus | null;
  blockedSupplier?: boolean;
  restrictedSupplier?: boolean;
  unknownQualification?: boolean;
  hasBuyDecision?: boolean;
  take?: number;
};

export type WorkflowActionInput = WorkflowActor & {
  workflowItemId: string;
  note?: string | null;
  externalOrderReference?: string | null;
  allowQualificationRisk?: boolean;
  orderPlacedAt?: Date | null;
  orderedQuantity?: number | null;
  orderedUnitPrice?: unknown;
  orderedCurrencyCode?: string | null;
  orderedMinimumOrderQuantity?: number | null;
  confirmedAvailability?: boolean | null;
  expectedDeliveryDate?: Date | null;
  supplierDetails?: SupplierReviewDetails | null;
  feedback?: Omit<
    OperatorValidationFeedbackCreateInput,
    'offerWorkflowItemId' | 'emailDerivedOfferId'
  > | null;
};

export type AssignWorkflowItemInput = WorkflowActionInput & {
  assigneeUserId?: string | null;
  assigneeLabel?: string | null;
};

export type WorkflowApprovalOutcome = {
  buyDecisionId: string;
  buyDecisionCreated: boolean;
  tradeOpportunityId: string | null;
  tradeOpportunityOutcome: DemandMatchedTradeOpportunityOutcome;
};

export type WorkflowApprovalResult = {
  item: WorkflowRecord;
  outcome: WorkflowApprovalOutcome;
};

type WorkflowRecord = {
  id: string;
  emailDerivedOfferId: string;
  inboundEmailId: string | null;
  status: WorkflowStatus;
  priority: WorkflowPriority;
  priorityReason: string | null;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  latestNote: string | null;
  sourceKind: string | null;
  sourceReviewReason: string | null;
  aiAssisted: boolean;
  hasUnresolvedSupplier: boolean;
  hasConflictingSupplierCues: boolean;
  hasManufacturerAmbiguity: boolean;
  supplierQualificationStatus: SupplierQualificationStatus;
  hasUnknownSupplierQualification: boolean;
  hasRestrictedSupplier: boolean;
  hasBlockedSupplier: boolean;
  qualificationRiskNote: string | null;
  createdByType: string;
  createdByIdentifier: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  emailDerivedOffer?: {
    id: string;
    status: string;
    reviewReason: string | null;
    sourceKind: string;
    sourceBlockText: string;
    rawProductText: string | null;
    normalizedProductNameCandidate: string | null;
    manufacturerCandidate: string | null;
    supplierCandidate: string | null;
    priceCandidate: unknown;
    currencyCandidate: string | null;
    minimumOrderQuantityCandidate: number | null;
    availabilityCandidate: string | null;
    metadata: unknown;
    resolutionCandidates: ResolutionCandidate[];
    offerCorrections?: WorkflowOfferCorrectionRecord[];
    buyDecision?: {
      id: string;
      approvalStatus: BuyDecisionApprovalStatus;
      orderStatus: BuyDecisionOrderStatus;
    } | null;
    updatedAt: Date;
  } | null;
  inboundEmail?: {
    id: string;
    fromEmail: string;
    fromName: string | null;
    subject: string | null;
    receivedAt: Date | null;
    senderDomain?: string | null;
    sourceTemplateFingerprint?: string | null;
  } | null;
  buyDecision?: {
    id: string;
    approvalStatus: BuyDecisionApprovalStatus;
    orderStatus: BuyDecisionOrderStatus;
    supplierQualificationStatus: SupplierQualificationStatus;
    hasQualificationRisk: boolean;
    quotedUnitPrice?: unknown;
    quotedCurrencyCode?: string | null;
    quotedMinimumOrderQuantity?: number | null;
    quotedAvailability?: string | null;
    orderedAt?: Date | null;
    externalOrderReference?: string | null;
    supplierId?: string | null;
    productId?: string | null;
    execution?: BuyExecutionRecord | null;
  } | null;
};

type WorkflowInboundEmailDocumentRecord = {
  id: string;
  kind: string;
  documentIndex: number;
  label: string | null;
  textContent: string;
  metadata: unknown;
};

type WorkflowOfferCorrectionRecord = {
  id: string;
  correctionStatus: string;
  correctedSupplierId: string | null;
  correctedSupplierName: string | null;
  correctedProductId: string | null;
  correctedRawProductText: string | null;
  correctedNormalizedProductName: string | null;
  correctedStrength: string | null;
  correctedDosageForm: string | null;
  correctedPackSize: string | null;
  correctedManufacturer: string | null;
  correctedUnitPrice: unknown;
  correctedCurrencyCode: string | null;
  correctedMinimumOrderQuantity: number | null;
  correctedAvailability: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SupplierContactDetails = {
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  domain: string | null;
  source: string | null;
};

type WorkflowDetailRecord = WorkflowRecord & {
  emailDerivedOffer?:
    | (NonNullable<WorkflowRecord['emailDerivedOffer']> & {
        strengthCandidate: string | null;
        dosageFormCandidate: string | null;
        packSizeCandidate: string | null;
        supplierCandidate: string | null;
        sourceTrustScore: number | null;
        structureConfidence: number | null;
        fieldConfidence: number | null;
        entityResolutionConfidence: number | null;
        promotionConfidence: number | null;
        sourceDocument?: WorkflowInboundEmailDocumentRecord | null;
        offerCorrections?: WorkflowOfferCorrectionRecord[];
        relatedOfferCorrections?: WorkflowOfferCorrectionRecord[];
      })
    | null;
  inboundEmail?:
    | (NonNullable<WorkflowRecord['inboundEmail']> & {
        rawHtml: string | null;
        rawText: string | null;
        triageStatus: string | null;
        processingStatus: string;
        reviewReason: string | null;
        senderDomain?: string | null;
        sourceTemplateFingerprint?: string | null;
        documents: WorkflowInboundEmailDocumentRecord[];
      })
    | null;
  supplierContact?: SupplierContactDetails | null;
};

type WorkflowEventRecord = {
  id: string;
  workflowItemId: string;
  actionType: WorkflowActionType;
  previousStatus: WorkflowStatus | null;
  newStatus: WorkflowStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

type BuyDecisionEventRecord = {
  id: string;
  buyDecisionId: string;
  actionType: BuyDecisionActionType;
  previousApprovalStatus: BuyDecisionApprovalStatus | null;
  newApprovalStatus: BuyDecisionApprovalStatus | null;
  previousOrderStatus: BuyDecisionOrderStatus | null;
  newOrderStatus: BuyDecisionOrderStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

type BuyExecutionEventRecord = {
  id: string;
  buyExecutionId: string;
  actionType: string;
  previousFulfillmentStatus: string | null;
  newFulfillmentStatus: string | null;
  previousReconciliationStatus: string | null;
  newReconciliationStatus: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

type OfferCorrectionEventRecord = {
  id: string;
  offerCorrectionId: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

type TradeOpportunityEventRecord = {
  id: string;
  tradeOpportunityId: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string | null;
  previousStage: string | null;
  newStage: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type WorkflowAuditHistoryEntry = {
  id: string;
  entityType:
    | 'OFFER_WORKFLOW_ITEM'
    | 'BUY_DECISION'
    | 'BUY_EXECUTION'
    | 'OFFER_CORRECTION'
    | 'TRADE_OPPORTUNITY';
  entityId: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

type SupplierQualificationRecord = {
  id: string;
  supplierId: string;
  qualificationStatus: SupplierQualificationStatus;
  trustTier: 'HIGH' | 'MEDIUM' | 'LOW';
  qualificationNote: string | null;
  requiresManualApproval: boolean;
  canAutoApproveBuyDecisions: boolean;
  expiresAt: Date | null;
};

type BuyDecisionRecord = {
  id: string;
  emailDerivedOfferId: string;
  offerWorkflowItemId: string | null;
  supplierId: string | null;
  productId: string | null;
  quotedUnitPrice: unknown;
  quotedCurrencyCode: string | null;
  quotedMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  approvalStatus: BuyDecisionApprovalStatus;
  orderStatus: BuyDecisionOrderStatus;
  approvalNote: string | null;
  approvedAt: Date | null;
  externalOrderReference: string | null;
  orderedAt: Date | null;
  supplierQualificationStatus: SupplierQualificationStatus;
  hasQualificationRisk: boolean;
  qualificationRiskNote: string | null;
  execution?: BuyExecutionRecord | null;
  metadata?: unknown;
  emailDerivedOffer?: {
    offerCorrections?: AppliedCorrectionSnapshot[];
  } | null;
};

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

type WorkflowRepository = {
  transaction: <T>(
    callback: (repository: WorkflowRepository) => Promise<T>,
  ) => Promise<T>;
  findWorkflowItemByOfferId: (
    emailDerivedOfferId: string,
  ) => Promise<WorkflowRecord | null>;
  findWorkflowItemById: (
    workflowItemId: string,
  ) => Promise<WorkflowRecord | null>;
  findWorkflowDetailById: (
    workflowItemId: string,
  ) => Promise<WorkflowDetailRecord | null>;
  createWorkflowItem: (
    data: Partial<WorkflowRecord> &
      Pick<
        WorkflowRecord,
        | 'emailDerivedOfferId'
        | 'status'
        | 'priority'
        | 'createdByType'
        | 'supplierQualificationStatus'
        | 'hasUnknownSupplierQualification'
        | 'hasRestrictedSupplier'
        | 'hasBlockedSupplier'
      >,
  ) => Promise<WorkflowRecord>;
  updateWorkflowItem: (
    workflowItemId: string,
    data: Partial<WorkflowRecord>,
  ) => Promise<WorkflowRecord>;
  createWorkflowEvent: (
    data: Omit<WorkflowEventRecord, 'id' | 'createdAt'>,
  ) => Promise<WorkflowEventRecord>;
  listWorkflowItems: (
    filters: WorkflowListFilters,
  ) => Promise<WorkflowRecord[]>;
  listWorkflowEvents: (
    workflowItemId: string,
  ) => Promise<WorkflowEventRecord[]>;
  listBuyDecisionEvents: (
    buyDecisionId: string,
  ) => Promise<BuyDecisionEventRecord[]>;
  listBuyExecutionEvents: (
    buyExecutionId: string,
  ) => Promise<BuyExecutionEventRecord[]>;
  listOfferCorrectionEventsForWorkflow: (
    workflowItemId: string,
  ) => Promise<OfferCorrectionEventRecord[]>;
  listTradeOpportunityEventsForWorkflow: (input: {
    workflowItemId: string;
    emailDerivedOfferId: string;
    buyDecisionId?: string | null;
    buyExecutionId?: string | null;
  }) => Promise<TradeOpportunityEventRecord[]>;
  findSupplierQualificationBySupplierId: (
    supplierId: string,
  ) => Promise<SupplierQualificationRecord | null>;
  findBuyDecisionByOfferId: (
    emailDerivedOfferId: string,
  ) => Promise<BuyDecisionRecord | null>;
  createBuyDecision: (
    data: Record<string, unknown>,
  ) => Promise<BuyDecisionRecord>;
  updateBuyDecision: (
    buyDecisionId: string,
    data: Record<string, unknown>,
  ) => Promise<BuyDecisionRecord>;
  createBuyDecisionEvent: (data: Record<string, unknown>) => Promise<void>;
  findBuyExecutionByDecisionId: (
    buyDecisionId: string,
  ) => Promise<BuyExecutionRecord | null>;
  createBuyExecution: Parameters<
    typeof upsertExecutionForBuyDecision
  >[0]['create'];
  updateBuyExecution: Parameters<
    typeof upsertExecutionForBuyDecision
  >[0]['update'];
  createBuyExecutionEvent: Parameters<
    typeof upsertExecutionForBuyDecision
  >[0]['createEvent'];
  findRecentMatchingFeedback: Parameters<
    typeof recordOperatorValidationFeedbackWithRepository
  >[0]['findRecentMatchingFeedback'];
  createFeedback: Parameters<
    typeof recordOperatorValidationFeedbackWithRepository
  >[0]['createFeedback'];
  findTradeMessageDraftById?: Parameters<
    typeof recordOperatorValidationFeedbackWithRepository
  >[0]['findTradeMessageDraftById'];
  listActiveTradeOpportunitiesByOfferId: (
    emailDerivedOfferId: string,
  ) => Promise<any[]>;
  createTradeOpportunity: (data: Record<string, unknown>) => Promise<any>;
  createTradeOpportunityPolicy: (data: Record<string, unknown>) => Promise<any>;
  updateTradeOpportunity: (
    tradeOpportunityId: string,
    data: Record<string, unknown>,
  ) => Promise<any>;
  createTradeOpportunityEvent: (data: Record<string, unknown>) => Promise<any>;
  listRecentSalesByProductId: (input: {
    productId: string;
    windowStart: Date;
    currencyCode: string;
  }) => Promise<
    Array<{
      customerId: string;
      customerName: string;
      quantity: number;
      unitPrice: unknown;
      totalRevenue: unknown;
      saleDate: Date;
      currencyCode: string;
    }>
  >;
};

type NormalizedActor = {
  actorType: string;
  actorIdentifier: string | null;
};

const OPEN_WORKFLOW_STATUSES = new Set<WorkflowStatus>([
  'NEW',
  'IN_REVIEW',
  'NEEDS_INFO',
  'APPROVED_TO_BUY',
  'ORDERED',
]);

function normalizeActor(actor?: WorkflowActor): NormalizedActor {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function normalizeSupplierReviewDetails(
  details: SupplierReviewDetails | null | undefined,
): SupplierReviewDetails | null {
  if (!details) {
    return null;
  }

  const normalized = {
    supplierName: details.supplierName?.trim() || null,
    contactName: details.contactName?.trim() || null,
    email: details.email?.trim() || null,
    phone: details.phone?.trim() || null,
  };

  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function buildSupplierReviewDetailsNote(
  details: SupplierReviewDetails | null,
): string | null {
  if (!details) {
    return null;
  }

  const parts = [
    details.supplierName ? `Supplier: ${details.supplierName}` : null,
    details.contactName ? `Contact: ${details.contactName}` : null,
    details.email ? `Email: ${details.email}` : null,
    details.phone ? `Phone: ${details.phone}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? `Supplier details entered: ${parts.join('; ')}`
    : null;
}

function buildWorkflowActionNote(
  note: string | null | undefined,
  supplierDetails: SupplierReviewDetails | null,
): string | null {
  const trimmedNote = note?.trim() || null;
  const supplierDetailsNote = buildSupplierReviewDetailsNote(supplierDetails);

  if (trimmedNote && supplierDetailsNote) {
    return `${trimmedNote}\n\n${supplierDetailsNote}`;
  }

  return trimmedNote ?? supplierDetailsNote;
}

function isOpenWorkflowStatus(status: WorkflowStatus): boolean {
  return OPEN_WORKFLOW_STATUSES.has(status);
}

function normalizeSupplierIdentityToken(
  value: string | null | undefined,
): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeEmailDomain(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase().replace(/^@+/, '') ?? '';
  return trimmed || null;
}

function extractEmailDomain(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? '';
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex < 0) {
    return null;
  }

  return normalizeEmailDomain(trimmed.slice(atIndex + 1));
}

function isInternalSupplierDomain(domain: string | null | undefined): boolean {
  const normalizedDomain = normalizeEmailDomain(domain);

  if (!normalizedDomain) {
    return false;
  }

  return env.emailInboundInternalDomains.some((entry) => {
    const normalizedEntry = normalizeEmailDomain(entry);
    return (
      Boolean(normalizedEntry) &&
      (normalizedDomain === normalizedEntry ||
        normalizedDomain.endsWith(`.${normalizedEntry}`))
    );
  });
}

function isInternalSupplierCompanyName(
  candidateName: string | null | undefined,
): boolean {
  const normalizedCandidate = normalizeSupplierIdentityToken(candidateName);

  if (!normalizedCandidate) {
    return false;
  }

  return env.emailInboundInternalCompanyNames.some((entry) => {
    const normalizedEntry = normalizeSupplierIdentityToken(entry);
    return (
      Boolean(normalizedEntry) &&
      (normalizedCandidate === normalizedEntry ||
        normalizedCandidate.includes(normalizedEntry) ||
        normalizedEntry.includes(normalizedCandidate))
    );
  });
}

function collectExternalEmails(
  documents: WorkflowInboundEmailDocumentRecord[],
): Array<{ value: string; kind: string }> {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emails: Array<{ value: string; kind: string }> = [];
  const seen = new Set<string>();

  for (const document of documents) {
    const matches = document.textContent.match(emailPattern) ?? [];

    for (const match of matches) {
      const normalizedEmail = match.trim().toLowerCase();
      const domain = extractEmailDomain(normalizedEmail);

      if (
        !normalizedEmail ||
        isInternalSupplierDomain(domain) ||
        seen.has(normalizedEmail)
      ) {
        continue;
      }

      seen.add(normalizedEmail);
      emails.push({
        value: normalizedEmail,
        kind: document.kind,
      });
    }
  }

  return emails;
}

function collectPhoneNumbers(
  documents: WorkflowInboundEmailDocumentRecord[],
): Array<{ value: string; kind: string }> {
  const phonePattern = /(?:^|[\s:])(\+?\d[\d\s()./-]{6,}\d)(?=$|\s)/g;
  const phones: Array<{ value: string; kind: string }> = [];
  const seen = new Set<string>();

  for (const document of documents) {
    const lines = document.textContent.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        !/(?:^|\b)(?:m|mob|mobile|tel|telephone|phone|fax)\s*:|\+\d/.test(
          trimmed,
        )
      ) {
        continue;
      }

      for (const match of trimmed.matchAll(phonePattern)) {
        const phone = match[1]?.trim().replace(/\s{2,}/g, ' ') ?? '';

        if (!phone || seen.has(phone)) {
          continue;
        }

        seen.add(phone);
        phones.push({
          value: phone,
          kind: document.kind,
        });
      }
    }
  }

  return phones;
}

function extractContactName(
  documents: WorkflowInboundEmailDocumentRecord[],
): string | null {
  const preferredDocuments = documents.filter((document) =>
    ['BODY_FORWARDED', 'SIGNATURE'].includes(document.kind),
  );
  const text = preferredDocuments
    .map((document) => document.textContent)
    .join('\n\n');

  const signoffMatch = text.match(
    /(?:kind regards|best regards|regards|thanks|many thanks|best)[,\s]*\n+([A-Z][A-Za-z'’-]+(?:[ \t]+[A-Z][A-Za-z'’-]+){1,2})/i,
  );
  const candidate = signoffMatch?.[1]?.trim() ?? null;

  if (!candidate || isInternalSupplierCompanyName(candidate)) {
    return null;
  }

  return candidate;
}

function deriveSupplierContact(
  detail: WorkflowDetailRecord,
): SupplierContactDetails | null {
  const documents = detail.inboundEmail?.documents ?? [];
  const externalEmails = collectExternalEmails(documents);
  const externalPhones = collectPhoneNumbers(documents);
  const supplierCandidates = (
    detail.emailDerivedOffer?.resolutionCandidates ?? []
  )
    .filter(
      (candidate) =>
        candidate.entityType === 'SUPPLIER' &&
        !isInternalSupplierCompanyName(candidate.candidateName),
    )
    .sort(
      (left, right) =>
        Number(right.selected) - Number(left.selected) ||
        right.confidence - left.confidence ||
        left.candidateName.localeCompare(right.candidateName),
    );
  const companyNames = Array.from(
    new Set(
      supplierCandidates
        .map((candidate) => candidate.candidateName.trim())
        .filter(Boolean),
    ),
  ).slice(0, 2);
  const email = externalEmails[0] ?? null;
  const phone = externalPhones[0] ?? null;
  const contactName = extractContactName(documents);
  const sourceKinds = new Set([
    ...externalEmails.map((item) => item.kind),
    ...externalPhones.map((item) => item.kind),
  ]);
  if (
    supplierCandidates.some((candidate) =>
      candidate.reason.startsWith('forwarded_'),
    )
  ) {
    sourceKinds.add('BODY_FORWARDED');
  }
  if (
    supplierCandidates.some(
      (candidate) => candidate.reason === 'attachment_filename_company_cue',
    )
  ) {
    sourceKinds.add('ATTACHMENT_FILENAME');
  }
  const source =
    sourceKinds.has('BODY_FORWARDED') || sourceKinds.has('SIGNATURE')
      ? 'Forwarded email'
      : sourceKinds.has('ATTACHMENT_FILENAME')
        ? 'Attachment filename'
        : sourceKinds.size > 0
          ? 'Email body'
          : null;

  const supplierContact: SupplierContactDetails = {
    companyName: companyNames.length > 0 ? companyNames.join(' / ') : null,
    contactName,
    email: email?.value ?? null,
    phone: phone?.value ?? null,
    domain: email ? extractEmailDomain(email.value) : null,
    source,
  };

  return Object.values(supplierContact).some((value) => Boolean(value))
    ? supplierContact
    : null;
}

function createWorkflowRepository(
  client: typeof db = db,
  inTransaction = false,
): WorkflowRepository {
  return {
    transaction: async (callback) => {
      if (inTransaction) {
        return callback(createWorkflowRepository(client, true));
      }

      return db.$transaction(async (tx) =>
        callback(createWorkflowRepository(tx as never, true)),
      );
    },
    findWorkflowItemByOfferId: async (emailDerivedOfferId) =>
      client.offerWorkflowItem.findUnique({
        where: { emailDerivedOfferId },
        include: {
          inboundEmail: true,
          buyDecision: {
            include: {
              execution: true,
            },
          },
          emailDerivedOffer: {
            include: {
              offerCorrections: {
                where: { correctionStatus: 'APPLIED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              resolutionCandidates: true,
              buyDecision: {
                include: {
                  execution: true,
                },
              },
            },
          },
        },
      }) as Promise<WorkflowRecord | null>,
    findWorkflowItemById: async (workflowItemId) =>
      client.offerWorkflowItem.findUnique({
        where: { id: workflowItemId },
        include: {
          inboundEmail: true,
          buyDecision: {
            include: {
              execution: true,
            },
          },
          emailDerivedOffer: {
            include: {
              offerCorrections: {
                where: { correctionStatus: 'APPLIED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              resolutionCandidates: true,
              buyDecision: {
                include: {
                  execution: true,
                },
              },
            },
          },
        },
      }) as Promise<WorkflowRecord | null>,
    findWorkflowDetailById: async (workflowItemId) => {
      const detail = (await client.offerWorkflowItem.findUnique({
        where: { id: workflowItemId },
        include: {
          inboundEmail: {
            include: {
              documents: {
                orderBy: { documentIndex: 'asc' },
              },
            },
          },
          buyDecision: {
            include: {
              execution: true,
            },
          },
          emailDerivedOffer: {
            include: {
              sourceDocument: true,
              offerCorrections: {
                orderBy: { createdAt: 'desc' },
                take: 5,
              },
              resolutionCandidates: true,
              buyDecision: {
                include: {
                  execution: true,
                },
              },
            },
          },
        },
      })) as WorkflowDetailRecord | null;

      if (!detail?.emailDerivedOffer || !detail.inboundEmail) {
        return detail;
      }

      const senderEmail = detail.inboundEmail.fromEmail;
      const senderDomain = detail.inboundEmail.senderDomain;
      const templateFingerprint = detail.inboundEmail.sourceTemplateFingerprint;
      const relatedCorrectionFilters = [
        senderEmail
          ? { inboundEmail: { is: { fromEmail: senderEmail } } }
          : null,
        senderDomain && templateFingerprint
          ? {
              inboundEmail: {
                is: {
                  senderDomain,
                  sourceTemplateFingerprint: templateFingerprint,
                },
              },
            }
          : null,
      ].filter(Boolean) as Array<Record<string, unknown>>;

      if (relatedCorrectionFilters.length === 0) {
        return detail;
      }

      detail.emailDerivedOffer.relatedOfferCorrections =
        (await client.offerCorrection.findMany({
          where: {
            correctionStatus: 'APPLIED',
            emailDerivedOfferId: { not: detail.emailDerivedOfferId },
            OR: relatedCorrectionFilters,
          },
          orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
          take: 5,
        })) as WorkflowOfferCorrectionRecord[];

      return detail;
    },
    createWorkflowItem: async (data) =>
      client.offerWorkflowItem.create({
        data: data as never,
        include: {
          inboundEmail: true,
          buyDecision: {
            include: {
              execution: true,
            },
          },
          emailDerivedOffer: {
            include: {
              offerCorrections: {
                where: { correctionStatus: 'APPLIED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              resolutionCandidates: true,
              buyDecision: {
                include: {
                  execution: true,
                },
              },
            },
          },
        },
      }) as Promise<WorkflowRecord>,
    updateWorkflowItem: async (workflowItemId, data) =>
      client.offerWorkflowItem.update({
        where: { id: workflowItemId },
        data: data as never,
        include: {
          inboundEmail: true,
          buyDecision: {
            include: {
              execution: true,
            },
          },
          emailDerivedOffer: {
            include: {
              offerCorrections: {
                where: { correctionStatus: 'APPLIED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              resolutionCandidates: true,
              buyDecision: {
                include: {
                  execution: true,
                },
              },
            },
          },
        },
      }) as Promise<WorkflowRecord>,
    createWorkflowEvent: async (data) =>
      client.offerWorkflowEvent.create({
        data: data as never,
      }) as Promise<WorkflowEventRecord>,
    listWorkflowItems: async (filters) => {
      const where: Record<string, unknown> = {};

      if (filters.status) {
        where.status = filters.status;
      } else if (filters.onlyOpen) {
        where.status = { in: Array.from(OPEN_WORKFLOW_STATUSES) };
      }
      if (filters.inboundEmailId) {
        where.inboundEmailId = filters.inboundEmailId;
      }
      if (filters.assigneeUserId) {
        where.assigneeUserId = filters.assigneeUserId;
      }
      if (filters.assigneeLabel) {
        where.assigneeLabel = filters.assigneeLabel;
      }
      if (filters.priority) {
        where.priority = filters.priority;
      }
      if (filters.sourceKind) {
        where.sourceKind = filters.sourceKind;
      }
      if (filters.unresolvedSupplier === true) {
        where.hasUnresolvedSupplier = true;
      }
      if (filters.conflictingSupplierCues === true) {
        where.hasConflictingSupplierCues = true;
      }
      if (filters.manufacturerAmbiguity === true) {
        where.hasManufacturerAmbiguity = true;
      }
      if (filters.supplierQualificationStatus) {
        where.supplierQualificationStatus = filters.supplierQualificationStatus;
      }
      if (filters.blockedSupplier === true) {
        where.hasBlockedSupplier = true;
      }
      if (filters.restrictedSupplier === true) {
        where.hasRestrictedSupplier = true;
      }
      if (filters.unknownQualification === true) {
        where.hasUnknownSupplierQualification = true;
      }
      if (typeof filters.hasBuyDecision === 'boolean') {
        where.buyDecision = filters.hasBuyDecision
          ? { isNot: null }
          : { is: null };
      }

      const orderBy = (
        filters.staleFirst
          ? [{ priority: 'asc' }, { createdAt: 'asc' }]
          : [{ priority: 'asc' }, { updatedAt: 'desc' }]
      ) as never;

      return (await client.offerWorkflowItem.findMany({
        where,
        include: {
          inboundEmail: true,
          buyDecision: {
            include: {
              execution: true,
            },
          },
          emailDerivedOffer: {
            include: {
              offerCorrections: {
                where: { correctionStatus: 'APPLIED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              resolutionCandidates: true,
              buyDecision: {
                include: {
                  execution: true,
                },
              },
            },
          },
        },
        orderBy,
        take: filters.take ?? 100,
      })) as WorkflowRecord[];
    },
    listWorkflowEvents: async (workflowItemId) =>
      (await client.offerWorkflowEvent.findMany({
        where: { workflowItemId },
        orderBy: { createdAt: 'asc' },
      })) as WorkflowEventRecord[],
    listBuyDecisionEvents: async (buyDecisionId) =>
      (await client.buyDecisionEvent.findMany({
        where: { buyDecisionId },
        orderBy: { createdAt: 'asc' },
      })) as BuyDecisionEventRecord[],
    listBuyExecutionEvents: async (buyExecutionId) =>
      (await client.buyExecutionEvent.findMany({
        where: { buyExecutionId },
        orderBy: { createdAt: 'asc' },
      })) as BuyExecutionEventRecord[],
    listOfferCorrectionEventsForWorkflow: async (workflowItemId) => {
      const corrections = await client.offerCorrection.findMany({
        where: { offerWorkflowItemId: workflowItemId },
        select: { id: true },
      });
      const correctionIds = corrections.map((correction) => correction.id);

      if (correctionIds.length === 0) {
        return [];
      }

      return (await client.offerCorrectionEvent.findMany({
        where: {
          offerCorrectionId: {
            in: correctionIds,
          },
        },
        orderBy: { createdAt: 'asc' },
      })) as OfferCorrectionEventRecord[];
    },
    listTradeOpportunityEventsForWorkflow: async (input) => {
      const tradeOpportunities = await client.tradeOpportunity.findMany({
        where: {
          OR: [
            { offerWorkflowItemId: input.workflowItemId },
            { emailDerivedOfferId: input.emailDerivedOfferId },
            ...(input.buyDecisionId
              ? [{ buyDecisionId: input.buyDecisionId }]
              : []),
            ...(input.buyExecutionId
              ? [{ buyExecutionId: input.buyExecutionId }]
              : []),
          ],
        },
        select: { id: true },
      });
      const tradeOpportunityIds = tradeOpportunities.map((item) => item.id);

      if (tradeOpportunityIds.length === 0) {
        return [];
      }

      return (await client.tradeOpportunityEvent.findMany({
        where: {
          tradeOpportunityId: {
            in: tradeOpportunityIds,
          },
        },
        orderBy: { createdAt: 'asc' },
      })) as TradeOpportunityEventRecord[];
    },
    findSupplierQualificationBySupplierId: async (supplierId) =>
      client.supplierQualification.findUnique({
        where: { supplierId },
      }) as Promise<SupplierQualificationRecord | null>,
    findBuyDecisionByOfferId: async (emailDerivedOfferId) =>
      client.buyDecision.findUnique({
        where: { emailDerivedOfferId },
        include: {
          execution: true,
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
      }) as Promise<BuyDecisionRecord | null>,
    createBuyDecision: async (data) =>
      client.buyDecision.create({
        data: data as never,
        include: {
          execution: true,
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
      }) as Promise<BuyDecisionRecord>,
    updateBuyDecision: async (buyDecisionId, data) =>
      client.buyDecision.update({
        where: { id: buyDecisionId },
        data: data as never,
        include: {
          execution: true,
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
      }) as Promise<BuyDecisionRecord>,
    createBuyDecisionEvent: async (data) => {
      await client.buyDecisionEvent.create({
        data: data as never,
      });
    },
    findBuyExecutionByDecisionId: async (buyDecisionId) =>
      client.buyExecution.findUnique({
        where: { buyDecisionId },
      }) as Promise<BuyExecutionRecord | null>,
    createBuyExecution: async (data) =>
      client.buyExecution.create({
        data: data as never,
      }) as Promise<BuyExecutionRecord>,
    updateBuyExecution: async (buyExecutionId, data) =>
      client.buyExecution.update({
        where: { id: buyExecutionId },
        data: data as never,
      }) as Promise<BuyExecutionRecord>,
    createBuyExecutionEvent: async (data) =>
      client.buyExecutionEvent.create({
        data: data as never,
      }) as Promise<any>,
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
    createTradeOpportunity: async (data) =>
      client.tradeOpportunity.create({
        data: data as never,
      }) as Promise<any>,
    createTradeOpportunityPolicy: async (data) =>
      client.tradeOpportunityMessagingPolicy.create({
        data: data as never,
      }) as Promise<any>,
    updateTradeOpportunity: async (tradeOpportunityId, data) =>
      client.tradeOpportunity.update({
        where: { id: tradeOpportunityId },
        data: data as never,
      }) as Promise<any>,
    createTradeOpportunityEvent: async (data) =>
      client.tradeOpportunityEvent.create({
        data: data as never,
      }) as Promise<any>,
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
        ) as Promise<any>,
  };
}

function buildWorkflowFlags(input: SyncWorkflowItemInput): {
  hasUnresolvedSupplier: boolean;
  hasConflictingSupplierCues: boolean;
  hasManufacturerAmbiguity: boolean;
} {
  const selectedSuppliers = input.resolutionCandidates.filter(
    (candidate) => candidate.entityType === 'SUPPLIER' && candidate.selected,
  );
  const selectedResolvedSuppliers = selectedSuppliers.filter((candidate) =>
    Boolean(candidate.candidateId),
  );
  const supplierCandidates = input.resolutionCandidates.filter(
    (candidate) => candidate.entityType === 'SUPPLIER',
  );
  const primaryConflictSupplierCandidates = supplierCandidates.filter(
    (candidate) =>
      ![
        'body_company_cue',
        'attachment_text_company_cue',
        'attachment_filename_company_cue',
      ].includes(candidate.reason),
  );
  const manufacturerCandidates = input.resolutionCandidates.filter(
    (candidate) => candidate.entityType === 'MANUFACTURER',
  );

  return {
    hasUnresolvedSupplier: selectedResolvedSuppliers.length === 0,
    hasConflictingSupplierCues:
      input.reviewReason === 'conflicting_supplier_cues' ||
      supplierCandidates.some((candidate) => {
        if (
          !candidate.metadata ||
          typeof candidate.metadata !== 'object' ||
          Array.isArray(candidate.metadata)
        ) {
          return false;
        }

        return (
          (candidate.metadata as { ambiguous?: boolean }).ambiguous === true
        );
      }) ||
      (primaryConflictSupplierCandidates.length > 1 &&
        selectedResolvedSuppliers.length === 0),
    hasManufacturerAmbiguity:
      !input.manufacturerCandidate &&
      manufacturerCandidates.filter((candidate) => candidate.confidence >= 50)
        .length > 1,
  };
}

function buildQualificationSnapshot(
  qualificationStatus: SupplierQualificationStatus | null,
  hasUnresolvedSupplier: boolean,
  expiresAt: Date | null = null,
): {
  supplierQualificationStatus: SupplierQualificationStatus;
  hasUnknownSupplierQualification: boolean;
  hasRestrictedSupplier: boolean;
  hasBlockedSupplier: boolean;
  qualificationRiskNote: string | null;
} {
  const normalizedStatus = hasUnresolvedSupplier
    ? 'UNKNOWN'
    : (qualificationStatus ?? 'UNKNOWN');

  if (normalizedStatus === 'BLOCKED') {
    return {
      supplierQualificationStatus: normalizedStatus,
      hasUnknownSupplierQualification: false,
      hasRestrictedSupplier: false,
      hasBlockedSupplier: true,
      qualificationRiskNote:
        'Supplier is blocked and cannot be approved under the normal buying flow.',
    };
  }

  if (normalizedStatus === 'RESTRICTED') {
    return {
      supplierQualificationStatus: normalizedStatus,
      hasUnknownSupplierQualification: false,
      hasRestrictedSupplier: true,
      hasBlockedSupplier: false,
      qualificationRiskNote:
        'Supplier is restricted and requires explicit operator approval.',
    };
  }

  if (normalizedStatus === 'UNKNOWN' || normalizedStatus === 'PENDING_REVIEW') {
    return {
      supplierQualificationStatus: normalizedStatus,
      hasUnknownSupplierQualification: true,
      hasRestrictedSupplier: false,
      hasBlockedSupplier: false,
      qualificationRiskNote:
        normalizedStatus === 'PENDING_REVIEW'
          ? 'Supplier qualification is pending review.'
          : 'Supplier qualification is unknown and should be reviewed before purchase.',
    };
  }

  // An otherwise-APPROVED qualification past its expiry has lapsed (the periodic
  // WDA/GDP re-vetting a UK wholesaler must enforce). Treat it as needing review
  // so the buy-approval gate requires explicit operator re-confirmation rather
  // than silently clearing an expired supplier.
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return {
      supplierQualificationStatus: 'PENDING_REVIEW',
      hasUnknownSupplierQualification: true,
      hasRestrictedSupplier: false,
      hasBlockedSupplier: false,
      qualificationRiskNote: `Supplier qualification expired on ${expiresAt
        .toISOString()
        .slice(0, 10)} and must be re-vetted before purchase.`,
    };
  }

  return {
    supplierQualificationStatus: normalizedStatus,
    hasUnknownSupplierQualification: false,
    hasRestrictedSupplier: false,
    hasBlockedSupplier: false,
    qualificationRiskNote: null,
  };
}

function resolveSelectedEntityIds(
  resolutionCandidates: ResolutionCandidate[],
): {
  supplierId: string | null;
  productId: string | null;
} {
  return {
    supplierId:
      resolutionCandidates.find(
        (candidate) =>
          candidate.entityType === 'SUPPLIER' && candidate.selected,
      )?.candidateId ?? null,
    productId:
      resolutionCandidates.find(
        (candidate) => candidate.entityType === 'PRODUCT' && candidate.selected,
      )?.candidateId ?? null,
  };
}

export function determineWorkflowPriority(input: SyncWorkflowItemInput): {
  priority: WorkflowPriority;
  priorityReason: string;
  hasUnresolvedSupplier: boolean;
  hasConflictingSupplierCues: boolean;
  hasManufacturerAmbiguity: boolean;
  supplierQualificationStatus: SupplierQualificationStatus;
  hasUnknownSupplierQualification: boolean;
  hasRestrictedSupplier: boolean;
  hasBlockedSupplier: boolean;
  qualificationRiskNote: string | null;
} {
  const flags = buildWorkflowFlags(input);
  const qualification = buildQualificationSnapshot(
    input.supplierQualificationStatus ?? null,
    flags.hasUnresolvedSupplier,
    input.supplierQualificationExpiresAt ?? null,
  );
  const sourceKind = input.sourceKind ?? '';

  if (qualification.hasBlockedSupplier) {
    return {
      priority: 'HIGH',
      priorityReason:
        'blocked supplier requires immediate operator resolution before any buying action.',
      ...flags,
      ...qualification,
    };
  }

  if (qualification.hasRestrictedSupplier) {
    return {
      priority: 'HIGH',
      priorityReason:
        'restricted supplier requires explicit internal approval and careful handling.',
      ...flags,
      ...qualification,
    };
  }

  if (flags.hasConflictingSupplierCues) {
    return {
      priority: 'HIGH',
      priorityReason:
        'conflicting supplier cues require operator review before buying.',
      ...flags,
      ...qualification,
    };
  }

  if (flags.hasUnresolvedSupplier && input.pricePresent) {
    return {
      priority: 'HIGH',
      priorityReason:
        'explicit pricing is present but supplier resolution is still unresolved.',
      ...flags,
      ...qualification,
    };
  }

  if (
    !input.aiAssisted &&
    input.pricePresent &&
    (input.promotionConfidence ?? 0) >= 70
  ) {
    return {
      priority: 'HIGH',
      priorityReason:
        'clear deterministic offer is close to promotion threshold but still needs review.',
      ...flags,
      ...qualification,
    };
  }

  if (
    qualification.hasUnknownSupplierQualification ||
    input.aiAssisted ||
    sourceKind.includes('ATTACHMENT_TABLE') ||
    flags.hasManufacturerAmbiguity ||
    (input.sourceTrustScore ?? 0) >= 60 ||
    (input.promotionConfidence ?? 0) >= 55
  ) {
    return {
      priority: 'MEDIUM',
      priorityReason:
        'commercially relevant offer should be reviewed in the normal operator queue.',
      ...flags,
      ...qualification,
    };
  }

  return {
    priority: 'LOW',
    priorityReason:
      'offer remains reviewable but the extraction signal is weaker than higher-priority items.',
    ...flags,
    ...qualification,
  };
}

async function logWorkflowEvent(
  repository: WorkflowRepository,
  workflowItemId: string,
  actionType: WorkflowActionType,
  previousStatus: WorkflowStatus | null,
  newStatus: WorkflowStatus | null,
  actor: NormalizedActor,
  note?: string | null,
  metadata?: unknown,
  auditContext?: Partial<
    Pick<
      CommercialAuditMetadataInput,
      'source' | 'confidence' | 'changedFields'
    >
  >,
): Promise<void> {
  await repository.createWorkflowEvent({
    workflowItemId,
    actionType,
    previousStatus,
    newStatus,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note: note?.trim() || null,
    metadata: buildCommercialAuditMetadata(
      {
        entityType: 'OFFER_WORKFLOW_ITEM',
        entityId: workflowItemId,
        action: actionType,
        status: {
          previous: previousStatus,
          next: newStatus,
        },
        source: auditContext?.source,
        confidence: auditContext?.confidence,
        changedFields: auditContext?.changedFields,
      },
      metadata,
    ),
  });
}

async function logBuyDecisionEvent(
  repository: WorkflowRepository,
  buyDecisionId: string,
  actionType: BuyDecisionActionType,
  previousApprovalStatus: BuyDecisionApprovalStatus | null,
  newApprovalStatus: BuyDecisionApprovalStatus | null,
  previousOrderStatus: BuyDecisionOrderStatus | null,
  newOrderStatus: BuyDecisionOrderStatus | null,
  actor: NormalizedActor,
  note?: string | null,
  metadata?: unknown,
  auditContext?: Partial<
    Pick<
      CommercialAuditMetadataInput,
      'source' | 'confidence' | 'changedFields'
    >
  >,
): Promise<void> {
  await repository.createBuyDecisionEvent({
    buyDecisionId,
    actionType,
    previousApprovalStatus,
    newApprovalStatus,
    previousOrderStatus,
    newOrderStatus,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note: note?.trim() || null,
    metadata: buildCommercialAuditMetadata(
      {
        entityType: 'BUY_DECISION',
        entityId: buyDecisionId,
        action: actionType,
        approvalStatus: {
          previous: previousApprovalStatus,
          next: newApprovalStatus,
        },
        orderStatus: {
          previous: previousOrderStatus,
          next: newOrderStatus,
        },
        source: auditContext?.source,
        confidence: auditContext?.confidence,
        changedFields: auditContext?.changedFields,
      },
      metadata,
    ),
  });
}

async function buildPriorityForSync(
  repository: WorkflowRepository,
  input: SyncWorkflowItemInput,
): Promise<ReturnType<typeof determineWorkflowPriority>> {
  const selectedSupplierId = resolveSelectedEntityIds(
    input.resolutionCandidates,
  ).supplierId;
  const supplierQualification = selectedSupplierId
    ? await repository.findSupplierQualificationBySupplierId(selectedSupplierId)
    : null;

  return determineWorkflowPriority({
    ...input,
    supplierQualificationStatus:
      input.supplierQualificationStatus ??
      supplierQualification?.qualificationStatus ??
      null,
    supplierQualificationExpiresAt:
      input.supplierQualificationExpiresAt ??
      supplierQualification?.expiresAt ??
      null,
  });
}

function buildBuyDecisionSnapshot(
  workflow: WorkflowRecord,
  qualification: ReturnType<typeof buildQualificationSnapshot>,
) {
  const offer = workflow.emailDerivedOffer;
  if (!offer) {
    throw new Error(
      'Offer workflow item is missing its staged email-derived offer.',
    );
  }

  const selectedIds = resolveSelectedEntityIds(offer.resolutionCandidates);
  const latestCorrection = getLatestAppliedCorrection(workflow);
  const rawProductText =
    latestCorrection?.correctedRawProductText ?? offer.rawProductText;
  const normalizedProductNameCandidate =
    latestCorrection?.correctedNormalizedProductName ??
    offer.normalizedProductNameCandidate;
  const manufacturerCandidate =
    latestCorrection?.correctedManufacturer ?? offer.manufacturerCandidate;
  const quotedUnitPrice =
    latestCorrection?.correctedUnitPrice ?? offer.priceCandidate;
  const quotedCurrencyCode =
    latestCorrection?.correctedCurrencyCode ?? offer.currencyCandidate;
  const quotedMinimumOrderQuantity =
    latestCorrection?.correctedMinimumOrderQuantity ??
    offer.minimumOrderQuantityCandidate;
  const quotedAvailability =
    latestCorrection?.correctedAvailability ?? offer.availabilityCandidate;

  return {
    emailDerivedOfferId: workflow.emailDerivedOfferId,
    offerWorkflowItemId: workflow.id,
    inboundEmailId: workflow.inboundEmailId,
    supplierId: latestCorrection?.correctedSupplierId ?? selectedIds.supplierId,
    productId: latestCorrection?.correctedProductId ?? selectedIds.productId,
    rawProductText,
    normalizedProductNameCandidate,
    manufacturerCandidate,
    quotedUnitPrice,
    quotedCurrencyCode,
    quotedMinimumOrderQuantity,
    quotedAvailability,
    sourceKind: workflow.sourceKind ?? offer.sourceKind,
    sourceBlockText: offer.sourceBlockText,
    supplierQualificationStatus: qualification.supplierQualificationStatus,
    hasQualificationRisk:
      qualification.hasBlockedSupplier ||
      qualification.hasRestrictedSupplier ||
      qualification.hasUnknownSupplierQualification,
    qualificationRiskNote: qualification.qualificationRiskNote,
    metadata: {
      sourceReviewReason: workflow.sourceReviewReason,
      workflowPriority: workflow.priority,
      workflowPriorityReason: workflow.priorityReason,
      appliedOfferCorrectionId: latestCorrection?.id ?? null,
      originalExtractedValues: latestCorrection
        ? {
            rawProductText: offer.rawProductText,
            normalizedProductNameCandidate:
              offer.normalizedProductNameCandidate,
            manufacturerCandidate: offer.manufacturerCandidate,
            supplierCandidate: offer.supplierCandidate,
            quotedUnitPrice: offer.priceCandidate,
            quotedCurrencyCode: offer.currencyCandidate,
            quotedMinimumOrderQuantity: offer.minimumOrderQuantityCandidate,
            quotedAvailability: offer.availabilityCandidate,
          }
        : undefined,
    },
  };
}

function getLatestAppliedCorrection(
  workflow: WorkflowRecord,
): WorkflowOfferCorrectionRecord | null {
  return (
    workflow.emailDerivedOffer?.offerCorrections
      ?.filter((correction) => correction.correctionStatus === 'APPLIED')
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0] ?? null
  );
}

function buildWorkflowAuditSource(workflow: WorkflowRecord) {
  return {
    inboundEmailId: workflow.inboundEmailId,
    emailDerivedOfferId: workflow.emailDerivedOfferId,
    offerWorkflowItemId: workflow.id,
    sourceKind: workflow.sourceKind ?? workflow.emailDerivedOffer?.sourceKind,
    sourceReviewReason:
      workflow.sourceReviewReason ?? workflow.emailDerivedOffer?.reviewReason,
  };
}

function buildWorkflowAuditConfidence(workflow: WorkflowRecord) {
  return {
    promotionConfidence: toNumber(
      (workflow.emailDerivedOffer as Record<string, unknown> | undefined)
        ?.promotionConfidence,
    ),
    sourceTrustScore: toNumber(
      (workflow.emailDerivedOffer as Record<string, unknown> | undefined)
        ?.sourceTrustScore,
    ),
    structureConfidence: toNumber(
      (workflow.emailDerivedOffer as Record<string, unknown> | undefined)
        ?.structureConfidence,
    ),
    fieldConfidence: toNumber(
      (workflow.emailDerivedOffer as Record<string, unknown> | undefined)
        ?.fieldConfidence,
    ),
    entityResolutionConfidence: toNumber(
      (workflow.emailDerivedOffer as Record<string, unknown> | undefined)
        ?.entityResolutionConfidence,
    ),
  };
}

function buildExecutionUpdateFromWorkflow(
  input: WorkflowActionInput,
): BuyExecutionUpdateInput {
  return {
    actorType: input.actorType,
    actorIdentifier: input.actorIdentifier,
    note: input.note,
    externalOrderReference: input.externalOrderReference,
    orderPlacedAt: input.orderPlacedAt ?? new Date(),
    orderedQuantity: input.orderedQuantity,
    orderedUnitPrice: input.orderedUnitPrice,
    orderedCurrencyCode: input.orderedCurrencyCode,
    orderedMinimumOrderQuantity: input.orderedMinimumOrderQuantity,
    confirmedAvailability: input.confirmedAvailability,
    expectedDeliveryDate: input.expectedDeliveryDate,
    fulfillmentStatus: 'ORDER_PLACED',
  };
}

function mapWorkflowAuditEntry(
  event: WorkflowEventRecord,
): WorkflowAuditHistoryEntry {
  return {
    id: event.id,
    entityType: 'OFFER_WORKFLOW_ITEM',
    entityId: event.workflowItemId,
    actionType: event.actionType,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    actorType: event.actorType,
    actorIdentifier: event.actorIdentifier,
    note: event.note,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

function mapBuyDecisionAuditEntry(
  event: BuyDecisionEventRecord,
): WorkflowAuditHistoryEntry {
  return {
    id: event.id,
    entityType: 'BUY_DECISION',
    entityId: event.buyDecisionId,
    actionType: event.actionType,
    previousStatus:
      [event.previousApprovalStatus, event.previousOrderStatus]
        .filter(Boolean)
        .join(' / ') || null,
    newStatus:
      [event.newApprovalStatus, event.newOrderStatus]
        .filter(Boolean)
        .join(' / ') || null,
    actorType: event.actorType,
    actorIdentifier: event.actorIdentifier,
    note: event.note,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

function mapBuyExecutionAuditEntry(
  event: BuyExecutionEventRecord,
): WorkflowAuditHistoryEntry {
  return {
    id: event.id,
    entityType: 'BUY_EXECUTION',
    entityId: event.buyExecutionId,
    actionType: event.actionType,
    previousStatus:
      [event.previousFulfillmentStatus, event.previousReconciliationStatus]
        .filter(Boolean)
        .join(' / ') || null,
    newStatus:
      [event.newFulfillmentStatus, event.newReconciliationStatus]
        .filter(Boolean)
        .join(' / ') || null,
    actorType: event.actorType,
    actorIdentifier: event.actorIdentifier,
    note: event.note,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

function mapOfferCorrectionAuditEntry(
  event: OfferCorrectionEventRecord,
): WorkflowAuditHistoryEntry {
  return {
    id: event.id,
    entityType: 'OFFER_CORRECTION',
    entityId: event.offerCorrectionId,
    actionType: event.actionType,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    actorType: event.actorType,
    actorIdentifier: event.actorIdentifier,
    note: event.note,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

function mapTradeOpportunityAuditEntry(
  event: TradeOpportunityEventRecord,
): WorkflowAuditHistoryEntry {
  return {
    id: event.id,
    entityType: 'TRADE_OPPORTUNITY',
    entityId: event.tradeOpportunityId,
    actionType: event.actionType,
    previousStatus:
      [event.previousStatus, event.previousStage].filter(Boolean).join(' / ') ||
      null,
    newStatus:
      [event.newStatus, event.newStage].filter(Boolean).join(' / ') || null,
    actorType: event.actorType,
    actorIdentifier: event.actorIdentifier,
    note: event.note,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

async function recordWorkflowFeedbackIfPresent(
  repository: Pick<
    WorkflowRepository,
    | 'findRecentMatchingFeedback'
    | 'createFeedback'
    | 'findTradeMessageDraftById'
  >,
  workflowItem: WorkflowRecord,
  input: WorkflowActionInput,
) {
  if (!input.feedback) {
    return;
  }

  await recordOperatorValidationFeedbackWithRepository(repository, {
    ...input.feedback,
    emailDerivedOfferId: workflowItem.emailDerivedOfferId,
    offerWorkflowItemId: workflowItem.id,
    actorType: input.actorType,
    actorIdentifier: input.actorIdentifier,
  });
}

export function createOfferWorkflowService(
  overrides?: Partial<WorkflowRepository>,
) {
  const repository: WorkflowRepository = {
    ...createWorkflowRepository(),
    ...overrides,
  };

  const approveToBuyWithOutcome = async (
    input: WorkflowActionInput,
  ): Promise<WorkflowApprovalResult> => {
    return repository.transaction(async (txRepository) => {
      const existing = await txRepository.findWorkflowItemById(
        input.workflowItemId,
      );
      if (!existing || !existing.emailDerivedOffer) {
        throw new Error('Offer workflow item not found.');
      }

      const actor = normalizeActor(input);
      const supplierDetails = normalizeSupplierReviewDetails(
        input.supplierDetails,
      );
      const actionNote = buildWorkflowActionNote(input.note, supplierDetails);
      const selectedSupplierId = resolveSelectedEntityIds(
        existing.emailDerivedOffer.resolutionCandidates,
      ).supplierId;
      const supplierQualification = selectedSupplierId
        ? await txRepository.findSupplierQualificationBySupplierId(
            selectedSupplierId,
          )
        : null;
      const qualification = buildQualificationSnapshot(
        supplierQualification?.qualificationStatus ??
          existing.supplierQualificationStatus,
        existing.hasUnresolvedSupplier,
        supplierQualification?.expiresAt ?? null,
      );

      if (qualification.hasBlockedSupplier) {
        const blockedNote =
          actionNote ||
          qualification.qualificationRiskNote ||
          'Blocked supplier cannot be approved to buy.';
        await txRepository.updateWorkflowItem(existing.id, {
          latestNote: blockedNote,
          hasBlockedSupplier: true,
          supplierQualificationStatus:
            qualification.supplierQualificationStatus,
          qualificationRiskNote: qualification.qualificationRiskNote,
        });
        await logWorkflowEvent(
          txRepository,
          existing.id,
          'NOTE_ADDED',
          existing.status,
          existing.status,
          actor,
          blockedNote,
        );
        throw new Error('Blocked supplier cannot be approved to buy.');
      }

      if (
        (qualification.hasRestrictedSupplier ||
          qualification.hasUnknownSupplierQualification) &&
        input.allowQualificationRisk !== true
      ) {
        throw new Error(
          'Supplier qualification risk requires explicit operator confirmation before approval.',
        );
      }

      const updatedWorkflow = await txRepository.updateWorkflowItem(
        existing.id,
        {
          status: 'APPROVED_TO_BUY',
          latestNote: actionNote || existing.latestNote,
          completedAt: null,
          supplierQualificationStatus:
            qualification.supplierQualificationStatus,
          hasUnknownSupplierQualification:
            qualification.hasUnknownSupplierQualification,
          hasRestrictedSupplier: qualification.hasRestrictedSupplier,
          hasBlockedSupplier: qualification.hasBlockedSupplier,
          qualificationRiskNote: qualification.qualificationRiskNote,
        },
      );

      await logWorkflowEvent(
        txRepository,
        existing.id,
        'APPROVED_TO_BUY',
        existing.status,
        'APPROVED_TO_BUY',
        actor,
        actionNote,
        buildSideEffectAuditMetadata('REVIEW_QUEUE_APPROVE_TO_BUY', {
          allowQualificationRisk: input.allowQualificationRisk === true,
          supplierDetails,
        }),
        {
          source: buildWorkflowAuditSource(existing),
          confidence: buildWorkflowAuditConfidence(existing),
          changedFields: ['status', 'supplierQualificationStatus'],
        },
      );

      const snapshot = buildBuyDecisionSnapshot(updatedWorkflow, qualification);
      const existingDecision = await txRepository.findBuyDecisionByOfferId(
        existing.emailDerivedOfferId,
      );
      let decisionForTradeSync: BuyDecisionRecord;
      const buyDecisionCreated = !existingDecision;

      if (!existingDecision) {
        const createdDecision = await txRepository.createBuyDecision({
          ...snapshot,
          approvalStatus: 'APPROVED',
          approvalNote: actionNote,
          approvedByType: actor.actorType,
          approvedByIdentifier: actor.actorIdentifier,
          approvedAt: new Date(),
          orderStatus: 'NOT_ORDERED',
        });

        await logBuyDecisionEvent(
          txRepository,
          createdDecision.id,
          'CREATED',
          null,
          'APPROVED',
          null,
          'NOT_ORDERED',
          actor,
          actionNote,
          buildSideEffectAuditMetadata('REVIEW_QUEUE_APPROVE_TO_BUY', {
            qualificationRiskNote: qualification.qualificationRiskNote,
            supplierDetails,
          }),
          {
            source: buildWorkflowAuditSource(existing),
            confidence: buildWorkflowAuditConfidence(existing),
            changedFields: [
              'approvalStatus',
              'quotedUnitPrice',
              'quotedCurrencyCode',
              'supplierQualificationStatus',
            ],
          },
        );

        decisionForTradeSync = createdDecision;
      } else {
        const updatedDecision = await txRepository.updateBuyDecision(
          existingDecision.id,
          {
            ...snapshot,
            approvalStatus: 'APPROVED',
            approvalNote: actionNote || existingDecision.approvalNote,
            approvedByType: actor.actorType,
            approvedByIdentifier: actor.actorIdentifier,
            approvedAt: existingDecision.approvedAt ?? new Date(),
          },
        );

        if (existingDecision.approvalStatus !== 'APPROVED') {
          await logBuyDecisionEvent(
            txRepository,
            existingDecision.id,
            'APPROVED',
            existingDecision.approvalStatus,
            updatedDecision.approvalStatus,
            existingDecision.orderStatus,
            updatedDecision.orderStatus,
            actor,
            actionNote,
            buildSideEffectAuditMetadata('REVIEW_QUEUE_APPROVE_TO_BUY', {
              qualificationRiskNote: qualification.qualificationRiskNote,
              supplierDetails,
            }),
            {
              source: buildWorkflowAuditSource(existing),
              confidence: buildWorkflowAuditConfidence(existing),
              changedFields: ['approvalStatus', 'supplierQualificationStatus'],
            },
          );
        }

        decisionForTradeSync = updatedDecision;
      }

      await syncTradeOpportunityCommercialState(
        {
          listActiveByOfferId:
            txRepository.listActiveTradeOpportunitiesByOfferId,
          updateTradeOpportunity: txRepository.updateTradeOpportunity,
          createTradeOpportunityEvent: txRepository.createTradeOpportunityEvent,
        },
        {
          emailDerivedOfferId: existing.emailDerivedOfferId,
          buyDecision: decisionForTradeSync,
          buyExecution: decisionForTradeSync.execution ?? null,
          actor,
          note: actionNote,
        },
      );

      const demandMatchedTradeOpportunityResult =
        await createDemandMatchedTradeOpportunityFromApprovedBuyDecision(
          {
            listActiveByOfferId:
              txRepository.listActiveTradeOpportunitiesByOfferId,
            create: txRepository.createTradeOpportunity,
            createPolicy: txRepository.createTradeOpportunityPolicy,
            createTradeOpportunityEvent:
              txRepository.createTradeOpportunityEvent,
            listRecentSalesByProductId: txRepository.listRecentSalesByProductId,
          },
          {
            buyDecision: decisionForTradeSync,
            sourceSupplierNameSnapshot:
              getLatestAppliedCorrection(updatedWorkflow)
                ?.correctedSupplierName ??
              existing.emailDerivedOffer?.supplierCandidate ??
              null,
            actor,
          },
        );
      await recordWorkflowFeedbackIfPresent(
        txRepository,
        updatedWorkflow,
        input,
      );

      return {
        item: updatedWorkflow,
        outcome: {
          buyDecisionId: decisionForTradeSync.id,
          buyDecisionCreated,
          tradeOpportunityId:
            demandMatchedTradeOpportunityResult.tradeOpportunity?.id ?? null,
          tradeOpportunityOutcome: demandMatchedTradeOpportunityResult.outcome,
        },
      };
    });
  };

  return {
    async syncWorkflowItemForOfferReview(
      input: SyncWorkflowItemInput,
      actorInput?: WorkflowActor,
    ): Promise<WorkflowRecord | null> {
      return repository.transaction(async (txRepository) => {
        const actor = normalizeActor(actorInput);
        const existing = await txRepository.findWorkflowItemByOfferId(
          input.emailDerivedOfferId,
        );

        if (input.offerStatus !== 'REVIEW_REQUIRED') {
          if (!existing || !isOpenWorkflowStatus(existing.status)) {
            return existing;
          }

          const closed = await txRepository.updateWorkflowItem(existing.id, {
            completedAt: new Date(),
            status: 'CLOSED',
            latestNote:
              input.offerStatus === 'AUTO_PROMOTED'
                ? 'Workflow closed because the staged offer was auto-promoted.'
                : 'Workflow closed because the staged offer was rejected as non-actionable.',
          });

          await logWorkflowEvent(
            txRepository,
            existing.id,
            'AUTO_CLOSED',
            existing.status,
            'CLOSED',
            actor,
            closed.latestNote,
            {
              offerStatus: input.offerStatus,
            },
          );

          return closed;
        }

        const priority = await buildPriorityForSync(txRepository, input);
        const syncData = {
          inboundEmailId: input.inboundEmailId,
          priority: priority.priority,
          priorityReason: priority.priorityReason,
          sourceKind: input.sourceKind,
          sourceReviewReason: input.reviewReason,
          aiAssisted: input.aiAssisted,
          hasUnresolvedSupplier: priority.hasUnresolvedSupplier,
          hasConflictingSupplierCues: priority.hasConflictingSupplierCues,
          hasManufacturerAmbiguity: priority.hasManufacturerAmbiguity,
          supplierQualificationStatus: priority.supplierQualificationStatus,
          hasUnknownSupplierQualification:
            priority.hasUnknownSupplierQualification,
          hasRestrictedSupplier: priority.hasRestrictedSupplier,
          hasBlockedSupplier: priority.hasBlockedSupplier,
          qualificationRiskNote: priority.qualificationRiskNote,
        };

        if (!existing) {
          const created = await txRepository.createWorkflowItem({
            ...syncData,
            emailDerivedOfferId: input.emailDerivedOfferId,
            status: 'NEW',
            createdByType: actor.actorType,
            createdByIdentifier: actor.actorIdentifier,
            completedAt: null,
          });

          await logWorkflowEvent(
            txRepository,
            created.id,
            'CREATED',
            null,
            'NEW',
            actor,
            input.reviewReason,
            {
              priority: created.priority,
            },
          );

          return created;
        }

        if (existing.status === 'CLOSED' || existing.status === 'REJECTED') {
          const reopened = await txRepository.updateWorkflowItem(existing.id, {
            ...syncData,
            status: 'NEW',
            completedAt: null,
          });

          await logWorkflowEvent(
            txRepository,
            existing.id,
            'REOPENED',
            existing.status,
            'NEW',
            actor,
            input.reviewReason,
            {
              priority: reopened.priority,
            },
          );

          return reopened;
        }

        return txRepository.updateWorkflowItem(existing.id, {
          ...syncData,
        });
      });
    },

    async listWorkflowItems(
      filters: WorkflowListFilters = {},
    ): Promise<WorkflowRecord[]> {
      return repository.listWorkflowItems(filters);
    },

    async listWorkflowEvents(
      workflowItemId: string,
    ): Promise<WorkflowEventRecord[]> {
      return repository.listWorkflowEvents(workflowItemId);
    },

    async getWorkflowAuditHistory(
      workflowItemId: string,
    ): Promise<WorkflowAuditHistoryEntry[] | null> {
      const detail = await repository.findWorkflowDetailById(workflowItemId);
      if (!detail) {
        return null;
      }

      const workflowEvents =
        await repository.listWorkflowEvents(workflowItemId);
      const buyDecisionId = detail.buyDecision?.id ?? null;
      const buyDecisionEvents = buyDecisionId
        ? await repository.listBuyDecisionEvents(buyDecisionId)
        : [];
      const buyExecutionId = detail.buyDecision?.execution?.id ?? null;
      const buyExecutionEvents = buyExecutionId
        ? await repository.listBuyExecutionEvents(buyExecutionId)
        : [];
      const correctionEvents =
        await repository.listOfferCorrectionEventsForWorkflow(workflowItemId);
      const tradeOpportunityEvents =
        await repository.listTradeOpportunityEventsForWorkflow({
          workflowItemId,
          emailDerivedOfferId: detail.emailDerivedOfferId,
          buyDecisionId,
          buyExecutionId,
        });

      return [
        ...workflowEvents.map(mapWorkflowAuditEntry),
        ...buyDecisionEvents.map(mapBuyDecisionAuditEntry),
        ...buyExecutionEvents.map(mapBuyExecutionAuditEntry),
        ...correctionEvents.map(mapOfferCorrectionAuditEntry),
        ...tradeOpportunityEvents.map(mapTradeOpportunityAuditEntry),
      ].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
    },

    async getWorkflowItem(
      workflowItemId: string,
    ): Promise<WorkflowDetailRecord | null> {
      const detail = await repository.findWorkflowDetailById(workflowItemId);
      if (!detail) {
        return null;
      }

      return {
        ...detail,
        supplierContact: deriveSupplierContact(detail),
      };
    },

    async assignWorkflowItem(
      input: AssignWorkflowItemInput,
    ): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        const actor = normalizeActor(input);
        const updated = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            assigneeUserId: input.assigneeUserId?.trim() || null,
            assigneeLabel: input.assigneeLabel?.trim() || null,
            latestNote: input.note?.trim() || existing.latestNote,
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'ASSIGNED',
          existing.status,
          existing.status,
          actor,
          input.note,
          {
            assigneeUserId: updated.assigneeUserId,
            assigneeLabel: updated.assigneeLabel,
          },
        );

        return updated;
      });
    },

    async addWorkflowNote(input: WorkflowActionInput): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        const actor = normalizeActor(input);
        const updated = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            latestNote: input.note?.trim() || existing.latestNote,
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'NOTE_ADDED',
          existing.status,
          existing.status,
          actor,
          input.note,
          null,
          {
            source: buildWorkflowAuditSource(existing),
            confidence: buildWorkflowAuditConfidence(existing),
            changedFields: ['status'],
          },
        );

        return updated;
      });
    },

    async markInReview(input: WorkflowActionInput): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        const updated = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            status: 'IN_REVIEW',
            latestNote: input.note?.trim() || existing.latestNote,
            completedAt: null,
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'STARTED_REVIEW',
          existing.status,
          'IN_REVIEW',
          normalizeActor(input),
          input.note,
        );

        return updated;
      });
    },

    async markNeedsInfo(input: WorkflowActionInput): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        const updated = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            status: 'NEEDS_INFO',
            latestNote: input.note?.trim() || existing.latestNote,
            completedAt: null,
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'MARKED_NEEDS_INFO',
          existing.status,
          'NEEDS_INFO',
          normalizeActor(input),
          input.note,
        );

        return updated;
      });
    },

    async approveToBuyWithOutcome(
      input: WorkflowActionInput,
    ): Promise<WorkflowApprovalResult> {
      return approveToBuyWithOutcome(input);
    },

    async approveToBuy(input: WorkflowActionInput): Promise<WorkflowRecord> {
      const result = await approveToBuyWithOutcome(input);
      return result.item;
    },

    async rejectWorkflowItem(
      input: WorkflowActionInput,
    ): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        const actor = normalizeActor(input);
        const updatedWorkflow = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            status: 'REJECTED',
            latestNote: input.note?.trim() || existing.latestNote,
            completedAt: new Date(),
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'REJECTED',
          existing.status,
          'REJECTED',
          actor,
          input.note,
          null,
          {
            source: buildWorkflowAuditSource(existing),
            confidence: buildWorkflowAuditConfidence(existing),
            changedFields: ['status'],
          },
        );

        const existingDecision = await txRepository.findBuyDecisionByOfferId(
          existing.emailDerivedOfferId,
        );
        if (existingDecision) {
          const nextApprovalStatus: BuyDecisionApprovalStatus =
            existingDecision.orderStatus === 'NOT_ORDERED'
              ? 'REJECTED'
              : 'CANCELLED';
          const nextOrderStatus: BuyDecisionOrderStatus =
            existingDecision.orderStatus === 'NOT_ORDERED'
              ? existingDecision.orderStatus
              : 'CANCELLED';

          const updatedDecision = await txRepository.updateBuyDecision(
            existingDecision.id,
            {
              approvalStatus: nextApprovalStatus,
              approvalNote: input.note?.trim() || existingDecision.approvalNote,
              orderStatus: nextOrderStatus,
            },
          );

          if (
            existingDecision.approvalStatus !==
              updatedDecision.approvalStatus ||
            existingDecision.orderStatus !== updatedDecision.orderStatus
          ) {
            await logBuyDecisionEvent(
              txRepository,
              existingDecision.id,
              nextApprovalStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
              existingDecision.approvalStatus,
              updatedDecision.approvalStatus,
              existingDecision.orderStatus,
              updatedDecision.orderStatus,
              actor,
              input.note,
              null,
              {
                source: buildWorkflowAuditSource(existing),
                confidence: buildWorkflowAuditConfidence(existing),
                changedFields: ['approvalStatus', 'orderStatus'],
              },
            );
          }

          const updatedExecution =
            updatedDecision.orderStatus === 'CANCELLED'
              ? await upsertExecutionForBuyDecision(
                  {
                    findByBuyDecisionId:
                      txRepository.findBuyExecutionByDecisionId,
                    create: txRepository.createBuyExecution,
                    update: txRepository.updateBuyExecution,
                    createEvent: txRepository.createBuyExecutionEvent,
                  },
                  updatedDecision,
                  {
                    actorType: actor.actorType,
                    actorIdentifier: actor.actorIdentifier,
                    note: input.note,
                    fulfillmentStatus: 'CANCELLED',
                  },
                )
              : (updatedDecision.execution ?? null);

          await syncTradeOpportunityCommercialState(
            {
              listActiveByOfferId:
                txRepository.listActiveTradeOpportunitiesByOfferId,
              updateTradeOpportunity: txRepository.updateTradeOpportunity,
              createTradeOpportunityEvent:
                txRepository.createTradeOpportunityEvent,
            },
            {
              emailDerivedOfferId: existing.emailDerivedOfferId,
              buyDecision: updatedDecision,
              buyExecution: updatedExecution,
              actor,
              note: input.note,
            },
          );
        }
        await recordWorkflowFeedbackIfPresent(
          txRepository,
          updatedWorkflow,
          input,
        );

        return updatedWorkflow;
      });
    },

    async markOrdered(input: WorkflowActionInput): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing || !existing.emailDerivedOffer) {
          throw new Error('Offer workflow item not found.');
        }

        const actor = normalizeActor(input);
        const updatedWorkflow = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            status: 'ORDERED',
            latestNote: input.note?.trim() || existing.latestNote,
            completedAt: null,
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'MARKED_ORDERED',
          existing.status,
          'ORDERED',
          actor,
          input.note,
          buildSideEffectAuditMetadata('REVIEW_QUEUE_MARK_ORDERED', {
            externalOrderReference:
              input.externalOrderReference?.trim() || null,
          }),
          {
            source: buildWorkflowAuditSource(existing),
            confidence: buildWorkflowAuditConfidence(existing),
            changedFields: ['status', 'externalOrderReference'],
          },
        );

        const existingDecision = await txRepository.findBuyDecisionByOfferId(
          existing.emailDerivedOfferId,
        );
        if (!existingDecision) {
          throw new Error('Cannot mark ordered before a buy decision exists.');
        }

        const externalOrderReference =
          input.externalOrderReference?.trim() ||
          existingDecision.externalOrderReference;
        const nextOrderedAt = existingDecision.orderedAt ?? new Date();
        const updatedDecision = await txRepository.updateBuyDecision(
          existingDecision.id,
          {
            orderStatus: 'ORDERED',
            orderedAt: nextOrderedAt,
            externalOrderReference,
          },
        );

        if (
          existingDecision.orderStatus !== 'ORDERED' ||
          existingDecision.externalOrderReference !== externalOrderReference
        ) {
          await logBuyDecisionEvent(
            txRepository,
            existingDecision.id,
            'MARKED_ORDERED',
            existingDecision.approvalStatus,
            updatedDecision.approvalStatus,
            existingDecision.orderStatus,
            updatedDecision.orderStatus,
            actor,
            input.note,
            buildSideEffectAuditMetadata('REVIEW_QUEUE_MARK_ORDERED', {
              externalOrderReference,
            }),
            {
              source: buildWorkflowAuditSource(existing),
              confidence: buildWorkflowAuditConfidence(existing),
              changedFields: ['orderStatus', 'externalOrderReference'],
            },
          );
        }

        const updatedExecution = await upsertExecutionForBuyDecision(
          {
            findByBuyDecisionId: txRepository.findBuyExecutionByDecisionId,
            create: txRepository.createBuyExecution,
            update: txRepository.updateBuyExecution,
            createEvent: txRepository.createBuyExecutionEvent,
          },
          updatedDecision,
          buildExecutionUpdateFromWorkflow({
            ...input,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            externalOrderReference,
            orderPlacedAt: nextOrderedAt,
          }),
        );

        await syncTradeOpportunityCommercialState(
          {
            listActiveByOfferId:
              txRepository.listActiveTradeOpportunitiesByOfferId,
            updateTradeOpportunity: txRepository.updateTradeOpportunity,
            createTradeOpportunityEvent:
              txRepository.createTradeOpportunityEvent,
          },
          {
            emailDerivedOfferId: existing.emailDerivedOfferId,
            buyDecision: updatedDecision,
            buyExecution: updatedExecution,
            actor,
            note: input.note,
          },
        );

        return updatedWorkflow;
      });
    },

    async closeWorkflowItem(
      input: WorkflowActionInput,
    ): Promise<WorkflowRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findWorkflowItemById(
          input.workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        const updated = await txRepository.updateWorkflowItem(
          input.workflowItemId,
          {
            status: 'CLOSED',
            latestNote: input.note?.trim() || existing.latestNote,
            completedAt: new Date(),
          },
        );

        await logWorkflowEvent(
          txRepository,
          existing.id,
          'CLOSED',
          existing.status,
          'CLOSED',
          normalizeActor(input),
          input.note,
        );

        return updated;
      });
    },
  };
}

export const offerWorkflowService = createOfferWorkflowService();
