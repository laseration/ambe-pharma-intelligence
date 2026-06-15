import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import {
  buildCorrelationId,
  correlationLogMeta,
} from '../observability/correlation';
import {
  configurePollingWorkerStatus,
  markPollingRunFinished,
  markPollingRunStarted,
  markPollingWorkerStarted,
  markPollingWorkerStopped,
  recordPollingWorkerError,
  sanitizePollingErrorMessage,
} from '../polling/status';
import {
  getMicrosoftGraphAccessToken,
  isMicrosoftGraphConfigured,
} from './graph';
import { ingestInboundEmail } from './inbound/service';
import type { EmailInboundMessage } from './inbound/types';

type GraphEmailAddress = {
  address?: string | null;
  name?: string | null;
};

type GraphRecipient = {
  emailAddress?: GraphEmailAddress | null;
};

type GraphMessage = {
  id?: string;
  isRead?: boolean;
  subject?: string | null;
  internetMessageId?: string | null;
  conversationId?: string | null;
  receivedDateTime?: string | null;
  from?: GraphRecipient | null;
  sender?: GraphRecipient | null;
  replyTo?: GraphRecipient[] | null;
  internetMessageHeaders?: Array<{
    name?: string | null;
    value?: string | null;
  }> | null;
  body?: {
    contentType?: string | null;
    content?: string | null;
  } | null;
  hasAttachments?: boolean;
};

type GraphAttachment = {
  '@odata.type'?: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  contentId?: string | null;
  id?: string | null;
  isInline?: boolean | null;
  contentBytes?: string | null;
};

type GraphListResponse<T> = {
  value?: T[];
  '@odata.nextLink'?: string | null;
};

type EmailInboundPollingDependencies = {
  ingestInboundEmail: typeof ingestInboundEmail;
  listAttachments: (messageId: string) => Promise<GraphAttachment[]>;
  listUnreadInboxMessages: () => Promise<GraphMessage[]>;
  logger: Pick<typeof logger, 'error' | 'info' | 'warn'>;
  markMessageRead: (messageId: string) => Promise<void>;
  lookupExistingInboundEmail: (
    externalMessageId: string,
  ) => Promise<{ id: string; processingStatus: string } | null>;
};

type EmailPollingMessageOutcome = 'processed' | 'skipped' | 'duplicate';

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

function buildGraphRequestError(response: Response, errorText: string): Error {
  const retryAfter = response.headers.get('retry-after');
  const requestId = response.headers.get('request-id');
  const code = safeGraphErrorCode(errorText);
  const parts = [
    `Microsoft Graph request failed with status ${response.status}.`,
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

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toInboundMessage(message: GraphMessage): EmailInboundMessage | null {
  const from = message.from?.emailAddress?.address?.trim().toLowerCase();

  if (!from || !message.id) {
    return null;
  }

  const bodyContent = message.body?.content ?? '';
  const bodyText =
    message.body?.contentType?.toLowerCase() === 'html'
      ? stripHtml(bodyContent)
      : bodyContent;

  return {
    messageId: message.internetMessageId?.trim() || message.id,
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: message.id,
    conversationId: message.conversationId?.trim() || null,
    from,
    fromName: message.from?.emailAddress?.name?.trim() || null,
    sender: message.sender?.emailAddress?.address?.trim().toLowerCase() || null,
    senderName: message.sender?.emailAddress?.name?.trim() || null,
    replyTo:
      message.replyTo
        ?.map((recipient) => ({
          email: recipient.emailAddress?.address?.trim().toLowerCase() || '',
          name: recipient.emailAddress?.name?.trim() || null,
        }))
        .filter((recipient) => recipient.email) ?? null,
    internetMessageHeaders:
      message.internetMessageHeaders
        ?.map((header) => ({
          name: header.name?.trim() || '',
          value: header.value?.trim() || '',
        }))
        .filter((header) => header.name && header.value) ?? null,
    subject: message.subject?.trim() || '',
    bodyText,
    rawHtml:
      message.body?.contentType?.toLowerCase() === 'html' ? bodyContent : null,
    receivedAt:
      message.receivedDateTime &&
      !Number.isNaN(new Date(message.receivedDateTime).getTime())
        ? new Date(message.receivedDateTime)
        : null,
    attachments: [],
  };
}

// --- Microsoft Graph HTTP plumbing: pagination + bounded retry --------------

// Bounded pagination caps (compile-time constants, NOT runtime config): cap how
// many Graph pages we follow per poll so a very large — or pathologically
// looping — inbox/attachment list can never trigger an unbounded request
// fan-out. Anything beyond the cap is picked up on the next poll.
export const GRAPH_INBOX_MAX_PAGES = 10; // x $top=10  => <= 100 messages / poll
export const GRAPH_ATTACHMENT_MAX_PAGES = 10; // x $top=20 => <= 200 attachments

// Bounded retry/backoff for transient Graph failures. We retry only 429 (rate
// limited) and 5xx (server) responses, a capped number of times, with a capped
// per-attempt delay — never an unbounded wait.
export const GRAPH_REQUEST_MAX_RETRIES = 3;
const GRAPH_RETRY_BASE_DELAY_MS = 500;
const GRAPH_RETRY_MAX_DELAY_MS = 20_000;

export type GraphHttpDeps = {
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  logger: Pick<typeof logger, 'warn'>;
};

const defaultGraphHttpDeps: GraphHttpDeps = {
  fetchImpl: (input, init) => fetch(input, init),
  getAccessToken: () => getMicrosoftGraphAccessToken(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger,
};

function isRetryableGraphStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, GRAPH_RETRY_MAX_DELAY_MS);
  }

  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), GRAPH_RETRY_MAX_DELAY_MS);
  }

  return null;
}

