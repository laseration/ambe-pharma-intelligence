import { env } from '../config/env';

export type LocalSmokeDatabaseClassification =
  | 'missing'
  | 'invalid'
  | 'local'
  | 'docker-local'
  | 'managed-neon'
  | 'managed-supabase'
  | 'managed-aws-rds'
  | 'managed-azure-postgres'
  | 'external';

export type LocalSmokeDatabaseSafety = {
  safe: boolean;
  classification: LocalSmokeDatabaseClassification;
  reason: string;
  host: string | null;
  databaseName: string | null;
};

export type LocalSmokeIntegrationSafety = {
  safe: boolean;
  unsafeReasons: string[];
  checks: Array<{
    name: string;
    safe: boolean;
    status: 'disabled' | 'dry-run' | 'present-disabled' | 'unsafe';
    reason: string;
  }>;
};

type LocalSmokeIntegrationConfig = Pick<
  typeof env,
  | 'openAiApiKey'
  | 'openAiParserEnabled'
  | 'openAiEmailReviewEnabled'
  | 'telegramBotToken'
  | 'telegramInternalChatId'
  | 'telegramDryRun'
  | 'telegramPollingEnabled'
  | 'emailAlertsEnabled'
  | 'emailInboundPollingEnabled'
  | 'microsoftMailTenantId'
  | 'microsoftMailClientId'
  | 'microsoftMailClientSecret'
  | 'microsoftGraphRefreshToken'
  | 'microsoftGraphSenderMailbox'
  | 'microsoftStorageTenantId'
  | 'microsoftStorageClientId'
  | 'microsoftStorageClientSecret'
  | 'sharePointAccountOpeningEnabled'
  | 'oneDriveAccountOpeningEnabled'
>;

const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SAFE_DOCKER_LOCAL_HOSTS = new Set(['postgres']);
const SAFE_DATABASE_NAME_PATTERN = /(test|dev|local|demo|smoke|ci)/i;

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function parseDatabaseName(url: URL): string | null {
  const firstPathSegment = url.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)[0];

  return firstPathSegment ? decodeURIComponent(firstPathSegment) : null;
}

function hasDisposableDatabaseName(databaseName: string | null): boolean {
  return Boolean(databaseName && SAFE_DATABASE_NAME_PATTERN.test(databaseName));
}

export function classifyDatabaseUrlForLocalSmoke(
  databaseUrl: string,
): LocalSmokeDatabaseSafety {
  const trimmed = databaseUrl.trim();

  if (!trimmed) {
    return {
      safe: false,
      classification: 'missing',
      reason: 'DATABASE_URL is missing.',
      host: null,
      databaseName: null,
    };
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      safe: false,
      classification: 'invalid',
      reason: 'DATABASE_URL is not a valid URL.',
      host: null,
      databaseName: null,
    };
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return {
      safe: false,
      classification: 'invalid',
      reason: 'DATABASE_URL must use postgresql:// or postgres://.',
      host: null,
      databaseName: null,
    };
  }

  const host = normalizeHost(parsed.hostname);
  const databaseName = parseDatabaseName(parsed);

  if (!hasDisposableDatabaseName(databaseName)) {
    return {
      safe: false,
      classification: SAFE_DOCKER_LOCAL_HOSTS.has(host)
        ? 'docker-local'
        : SAFE_LOCAL_HOSTS.has(host)
          ? 'local'
          : classifyExternalHost(host),
      reason:
        'Database name must clearly contain local, dev, test, demo, smoke, or ci for local runtime smoke.',
      host,
      databaseName,
    };
  }

  if (SAFE_LOCAL_HOSTS.has(host)) {
    return {
      safe: true,
      classification: 'local',
      reason:
        'DATABASE_URL points at a loopback host and disposable database name.',
      host,
      databaseName,
    };
  }

  if (SAFE_DOCKER_LOCAL_HOSTS.has(host)) {
    return {
      safe: true,
      classification: 'docker-local',
      reason:
        'DATABASE_URL points at the docker-compose Postgres service and disposable database name.',
      host,
      databaseName,
    };
  }

  return {
    safe: false,
    classification: classifyExternalHost(host),
    reason: 'DATABASE_URL host is not an allowed local smoke host.',
    host,
    databaseName,
  };
}

function classifyExternalHost(host: string): LocalSmokeDatabaseClassification {
  if (host.endsWith('.neon.tech')) {
    return 'managed-neon';
  }

  if (host.endsWith('.supabase.co')) {
    return 'managed-supabase';
  }

  if (host.endsWith('.rds.amazonaws.com')) {
    return 'managed-aws-rds';
  }

  if (host.endsWith('.database.azure.com')) {
    return 'managed-azure-postgres';
  }

  return 'external';
}

