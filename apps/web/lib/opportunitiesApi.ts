import 'server-only';

import type { WebCapability } from './authorisation';
import { requestInternalJson } from './internalApiRequest';

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

const CALLER_NAME = 'web-dashboard';

async function requestJson<T>(
  path: string,
  options: {
    init?: RequestInit;
    requiredCapability: WebCapability;
  },
): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
    requiredCapability: options.requiredCapability,
    init: options.init,
  });
}

export async function listOpportunities(
  options?: ListOpportunitiesOptions,
): Promise<OpportunityListItem[]> {
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
    { requiredCapability: 'opportunities:view' },
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
  await requestJson<{ item: OpportunityListItem }>(
    `/opportunities/${encodeURIComponent(opportunityId)}/status`,
    {
      requiredCapability: 'opportunities:manage',
      init: {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    },
  );
}

export async function regenerateOpportunities(): Promise<RegenerateOpportunitiesResult> {
  return requestJson<RegenerateOpportunitiesResult>(
    '/opportunities/regenerate',
    {
      requiredCapability: 'opportunities:manage',
      init: {
        method: 'POST',
      },
    },
  );
}
