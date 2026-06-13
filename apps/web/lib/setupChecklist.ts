import { getWebAuthConfig, type WebAuthSession } from './internalWebAuth';
import { redactDashboardText } from './operatorTrust';
import type {
  SystemReadinessCheck,
  SystemReadinessReport,
  SystemReadinessStatus,
} from './systemApi';

export type SetupChecklistDetailValue =
  | boolean
  | number
  | string
  | string[]
  | null;

export type SetupChecklistSection = {
  key: string;
  title: string;
  status: SystemReadinessStatus;
  meaning: string;
  nextAction: string;
  envVars: string[];
  documentationPath?: string;
  details: Record<string, SetupChecklistDetailValue>;
};

type WebAuthEnv = Record<string, string | undefined>;

function findCheck(
  report: SystemReadinessReport,
  key: string,
): SystemReadinessCheck | undefined {
  return report.checks.find((check) => check.key === key);
}

function fallbackSection(input: {
  key: string;
  title: string;
  envVars: string[];
  documentationPath?: string;
}): SetupChecklistSection {
  return {
    ...input,
    status: 'missing',
    meaning: 'The readiness API did not return this setup signal.',
    nextAction:
      'Confirm the API is up to date and reload the setup checklist after deployment.',
    details: {},
  };
}

function checkToSection(
  check: SystemReadinessCheck | undefined,
  fallback: {
    key: string;
    title: string;
    envVars: string[];
    documentationPath?: string;
  },
): SetupChecklistSection {
  if (!check) {
    return fallbackSection(fallback);
  }

  return {
    key: fallback.key,
    title: fallback.title,
    status: check.status,
    meaning: check.meaning,
    nextAction: check.nextAction,
    envVars: check.envVars,
    documentationPath: check.documentationPath,
    details: sanitizeSetupDetails(check.details),
  };
}

function sanitizeSetupDetails(
  details: SystemReadinessCheck['details'],
): SetupChecklistSection['details'] {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, sanitizeDetail(value)]),
  );
}

function sanitizeDetail(
  value: SystemReadinessCheck['details'][string],
): SetupChecklistDetailValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactDashboardText(item));
  }

  if (typeof value === 'string') {
    return redactDashboardText(value);
  }

  return value;
}

function buildWebAuthSection(
  session: WebAuthSession | null,
  source: WebAuthEnv,
): SetupChecklistSection {
  const config = getWebAuthConfig(source);
  const usernameConfigured = Boolean(source.WEB_AUTH_USERNAME?.trim());
  const passwordConfigured = Boolean(source.WEB_AUTH_PASSWORD?.trim());
  const roleConfigured = Boolean(source.WEB_AUTH_ROLE?.trim());
  const sessionSecretConfigured =
    (source.WEB_AUTH_SESSION_SECRET?.trim().length ?? 0) >= 32;

  return {
    key: 'web-auth-session',
    title: 'Web Auth/Session',
    status: config.configured && session ? 'ready' : 'missing',
    meaning:
      config.configured && session
        ? 'Dashboard web authentication is configured and this setup page is being viewed through a signed session.'
        : 'Dashboard web authentication is missing required pilot credentials or session signing configuration.',
    nextAction:
      config.configured && session
        ? 'Keep dashboard credentials server-side and rotate the session secret for each pilot environment.'
        : 'Set WEB_AUTH_USERNAME, WEB_AUTH_PASSWORD, WEB_AUTH_ROLE, WEB_AUTH_SESSION_SECRET, and WEB_AUTH_SESSION_TTL_SECONDS in the web runtime.',
    envVars: [
      'WEB_AUTH_USERNAME',
      'WEB_AUTH_PASSWORD',
      'WEB_AUTH_ROLE',
      'WEB_AUTH_SESSION_SECRET',
      'WEB_AUTH_SESSION_TTL_SECONDS',
    ],
    documentationPath: 'README.md#web-dashboard-auth',
    details: {
      usernameConfigured,
      passwordConfigured,
      roleConfigured,
      sessionSecretConfigured,
      sessionTtlSecondsConfigured: Boolean(
        source.WEB_AUTH_SESSION_TTL_SECONDS?.trim(),
      ),
      activeSession: Boolean(session),
      sessionRole: session?.role ?? null,
    },
  };
}

