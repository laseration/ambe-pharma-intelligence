import path from 'node:path';

import dotenv from 'dotenv';

const apiRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(apiRoot, '../..');

dotenv.config({ path: path.join(apiRoot, '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

type NodeEnv = 'development' | 'test' | 'production';
type OpportunityBusinessMode = 'STOCKHOLDING' | 'TRADING';

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

function readOpportunityBusinessMode(value: string | undefined): OpportunityBusinessMode {
  const trimmed = value?.trim().toUpperCase();

  if (trimmed === 'STOCKHOLDING') {
    return 'STOCKHOLDING';
  }

  return 'TRADING';
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

function readStringListWithDefaults(value: string | undefined, defaults: string[]): string[] {
  return Array.from(new Set([...defaults, ...readIdList(value)]));
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
  telegramPollingEnabled: readBoolean(process.env.TELEGRAM_POLLING_ENABLED, false),
  telegramPollingIntervalMs: readPort(process.env.TELEGRAM_POLLING_INTERVAL_MS, 5000),
  telegramAllowedUserIds: readIdList(process.env.TELEGRAM_ALLOWED_USER_IDS),
  telegramAllowedChatIds: readIdList(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
  emailAlertsEnabled: readBoolean(process.env.EMAIL_ALERTS_ENABLED, false),
  microsoftGraphTenantId:
    process.env.MICROSOFT_GRAPH_TENANT_ID?.trim() ||
    process.env.MICROSOFT_TENANT_ID?.trim() ||
    '',
  microsoftGraphClientId:
    process.env.MICROSOFT_GRAPH_CLIENT_ID?.trim() ||
    process.env.MICROSOFT_CLIENT_ID?.trim() ||
    '',
  microsoftGraphClientSecret:
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET?.trim() ||
    process.env.MICROSOFT_CLIENT_SECRET?.trim() ||
    '',
  microsoftGraphRefreshToken: process.env.MICROSOFT_GRAPH_REFRESH_TOKEN?.trim() || '',
  microsoftGraphSenderMailbox: process.env.MICROSOFT_GRAPH_SENDER_MAILBOX?.trim() || '',
  internalAlertEmailRecipients: readIdList(process.env.INTERNAL_ALERT_EMAIL_RECIPIENTS),
  sharePointAccountOpeningEnabled: readBoolean(
    process.env.SHAREPOINT_ACCOUNT_OPENING_ENABLED,
    false,
  ),
  sharePointSiteId: process.env.SHAREPOINT_SITE_ID?.trim() || '',
  sharePointDriveId: process.env.SHAREPOINT_DRIVE_ID?.trim() || '',
  sharePointAccountOpeningFolder: process.env.SHAREPOINT_ACCOUNT_OPENING_FOLDER?.trim() || '',
  emailInboundPollingEnabled: readBoolean(process.env.EMAIL_INBOUND_POLLING_ENABLED, false),
  emailInboundPollingIntervalMs: readPort(process.env.EMAIL_INBOUND_POLLING_INTERVAL_MS, 30000),
  emailInboundAllowedSenders: readIdList(process.env.EMAIL_INBOUND_ALLOWED_SENDERS),
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
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
  openAiParserEnabled: readBoolean(process.env.OPENAI_PARSER_ENABLED, false),
  openAiParserModel: readString(process.env.OPENAI_PARSER_MODEL, 'gpt-5.4-mini'),
  openAiParserTimeoutMs: readPort(process.env.OPENAI_PARSER_TIMEOUT_MS, 8000),
  openAiParserMinChars: readPort(process.env.OPENAI_PARSER_MIN_CHARS, 24),
  openAiParserMaxChars: readPort(process.env.OPENAI_PARSER_MAX_CHARS, 4000),
  openAiEmailReviewEnabled: readBoolean(process.env.OPENAI_EMAIL_REVIEW_ENABLED, false),
  openAiEmailReviewDailyLimit: readPort(process.env.OPENAI_EMAIL_REVIEW_DAILY_LIMIT, 10),
  openAiEmailReviewPerSupplierDailyLimit: readPort(
    process.env.OPENAI_EMAIL_REVIEW_PER_SUPPLIER_DAILY_LIMIT,
    2,
  ),
  openAiEmailReviewMinBusinessScore: readPort(
    process.env.OPENAI_EMAIL_REVIEW_MIN_BUSINESS_SCORE,
    65,
  ),
  opportunityBusinessMode: readOpportunityBusinessMode(process.env.OPPORTUNITY_BUSINESS_MODE),
};
