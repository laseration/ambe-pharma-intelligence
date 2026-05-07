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
    confidenceBreakdown?: {
      textExtractionConfidence?: number;
      parserConfidence?: number;
      entityResolutionConfidence?: number;
      businessRuleConfidence?: number;
      overallConfidence?: number;
      explanation?: string;
      factors?: Array<{
        code: string;
        label: string;
        score: number;
        explanation: string;
      }>;
    } | null;
    confidenceExplanation?: string | null;
    promotionBlockers?: unknown;
    policyCheckSummary?: unknown;
    metadata: {
      sender?: string;
      subject?: string;
      sourceDocumentKind?: string;
      sourceDocumentLabel?: string;
      purchaseOrderPdf?: unknown;
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
    evidences?: Array<{
      id: string;
      fieldName: string;
      fieldValue: string | null;
      normalizedValue: string | null;
      evidenceType: string;
      rawText: string;
      startOffset: number | null;
      endOffset: number | null;
      confidence: number | null;
      extractionMethod: string | null;
      extractorVersion: string | null;
      evidenceFingerprint: string | null;
      metadata: unknown;
      sourceDocument?: {
        id: string;
        kind: string;
        documentIndex: number;
        label: string | null;
        textContent: string;
        metadata: unknown;
      } | null;
      createdAt: string;
    }>;
    policyCheckResults?: PolicyCheckResult[];
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
  promotionReadiness?: PromotionReadiness | null;
  buyDecision?: {
    id: string;
    approvalStatus: string;
    orderStatus: string;
    externalOrderReference?: string | null;
    orderedAt?: string | null;
  } | null;
};

export type PolicyCheckFinding = {
  code: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  blocking: boolean;
  label: string;
  evidence: string;
  sourceLabel: string;
};

export type PolicyCheckResult = {
  id: string;
  scope: 'STAGED_OFFER' | 'OUTBOUND_DRAFT';
  status: 'PASSED' | 'FINDINGS' | 'BLOCKED';
  checkType: string;
  findings: PolicyCheckFinding[] | unknown;
  blockingFindingCount: number;
  summary: string;
  checkedByType: string;
  checkedByIdentifier: string | null;
  metadata: unknown;
  createdAt: string;
};

export type PromotionReadiness = {
  workflowItemId: string;
  emailDerivedOfferId: string | null;
  canApproveToBuy: boolean;
  canPersistSupplierPriceIntelligence: boolean;
  blockers: Array<{
    code: string;
    severity: 'BLOCKING' | 'WARNING';
    message: string;
    field?: string | null;
  }>;
  warnings: Array<{
    code: string;
    severity: 'BLOCKING' | 'WARNING';
    message: string;
    field?: string | null;
  }>;
  confidenceBreakdown: unknown;
  confidenceExplanation: string | null;
  reviewerExplanation: string;
  policyCheck: {
    status: 'PASSED' | 'FINDINGS' | 'BLOCKED';
    summary: string;
    findings: PolicyCheckFinding[];
    blockingFindingCount: number;
    flags?: Record<string, boolean>;
  };
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

export async function listReviewWorkflowPolicyChecks(workflowItemId: string): Promise<PolicyCheckResult[]> {
  const payload = await requestJson<{ items: PolicyCheckResult[] }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/policy-checks`,
  );
  return payload.items;
}

export async function runReviewWorkflowPolicyCheck(workflowItemId: string): Promise<PolicyCheckResult> {
  const payload = await requestJson<{ item: PolicyCheckResult }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/policy-checks/run`,
    {
      method: 'POST',
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'web-review-console',
      }),
    },
  );
  return payload.item;
}

export async function checkReviewWorkflowPromotionReadiness(
  workflowItemId: string,
  allowQualificationRisk = false,
): Promise<PromotionReadiness> {
  const payload = await requestJson<{ item: PromotionReadiness }>(
    `/review-queue/workflows/${encodeURIComponent(workflowItemId)}/promotion-check`,
    {
      method: 'POST',
      body: JSON.stringify({
        allowQualificationRisk,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-review-console',
      }),
    },
  );
  return payload.item;
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
