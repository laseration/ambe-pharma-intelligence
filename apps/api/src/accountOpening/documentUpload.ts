import path from 'node:path';

import { Prisma } from '@prisma/client';

import { extractAttachmentText } from '../email/attachmentTextExtraction';
import type {
  EmailInboundFileType,
  NormalizedEmailAttachment,
} from '../email/inbound/types';
import { BadRequestError, ConflictError, NotFoundError } from '../http/errors';
import { db } from '../lib/db';
import {
  classifyAccountOpeningDocument,
  type AccountOpeningDocumentClassification,
} from './documentClassification';
import {
  getAccountOpeningCaseDetail,
  normalizeSourceEvidenceInput,
  type AccountOpeningCaseDetail,
  type AccountOpeningCaseEventInput,
  type AccountOpeningSourceEvidenceInput,
} from './service';

export const MAX_ACCOUNT_OPENING_UPLOAD_BYTES = 10 * 1024 * 1024;

// MIME / extension allowlist. No executables or scripts; only formats the
// extractor can read or that are safe to store as review evidence.
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  'application/csv',
  'text/plain',
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.xlsx',
  '.docx',
  '.csv',
  '.txt',
]);

/**
 * Filename is never trusted: we match on a strict extension+MIME allowlist and
 * never execute or interpret the file — it is only read for text extraction and
 * stored as redacted review evidence.
 */
export function isAllowedAccountOpeningUpload(
  fileName: string,
  mimeType: string | null,
): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const mime = (mimeType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  return (
    ALLOWED_UPLOAD_MIME_TYPES.has(mime) || ALLOWED_UPLOAD_EXTENSIONS.has(ext)
  );
}

function detectUploadFileType(
  fileName: string,
  mimeType: string | null,
): EmailInboundFileType {
  const ext = path.extname(fileName).toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (ext === '.csv' || mime === 'text/csv' || mime === 'application/csv') {
    return 'CSV';
  }
  if (
    ext === '.xlsx' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'XLSX';
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    return 'PDF';
  }
  if (
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
  ) {
    return 'IMAGE';
  }
  return 'UNKNOWN';
}

export type AttachAccountOpeningDocumentResult = {
  classification: AccountOpeningDocumentClassification;
  detail: AccountOpeningCaseDetail;
};

export type AttachAccountOpeningDocumentDeps = {
  loadStatus?: (id: string) => Promise<string | null>;
  extractText?: typeof extractAttachmentText;
  persistEvidence?: (args: {
    caseId: string;
    evidence: AccountOpeningSourceEvidenceInput;
  }) => Promise<void>;
  recordEvent?: (event: AccountOpeningCaseEventInput) => Promise<void>;
  getDetail?: (id: string) => Promise<AccountOpeningCaseDetail | null>;
};

async function defaultLoadStatus(id: string): Promise<string | null> {
  const client = db as never as {
    accountOpeningCase?: {
      findUnique: (args: unknown) => Promise<{ status: string } | null>;
    };
  };
  if (!client.accountOpeningCase) {
    return null;
  }
  const found = await client.accountOpeningCase.findUnique({
    where: { id },
    select: { status: true },
  });
  return found?.status ?? null;
}

