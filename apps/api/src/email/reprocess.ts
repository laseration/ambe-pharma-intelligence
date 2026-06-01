import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { buildCorrelationId } from '../observability/correlation';
import {
  getSideEffectPolicy,
  type SideEffectOperationName,
  type SideEffectPolicy,
} from '../safety/sideEffectPolicy';
import { extractAttachmentText } from './attachmentTextExtraction';
import { classifyEmailRoute } from './classification';
import {
  getMicrosoftGraphAccessToken,
  isMicrosoftGraphConfigured,
} from './graph';
import { normalizeEmailAttachment } from './inbound/helpers';
import { createEmailInboundService } from './inbound/service';
import { stageInboundEmailSafely } from './inbound/pipeline';
import type {
  EmailAttachmentInput,
  EmailInboundMessage,
  EmailInboundResult,
} from './inbound/types';

export type ReprocessGraphEmailAddress = {
  address?: string | null;
  name?: string | null;
};

export type ReprocessGraphRecipient = {
  emailAddress?: ReprocessGraphEmailAddress | null;
};

export type ReprocessGraphMessage = {
  id?: string;
  isRead?: boolean;
  subject?: string | null;
  internetMessageId?: string | null;
  conversationId?: string | null;
  receivedDateTime?: string | null;
  from?: ReprocessGraphRecipient | null;
  body?: {
    contentType?: string | null;
    content?: string | null;
  } | null;
  hasAttachments?: boolean;
};

export type ReprocessGraphAttachment = {
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

export type EmailReprocessOptions = {
  subjectContains?: string;
  from?: string;
  since?: Date;
  limit: number;
  includeRead: boolean;
  unreadOnly: boolean;
  dryRun: boolean;
  forceAccountOpening: boolean;
};

export type EmailReprocessAction =
  | 'DRY_RUN_CREATE'
  | 'DRY_RUN_REFRESH'
  | 'SKIPPED'
  | 'CREATED'
  | 'UPDATED'
  | 'FAILED';

export type EmailReprocessResult = {
  action: EmailReprocessAction;
  externalMessageId: string | null;
  internetMessageId: string | null;
  from: string | null;
  subject: string | null;
  receivedAt: string | null;
  isRead: boolean | null;
  existingInboundEmailId: string | null;
  existingProcessingStatus: string | null;
  correlationId: string | null;
  sideEffectOperation: SideEffectOperationName | null;
  sideEffectPolicy: SideEffectPolicy | null;
  accountOpeningCandidate: boolean;
  classifierVersion: string | null;
  route: string | null;
  confidence: string | null;
  evidenceUsed: string[];
  matchedTerms: string[];
  classificationReason: string | null;
  attachmentFileNames: string[];
  note: string;
  itemCount: number;
  error?: string;
};

export type EmailReprocessDependencies = {
  listMessages: (
    options: Pick<
      EmailReprocessOptions,
      'includeRead' | 'limit' | 'since' | 'unreadOnly'
    >,
  ) => Promise<ReprocessGraphMessage[]>;
  listAttachments: (messageId: string) => Promise<ReprocessGraphAttachment[]>;
  lookupExistingInboundEmail: (
    externalMessageId: string,
  ) => Promise<{ id: string; processingStatus: string } | null>;
  ingestAccountOpeningMessage: (
    message: EmailInboundMessage,
  ) => Promise<EmailInboundResult>;
  extractAttachmentText: typeof extractAttachmentText;
  logger: Pick<typeof logger, 'error' | 'info' | 'warn'>;
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

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 10;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 50);
}

function parseReceivedAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeFilterText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function messageSender(message: ReprocessGraphMessage): string | null {
  return message.from?.emailAddress?.address?.trim().toLowerCase() || null;
}

function messageBodyText(message: ReprocessGraphMessage): string {
  const content = message.body?.content ?? '';
  return message.body?.contentType?.toLowerCase() === 'html'
    ? stripHtml(content)
    : content;
}

function messageMatchesFilters(
  message: ReprocessGraphMessage,
  options: EmailReprocessOptions,
): boolean {
  const subjectFilter = normalizeFilterText(options.subjectContains);
  const fromFilter = normalizeFilterText(options.from);
  const subject = normalizeFilterText(message.subject);
  const sender = normalizeFilterText(messageSender(message));
  const receivedAt = parseReceivedAt(message.receivedDateTime);

  if (subjectFilter && !subject.includes(subjectFilter)) {
    return false;
  }

  if (
    fromFilter &&
    sender !== fromFilter &&
    !sender.endsWith(`@${fromFilter}`)
  ) {
    return false;
  }

  if (options.since && (!receivedAt || receivedAt < options.since)) {
    return false;
  }

  if (options.unreadOnly && message.isRead === true) {
    return false;
  }

  return true;
}

