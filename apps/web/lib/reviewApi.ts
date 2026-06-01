import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type ReviewWorkflowListItem = {
  id: string;
  status: string;
  priority: string;
  priorityReason: string | null;
  assigneeLabel: string | null;
  sourceKind: string | null;
  sourceReviewReason: string | null;
  aiAssisted: boolean;
  latestNote: string | null;
  hasUnresolvedSupplier: boolean;
  hasConflictingSupplierCues: boolean;
  hasManufacturerAmbiguity: boolean;
  supplierQualificationStatus: string;
  hasUnknownSupplierQualification: boolean;
  hasRestrictedSupplier: boolean;
  hasBlockedSupplier: boolean;
  qualificationRiskNote: string | null;
  updatedAt: string;
  inboundEmailId?: string | null;
  inboundEmail?: {
    id?: string;
    fromEmail: string;
    subject: string | null;
    receivedAt: string | null;
  } | null;
  emailDerivedOffer?: {
    rawProductText: string | null;
    normalizedProductNameCandidate?: string | null;
    strengthCandidate?: string | null;
    dosageFormCandidate?: string | null;
    packSizeCandidate?: string | null;
    supplierCandidate?: string | null;
    manufacturerCandidate?: string | null;
    priceCandidate: string | null;
    currencyCandidate: string | null;
    availabilityCandidate?: string | null;
    minimumOrderQuantityCandidate?: number | null;
  } | null;
};

export type ReviewOfferCorrectionRecord = {
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
  correctedUnitPrice: string | number | null;
  correctedCurrencyCode: string | null;
  correctedMinimumOrderQuantity: number | null;
  correctedAvailability: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewWorkflowDetail = ReviewWorkflowListItem & {
  emailDerivedOffer?: {
    id: string;
    status: string;
    reviewReason: string | null;
    sourceKind: string;
    sourceBlockText: string;
    rawProductText: string | null;
    normalizedProductNameCandidate: string | null;
    strengthCandidate: string | null;
    dosageFormCandidate: string | null;
    packSizeCandidate: string | null;
    manufacturerCandidate: string | null;
    supplierCandidate: string | null;
    priceCandidate: string | null;
    currencyCandidate: string | null;
    minimumOrderQuantityCandidate: number | null;
    availabilityCandidate: string | null;
    sourceTrustScore: number | null;
    structureConfidence: number | null;
    fieldConfidence: number | null;
    entityResolutionConfidence: number | null;
    promotionConfidence: number | null;
    metadata: {
      sender?: string;
      subject?: string;
      sourceDocumentKind?: string;
      sourceDocumentLabel?: string;
    } | null;
    resolutionCandidates: Array<{
      entityType: 'PRODUCT' | 'SUPPLIER' | 'MANUFACTURER';
      candidateId: string | null;
      candidateName: string;
      confidence: number;
      reason: string;
      selected: boolean;
      metadata?: unknown;
    }>;
    sourceDocument?: {
      id: string;
      kind: string;
      documentIndex: number;
      label: string | null;
      textContent: string;
      metadata: unknown;
    } | null;
    offerCorrections?: Array<ReviewOfferCorrectionRecord>;
    relatedOfferCorrections?: Array<ReviewOfferCorrectionRecord>;
  } | null;
  inboundEmail?: {
    id: string;
    fromEmail: string;
    fromName: string | null;
    subject: string | null;
    receivedAt: string | null;
    rawHtml: string | null;
    rawText: string | null;
    triageStatus: string | null;
    processingStatus: string;
    reviewReason: string | null;
    documents: Array<{
      id: string;
      kind: string;
      documentIndex: number;
      label: string | null;
      textContent: string;
      metadata: unknown;
    }>;
  } | null;
  supplierContact?: {
    companyName: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    domain: string | null;
    source: string | null;
  } | null;
  buyDecision?: {
    id: string;
    approvalStatus: string;
    orderStatus: string;
    externalOrderReference?: string | null;
    orderedAt?: string | null;
  } | null;
};

export type ReviewWorkflowEvent = {
  id: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: string;
};

export type ReviewWorkflowAuditEntry = {
  id: string;
  entityType: 'OFFER_WORKFLOW_ITEM' | 'BUY_DECISION' | 'BUY_EXECUTION';
  entityId: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: string;
};

export type ReviewOfferCorrection = NonNullable<
  NonNullable<ReviewWorkflowDetail['emailDerivedOffer']>['offerCorrections']
>[number];

export type ReviewWorkflowActionOutcome = {
  action: 'APPROVE_TO_BUY' | 'REJECT';
  buyDecisionId?: string;
  buyDecisionCreated?: boolean;
  tradeOpportunityId?: string | null;
  tradeOpportunityOutcome?:
    | 'CREATED'
    | 'EXISTING_ACTIVE'
    | 'SKIPPED_NOT_APPROVED'
    | 'SKIPPED_MISSING_CONTEXT'
    | 'SKIPPED_MISSING_PRICE'
    | 'SKIPPED_NO_RECENT_DEMAND'
    | 'SKIPPED_NON_POSITIVE_MARGIN';
};

export type ReviewQueueItem = {
  id: string;
  sourceType: string;
  receivedAt: string | null;
  sender: string | null;
  fileName: string | null;
  subject: string | null;
  processingStatus: string;
  reason: string;
  accountOpeningSigningNotes?: {
    recommendedSigner: string;
    defaultSigningStatement: string;
    riskFlags: string[];
    missingOrUnclear: string[];
  } | null;
  reviewSummary: {
    reviewReason: string;
    recognizedContent: string;
    missingOrUnclear: string;
    suggestedAction: string;
  } | null;
};

type ListReviewWorkflowItemsOptions = {
  inboundEmailId?: string;
  onlyOpen?: boolean;
  staleFirst?: boolean;
  status?:
    | 'NEW'
    | 'IN_REVIEW'
    | 'NEEDS_INFO'
    | 'APPROVED_TO_BUY'
    | 'REJECTED'
    | 'ORDERED'
    | 'CLOSED';
};

const MANUAL_REVIEW_WORKFLOW_STATUSES = new Set([
  'NEW',
  'IN_REVIEW',
  'NEEDS_INFO',
]);

const CALLER_NAME = 'web-review-console';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
    init,
  });
}

