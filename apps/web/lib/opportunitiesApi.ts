import 'server-only';

export type OpportunityListItem = {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string;
  score: number;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    normalizedName: string;
  } | null;
  supplier: {
    id: string;
    name: string;
  } | null;
  metadata: {
    metrics?: {
      currentStockQty?: number | null;
      recentSalesUnits30d?: number | null;
      latestSupplierBuyPrice?: number | null;
      averageSalePrice?: number | null;
      estimatedMarginPct?: number | null;
      priceDeltaVsMarketPct?: number | null;
    } | null;
    commercialContext?: {
      supplierCurrencyCode?: string | null;
      simulatedMarketPrice?: number | null;
      latestSupplierBuyPrice?: number | null;
      averageSalePrice?: number | null;
      estimatedMarginPct?: number | null;
      priceDeltaVsMarketPct?: number | null;
    } | null;
    triage?: {
      latest?: {
        updatedAt?: string | null;
      } | null;
    } | null;
  } | null;
};

export type OpportunityTriageStatus = 'REVIEWED' | 'ACTIONED' | 'DISMISSED';
export type OpportunityListType =
  | 'BUY'
  | 'PUSH'
  | 'PRICE_ALERT'
  | 'LOW_MARGIN'
  | 'RESTOCK'
  | 'DEAD_STOCK';

type ListOpportunitiesOptions = {
  status?: 'OPEN' | OpportunityTriageStatus;
  type?: OpportunityListType;
  sortBy?: 'score' | 'updatedAt';
  take?: number;
};

type RegenerateOpportunitiesResult = {
  generatedCount: number;
};

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
    headers['x-internal-caller-name'] = 'web-dashboard';
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

export async function listOpportunities(options?: ListOpportunitiesOptions): Promise<OpportunityListItem[]> {
  const searchParams = new URLSearchParams();

  if (options?.status) {
    searchParams.set('status', options.status);
  }

  if (options?.type) {
    searchParams.set('type', options.type);
  }

  if (options?.sortBy) {
    searchParams.set('sortBy', options.sortBy);
  }

  if (options?.take) {
    searchParams.set('take', String(options.take));
  }

  const query = searchParams.toString();
  const payload = await requestJson<{ items: OpportunityListItem[] }>(
    `/opportunities${query ? `?${query}` : ''}`,
  );
  return payload.items;
}

export async function listOpenOpportunities(): Promise<OpportunityListItem[]> {
  return listOpportunities({ status: 'OPEN' });
}

export async function updateOpportunityStatus(
  opportunityId: string,
  body: {
    status: OpportunityTriageStatus;
    note?: string;
    actorType: string;
    actorIdentifier: string;
  },
): Promise<void> {
  await requestJson<{ item: OpportunityListItem }>(`/opportunities/${encodeURIComponent(opportunityId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function regenerateOpportunities(): Promise<RegenerateOpportunitiesResult> {
  return requestJson<RegenerateOpportunitiesResult>('/opportunities/regenerate', {
    method: 'POST',
  });
}
