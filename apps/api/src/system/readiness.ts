import { env } from '../config/env';
import { getGraphMailPreflightStatus } from '../email/graphPreflight';
import { isMicrosoftGraphConfigured } from '../email/graph';
import { isEmailInboundPollingActive } from '../email/polling';
import { isInternalAuthEnforced } from '../http/auth';
import { db } from '../lib/db';
import { getPollingWorkerStatus } from '../polling/status';
import { isTelegramPollingActive } from '../telegram/polling';

export type SystemReadinessStatus = 'ready' | 'warning' | 'not_configured';

export type SystemReadinessCheck = {
  key: string;
  title: string;
  status: SystemReadinessStatus;
  meaning: string;
  nextAction: string;
  envVars: string[];
  documentationPath?: string;
  details: Record<string, boolean | number | string | string[] | null>;
};

export type SystemReadinessReport = {
  generatedAt: string;
  status: SystemReadinessStatus;
  checks: SystemReadinessCheck[];
};

type SystemReadinessDependencies = {
  now: () => Date;
  pingDatabase: () => Promise<void>;
};

function hasAny(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => Boolean(value?.trim()));
}

function aggregateStatus(
  checks: SystemReadinessCheck[],
): SystemReadinessStatus {
  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }

  if (checks.some((check) => check.status === 'not_configured')) {
    return 'not_configured';
  }

  return 'ready';
}

async function buildDatabaseCheck(
  dependencies: SystemReadinessDependencies,
): Promise<SystemReadinessCheck> {
  if (!env.databaseUrl) {
    return {
      key: 'database',
      title: 'Database',
      status: 'not_configured',
      meaning: 'No PostgreSQL connection is configured for the API.',
      nextAction: 'Set DATABASE_URL and run the Prisma setup commands.',
      envVars: ['DATABASE_URL'],
      documentationPath: 'README.md#database',
      details: {
        configured: false,
        reachable: false,
        hostDetected: false,
      },
    };
  }

  try {
    await dependencies.pingDatabase();

    return {
      key: 'database',
      title: 'Database',
      status: 'ready',
      meaning: 'The API has a database URL and can complete a read-only ping.',
      nextAction: 'Keep migrations current before pilot use.',
      envVars: ['DATABASE_URL'],
      documentationPath: 'README.md#database',
      details: {
        configured: true,
        reachable: true,
        hostDetected: Boolean(env.databaseHost),
      },
    };
  } catch {
    return {
      key: 'database',
      title: 'Database',
      status: 'warning',
      meaning: 'A database URL is configured, but the read-only ping failed.',
      nextAction:
        'Check the database host, credentials, network, and migrations.',
      envVars: ['DATABASE_URL'],
      documentationPath: 'README.md#database',
      details: {
        configured: true,
        reachable: false,
        hostDetected: Boolean(env.databaseHost),
      },
    };
  }
}

function buildApiAuthCheck(): SystemReadinessCheck {
  const viewerApiKeyConfigured = Boolean(env.internalViewerApiKey);
  const apiKeyConfigured = Boolean(env.internalApiKey);
  const adminApiKeyConfigured = Boolean(env.internalAdminApiKey);
  const configured =
    viewerApiKeyConfigured || apiKeyConfigured || adminApiKeyConfigured;

  return {
    key: 'api-internal-auth',
    title: 'API Internal Auth',
    status: configured ? 'ready' : 'not_configured',
    meaning: configured
      ? 'Internal API-key authentication is configured for protected API routes.'
      : 'Internal API keys are not configured. Local safe-mode bypass may apply only in development-like setups.',
    nextAction: configured
      ? 'Use viewer/operator/admin keys only from trusted server-side callers.'
      : 'Set INTERNAL_API_KEY and optionally INTERNAL_ADMIN_API_KEY before a pilot.',
    envVars: [
      'INTERNAL_VIEWER_API_KEY',
      'INTERNAL_API_KEY',
      'INTERNAL_ADMIN_API_KEY',
    ],
    documentationPath: 'README.md#environment',
    details: {
      viewerApiKeyConfigured,
      apiKeyConfigured,
      adminApiKeyConfigured,
      authEnforcedForCurrentConfig: isInternalAuthEnforced(),
    },
  };
}

