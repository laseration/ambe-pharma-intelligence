import { summarizeCommercialActionState } from './operatorTrust';
import type { ReviewWorkflowListItem } from './reviewApi';

export type ReviewQueueFilterKey =
  | 'all'
  | 'unresolved-supplier'
  | 'supplier-risk'
  | 'missing-price'
  | 'missing-currency'
  | 'weak-product-match'
  | 'ai-assisted'
  | 'stale'
  | 'ready-to-approve'
  | 'correction-required'
  | 'approval-blocked';

export type ReviewQueueFilterDefinition = {
  key: ReviewQueueFilterKey;
  label: string;
  description: string;
  emptyTitle: string;
  emptyCopy: string;
};

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MANUAL_REVIEW_STATUSES = new Set(['NEW', 'IN_REVIEW', 'NEEDS_INFO']);
const CORRECTION_REASON_CODES = new Set([
  'missing_price',
  'missing_currency',
  'weak_product_match',
  'unresolved_supplier',
  'conflicting_supplier_cues',
  'promotion_threshold_missing_or_weak_fields',
]);

export const reviewQueueFilterDefinitions: ReviewQueueFilterDefinition[] = [
  {
    key: 'all',
    label: 'Manual review',
    description: 'Open supplier rows still waiting for operator review.',
    emptyTitle: 'No manual reviews waiting',
    emptyCopy:
      'There are no open supplier review rows in NEW, IN_REVIEW, or NEEDS_INFO state.',
  },
  {
    key: 'unresolved-supplier',
    label: 'Unresolved supplier',
    description: 'Rows where the supplier could not be resolved safely.',
    emptyTitle: 'No unresolved suppliers',
    emptyCopy:
      'No open supplier review rows currently need supplier identity resolution.',
  },
  {
    key: 'supplier-risk',
    label: 'Supplier risk',
    description: 'Blocked, restricted, or unknown supplier qualification.',
    emptyTitle: 'No supplier risk rows',
    emptyCopy:
      'No open supplier review rows currently show blocked, restricted, or unknown supplier qualification.',
  },
  {
    key: 'missing-price',
    label: 'Missing price',
    description: 'Rows where a usable supplier price is missing.',
    emptyTitle: 'No missing prices',
    emptyCopy:
      'No open supplier review rows currently need price confirmation.',
  },
  {
    key: 'missing-currency',
    label: 'Missing currency',
    description: 'Rows where the currency needs confirming.',
    emptyTitle: 'No missing currencies',
    emptyCopy:
      'No open supplier review rows currently need currency confirmation.',
  },
  {
    key: 'weak-product-match',
    label: 'Weak product match',
    description: 'Rows where the product match is weak or unclear.',
    emptyTitle: 'No weak product matches',
    emptyCopy:
      'No open supplier review rows currently need product match confirmation.',
  },
  {
    key: 'ai-assisted',
    label: 'AI-assisted',
    description: 'Rows created with AI assistance and kept review-first.',
    emptyTitle: 'No AI-assisted rows',
    emptyCopy:
      'No open supplier review rows currently came from AI-assisted extraction.',
  },
  {
    key: 'stale',
    label: 'Stale',
    description: 'Rows not updated in the last 24 hours.',
    emptyTitle: 'No stale review rows',
    emptyCopy:
      'No open supplier review rows are older than the 24-hour stale threshold.',
  },
  {
    key: 'ready-to-approve',
    label: 'Ready to approve',
    description: 'Rows with core evidence present and no visible risk flags.',
    emptyTitle: 'No rows ready to approve',
    emptyCopy:
      'No open supplier review rows currently have complete price, currency, supplier, and product evidence without visible risk flags.',
  },
  {
    key: 'correction-required',
    label: 'Correction required',
    description: 'Rows that likely need field correction before approval.',
    emptyTitle: 'No correction-required rows',
    emptyCopy:
      'No open supplier review rows currently show missing or weak extracted fields that require correction.',
  },
  {
    key: 'approval-blocked',
    label: 'Approval blocked',
    description: 'Rows where approval is disabled by the current action state.',
    emptyTitle: 'No approval-blocked rows',
    emptyCopy:
      'No open supplier review rows currently have approval disabled by approval, execution, rejection, or stale correction state.',
  },
];

export const reviewQueueFilterMap = new Map(
  reviewQueueFilterDefinitions.map((definition) => [
    definition.key,
    definition,
  ]),
);