function hasAnyValue(...values: string[]): boolean {
  return values.some((value) => Boolean(value.trim()));
}

function addIntegrationCheck(
  checks: LocalSmokeIntegrationSafety['checks'],
  name: string,
  unsafe: boolean,
  safeStatus: LocalSmokeIntegrationSafety['checks'][number]['status'],
  safeReason: string,
  unsafeReason: string,
): void {
  checks.push({
    name,
    safe: !unsafe,
    status: unsafe ? 'unsafe' : safeStatus,
    reason: unsafe ? unsafeReason : safeReason,
  });
}

export function evaluateExternalIntegrationsForLocalSmoke(
  config: LocalSmokeIntegrationConfig = env,
): LocalSmokeIntegrationSafety {
  const checks: LocalSmokeIntegrationSafety['checks'] = [];
  const graphMailConfigured = hasAnyValue(
    config.microsoftMailTenantId,
    config.microsoftMailClientId,
    config.microsoftMailClientSecret,
    config.microsoftGraphRefreshToken,
    config.microsoftGraphSenderMailbox,
  );
  const graphStorageConfigured = hasAnyValue(
    config.microsoftStorageTenantId,
    config.microsoftStorageClientId,
    config.microsoftStorageClientSecret,
  );

  addIntegrationCheck(
    checks,
    'OpenAI parsing/review',
    config.openAiParserEnabled || config.openAiEmailReviewEnabled,
    config.openAiApiKey ? 'present-disabled' : 'disabled',
    config.openAiApiKey
      ? 'OpenAI key is present but parser/review flags are disabled.'
      : 'OpenAI parser/review flags are disabled.',
    'OpenAI parser or email review is enabled; local runtime smoke must not call OpenAI.',
  );

  addIntegrationCheck(
    checks,
    'Telegram polling',
    config.telegramPollingEnabled,
    config.telegramBotToken || config.telegramInternalChatId
      ? 'present-disabled'
      : 'disabled',
    config.telegramBotToken || config.telegramInternalChatId
      ? 'Telegram credentials are present but polling is disabled.'
      : 'Telegram polling is disabled.',
    'Telegram polling is enabled; local runtime smoke must not poll Telegram.',
  );

  addIntegrationCheck(
    checks,
    'Telegram outbound',
    !config.telegramDryRun &&
      Boolean(config.telegramBotToken && config.telegramInternalChatId),
    config.telegramDryRun ? 'dry-run' : 'disabled',
    config.telegramDryRun
      ? 'Telegram dry-run is enabled.'
      : 'Telegram live credentials are incomplete.',
    'Telegram dry-run is false while bot token and chat are configured.',
  );

  addIntegrationCheck(
    checks,
    'Email outbound',
    config.emailAlertsEnabled,
    graphMailConfigured ? 'present-disabled' : 'disabled',
    graphMailConfigured
      ? 'Microsoft mail credentials are present but outbound email is disabled.'
      : 'Outbound email is disabled.',
    'EMAIL_ALERTS_ENABLED is true; local runtime smoke must not send email.',
  );

  addIntegrationCheck(
    checks,
    'Email inbound polling',
    config.emailInboundPollingEnabled,
    graphMailConfigured ? 'present-disabled' : 'disabled',
    graphMailConfigured
      ? 'Microsoft mail credentials are present but inbox polling is disabled.'
      : 'Inbox polling is disabled.',
    'EMAIL_INBOUND_POLLING_ENABLED is true; local runtime smoke must not poll Microsoft Graph mail.',
  );

  addIntegrationCheck(
    checks,
    'Microsoft Drive filing',
    config.sharePointAccountOpeningEnabled ||
      config.oneDriveAccountOpeningEnabled,
    graphStorageConfigured ? 'present-disabled' : 'disabled',
    graphStorageConfigured
      ? 'Microsoft storage credentials are present but filing is disabled.'
      : 'Microsoft Drive filing is disabled.',
    'SharePoint or OneDrive account-opening filing is enabled; local runtime smoke must not upload files.',
  );

  return {
    safe: checks.every((check) => check.safe),
    unsafeReasons: checks
      .filter((check) => !check.safe)
      .map((check) => check.reason),
    checks,
  };
}

export function forceDisableExternalIntegrationsForLocalSmoke(
  targetEnv: typeof env = env,
): void {
  targetEnv.openAiParserEnabled = false;
  targetEnv.openAiEmailReviewEnabled = false;
  targetEnv.telegramPollingEnabled = false;
  targetEnv.telegramDryRun = true;
  targetEnv.emailAlertsEnabled = false;
  targetEnv.emailInboundPollingEnabled = false;
  targetEnv.sharePointAccountOpeningEnabled = false;
  targetEnv.oneDriveAccountOpeningEnabled = false;
}
