import { env } from '../config/env';
import type { MicrosoftGraphCredentialSource } from '../config/env';

export type SharePointAccessCheckConfig = {
  accountOpeningEnabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  credentialSource: MicrosoftGraphCredentialSource;
  siteId: string;
  driveId: string;
  accountOpeningFolder: string;
};

type GraphErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type TokenErrorPayload = {
  error?: string;
  error_description?: string;
};

type DriveListPayload = {
  value?: Array<{
    id?: string;
    name?: string;
    webUrl?: string;
  }>;
};

type DriveItemPayload = {
  id?: string;
  name?: string;
  webUrl?: string;
  folder?: unknown;
};

type GraphRequestResult<T> = {
  status: number;
  ok: boolean;
  payload: T | null;
  text: string;
};

type DiagnosticFetch = typeof fetch;

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const HEALTH_CHECK_FILE_NAME = 'sharepoint-health-check.txt';
const HEALTH_CHECK_FILE_CONTENT = 'AMBE bot SharePoint health check. Safe to delete.';
const HEALTH_CHECK_FOLDER_SUFFIX = 'Ambe Bot/Health Checks';
const REDACTED = '[redacted]';

class DiagnosticError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function credentialSourceLabel(source: MicrosoftGraphCredentialSource): string {
  if (source === 'storage-specific') {
    return 'storage-specific credentials';
  }

  if (source === 'generic-fallback') {
    return 'generic fallback';
  }

  return source;
}

export function redactSensitiveLogText(value: string, secrets: string[] = []): string {
  let redacted = value;

  for (const secret of secrets.map((item) => item.trim()).filter(Boolean)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
  }

  return redacted
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/("access_token"\s*:\s*")[^"]+(")/gi, `$1${REDACTED}$2`)
    .replace(/(access_token=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/(client_secret=)[^&\s]+/gi, `$1${REDACTED}`);
}

export function validateSharePointAccessCheckConfig(
  config: SharePointAccessCheckConfig,
): string[] {
  const missing: string[] = [];

  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    missing.push(
      'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.',
    );
  }

  if (!config.siteId) {
    missing.push('SHAREPOINT_SITE_ID');
  }

  if (!config.driveId) {
    missing.push('SHAREPOINT_DRIVE_ID');
  }

  if (!config.accountOpeningFolder) {
    missing.push('SHAREPOINT_ACCOUNT_OPENING_FOLDER');
  }

  return missing;
}

export type SharePointAccessCheckEnv = Pick<
  typeof env,
  | 'sharePointAccountOpeningEnabled'
  | 'microsoftStorageTenantId'
  | 'microsoftStorageClientId'
  | 'microsoftStorageClientSecret'
  | 'microsoftStorageCredentialSource'
  | 'sharePointSiteId'
  | 'sharePointDriveId'
  | 'sharePointAccountOpeningFolder'
>;

export function buildSharePointAccessCheckConfig(
  configEnv: SharePointAccessCheckEnv = env,
): SharePointAccessCheckConfig {
  return {
    accountOpeningEnabled: configEnv.sharePointAccountOpeningEnabled,
    tenantId: configEnv.microsoftStorageTenantId,
    clientId: configEnv.microsoftStorageClientId,
    clientSecret: configEnv.microsoftStorageClientSecret,
    credentialSource: configEnv.microsoftStorageCredentialSource,
    siteId: configEnv.sharePointSiteId,
    driveId: configEnv.sharePointDriveId,
    accountOpeningFolder: configEnv.sharePointAccountOpeningFolder,
  };
}

function readConfig(): SharePointAccessCheckConfig {
  return buildSharePointAccessCheckConfig();
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

function joinDrivePath(...parts: string[]): string {
  return parts
    .flatMap(splitFolderPath)
    .join('/');
}

function parseJson<T>(text: string): T | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function requestGraphToken(
  config: SharePointAccessCheckConfig,
  fetchImpl: DiagnosticFetch,
): Promise<string> {
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
    },
  );
  const text = await response.text();
  const payload = parseJson<TokenErrorPayload & { access_token?: string }>(text);

  if (!response.ok) {
    const code = payload?.error || `http_${response.status}`;
    const description = payload?.error_description || 'Microsoft Graph token request failed.';

    throw new DiagnosticError(description, code, response.status);
  }

  if (!payload?.access_token) {
    throw new DiagnosticError('Microsoft Graph token response did not include an access token.');
  }

  return payload.access_token;
}

