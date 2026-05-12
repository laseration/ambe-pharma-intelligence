import 'server-only';

export type AccountOpeningSigningNotes = {
  title: string;
  recommendedSigner: string;
  defaultSigningStatement: string;
  detectedNames: string[];
  detectedRolesOrSections: string[];
  reviewerChecks: string[];
  riskFlags: string[];
  missingOrUnclear: string[];
  signatureInstruction: string;
  summary: string;
};

export type AccountOpeningMissingInfoResponses = {
  website?: string | null;
  numberOfEmployees?: string | null;
  businessHours?: string | null;
  estimatedMonthlyPurchases?: string | null;
  webOrdering?: string | null;
  directDebitRequested?: string | null;
  cdLicenceApplies?: string | null;
  gphcPremisesNumber?: string | null;
  cqcRegistration?: string | null;
  reviewerNotes?: string | null;
};

export type AccountOpeningStatusAction =
  | 'MARKED_NEEDS_INFO'
  | 'APPROVED_FOR_COMPLETION'
  | 'REJECTED';

export type AccountOpeningCaseDetail = {
  id: string;
  sourceFingerprint: string;
  messageId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  receivedAt: string | null;
  companyName: string | null;
  detectedFormType: string | null;
  status: string;
  recommendedSigner: string;
  signingStatement: string;
  signingExplanation: string | null;
  detectedNames: string[];
  detectedRoles: string[];
  escalationNotes: string[];
  riskFlags: string[];
  missingFields: string[];
  reviewerChecks: string[];
  signingNotes: AccountOpeningSigningNotes;
  missingInfoResponses: AccountOpeningMissingInfoResponses;
  extractedTextSummary: string | null;
  sharePointStatus: string | null;
  sharePointNote: string | null;
  sharePointSkippedReason: string | null;
  sharePointLastAttemptAt: string | null;
  sharePointFolderUrl: string | null;
  sourceAttachmentNames: string[];
  createdAt: string;
  updatedAt: string;
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
    headers['x-internal-caller-name'] = 'web-account-opening-review';
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

export async function getAccountOpeningCase(id: string): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{ item: AccountOpeningCaseDetail }>(
    `/account-opening/${encodeURIComponent(id)}`,
  );
  return payload.item;
}

export async function saveAccountOpeningMissingInfo(
  id: string,
  missingInfoResponses: AccountOpeningMissingInfoResponses,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{ item: AccountOpeningCaseDetail }>(
    `/account-opening/${encodeURIComponent(id)}/missing-info`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...missingInfoResponses,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
  );
  return payload.item;
}

export async function updateAccountOpeningStatus(
  id: string,
  body: {
    action: AccountOpeningStatusAction;
    note?: string | null;
  },
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{ item: AccountOpeningCaseDetail }>(
    `/account-opening/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...body,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
  );
  return payload.item;
}
