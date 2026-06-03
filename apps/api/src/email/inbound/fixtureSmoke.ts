import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  attachmentChecksumSha256,
  attachmentContentBuffer,
  attachmentMetadataFingerprint,
  safeSenderDomain,
  safeSubjectPreview,
} from './provenance';
import type {
  EmailAttachmentInput,
  EmailInboundMessage,
  EmailInboundResult,
} from './types';

type FixtureAttachment = Omit<EmailAttachmentInput, 'content'> & {
  contentBase64?: string | null;
  contentText?: string | null;
};

type EmailFixtureFile = {
  id: string;
  description?: string;
  message: Omit<EmailInboundMessage, 'receivedAt' | 'attachments'> & {
    receivedAt?: string | null;
    attachments?: FixtureAttachment[];
  };
};

export type LoadedEmailInboundFixture = {
  id: string;
  description?: string;
  message: EmailInboundMessage;
  attachmentChecksums: Array<{
    fileName: string | null;
    checksumSha256: string | null;
    fingerprint: string;
  }>;
};

export type EmailFixtureSmokeSummary = {
  fixtureId: string;
  sourceSystem: string | null;
  externalMessageId: string | null;
  messageId: string | null;
  senderDomain: string | null;
  subjectPreview: string | null;
  receivedAt: string | null;
  attachments: Array<{
    fileName: string | null;
    mimeType: string | null;
    size: number | null;
    contentId: string | null;
    disposition: string | null;
    checksumSha256: string | null;
    fingerprint: string;
  }>;
  result: {
    ignored: boolean;
    reason: string | null;
    itemCount: number;
    statuses: string[];
    triageStatuses: string[];
  };
  durableCounts?: {
    inboundEmails: number;
    documents: number;
    extractionRuns: number;
    offers: number;
    workflowItems: number;
  };
  replay?: {
    duplicateFree: boolean;
  };
};

const DEFAULT_FIXTURE_DIR = path.resolve(
  __dirname,
  '../../../fixtures/email-inbound',
);

function decodeAttachmentContent(attachment: FixtureAttachment): Buffer | null {
  if (typeof attachment.contentBase64 === 'string') {
    return Buffer.from(attachment.contentBase64, 'base64');
  }

  if (typeof attachment.contentText === 'string') {
    return Buffer.from(attachment.contentText, 'utf8');
  }

  return null;
}

function loadFixtureJson(fileName: string, fixtureDir: string): EmailFixtureFile {
  return JSON.parse(
    readFileSync(path.join(fixtureDir, fileName), 'utf8'),
  ) as EmailFixtureFile;
}

export function loadEmailInboundFixture(
  fileName: string,
  fixtureDir = DEFAULT_FIXTURE_DIR,
): LoadedEmailInboundFixture {
  const fixture = loadFixtureJson(fileName, fixtureDir);
  const attachments = (fixture.message.attachments ?? []).map((attachment) => {
    const content = decodeAttachmentContent(attachment);
    const normalized: EmailAttachmentInput = {
      fileName: attachment.fileName ?? null,
      mimeType: attachment.mimeType ?? null,
      size:
        attachment.size ??
        attachmentContentBuffer(content)?.length ??
        null,
      contentId: attachment.contentId ?? null,
      disposition: attachment.disposition ?? null,
      graphAttachmentId: attachment.graphAttachmentId ?? null,
      content,
    };

    return normalized;
  });
  const message: EmailInboundMessage = {
    ...fixture.message,
    receivedAt: fixture.message.receivedAt
      ? new Date(fixture.message.receivedAt)
      : null,
    attachments,
  };

  return {
    id: fixture.id,
    description: fixture.description,
    message,
    attachmentChecksums: attachments.map((attachment) => ({
      fileName: attachment.fileName ?? null,
      checksumSha256: attachmentChecksumSha256(attachment),
      fingerprint: attachmentMetadataFingerprint(attachment),
    })),
  };
}

export function buildEmailFixtureSmokeSummary(input: {
  fixture: LoadedEmailInboundFixture;
  result: EmailInboundResult;
  durableCounts?: EmailFixtureSmokeSummary['durableCounts'];
  replay?: EmailFixtureSmokeSummary['replay'];
}): EmailFixtureSmokeSummary {
  const { fixture, result } = input;

  return {
    fixtureId: fixture.id,
    sourceSystem: fixture.message.sourceSystem ?? null,
    externalMessageId: fixture.message.externalMessageId ?? null,
    messageId: fixture.message.messageId ?? null,
    senderDomain: safeSenderDomain(fixture.message.from),
    subjectPreview: safeSubjectPreview(fixture.message.subject),
    receivedAt: fixture.message.receivedAt?.toISOString() ?? null,
    attachments: (fixture.message.attachments ?? []).map((attachment) => ({
      fileName: attachment.fileName ?? null,
      mimeType: attachment.mimeType ?? null,
      size: attachment.size ?? null,
      contentId: attachment.contentId ?? null,
      disposition: attachment.disposition ?? null,
      checksumSha256: attachmentChecksumSha256(attachment),
      fingerprint: attachmentMetadataFingerprint(attachment),
    })),
    result: {
      ignored: result.ignored,
      reason: result.reason ?? null,
      itemCount: result.items.length,
      statuses: result.items.map((item) => item.processingStatus),
      triageStatuses: result.items
        .map((item) => item.triageStatus)
        .filter(
          (
            status,
          ): status is NonNullable<
            EmailInboundResult['items'][number]['triageStatus']
          > => Boolean(status),
        ),
    },
    durableCounts: input.durableCounts,
    replay: input.replay,
  };
}
