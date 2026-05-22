import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma, TelegramInboundItem } from '@prisma/client';

import type { ParsedEmailBodyResult } from '../../../email/parsing';
import { buildProductCandidates } from '../../../imports/normalization';
import { createTelegramInboundService } from '../service';
import type { TelegramUpdate } from '../types';

function asMetadata(value: TelegramInboundItem['metadata']): {
  rawText?: string;
  reason?: string;
  textParsing?: { rawBodyText?: string; reviewRecommended?: boolean };
} {
  return (
    (value as {
      rawText?: string;
      reason?: string;
      textParsing?: { rawBodyText?: string; reviewRecommended?: boolean };
    }) ?? {}
  );
}

function createInboundItem(
  id: string,
  input: Prisma.TelegramInboundItemCreateInput,
): TelegramInboundItem {
  return {
    id,
    telegramMessageId: input.telegramMessageId,
    telegramUserId: input.telegramUserId ?? null,
    telegramChatId: input.telegramChatId,
    senderDisplayName: input.senderDisplayName ?? null,
    fileType: input.fileType ?? 'UNKNOWN',
    fileName: input.fileName ?? null,
    mimeType: input.mimeType ?? null,
    telegramFileId: input.telegramFileId ?? null,
    telegramFileUniqueId: input.telegramFileUniqueId ?? null,
    caption: input.caption ?? null,
    processingStatus: input.processingStatus ?? 'RECEIVED',
    linkedImportBatchId: null,
    errorMessage: null,
    metadata: input.metadata as TelegramInboundItem['metadata'],
    createdAt: new Date('2026-04-19T12:00:00.000Z'),
    updatedAt: new Date('2026-04-19T12:00:00.000Z'),
  };
}

function createTestService(options?: {
  isAllowedSender?: (input: {
    telegramUserId: string | null;
    telegramChatId: string;
  }) => boolean;
  parseTextMessage?: (rawText: string) => Promise<ParsedEmailBodyResult>;
}) {
  const acknowledgements: Array<{
    chatId: string;
    message: string;
    replyToMessageId?: number;
  }> = [];
  const createdRecords: TelegramInboundItem[] = [];

  const service = createTelegramInboundService({
    acknowledge: async (chatId, message, replyToMessageId) => {
      acknowledgements.push({ chatId, message, replyToMessageId });
    },
    createInboundRecord: async (input) => {
      const record = createInboundItem(
        `inbound-${createdRecords.length + 1}`,
        input,
      );
      createdRecords.push(record);
      return record;
    },
    downloadTelegramFile: async () => Buffer.from('file'),
    fetchTelegramFilePath: async () => 'files/example',
    findExistingInbound: async () => null,
    isAllowedSender: options?.isAllowedSender ?? (() => true),
    listInboundItems: async () => [],
    parseTextMessage:
      options?.parseTextMessage ??
      (async (rawText) => ({
        totalLines: rawText.split(/\r?\n/).length,
        candidateLines: 0,
        parsedRows: [],
        skippedLines: [],
        overallConfidence: 'LOW',
        reviewRecommended: true,
        reviewRequired: true,
        rawBodyText: rawText,
        rawBody: rawText,
        parsingSource: 'DETERMINISTIC',
        aiFallbackUsed: false,
      })),
    runImport: async () => ({
      importBatchId: 'batch-1',
      summary: {
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        warnings: [],
      },
      errors: [],
    }),
    updateInboundRecord: async (id, input) => {
      const existing = createdRecords.find((record) => record.id === id);

      if (!existing) {
        throw new Error(`Missing record ${id}`);
      }

      existing.processingStatus =
        (input.processingStatus as TelegramInboundItem['processingStatus']) ??
        existing.processingStatus;
      existing.errorMessage =
        (input.errorMessage as string | null | undefined) ??
        existing.errorMessage;
      existing.metadata =
        (input.metadata as TelegramInboundItem['metadata']) ??
        existing.metadata;
      return existing;
    },
  });

  return {
    acknowledgements,
    createdRecords,
    service,
  };
}