function buildGraphInboxSection(
  report: SystemReadinessReport,
): SetupChecklistSection {
  const mail = findCheck(report, 'microsoft-mail');
  const preflight = findCheck(report, 'graph-mail-preflight');
  const polling = findCheck(report, 'email-polling');

  if (polling?.status === 'disabled') {
    return {
      key: 'microsoft-graph-inbox-polling',
      title: 'Microsoft Graph Inbox Polling',
      status: 'disabled',
      meaning: polling.meaning,
      nextAction: polling.nextAction,
      envVars: Array.from(
        new Set([
          ...(mail?.envVars ?? []),
          ...(preflight?.envVars ?? []),
          ...polling.envVars,
        ]),
      ),
      documentationPath: polling.documentationPath,
      details: sanitizeSetupDetails({
        graphConfigured: Boolean(polling.details.graphConfigured),
        pollingEnabled: Boolean(polling.details.enabled),
        active: Boolean(polling.details.active),
        dryRunSafe: Boolean(preflight?.details.dryRunSafe),
        allowedSenderCount:
          Number(preflight?.details.allowedSenderCount ?? 0) || 0,
        supplierMappingCount:
          Number(preflight?.details.supplierMappingCount ?? 0) || 0,
        runtimeRunning: Boolean(polling.details.runtimeRunning),
      }),
    };
  }

  const checks = [mail, preflight, polling].filter(
    (check): check is SystemReadinessCheck => Boolean(check),
  );
  const status = combineStatuses(checks.map((check) => check.status));
  const primary = polling ?? preflight ?? mail;

  if (!primary) {
    return fallbackSection({
      key: 'microsoft-graph-inbox-polling',
      title: 'Microsoft Graph Inbox Polling',
      envVars: [
        'MICROSOFT_GRAPH_SENDER_MAILBOX',
        'EMAIL_INBOUND_POLLING_ENABLED',
      ],
      documentationPath: 'README.md#direct-inbox-polling',
    });
  }

  return {
    key: 'microsoft-graph-inbox-polling',
    title: 'Microsoft Graph Inbox Polling',
    status,
    meaning: primary.meaning,
    nextAction: primary.nextAction,
    envVars: Array.from(new Set(checks.flatMap((check) => check.envVars))),
    documentationPath: primary.documentationPath,
    details: sanitizeSetupDetails({
      graphConfigured: Boolean(polling?.details.graphConfigured),
      pollingEnabled: Boolean(polling?.details.enabled),
      active: Boolean(polling?.details.active),
      dryRunSafe: Boolean(preflight?.details.dryRunSafe),
      allowedSenderCount:
        Number(preflight?.details.allowedSenderCount ?? 0) || 0,
      supplierMappingCount:
        Number(preflight?.details.supplierMappingCount ?? 0) || 0,
      runtimeRunning: Boolean(polling?.details.runtimeRunning),
    }),
  };
}

function combineStatuses(
  statuses: SystemReadinessStatus[],
): SystemReadinessStatus {
  if (statuses.includes('warning')) {
    return 'warning';
  }

  if (statuses.includes('missing')) {
    return 'missing';
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) => status === 'disabled')
  ) {
    return 'disabled';
  }

  return 'ready';
}