function graphBackoffDelayMs(attempt: number): number {
  return Math.min(
    GRAPH_RETRY_BASE_DELAY_MS * 2 ** attempt,
    GRAPH_RETRY_MAX_DELAY_MS,
  );
}

// Defense-in-depth against SSRF / token exfiltration: graphRequestUrl attaches a
// Microsoft Graph bearer token to whatever absolute URL it is given, and one of
// those URLs is the server-supplied `@odata.nextLink`. Before issuing any
// request we require the URL to be https, on graph.microsoft.com, under
// `/v1.0/` — so a tampered or hostile nextLink can never cause the access token
// to be sent elsewhere. The thrown error is sanitized (protocol + host only,
// never the token or the full URL/query).
function assertSafeGraphUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'Refusing to call a Microsoft Graph URL that could not be parsed.',
    );
  }

  const isSafe =
    parsed.protocol === 'https:' &&
    parsed.hostname === 'graph.microsoft.com' &&
    parsed.pathname.startsWith('/v1.0/');

  if (!isSafe) {
    throw new Error(
      `Refusing to call a non-Microsoft-Graph URL: ${parsed.protocol}//${parsed.hostname}`,
    );
  }
}

// Performs a single Graph request against an absolute URL (the API base URL for
// path-based calls, or a server-issued `@odata.nextLink`), with bounded
// retry/backoff for transient (429/5xx) failures. The URL is validated up front
// (see assertSafeGraphUrl) before any token fetch or network call. Errors stay
// sanitized via buildGraphRequestError; access tokens are never logged.
async function graphRequestUrl<T>(
  url: string,
  init: RequestInit | undefined,
  deps: GraphHttpDeps,
): Promise<T> {
  assertSafeGraphUrl(url);

  let attempt = 0;

  while (attempt <= GRAPH_REQUEST_MAX_RETRIES) {
    const accessToken = await deps.getAccessToken();
    const response = await deps.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(env.graphUseImmutableIds ? { Prefer: 'IdType="ImmutableId"' } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    }

    const errorText = await response.text();
    const canRetry =
      isRetryableGraphStatus(response.status) &&
      attempt < GRAPH_REQUEST_MAX_RETRIES;

    if (!canRetry) {
      throw buildGraphRequestError(response, errorText);
    }

    const retryAfterMs =
      response.status === 429
        ? parseRetryAfterMs(response.headers.get('retry-after'))
        : null;
    const delayMs = retryAfterMs ?? graphBackoffDelayMs(attempt);

    deps.logger.warn(
      'Microsoft Graph request hit a transient failure; retrying after backoff',
      {
        status: response.status,
        rateLimited: response.status === 429,
        attempt: attempt + 1,
        maxRetries: GRAPH_REQUEST_MAX_RETRIES,
        delayMs,
      },
    );

    await deps.sleep(delayMs);
    attempt += 1;
  }

  // Unreachable: the loop returns on success, throws on a non-retryable failure,
  // and throws on the final attempt. Present only to satisfy the type checker.
  throw new Error('Microsoft Graph request retry loop exited unexpectedly.');
}

