import 'server-only';

export type InboundEmailInboxFilter = 'REVIEW_REQUIRED' | 'FAILED' | 'RECEIVED_ONLY';

export type InboundEmailInboxListItem = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  receivedAt: string | null;
  createdAt: string;
  processedAt: string | null;
  processingStatus: string;
  triageStatus: string | null;
  parserConfidence: string | null;
  reviewReason: string | null;
  sourceTrustScore: number | null;
  structureConfidence: number | null;
  businessWorthinessScore: number | null;
  _count: {
    documents: number;
    extractionRuns: number;
    derivedOffers: number;
    offerWorkflowItems: number;
  };
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
    headers['x-internal-caller-name'] = 'web-bot-inbox';
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

export async function listInboundEmails(options?: {
  take?: number;
  status?: InboundEmailInboxFilter;
}): Promise<InboundEmailInboxListItem[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('take', String(options?.take ?? 50));

  if (options?.status) {
    searchParams.set('status', options.status);
  }

  const payload = await requestJson<{ items: InboundEmailInboxListItem[] }>(
    `/email/inbound/messages?${searchParams.toString()}`,
  );
  return payload.items;
}
