import type {
  ReviewOfferCorrectionRecord,
  ReviewWorkflowDetail,
  ReviewWorkflowListItem,
} from './reviewApi';
import type { PollingWorkerStatus } from './systemApi';

const DEFAULT_WORKER_STALE_AFTER_MS = 30 * 60 * 1000;
const SECRET_PATTERNS = [
  /\bpostgres(?:ql)?:\/\/\S+/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^@\s]+:[^@\s]+@\S+/gi,
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:token|secret|password|api[_-]?key|client[_-]?secret)=\S+/gi,
];

export type WorkerFreshnessSummary = {
  label: 'Disabled' | 'Not configured' | 'Fresh' | 'Stale' | 'No success yet';
  tone: 'ready' | 'warning' | 'blocked';
  detail: string;
  blockedReason: string | null;
};

export type CommercialActionTrustSummary = {
  label: string;
  status: string;
  canApprove: boolean;
  blockedReason: string;
  nextStep: string;
};

export function redactDashboardText(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return 'none';
  }

  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[redacted]'),
    trimmed,
  );
}

export function summarizeWorkerFreshness(
  worker: PollingWorkerStatus,
  nowMs = Date.now(),
  staleAfterMs = DEFAULT_WORKER_STALE_AFTER_MS,
): WorkerFreshnessSummary {
  if (!worker.enabled) {
    return {
      label: 'Disabled',
      tone: 'warning',
      detail: 'Polling is disabled for this worker.',
      blockedReason: null,
    };
  }

  if (!worker.configured) {
    return {
      label: 'Not configured',
      tone: 'blocked',
      detail: 'Polling is enabled but required configuration is incomplete.',
      blockedReason:
        'Worker not configured; finish setup before relying on inbox state.',
    };
  }

  if (!worker.lastSuccessAt) {
    return {
      label: 'No success yet',
      tone: 'warning',
      detail: 'No successful polling run has been recorded yet.',
      blockedReason:
        'No successful worker run yet; refresh diagnostics before relying on latest inbox state.',
    };
  }

  const lastSuccessMs = Date.parse(worker.lastSuccessAt);

  if (Number.isNaN(lastSuccessMs) || nowMs - lastSuccessMs > staleAfterMs) {
    return {
      label: 'Stale',
      tone: 'warning',
      detail: 'The latest successful polling run is older than expected.',
      blockedReason:
        'Worker stale; refresh diagnostics before relying on latest inbox state.',
    };
  }

  if (!worker.running || worker.consecutiveFailures > 0) {
    return {
      label: 'Stale',
      tone: 'warning',
      detail: 'The worker has a recent success but is not currently healthy.',
      blockedReason:
        'Worker stale; refresh diagnostics before relying on latest inbox state.',
    };
  }

  return {
    label: 'Fresh',
    tone: 'ready',
    detail: 'The worker has completed a successful polling run recently.',
    blockedReason: null,
  };
}

function correctionCreatedAfterApproval(
  corrections: ReviewOfferCorrectionRecord[],
): boolean {
  return corrections.some(
    (correction) => correction.correctionStatus === 'APPLIED',
  );
}

function getOptionalBoolean(
  item: ReviewWorkflowDetail | ReviewWorkflowListItem,
  key: string,
): boolean {
  if (!(key in item)) {
    return false;
  }

  return (item as Record<string, unknown>)[key] === true;
}

function getOptionalString(
  item: ReviewWorkflowDetail | ReviewWorkflowListItem,
  key: string,
): string | null {
  if (!(key in item)) {
    return null;
  }

  const value = (item as Record<string, unknown>)[key];

  return typeof value === 'string' ? value : null;
}

export function summarizeCommercialActionState(
  item: ReviewWorkflowDetail | ReviewWorkflowListItem,
): CommercialActionTrustSummary {
  const status = item.status;
  const buyDecision = 'buyDecision' in item ? item.buyDecision : null;
  const hasBuyExecution = getOptionalBoolean(item, 'hasBuyExecution');
  const executionStatus = getOptionalString(
    item,
    'executionFulfillmentStatus',
  );
  const corrections =
    item.emailDerivedOffer && 'offerCorrections' in item.emailDerivedOffer
      ? (item.emailDerivedOffer.offerCorrections ?? [])
      : [];

  if (hasBuyExecution || executionStatus === 'RECEIVED') {
    return {
      label: 'Already executed',
      status,
      canApprove: false,
      blockedReason: 'Already executed',
      nextStep: 'Review execution tracking instead of approving again.',
    };
  }

  if (
    buyDecision?.orderStatus === 'ORDERED' ||
    status === 'ORDERED' ||
    status === 'CLOSED'
  ) {
    return {
      label: 'Already executed',
      status,
      canApprove: false,
      blockedReason: 'Already executed',
      nextStep: 'Review the existing order or execution record.',
    };
  }

  if (
    buyDecision?.approvalStatus === 'APPROVED' &&
    correctionCreatedAfterApproval(corrections)
  ) {
    return {
      label: 'Review again',
      status,
      canApprove: false,
      blockedReason: 'Corrected after approval; review again',
      nextStep:
        'Review the corrected fields before creating or continuing execution.',
    };
  }

  if (buyDecision?.approvalStatus === 'APPROVED' || status === 'APPROVED_TO_BUY') {
    return {
      label: 'Approved',
      status,
      canApprove: false,
      blockedReason: 'Already approved',
      nextStep: 'Review buy decision and execution status.',
    };
  }

  if (status === 'REJECTED') {
    return {
      label: 'Rejected',
      status,
      canApprove: false,
      blockedReason: 'Rejected review item',
      nextStep: 'Reopen or create a new review item before taking action.',
    };
  }

  if (status === 'NEEDS_INFO') {
    return {
      label: 'Needs info',
      status,
      canApprove: true,
      blockedReason: 'Needs review before execution',
      nextStep: 'Add missing supplier, product, price, or source evidence.',
    };
  }

  return {
    label: 'Approval required',
    status,
    canApprove: true,
    blockedReason: 'Approval required',
    nextStep: 'Review the evidence and approve or reject explicitly.',
  };
}
