import 'server-only';

export type TradeOpportunityStatus = 'OPEN' | 'ON_HOLD' | 'DROPPED' | 'WON' | 'LOST';

export type TradeOpportunityStage =
  | 'NEW'
  | 'REVIEW'
  | 'READY_FOR_SUPPLIER_OUTREACH'
  | 'READY_FOR_BUY'
  | 'BUY_APPROVED'
  | 'BUY_ORDERED'
  | 'READY_FOR_BUYER_OUTREACH'
  | 'BUYER_CONTACTED'
  | 'NEGOTIATING'
  | 'DEAL_CONFIRMED'
  | 'CLOSED';

export type TradeOpportunityListItem = {
  id: string;
  status: TradeOpportunityStatus;
  stage: TradeOpportunityStage;
  sourceType: string;
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  sourceSupplierNameSnapshot: string | null;
  targetBuyerNameSnapshot: string | null;
  targetBuyerCompanySnapshot: string | null;
  quotedBuyUnitPrice: number | string | null;
  quotedBuyCurrencyCode: string | null;
  targetSellUnitPrice: number | string | null;
  targetSellCurrencyCode: string | null;
  estimatedMarginAmount: number | string | null;
  estimatedMarginPct: number | string | null;
  quantityTarget: number | null;
  rationale: string | null;
  metadata: {
    createdFrom?: string | null;
    recentDemandWindowDays?: number | null;
    recentUnitsSold?: number | null;
    recentRevenue?: number | null;
    recentAverageSalePrice?: number | null;
    likelyBuyers?: Array<{
      customerId: string;
      name: string;
      units: number;
      orderCount: number;
      lastSaleAt: string;
    }> | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
  } | null;
  supplier: {
    id: string;
    name: string;
  } | null;
  buyDecision: {
    id: string;
    approvalStatus: string;
    orderStatus: string;
    supplierQualificationStatus: string;
    hasQualificationRisk: boolean;
  } | null;
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
    headers['x-internal-caller-name'] = 'web-deals-dashboard';
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

export async function listTradeOpportunities(): Promise<TradeOpportunityListItem[]> {
  const payload = await requestJson<{ items: TradeOpportunityListItem[] }>('/deals');
  return payload.items;
}