async function graphRequest<T>(
  path: string,
  init?: RequestInit,
  deps: GraphHttpDeps = defaultGraphHttpDeps,
): Promise<T> {
  return graphRequestUrl<T>(
    `https://graph.microsoft.com/v1.0${path}`,
    init,
    deps,
  );
}

export async function listUnreadInboxMessages(
  deps: GraphHttpDeps = defaultGraphHttpDeps,
): Promise<GraphMessage[]> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  const query =
    '/mailFolders/inbox/messages?$select=id,isRead,subject,internetMessageId,conversationId,receivedDateTime,from,sender,replyTo,internetMessageHeaders,body,hasAttachments' +
    '&$filter=isRead eq false&$orderby=receivedDateTime asc&$top=10';

  // Follow @odata.nextLink (an absolute Graph URL) to page through all unread
  // messages, preserving the receivedDateTime-ascending order (the orderby and
  // filter are carried in the server-issued skiptoken), up to a bounded cap.
  const messages: GraphMessage[] = [];
  let nextLink: string | null = `/users/${mailbox}${query}`;
  let isFirstPage = true;
  let pages = 0;

  while (nextLink !== null && pages < GRAPH_INBOX_MAX_PAGES) {
    const requestUrl: string = nextLink;
    const payload = isFirstPage
      ? await graphRequest<GraphListResponse<GraphMessage>>(
          requestUrl,
          undefined,
          deps,
        )
      : await graphRequestUrl<GraphListResponse<GraphMessage>>(
          requestUrl,
          undefined,
          deps,
        );
    isFirstPage = false;

    if (Array.isArray(payload.value)) {
      messages.push(...payload.value);
    }

    nextLink = payload['@odata.nextLink'] ?? null;
    pages += 1;
  }

  if (nextLink !== null) {
    deps.logger.warn(
      'Microsoft Graph inbox pagination hit the page cap; remaining unread messages will be processed on the next poll',
      {
        pages,
        messagesFetched: messages.length,
      },
    );
  }

  return messages;
}

