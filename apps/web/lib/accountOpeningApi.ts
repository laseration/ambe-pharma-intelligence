import 'server-only';

import type {
  AccountOpeningCaseDetail,
  AccountOpeningCaseListResponse,
  AccountOpeningDocumentClassification,
  AccountOpeningManualCaseCreated,
  AccountOpeningManualCaseInput,
  AccountOpeningCompletionDraft,
  AccountOpeningCompletedFormFilingDetail,
  AccountOpeningFieldMappingReview,
  AccountOpeningFieldMappingSaveInput,
  AccountOpeningMissingInfoResponses,
  AccountOpeningReadinessReport,
  AccountOpeningStatusAction,
} from '@ambe/shared';

import {
  requestInternalBinaryFile,
  requestInternalJson,
  requestInternalMultipart,
  requestInternalTextFile,
} from './internalApiRequest';
import type { WebCapability } from './authorisation';

export type {
  AccountOpeningBinaryFillPreviewDetail,
  AccountOpeningCaseDetail,
  AccountOpeningCaseListItem,
  AccountOpeningCaseListResponse,
  AccountOpeningCaseType,
  AccountOpeningManualCaseCreated,
  AccountOpeningManualCaseInput,
  AccountOpeningCompletedFormFilingDetail,
  AccountOpeningCompletionDraft,
  AccountOpeningDocumentLifecycleSummary,
  AccountOpeningDraftField,
  AccountOpeningFieldMapping,
  AccountOpeningFieldMappingReview,
  AccountOpeningFieldMappingSaveInput,
  AccountOpeningFieldMappingStatus,
  AccountOpeningFillPreviewDetail,
  AccountOpeningMissingInfoResponses,
  AccountOpeningOriginalForm,
  AccountOpeningOriginalFormLifecycle,
  AccountOpeningPolicyRiskFlag,
  AccountOpeningProcessingRun,
  AccountOpeningReadinessCheck,
  AccountOpeningReadinessReport,
  AccountOpeningReadinessStatus,
  AccountOpeningSigningNotes,
  AccountOpeningSourceProvenance,
  AccountOpeningSourceEvidence,
  AccountOpeningStatusAction,
} from '@ambe/shared';
export type AccountOpeningReviewExportFile = {
  fileName: string;
  contentType: string;
  content: string;
};

export type AccountOpeningBinaryPreviewFile = {
  fileName: string;
  contentType: string;
  content: ArrayBuffer;
};

const CALLER_NAME = 'web-account-opening-review';

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

async function requestTextFile(
  path: string,
  options?: {
    init?: RequestInit;
    requiredCapability?: WebCapability;
  },
): Promise<AccountOpeningReviewExportFile> {
  return requestInternalTextFile(path, {
    callerName: CALLER_NAME,
    requiredCapability:
      options?.requiredCapability ?? 'account-opening:download',
    init: options?.init,
    fallbackFileName: 'account-opening-review-export.txt',
    fallbackContentType: 'text/plain; charset=utf-8',
  });
}

async function requestBinaryFile(
  path: string,
  options?: {
    init?: RequestInit;
    requiredCapability?: WebCapability;
  },
): Promise<AccountOpeningBinaryPreviewFile> {
  return requestInternalBinaryFile(path, {
    callerName: CALLER_NAME,
    requiredCapability:
      options?.requiredCapability ?? 'account-opening:download',
    init: options?.init,
    fallbackFileName: 'binary-fill-preview.pdf',
    fallbackContentType: 'application/pdf',
  });
}

export type AccountOpeningCaseListFilter = {
  status?: string;
  search?: string;
  limit?: number;
};

export async function listAccountOpeningCases(
  filter: AccountOpeningCaseListFilter = {},
): Promise<AccountOpeningCaseListResponse> {
  const params = new URLSearchParams();
  if (filter.status) {
    params.set('status', filter.status);
  }
  if (filter.search) {
    params.set('search', filter.search);
  }
  if (filter.limit != null) {
    params.set('limit', String(filter.limit));
  }
  const query = params.toString();
  return requestJson<AccountOpeningCaseListResponse>(
    `/account-opening${query ? `?${query}` : ''}`,
    { requiredCapability: 'account-opening:view' },
  );
}

export async function createManualAccountOpeningCase(
  input: AccountOpeningManualCaseInput,
): Promise<AccountOpeningManualCaseCreated> {
  const payload = await requestJson<{ item: AccountOpeningManualCaseCreated }>(
    '/account-opening',
    {
      requiredCapability: 'account-opening:manage',
      init: {
        method: 'POST',
        body: JSON.stringify({
          counterpartyName: input.counterpartyName,
          counterpartyEmail: input.counterpartyEmail ?? null,
          caseType: input.caseType,
          internalNote: input.internalNote ?? null,
          actorType: 'OPERATOR',
          actorIdentifier: 'web-account-opening-create',
        }),
      },
    },
  );
  return payload.item;
}

export type AccountOpeningDocumentUploadResult = {
  item: AccountOpeningCaseDetail;
  classification: AccountOpeningDocumentClassification;
  supplierName: string | null;
};

export async function uploadAccountOpeningCaseDocument(
  id: string,
  formData: FormData,
): Promise<AccountOpeningDocumentUploadResult> {
  return requestInternalMultipart<AccountOpeningDocumentUploadResult>(
    `/account-opening/${encodeURIComponent(id)}/documents`,
    {
      callerName: CALLER_NAME,
      requiredCapability: 'account-opening:manage',
      formData,
    },
  );
}

