import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { getMicrosoftGraphAccessToken, isMicrosoftGraphConfigured } from './graph';
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
  isInline?: boolean | null;
  contentBytes?: string | null;
};

type GraphListResponse<T> = {
  value?: T[];
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
    message.body?.contentType?.toLowerCase() === 'html' ? stripHtml(bodyContent) : bodyContent;

  return {
    messageId: message.internetMessageId?.trim() || message.id,
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: message.id,
    conversationId: message.conversationId?.trim() || null,
    from,
    fromName: message.from?.emailAddress?.name?.trim() || null,
    subject: message.subject?.trim() || '',
    bodyText,
    rawHtml: message.body?.contentType?.toLowerCase() === 'html' ? bodyContent : null,
    receivedAt:
      message.receivedDateTime && !Number.isNaN(new Date(message.receivedDateTime).getTime())
        ? new Date(message.receivedDateTime)
        : null,
    attachments: [],
  };
}

async function graphRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getMicrosoftGraphAccessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Microsoft Graph request failed with status ${response.status}. ${errorText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function listUnreadInboxMessages(): Promise<GraphMessage[]> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  const query =
    "/mailFolders/inbox/messages?$select=id,isRead,subject,internetMessageId,conversationId,receivedDateTime,from,body,hasAttachments" +
    "&$filter=isRead eq false&$orderby=receivedDateTime asc&$top=10";

  const payload = await graphRequest<GraphListResponse<GraphMessage>>(`/users/${mailbox}${query}`);
  return Array.isArray(payload.value) ? payload.value : [];
}

async function listAttachments(messageId: string): Promise<GraphAttachment[]> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  const payload = await graphRequest<GraphListResponse<GraphAttachment>>(
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$top=20`,
  );

  return Array.isArray(payload.value) ? payload.value : [];
}

async function markMessageRead(messageId: string): Promise<void> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  await graphRequest<void>(`/users/${mailbox}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      isRead: true,
    }),
  });
}

async function processMessage(
  message: GraphMessage,
  dependencies: EmailInboundPollingDependencies,
): Promise<void> {
  if (!message.id) {
    dependencies.logger.warn('Email inbox polling skipped malformed Graph message', {
      reason: 'missing_graph_message_id',
      internetMessageId: message.internetMessageId ?? null,
      subject: message.subject ?? null,
    });
    return;
  }

  const inboundMessage = toInboundMessage(message);

  if (!inboundMessage) {
    dependencies.logger.warn('Email inbox polling skipped malformed Graph message', {
      reason: 'missing_sender_or_unusable_message_shape',
      externalMessageId: message.id,
      internetMessageId: message.internetMessageId ?? null,
      subject: message.subject ?? null,
    });
    await dependencies.markMessageRead(message.id);
    return;
  }

  const existingInboundEmail = await dependencies.lookupExistingInboundEmail(message.id);
  if (existingInboundEmail && existingInboundEmail.processingStatus !== 'RECEIVED') {
    dependencies.logger.info('Email inbox polling skipped already-processed message replay', {
      externalMessageId: message.id,
      inboundEmailId: existingInboundEmail.id,
      processingStatus: existingInboundEmail.processingStatus,
      from: inboundMessage.from,
    });
    await dependencies.markMessageRead(message.id);
    return;
  }

  if (message.hasAttachments) {
    const attachments = await dependencies.listAttachments(message.id);
    inboundMessage.attachments = attachments
      .filter((attachment) => attachment['@odata.type'] === '#microsoft.graph.fileAttachment')
      .map((attachment) => ({
        fileName: attachment.name ?? null,
        mimeType: attachment.contentType ?? null,
        content: attachment.contentBytes ?? null,
        size: attachment.size ?? null,
        contentId: attachment.contentId ?? null,
        disposition: attachment.isInline ? 'inline' : 'attachment',
      }));
  }

  const result = await dependencies.ingestInboundEmail(inboundMessage);

  dependencies.logger.info('Email inbox polling handled message', {
    messageId: inboundMessage.messageId ?? message.id,
    externalMessageId: message.id,
    from: inboundMessage.from,
    ignored: result.ignored,
    itemCount: result.items.length,
    triageStatuses: result.items.map((item) => item.triageStatus ?? null),
    processingStatuses: result.items.map((item) => item.processingStatus),
  });

  await dependencies.markMessageRead(message.id);
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

  async function pollOnce(scheduleNext = true) {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;

    try {
      const messages = await dependencies.listUnreadInboxMessages();

      for (const message of messages) {
        try {
          await processMessage(message, dependencies);
        } catch (error) {
          dependencies.logger.error('Email inbox polling failed for one message and continued', {
            error: error instanceof Error ? error.message : 'Unknown email inbox polling message error.',
            externalMessageId: message.id ?? null,
            internetMessageId: message.internetMessageId ?? null,
            from: message.from?.emailAddress?.address?.trim().toLowerCase() ?? null,
            subject: message.subject ?? null,
          });
        }
      }
    } catch (error) {
      dependencies.logger.error('Email inbox polling failed', {
        error: error instanceof Error ? error.message : 'Unknown email inbox polling error.',
      });
    } finally {
      inFlight = false;

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

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
