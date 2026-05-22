import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type AutomationReadinessOverview = {
  policy: {
    globalMode: string;
  };
  evaluation: {
    windowStart: string;
    windowEnd: string;
    totalStagedOffers: number;
    totalReviewedOffers: number;
    signalAcceptancePct: number | null;
    supplierResolutionPrecisionPct: number | null;
    workflowToBuyApprovalConversionPct: number | null;
    unresolvedSupplierRatePct: number | null;
  };
  decisions: {
    internalSignals: {
      eligible: boolean;
      blockedReasons: string[];
    };
  };
  recommendedAction: string;
};

const CALLER_NAME = 'web-dashboard';

async function requestJson<T>(path: string): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
  });
}

export async function getAutomationReadinessOverview(): Promise<AutomationReadinessOverview> {
  const payload = await requestJson<{ item: AutomationReadinessOverview }>(
    '/automation/readiness',
  );
  return payload.item;
}
