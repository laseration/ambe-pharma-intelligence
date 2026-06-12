import {
  redactDashboardText,
  summarizeCommercialActionState,
} from './operatorTrust';
import { buildReviewProvenanceSummary } from './reviewProvenance';
import type { ReviewWorkflowDetail } from './reviewApi';

export type BuyDecisionEvidenceItem = {
  label: string;
  value: string;
  detail: string;
};

export type BuyDecisionEvidenceSummary = {
  present: BuyDecisionEvidenceItem[];
  missing: BuyDecisionEvidenceItem[];
  blocked: BuyDecisionEvidenceItem[];
  nextRecommendedAction: string;
};

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? redactDashboardText(trimmed) : null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(
  value: number | string | null | undefined,
  currencyCode: string | null | undefined,
): string | null {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return null;
  }

  const currency = compact(currencyCode)?.toUpperCase();
  const amount = numericValue.toFixed(2);

  return currency ? `${currency} ${amount}` : amount;
}

function formatPct(value: number | string | null | undefined): string | null {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return null;
  }

  const percent = numericValue <= 1 ? numericValue * 100 : numericValue;
  return `${Math.round(percent)}%`;
}

function addMissing(
  items: BuyDecisionEvidenceItem[],
  label: string,
  detail: string,
) {
  items.push({
    label,
    value: 'Not available',
    detail,
  });
}

export function buildBuyDecisionEvidenceSummary(
  item: ReviewWorkflowDetail,
): BuyDecisionEvidenceSummary {
  const evidence = item.buyDecisionEvidence ?? null;
  const offer = item.emailDerivedOffer;
  const actionState = summarizeCommercialActionState(item);
  const provenance = buildReviewProvenanceSummary(item);
  const present: BuyDecisionEvidenceItem[] = [];
  const missing: BuyDecisionEvidenceItem[] = [];
  const blocked: BuyDecisionEvidenceItem[] = [];

  const marginAmount = formatMoney(
    evidence?.estimatedMarginAmount,
    evidence?.estimatedMarginCurrencyCode ?? offer?.currencyCandidate,
  );
  const marginPct = formatPct(evidence?.estimatedMarginPct);
  if (marginAmount || marginPct) {
    present.push({
      label: 'Margin estimate',
      value: [marginAmount, marginPct].filter(Boolean).join(' | '),
      detail:
        'Estimated from sanitized/demo buy and sell evidence; operator must still review before action.',
    });
  } else {
    addMissing(
      missing,
      'Margin estimate',
      'No safe margin estimate is attached to this review item.',
    );
  }

  if (
    evidence?.recentUnitsSold !== null &&
    evidence?.recentUnitsSold !== undefined &&
    evidence?.recentDemandWindowDays
  ) {
    present.push({
      label: 'Demand/sales velocity',
      value: `${evidence.recentUnitsSold} units in ${evidence.recentDemandWindowDays} days`,
      detail: 'Recent fake/demo demand evidence is available for review.',
    });
  } else {
    addMissing(
      missing,
      'Demand/sales velocity',
      'No recent sales velocity evidence is attached to this review item.',
    );
  }

  if (evidence?.stockOnHand !== null && evidence?.stockOnHand !== undefined) {
    present.push({
      label: 'Stock position',
      value: `${evidence.stockOnHand} units`,
      detail:
        compact(evidence.stockPositionLabel) ??
        'Safe stock-on-hand evidence is available for review.',
    });
  } else if (compact(evidence?.stockPositionLabel)) {
    present.push({
      label: 'Stock position',
      value: compact(evidence?.stockPositionLabel)!,
      detail: 'Safe stock position evidence is available for review.',
    });
  } else {
    addMissing(
      missing,
      'Stock position',
      'No current stock position evidence is attached to this review item.',
    );
  }

  const stockRisk = compact(evidence?.stockRisk);
  if (stockRisk) {
    present.push({
      label: 'Stock risk',
      value: stockRisk,
      detail: 'Stock risk is shown as a safe operator-facing summary only.',
    });
  } else {
    addMissing(
      missing,
      'Stock risk',
      'No stock risk summary is attached to this review item.',
    );
  }

  const expiryRisk = compact(evidence?.expiryRisk);
  if (expiryRisk) {
    present.push({
      label: 'Expiry risk',
      value: expiryRisk,
      detail: 'Expiry risk is shown as a safe operator-facing summary only.',
    });
  } else {
    addMissing(
      missing,
      'Expiry risk',
      'No expiry risk summary is attached to this review item.',
    );
  }

  const supplierStatus = compact(item.supplierQualificationStatus) ?? 'Unknown';
  const supplierRisk =
    item.hasBlockedSupplier ||
    item.hasRestrictedSupplier ||
    item.hasUnknownSupplierQualification ||
    ['BLOCKED', 'RESTRICTED', 'UNKNOWN'].includes(
      item.supplierQualificationStatus,
    );
  const supplierItem = {
    label: 'Supplier status',
    value: supplierStatus,
    detail:
      compact(item.qualificationRiskNote) ??
      'Supplier qualification status is available for operator review.',
  };
  if (supplierRisk) {
    blocked.push(supplierItem);
  } else {
    present.push(supplierItem);
  }

  const priceConfidence =
    evidence?.priceConfidence ?? offer?.fieldConfidence ?? null;
  const priceConfidenceLabel = formatPct(priceConfidence);
  if (
    offer?.priceCandidate &&
    offer.currencyCandidate &&
    priceConfidenceLabel
  ) {
    present.push({
      label: 'Price confidence',
      value: priceConfidenceLabel,
      detail: `Price ${redactDashboardText(offer.priceCandidate)} ${redactDashboardText(offer.currencyCandidate)} was extracted with safe confidence metadata.`,
    });
  } else if (offer?.priceCandidate && offer.currencyCandidate) {
    present.push({
      label: 'Price confidence',
      value: 'Price and currency present',
      detail:
        'Price and currency are present, but no numeric confidence score is attached.',
    });
  } else {
    addMissing(
      missing,
      'Price confidence',
      'Price, currency, or confidence evidence is missing.',
    );
  }

  const missingEvidence = new Set([
    ...(evidence?.missingEvidence ?? []),
    ...provenance.missingFields,
  ]);
  for (const missingLabel of missingEvidence) {
    const label = compact(missingLabel);
    if (!label) {
      continue;
    }
    missing.push({
      label: 'Missing evidence',
      value: label,
      detail: 'This gap should be resolved or accepted before action.',
    });
  }

  if (!actionState.canApprove) {
    blocked.push({
      label: 'Approval/execution blocker',
      value: actionState.blockedReason,
      detail: actionState.nextStep,
    });
  } else {
    present.push({
      label: 'Approval/execution blocker',
      value: actionState.blockedReason,
      detail: actionState.nextStep,
    });
  }

  return {
    present,
    missing,
    blocked,
    nextRecommendedAction:
      compact(evidence?.nextRecommendedAction) ?? actionState.nextStep,
  };
}