function graphAttachmentToEmailAttachment(
  attachment: ReprocessGraphAttachment,
): EmailAttachmentInput | null {
  if (attachment['@odata.type'] !== '#microsoft.graph.fileAttachment') {
    return null;
  }

  return {
    fileName: attachment.name ?? null,
    mimeType: attachment.contentType ?? null,
    content: attachment.contentBytes ?? null,
    size: attachment.size ?? null,
    contentId: attachment.contentId ?? null,
    disposition: attachment.isInline ? 'inline' : 'attachment',
  };
}

async function extractAccountOpeningAttachmentTexts(
  attachments: ReprocessGraphAttachment[],
  extractText: typeof extractAttachmentText,
): Promise<string[]> {
  const extractedTexts: string[] = [];

  for (const attachment of attachments) {
    const emailAttachment = graphAttachmentToEmailAttachment(attachment);

    if (!emailAttachment) {
      continue;
    }

    const normalizedAttachment = normalizeEmailAttachment(emailAttachment);

    if (
      normalizedAttachment.fileType !== 'PDF' &&
      normalizedAttachment.fileType !== 'IMAGE'
    ) {
      continue;
    }

    const extraction = await extractText(normalizedAttachment);
    const text = extraction?.text?.trim();

    if (text) {
      extractedTexts.push(text);
    }
  }

  return extractedTexts;
}

function toInboundMessage(
  message: ReprocessGraphMessage,
  attachments: ReprocessGraphAttachment[],
): EmailInboundMessage | null {
  const from = messageSender(message);

  if (!from || !message.id) {
    return null;
  }

  return {
    messageId: message.internetMessageId?.trim() || message.id,
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: message.id,
    conversationId: message.conversationId?.trim() || null,
    from,
    fromName: message.from?.emailAddress?.name?.trim() || null,
    subject: message.subject?.trim() || '',
    bodyText: messageBodyText(message),
    rawHtml:
      message.body?.contentType?.toLowerCase() === 'html'
        ? (message.body.content ?? null)
        : null,
    receivedAt: parseReceivedAt(message.receivedDateTime),
    attachments: attachments
      .map(graphAttachmentToEmailAttachment)
      .filter((attachment): attachment is EmailAttachmentInput =>
        Boolean(attachment),
      ),
  };
}

function baseResult(input: {
  action: EmailReprocessAction;
  message: ReprocessGraphMessage;
  existingInboundEmail: { id: string; processingStatus: string } | null;
  accountOpeningCandidate: boolean;
  classifierVersion?: string | null;
  route?: string | null;
  confidence?: string | null;
  evidenceUsed?: string[];
  matchedTerms: string[];
  classificationReason?: string | null;
  sideEffectOperation?: SideEffectOperationName | null;
  attachmentFileNames: string[];
  note: string;
  itemCount?: number;
  error?: string;
}): EmailReprocessResult {
  return {
    action: input.action,
    externalMessageId: input.message.id ?? null,
    internetMessageId: input.message.internetMessageId ?? null,
    from: messageSender(input.message),
    subject: input.message.subject ?? null,
    receivedAt: input.message.receivedDateTime ?? null,
    isRead:
      typeof input.message.isRead === 'boolean' ? input.message.isRead : null,
    existingInboundEmailId: input.existingInboundEmail?.id ?? null,
    existingProcessingStatus:
      input.existingInboundEmail?.processingStatus ?? null,
    correlationId: buildCorrelationId({
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: input.message.id ?? null,
      messageId: input.message.internetMessageId ?? null,
    }),
    sideEffectOperation: input.sideEffectOperation ?? null,
    sideEffectPolicy: input.sideEffectOperation
      ? getSideEffectPolicy(input.sideEffectOperation)
      : null,
    accountOpeningCandidate: input.accountOpeningCandidate,
    classifierVersion: input.classifierVersion ?? null,
    route: input.route ?? null,
    confidence: input.confidence ?? null,
    evidenceUsed: input.evidenceUsed ?? [],
    matchedTerms: input.matchedTerms,
    classificationReason: input.classificationReason ?? null,
    attachmentFileNames: input.attachmentFileNames,
    note: input.note,
    itemCount: input.itemCount ?? 0,
    ...(input.error ? { error: input.error } : {}),
  };
}