test('allowed user structured text receives parsed summary and stays review-first', async () => {
  const { acknowledgements, createdRecords, service } = createTestService({
    parseTextMessage: async (rawText) => ({
      totalLines: 2,
      candidateLines: 2,
      parsedRows: [
        {
          lineNumber: 1,
          rawLine: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
          rawProductName: 'Amlodipine 5mg tabs 28',
          rawProductText: 'Amlodipine 5mg tabs 28',
          strength: '5mg',
          formulation: 'tabs',
          packSize: '28',
          price: 8.4,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates('Amlodipine 5mg tabs 28'),
          confidence: 'HIGH',
          explanation: 'Strong line structure.',
        },
        {
          lineNumber: 2,
          rawLine: 'Paracetamol 500mg caplets 16 : 1.25 GBP',
          rawProductName: 'Paracetamol 500mg caplets 16',
          rawProductText: 'Paracetamol 500mg caplets 16',
          strength: '500mg',
          formulation: 'caplets',
          packSize: '16',
          price: 1.25,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates(
            'Paracetamol 500mg caplets 16',
          ),
          confidence: 'HIGH',
          explanation: 'Strong line structure.',
        },
      ],
      skippedLines: [],
      overallConfidence: 'HIGH',
      reviewRecommended: false,
      reviewRequired: false,
      rawBodyText: rawText,
      rawBody: rawText,
      parsingSource: 'DETERMINISTIC',
      aiFallbackUsed: false,
    }),
  });
  const update: TelegramUpdate = {
    message: {
      message_id: 101,
      text: [
        'Amlodipine 5mg tabs 28 - 8.40 GBP',
        'Paracetamol 500mg caplets 16 : 1.25 GBP',
      ].join('\n'),
      from: { id: 10, first_name: 'Jane' },
      chat: { id: 20, type: 'private' },
    },
  };

  const result = await service.handleTelegramUpdate(update);

  assert.equal(result.ignored, false);
  assert.equal(result.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.parsedText?.parsedRows.length, 2);
  assert.equal(result.parsedText?.reviewRecommended, false);
  assert.equal(
    acknowledgements[0]?.message,
    ['Received price text.', 'Parsed lines: 2', 'Review needed: No'].join('\n'),
  );
  assert.equal(createdRecords[0]?.processingStatus, 'NEEDS_REVIEW');
  const metadata = asMetadata(createdRecords[0]?.metadata ?? null);
  assert.equal(metadata.rawText, update.message?.text);
  assert.equal(metadata.textParsing?.rawBodyText, update.message?.text);
});

test('allowed user messy prose is not treated as trusted structured data', async () => {
  const { acknowledgements, createdRecords, service } = createTestService();

  const result = await service.handleTelegramUpdate({
    message: {
      message_id: 102,
      text: 'Hello, can you check availability and get back to me tomorrow?',
      from: { id: 11, first_name: 'Sam' },
      chat: { id: 21, type: 'private' },
    },
  });

  assert.equal(result.ignored, true);
  assert.equal(result.parsedText?.parsedRows.length, 0);
  assert.equal(
    acknowledgements[0]?.message,
    'Received message. No importable file or structured price lines found.',
  );
  assert.equal(createdRecords.length, 0);
});

test('disallowed user text message is ignored safely', async () => {
  const { acknowledgements, createdRecords, service } = createTestService({
    isAllowedSender: () => false,
  });

  const result = await service.handleTelegramUpdate({
    message: {
      message_id: 103,
      text: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
      from: { id: 12, first_name: 'Blocked' },
      chat: { id: 22, type: 'private' },
    },
  });

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'Sender is not on the Telegram allowlist.');
  assert.equal(acknowledgements.length, 0);
  assert.equal(createdRecords.length, 0);
});

