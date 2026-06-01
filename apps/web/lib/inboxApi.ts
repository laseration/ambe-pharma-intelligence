import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type InboundEmailInboxFilter =
  | 'REVIEW_REQUIRED'
  | 'FAILED'
  | 'RECEIVED_ONLY';

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

const CALLER_NAME = 'web-bot-inbox';

async function requestJson<T>(path: string): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
  });
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