async function graphRequest<T>(path: string): Promise<T> {
  const accessToken = await getMicrosoftGraphAccessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Microsoft Graph request failed with status ${response.status}. ${errorText}`,
    );
  }

  return (await response.json()) as T;
}

function buildMessageListPath(
  options: Pick<
    EmailReprocessOptions,
    'includeRead' | 'limit' | 'since' | 'unreadOnly'
  >,
): string {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  const filters: string[] = [];

  if (options.unreadOnly && !options.includeRead) {
    filters.push('isRead eq false');
  }

  if (options.since) {
    filters.push(`receivedDateTime ge ${options.since.toISOString()}`);
  }

  const query = new URLSearchParams({
    $select:
      'id,isRead,subject,internetMessageId,conversationId,receivedDateTime,from,body,hasAttachments',
    $orderby: 'receivedDateTime desc',
    $top: String(Math.min(Math.max(options.limit * 5, options.limit), 100)),
  });

  if (filters.length > 0) {
    query.set('$filter', filters.join(' and '));
  }

  return `/users/${mailbox}/mailFolders/inbox/messages?${query.toString()}`;
}

async function listGraphMessages(
  options: Pick<
    EmailReprocessOptions,
    'includeRead' | 'limit' | 'since' | 'unreadOnly'
  >,
): Promise<ReprocessGraphMessage[]> {
  if (!isMicrosoftGraphConfigured()) {
    throw new Error(
      'Microsoft Graph mail is not configured. Set mail credentials and MICROSOFT_GRAPH_SENDER_MAILBOX.',
    );
  }

  const payload = await graphRequest<GraphListResponse<ReprocessGraphMessage>>(
    buildMessageListPath(options),
  );
  return Array.isArray(payload.value) ? payload.value : [];
}

async function listGraphAttachments(
  messageId: string,
): Promise<ReprocessGraphAttachment[]> {
  const mailbox = encodeURIComponent(env.microsoftGraphSenderMailbox);
  const payload = await graphRequest<
    GraphListResponse<ReprocessGraphAttachment>
  >(
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$top=20`,
  );
  return Array.isArray(payload.value) ? payload.value : [];
}

async function ingestAccountOpeningMessageSafely(
  message: EmailInboundMessage,
): Promise<EmailInboundResult> {
  const blockedImport = async () => {
    throw new Error(
      'Operator account-opening reprocess does not run commercial imports.',
    );
  };
  const service = createEmailInboundService({
    importSupplierPriceList: blockedImport,
    importInventory: blockedImport,
    importSales: blockedImport,
  });
  const result = await service.ingestMessage(message);

  if (!result.items.some((item) => item.accountOpeningCase)) {
    return result;
  }

  await stageInboundEmailSafely(message, result);
  return result;
}

export function createDefaultEmailReprocessDependencies(): EmailReprocessDependencies {
  return {
    listMessages: listGraphMessages,
    listAttachments: listGraphAttachments,
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
    ingestAccountOpeningMessage: ingestAccountOpeningMessageSafely,
    extractAttachmentText,
    logger,
  };
}

