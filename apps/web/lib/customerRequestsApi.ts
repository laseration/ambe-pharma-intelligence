import 'server-only';

export type CustomerDemandStatus = 'NEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'MATCHED';
export type CustomerDemandConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CustomerDemandAction = 'APPROVE' | 'REJECT' | 'EXPIRE';

export type CustomerDemandRequestType =
  | 'SOURCE_PRODUCT'
  | 'CHECK_AVAILABILITY'
  | 'REQUEST_QUOTE'
  | 'BUYER_INTEREST'
  | 'REPEAT_DEMAND'
  | 'OTHER';

export type CustomerRequestItem = {
  id: string;
  inboundEmailId: string | null;
  sourceDocumentId: string | null;
  status: CustomerDemandStatus;
  requestType: CustomerDemandRequestType;
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
  confidence: CustomerDemandConfidence;
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
  customer?: {
    id: string;
    name: string;
    normalizedName?: string;
  } | null;
};

export type CustomerRequestListFilters = {
  status?: CustomerDemandStatus;
  requestType?: CustomerDemandRequestType;
  confidence?: CustomerDemandConfidence;
  productId?: string;
  customerId?: string;
  take?: number;
};

export type CustomerRequestPreviewResult = {
  status: 'success' | 'disabled' | 'unusable' | 'error';
  reason: string;
  result?: {
    intent: string;
    overallConfidence: CustomerDemandConfidence;
    reviewRecommended: boolean;
    notes: string[];
    items: Array<{
      requestType: CustomerDemandRequestType;
      customerName: string | null;
      contactName: string | null;
      contactEmail: string | null;
      productText: string | null;
      quantityRequested: number | null;
      targetPrice: number | null;
      currency: string | null;
      neededByDate: string | null;
      urgency: string | null;
      evidenceText: string;
      confidence: CustomerDemandConfidence;
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
    headers['x-internal-caller-name'] = 'web-customer-requests';
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

export async function listCustomerRequests(
  filters?: CustomerRequestListFilters,
): Promise<CustomerRequestItem[]> {
  const searchParams = new URLSearchParams();

  if (filters?.status) {
    searchParams.set('status', filters.status);
  }

  if (filters?.requestType) {
    searchParams.set('requestType', filters.requestType);
  }

  if (filters?.productId) {
    searchParams.set('productId', filters.productId);
  }

  if (filters?.customerId) {
    searchParams.set('customerId', filters.customerId);
  }

  if (filters?.take) {
    searchParams.set('take', String(filters.take));
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const payload = await requestJson<{ items: CustomerRequestItem[] }>(`/customer-requests${suffix}`);
  return filters?.confidence
    ? payload.items.filter((item) => item.confidence === filters.confidence)
    : payload.items;
}

export async function getCustomerRequest(id: string): Promise<CustomerRequestItem> {
  const payload = await requestJson<{ item: CustomerRequestItem }>(
    `/customer-requests/${encodeURIComponent(id)}`,
  );
  return payload.item;
}

export async function updateCustomerRequest(
  id: string,
  body: {
    action: CustomerDemandAction;
    note?: string | null;
    actorType?: string | null;
    actorIdentifier?: string | null;
  },
): Promise<CustomerRequestItem> {
  const payload = await requestJson<{ item: CustomerRequestItem }>(
    `/customer-requests/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return payload.item;
}

export async function parseCustomerRequestPreview(bodyText: string): Promise<CustomerRequestPreviewResult> {
  return requestJson<CustomerRequestPreviewResult>('/customer-requests/parse-preview', {
    method: 'POST',
    body: JSON.stringify({ rawText: bodyText }),
  });
}
