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

export type AccountOpeningDraftField = {
  key: string;
  supplierLabel: string;
  proposedValue: string | null;
  valueSource:
    | 'AMBE_MASTER_PROFILE'
    | 'REVIEWER_RESPONSE'
    | 'EXTRACTED_TEXT'
    | 'SYSTEM_PLACEHOLDER'
    | 'NOT_PROVIDED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
  requiresReview: boolean;
  reviewReason: string | null;
  evidence: Array<{
    sourceType:
      | 'MASTER_PROFILE'
      | 'EMAIL_BODY'
      | 'ATTACHMENT_TEXT'
      | 'REVIEWER_INPUT'
      | 'SYSTEM_RULE';
    sourceLabel: string | null;
    snippet: string | null;
  }>;
};

export type AccountOpeningCompletionDraft = {
  status: 'PREVIEW' | 'READY_FOR_REVIEW' | 'REVIEW_REQUIRED' | 'BLOCKED';
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  isStored: boolean;
  profileId: string;
  profileVersion: string;
  generatedAt: string;
  fields: AccountOpeningDraftField[];
  summary: {
    totalFields: number;
    highConfidenceFields: number;
    reviewRequiredFields: number;
    blockedFields: number;
    safeToAutoFill: boolean;
  };
  safetyNotes: string[];
};

export type AccountOpeningSourceEvidence = {
  id: string | null;
  sourceType: string;
  sourceLabel: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  contentId: string | null;
  disposition: string | null;
  extractionMethod: string | null;
  extractedTextHash: string | null;
  extractedTextChars: number | null;
  safeSnippet: string | null;
  rawFileAvailable: boolean;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  storageStatus: string | null;
  storageNote: string | null;
  storageSkippedReason: string | null;
  storageLastAttemptAt: string | null;
  storageFolderUrl: string | null;
  sourceAttachmentNames: string[];
  draftStatus: string | null;
  draftVersion: string | null;
  draftGeneratedAt: string | null;
  sourceEvidence: AccountOpeningSourceEvidence[];
  completionDraft: AccountOpeningCompletionDraft;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningReviewExportFile = {
  fileName: string;
  contentType: string;
  content: string;
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
    process.env.INTERNAL_API_KEY?.trim() ||
    process.env.INTERNAL_ADMIN_API_KEY?.trim() ||
    '';

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

async function requestTextFile(
  path: string,
  init?: RequestInit,
): Promise<AccountOpeningReviewExportFile> {
  const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...buildHeaders(false),
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

  const disposition = response.headers.get('content-disposition') ?? '';
  const fileNameMatch = /filename="([^"]+)"/i.exec(disposition);

  return {
    fileName: fileNameMatch?.[1] ?? 'account-opening-review-export.txt',
    contentType:
      response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
    content: await response.text(),
  };
}

export async function getAccountOpeningCase(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{ item: AccountOpeningCaseDetail }>(
    `/account-opening/${encodeURIComponent(id)}`,
  );
  return payload.item;
}

export async function getAccountOpeningDraft(
  id: string,
): Promise<AccountOpeningCompletionDraft> {
  const payload = await requestJson<{ item: AccountOpeningCompletionDraft }>(
    `/account-opening/${encodeURIComponent(id)}/draft`,
  );
  return payload.item;
}

export async function generateAccountOpeningDraft(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
    draft: AccountOpeningCompletionDraft;
  }>(`/account-opening/${encodeURIComponent(id)}/generate-draft`, {
    method: 'POST',
    body: JSON.stringify({
      actorType: 'OPERATOR',
      actorIdentifier: 'web-account-opening-review',
    }),
  });
  return payload.item;
}

export async function downloadAccountOpeningReviewExportFile(
  id: string,
  fileName: string,
): Promise<AccountOpeningReviewExportFile> {
  return requestTextFile(
    `/account-opening/${encodeURIComponent(id)}/export-pack/${encodeURIComponent(fileName)}`,
  );
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