function buildMicrosoftMailCheck(): SystemReadinessCheck {
  const configured = isMicrosoftGraphConfigured();
  const partial = hasAny(
    env.microsoftMailTenantId,
    env.microsoftMailClientId,
    env.microsoftMailClientSecret,
    env.microsoftGraphRefreshToken,
    env.microsoftGraphSenderMailbox,
  );

  return {
    key: 'microsoft-mail',
    title: 'Microsoft Mail Credentials',
    status: configured ? 'ready' : partial ? 'warning' : 'not_configured',
    meaning: configured
      ? 'Microsoft Graph mail credentials are present for inbox polling or email sending.'
      : partial
        ? 'Some Microsoft Graph mail settings are present, but the mail configuration is incomplete.'
        : 'Microsoft Graph mail credentials are not configured.',
    nextAction: configured
      ? 'Confirm permissions and mailbox access outside this read-only checklist.'
      : 'Set tenant/client credentials, sender mailbox, and either client secret or refresh token.',
    envVars: [
      'MICROSOFT_MAIL_TENANT_ID',
      'MICROSOFT_MAIL_CLIENT_ID',
      'MICROSOFT_MAIL_CLIENT_SECRET',
      'MICROSOFT_GRAPH_REFRESH_TOKEN',
      'MICROSOFT_GRAPH_SENDER_MAILBOX',
    ],
    documentationPath: 'README.md#email-signal-forwarding',
    details: {
      credentialSource: env.microsoftMailCredentialSource,
      tenantConfigured: Boolean(env.microsoftMailTenantId),
      clientIdConfigured: Boolean(env.microsoftMailClientId),
      clientSecretConfigured: Boolean(env.microsoftMailClientSecret),
      refreshTokenConfigured: Boolean(env.microsoftGraphRefreshToken),
      senderMailboxConfigured: Boolean(env.microsoftGraphSenderMailbox),
    },
  };
}

function buildEmailPollingCheck(): SystemReadinessCheck {
  const graphConfigured = isMicrosoftGraphConfigured();
  const active = isEmailInboundPollingActive();
  const workerStatus = getPollingWorkerStatus('email-inbound');

  let status: SystemReadinessStatus = 'not_configured';
  if (active && env.emailInboundAllowedSenders.length > 0) {
    status = 'ready';
  } else if (env.emailInboundPollingEnabled || graphConfigured) {
    status = 'warning';
  }

  return {
    key: 'email-polling',
    title: 'Email Inbox Polling',
    status,
    meaning:
      status === 'ready'
        ? 'Inbox polling is enabled, mail credentials are present, and allowed senders are configured.'
        : env.emailInboundPollingEnabled
          ? 'Inbox polling is enabled but required mail credentials or sender allowlists are incomplete.'
          : 'Inbox polling is disabled.',
    nextAction:
      status === 'ready'
        ? 'Send a controlled supplier email through the configured intake mailbox.'
        : 'Configure Graph mail, the sender mailbox, EMAIL_INBOUND_ALLOWED_SENDERS, then enable polling when ready.',
    envVars: [
      'START_WORKERS_WITH_API',
      'EMAIL_INBOUND_POLLING_ENABLED',
      'EMAIL_INBOUND_POLLING_INTERVAL_MS',
      'EMAIL_INBOUND_ALLOWED_SENDERS',
      'EMAIL_INBOUND_SUPPLIER_MAPPINGS',
      'MICROSOFT_GRAPH_SENDER_MAILBOX',
    ],
    documentationPath: 'README.md#direct-inbox-polling',
    details: {
      enabled: env.emailInboundPollingEnabled,
      graphConfigured,
      active,
      allowedSenderCount: env.emailInboundAllowedSenders.length,
      supplierMappingCount: env.emailInboundSupplierMappings.length,
      pollingIntervalMs: env.emailInboundPollingIntervalMs,
      workerProcessExpected: !env.startWorkersWithApi,
      apiStartsWorkers: env.startWorkersWithApi,
      runtimeRunning: workerStatus.running,
      runtimeInFlight: workerStatus.inFlight,
      lastRunFinishedAt: workerStatus.lastRunFinishedAt,
      lastSuccessAt: workerStatus.lastSuccessAt,
      lastErrorAt: workerStatus.lastErrorAt,
      lastError: workerStatus.lastError,
      consecutiveFailures: workerStatus.consecutiveFailures,
      totalRuns: workerStatus.totalRuns,
      totalItemsSeen: workerStatus.totalItemsSeen,
      totalItemsProcessed: workerStatus.totalItemsProcessed,
      totalItemsSkipped: workerStatus.totalItemsSkipped,
      totalItemsFailed: workerStatus.totalItemsFailed,
      duplicateItemsSkipped: workerStatus.duplicateItemsSkipped,
    },
  };
}