export function buildSetupChecklistSections(input: {
  report: SystemReadinessReport;
  session: WebAuthSession | null;
  source?: WebAuthEnv;
}): SetupChecklistSection[] {
  const { report, session, source = process.env } = input;

  return [
    checkToSection(findCheck(report, 'database'), {
      key: 'database-api',
      title: 'Database/API',
      envVars: ['DATABASE_URL'],
      documentationPath: 'README.md#database',
    }),
    checkToSection(findCheck(report, 'api-internal-auth'), {
      key: 'internal-api-auth',
      title: 'Internal API Auth',
      envVars: [
        'INTERNAL_VIEWER_API_KEY',
        'INTERNAL_API_KEY',
        'INTERNAL_ADMIN_API_KEY',
      ],
      documentationPath: 'README.md#environment',
    }),
    buildWebAuthSection(session, source),
    buildGraphInboxSection(report),
    checkToSection(findCheck(report, 'allowed-senders-supplier-mappings'), {
      key: 'allowed-senders-supplier-mappings',
      title: 'Allowed Senders/Supplier Mappings',
      envVars: [
        'EMAIL_INBOUND_ALLOWED_SENDERS',
        'EMAIL_INBOUND_SUPPLIER_MAPPINGS',
      ],
      documentationPath: 'README.md#email-inbound-sender-configuration',
    }),
    checkToSection(findCheck(report, 'microsoft-storage'), {
      key: 'microsoft-storage',
      title: 'Microsoft Storage',
      envVars: [
        'MICROSOFT_STORAGE_TENANT_ID',
        'MICROSOFT_STORAGE_CLIENT_ID',
        'MICROSOFT_STORAGE_CLIENT_SECRET',
      ],
      documentationPath: 'README.md#microsoft-drive-storage-app',
    }),
    checkToSection(findCheck(report, 'telegram'), {
      key: 'telegram-intake',
      title: 'Telegram Intake',
      envVars: [
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_INTERNAL_CHAT_ID',
        'TELEGRAM_POLLING_ENABLED',
      ],
      documentationPath: 'README.md#telegram-inbound-file-intake',
    }),
    checkToSection(findCheck(report, 'openai-parser'), {
      key: 'openai-ai-fallback-policy',
      title: 'OpenAI/AI Fallback Policy',
      envVars: [
        'OPENAI_API_KEY',
        'OPENAI_PARSER_ENABLED',
        'OPENAI_EMAIL_REVIEW_ENABLED',
      ],
      documentationPath: 'README.md#ai-fallback-constraints',
    }),
    checkToSection(findCheck(report, 'imports'), {
      key: 'import-availability',
      title: 'Import Availability',
      envVars: [],
      documentationPath: 'README.md#import-api',
    }),
    checkToSection(findCheck(report, 'demo-seed-safety'), {
      key: 'demo-seed-safety',
      title: 'Demo/Seed Safety',
      envVars: ['NODE_ENV', 'ENABLE_DEBUG_ROUTES', 'DATABASE_URL'],
      documentationPath: 'docs/pilot-runbook.md#demo-and-fixture-safety',
    }),
    checkToSection(findCheck(report, 'production-safety-warnings'), {
      key: 'production-safety-warnings',
      title: 'Production Safety Warnings',
      envVars: ['NODE_ENV', 'ENABLE_DEBUG_ROUTES'],
      documentationPath: 'docs/pilot-runbook.md#pre-flight-checklist',
    }),
  ];
}

export function countSetupSectionsByStatus(sections: SetupChecklistSection[]) {
  return {
    ready: sections.filter((section) => section.status === 'ready').length,
    warning: sections.filter((section) => section.status === 'warning').length,
    missing: sections.filter((section) => section.status === 'missing').length,
    disabled: sections.filter((section) => section.status === 'disabled')
      .length,
  };
}

export function statusLabel(status: SystemReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'warning':
      return 'Warning';
    case 'missing':
      return 'Missing';
    case 'disabled':
      return 'Disabled';
  }
}

export function statusPillClass(status: SystemReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'pill-high';
    case 'warning':
      return 'pill-medium';
    case 'missing':
      return 'pill-low';
    case 'disabled':
      return 'pill-neutral';
  }
}

export function formatSetupDetailValue(
  value: SetupChecklistDetailValue,
): string {
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => redactDashboardText(item)).join(', ')
      : 'none';
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (value === null || value === '') {
    return 'n/a';
  }

  return typeof value === 'string' ? redactDashboardText(value) : String(value);
}
