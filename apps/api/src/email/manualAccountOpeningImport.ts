import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { simpleParser, type ParsedMail } from 'mailparser';

import { createEmailInboundService } from './inbound/service';
import type { EmailInboundMessage, EmailInboundResult } from './inbound/types';
import { db } from '../lib/db';
import {
  listReviewQueueItems,
  type ReviewQueueItem,
} from '../reviewQueue/service';

export const MANUAL_ACCOUNT_OPENING_EML_SOURCE_SYSTEM =
  'MANUAL_ACCOUNT_OPENING_EML';

type PersistedAccountOpeningCaseSummary = {
  id: string;
  status: string;
  signingStatement: string;
  sourceFingerprint: string;
};

type ManualAccountOpeningEmlImportDependencies = {
  readFile: (filePath: string) => Promise<Buffer>;
  ingestMessage: (message: EmailInboundMessage) => Promise<EmailInboundResult>;
  findCaseByFingerprint: (
    sourceFingerprint: string,
  ) => Promise<PersistedAccountOpeningCaseSummary | null>;
  countBuyDecisions: () => Promise<number>;
  countOfferWorkflowItems: () => Promise<number>;
  listReviewQueueItems: () => Promise<ReviewQueueItem[]>;
};

export type ManualAccountOpeningEmlImportResult = {
  id: string;
  status: string;
  sourceFingerprint: string;
  messageId: string | null;
  externalMessageId: string;
  senderEmail: string;
  subject: string | null;
  receivedAt: string | null;
  attachmentCount: number;
  attachmentFileNames: string[];
  reviewQueueItemFound: boolean;
  buyDecisionCountDelta: number;
  offerWorkflowItemCountDelta: number;
  safety: {
    graphPollingEnabled: false;
    workersStarted: false;
    outboundEmailSent: false;
    sharePointOrOneDriveFiled: false;
    openAiParserEnabled: false;
    telegramTriggered: false;
  };
};

function firstAddress(
  value: ParsedMail['from'],
): { email: string; name: string | null } | null {
  const address = value?.value[0];
  const email = address?.address?.trim().toLowerCase();

  if (!email) {
    return null;
  }

  return {
    email,
    name: address?.name?.trim() || null,
  };
}

function headerString(parsed: ParsedMail, name: string): string | null {
  const value = parsed.headers.get(name.toLowerCase());

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(', ');
    return joined || null;
  }

  return null;
}

function sanitizeFileBase(filePath: string): string {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]/g, '_');
}

export async function parseAccountOpeningEmlMessage(input: {
  emlBytes: Buffer;
  fileName?: string | null;
  sourceSystem?: string | null;
}): Promise<EmailInboundMessage> {
  const parsed = await simpleParser(input.emlBytes, {
    skipImageLinks: true,
    skipTextToHtml: true,
  });
  const from = firstAddress(parsed.from);

  if (!from) {
    throw new Error(
      'Manual account-opening .eml import requires a From address.',
    );
  }

  const sourceSystem =
    input.sourceSystem?.trim() || MANUAL_ACCOUNT_OPENING_EML_SOURCE_SYSTEM;
  const messageId =
    parsed.messageId?.trim() || headerString(parsed, 'message-id') || null;
  const emlHash = createHash('sha256').update(input.emlBytes).digest('hex');
  const externalMessageId =
    messageId ??
    `manual-eml:${input.fileName ? sanitizeFileBase(input.fileName) : 'upload'}:${emlHash}`;

  return {
    sourceSystem,
    externalMessageId,
    messageId,
    conversationId:
      headerString(parsed, 'thread-index') ??
      headerString(parsed, 'thread-topic') ??
      null,
    from: from.email,
    fromName: from.name,
    sender: null,
    senderName: null,
    replyTo:
      parsed.replyTo?.value.map((address) => ({
        email: address.address?.trim().toLowerCase() ?? '',
        name: address.name?.trim() || null,
      })) ?? null,
    internetMessageHeaders: Array.from(parsed.headers.entries()).flatMap(
      ([name, value]) =>
        typeof value === 'string'
          ? [{ name, value }]
          : Array.isArray(value)
            ? value.map((item) => ({ name, value: String(item) }))
            : [],
    ),
    subject: parsed.subject?.trim() || null,
    bodyText: parsed.text?.trim() || null,
    rawHtml: typeof parsed.html === 'string' ? parsed.html : null,
    receivedAt: parsed.date ?? null,
    supplierName: null,
    attachments: parsed.attachments.map((attachment) => ({
      fileName: attachment.filename ?? null,
      mimeType: attachment.contentType ?? null,
      content: attachment.content,
      size: attachment.size ?? attachment.content.byteLength,
      contentId: attachment.contentId ?? null,
      disposition: attachment.contentDisposition ?? null,
      graphAttachmentId: null,
    })),
  };
}

