import path from 'node:path';

import dotenv from 'dotenv';

const apiRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(apiRoot, '../..');

dotenv.config({ path: path.join(apiRoot, '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

type NodeEnv = 'development' | 'test' | 'production';
type OpportunityBusinessMode = 'STOCKHOLDING' | 'TRADING';
type AccountOpeningStorageProvider = 'SHAREPOINT' | 'ONEDRIVE';
export type MicrosoftGraphCredentialSource =
  | 'mail-specific'
  | 'storage-specific'
  | 'legacy-graph'
  | 'generic-fallback'
  | 'missing';

const DEFAULT_EMAIL_INBOUND_INTERNAL_DOMAINS = ['ambemedical.com'];
const DEFAULT_EMAIL_INBOUND_INTERNAL_COMPANY_NAMES = [
  'Ambe Medical',
  'Ambe Medical Group',
  'Ambemedical',
  'Ambe Pharma',
];

function readString(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function buildMicrosoftDriveWorkflowFolder(
  rootFolder: string | undefined,
  explicitFolder: string | undefined,
  workflowName: string,
): string {
  const explicit = explicitFolder?.trim();

  if (explicit) {
    return explicit;
  }

  return `${readString(rootFolder, 'AI BOT FOLDER')}/${workflowName}`;
}

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim().toLowerCase();

  if (!trimmed) {
    return fallback;
  }

  return ['1', 'true', 'yes'].includes(trimmed);
}

function readNodeEnv(value: string | undefined): NodeEnv {
  if (value === 'test' || value === 'production') {
    return value;
  }

  return 'development';
}

function readOpportunityBusinessMode(
  value: string | undefined,
): OpportunityBusinessMode {
  const trimmed = value?.trim().toUpperCase();

  if (trimmed === 'STOCKHOLDING') {
    return 'STOCKHOLDING';
  }

  return 'TRADING';
}

function readAccountOpeningStorageProvider(
  value: string | undefined,
): AccountOpeningStorageProvider {
  const trimmed = value?.trim().toUpperCase();

  if (trimmed === 'ONEDRIVE') {
    return 'ONEDRIVE';
  }

  return 'SHAREPOINT';
}

function readDatabaseHost(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).host;
  } catch {
    return null;
  }
}

function readIdList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStringListWithDefaults(
  value: string | undefined,
  defaults: string[],
): string[] {
  return Array.from(new Set([...defaults, ...readIdList(value)]));
}

function hasAnyValue(...values: Array<string | undefined>): boolean {
  return values.some((value) => Boolean(value?.trim()));
}

type MicrosoftGraphCredentials = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  source: MicrosoftGraphCredentialSource;
};

export function resolveMicrosoftMailGraphCredentials(
  source: NodeJS.ProcessEnv = process.env,
): MicrosoftGraphCredentials {
  const hasMailSpecific = hasAnyValue(
    source.MICROSOFT_MAIL_TENANT_ID,
    source.MICROSOFT_MAIL_CLIENT_ID,
    source.MICROSOFT_MAIL_CLIENT_SECRET,
  );

  if (hasMailSpecific) {
    return {
      tenantId: source.MICROSOFT_MAIL_TENANT_ID?.trim() || '',
      clientId: source.MICROSOFT_MAIL_CLIENT_ID?.trim() || '',
      clientSecret: source.MICROSOFT_MAIL_CLIENT_SECRET?.trim() || '',
      source: 'mail-specific',
    };
  }

  const hasLegacyGraph = hasAnyValue(
    source.MICROSOFT_GRAPH_TENANT_ID,
    source.MICROSOFT_GRAPH_CLIENT_ID,
    source.MICROSOFT_GRAPH_CLIENT_SECRET,
  );

  return {
    tenantId: source.MICROSOFT_GRAPH_TENANT_ID?.trim() || '',
    clientId: source.MICROSOFT_GRAPH_CLIENT_ID?.trim() || '',
    clientSecret: source.MICROSOFT_GRAPH_CLIENT_SECRET?.trim() || '',
    source: hasLegacyGraph ? 'legacy-graph' : 'missing',
  };
}

export function resolveMicrosoftStorageGraphCredentials(
  source: NodeJS.ProcessEnv = process.env,
): MicrosoftGraphCredentials {
  const hasStorageSpecific = hasAnyValue(
    source.MICROSOFT_STORAGE_TENANT_ID,
    source.MICROSOFT_STORAGE_CLIENT_ID,
    source.MICROSOFT_STORAGE_CLIENT_SECRET,
  );

  if (hasStorageSpecific) {
    return {
      tenantId: source.MICROSOFT_STORAGE_TENANT_ID?.trim() || '',
      clientId: source.MICROSOFT_STORAGE_CLIENT_ID?.trim() || '',
      clientSecret: source.MICROSOFT_STORAGE_CLIENT_SECRET?.trim() || '',
      source: 'storage-specific',
    };
  }

  const hasGenericFallback = hasAnyValue(
    source.MICROSOFT_TENANT_ID,
    source.MICROSOFT_CLIENT_ID,
    source.MICROSOFT_CLIENT_SECRET,
  );

  return {
    tenantId: source.MICROSOFT_TENANT_ID?.trim() || '',
    clientId: source.MICROSOFT_CLIENT_ID?.trim() || '',
    clientSecret: source.MICROSOFT_CLIENT_SECRET?.trim() || '',
    source: hasGenericFallback ? 'generic-fallback' : 'missing',
  };
}

