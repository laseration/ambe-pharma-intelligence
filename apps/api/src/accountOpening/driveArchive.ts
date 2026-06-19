import { env } from '../config/env';
import type {
  AccountOpeningBinaryFillPreviewDetail,
  AccountOpeningCaseDetail,
} from './service';

export type AccountOpeningDriveArchiveConfig = {
  provider: 'SHAREPOINT' | 'ONEDRIVE';
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
  contentType: 'application/json' | 'text/plain';
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
    completedSupplierFormsIncluded: false;
    pdfWordFormsFilled: false;
    supplierMessageIncluded: false;
  };
};

export type AccountOpeningDriveArchiveUploadResult = {
  status: 'UPLOADED' | 'SKIPPED_DISABLED' | 'UPLOAD_FAILED';
  note: string;
  folderUrl: string | null;
  skippedReason: string | null;
  attemptedAt: Date;
  packMetadata?: AccountOpeningArchivePack['metadata'];
};

export type AccountOpeningDriveArchiveUploader = {
  uploadArchivePack: (pack: AccountOpeningArchivePack) => Promise<{
    folderUrl: string | null;
    uploadedFileNames: string[];
  }>;
};

export type AccountOpeningCompletedFormFile = {
  fileName: string;
  contentType: 'application/pdf';
  content: Uint8Array;
};

export type AccountOpeningCompletedFormFilingPack = {
  folderPath: string;
  file: AccountOpeningCompletedFormFile;
  metadata: {
    caseId: string;
    binaryFillPreviewId: string;
    sourceFingerprint: string;
    fileName: string;
    contentType: 'application/pdf';
    fileHash: string;
    fileSizeBytes: number;
    completedUnsignedForm: true;
    approvedForFilingRequired: true;
    internalSharePointFilingOnly: true;
    notSigned: true;
    notSent: true;
    notSubmitted: true;
    blockedReviewRequiredFieldsRemainBlank: true;
    rawExtractedTextIncluded: false;
    rawBankDetailsIncluded: false;
    signedFormsIncluded: false;
    paymentAuthorityCompleted: false;
    directDebitMandateCompleted: false;
    guaranteeIndemnityCompleted: false;
    supplierMessageIncluded: false;
    supplierSubmissionTriggered: false;
    purchaseWorkflowTriggered: false;
  };
};

export type AccountOpeningCompletedFormFilingUploadResult = {
  status: 'UPLOADED' | 'SKIPPED_DISABLED' | 'UPLOAD_FAILED';
  note: string;
  storageProvider: 'SHAREPOINT' | 'ONEDRIVE';
  folderUrl: string | null;
  fileUrl: string | null;
  driveItemId: string | null;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  skippedReason: string | null;
  attemptedAt: Date;
  metadata: AccountOpeningCompletedFormFilingPack['metadata'];
};

export type AccountOpeningCompletedFormFilingUploader = {
  uploadCompletedForm: (
    pack: AccountOpeningCompletedFormFilingPack,
  ) => Promise<{
    folderUrl: string | null;
    fileUrl: string | null;
    driveItemId: string | null;
  }>;
};