async function graphRequest<T>(
  accessToken: string,
  path: string,
  fetchImpl: DiagnosticFetch,
  init?: RequestInit,
): Promise<GraphRequestResult<T>> {
  const response = await fetchImpl(`${GRAPH_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    payload: parseJson<T>(text),
    text,
  };
}

function graphFailureMessage(result: GraphRequestResult<unknown>, fallback: string): string {
  const graphError = parseJson<GraphErrorPayload>(result.text);
  const code = graphError?.error?.code;
  const message = graphError?.error?.message;

  return [code, message || fallback].filter(Boolean).join(' - ');
}

async function getFolder(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fetchImpl: DiagnosticFetch,
): Promise<GraphRequestResult<DriveItemPayload>> {
  return graphRequest<DriveItemPayload>(
    accessToken,
    `/drives/${encodeURIComponent(driveId)}/root:/${encodeDrivePath(folderPath)}`,
    fetchImpl,
  );
}

async function ensureFolderPath(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fetchImpl: DiagnosticFetch,
): Promise<DriveItemPayload | null> {
  let currentPath = '';
  let latestFolder: DriveItemPayload | null = null;

  for (const segment of splitFolderPath(folderPath)) {
    const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
    const getResult = await getFolder(accessToken, driveId, nextPath, fetchImpl);

    if (getResult.ok) {
      latestFolder = getResult.payload;
      currentPath = nextPath;
      continue;
    }

    if (getResult.status !== 404) {
      throw new DiagnosticError(
        graphFailureMessage(getResult, `Folder lookup failed with status ${getResult.status}.`),
        undefined,
        getResult.status,
      );
    }

    const parentChildrenPath = currentPath
      ? `/drives/${encodeURIComponent(driveId)}/root:/${encodeDrivePath(currentPath)}:/children`
      : `/drives/${encodeURIComponent(driveId)}/root/children`;
    const createResult = await graphRequest<DriveItemPayload>(
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
      throw new DiagnosticError(
        graphFailureMessage(createResult, `Folder creation failed with status ${createResult.status}.`),
        undefined,
        createResult.status,
      );
    }

    latestFolder = createResult.payload;
    currentPath = nextPath;
  }

  return latestFolder;
}

async function uploadHealthCheckFile(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fetchImpl: DiagnosticFetch,
): Promise<DriveItemPayload> {
  const uploadPath = joinDrivePath(folderPath, HEALTH_CHECK_FILE_NAME);
  const uploadResult = await graphRequest<DriveItemPayload>(
    accessToken,
    `/drives/${encodeURIComponent(driveId)}/root:/${encodeDrivePath(uploadPath)}:/content`,
    fetchImpl,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: HEALTH_CHECK_FILE_CONTENT,
    },
  );

  if (!uploadResult.ok || !uploadResult.payload?.id) {
    throw new DiagnosticError(
      graphFailureMessage(uploadResult, `Test upload failed with status ${uploadResult.status}.`),
      undefined,
      uploadResult.status,
    );
  }

  return uploadResult.payload;
}

async function deleteDriveItem(
  accessToken: string,
  driveId: string,
  itemId: string,
  fetchImpl: DiagnosticFetch,
): Promise<GraphRequestResult<unknown>> {
  return graphRequest<unknown>(
    accessToken,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
    fetchImpl,
    { method: 'DELETE' },
  );
}

function printRedactedConfigSummary(config: SharePointAccessCheckConfig): void {
  console.log('SharePoint account-opening diagnostic');
  console.log(`SHAREPOINT_ACCOUNT_OPENING_ENABLED: ${config.accountOpeningEnabled}`);
  console.log(`Storage tenant ID present: ${config.tenantId ? 'yes' : 'no'}`);
  console.log(`Storage client ID present: ${config.clientId ? 'yes' : 'no'}`);
  console.log(`Storage client secret present: ${config.clientSecret ? 'yes' : 'no'}`);
  console.log(`Credential source: ${credentialSourceLabel(config.credentialSource)}`);
  console.log(`Site ID present: ${config.siteId ? 'yes' : 'no'}`);
  console.log(`Drive ID present: ${config.driveId ? 'yes' : 'no'}`);
  console.log(`Target folder path: ${config.accountOpeningFolder || '(missing)'}`);
  console.log('');
}

function printFailure(error: unknown, config: SharePointAccessCheckConfig): void {
  const message = error instanceof Error ? error.message : 'SharePoint diagnostic failed.';
  const code = error instanceof DiagnosticError ? error.code : undefined;
  const status = error instanceof DiagnosticError ? error.status : undefined;
  const statusText = status ? ` status ${status}` : '';
  const codeText = code ? `${code}${statusText} - ` : '';
  const safeMessage = redactSensitiveLogText(message, [config.clientSecret]);

  console.error(`FAIL: ${codeText}${safeMessage}`);
}

function printTokenFailureHint(error: unknown): void {
  const code = error instanceof DiagnosticError ? error.code : undefined;

  if (code === 'invalid_client') {
    console.error('Hint: invalid_client usually means the client ID or client secret is wrong.');
    return;
  }

  if (code === 'invalid_tenant') {
    console.error('Hint: invalid_tenant usually means the tenant ID is wrong.');
    return;
  }

  if (code === 'unauthorized_client') {
    console.error(
      'Hint: unauthorized_client usually means storage app permissions or admin consent are missing. The storage app needs Sites.ReadWrite.All and Files.ReadWrite.All application permissions.',
    );
  }
}

async function runSharePointAccessCheck(writeTest: boolean): Promise<void> {
  const config = readConfig();
  const fetchImpl = fetch;

  printRedactedConfigSummary(config);

  const missing = validateSharePointAccessCheckConfig(config);

  if (missing.length > 0) {
    throw new DiagnosticError(`Missing required env vars: ${missing.join(', ')}`);
  }

  let accessToken: string;

  try {
    accessToken = await requestGraphToken(config, fetchImpl);
    console.log('PASS: Graph token acquired');
  } catch (error) {
    printTokenFailureHint(error);
    throw error;
  }

  const siteResult = await graphRequest<unknown>(
    accessToken,
    `/sites/${encodeURIComponent(config.siteId)}`,
    fetchImpl,
  );

  if (!siteResult.ok) {
    throw new DiagnosticError(
      graphFailureMessage(siteResult, `SharePoint site lookup failed with status ${siteResult.status}.`),
      undefined,
      siteResult.status,
    );
  }

  console.log('PASS: SharePoint site found');

  const drivesResult = await graphRequest<DriveListPayload>(
    accessToken,
    `/sites/${encodeURIComponent(config.siteId)}/drives`,
    fetchImpl,
  );

  if (!drivesResult.ok) {
    throw new DiagnosticError(
      graphFailureMessage(drivesResult, `SharePoint drive list failed with status ${drivesResult.status}.`),
      undefined,
      drivesResult.status,
    );
  }

  const matchingDrive = drivesResult.payload?.value?.find((drive) => drive.id === config.driveId);

  if (!matchingDrive) {
    throw new DiagnosticError(
      `Configured SHAREPOINT_DRIVE_ID was not found in the site's drives. This is likely a drive ID or site ID issue.`,
      'itemNotFound',
    );
  }

  console.log(`PASS: Drive found${matchingDrive.name ? ` (${matchingDrive.name})` : ''}`);

  const folderResult = await getFolder(
    accessToken,
    config.driveId,
    config.accountOpeningFolder,
    fetchImpl,
  );

  if (folderResult.ok) {
    console.log('PASS: Folder found');
  } else if (folderResult.status === 404) {
    if (!writeTest) {
      throw new DiagnosticError(
        'Configured account-opening folder was not found. Folder creation permission was not tested because this run is read-only. Re-run with --write-test to create only the configured folder path and the health-check folder/file.',
        'itemNotFound',
        folderResult.status,
      );
    }

    console.log(
      'INFO: Configured folder was not found; --write-test will attempt to create it and the health-check folder/file.',
    );
  } else {
    throw new DiagnosticError(
      graphFailureMessage(folderResult, `Folder lookup failed with status ${folderResult.status}.`),
      undefined,
      folderResult.status,
    );
  }

  if (!writeTest) {
    console.log('SKIP: Write test disabled by default. Pass --write-test to upload the harmless health-check file.');
    return;
  }

  if (!config.accountOpeningEnabled) {
    console.log(
      'INFO: SHAREPOINT_ACCOUNT_OPENING_ENABLED is false; continuing because --write-test was explicitly passed.',
    );
  }

  const healthCheckFolder = joinDrivePath(
    config.accountOpeningFolder,
    HEALTH_CHECK_FOLDER_SUFFIX,
  );
  const folder = await ensureFolderPath(accessToken, config.driveId, healthCheckFolder, fetchImpl);
  console.log(`PASS: Health-check folder available at ${folder?.webUrl || healthCheckFolder}`);

  const uploadedFile = await uploadHealthCheckFile(
    accessToken,
    config.driveId,
    healthCheckFolder,
    fetchImpl,
  );
  console.log(`PASS: Test upload succeeded${uploadedFile.webUrl ? ` (${uploadedFile.webUrl})` : ''}`);

  const deleteResult = await deleteDriveItem(accessToken, config.driveId, uploadedFile.id!, fetchImpl);

  if (deleteResult.ok || deleteResult.status === 204) {
    console.log('PASS: Test file deleted after upload');
    return;
  }

  console.log(
    `WARN: Test file could not be deleted; it remains in ${healthCheckFolder} and is safe to delete manually.`,
  );
}

if (require.main === module) {
  const writeTest = process.argv.includes('--write-test');
  const config = readConfig();

  runSharePointAccessCheck(writeTest).catch((error) => {
    printFailure(error, config);
    process.exit(1);
  });
}
