import { env } from '../config/env';
import {
  getMicrosoftGraphAccessToken,
  isMicrosoftGraphConfigured,
} from './graph';
import type { ingestInboundEmail } from './inbound/service';

export type GraphMailCredentialMode =
  | 'client-secret'
  | 'refresh-token'
  | 'missing';

export type GraphMailPreflightStatus = {
  mailboxConfigured: boolean;
  mailbox: string | null;
  credentialSource: string;
  credentialMode: GraphMailCredentialMode;
  tenantConfigured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  refreshTokenConfigured: boolean;
  graphConfigured: boolean;
  pollingEnabled: boolean;
  allowedSenderConfigured: boolean;
  allowedSenderCount: number;
  supplierMappingCount: number;
  dryRunSafe: boolean;
  warnings: string[];
  nextAction: string;
};

type GraphEmailAddress = {
  address?: string | null;
  name?: string | null;
};

type GraphRecipient = {
  emailAddress?: GraphEmailAddress | null;
};

type GraphDryRunMessage = {
  id?: string | null;
  subject?: string | null;
  receivedDateTime?: string | null;
  from?: GraphRecipient | null;
  sender?: GraphRecipient | null;
  hasAttachments?: boolean | null;
};

type GraphListResponse<T> = {
  value?: T[];
};

type GraphAttachmentMetadata = {
  id?: string | null;
};

export type GraphMailDryRunMessageSummary = {
  messageIndex: number;
  receivedDateTime: string | null;
  senderDomain: string | null;
  senderPreview: string;
  subjectPreview: string;
  subjectTruncated: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
};

export type GraphMailDryRunResult = {
  generatedAt: string;
  liveReadOnlyGraphCall: boolean;
  mailbox: string;
  requestedTake: number;
  messageCount: number;
  messages: GraphMailDryRunMessageSummary[];
  safety: {
    markedRead: false;
    ingested: false;
    persistedContent: false;
    downloadedAttachmentContent: false;
    calledOpenAi: false;
    calledTelegram: false;
    sentEmail: false;
  };
};

type GraphMailDryRunDependencies = {
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string>;
  markMessageRead?: (messageId: string) => Promise<void>;
  ingestInboundEmail?: typeof ingestInboundEmail;
  now: () => Date;
};

const SUBJECT_PREVIEW_MAX_LENGTH = 80;
const DEFAULT_DRY_RUN_TAKE = 5;
const MAX_DRY_RUN_TAKE = 10;

function credentialMode(): GraphMailCredentialMode {
  if (env.microsoftGraphRefreshToken) {
    return 'refresh-token';
  }

  if (env.microsoftMailClientSecret) {
    return 'client-secret';
  }

  return 'missing';
}

export function getGraphMailPreflightStatus(): GraphMailPreflightStatus {
  const graphConfigured = isMicrosoftGraphConfigured();
  const mailboxConfigured = Boolean(env.microsoftGraphSenderMailbox);
  const allowedSenderCount = env.emailInboundAllowedSenders.length;
  const supplierMappingCount = env.emailInboundSupplierMappings.length;
  const warnings: string[] = [];

  if (env.emailInboundPollingEnabled) {
    warnings.push(
      'EMAIL_INBOUND_POLLING_ENABLED is true. Keep polling disabled until Graph dry-run and allowlists are manually verified.',
    );
  }

  if (!mailboxConfigured) {
    warnings.push('MICROSOFT_GRAPH_SENDER_MAILBOX is not configured.');
  }

  if (!graphConfigured) {
    warnings.push(
      'Microsoft Graph mail credentials are incomplete; dry-run cannot call Graph.',
    );
  }

  if (allowedSenderCount === 0) {
    warnings.push(
      'EMAIL_INBOUND_ALLOWED_SENDERS is empty. Configure trusted senders before enabling polling.',
    );
  }

  const dryRunSafe =
    graphConfigured && mailboxConfigured && !env.emailInboundPollingEnabled;

  return {
    mailboxConfigured,
    mailbox: mailboxConfigured ? env.microsoftGraphSenderMailbox : null,
    credentialSource: env.microsoftMailCredentialSource,
    credentialMode: credentialMode(),
    tenantConfigured: Boolean(env.microsoftMailTenantId),
    clientIdConfigured: Boolean(env.microsoftMailClientId),
    clientSecretConfigured: Boolean(env.microsoftMailClientSecret),
    refreshTokenConfigured: Boolean(env.microsoftGraphRefreshToken),
    graphConfigured,
    pollingEnabled: env.emailInboundPollingEnabled,
    allowedSenderConfigured: allowedSenderCount > 0,
    allowedSenderCount,
    supplierMappingCount,
    dryRunSafe,
    warnings,
    nextAction: dryRunSafe
      ? 'Run the read-only Graph inbox dry-run and inspect candidate unread message summaries before enabling polling.'
      : 'Complete Graph mail settings, keep polling disabled, and configure allowed senders before dry-run signoff.',
  };
}

function normalizeTake(value: number | null | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_DRY_RUN_TAKE;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_DRY_RUN_TAKE);
}

