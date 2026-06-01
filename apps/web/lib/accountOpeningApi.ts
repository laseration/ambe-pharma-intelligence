import 'server-only';

import type {
  AccountOpeningCaseDetail,
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
  requestInternalTextFile,
} from './internalApiRequest';

export type {
  AccountOpeningBinaryFillPreviewDetail,
  AccountOpeningCaseDetail,
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
  AccountOpeningReadinessCheck,
  AccountOpeningReadinessReport,
  AccountOpeningReadinessStatus,
  AccountOpeningSigningNotes,
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
    init,
  });
}

async function requestTextFile(
  path: string,
  init?: RequestInit,
): Promise<AccountOpeningReviewExportFile> {
  return requestInternalTextFile(path, {
    callerName: CALLER_NAME,
    init,
    fallbackFileName: 'account-opening-review-export.txt',
    fallbackContentType: 'text/plain; charset=utf-8',
  });
}

async function requestBinaryFile(
  path: string,
  init?: RequestInit,
): Promise<AccountOpeningBinaryPreviewFile> {
  return requestInternalBinaryFile(path, {
    callerName: CALLER_NAME,
    init,
    fallbackFileName: 'binary-fill-preview.pdf',
    fallbackContentType: 'application/pdf',
  });
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

export async function getAccountOpeningReadiness(
  id: string,
): Promise<AccountOpeningReadinessReport> {
  const payload = await requestJson<{ item: AccountOpeningReadinessReport }>(
    `/account-opening/${encodeURIComponent(id)}/readiness`,
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

export async function generateAccountOpeningFillPreview(
  id: string,
): Promise<AccountOpeningCaseDetail> {
  const payload = await requestJson<{
    item: AccountOpeningCaseDetail;
  }>(`/account-opening/${encodeURIComponent(id)}/fill-preview`, {
    method: 'POST',
    body: JSON.stringify({
      actorType: 'OPERATOR',
      actorIdentifier: 'web-account-opening-review',
    }),
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
    method: 'POST',
    body: JSON.stringify({
      actorType: 'OPERATOR',
      actorIdentifier: 'web-account-opening-review',
    }),
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
      method: 'POST',
      body: JSON.stringify({
        ...body,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
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
    method: 'POST',
    body: JSON.stringify({
      ...body,
      actorType: 'OPERATOR',
      actorIdentifier: 'web-account-opening-review',
    }),
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
      method: 'PATCH',
      body: JSON.stringify({
        mappings,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-account-opening-review',
      }),
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
