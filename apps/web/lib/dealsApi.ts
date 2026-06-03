import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type TradeOpportunityStatus =
  | 'OPEN'
  | 'ON_HOLD'
  | 'DROPPED'
  | 'WON'
  | 'LOST';

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
  riskFlags: string[] | null;
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
    approvedAt?: string | null;
    orderStatus: string;
    supplierQualificationStatus: string;
    hasQualificationRisk: boolean;
  } | null;
  events?: Array<{
    id: string;
    actionType: string;
    previousStatus: string | null;
    newStatus: string | null;
    previousStage: string | null;
    newStage: string | null;
    actorType: string;
    actorIdentifier: string | null;
    note: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
};

const CALLER_NAME = 'web-deals-dashboard';

async function requestJson<T>(path: string): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
  });
}

export async function listTradeOpportunities(filters?: {
  emailDerivedOfferId?: string;
}): Promise<TradeOpportunityListItem[]> {
  const searchParams = new URLSearchParams();

  if (filters?.emailDerivedOfferId) {
    searchParams.set('emailDerivedOfferId', filters.emailDerivedOfferId);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const payload = await requestJson<{ items: TradeOpportunityListItem[] }>(
    `/deals${suffix}`,
  );
  return payload.items;
}
