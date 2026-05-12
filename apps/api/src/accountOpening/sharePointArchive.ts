import { env } from '../config/env';
import { getMicrosoftGraphAccessToken } from '../email/graph';
import type { AccountOpeningCaseDetail } from './service';

export type AccountOpeningSharePointArchiveConfig = {
  enabled: boolean;
  siteId: string;
  driveId: string;
  baseFolder: string;
  graphAuthConfigured: boolean;
};

export type AccountOpeningArchivePackFile = {
  fileName: string;
  contentType: 'application/json';
  content: string;
};

export type AccountOpeningArchivePack = {
  folderPath: string;
  files: AccountOpeningArchivePackFile[];
  metadata: {
    caseId: string;
    sourceFingerprint: string;
    fileNames: string[];
    rawExtractedTextIncluded: false;
    signedFormsIncluded: false;
  };
};

export type AccountOpeningSharePointUploadResult = {
  status: 'UPLOADED' | 'SKIPPED_DISABLED' | 'UPLOAD_FAILED';
  note: string;
  folderUrl: string | null;
  skippedReason: string | null;
  attemptedAt: Date;
  packMetadata?: AccountOpeningArchivePack['metadata'];
};

export type AccountOpeningSharePointArchiveUploader = {
  uploadArchivePack: (pack: AccountOpeningArchivePack) => Promise<{
    folderUrl: string | null;
    uploadedFileNames: string[];
  }>;
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN = /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN = /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;

function redactSensitiveText(value: string): string {
  return value
    .replace(BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN, '[redacted bank account number]')
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function sanitizeJson(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]),
    );
  }

  return value;
}

function stringifySafeJson(value: unknown): string {
  return JSON.stringify(sanitizeJson(value), null, 2);
}

function folderSegment(value: string | null | undefined, fallback: string): string {
  const sanitized = redactSensitiveText(value?.trim() || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized.slice(0, 80) || fallback;
}

function datePart(value: string | null | undefined, fallback: Date): string {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function encodeDrivePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function splitFolderPath(path: string): string[] {
  return path.split('/').map((segment) => segment.trim()).filter(Boolean);
}

export function getAccountOpeningSharePointArchiveConfig(): AccountOpeningSharePointArchiveConfig {
  return {
    enabled: env.sharePointAccountOpeningEnabled,
    siteId: env.sharePointSiteId,
    driveId: env.sharePointDriveId,
    baseFolder: env.sharePointAccountOpeningFolder || 'Account Opening',
    graphAuthConfigured: Boolean(
      env.microsoftGraphTenantId &&
        env.microsoftGraphClientId &&
        (env.microsoftGraphClientSecret || env.microsoftGraphRefreshToken),
    ),
  };
}

export function getSharePointArchiveSkippedReason(config: AccountOpeningSharePointArchiveConfig): string | null {
  if (!config.enabled) {
    return 'SharePoint account-opening upload is disabled.';
  }

  if (!config.siteId || !config.driveId || !config.baseFolder) {
    return 'SharePoint account-opening upload is enabled but site, drive, or folder configuration is missing.';
  }

  if (!config.graphAuthConfigured) {
    return 'SharePoint account-opening upload is enabled but Microsoft Graph authentication is not configured.';
  }

  return null;
}

export function buildAccountOpeningArchiveFolderPath(
  item: AccountOpeningCaseDetail,
  config: AccountOpeningSharePointArchiveConfig,
  now = new Date(),
): string {
  const statusFolder = item.status === 'APPROVED_FOR_COMPLETION' ? 'Approved' : 'Pending Review';
  const supplierOrSender = folderSegment(item.companyName || item.senderDomain || item.senderEmail, 'Unknown sender');
  const shortId = folderSegment(item.id.slice(0, 8), 'case');

  return [
    folderSegment(config.baseFolder, 'Account Opening'),
    statusFolder,
    `${supplierOrSender} - ${datePart(item.receivedAt, now)} - ${shortId}`,
  ].join('/');
}

export function buildAccountOpeningArchivePack(
  item: AccountOpeningCaseDetail,
  config: AccountOpeningSharePointArchiveConfig,
  now = new Date(),
): AccountOpeningArchivePack {
  const folderPath = buildAccountOpeningArchiveFolderPath(item, config, now);
  const files: AccountOpeningArchivePackFile[] = [
    {
      fileName: 'signing-notes.json',
      contentType: 'application/json',
      content: stringifySafeJson(item.signingNotes),
    },
    {
      fileName: 'risk-summary.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        caseId: item.id,
        detectedNames: item.detectedNames,
        detectedRoles: item.detectedRoles,
        reviewerChecks: item.reviewerChecks,
        riskFlags: item.riskFlags,
        signatureInstruction: item.signingNotes.signatureInstruction,
      }),
    },
    {
      fileName: 'missing-info.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        missingFields: item.missingFields,
        missingInfoResponses: item.missingInfoResponses,
      }),
    },
    {
      fileName: 'account-opening-case-summary.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        caseId: item.id,
        sourceFingerprint: item.sourceFingerprint,
        senderEmail: item.senderEmail,
        senderDomain: item.senderDomain,
        subject: item.subject,
        receivedAt: item.receivedAt,
        companyName: item.companyName,
        detectedFormType: item.detectedFormType,
        status: item.status,
        recommendedSigner: item.recommendedSigner,
        signingStatement: item.signingStatement,
        sharePointStatus: item.sharePointStatus,
        rawExtractedTextIncluded: false,
        signedFormsIncluded: false,
        note: 'Review pack only. No signed forms, completed forms, raw extracted text, or supplier-facing messages are included.',
      }),
    },
    {
      fileName: 'original-attachments.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        metadataOnly: true,
        attachmentNames: item.sourceAttachmentNames,
        note: 'Original attachment metadata only. Raw extracted text and signed forms are not included in this archive pack.',
      }),
    },
  ];

  return {
    folderPath,
    files,
    metadata: {
      caseId: item.id,
      sourceFingerprint: item.sourceFingerprint,
      fileNames: files.map((file) => file.fileName),
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
    },
  };
}