function readEmailInboundSupplierMappings(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex <= 0) {
        return [];
      }

      const pattern = entry.slice(0, separatorIndex).trim();
      const supplierName = entry.slice(separatorIndex + 1).trim();

      if (!pattern || !supplierName) {
        return [];
      }

      return [
        {
          pattern,
          supplierName,
        },
      ];
    });
}

const microsoftMailGraphCredentials = resolveMicrosoftMailGraphCredentials();
const microsoftStorageGraphCredentials =
  resolveMicrosoftStorageGraphCredentials();

export const env = {
  nodeEnv: readNodeEnv(process.env.NODE_ENV),
  port: readPort(process.env.PORT, 4000),
  logLevel: readString(process.env.LOG_LEVEL, 'info'),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  databaseHost: readDatabaseHost(process.env.DATABASE_URL),
  internalApiKey: process.env.INTERNAL_API_KEY?.trim() || '',
  internalAdminApiKey: process.env.INTERNAL_ADMIN_API_KEY?.trim() || '',
  enableDebugRoutes: readBoolean(
    process.env.ENABLE_DEBUG_ROUTES,
    process.env.NODE_ENV !== 'production',
  ),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || '',
  telegramInternalChatId: process.env.TELEGRAM_INTERNAL_CHAT_ID?.trim() || '',
  telegramDryRun: readBoolean(process.env.TELEGRAM_DRY_RUN, false),
  telegramPollingEnabled: readBoolean(
    process.env.TELEGRAM_POLLING_ENABLED,
    false,
  ),
  telegramPollingIntervalMs: readPort(
    process.env.TELEGRAM_POLLING_INTERVAL_MS,
    5000,
  ),
  telegramAllowedUserIds: readIdList(process.env.TELEGRAM_ALLOWED_USER_IDS),
  telegramAllowedChatIds: readIdList(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
  emailAlertsEnabled: readBoolean(process.env.EMAIL_ALERTS_ENABLED, false),
  microsoftMailTenantId: microsoftMailGraphCredentials.tenantId,
  microsoftMailClientId: microsoftMailGraphCredentials.clientId,
  microsoftMailClientSecret: microsoftMailGraphCredentials.clientSecret,
  microsoftMailCredentialSource: microsoftMailGraphCredentials.source,
  microsoftStorageTenantId: microsoftStorageGraphCredentials.tenantId,
  microsoftStorageClientId: microsoftStorageGraphCredentials.clientId,
  microsoftStorageClientSecret: microsoftStorageGraphCredentials.clientSecret,
  microsoftStorageCredentialSource: microsoftStorageGraphCredentials.source,
  microsoftGraphTenantId: microsoftMailGraphCredentials.tenantId,
  microsoftGraphClientId: microsoftMailGraphCredentials.clientId,
  microsoftGraphClientSecret: microsoftMailGraphCredentials.clientSecret,
  microsoftGraphRefreshToken:
    process.env.MICROSOFT_GRAPH_REFRESH_TOKEN?.trim() || '',
  microsoftGraphSenderMailbox:
    process.env.MICROSOFT_GRAPH_SENDER_MAILBOX?.trim() || '',
  internalAlertEmailRecipients: readIdList(
    process.env.INTERNAL_ALERT_EMAIL_RECIPIENTS,
  ),
  sharePointAccountOpeningEnabled: readBoolean(
    process.env.SHAREPOINT_ACCOUNT_OPENING_ENABLED,
    false,
  ),
  accountOpeningStorageProvider: readAccountOpeningStorageProvider(
    process.env.ACCOUNT_OPENING_STORAGE_PROVIDER,
  ),
  sharePointSiteId: process.env.SHAREPOINT_SITE_ID?.trim() || '',
  sharePointDriveId: process.env.SHAREPOINT_DRIVE_ID?.trim() || '',
  microsoftDriveRootFolder:
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER?.trim() || 'AI BOT FOLDER',
  sharePointAccountOpeningFolder: buildMicrosoftDriveWorkflowFolder(
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER,
    process.env.SHAREPOINT_ACCOUNT_OPENING_FOLDER,
    'Account Opening',
  ),
  oneDriveAccountOpeningEnabled: readBoolean(
    process.env.ONEDRIVE_ACCOUNT_OPENING_ENABLED,
    false,
  ),
  oneDriveUserId: process.env.ONEDRIVE_USER_ID?.trim() || '',
  oneDriveDriveId: process.env.ONEDRIVE_DRIVE_ID?.trim() || '',
  oneDriveAccountOpeningFolder: buildMicrosoftDriveWorkflowFolder(
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER,
    process.env.ONEDRIVE_ACCOUNT_OPENING_FOLDER,
    'Account Opening',
  ),
  oneDrivePriceListFolder: buildMicrosoftDriveWorkflowFolder(
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER,
    process.env.ONEDRIVE_PRICE_LIST_FOLDER,
    'Price Lists',
  ),
  oneDrivePurchaseOrderFolder: buildMicrosoftDriveWorkflowFolder(
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER,
    process.env.ONEDRIVE_PURCHASE_ORDER_FOLDER,
    'Purchase Orders',
  ),
  oneDriveRegulatoryFolder: buildMicrosoftDriveWorkflowFolder(
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER,
    process.env.ONEDRIVE_REGULATORY_FOLDER,
    'Regulatory',
  ),
  oneDriveReportsFolder: buildMicrosoftDriveWorkflowFolder(
    process.env.MICROSOFT_DRIVE_ROOT_FOLDER,
    process.env.ONEDRIVE_REPORTS_FOLDER,
    'Reports',
  ),
  emailInboundPollingEnabled: readBoolean(
    process.env.EMAIL_INBOUND_POLLING_ENABLED,
    false,
  ),
  emailInboundPollingIntervalMs: readPort(
    process.env.EMAIL_INBOUND_POLLING_INTERVAL_MS,
    30000,
  ),
  graphUseMessageDelta: readBoolean(process.env.GRAPH_USE_MESSAGE_DELTA, true),
  graphUseImmutableIds: readBoolean(process.env.GRAPH_USE_IMMUTABLE_IDS, true),
  inboundClassifierEnabled: readBoolean(
    process.env.INBOUND_CLASSIFIER_ENABLED,
    true,
  ),
  inboundClassifierShadowMode: readBoolean(
    process.env.INBOUND_CLASSIFIER_SHADOW_MODE,
    false,
  ),
  emailInboundAllowedSenders: readIdList(
    process.env.EMAIL_INBOUND_ALLOWED_SENDERS,
  ),
  emailInboundSupplierMappings: readEmailInboundSupplierMappings(
    process.env.EMAIL_INBOUND_SUPPLIER_MAPPINGS,
  ),
  emailInboundInternalDomains: readStringListWithDefaults(
    process.env.EMAIL_INBOUND_INTERNAL_DOMAINS,
    DEFAULT_EMAIL_INBOUND_INTERNAL_DOMAINS,
  ),
  emailInboundInternalCompanyNames: readStringListWithDefaults(
    process.env.EMAIL_INBOUND_INTERNAL_COMPANY_NAMES,
    DEFAULT_EMAIL_INBOUND_INTERNAL_COMPANY_NAMES,
  ),
  supplierContactAutoAcceptEnabled: readBoolean(
    process.env.SUPPLIER_CONTACT_AUTO_ACCEPT_ENABLED,
    false,
  ),
  accountOpeningOriginalUploadEnabled: readBoolean(
    process.env.ACCOUNT_OPENING_ORIGINAL_UPLOAD_ENABLED,
    false,
  ),
  accountOpeningAutofillEnabled: readBoolean(
    process.env.ACCOUNT_OPENING_AUTOFILL_ENABLED,
    false,
  ),
  accountOpeningAutoFileSharePointEnabled: readBoolean(
    process.env.ACCOUNT_OPENING_AUTO_FILE_SHAREPOINT_ENABLED,
    false,
  ),
  accountOpeningForbiddenFieldsEnforced: readBoolean(
    process.env.ACCOUNT_OPENING_FORBIDDEN_FIELDS_ENFORCED,
    true,
  ),
  accountOpeningMinClassifierScore: readPort(
    process.env.ACCOUNT_OPENING_MIN_CLASSIFIER_SCORE,
    75,
  ),
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
  openAiParserEnabled: readBoolean(process.env.OPENAI_PARSER_ENABLED, false),
  openAiParserModel: readString(
    process.env.OPENAI_PARSER_MODEL,
    'gpt-5.4-mini',
  ),
  openAiParserTimeoutMs: readPort(process.env.OPENAI_PARSER_TIMEOUT_MS, 8000),
  openAiParserMinChars: readPort(process.env.OPENAI_PARSER_MIN_CHARS, 24),
  openAiParserMaxChars: readPort(process.env.OPENAI_PARSER_MAX_CHARS, 4000),
  openAiEmailReviewEnabled: readBoolean(
    process.env.OPENAI_EMAIL_REVIEW_ENABLED,
    false,
  ),
  openAiEmailReviewDailyLimit: readPort(
    process.env.OPENAI_EMAIL_REVIEW_DAILY_LIMIT,
    10,
  ),
  openAiEmailReviewPerSupplierDailyLimit: readPort(
    process.env.OPENAI_EMAIL_REVIEW_PER_SUPPLIER_DAILY_LIMIT,
    2,
  ),
  openAiEmailReviewMinBusinessScore: readPort(
    process.env.OPENAI_EMAIL_REVIEW_MIN_BUSINESS_SCORE,
    65,
  ),
  opportunityBusinessMode: readOpportunityBusinessMode(
    process.env.OPPORTUNITY_BUSINESS_MODE,
  ),
};