export async function listAttachments(
  messageId: string,
  deps: GraphHttpDeps = defaultGraphHttpDeps,
): Promise<GraphAttachment[]> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);

  // Page through all attachments via @odata.nextLink, up to a bounded cap. File
  // vs. inline filtering is applied later (in processMessage), so this returns
  // every attachment exactly as before — just no longer truncated at one page.
  const attachments: GraphAttachment[] = [];
  let nextLink: string | null =
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$top=20`;
  let isFirstPage = true;
  let pages = 0;

  while (nextLink !== null && pages < GRAPH_ATTACHMENT_MAX_PAGES) {
    const requestUrl: string = nextLink;
    const payload = isFirstPage
      ? await graphRequest<GraphListResponse<GraphAttachment>>(
          requestUrl,
          undefined,
          deps,
        )
      : await graphRequestUrl<GraphListResponse<GraphAttachment>>(
          requestUrl,
          undefined,
          deps,
        );
    isFirstPage = false;

    if (Array.isArray(payload.value)) {
      attachments.push(...payload.value);
    }

    nextLink = payload['@odata.nextLink'] ?? null;
    pages += 1;
  }

  if (nextLink !== null) {
    deps.logger.warn(
      'Microsoft Graph attachment pagination hit the page cap; some attachments were not fetched',
      {
        messageId,
        pages,
        attachmentsFetched: attachments.length,
      },
    );
  }

  return attachments;
}

export async function markMessageRead(
  messageId: string,
  deps: GraphHttpDeps = defaultGraphHttpDeps,
): Promise<void> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  await graphRequest<void>(
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        isRead: true,
      }),
    },
    deps,
  );
}

async function processMessage(
  message: GraphMessage,
  dependencies: EmailInboundPollingDependencies,
): Promise<EmailPollingMessageOutcome> {
  const correlation = {
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: message.id ?? null,
    messageId: message.internetMessageId ?? null,
  };

  if (!message.id) {
    dependencies.logger.warn(
      'Email inbox polling skipped malformed Graph message',
      {
        ...correlationLogMeta(correlation),
        reason: 'missing_graph_message_id',
        internetMessageId: message.internetMessageId ?? null,
        subject: message.subject ?? null,
      },
    );
    return 'skipped';
  }

  const inboundMessage = toInboundMessage(message);

  if (!inboundMessage) {
    dependencies.logger.warn(
      'Email inbox polling skipped malformed Graph message',
      {
        ...correlationLogMeta(correlation),
        reason: 'missing_sender_or_unusable_message_shape',
        externalMessageId: message.id,
        internetMessageId: message.internetMessageId ?? null,
        subject: message.subject ?? null,
      },
    );
    await dependencies.markMessageRead(message.id);
    return 'skipped';
  }

  const existingInboundEmail = await dependencies.lookupExistingInboundEmail(
    message.id,
  );
  if (
    existingInboundEmail &&
    existingInboundEmail.processingStatus !== 'RECEIVED'
  ) {
    dependencies.logger.info(
      'Email inbox polling skipped already-processed message replay',
      {
        ...correlationLogMeta(correlation),
        externalMessageId: message.id,
        inboundEmailId: existingInboundEmail.id,
        processingStatus: existingInboundEmail.processingStatus,
        from: inboundMessage.from,
      },
    );
    await dependencies.markMessageRead(message.id);
    return 'duplicate';
  }

  if (message.hasAttachments) {
    const attachments = await dependencies.listAttachments(message.id);
    inboundMessage.attachments = attachments
      .filter(
        (attachment) =>
          attachment['@odata.type'] === '#microsoft.graph.fileAttachment',
      )
      .map((attachment) => ({
        fileName: attachment.name ?? null,
        mimeType: attachment.contentType ?? null,
        content: attachment.contentBytes ?? null,
        size: attachment.size ?? null,
        contentId: attachment.contentId ?? null,
        graphAttachmentId: attachment.id ?? null,
        disposition: attachment.isInline ? 'inline' : 'attachment',
      }));
  }

  const result = await dependencies.ingestInboundEmail(inboundMessage);

  // Durability guard: only mark the Graph message read once durable staging is
  // confirmed. A staging/DB failure (or any unexpectedly missing signal) leaves
  // the message unread so the next poll can retry it, instead of marking it read
  // and permanently losing it (polling fetches unread messages only). Throwing
  // routes this through the existing per-message error handling, which records
  // the failure and increments itemsFailed without calling markMessageRead.
  if (result.durablyStaged !== true) {
    throw new Error(
      result.stagingError
        ? `Inbound email was not durably staged; leaving message unread for retry. ${result.stagingError}`
        : 'Inbound email was not durably staged; leaving message unread for retry.',
    );
  }

  dependencies.logger.info('Email inbox polling handled message', {
    correlationId: buildCorrelationId(correlation),
    messageId: inboundMessage.messageId ?? message.id,
    externalMessageId: message.id,
    from: inboundMessage.from,
    ignored: result.ignored,
    itemCount: result.items.length,
    triageStatuses: result.items.map((item) => item.triageStatus ?? null),
    processingStatuses: result.items.map((item) => item.processingStatus),
  });

  await dependencies.markMessageRead(message.id);
  return 'processed';
}

export function isEmailInboundPollingActive(): boolean {
  return env.emailInboundPollingEnabled && isMicrosoftGraphConfigured();
}

export function createEmailInboundPollingWorker(
  overrides?: Partial<EmailInboundPollingDependencies>,
) {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let inFlight = false;
  const dependencies: EmailInboundPollingDependencies = {
    ingestInboundEmail,
    listAttachments,
    listUnreadInboxMessages,
    logger,
    markMessageRead,
    lookupExistingInboundEmail: async (externalMessageId) =>
      db.inboundEmail.findUnique({
        where: {
          sourceSystem_externalMessageId: {
            sourceSystem: 'MICROSOFT_GRAPH',
            externalMessageId,
          },
        },
        select: {
          id: true,
          processingStatus: true,
        },
      }),
    ...overrides,
  };
  configurePollingWorkerStatus('email-inbound', {
    enabled: env.emailInboundPollingEnabled,
    configured: isMicrosoftGraphConfigured(),
    active: isEmailInboundPollingActive(),
    intervalMs: env.emailInboundPollingIntervalMs,
  });

  async function pollOnce(scheduleNext = true) {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    markPollingRunStarted('email-inbound');
    let itemsSeen = 0;
    let itemsProcessed = 0;
    let itemsSkipped = 0;
    let duplicateItemsSkipped = 0;
    let itemsFailed = 0;

    try {
      const messages = await dependencies.listUnreadInboxMessages();
      itemsSeen = messages.length;

      for (const message of messages) {
        try {
          const outcome = await processMessage(message, dependencies);
          if (outcome === 'processed') {
            itemsProcessed += 1;
          } else if (outcome === 'duplicate') {
            duplicateItemsSkipped += 1;
            itemsSkipped += 1;
          } else {
            itemsSkipped += 1;
          }
        } catch (error) {
          itemsFailed += 1;
          recordPollingWorkerError('email-inbound', error);
          dependencies.logger.error(
            'Email inbox polling failed for one message and continued',
            {
              ...correlationLogMeta({
                sourceSystem: 'MICROSOFT_GRAPH',
                externalMessageId: message.id ?? null,
                messageId: message.internetMessageId ?? null,
              }),
              error:
                error instanceof Error
                  ? sanitizePollingErrorMessage(error)
                  : 'Unknown email inbox polling message error.',
              externalMessageId: message.id ?? null,
              internetMessageId: message.internetMessageId ?? null,
              from:
                message.from?.emailAddress?.address?.trim().toLowerCase() ??
                null,
              subject: message.subject ?? null,
            },
          );
        }
      }
    } catch (error) {
      itemsFailed = Math.max(itemsFailed, 1);
      recordPollingWorkerError('email-inbound', error);
      dependencies.logger.error('Email inbox polling failed', {
        error:
          error instanceof Error
            ? sanitizePollingErrorMessage(error)
            : 'Unknown email inbox polling error.',
      });
    } finally {
      inFlight = false;
      markPollingRunFinished('email-inbound', {
        itemsSeen,
        itemsProcessed,
        itemsSkipped,
        itemsFailed,
        duplicateItemsSkipped,
      });

      if (scheduleNext && !stopped) {
        timer = setTimeout(() => {
          void pollOnce();
        }, env.emailInboundPollingIntervalMs);
      }
    }
  }

  return {
    start() {
      if (stopped === false && timer) {
        return;
      }

      stopped = false;
      configurePollingWorkerStatus('email-inbound', {
        enabled: env.emailInboundPollingEnabled,
        configured: isMicrosoftGraphConfigured(),
        active: isEmailInboundPollingActive(),
        intervalMs: env.emailInboundPollingIntervalMs,
      });
      markPollingWorkerStarted('email-inbound');

      dependencies.logger.info('Email inbox polling started', {
        mailbox: env.microsoftGraphSenderMailbox,
        intervalMs: env.emailInboundPollingIntervalMs,
      });

      void pollOnce();
    },
    runOnce() {
      return pollOnce(false);
    },
    stop() {
      stopped = true;
      markPollingWorkerStopped('email-inbound');

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
