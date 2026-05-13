import { env } from '../config/env';
import type { AccountOpeningCaseDetail } from './service';

export type AccountOpeningSharePointArchiveConfig = {
  provider?: 'SHAREPOINT' | 'ONEDRIVE';
  enabled: boolean;
  siteId: string;
  driveId: string;
  userId?: string;
  rootFolder?: string;
  baseFolder: string;
  graphAuthConfigured: boolean;
};

export type AccountOpeningArchivePackFile = {
  fileName: string;
  contentType: 'application/json' | 'text/plain' | 'text/markdown' | 'text/html';
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

type GraphRequestDependencies = {
  fetchImpl?: typeof fetch;
  accessTokenProvider?: () => Promise<string>;
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN = /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN = /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;
const MISSING_STORAGE_CREDENTIALS_MESSAGE =
  'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.';

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

export function stringifyAccountOpeningSafeJson(value: unknown): string {
  return stringifySafeJson(value);
}

export function redactAccountOpeningSensitiveText(value: string): string {
  return redactSensitiveText(value);
}

function folderSegment(value: string | null | undefined, fallback: string): string {
  const sanitized = redactSensitiveText(value?.trim() || fallback)
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || '<>:"/\\|?*'.includes(character) ? ' ' : character;
    })
    .join('')
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

function folderPath(value: string | null | undefined, fallback: string): string {
  const segments = splitFolderPath(value?.trim() || fallback)
    .map((segment) => folderSegment(segment, fallback))
    .filter(Boolean);

  return segments.join('/') || fallback;
}

function storageProvider(config: AccountOpeningSharePointArchiveConfig): 'SHAREPOINT' | 'ONEDRIVE' {
  return config.provider ?? 'SHAREPOINT';
}

function storageProviderLabel(config: AccountOpeningSharePointArchiveConfig): string {
  return storageProvider(config) === 'ONEDRIVE' ? 'OneDrive' : 'SharePoint';
}

function storageProviderTargetLabel(config: AccountOpeningSharePointArchiveConfig): string {
  return storageProvider(config) === 'ONEDRIVE' ? 'OneDrive' : 'SharePoint document library';
}

function microsoftDriveLabel(config: AccountOpeningSharePointArchiveConfig): string {
  return `${storageProviderLabel(config)} Microsoft Drive`;
}

export function getAccountOpeningArchiveStorageLabel(config: AccountOpeningSharePointArchiveConfig): string {
  return microsoftDriveLabel(config);
}

function driveApiBasePath(config: AccountOpeningSharePointArchiveConfig, driveId: string): string {
  return storageProvider(config) === 'SHAREPOINT'
    ? `/sites/${encodeURIComponent(config.siteId)}/drives/${encodeURIComponent(driveId)}`
    : `/drives/${encodeURIComponent(driveId)}`;
}

export async function getMicrosoftStorageGraphAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.microsoftStorageTenantId)}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams({
    client_id: env.microsoftStorageClientId,
    client_secret: env.microsoftStorageClientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Microsoft storage Graph token request failed with status ${response.status}. ${errorText}`,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
  };

  if (!payload.access_token) {
    throw new Error('Microsoft storage Graph token response did not include an access token.');
  }

  return payload.access_token;
}

export function getAccountOpeningSharePointArchiveConfig(): AccountOpeningSharePointArchiveConfig {
  const graphAuthConfigured = Boolean(
    env.microsoftStorageTenantId &&
      env.microsoftStorageClientId &&
      env.microsoftStorageClientSecret,
  );

  if (env.accountOpeningStorageProvider === 'ONEDRIVE') {
    return {
      provider: 'ONEDRIVE',
      enabled: env.oneDriveAccountOpeningEnabled,
      siteId: '',
      driveId: env.oneDriveDriveId,
      userId: env.oneDriveUserId,
      rootFolder: env.microsoftDriveRootFolder,
      baseFolder: env.oneDriveAccountOpeningFolder,
      graphAuthConfigured,
    };
  }

  return {
    provider: 'SHAREPOINT',
    enabled: env.sharePointAccountOpeningEnabled,
    siteId: env.sharePointSiteId,
    driveId: env.sharePointDriveId,
    rootFolder: env.microsoftDriveRootFolder,
    baseFolder: env.sharePointAccountOpeningFolder || 'Account Opening',
    graphAuthConfigured,
  };
}

export function getSharePointArchiveSkippedReason(config: AccountOpeningSharePointArchiveConfig): string | null {
  if (!config.enabled) {
    return `${microsoftDriveLabel(config)} account-opening upload is disabled.`;
  }

  if (storageProvider(config) === 'SHAREPOINT' && (!config.siteId || !config.driveId || !config.baseFolder)) {
    return 'SharePoint account-opening upload is enabled but site, drive, or folder configuration is missing.';
  }

  if (storageProvider(config) === 'ONEDRIVE' && (!config.baseFolder || (!config.driveId && !config.userId))) {
    return 'OneDrive account-opening upload is enabled but drive ID, user ID, or folder configuration is missing.';
  }

  if (!config.graphAuthConfigured) {
    return MISSING_STORAGE_CREDENTIALS_MESSAGE;
  }

  return null;
}

export function buildAccountOpeningArchiveFolderPath(
  item: AccountOpeningCaseDetail,
  config: AccountOpeningSharePointArchiveConfig,
  now = new Date(),
  statusFolderOverride?: string,
): string {
  const statusFolder = statusFolderOverride ?? (
    item.status === 'REJECTED'
      ? 'Rejected'
      : item.status === 'APPROVED_FOR_COMPLETION'
        ? 'Approved'
        : 'Pending Review'
  );
  const supplierOrSender = folderSegment(item.companyName || item.senderDomain || item.senderEmail, 'Unknown sender');
  const shortId = folderSegment(item.id.slice(0, 8), 'case');

  return [
    folderPath(config.baseFolder, 'Account Opening'),
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
  fetchImpl: typeof fetch = fetch,
  init?: RequestInit,
): Promise<{ status: number; ok: boolean; payload: T | null; text: string }> {
  const response = await fetchImpl(`https://graph.microsoft.com/v1.0${path}`, {
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

async function resolveDriveId(
  accessToken: string,
  config: AccountOpeningSharePointArchiveConfig,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (config.driveId) {
    return config.driveId;
  }

  if (storageProvider(config) !== 'ONEDRIVE' || !config.userId) {
    throw new Error(`${storageProviderTargetLabel(config)} drive ID is not configured.`);
  }

  const driveResult = await graphJsonRequest<{ id?: string }>(
    accessToken,
    `/users/${encodeURIComponent(config.userId)}/drive`,
    fetchImpl,
  );

  if (!driveResult.ok || !driveResult.payload?.id) {
    throw new Error(`OneDrive drive resolution failed with status ${driveResult.status}.`);
  }

  return driveResult.payload.id;
}

async function ensureSharePointFolderPath(
  accessToken: string,
  config: AccountOpeningSharePointArchiveConfig,
  folderPath: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  let currentPath = '';
  let latestFolderUrl: string | null = null;
  const driveId = await resolveDriveId(accessToken, config, fetchImpl);
  const driveBasePath = driveApiBasePath(config, driveId);

  for (const segment of splitFolderPath(folderPath)) {
    const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
    const getResult = await graphJsonRequest<{ webUrl?: string }>(
      accessToken,
      `${driveBasePath}/root:/${encodeDrivePath(nextPath)}`,
      fetchImpl,
    );

    if (getResult.ok) {
      latestFolderUrl = getResult.payload?.webUrl ?? latestFolderUrl;
      currentPath = nextPath;
      continue;
    }

    if (getResult.status !== 404) {
      throw new Error(`${storageProviderTargetLabel(config)} folder lookup failed with status ${getResult.status}.`);
    }

    const parentChildrenPath = currentPath
      ? `${driveBasePath}/root:/${encodeDrivePath(currentPath)}:/children`
      : `${driveBasePath}/root/children`;
    const createResult = await graphJsonRequest<{ webUrl?: string }>(
      accessToken,
      parentChildrenPath,
      fetchImpl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: segment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
    );

    if (!createResult.ok) {
      throw new Error(`${storageProviderTargetLabel(config)} folder creation failed with status ${createResult.status}.`);
    }

    latestFolderUrl = createResult.payload?.webUrl ?? latestFolderUrl;
    currentPath = nextPath;
  }

  return latestFolderUrl;
}

export function createGraphSharePointArchiveUploader(
  config: AccountOpeningSharePointArchiveConfig,
  dependencies: GraphRequestDependencies = {},
): AccountOpeningSharePointArchiveUploader {
  return {
    uploadArchivePack: async (pack) => {
      const accessToken = await (dependencies.accessTokenProvider ?? getMicrosoftStorageGraphAccessToken)();
      const fetchImpl = dependencies.fetchImpl ?? fetch;
      const driveId = await resolveDriveId(accessToken, config, fetchImpl);
      const folderUrl = await ensureSharePointFolderPath(accessToken, { ...config, driveId }, pack.folderPath, fetchImpl);
      const driveBasePath = driveApiBasePath(config, driveId);

      for (const file of pack.files) {
        const uploadResult = await graphJsonRequest<unknown>(
          accessToken,
          `${driveBasePath}/root:/${encodeDrivePath(`${pack.folderPath}/${file.fileName}`)}:/content`,
          fetchImpl,
          {
            method: 'PUT',
            headers: { 'Content-Type': file.contentType },
            body: file.content,
          },
        );

        if (!uploadResult.ok) {
          throw new Error(`${storageProviderTargetLabel(config)} archive upload failed for ${file.fileName} with status ${uploadResult.status}.`);
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
      note: `Microsoft Drive upload skipped: ${skippedReason}`,
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
      note: `${microsoftDriveLabel(config)} archive pack uploaded: ${pack.metadata.fileNames.join(', ')}.`,
      folderUrl: result.folderUrl,
      skippedReason: null,
      attemptedAt,
      packMetadata: pack.metadata,
    };
  } catch (error) {
    return {
      status: 'UPLOAD_FAILED',
      note: error instanceof Error ? error.message : 'Microsoft Drive archive upload failed.',
      folderUrl: null,
      skippedReason: null,
      attemptedAt,
      packMetadata: pack.metadata,
    };
  }
}