async function defaultPersistEvidence(args: {
  caseId: string;
  evidence: AccountOpeningSourceEvidenceInput;
}): Promise<void> {
  const client = db as never as {
    accountOpeningSourceEvidence?: {
      create: (args: { data: unknown }) => Promise<unknown>;
    };
  };
  if (!client.accountOpeningSourceEvidence) {
    return;
  }
  await client.accountOpeningSourceEvidence.create({
    data: {
      ...normalizeSourceEvidenceInput(args.evidence),
      accountOpeningCaseId: args.caseId,
      metadata: args.evidence.metadata
        ? (args.evidence.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

async function defaultRecordEvent(
  event: AccountOpeningCaseEventInput,
): Promise<void> {
  const client = db as never as {
    accountOpeningCaseEvent?: {
      create: (args: {
        data: AccountOpeningCaseEventInput;
      }) => Promise<unknown>;
    };
  };
  if (!client.accountOpeningCaseEvent) {
    return;
  }
  await client.accountOpeningCaseEvent.create({ data: event });
}

/**
 * Attach an uploaded document to an existing account-opening case. Runs the same
 * extract → classify sequence the email pipeline uses, then stores a redacted
 * source-evidence row (no raw bytes/text reach the dashboard) plus an audit
 * event. Does NOT mutate the case header, sign, send, or auto-complete anything.
 */
export async function attachAccountOpeningCaseDocument(
  input: {
    caseId: string;
    file: {
      fileName: string;
      mimeType: string | null;
      buffer: Buffer;
      size: number;
    };
    actorType?: string | null;
    actorIdentifier?: string | null;
  },
  deps: AttachAccountOpeningDocumentDeps = {},
): Promise<AttachAccountOpeningDocumentResult> {
  const fileName = input.file.fileName?.trim();
  if (!fileName) {
    throw new BadRequestError('An uploaded file name is required.');
  }
  if (!isAllowedAccountOpeningUpload(fileName, input.file.mimeType)) {
    throw new BadRequestError(
      'Unsupported file type. Allowed: PDF, image (PNG/JPG/WEBP), DOCX, XLSX, CSV, or TXT.',
    );
  }
  if (input.file.size > MAX_ACCOUNT_OPENING_UPLOAD_BYTES) {
    throw new BadRequestError('Uploaded file exceeds the 10MB limit.');
  }

  const loadStatus = deps.loadStatus ?? defaultLoadStatus;
  const extractText = deps.extractText ?? extractAttachmentText;
  const persistEvidence = deps.persistEvidence ?? defaultPersistEvidence;
  const recordEvent = deps.recordEvent ?? defaultRecordEvent;
  const getDetail = deps.getDetail ?? getAccountOpeningCaseDetail;

  const status = await loadStatus(input.caseId);
  if (status === null) {
    throw new NotFoundError('Account-opening case not found.');
  }
  if (status === 'REJECTED' || status === 'CLOSED') {
    throw new ConflictError(
      'Documents cannot be added to a rejected or closed account-opening case.',
    );
  }

  const attachment: NormalizedEmailAttachment = {
    fileType: detectUploadFileType(fileName, input.file.mimeType),
    fileName,
    mimeType: input.file.mimeType,
    buffer: input.file.buffer,
    size: input.file.size,
    contentId: null,
    disposition: 'attachment',
    graphAttachmentId: null,
  };

  const extracted = await extractText(attachment);
  const text = extracted?.text ?? null;

  const classification = classifyAccountOpeningDocument({
    fileName,
    mimeType: input.file.mimeType,
    text,
  });

  const evidence: AccountOpeningSourceEvidenceInput = {
    sourceType: 'ATTACHMENT',
    sourceLabel: fileName,
    fileName,
    mimeType: input.file.mimeType,
    sizeBytes: input.file.size,
    disposition: 'attachment',
    extractionMethod: extracted?.method ?? null,
    text,
    rawFileAvailable: false,
    metadata: {
      uploadSource: 'OPERATOR_UPLOAD',
      classification: classification.classification,
      classificationConfidence: classification.confidence,
      extractionWarnings: extracted?.warnings ?? [],
      rawBytesStoredInCase: false,
    },
  };

  await persistEvidence({ caseId: input.caseId, evidence });

  await recordEvent({
    accountOpeningCaseId: input.caseId,
    actionType: 'DOCUMENT_UPLOADED',
    actorType: input.actorType?.trim() || 'OPERATOR',
    actorIdentifier: input.actorIdentifier ?? null,
    note: `Uploaded ${fileName} — classified ${classification.classification} (${classification.confidence} confidence).`,
    metadata: {
      fileName,
      classification: classification.classification,
      confidence: classification.confidence,
    },
  });

  const detail = await getDetail(input.caseId);
  if (!detail) {
    throw new Error(
      'Account-opening case could not be loaded after document upload.',
    );
  }

  return { classification, detail };
}