export async function listReviewWorkflowItems(
  options?: ListReviewWorkflowItemsOptions,
): Promise<ReviewWorkflowListItem[]> {
  const searchParams = new URLSearchParams({
    onlyOpen: String(options?.onlyOpen ?? true),
  });

  if (options?.inboundEmailId) {
    searchParams.set('inboundEmailId', options.inboundEmailId);
  }

  if (options?.staleFirst) {
    searchParams.set('staleFirst', 'true');
  }

  if (options?.status) {
    searchParams.set('status', options.status);
  }

  const payload = await requestJson<{ items: ReviewWorkflowListItem[] }>(
    `/review-queue/workflows?${searchParams.toString()}`,
  );
  return options?.status || options?.onlyOpen === false
    ? payload.items
    : payload.items.filter((item) =>
        MANUAL_REVIEW_WORKFLOW_STATUSES.has(item.status),
      );
}

export async function listReviewQueueItems(): Promise<ReviewQueueItem[]> {
  const payload = await requestJson<{ items: ReviewQueueItem[] }>(
    '/review-queue',
  );
  return payload.items;
}

export async function getReviewWorkflowItem(
  workflowItemId: string,
): Promise<ReviewWorkflowDetail> {
  const payload = await requestJson<{ item: ReviewWorkflowDetail }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}`,
  );
  return payload.item;
}

export async function listReviewWorkflowEvents(
  workflowItemId: string,
): Promise<ReviewWorkflowEvent[]> {
  const payload = await requestJson<{ items: ReviewWorkflowEvent[] }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/events`,
  );
  return payload.items;
}

export async function listReviewWorkflowAuditHistory(
  workflowItemId: string,
): Promise<ReviewWorkflowAuditEntry[]> {
  const payload = await requestJson<{ items: ReviewWorkflowAuditEntry[] }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/audit-history`,
  );
  return payload.items;
}

export async function updateReviewWorkflowItem(
  workflowItemId: string,
  body: Record<string, unknown>,
): Promise<{
  item: ReviewWorkflowDetail;
  actionOutcome?: ReviewWorkflowActionOutcome | null;
}> {
  return requestJson<{
    item: ReviewWorkflowDetail;
    actionOutcome?: ReviewWorkflowActionOutcome | null;
  }>(`/review-queue/workflows/${encodeURIComponent(workflowItemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function createReviewWorkflowCorrection(
  workflowItemId: string,
  body: Record<string, unknown>,
): Promise<ReviewOfferCorrection> {
  const payload = await requestJson<{ item: ReviewOfferCorrection }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/corrections`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  return payload.item;
}