export async function reprocessEmailMessages(
  rawOptions: EmailReprocessOptions,
  dependencies = createDefaultEmailReprocessDependencies(),
): Promise<EmailReprocessResult[]> {
  const options = {
    ...rawOptions,
    limit: normalizeLimit(rawOptions.limit),
    unreadOnly: rawOptions.includeRead ? false : rawOptions.unreadOnly,
  };
  const messages = await dependencies.listMessages(options);
  const results: EmailReprocessResult[] = [];

  for (const message of messages) {
    if (results.length >= options.limit) {
      break;
    }

    if (!messageMatchesFilters(message, options)) {
      continue;
    }

    if (!message.id) {
      const result = baseResult({
        action: 'SKIPPED',
        message,
        existingInboundEmail: null,
        accountOpeningCandidate: false,
        matchedTerms: [],
        attachmentFileNames: [],
        note: 'Skipped Graph message without an ID.',
      });
      dependencies.logger.warn('Email reprocess skipped message', result);
      results.push(result);
      continue;
    }

    try {
      const attachments = message.hasAttachments
        ? await dependencies.listAttachments(message.id)
        : [];
      const attachmentFileNames = attachments
        .map((attachment) => attachment.name?.trim())
        .filter((name): name is string => Boolean(name));
      const attachmentTexts = await extractAccountOpeningAttachmentTexts(
        attachments,
        dependencies.extractAttachmentText,
      );
      const routeClassification = classifyEmailRoute({
        subject: message.subject ?? '',
        bodyText: messageBodyText(message),
        attachmentFileNames,
        attachmentTexts,
      });
      const existingInboundEmail =
        await dependencies.lookupExistingInboundEmail(message.id);

      if (!routeClassification.accountOpeningDetected) {
        const result = baseResult({
          action: 'SKIPPED',
          message,
          existingInboundEmail,
          accountOpeningCandidate: false,
          classifierVersion: routeClassification.classifierVersion,
          route: routeClassification.route,
          confidence: routeClassification.confidence,
          evidenceUsed: routeClassification.evidenceUsed,
          matchedTerms: routeClassification.matchedTerms,
          classificationReason: routeClassification.classificationReason,
          attachmentFileNames,
          note: 'Skipped because the message was not an account-opening candidate.',
        });
        dependencies.logger.info('Email reprocess skipped message', result);
        results.push(result);
        continue;
      }

      if (options.dryRun) {
        const result = baseResult({
          action: existingInboundEmail ? 'DRY_RUN_REFRESH' : 'DRY_RUN_CREATE',
          message,
          existingInboundEmail,
          accountOpeningCandidate: true,
          classifierVersion: routeClassification.classifierVersion,
          route: routeClassification.route,
          confidence: routeClassification.confidence,
          evidenceUsed: routeClassification.evidenceUsed,
          matchedTerms: routeClassification.matchedTerms,
          classificationReason: routeClassification.classificationReason,
          attachmentFileNames,
          note: existingInboundEmail
            ? 'Dry run: account-opening message would be force-refreshed.'
            : 'Dry run: account-opening message would be ingested.',
        });
        dependencies.logger.info('Email reprocess dry run result', result);
        results.push(result);
        continue;
      }

      if (existingInboundEmail && !options.forceAccountOpening) {
        const result = baseResult({
          action: 'SKIPPED',
          message,
          existingInboundEmail,
          accountOpeningCandidate: true,
          classifierVersion: routeClassification.classifierVersion,
          route: routeClassification.route,
          confidence: routeClassification.confidence,
          evidenceUsed: routeClassification.evidenceUsed,
          matchedTerms: routeClassification.matchedTerms,
          classificationReason: routeClassification.classificationReason,
          attachmentFileNames,
          note: 'Skipped already-ingested account-opening message. Re-run with --force-account-opening to refresh it.',
        });
        dependencies.logger.info('Email reprocess skipped message', result);
        results.push(result);
        continue;
      }

      const inboundMessage = toInboundMessage(message, attachments);
      if (!inboundMessage) {
        const result = baseResult({
          action: 'SKIPPED',
          message,
          existingInboundEmail,
          accountOpeningCandidate: true,
          classifierVersion: routeClassification.classifierVersion,
          route: routeClassification.route,
          confidence: routeClassification.confidence,
          evidenceUsed: routeClassification.evidenceUsed,
          matchedTerms: routeClassification.matchedTerms,
          classificationReason: routeClassification.classificationReason,
          attachmentFileNames,
          note: 'Skipped malformed Graph message with missing sender or ID.',
        });
        dependencies.logger.warn('Email reprocess skipped message', result);
        results.push(result);
        continue;
      }

      const ingestResult =
        await dependencies.ingestAccountOpeningMessage(inboundMessage);
      const action = existingInboundEmail ? 'UPDATED' : 'CREATED';
      const result = baseResult({
        action,
        message,
        existingInboundEmail,
        accountOpeningCandidate: true,
        classifierVersion: routeClassification.classifierVersion,
        route: routeClassification.route,
        confidence: routeClassification.confidence,
        evidenceUsed: routeClassification.evidenceUsed,
        matchedTerms: routeClassification.matchedTerms,
        classificationReason: routeClassification.classificationReason,
        sideEffectOperation: 'EMAIL_REPROCESS_EXECUTE',
        attachmentFileNames,
        note:
          action === 'UPDATED'
            ? 'Reprocessed account-opening message and refreshed the existing ingestion.'
            : 'Ingested account-opening message.',
        itemCount: ingestResult.items.length,
      });
      dependencies.logger.info('Email reprocess handled message', result);
      results.push(result);
    } catch (error) {
      const result = baseResult({
        action: 'FAILED',
        message,
        existingInboundEmail: null,
        accountOpeningCandidate: false,
        matchedTerms: [],
        sideEffectOperation: options.dryRun ? null : 'EMAIL_REPROCESS_EXECUTE',
        attachmentFileNames: [],
        note: 'Failed to reprocess message.',
        error:
          error instanceof Error
            ? error.message
            : 'Unknown email reprocess error.',
      });
      dependencies.logger.error('Email reprocess failed for message', result);
      results.push(result);
    }
  }

  return results;
}