function normalizeReason(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function hasMissingPrice(item: ReviewWorkflowListItem): boolean {
  return (
    normalizeReason(item.sourceReviewReason) === 'missing_price' ||
    !item.emailDerivedOffer?.priceCandidate?.trim()
  );
}

function hasMissingCurrency(item: ReviewWorkflowListItem): boolean {
  return (
    normalizeReason(item.sourceReviewReason) === 'missing_currency' ||
    !item.emailDerivedOffer?.currencyCandidate?.trim()
  );
}

function hasWeakProductMatch(item: ReviewWorkflowListItem): boolean {
  return normalizeReason(item.sourceReviewReason) === 'weak_product_match';
}

function hasSupplierRisk(item: ReviewWorkflowListItem): boolean {
  return (
    item.hasBlockedSupplier ||
    item.hasRestrictedSupplier ||
    item.hasUnknownSupplierQualification ||
    item.supplierQualificationStatus === 'BLOCKED' ||
    item.supplierQualificationStatus === 'RESTRICTED' ||
    item.supplierQualificationStatus === 'UNKNOWN'
  );
}

function hasCorrectionRequired(item: ReviewWorkflowListItem): boolean {
  const reason = normalizeReason(item.sourceReviewReason);

  return (
    item.status === 'NEEDS_INFO' ||
    CORRECTION_REASON_CODES.has(reason) ||
    hasMissingPrice(item) ||
    hasMissingCurrency(item) ||
    hasWeakProductMatch(item) ||
    item.hasUnresolvedSupplier ||
    item.hasConflictingSupplierCues
  );
}

function isStale(
  item: ReviewWorkflowListItem,
  nowMs: number,
  staleAfterMs: number,
): boolean {
  const updatedMs = Date.parse(item.updatedAt);

  return Number.isFinite(updatedMs) && nowMs - updatedMs > staleAfterMs;
}

function isReadyToApprove(item: ReviewWorkflowListItem): boolean {
  const actionState = summarizeCommercialActionState(item);

  return (
    actionState.canApprove &&
    MANUAL_REVIEW_STATUSES.has(item.status) &&
    !item.aiAssisted &&
    !hasSupplierRisk(item) &&
    !item.hasUnresolvedSupplier &&
    !item.hasConflictingSupplierCues &&
    !item.hasManufacturerAmbiguity &&
    !hasMissingPrice(item) &&
    !hasMissingCurrency(item) &&
    !hasWeakProductMatch(item)
  );
}

function matchesFilter(
  item: ReviewWorkflowListItem,
  filter: ReviewQueueFilterKey,
  nowMs: number,
  staleAfterMs: number,
): boolean {
  switch (filter) {
    case 'all':
      return MANUAL_REVIEW_STATUSES.has(item.status);
    case 'unresolved-supplier':
      return item.hasUnresolvedSupplier;
    case 'supplier-risk':
      return hasSupplierRisk(item);
    case 'missing-price':
      return hasMissingPrice(item);
    case 'missing-currency':
      return hasMissingCurrency(item);
    case 'weak-product-match':
      return hasWeakProductMatch(item);
    case 'ai-assisted':
      return item.aiAssisted;
    case 'stale':
      return isStale(item, nowMs, staleAfterMs);
    case 'ready-to-approve':
      return isReadyToApprove(item);
    case 'correction-required':
      return hasCorrectionRequired(item);
    case 'approval-blocked':
      return !summarizeCommercialActionState(item).canApprove;
  }
}

export function normalizeReviewQueueFilter(
  value: string | undefined,
): ReviewQueueFilterKey {
  return reviewQueueFilterMap.has(value as ReviewQueueFilterKey)
    ? (value as ReviewQueueFilterKey)
    : 'all';
}

export function filterReviewWorkflowItems(
  items: ReviewWorkflowListItem[],
  filter: ReviewQueueFilterKey,
  options: { nowMs?: number; staleAfterMs?: number } = {},
): ReviewWorkflowListItem[] {
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  return items.filter((item) =>
    matchesFilter(item, filter, nowMs, staleAfterMs),
  );
}

export function countReviewQueueFilters(
  items: ReviewWorkflowListItem[],
  options: { nowMs?: number; staleAfterMs?: number } = {},
): Record<ReviewQueueFilterKey, number> {
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  return Object.fromEntries(
    reviewQueueFilterDefinitions.map((definition) => [
      definition.key,
      items.filter((item) =>
        matchesFilter(item, definition.key, nowMs, staleAfterMs),
      ).length,
    ]),
  ) as Record<ReviewQueueFilterKey, number>;
}