export async function getAccountOpeningCase(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{ item: AccountOpeningCaseDetail }>(
    `/account-opening/${encodeURIComponent(id)}`,
    { requiredCapability: 'account-opening:view' },
  );
  return payload.item;
}

export type AccountOpeningCaseTimelineEntry = {
  id: string;
  actionType: string;
  label: string;
  actorType: string | null;
  actorIdentifier: string | null;
  note: string | null;
  detail: string | null;
  occurredAt: string;
};

export async function getAccountOpeningCaseTimeline(
  id: string,
): Promise<AccountOpeningCaseTimelineEntry[]> {
  const payload = await requestJson<{
    items: AccountOpeningCaseTimelineEntry[];
  }>(`/account-opening/${encodeURIComponent(id)}/timeline`, {
    requiredCapability: 'account-opening:view',
  });
  return payload.items;
}

export async function getAccountOpeningDraft(
  id: string,
): Promise<AccountOpeningCompletionDraft> {
  const payload = await requestJson<{ item: AccountOpeningCompletionDraft }>(
    `/account-opening/${encodeURIComponent(id)}/draft`,
    { requiredCapability: 'account-opening:view' },
  );
  return payload.item;
}

export async function getAccountOpeningReadiness(
  id: string,
): Promise<AccountOpeningReadinessReport> {
  const payload = await requestJson<{ item: AccountOpeningReadinessReport }>(
    `/account-opening/${encodeURIComponent(id)}/readiness`,
    { requiredCapability: 'account-opening:view' },
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
    requiredCapability: 'account-opening:manage',
    init: {
      method: 'POST',
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
  });
  return payload.item;
}

export async function reprocessAccountOpeningStoredSource(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
  }>(`/account-opening/${encodeURIComponent(id)}/reprocess-stored-source`, {
    requiredCapability: 'account-opening:manage',
    init: {
      method: 'POST',
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
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

export async function generateAccountOpeningFillPreview(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
  }>(`/account-opening/${encodeURIComponent(id)}/fill-preview`, {
    requiredCapability: 'account-opening:manage',
    init: {
      method: 'POST',
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
  });
  return payload.item;
}

export async function downloadAccountOpeningFillPreviewFile(
  id: string,
  fileName: string,
): Promise<AccountOpeningReviewExportFile> {
  return requestTextFile(
    `/account-opening/${encodeURIComponent(id)}/fill-preview/${encodeURIComponent(fileName)}`,
  );
}

export async function generateAccountOpeningBinaryFillPreview(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
  }>(`/account-opening/${encodeURIComponent(id)}/binary-fill-preview`, {
    requiredCapability: 'account-opening:manage',
    init: {
      method: 'POST',
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
  });
  return payload.item;
}

export async function downloadAccountOpeningBinaryFillPreviewFile(
  id: string,
  fileName: string,
): Promise<AccountOpeningBinaryPreviewFile> {
  return requestBinaryFile(
    `/account-opening/${encodeURIComponent(id)}/binary-fill-preview/${encodeURIComponent(fileName)}`,
  );
}

export async function approveAccountOpeningCompletedFormFiling(
  id: string,
  body: {
    binaryFillPreviewId?: string | null;
    approvalNote?: string | null;
  },
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
    filing: AccountOpeningCompletedFormFilingDetail;
  }>(
    `/account-opening/${encodeURIComponent(id)}/completed-form-filing/approve`,
    {
      requiredCapability: 'account-opening:manage',
      init: {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          actorType: 'OPERATOR',
          actorIdentifier: 'web-account-opening-review',
        }),
      },
    },
  );
  return payload.item;
}

export async function fileAccountOpeningCompletedFormToSharePoint(
  id: string,
  body: {
    binaryFillPreviewId?: string | null;
    filingNote?: string | null;
  },
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
    filing: AccountOpeningCompletedFormFilingDetail;
  }>(`/account-opening/${encodeURIComponent(id)}/completed-form-filing/file`, {
    requiredCapability: 'account-opening:manage',
    init: {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
    },
  });
  return payload.item;
}

export async function saveAccountOpeningFieldMappings(
  id: string,
  mappings: AccountOpeningFieldMappingSaveInput[],
): Promise<AccountOpeningFieldMappingReview> {
  const payload = await requestJson<{ item: AccountOpeningFieldMappingReview }>(
    `/account-opening/${encodeURIComponent(id)}/field-mappings`,
    {
      requiredCapability: 'account-opening:manage',
      init: {
        method: 'PATCH',
        body: JSON.stringify({
          mappings,
          actorType: 'OPERATOR',
          actorIdentifier: 'web-account-opening-review',
        }),
      },
    },
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
      requiredCapability: 'account-opening:manage',
      init: {
        method: 'PATCH',
        body: JSON.stringify({
          ...missingInfoResponses,
          actorType: 'OPERATOR',
          actorIdentifier: 'web-account-opening-review',
        }),
      },
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
      requiredCapability: 'account-opening:manage',
      init: {
        method: 'PATCH',
        body: JSON.stringify({
          ...body,
          actorType: 'OPERATOR',
          actorIdentifier: 'web-account-opening-review',
        }),
      },
    },
  );
  return payload.item;
}
