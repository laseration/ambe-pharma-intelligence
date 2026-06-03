export type CommercialApprovalBlockReason =
  | 'NEEDS_REVIEW'
  | 'APPROVAL_REQUIRED'
  | 'CORRECTED_AFTER_APPROVAL'
  | 'ALREADY_EXECUTED';

export const commercialApprovalBlockMessages: Record<
  CommercialApprovalBlockReason,
  string
> = {
  NEEDS_REVIEW: 'Needs review before execution',
  APPROVAL_REQUIRED: 'Approval required',
  CORRECTED_AFTER_APPROVAL: 'Corrected after approval; review again',
  ALREADY_EXECUTED: 'Already executed',
};

export class CommercialApprovalBlockedError extends Error {
  constructor(readonly reason: CommercialApprovalBlockReason) {
    super(commercialApprovalBlockMessages[reason]);
    this.name = 'CommercialApprovalBlockedError';
  }
}

export type AppliedCorrectionSnapshot =
  | {
      id: string;
      updatedAt?: Date | string | null;
    }
  | null;

export type CommercialApprovalState = {
  approvalStatus?: string | null;
  approvedAt?: Date | string | null;
  approvedAppliedOfferCorrectionId?: string | null;
  latestAppliedOfferCorrectionId?: string | null;
};

const EXECUTED_FULFILLMENT_STATUSES = new Set([
  'ORDER_PLACED',
  'ORDER_CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
]);

export function getAppliedOfferCorrectionIdFromMetadata(
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as { appliedOfferCorrectionId?: unknown })
    .appliedOfferCorrectionId;
  return typeof value === 'string' && value.trim() ? value : null;
}

export function getCommercialApprovalBlockReason(
  state: CommercialApprovalState,
): CommercialApprovalBlockReason | null {
  if (state.approvalStatus !== 'APPROVED' || !state.approvedAt) {
    return 'APPROVAL_REQUIRED';
  }

  if (
    state.latestAppliedOfferCorrectionId &&
    state.latestAppliedOfferCorrectionId !==
      state.approvedAppliedOfferCorrectionId
  ) {
    return 'CORRECTED_AFTER_APPROVAL';
  }

  return null;
}

export function assertCommercialApproval(
  state: CommercialApprovalState,
): void {
  const reason = getCommercialApprovalBlockReason(state);
  if (reason) {
    throw new CommercialApprovalBlockedError(reason);
  }
}

export function assertBuyDecisionApprovedForExecution(input: {
  buyDecision: {
    approvalStatus?: string | null;
    approvedAt?: Date | string | null;
    metadata?: unknown;
  };
  latestAppliedCorrection?: AppliedCorrectionSnapshot;
}): void {
  const approvedAt =
    input.buyDecision.approvedAt instanceof Date
      ? input.buyDecision.approvedAt
      : input.buyDecision.approvedAt
        ? new Date(input.buyDecision.approvedAt)
        : null;
  const correctionUpdatedAt =
    input.latestAppliedCorrection?.updatedAt instanceof Date
      ? input.latestAppliedCorrection.updatedAt
      : input.latestAppliedCorrection?.updatedAt
        ? new Date(input.latestAppliedCorrection.updatedAt)
        : null;

  if (
    approvedAt &&
    correctionUpdatedAt &&
    correctionUpdatedAt.getTime() > approvedAt.getTime()
  ) {
    throw new CommercialApprovalBlockedError('CORRECTED_AFTER_APPROVAL');
  }

  assertCommercialApproval({
    approvalStatus: input.buyDecision.approvalStatus,
    approvedAt: input.buyDecision.approvedAt,
    approvedAppliedOfferCorrectionId: getAppliedOfferCorrectionIdFromMetadata(
      input.buyDecision.metadata,
    ),
    latestAppliedOfferCorrectionId: input.latestAppliedCorrection?.id ?? null,
  });
}

export function assertOrderPlacementIsIdempotent(input: {
  existingExecution?: { fulfillmentStatus?: string | null } | null;
  nextFulfillmentStatus?: string | null;
  changedFields?: string[];
  requestedOrderPlacement?: boolean;
}): void {
  const executionStartFields = new Set([
    'orderPlacedAt',
    'externalOrderReference',
    'orderedQuantity',
    'orderedUnitPrice',
    'orderedCurrencyCode',
    'orderedMinimumOrderQuantity',
    'confirmedAvailability',
  ]);
  const changesOrderPlacement = (input.changedFields ?? []).some((field) =>
    executionStartFields.has(field),
  );

  if (
    input.requestedOrderPlacement &&
    changesOrderPlacement &&
    input.existingExecution?.fulfillmentStatus &&
    EXECUTED_FULFILLMENT_STATUSES.has(input.existingExecution.fulfillmentStatus)
  ) {
    throw new CommercialApprovalBlockedError('ALREADY_EXECUTED');
  }
}

export function assertOpportunityReviewedForExternalAction(input: {
  status?: string | null;
}): void {
  if (input.status !== 'REVIEWED' && input.status !== 'ACTIONED') {
    throw new CommercialApprovalBlockedError('NEEDS_REVIEW');
  }
}

export function assertOpportunityReviewedForNotification(input: {
  status?: string | null;
}): void {
  assertOpportunityReviewedForExternalAction(input);
}

export function assertTradeOpportunityApprovedForExternalAction(input: {
  buyDecision?: {
    approvalStatus?: string | null;
    approvedAt?: Date | string | null;
  } | null;
}): void {
  assertCommercialApproval({
    approvalStatus: input.buyDecision?.approvalStatus ?? null,
    approvedAt: input.buyDecision?.approvedAt ?? null,
  });
}