function createDefaultDependencies(): ManualAccountOpeningEmlImportDependencies {
  return {
    readFile,
    ingestMessage: (message) => {
      const service = createEmailInboundService({
        // Manual import is intentionally one-email-at-a-time and trusts only
        // the sender parsed from this local file. It does not enable polling.
        isTrustedSender: () => true,
        allowedSenders: [message.from],
      });

      return service.ingestMessage(message);
    },
    findCaseByFingerprint: (sourceFingerprint) =>
      db.accountOpeningCase.findUnique({
        where: { sourceFingerprint },
        select: {
          id: true,
          status: true,
          signingStatement: true,
          sourceFingerprint: true,
        },
      }),
    countBuyDecisions: () => db.buyDecision.count(),
    countOfferWorkflowItems: () => db.offerWorkflowItem.count(),
    listReviewQueueItems,
  };
}

export async function importAccountOpeningEmlFile(input: {
  filePath: string;
  sourceSystem?: string | null;
  dependencies?: ManualAccountOpeningEmlImportDependencies;
}): Promise<ManualAccountOpeningEmlImportResult> {
  const dependencies = input.dependencies ?? createDefaultDependencies();
  const emlBytes = await dependencies.readFile(input.filePath);
  const message = await parseAccountOpeningEmlMessage({
    emlBytes,
    fileName: input.filePath,
    sourceSystem: input.sourceSystem,
  });
  const buyDecisionCountBefore = await dependencies.countBuyDecisions();
  const offerWorkflowItemCountBefore =
    await dependencies.countOfferWorkflowItems();
  const result = await dependencies.ingestMessage(message);
  const accountOpeningCase = result.items.find(
    (item) => item.accountOpeningCase,
  )?.accountOpeningCase;

  if (!accountOpeningCase) {
    throw new Error(
      'Manual .eml import did not produce an account-opening review case.',
    );
  }

  const persisted = await dependencies.findCaseByFingerprint(
    accountOpeningCase.sourceFingerprint,
  );

  if (!persisted) {
    throw new Error('Manual .eml account-opening case was not persisted.');
  }

  const reviewQueueItems = await dependencies.listReviewQueueItems();
  const buyDecisionCountAfter = await dependencies.countBuyDecisions();
  const offerWorkflowItemCountAfter =
    await dependencies.countOfferWorkflowItems();

  return {
    id: persisted.id,
    status: persisted.status,
    sourceFingerprint: persisted.sourceFingerprint,
    messageId: message.messageId ?? null,
    externalMessageId: message.externalMessageId ?? '',
    senderEmail: message.from,
    subject: message.subject ?? null,
    receivedAt: message.receivedAt?.toISOString() ?? null,
    attachmentCount: message.attachments?.length ?? 0,
    attachmentFileNames:
      message.attachments
        ?.map((attachment) => attachment.fileName?.trim())
        .filter((fileName): fileName is string => Boolean(fileName)) ?? [],
    reviewQueueItemFound: reviewQueueItems.some(
      (item) => item.id === `account-opening-${persisted.id}`,
    ),
    buyDecisionCountDelta: buyDecisionCountAfter - buyDecisionCountBefore,
    offerWorkflowItemCountDelta:
      offerWorkflowItemCountAfter - offerWorkflowItemCountBefore,
    safety: {
      graphPollingEnabled: false,
      workersStarted: false,
      outboundEmailSent: false,
      sharePointOrOneDriveFiled: false,
      openAiParserEnabled: false,
      telegramTriggered: false,
    },
  };
}