async function graphJsonRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; ok: boolean; payload: T | null; text: string }> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: T | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as T;
    } catch {
      payload = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
    text,
  };
}

async function ensureSharePointFolderPath(
  accessToken: string,
  config: AccountOpeningSharePointArchiveConfig,
  folderPath: string,
): Promise<string | null> {
  let currentPath = '';
  let latestFolderUrl: string | null = null;

  for (const segment of splitFolderPath(folderPath)) {
    const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
    const getResult = await graphJsonRequest<{ webUrl?: string }>(
      accessToken,
      `/sites/${encodeURIComponent(config.siteId)}/drives/${encodeURIComponent(config.driveId)}/root:/${encodeDrivePath(nextPath)}`,
    );

    if (getResult.ok) {
      latestFolderUrl = getResult.payload?.webUrl ?? latestFolderUrl;
      currentPath = nextPath;
      continue;
    }

    if (getResult.status !== 404) {
      throw new Error(`SharePoint folder lookup failed with status ${getResult.status}.`);
    }

    const parentChildrenPath = currentPath
      ? `/sites/${encodeURIComponent(config.siteId)}/drives/${encodeURIComponent(config.driveId)}/root:/${encodeDrivePath(currentPath)}:/children`
      : `/sites/${encodeURIComponent(config.siteId)}/drives/${encodeURIComponent(config.driveId)}/root/children`;
    const createResult = await graphJsonRequest<{ webUrl?: string }>(accessToken, parentChildrenPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: segment,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });

    if (!createResult.ok) {
      throw new Error(`SharePoint folder creation failed with status ${createResult.status}.`);
    }

    latestFolderUrl = createResult.payload?.webUrl ?? latestFolderUrl;
    currentPath = nextPath;
  }

  return latestFolderUrl;
}

export function createGraphSharePointArchiveUploader(
  config: AccountOpeningSharePointArchiveConfig,
): AccountOpeningSharePointArchiveUploader {
  return {
    uploadArchivePack: async (pack) => {
      const accessToken = await getMicrosoftGraphAccessToken();
      const folderUrl = await ensureSharePointFolderPath(accessToken, config, pack.folderPath);

      for (const file of pack.files) {
        const uploadResult = await graphJsonRequest<unknown>(
          accessToken,
          `/sites/${encodeURIComponent(config.siteId)}/drives/${encodeURIComponent(config.driveId)}/root:/${encodeDrivePath(`${pack.folderPath}/${file.fileName}`)}:/content`,
          {
            method: 'PUT',
            headers: { 'Content-Type': file.contentType },
            body: file.content,
          },
        );

        if (!uploadResult.ok) {
          throw new Error(`SharePoint archive upload failed for ${file.fileName} with status ${uploadResult.status}.`);
        }
      }

      return {
        folderUrl,
        uploadedFileNames: pack.files.map((file) => file.fileName),
      };
    },
  };
}

export async function uploadAccountOpeningArchivePack(input: {
  item: AccountOpeningCaseDetail;
  config?: AccountOpeningSharePointArchiveConfig;
  uploader?: AccountOpeningSharePointArchiveUploader;
  now?: Date;
}): Promise<AccountOpeningSharePointUploadResult> {
  const attemptedAt = input.now ?? new Date();
  const config = input.config ?? getAccountOpeningSharePointArchiveConfig();
  const skippedReason = getSharePointArchiveSkippedReason(config);

  if (skippedReason) {
    return {
      status: 'SKIPPED_DISABLED',
      note: `SharePoint upload skipped: ${skippedReason}`,
      folderUrl: null,
      skippedReason,
      attemptedAt,
    };
  }

  const pack = buildAccountOpeningArchivePack(input.item, config, attemptedAt);

  try {
    const result = await (input.uploader ?? createGraphSharePointArchiveUploader(config)).uploadArchivePack(pack);
    return {
      status: 'UPLOADED',
      note: `SharePoint archive pack uploaded: ${pack.metadata.fileNames.join(', ')}.`,
      folderUrl: result.folderUrl,
      skippedReason: null,
      attemptedAt,
      packMetadata: pack.metadata,
    };
  } catch (error) {
    return {
      status: 'UPLOAD_FAILED',
      note: error instanceof Error ? error.message : 'SharePoint archive upload failed.',
      folderUrl: null,
      skippedReason: null,
      attemptedAt,
      packMetadata: pack.metadata,
    };
  }
}