function buildGraphMailPreflightCheck(): SystemReadinessCheck {
  const preflight = getGraphMailPreflightStatus();
  let status: SystemReadinessStatus = 'not_configured';

  if (preflight.dryRunSafe && preflight.allowedSenderConfigured) {
    status = 'ready';
  } else if (
    preflight.graphConfigured ||
    preflight.mailboxConfigured ||
    preflight.pollingEnabled
  ) {
    status = 'warning';
  }

  return {
    key: 'graph-mail-preflight',
    title: 'Graph Inbox Preflight',
    status,
    meaning:
      status === 'ready'
        ? 'Microsoft Graph inbox dry-run can be performed safely while polling remains disabled.'
        : preflight.pollingEnabled
          ? 'Inbox polling is enabled before Graph dry-run signoff.'
          : 'Graph inbox dry-run is not ready yet.',
    nextAction: preflight.nextAction,
    envVars: [
      'MICROSOFT_MAIL_TENANT_ID',
      'MICROSOFT_MAIL_CLIENT_ID',
      'MICROSOFT_MAIL_CLIENT_SECRET',
      'MICROSOFT_GRAPH_REFRESH_TOKEN',
      'MICROSOFT_GRAPH_SENDER_MAILBOX',
      'EMAIL_INBOUND_ALLOWED_SENDERS',
      'EMAIL_INBOUND_SUPPLIER_MAPPINGS',
      'EMAIL_INBOUND_POLLING_ENABLED',
    ],
    documentationPath: 'README.md#graph-inbox-preflight',
    details: {
      mailboxConfigured: preflight.mailboxConfigured,
      mailbox: preflight.mailbox,
      credentialSource: preflight.credentialSource,
      credentialMode: preflight.credentialMode,
      tenantConfigured: preflight.tenantConfigured,
      clientIdConfigured: preflight.clientIdConfigured,
      clientSecretConfigured: preflight.clientSecretConfigured,
      refreshTokenConfigured: preflight.refreshTokenConfigured,
      graphConfigured: preflight.graphConfigured,
      pollingEnabled: preflight.pollingEnabled,
      allowedSenderConfigured: preflight.allowedSenderConfigured,
      allowedSenderCount: preflight.allowedSenderCount,
      supplierMappingCount: preflight.supplierMappingCount,
      dryRunSafe: preflight.dryRunSafe,
      warnings: preflight.warnings,
    },
  };
}

