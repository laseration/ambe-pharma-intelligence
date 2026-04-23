import 'server-only';

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

function getInternalApiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INTERNAL_API_BASE_URL?.trim() ||
    'http://127.0.0.1:4000/api'
  );
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const apiKey =
    process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_ADMIN_API_KEY?.trim() || '';

  if (apiKey) {
    headers['x-internal-api-key'] = apiKey;
    headers['x-internal-caller-name'] = 'web-dashboard';
  }

  return headers;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
    cache: 'no-store',
    headers: buildHeaders(),
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

export async function getAutomationReadinessOverview(): Promise<AutomationReadinessOverview> {
  const payload = await requestJson<{ item: AutomationReadinessOverview }>('/automation/readiness');
  return payload.item;
}
