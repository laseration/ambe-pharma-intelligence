import 'server-only';

export type DemandSupplyMatchStatus = 'NEW' | 'REVIEWED' | 'REJECTED' | 'PROMOTED' | 'EXPIRED';
export type DemandSupplyMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type DemandSupplyMatchAction = 'REVIEW' | 'REJECT' | 'EXPIRE';

export type DemandSupplyMatchReason =
  | 'EXACT_PRODUCT_MATCH'
  | 'TARGET_PRICE_MET'
  | 'CUSTOMER_DEMAND_WITH_SUPPLIER_PRICE'
  | 'CUSTOMER_DEMAND_WITH_COMMERCIAL_INTEL'
  | 'PRICE_ALERT_WITH_CUSTOMER_DEMAND'
  | 'OTHER';

export type DemandSupplyMatchItem = {
  id: string;
  customerDemandSignalId: string;
  supplierPriceItemId: string;
  productId: string;
  customerId: string | null;
  supplierId: string | null;
  status: DemandSupplyMatchStatus;
  reason: DemandSupplyMatchReason;
  confidence: DemandSupplyMatchConfidence;
  matchScore: number | null;
  rawCustomerProductText: string | null;
  rawSupplierProductText: string | null;
  quantityRequested: number | null;
  requestedTargetPrice: number | string | null;
  requestedCurrency: string | null;
  supplierUnitPrice: number | string | null;
  supplierCurrency: string | null;
  estimatedMarginAmount: number | string | null;
  estimatedMarginPct: number | string | null;
  marginExplanation: string | null;
  urgency: string | null;
  riskFlags: unknown;
  rationale: string;
  evidence: unknown;
  commercialIntelContext: unknown;
  customerDemandContext: unknown;
  supplierOfferContext: unknown;
  matchFingerprint: string;
  reviewedByType: string | null;
  reviewedByIdentifier: string | null;
  reviewedAt: string | null;
  rejectedByType: string | null;
  rejectedByIdentifier: string | null;
  rejectedAt: string | null;
  promotedByType: string | null;
  promotedByIdentifier: string | null;
  promotedAt: string | null;
  expiresAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  product?: {
    id: string;
    name: string;
    normalizedName?: string;
  } | null;
  customer?: {
    id: string;
    name: string;
    normalizedName?: string;
  } | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
  customerDemandSignal?: {
    id: string;
    requestType: string;
    customerName: string | null;
    customerId: string | null;
    contactName: string | null;
    contactEmail: string | null;
    productText: string | null;
    productId: string | null;
    quantityRequested: number | null;
    targetPrice: number | string | null;
    currency: string | null;
    neededByDate: string | null;
    urgency: string | null;
    evidenceText: string;
    confidence: string;
    validUntil: string | null;
    createdAt: string;
    approvedAt: string | null;
  } | null;
  supplierPriceItem?: {
    id: string;
    supplierPriceListId: string;
    supplierId: string;
    productId: string | null;
    rawProductName: string;
    unitPrice: number | string;
    currencyCode: string;
    minimumOrderQuantity: number | null;
    isAvailable: boolean;
    promotionFingerprint: string;
    rawRow: unknown;
    createdAt: string;
    supplier?: {
      id: string;
      name: string;
    } | null;
    product?: {
      id: string;
      name: string;
      normalizedName?: string;
    } | null;
  } | null;
};

export type DemandSupplyMatchListFilters = {
  status?: DemandSupplyMatchStatus;
  confidence?: DemandSupplyMatchConfidence;
  productId?: string;
  customerId?: string;
  supplierId?: string;
  take?: number;
};

export type DemandSupplyMatchPreviewCandidate = Partial<DemandSupplyMatchItem> & {
  customerDemandSignalId: string;
  supplierPriceItemId: string;
  productId: string;
  confidence: DemandSupplyMatchConfidence;
  reason: DemandSupplyMatchReason;
  rationale: string;
};

export type DemandSupplyMatchPreviewResult = {
  generatedAt: string;
  matchCount: number;
  matches: DemandSupplyMatchPreviewCandidate[];
};

export type DemandSupplyMatchGenerationResult = {
  generatedAt: string;
  createdOrUpdatedCount: number;
  matches: DemandSupplyMatchItem[];
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
    headers['x-internal-caller-name'] = 'web-demand-matches';
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

export async function listDemandSupplyMatches(
  filters?: DemandSupplyMatchListFilters,
): Promise<DemandSupplyMatchItem[]> {
  const searchParams = new URLSearchParams();

  if (filters?.status) {
    searchParams.set('status', filters.status);
  }

  if (filters?.confidence) {
    searchParams.set('confidence', filters.confidence);
  }

  if (filters?.productId) {
    searchParams.set('productId', filters.productId);
  }

  if (filters?.customerId) {
    searchParams.set('customerId', filters.customerId);
  }

  if (filters?.supplierId) {
    searchParams.set('supplierId', filters.supplierId);
  }

  if (filters?.take) {
    searchParams.set('take', String(filters.take));
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const payload = await requestJson<{ items: DemandSupplyMatchItem[] }>(
    `/demand-supply-matches${suffix}`,
  );
  return payload.items;
}

export async function getDemandSupplyMatch(id: string): Promise<DemandSupplyMatchItem> {
  const payload = await requestJson<{ item: DemandSupplyMatchItem }>(
    `/demand-supply-matches/${encodeURIComponent(id)}`,
  );
  return payload.item;
}

export async function updateDemandSupplyMatch(
  id: string,
  body: {
    action: DemandSupplyMatchAction;
    note?: string | null;
    actorType?: string | null;
    actorIdentifier?: string | null;
  },
): Promise<DemandSupplyMatchItem> {
  const payload = await requestJson<{ item: DemandSupplyMatchItem }>(
    `/demand-supply-matches/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return payload.item;
}

export async function previewDemandSupplyMatches(): Promise<DemandSupplyMatchPreviewResult> {
  return requestJson<DemandSupplyMatchPreviewResult>('/demand-supply-matches/generate-preview', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function generateDemandSupplyMatches(): Promise<DemandSupplyMatchGenerationResult> {
  return requestJson<DemandSupplyMatchGenerationResult>('/demand-supply-matches/generate', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