function buildMicrosoftStorageCheck(): SystemReadinessCheck {
  const configured = Boolean(
    env.microsoftStorageTenantId &&
    env.microsoftStorageClientId &&
    env.microsoftStorageClientSecret,
  );
  const partial = hasAny(
    env.microsoftStorageTenantId,
    env.microsoftStorageClientId,
    env.microsoftStorageClientSecret,
  );
  const accountOpeningStorageEnabled =
    env.sharePointAccountOpeningEnabled || env.oneDriveAccountOpeningEnabled;
  const providerSettingsReady =
    env.accountOpeningStorageProvider === 'ONEDRIVE'
      ? Boolean(env.oneDriveUserId && env.oneDriveAccountOpeningFolder)
      : Boolean(env.sharePointSiteId && env.sharePointDriveId);

  let status: SystemReadinessStatus = 'not_configured';
  if (configured && (!accountOpeningStorageEnabled || providerSettingsReady)) {
    status = 'ready';
  } else if (partial || accountOpeningStorageEnabled) {
    status = 'warning';
  }

  return {
    key: 'microsoft-storage',
    title: 'Microsoft Storage',
    status,
    meaning:
      status === 'ready'
        ? 'Microsoft storage credentials and required provider settings are present.'
        : accountOpeningStorageEnabled
          ? 'Account-opening storage is enabled but credentials or provider settings are incomplete.'
          : 'Microsoft storage is not configured for account-opening archive workflows.',
    nextAction:
      status === 'ready'
        ? 'Run the dedicated Microsoft Drive/SharePoint diagnostic before pilot filing.'
        : 'Configure MICROSOFT_STORAGE_* and the SharePoint or OneDrive settings needed by the chosen provider.',
    envVars: [
      'MICROSOFT_STORAGE_TENANT_ID',
      'MICROSOFT_STORAGE_CLIENT_ID',
      'MICROSOFT_STORAGE_CLIENT_SECRET',
      'ACCOUNT_OPENING_STORAGE_PROVIDER',
      'SHAREPOINT_SITE_ID',
      'SHAREPOINT_DRIVE_ID',
      'ONEDRIVE_USER_ID',
    ],
    documentationPath: 'README.md#microsoft-drive-storage-app',
    details: {
      credentialSource: env.microsoftStorageCredentialSource,
      tenantConfigured: Boolean(env.microsoftStorageTenantId),
      clientIdConfigured: Boolean(env.microsoftStorageClientId),
      clientSecretConfigured: Boolean(env.microsoftStorageClientSecret),
      provider: env.accountOpeningStorageProvider,
      accountOpeningStorageEnabled,
      providerSettingsReady,
      rootFolderConfigured: Boolean(env.microsoftDriveRootFolder),
      accountOpeningFolderConfigured: Boolean(
        env.sharePointAccountOpeningFolder || env.oneDriveAccountOpeningFolder,
      ),
      priceListFolderConfigured: Boolean(env.oneDrivePriceListFolder),
      purchaseOrderFolderConfigured: Boolean(env.oneDrivePurchaseOrderFolder),
      regulatoryFolderConfigured: Boolean(env.oneDriveRegulatoryFolder),
      reportsFolderConfigured: Boolean(env.oneDriveReportsFolder),
    },
  };
}

function buildTelegramCheck(): SystemReadinessCheck {
  const publishingConfigured = Boolean(
    env.telegramBotToken && env.telegramInternalChatId,
  );
  const pollingActive = isTelegramPollingActive();
  const allowlistConfigured =
    env.telegramAllowedUserIds.length > 0 ||
    env.telegramAllowedChatIds.length > 0;
  const workerStatus = getPollingWorkerStatus('telegram');

  let status: SystemReadinessStatus = 'not_configured';
  if (
    env.telegramPollingEnabled &&
    pollingActive &&
    allowlistConfigured &&
    publishingConfigured
  ) {
    status = 'ready';
  } else if (
    env.telegramPollingEnabled ||
    env.telegramBotToken ||
    env.telegramInternalChatId
  ) {
    status = 'warning';
  }

  return {
    key: 'telegram',
    title: 'Telegram',
    status,
    meaning:
      status === 'ready'
        ? 'Telegram polling, bot token, internal chat, and sender allowlists are configured.'
        : env.telegramPollingEnabled
          ? 'Telegram polling is enabled but bot, chat, or allowlist settings are incomplete.'
          : 'Telegram polling is disabled.',
    nextAction:
      status === 'ready'
        ? 'Use dry-run mode until pilot operators have verified message handling.'
        : 'Set bot/chat values and allowlists before enabling polling for pilot intake.',
    envVars: [
      'START_WORKERS_WITH_API',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_INTERNAL_CHAT_ID',
      'TELEGRAM_DRY_RUN',
      'TELEGRAM_POLLING_ENABLED',
      'TELEGRAM_ALLOWED_USER_IDS',
      'TELEGRAM_ALLOWED_CHAT_IDS',
    ],
    documentationPath: 'README.md#telegram-inbound-file-intake',
    details: {
      botTokenConfigured: Boolean(env.telegramBotToken),
      internalChatConfigured: Boolean(env.telegramInternalChatId),
      dryRun: env.telegramDryRun,
      pollingEnabled: env.telegramPollingEnabled,
      pollingActive,
      workerProcessExpected: !env.startWorkersWithApi,
      apiStartsWorkers: env.startWorkersWithApi,
      allowedUserCount: env.telegramAllowedUserIds.length,
      allowedChatCount: env.telegramAllowedChatIds.length,
      runtimeRunning: workerStatus.running,
      runtimeInFlight: workerStatus.inFlight,
      lastRunFinishedAt: workerStatus.lastRunFinishedAt,
      lastSuccessAt: workerStatus.lastSuccessAt,
      lastErrorAt: workerStatus.lastErrorAt,
      lastError: workerStatus.lastError,
      consecutiveFailures: workerStatus.consecutiveFailures,
      totalRuns: workerStatus.totalRuns,
      totalItemsSeen: workerStatus.totalItemsSeen,
      totalItemsProcessed: workerStatus.totalItemsProcessed,
      totalItemsSkipped: workerStatus.totalItemsSkipped,
      totalItemsFailed: workerStatus.totalItemsFailed,
    },
  };
}

