import 'server-only';

export type CommercialIntelStatus = 'NEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type CommercialIntelConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CommercialIntelAction = 'APPROVE' | 'REJECT' | 'EXPIRE';

export type CommercialIntelItemType =
  | 'SUPPLIER_RELIABILITY_NOTE'
  | 'BUYER_DEMAND_SIGNAL'
  | 'MANUAL_BUY_TRIGGER'
  | 'MANUAL_SELL_TRIGGER'
  | 'MARKET_PRICE_INTEL'
  | 'EXPIRY_RISK_RULE'
  | 'PRODUCT_NOTE'
  | 'CONTACT_NOTE'
  | 'OTHER';

export type CommercialIntelItem = {
  id: string;
  inboundEmailId: string | null;
  sourceDocumentId: string | null;
  itemType: CommercialIntelItemType;
  status: CommercialIntelStatus;
  productText: string | null;
  productId: string | null;
  supplierName: string | null;
  supplierId: string | null;
  customerName: string | null;
  contactName: string | null;
  priceThreshold: number | string | null;
  currency: string | null;
  availabilitySignal: string | null;
  riskLevel: string | null;
  urgency: string | null;
  signalEffect: string | null;
  evidenceText: string;
  confidence: CommercialIntelConfidence;
  reviewReason: string | null;
  aiAssisted: boolean;
  approvedByType: string | null;
  approvedByIdentifier: string | null;
  approvedAt: string | null;
  rejectedByType: string | null;
  rejectedByIdentifier: string | null;
  rejectedAt: string | null;
  validUntil: string | null;
  itemFingerprint: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  inboundEmail?: {
    id: string;
    fromEmail: string;
    fromName: string | null;
    subject: string | null;
    rawText?: string | null;
    processingStatus?: string;
    triageStatus?: string | null;
    reviewReason?: string | null;
    receivedAt: string | null;
    createdAt: string;
  } | null;
  sourceDocument?: {
    id: string;
    kind: string;
    documentIndex: number;
    label: string | null;
    textContent: string;
    metadata: unknown;
  } | null;
  product?: {
    id: string;
    name: string;
    normalizedName?: string;
  } | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
};

export type CommercialIntelListFilters = {
  status?: CommercialIntelStatus;
  itemType?: CommercialIntelItemType;
  confidence?: CommercialIntelConfidence;
  productId?: string;
  supplierId?: string;
  take?: number;
};

export type CommercialIntelPreviewResult = {
  status: 'success' | 'disabled' | 'unusable' | 'error';
  reason: string;
  result?: {
    intent: string;
    overallConfidence: CommercialIntelConfidence;
    reviewRecommended: boolean;
    notes: string[];
    items: Array<{
      itemType: CommercialIntelItemType;
      productText: string | null;
      supplierName: string | null;
      customerName: string | null;
      contactName: string | null;
      priceThreshold: number | null;
      currency: string | null;
      availabilitySignal: string | null;
      riskLevel: string | null;
      urgency: string | null;
      signalEffect: string | null;
      evidenceText: string;
      confidence: CommercialIntelConfidence;
      reviewReason: string | null;
      validUntil: string | null;
    }>;
  };
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
    headers['x-internal-caller-name'] = 'web-commercial-intel';
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

export async function listCommercialIntelItems(
  filters?: CommercialIntelListFilters,
): Promise<CommercialIntelItem[]> {
  const searchParams = new URLSearchParams();

  if (filters?.status) {
    searchParams.set('status', filters.status);
  }

  if (filters?.itemType) {
    searchParams.set('itemType', filters.itemType);
  }

  if (filters?.productId) {
    searchParams.set('productId', filters.productId);
  }

  if (filters?.supplierId) {
    searchParams.set('supplierId', filters.supplierId);
  }

  if (filters?.take) {
    searchParams.set('take', String(filters.take));
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const payload = await requestJson<{ items: CommercialIntelItem[] }>(`/commercial-intel${suffix}`);
  return filters?.confidence
    ? payload.items.filter((item) => item.confidence === filters.confidence)
    : payload.items;
}

export async function getCommercialIntelItem(id: string): Promise<CommercialIntelItem> {
  const payload = await requestJson<{ item: CommercialIntelItem }>(
    `/commercial-intel/${encodeURIComponent(id)}`,
  );
  return payload.item;
}

export async function updateCommercialIntelItem(
  id: string,
  body: {
    action: CommercialIntelAction;
    note?: string | null;
    actorType?: string | null;
    actorIdentifier?: string | null;
  },
): Promise<CommercialIntelItem> {
  const payload = await requestJson<{ item: CommercialIntelItem }>(
    `/commercial-intel/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return payload.item;
}

export async function parseCommercialIntelPreview(bodyText: string): Promise<CommercialIntelPreviewResult> {
  return requestJson<CommercialIntelPreviewResult>('/commercial-intel/parse-preview', {
    method: 'POST',
    body: JSON.stringify({ rawText: bodyText }),
  });
}