test('existing file attachment review behavior still works', async () => {
  const { acknowledgements, createdRecords, service } = createTestService();

  const result = await service.handleTelegramUpdate({
    message: {
      message_id: 104,
      caption: 'supplier quote',
      from: { id: 13, first_name: 'Photo' },
      chat: { id: 23, type: 'private' },
      photo: [
        {
          file_id: 'photo-1',
          file_unique_id: 'photo-unique-1',
          file_size: 100,
        },
      ],
    },
  });

  assert.equal(result.ignored, false);
  assert.equal(result.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(
    acknowledgements[0]?.message,
    'Received file. Queued for manual review.',
  );
  assert.equal(createdRecords[0]?.fileType, 'IMAGE');
});

test('parser reviewRecommended is reflected in Telegram metadata', async () => {
  const { createdRecords, service } = createTestService({
    parseTextMessage: async (rawText) => ({
      totalLines: 2,
      candidateLines: 1,
      parsedRows: [
        {
          lineNumber: 1,
          rawLine: 'Aspirin 75mg - 1.20 GBP',
          rawProductName: 'Aspirin 75mg',
          rawProductText: 'Aspirin 75mg',
          strength: '75mg',
          formulation: null,
          packSize: null,
          price: 1.2,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates('Aspirin 75mg'),
          confidence: 'LOW',
          explanation: 'Weak structure.',
        },
      ],
      skippedLines: [
        {
          lineNumber: 2,
          rawLine: 'Please confirm lead time',
          reason: 'Unstructured prose.',
        },
      ],
      overallConfidence: 'LOW',
      reviewRecommended: true,
      reviewRequired: true,
      rawBodyText: rawText,
      rawBody: rawText,
      parsingSource: 'DETERMINISTIC',
      aiFallbackUsed: false,
    }),
  });
  const text = ['Aspirin 75mg - 1.20 GBP', 'Please confirm lead time'].join(
    '\n',
  );

  const result = await service.handleTelegramUpdate({
    message: {
      message_id: 105,
      text,
      from: { id: 14, first_name: 'Mixed' },
      chat: { id: 24, type: 'private' },
    },
  });

  assert.equal(result.ignored, false);
  assert.equal(result.parsedText?.parsedRows.length, 1);
  assert.equal(result.parsedText?.reviewRecommended, true);
  const metadata = asMetadata(createdRecords[0]?.metadata ?? null);
  assert.equal(metadata.textParsing?.reviewRecommended, true);
  assert.match(metadata.reason ?? '', /review is recommended/i);
});

test('Telegram messy text can use AI fallback and stays review-first', async () => {
  const { acknowledgements, createdRecords, service } = createTestService({
    parseTextMessage: async (rawText) => ({
      totalLines: 1,
      candidateLines: 1,
      parsedRows: [
        {
          lineNumber: 1,
          rawLine: rawText,
          rawProductName: 'Metformin 500mg 28',
          rawProductText: 'Metformin 500mg 28',
          strength: '500mg',
          formulation: null,
          packSize: '28',
          price: 3.1,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates('Metformin 500mg 28'),
          confidence: 'MEDIUM',
          explanation:
            'AI fallback extracted a commercially relevant offer from messy prose.',
        },
      ],
      skippedLines: [],
      overallConfidence: 'MEDIUM',
      reviewRecommended: true,
      reviewRequired: true,
      rawBodyText: rawText,
      rawBody: rawText,
      parsingSource: 'OPENAI_FALLBACK',
      aiFallbackUsed: true,
      supplierName: 'Acme Pharma',
      notes: ['Messy prose kept review-oriented.'],
      parsingReason:
        'Used OpenAI fallback because deterministic parsing was weak or unclear.',
    }),
  });

  const result = await service.handleTelegramUpdate({
    message: {
      message_id: 106,
      text: 'Acme can do Metformin 500mg 28 at 3.10 GBP if needed.',
      from: { id: 15, first_name: 'AI' },
      chat: { id: 25, type: 'private' },
    },
  });

  assert.equal(result.ignored, false);
  assert.equal(result.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.parsedText?.parsingSource, 'OPENAI_FALLBACK');
  assert.equal(result.parsedText?.reviewRecommended, true);
  assert.equal(
    acknowledgements[0]?.message,
    'Received price text.\nParsed lines: 1\nReview needed: Yes',
  );
  const metadata = asMetadata(createdRecords[0]?.metadata ?? null);
  assert.equal(metadata.textParsing?.reviewRecommended, true);
});
