import 'server-only';

export type ReviewWorkflowListItem = {
  id: string;
  status: string;
  priority: string;
  assigneeLabel: string | null;
  sourceKind: string | null;
  sourceReviewReason: string | null;
  latestNote: string | null;
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
  staleFirst?: boolean;
};

const MANUAL_REVIEW_WORKFLOW_STATUSES = new Set(['NEW', 'IN_REVIEW', 'NEEDS_INFO']);

function getInternalApiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INTERNAL_API_BASE_URL?.trim() ||
    'http://127.0.0.1:4000/api'
  );
}

function buildHeaders(includeJsonContentType = false): HeadersInit {
  const headers: Record<string, string> = {};
  const apiKey =
    process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_ADMIN_API_KEY?.trim() || '';

  if (apiKey) {
    headers['x-internal-api-key'] = apiKey;
    headers['x-internal-caller-name'] = 'web-review-console';
  }

  if (includeJsonContentType) {
    headers['content-type'] = 'application/json';
  }

  return headers;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...buildHeaders(init?.body !== undefined),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the generic status-based message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function listReviewWorkflowItems(
  options?: ListReviewWorkflowItemsOptions,
): Promise<ReviewWorkflowListItem[]> {
  const searchParams = new URLSearchParams({
    onlyOpen: 'true',
  });

  if (options?.inboundEmailId) {
    searchParams.set('inboundEmailId', options.inboundEmailId);
  }

  if (options?.staleFirst) {
    searchParams.set('staleFirst', 'true');
  }

  const payload = await requestJson<{ items: ReviewWorkflowListItem[] }>(
    `/review-queue/workflows?${searchParams.toString()}`,
  );
  return payload.items.filter((item) => MANUAL_REVIEW_WORKFLOW_STATUSES.has(item.status));
}

export async function listReviewQueueItems(): Promise<ReviewQueueItem[]> {
  const payload = await requestJson<{ items: ReviewQueueItem[] }>('/review-queue');
  return payload.items;
}

export async function getReviewWorkflowItem(workflowItemId: string): Promise<ReviewWorkflowDetail> {
  const payload = await requestJson<{ item: ReviewWorkflowDetail }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}`,
  );
  return payload.item;
}

export async function listReviewWorkflowEvents(workflowItemId: string): Promise<ReviewWorkflowEvent[]> {
  const payload = await requestJson<{ items: ReviewWorkflowEvent[] }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/events`,
  );
  return payload.items;
}

export async function updateReviewWorkflowItem(
  workflowItemId: string,
  body: Record<string, unknown>,
): Promise<{ item: ReviewWorkflowDetail; actionOutcome?: ReviewWorkflowActionOutcome | null }> {
  return requestJson<{ item: ReviewWorkflowDetail; actionOutcome?: ReviewWorkflowActionOutcome | null }>(`/review-queue/workflows/${encodeURIComponent(workflowItemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