type GraphRequestDependencies = {
  fetchImpl?: typeof fetch;
  accessTokenProvider?: () => Promise<string>;
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;
const MISSING_STORAGE_CREDENTIALS_MESSAGE =
  'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.';

function redactSensitiveText(value: string): string {
  return value
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
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

function folderSegment(
  value: string | null | undefined,
  fallback: string,
): string {
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
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function encodeDrivePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function splitFolderPath(path: string): string[] {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function folderPath(
  value: string | null | undefined,
  fallback: string,
): string {
  const segments = splitFolderPath(value?.trim() || fallback)
    .map((segment) => folderSegment(segment, fallback))
    .filter(Boolean);

  return segments.join('/') || fallback;
}

function storageProviderLabel(
  config: AccountOpeningDriveArchiveConfig,
): string {
  return config.provider === 'ONEDRIVE' ? 'OneDrive' : 'SharePoint';
}

function storageTargetLabel(config: AccountOpeningDriveArchiveConfig): string {
  return config.provider === 'ONEDRIVE'
    ? 'OneDrive'
    : 'SharePoint document library';
}

function microsoftDriveLabel(config: AccountOpeningDriveArchiveConfig): string {
  return `${storageProviderLabel(config)} Microsoft Drive`;
}

function driveApiBasePath(
  config: AccountOpeningDriveArchiveConfig,
  driveId: string,
): string {
  return config.provider === 'SHAREPOINT'
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

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error(
      'Microsoft storage Graph token response did not include an access token.',
    );
  }

  return payload.access_token;
}

export function getAccountOpeningDriveArchiveConfig(): AccountOpeningDriveArchiveConfig {
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

export function getDriveArchiveSkippedReason(
  config: AccountOpeningDriveArchiveConfig,
): string | null {
  if (!config.enabled) {
    return `${microsoftDriveLabel(config)} account-opening upload is disabled.`;
  }

  if (
    config.provider === 'SHAREPOINT' &&
    (!config.siteId || !config.driveId || !config.baseFolder)
  ) {
    return 'SharePoint account-opening upload is enabled but site, drive, or folder configuration is missing.';
  }

  if (
    config.provider === 'ONEDRIVE' &&
    (!config.baseFolder || (!config.driveId && !config.userId))
  ) {
    return 'OneDrive account-opening upload is enabled but drive ID, user ID, or folder configuration is missing.';
  }

  if (!config.graphAuthConfigured) {
    return MISSING_STORAGE_CREDENTIALS_MESSAGE;
  }

  return null;
}

export function buildAccountOpeningArchiveFolderPath(
  item: AccountOpeningCaseDetail,
  config: AccountOpeningDriveArchiveConfig,
  now = new Date(),
): string {
  const statusFolder =
    item.status === 'REJECTED'
      ? 'Rejected'
      : item.status === 'APPROVED_FOR_COMPLETION'
        ? 'Approved'
        : 'Pending Review';
  const supplierOrSender = folderSegment(
    item.companyName || item.senderDomain || item.senderEmail,
    'Unknown sender',
  );
  const shortId = folderSegment(item.id.slice(0, 8), 'case');

  return [
    folderPath(config.baseFolder, 'Account Opening'),
    statusFolder,
    `${supplierOrSender} - ${datePart(item.receivedAt, now)} - ${shortId}`,
  ].join('/');
}

export function buildAccountOpeningArchivePack(
  item: AccountOpeningCaseDetail,
  config: AccountOpeningDriveArchiveConfig,
  now = new Date(),
): AccountOpeningArchivePack {
  const pack: AccountOpeningArchivePack = {
    folderPath: buildAccountOpeningArchiveFolderPath(item, config, now),
    files: [
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
          rawExtractedTextIncluded: false,
          signedFormsIncluded: false,
          completedSupplierFormsIncluded: false,
          pdfWordFormsFilled: false,
          supplierMessageIncluded: false,
          note: 'Review archive only. No signed forms, completed supplier PDF/Word forms, raw extracted text, or supplier-facing messages are included.',
        }),
      },
      {
        fileName: 'completion-draft.json',
        contentType: 'application/json',
        content: stringifySafeJson({
          ...item.completionDraft,
          note: 'Structured completion draft only. This does not fill supplier PDF/Word forms. Blocked fields must not be signed, sent, submitted, or completed automatically.',
        }),
      },
      {
        fileName: 'source-evidence.json',
        contentType: 'application/json',
        content: stringifySafeJson({
          metadataOnly: true,
          sourceEvidence: item.sourceEvidence,
          note: 'Safe evidence references only. Original file bytes and raw extracted text are not included.',
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
    ],
    metadata: {
      caseId: item.id,
      sourceFingerprint: item.sourceFingerprint,
      fileNames: [],
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
      completedSupplierFormsIncluded: false,
      pdfWordFormsFilled: false,
      supplierMessageIncluded: false,
    },
  };

  pack.metadata.fileNames = pack.files.map((file) => file.fileName);
  return pack;
}

function safeFileBaseName(value: string | null | undefined): string {
  const sanitized = folderSegment(value?.replace(/\.pdf$/i, ''), 'form')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  return sanitized.slice(0, 80) || 'form';
}

function timestampPart(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function buildAccountOpeningCompletedFormFolderPath(
  item: AccountOpeningCaseDetail,
  config: AccountOpeningDriveArchiveConfig,
  now = new Date(),
): string {
  const supplierOrSender = folderSegment(
    item.companyName || item.senderDomain || item.senderEmail,
    'Unknown sender',
  );
  const shortId = folderSegment(item.id.slice(0, 8), 'case');

  return [
    folderPath(config.baseFolder, 'Account Opening'),
    'Completed unsigned forms',
    `${supplierOrSender} - ${datePart(item.receivedAt, now)} - ${shortId}`,
  ].join('/');
}

export function buildAccountOpeningCompletedFormFileName(input: {
  originalFileName?: string | null;
  previewFileName?: string | null;
  fileHash: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const sourceName = input.originalFileName || input.previewFileName;
  const shortHash = input.fileHash.slice(0, 12) || 'nohash';

  return `${safeFileBaseName(sourceName)}-completed-unsigned-${timestampPart(now)}-${shortHash}.pdf`;
}

export function buildAccountOpeningCompletedFormFilingPack(input: {
  item: AccountOpeningCaseDetail;
  preview: AccountOpeningBinaryFillPreviewDetail;
  content: Uint8Array;
  fileHash: string;
  config: AccountOpeningDriveArchiveConfig;
  now?: Date;
}): AccountOpeningCompletedFormFilingPack {
  const now = input.now ?? new Date();
  const originalForm = input.item.originalForms.find(
    (form) => form.id === input.preview.originalFormId,
  );
  const fileName = buildAccountOpeningCompletedFormFileName({
    originalFileName: originalForm?.fileName,
    previewFileName: input.preview.binaryPreviewFileName,
    fileHash: input.fileHash,
    now,
  });

  return {
    folderPath: buildAccountOpeningCompletedFormFolderPath(
      input.item,
      input.config,
      now,
    ),
    file: {
      fileName,
      contentType: 'application/pdf',
      content: input.content,
    },
    metadata: {
      caseId: input.item.id,
      binaryFillPreviewId: input.preview.id,
      sourceFingerprint: input.item.sourceFingerprint,
      fileName,
      contentType: 'application/pdf',
      fileHash: input.fileHash,
      fileSizeBytes: input.content.byteLength,
      completedUnsignedForm: true,
      approvedForFilingRequired: true,
      internalSharePointFilingOnly: true,
      notSigned: true,
      notSent: true,
      notSubmitted: true,
      blockedReviewRequiredFieldsRemainBlank: true,
      rawExtractedTextIncluded: false,
      rawBankDetailsIncluded: false,
      signedFormsIncluded: false,
      paymentAuthorityCompleted: false,
      directDebitMandateCompleted: false,
      guaranteeIndemnityCompleted: false,
      supplierMessageIncluded: false,
      supplierSubmissionTriggered: false,
      purchaseWorkflowTriggered: false,
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
  config: AccountOpeningDriveArchiveConfig,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (config.driveId) {
    return config.driveId;
  }

  if (config.provider !== 'ONEDRIVE' || !config.userId) {
    throw new Error(
      `${storageTargetLabel(config)} drive ID is not configured.`,
    );
  }

  const driveResult = await graphJsonRequest<{ id?: string }>(
    accessToken,
    `/users/${encodeURIComponent(config.userId)}/drive`,
    fetchImpl,
  );

  if (!driveResult.ok || !driveResult.payload?.id) {
    throw new Error(
      `OneDrive drive resolution failed with status ${driveResult.status}.`,
    );
  }

  return driveResult.payload.id;
}

async function ensureDriveFolderPath(
  accessToken: string,
  config: AccountOpeningDriveArchiveConfig,
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
      throw new Error(
        `${storageTargetLabel(config)} folder lookup failed with status ${getResult.status}.`,
      );
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
      throw new Error(
        `${storageTargetLabel(config)} folder creation failed with status ${createResult.status}.`,
      );
    }

    latestFolderUrl = createResult.payload?.webUrl ?? latestFolderUrl;
    currentPath = nextPath;
  }

  return latestFolderUrl;
}

export function createGraphDriveArchiveUploader(
  config: AccountOpeningDriveArchiveConfig,
  dependencies: GraphRequestDependencies = {},
): AccountOpeningDriveArchiveUploader {
  return {
    uploadArchivePack: async (pack) => {
      const accessToken = await (
        dependencies.accessTokenProvider ?? getMicrosoftStorageGraphAccessToken
      )();
      const fetchImpl = dependencies.fetchImpl ?? fetch;
      const driveId = await resolveDriveId(accessToken, config, fetchImpl);
      const configWithDrive = { ...config, driveId };
      const folderUrl = await ensureDriveFolderPath(
        accessToken,
        configWithDrive,
        pack.folderPath,
        fetchImpl,
      );
      const driveBasePath = driveApiBasePath(configWithDrive, driveId);

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
          throw new Error(
            `${storageTargetLabel(config)} archive upload failed for ${file.fileName} with status ${uploadResult.status}.`,
          );
        }
      }

      return {
        folderUrl,
        uploadedFileNames: pack.files.map((file) => file.fileName),
      };
    },
  };
}

export function createGraphCompletedFormFilingUploader(
  config: AccountOpeningDriveArchiveConfig,
  dependencies: GraphRequestDependencies = {},
): AccountOpeningCompletedFormFilingUploader {
  return {
    uploadCompletedForm: async (pack) => {
      const accessToken = await (
        dependencies.accessTokenProvider ?? getMicrosoftStorageGraphAccessToken
      )();
      const fetchImpl = dependencies.fetchImpl ?? fetch;
      const driveId = await resolveDriveId(accessToken, config, fetchImpl);
      const configWithDrive = { ...config, driveId };
      const folderUrl = await ensureDriveFolderPath(
        accessToken,
        configWithDrive,
        pack.folderPath,
        fetchImpl,
      );
      const driveBasePath = driveApiBasePath(configWithDrive, driveId);
      const uploadResult = await graphJsonRequest<{
        id?: string;
        webUrl?: string;
      }>(
        accessToken,
        `${driveBasePath}/root:/${encodeDrivePath(`${pack.folderPath}/${pack.file.fileName}`)}:/content`,
        fetchImpl,
        {
          method: 'PUT',
          headers: { 'Content-Type': pack.file.contentType },
          body: Buffer.from(pack.file.content),
        },
      );

      if (!uploadResult.ok) {
        throw new Error(
          `${storageTargetLabel(config)} completed unsigned form upload failed for ${pack.file.fileName} with status ${uploadResult.status}.`,
        );
      }

      return {
        folderUrl,
        fileUrl: uploadResult.payload?.webUrl ?? null,
        driveItemId: uploadResult.payload?.id ?? null,
      };
    },
  };
}

export type AccountOpeningOriginalDocumentUploader = {
  uploadOriginalDocument: (pack: {
    folderPath: string;
    file: { fileName: string; contentType: string; content: Uint8Array };
  }) => Promise<{
    folderUrl: string | null;
    fileUrl: string | null;
    driveItemId: string | null;
  }>;
};

export type AccountOpeningOriginalDocumentUploadResult = {
  status: 'UPLOADED' | 'SKIPPED_DISABLED' | 'UPLOAD_FAILED';
  note: string;
  storageProvider: 'SHAREPOINT' | 'ONEDRIVE' | null;
  folderUrl: string | null;
  fileUrl: string | null;
  driveItemId: string | null;
  skippedReason: string | null;
  attemptedAt: Date;
};

// Uploads a raw uploaded original document (any type) to the same case folder as
// the review archive, under a "Received documents" subfolder. Generic
// contentType (PDF/image/DOCX/XLSX), unlike the completed-form uploader.
export function createGraphOriginalDocumentUploader(
  config: AccountOpeningDriveArchiveConfig,
  dependencies: GraphRequestDependencies = {},
): AccountOpeningOriginalDocumentUploader {
  return {
    uploadOriginalDocument: async (pack) => {
      const accessToken = await (
        dependencies.accessTokenProvider ?? getMicrosoftStorageGraphAccessToken
      )();
      const fetchImpl = dependencies.fetchImpl ?? fetch;
      const driveId = await resolveDriveId(accessToken, config, fetchImpl);
      const configWithDrive = { ...config, driveId };
      const folderUrl = await ensureDriveFolderPath(
        accessToken,
        configWithDrive,
        pack.folderPath,
        fetchImpl,
      );
      const driveBasePath = driveApiBasePath(configWithDrive, driveId);
      const uploadResult = await graphJsonRequest<{
        id?: string;
        webUrl?: string;
      }>(
        accessToken,
        `${driveBasePath}/root:/${encodeDrivePath(`${pack.folderPath}/${pack.file.fileName}`)}:/content`,
        fetchImpl,
        {
          method: 'PUT',
          headers: { 'Content-Type': pack.file.contentType },
          body: Buffer.from(pack.file.content),
        },
      );

      if (!uploadResult.ok) {
        throw new Error(
          `${storageTargetLabel(config)} original document upload failed for ${pack.file.fileName} with status ${uploadResult.status}.`,
        );
      }

      return {
        folderUrl,
        fileUrl: uploadResult.payload?.webUrl ?? null,
        driveItemId: uploadResult.payload?.id ?? null,
      };
    },
  };
}

export async function uploadAccountOpeningOriginalDocument(input: {
  item: AccountOpeningCaseDetail;
  file: { fileName: string; contentType: string; content: Uint8Array };
  config?: AccountOpeningDriveArchiveConfig;
  uploader?: AccountOpeningOriginalDocumentUploader;
  now?: Date;
}): Promise<AccountOpeningOriginalDocumentUploadResult> {
  const attemptedAt = input.now ?? new Date();
  const config = input.config ?? getAccountOpeningDriveArchiveConfig();
  const skippedReason = getDriveArchiveSkippedReason(config);

  if (skippedReason) {
    return {
      status: 'SKIPPED_DISABLED',
      note: skippedReason,
      storageProvider: null,
      folderUrl: null,
      fileUrl: null,
      driveItemId: null,
      skippedReason,
      attemptedAt,
    };
  }

  const folderPath = `${buildAccountOpeningArchiveFolderPath(input.item, config, attemptedAt)}/Received documents`;
  const safeFileName = folderSegment(input.file.fileName, 'document');
  const uploader =
    input.uploader ?? createGraphOriginalDocumentUploader(config);

  try {
    const result = await uploader.uploadOriginalDocument({
      folderPath,
      file: {
        fileName: safeFileName,
        contentType: input.file.contentType,
        content: input.file.content,
      },
    });

    return {
      status: 'UPLOADED',
      note: `Filed the uploaded document to ${storageProviderLabel(config)} for review.`,
      storageProvider: config.provider,
      folderUrl: result.folderUrl,
      fileUrl: result.fileUrl,
      driveItemId: result.driveItemId,
      skippedReason: null,
      attemptedAt,
    };
  } catch (error) {
    return {
      status: 'UPLOAD_FAILED',
      note: redactSensitiveText(
        error instanceof Error
          ? error.message
          : 'Original document upload failed.',
      ),
      storageProvider: config.provider,
      folderUrl: null,
      fileUrl: null,
      driveItemId: null,
      skippedReason: null,
      attemptedAt,
    };
  }
}

export async function uploadAccountOpeningArchivePack(input: {
  item: AccountOpeningCaseDetail;
  config?: AccountOpeningDriveArchiveConfig;
  uploader?: AccountOpeningDriveArchiveUploader;
  now?: Date;
}): Promise<AccountOpeningDriveArchiveUploadResult> {
  const attemptedAt = input.now ?? new Date();
  const config = input.config ?? getAccountOpeningDriveArchiveConfig();
  const skippedReason = getDriveArchiveSkippedReason(config);

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
    const result = await (
      input.uploader ?? createGraphDriveArchiveUploader(config)
    ).uploadArchivePack(pack);
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
      note:
        error instanceof Error
          ? error.message
          : 'Microsoft Drive archive upload failed.',
      folderUrl: null,
      skippedReason: null,
      attemptedAt,
      packMetadata: pack.metadata,
    };
  }
}

export async function uploadAccountOpeningCompletedFormFiling(input: {
  item: AccountOpeningCaseDetail;
  preview: AccountOpeningBinaryFillPreviewDetail;
  content: Uint8Array;
  fileHash: string;
  config?: AccountOpeningDriveArchiveConfig;
  uploader?: AccountOpeningCompletedFormFilingUploader;
  now?: Date;
}): Promise<AccountOpeningCompletedFormFilingUploadResult> {
  const attemptedAt = input.now ?? new Date();
  const config = input.config ?? getAccountOpeningDriveArchiveConfig();
  const pack = buildAccountOpeningCompletedFormFilingPack({
    item: input.item,
    preview: input.preview,
    content: input.content,
    fileHash: input.fileHash,
    config,
    now: attemptedAt,
  });
  const skippedReason = getDriveArchiveSkippedReason(config);

  if (skippedReason) {
    return {
      status: 'SKIPPED_DISABLED',
      note: `Microsoft Drive completed unsigned form filing skipped: ${skippedReason}`,
      storageProvider: config.provider,
      folderUrl: null,
      fileUrl: null,
      driveItemId: null,
      fileName: pack.file.fileName,
      fileHash: input.fileHash,
      fileSizeBytes: input.content.byteLength,
      skippedReason,
      attemptedAt,
      metadata: pack.metadata,
    };
  }

  try {
    const result = await (
      input.uploader ?? createGraphCompletedFormFilingUploader(config)
    ).uploadCompletedForm(pack);

    return {
      status: 'UPLOADED',
      note: `${microsoftDriveLabel(config)} completed unsigned form filed for internal SharePoint filing only: ${pack.file.fileName}.`,
      storageProvider: config.provider,
      folderUrl: result.folderUrl,
      fileUrl: result.fileUrl,
      driveItemId: result.driveItemId,
      fileName: pack.file.fileName,
      fileHash: input.fileHash,
      fileSizeBytes: input.content.byteLength,
      skippedReason: null,
      attemptedAt,
      metadata: pack.metadata,
    };
  } catch (error) {
    return {
      status: 'UPLOAD_FAILED',
      note:
        error instanceof Error
          ? error.message
          : 'Microsoft Drive completed unsigned form filing failed.',
      storageProvider: config.provider,
      folderUrl: null,
      fileUrl: null,
      driveItemId: null,
      fileName: pack.file.fileName,
      fileHash: input.fileHash,
      fileSizeBytes: input.content.byteLength,
      skippedReason: null,
      attemptedAt,
      metadata: pack.metadata,
    };
  }
}
