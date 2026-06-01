import { env } from '../config/env';
import type { MicrosoftGraphCredentialSource } from '../config/env';

export type MicrosoftDriveAccessCheckConfig = {
  provider: 'SHAREPOINT' | 'ONEDRIVE';
  accountOpeningEnabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  credentialSource: MicrosoftGraphCredentialSource;
  sharePointSiteId: string;
  sharePointDriveId: string;
  oneDriveUserId: string;
  oneDriveDriveId: string;
  rootFolder: string;
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

type DrivePayload = {
  id?: string;
  name?: string;
  webUrl?: string;
};

type DriveListPayload = {
  value?: DrivePayload[];
};

type DriveItemPayload = {
  id?: string;
  name?: string;
  webUrl?: string;
};

type GraphRequestResult<T> = {
  status: number;
  ok: boolean;
  payload: T | null;
  text: string;
};

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const HEALTH_CHECK_FILE_NAME = 'microsoft-drive-health-check.txt';
const HEALTH_CHECK_FILE_CONTENT =
  'AMBE bot Microsoft Drive health check. Safe to delete.';
const HEALTH_CHECK_FOLDER_NAME = 'Health Checks';
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

export function redactSensitiveLogText(
  value: string,
  secrets: string[] = [],
): string {
  let redacted = value;

  for (const secret of secrets.map((item) => item.trim()).filter(Boolean)) {
    redacted = redacted.replace(
      new RegExp(escapeRegExp(secret), 'g'),
      REDACTED,
    );
  }

  return redacted
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/("access_token"\s*:\s*")[^"]+(")/gi, `$1${REDACTED}$2`)
    .replace(/(access_token=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/(client_secret=)[^&\s]+/gi, `$1${REDACTED}`);
}

export function validateMicrosoftDriveAccessCheckConfig(
  config: MicrosoftDriveAccessCheckConfig,
): string[] {
  const missing: string[] = [];

  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    missing.push(
      'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.',
    );
  }

  if (config.provider === 'SHAREPOINT') {
    if (!config.sharePointSiteId) {
      missing.push('SHAREPOINT_SITE_ID');
    }

    if (!config.sharePointDriveId) {
      missing.push('SHAREPOINT_DRIVE_ID');
    }
  } else if (!config.oneDriveDriveId && !config.oneDriveUserId) {
    missing.push('ONEDRIVE_DRIVE_ID or ONEDRIVE_USER_ID');
  }

  if (!config.accountOpeningFolder) {
    missing.push(
      config.provider === 'ONEDRIVE'
        ? 'ONEDRIVE_ACCOUNT_OPENING_FOLDER'
        : 'SHAREPOINT_ACCOUNT_OPENING_FOLDER',
    );
  }

  return missing;
}

export function getDiagnosticFolderChecks(
  config: MicrosoftDriveAccessCheckConfig,
): Array<{
  label: string;
  path: string;
}> {
  return [
    { label: 'root folder', path: config.rootFolder },
    { label: 'Account Opening folder', path: config.accountOpeningFolder },
  ].filter((item) => item.path.trim().length > 0);
}

export function getHealthCheckFolderPath(
  config: Pick<MicrosoftDriveAccessCheckConfig, 'rootFolder'>,
): string {
  return joinDrivePath(config.rootFolder, HEALTH_CHECK_FOLDER_NAME);
}

export type MicrosoftDriveAccessCheckEnv = Pick<
  typeof env,
  | 'accountOpeningStorageProvider'
  | 'oneDriveAccountOpeningEnabled'
  | 'sharePointAccountOpeningEnabled'
  | 'microsoftStorageTenantId'
  | 'microsoftStorageClientId'
  | 'microsoftStorageClientSecret'
  | 'microsoftStorageCredentialSource'
  | 'sharePointSiteId'
  | 'sharePointDriveId'
  | 'oneDriveUserId'
  | 'oneDriveDriveId'
  | 'microsoftDriveRootFolder'
  | 'oneDriveAccountOpeningFolder'
  | 'sharePointAccountOpeningFolder'
>;

export function buildMicrosoftDriveAccessCheckConfig(
  configEnv: MicrosoftDriveAccessCheckEnv = env,
): MicrosoftDriveAccessCheckConfig {
  const provider = configEnv.accountOpeningStorageProvider;

  return {
    provider,
    accountOpeningEnabled:
      provider === 'ONEDRIVE'
        ? configEnv.oneDriveAccountOpeningEnabled
        : configEnv.sharePointAccountOpeningEnabled,
    tenantId: configEnv.microsoftStorageTenantId,
    clientId: configEnv.microsoftStorageClientId,
    clientSecret: configEnv.microsoftStorageClientSecret,
    credentialSource: configEnv.microsoftStorageCredentialSource,
    sharePointSiteId: configEnv.sharePointSiteId,
    sharePointDriveId: configEnv.sharePointDriveId,
    oneDriveUserId: configEnv.oneDriveUserId,
    oneDriveDriveId: configEnv.oneDriveDriveId,
    rootFolder: configEnv.microsoftDriveRootFolder,
    accountOpeningFolder:
      provider === 'ONEDRIVE'
        ? configEnv.oneDriveAccountOpeningFolder
        : configEnv.sharePointAccountOpeningFolder,
  };
}

function readConfig(): MicrosoftDriveAccessCheckConfig {
  return buildMicrosoftDriveAccessCheckConfig();
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
  return parts.flatMap(splitFolderPath).join('/');
}

async function requestGraphToken(
  config: MicrosoftDriveAccessCheckConfig,
  fetchImpl: typeof fetch,
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
  const payload = parseJson<TokenErrorPayload & { access_token?: string }>(
    text,
  );

  if (!response.ok) {
    throw new DiagnosticError(
      payload?.error_description || 'Microsoft Graph token request failed.',
      payload?.error || `http_${response.status}`,
      response.status,
    );
  }

  if (!payload?.access_token) {
    throw new DiagnosticError(
      'Microsoft Graph token response did not include an access token.',
    );
  }

  return payload.access_token;
}

async function graphRequest<T>(
  accessToken: string,
  path: string,
  fetchImpl: typeof fetch,
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

function graphFailureMessage(
  result: GraphRequestResult<unknown>,
  fallback: string,
): string {
  const graphError = parseJson<GraphErrorPayload>(result.text);
  const code = graphError?.error?.code;
  const message = graphError?.error?.message;

  return [code, message || fallback].filter(Boolean).join(' - ');
}

async function resolveConfiguredDrive(
  accessToken: string,
  config: MicrosoftDriveAccessCheckConfig,
  fetchImpl: typeof fetch,
): Promise<DrivePayload> {
  if (config.provider === 'SHAREPOINT') {
    const siteResult = await graphRequest<unknown>(
      accessToken,
      `/sites/${encodeURIComponent(config.sharePointSiteId)}`,
      fetchImpl,
    );

    if (!siteResult.ok) {
      throw new DiagnosticError(
        graphFailureMessage(
          siteResult,
          `SharePoint site lookup failed with status ${siteResult.status}.`,
        ),
        undefined,
        siteResult.status,
      );
    }

    console.log('PASS: SharePoint site found');

    const drivesResult = await graphRequest<DriveListPayload>(
      accessToken,
      `/sites/${encodeURIComponent(config.sharePointSiteId)}/drives`,
      fetchImpl,
    );

    if (!drivesResult.ok) {
      throw new DiagnosticError(
        graphFailureMessage(
          drivesResult,
          `SharePoint drive list failed with status ${drivesResult.status}.`,
        ),
        undefined,
        drivesResult.status,
      );
    }

    const matchingDrive = drivesResult.payload?.value?.find(
      (drive) => drive.id === config.sharePointDriveId,
    );

    if (!matchingDrive?.id) {
      throw new DiagnosticError(
        'Configured SHAREPOINT_DRIVE_ID was not found in the site drives.',
        'itemNotFound',
      );
    }

    console.log(
      `PASS: SharePoint drive found${matchingDrive.name ? ` (${matchingDrive.name})` : ''}`,
    );
    return matchingDrive;
  }

  if (config.oneDriveDriveId) {
    console.log('PASS: OneDrive drive resolved from ONEDRIVE_DRIVE_ID');
    return { id: config.oneDriveDriveId };
  }

  const driveResult = await graphRequest<DrivePayload>(
    accessToken,
    `/users/${encodeURIComponent(config.oneDriveUserId)}/drive`,
    fetchImpl,
  );

  if (!driveResult.ok || !driveResult.payload?.id) {
    throw new DiagnosticError(
      graphFailureMessage(
        driveResult,
        `OneDrive drive resolution failed with status ${driveResult.status}.`,
      ),
      undefined,
      driveResult.status,
    );
  }

  console.log(
    `PASS: OneDrive drive resolved${driveResult.payload.name ? ` (${driveResult.payload.name})` : ''}`,
  );
  return driveResult.payload;
}

async function getFolder(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fetchImpl: typeof fetch,
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
  fetchImpl: typeof fetch,
): Promise<DriveItemPayload | null> {
  let currentPath = '';
  let latestFolder: DriveItemPayload | null = null;

  for (const segment of splitFolderPath(folderPath)) {
    const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
    const getResult = await getFolder(
      accessToken,
      driveId,
      nextPath,
      fetchImpl,
    );

    if (getResult.ok) {
      latestFolder = getResult.payload;
      currentPath = nextPath;
      continue;
    }

    if (getResult.status !== 404) {
      throw new DiagnosticError(
        graphFailureMessage(
          getResult,
          `Folder lookup failed with status ${getResult.status}.`,
        ),
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
        graphFailureMessage(
          createResult,
          `Folder creation failed with status ${createResult.status}.`,
        ),
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
  fetchImpl: typeof fetch,
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
      graphFailureMessage(
        uploadResult,
        `Test upload failed with status ${uploadResult.status}.`,
      ),
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
  fetchImpl: typeof fetch,
): Promise<GraphRequestResult<unknown>> {
  return graphRequest<unknown>(
    accessToken,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
    fetchImpl,
    { method: 'DELETE' },
  );
}

function printRedactedConfigSummary(
  config: MicrosoftDriveAccessCheckConfig,
): void {
  console.log('Microsoft Drive account-opening diagnostic');
  console.log(`Selected provider: ${config.provider}`);
  console.log(
    `Account-opening storage enabled: ${config.accountOpeningEnabled}`,
  );
  console.log(`Storage tenant ID present: ${config.tenantId ? 'yes' : 'no'}`);
  console.log(`Storage client ID present: ${config.clientId ? 'yes' : 'no'}`);
  console.log(
    `Storage client secret present: ${config.clientSecret ? 'yes' : 'no'}`,
  );
  console.log(
    `Credential source: ${credentialSourceLabel(config.credentialSource)}`,
  );
  console.log(
    `SharePoint site ID present: ${config.sharePointSiteId ? 'yes' : 'no'}`,
  );
  console.log(
    `SharePoint drive ID present: ${config.sharePointDriveId ? 'yes' : 'no'}`,
  );
  console.log(
    `OneDrive user ID present: ${config.oneDriveUserId ? 'yes' : 'no'}`,
  );
  console.log(
    `OneDrive drive ID present: ${config.oneDriveDriveId ? 'yes' : 'no'}`,
  );
  console.log(
    `Microsoft Drive root folder: ${config.rootFolder || '(missing)'}`,
  );
  console.log(
    `Target folder path: ${config.accountOpeningFolder || '(missing)'}`,
  );
  console.log('');
}

function printFailure(
  error: unknown,
  config: MicrosoftDriveAccessCheckConfig,
): void {
  const message =
    error instanceof Error
      ? error.message
      : 'Microsoft Drive diagnostic failed.';
  const code = error instanceof DiagnosticError ? error.code : undefined;
  const status = error instanceof DiagnosticError ? error.status : undefined;
  const statusText = status ? ` status ${status}` : '';
  const codeText = code ? `${code}${statusText} - ` : '';

  console.error(
    `FAIL: ${codeText}${redactSensitiveLogText(message, [config.clientSecret])}`,
  );
}

function printTokenFailureHint(error: unknown): void {
  const code = error instanceof DiagnosticError ? error.code : undefined;

  if (code === 'invalid_client') {
    console.error(
      'Hint: invalid_client usually means the client ID or client secret is wrong.',
    );
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

export function isWriteTestEnabled(args: string[]): boolean {
  return args.includes('--write-test');
}

async function runMicrosoftDriveAccessCheck(writeTest: boolean): Promise<void> {
  const config = readConfig();
  const fetchImpl = fetch;

  printRedactedConfigSummary(config);

  const missing = validateMicrosoftDriveAccessCheckConfig(config);

  if (missing.length > 0) {
    throw new DiagnosticError(
      `Missing required env vars: ${missing.join(', ')}`,
    );
  }

  let accessToken: string;

  try {
    accessToken = await requestGraphToken(config, fetchImpl);
    console.log('PASS: Graph token acquired');
  } catch (error) {
    printTokenFailureHint(error);
    throw error;
  }

  const drive = await resolveConfiguredDrive(accessToken, config, fetchImpl);

  if (!drive.id) {
    throw new DiagnosticError(
      'Microsoft Drive resolution did not return a drive ID.',
    );
  }

  for (const folderCheck of getDiagnosticFolderChecks(config)) {
    const folderResult = await getFolder(
      accessToken,
      drive.id,
      folderCheck.path,
      fetchImpl,
    );

    if (folderResult.ok) {
      console.log(`PASS: ${folderCheck.label} found (${folderCheck.path})`);
      continue;
    }

    if (folderResult.status === 404 && writeTest) {
      const createdFolder = await ensureFolderPath(
        accessToken,
        drive.id,
        folderCheck.path,
        fetchImpl,
      );
      console.log(
        `PASS: ${folderCheck.label} created or available at ${createdFolder?.webUrl || folderCheck.path}`,
      );
      continue;
    }

    if (folderResult.status === 404) {
      throw new DiagnosticError(
        `Configured ${folderCheck.label} was not found at ${folderCheck.path}. Folder creation permission was not tested because this run is read-only. Re-run with --write-test to create only the configured folder path and health-check folder/file.`,
        'itemNotFound',
        folderResult.status,
      );
    }

    throw new DiagnosticError(
      graphFailureMessage(
        folderResult,
        `Folder lookup failed with status ${folderResult.status}.`,
      ),
      undefined,
      folderResult.status,
    );
  }

  if (!writeTest) {
    console.log(
      'SKIP: Write test disabled by default. Pass --write-test to upload the harmless health-check file.',
    );
    return;
  }

  if (!config.accountOpeningEnabled) {
    console.log(
      'INFO: Account-opening storage is disabled; continuing because --write-test was explicitly passed.',
    );
  }

  const healthCheckFolder = getHealthCheckFolderPath(config);
  const folder = await ensureFolderPath(
    accessToken,
    drive.id,
    healthCheckFolder,
    fetchImpl,
  );
  console.log(
    `PASS: Health-check folder available at ${folder?.webUrl || healthCheckFolder}`,
  );

  const uploadedFile = await uploadHealthCheckFile(
    accessToken,
    drive.id,
    healthCheckFolder,
    fetchImpl,
  );
  console.log(
    `PASS: Test upload succeeded${uploadedFile.webUrl ? ` (${uploadedFile.webUrl})` : ''}`,
  );

  const deleteResult = await deleteDriveItem(
    accessToken,
    drive.id,
    uploadedFile.id!,
    fetchImpl,
  );

  if (deleteResult.ok || deleteResult.status === 204) {
    console.log('PASS: Test file deleted after upload');
    return;
  }

  console.log(
    `WARN: Test file could not be deleted; it remains in ${healthCheckFolder} and is safe to delete manually.`,
  );
}

if (require.main === module) {
  const writeTest = isWriteTestEnabled(process.argv);
  const config = readConfig();

  runMicrosoftDriveAccessCheck(writeTest).catch((error) => {
    printFailure(error, config);
    process.exit(1);
  });
}