function safeGraphErrorCode(errorText: string): string | null {
  try {
    const payload = JSON.parse(errorText) as {
      error?: { code?: unknown };
    };
    const code = payload.error?.code;

    return typeof code === 'string' && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

function buildGraphReadOnlyError(response: Response, errorText: string): Error {
  const retryAfter = response.headers.get('retry-after');
  const requestId = response.headers.get('request-id');
  const code = safeGraphErrorCode(errorText);
  const parts = [
    `Microsoft Graph read-only request failed with status ${response.status}.`,
  ];

  if (response.status === 429) {
    parts.push('Rate limited by Microsoft Graph.');
  }

  if (retryAfter) {
    parts.push(`retryAfterSeconds=${retryAfter}.`);
  }

  if (code) {
    parts.push(`graphErrorCode=${code}.`);
  }

  if (requestId) {
    parts.push(`requestId=${requestId}.`);
  }

  return new Error(parts.join(' '));
}

async function graphGetJson<T>(
  path: string,
  dependencies: Pick<
    GraphMailDryRunDependencies,
    'fetchImpl' | 'getAccessToken'
  >,
): Promise<T> {
  const accessToken = await dependencies.getAccessToken();
  const response = await dependencies.fetchImpl(
    `https://graph.microsoft.com/v1.0${path}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(env.graphUseImmutableIds ? { Prefer: 'IdType="ImmutableId"' } : {}),
      },
    },
  );

  if (!response.ok) {
    throw buildGraphReadOnlyError(response, await response.text());
  }

  return (await response.json()) as T;
}

function senderAddress(message: GraphDryRunMessage): string | null {
  return (
    message.from?.emailAddress?.address?.trim().toLowerCase() ||
    message.sender?.emailAddress?.address?.trim().toLowerCase() ||
    null
  );
}

function senderDomain(address: string | null): string | null {
  if (!address || !address.includes('@')) {
    return null;
  }

  return address.split('@').pop()?.trim().toLowerCase() || null;
}

function redactedSender(address: string | null): string {
  const domain = senderDomain(address);

  if (domain) {
    return `***@${domain}`;
  }

  return address ? '[redacted sender]' : 'unknown sender';
}

function subjectPreview(subject: string | null | undefined): {
  preview: string;
  truncated: boolean;
} {
  const normalized = (subject ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();

  if (!normalized) {
    return {
      preview: '(no subject)',
      truncated: false,
    };
  }

  if (normalized.length <= SUBJECT_PREVIEW_MAX_LENGTH) {
    return {
      preview: normalized,
      truncated: false,
    };
  }

  return {
    preview: `${normalized.slice(0, SUBJECT_PREVIEW_MAX_LENGTH - 3)}...`,
    truncated: true,
  };
}

export function buildGraphMailDryRunMessageSummary(input: {
  message: GraphDryRunMessage;
  messageIndex: number;
  attachmentCount: number;
}): GraphMailDryRunMessageSummary {
  const address = senderAddress(input.message);
  const domain = senderDomain(address);
  const subject = subjectPreview(input.message.subject);

  return {
    messageIndex: input.messageIndex,
    receivedDateTime: input.message.receivedDateTime ?? null,
    senderDomain: domain,
    senderPreview: redactedSender(address),
    subjectPreview: subject.preview,
    subjectTruncated: subject.truncated,
    hasAttachments: Boolean(input.message.hasAttachments),
    attachmentCount: input.attachmentCount,
  };
}

async function countMessageAttachments(
  messageId: string,
  dependencies: Pick<
    GraphMailDryRunDependencies,
    'fetchImpl' | 'getAccessToken'
  >,
): Promise<number> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  const payload = await graphGetJson<
    GraphListResponse<GraphAttachmentMetadata>
  >(
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$select=id&$top=100`,
    dependencies,
  );

  return Array.isArray(payload.value) ? payload.value.length : 0;
}

export function createGraphMailDryRunService(
  overrides: Partial<GraphMailDryRunDependencies> = {},
) {
  const dependencies: GraphMailDryRunDependencies = {
    fetchImpl: fetch,
    getAccessToken: getMicrosoftGraphAccessToken,
    now: () => new Date(),
    ...overrides,
  };

  return {
    async runDryRun(options?: {
      take?: number;
    }): Promise<GraphMailDryRunResult> {
      const status = getGraphMailPreflightStatus();

      if (!status.graphConfigured || !status.mailboxConfigured) {
        throw new Error(
          'Microsoft Graph mail is not fully configured. Set tenant/client credentials, a sender mailbox, and either a client secret or refresh token before running read-only dry-run.',
        );
      }

      if (status.pollingEnabled) {
        throw new Error(
          'EMAIL_INBOUND_POLLING_ENABLED is true. Disable polling before running the read-only Graph inbox dry-run.',
        );
      }

      const take = normalizeTake(options?.take);
      const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
      const payload = await graphGetJson<GraphListResponse<GraphDryRunMessage>>(
        `/users/${mailbox}/mailFolders/inbox/messages?$select=id,isRead,subject,receivedDateTime,from,sender,hasAttachments&$filter=isRead eq false&$orderby=receivedDateTime asc&$top=${take}`,
        dependencies,
      );
      const messages = Array.isArray(payload.value) ? payload.value : [];
      const summaries: GraphMailDryRunMessageSummary[] = [];

      for (const [index, message] of messages.entries()) {
        const attachmentCount =
          message.id && message.hasAttachments
            ? await countMessageAttachments(message.id, dependencies)
            : 0;

        summaries.push(
          buildGraphMailDryRunMessageSummary({
            message,
            messageIndex: index + 1,
            attachmentCount,
          }),
        );
      }

      return {
        generatedAt: dependencies.now().toISOString(),
        liveReadOnlyGraphCall: true,
        mailbox: env.microsoftGraphSenderMailbox,
        requestedTake: take,
        messageCount: summaries.length,
        messages: summaries,
        safety: {
          markedRead: false,
          ingested: false,
          persistedContent: false,
          downloadedAttachmentContent: false,
          calledOpenAi: false,
          calledTelegram: false,
          sentEmail: false,
        },
      };
    },
  };
}

export const graphMailDryRunService = createGraphMailDryRunService();