function buildOpenAiCheck(): SystemReadinessCheck {
  const apiKeyConfigured = Boolean(env.openAiApiKey);
  const parserReady = env.openAiParserEnabled && apiKeyConfigured;
  const emailReviewReady = env.openAiEmailReviewEnabled && apiKeyConfigured;

  let status: SystemReadinessStatus = 'not_configured';
  if (parserReady || emailReviewReady) {
    status = 'ready';
  } else if (
    env.openAiParserEnabled ||
    env.openAiEmailReviewEnabled ||
    apiKeyConfigured
  ) {
    status = 'warning';
  }

  return {
    key: 'openai-parser',
    title: 'OpenAI Parser',
    status,
    meaning:
      status === 'ready'
        ? 'OpenAI fallback is enabled and an API key is configured.'
        : env.openAiParserEnabled || env.openAiEmailReviewEnabled
          ? 'OpenAI fallback is enabled but no API key is configured.'
          : 'OpenAI fallback is disabled; deterministic parsing remains available.',
    nextAction:
      status === 'ready'
        ? 'Keep daily review limits conservative during the pilot.'
        : 'Leave disabled for deterministic-only pilots, or set OPENAI_API_KEY before enabling fallback.',
    envVars: [
      'OPENAI_API_KEY',
      'OPENAI_PARSER_ENABLED',
      'OPENAI_PARSER_MODEL',
      'OPENAI_EMAIL_REVIEW_ENABLED',
      'OPENAI_EMAIL_REVIEW_DAILY_LIMIT',
    ],
    documentationPath: 'README.md#ai-fallback-constraints',
    details: {
      apiKeyConfigured,
      parserEnabled: env.openAiParserEnabled,
      emailReviewEnabled: env.openAiEmailReviewEnabled,
      modelConfigured: Boolean(env.openAiParserModel),
      emailReviewDailyLimit: env.openAiEmailReviewDailyLimit,
      emailReviewPerSupplierDailyLimit:
        env.openAiEmailReviewPerSupplierDailyLimit,
    },
  };
}

function buildImportsCheck(): SystemReadinessCheck {
  return {
    key: 'imports',
    title: 'Import Readiness',
    status: 'ready',
    meaning:
      'Supplier price list, inventory, and sales import endpoints are available.',
    nextAction:
      'Run a controlled CSV/XLSX fixture import after the database is reachable.',
    envVars: [],
    documentationPath: 'README.md#import-api',
    details: {
      supplierPriceListImportAvailable: true,
      inventoryImportAvailable: true,
      salesImportAvailable: true,
      csvSupported: true,
      xlsxSupported: true,
      maxUploadSizeBytes: 10 * 1024 * 1024,
    },
  };
}

export function createSystemReadinessService(
  dependencies: Partial<SystemReadinessDependencies> = {},
) {
  const resolvedDependencies: SystemReadinessDependencies = {
    now: () => new Date(),
    pingDatabase: async () => {
      await db.$queryRaw`SELECT 1`;
    },
    ...dependencies,
  };

  return {
    async getReadinessReport(): Promise<SystemReadinessReport> {
      const checks = [
        await buildDatabaseCheck(resolvedDependencies),
        buildApiAuthCheck(),
        buildMicrosoftMailCheck(),
        buildGraphMailPreflightCheck(),
        buildEmailPollingCheck(),
        buildMicrosoftStorageCheck(),
        buildTelegramCheck(),
        buildOpenAiCheck(),
        buildImportsCheck(),
      ];

      return {
        generatedAt: resolvedDependencies.now().toISOString(),
        status: aggregateStatus(checks),
        checks,
      };
    },
  };
}

export const systemReadinessService = createSystemReadinessService();
