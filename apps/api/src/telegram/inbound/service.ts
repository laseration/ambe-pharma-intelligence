import type { Prisma, TelegramInboundItem } from '@prisma/client';

import { db } from '../../lib/db';
import { logger } from '../../lib/logger';
import {
  importInventory,
  importSales,
  importSupplierPriceList,
} from '../../imports/service';
import type { ImportResponse, UploadFile } from '../../imports/types';
import {
  parseStructuredPriceText,
  type ParsedEmailBodyResult,
} from '../../email/parsing';
import { sendTelegramText } from '../service';
import {
  buildSenderDisplayName,
  extractAttachment,
  inferImportDecision,
  isAllowedTelegramSender,
} from './helpers';
import type { TelegramUpdate } from './types';

type TelegramInboundServiceDependencies = {
  acknowledge: (
    chatId: string,
    message: string,
    replyToMessageId?: number,
  ) => Promise<void>;
  createInboundRecord: (
    input: Prisma.TelegramInboundItemCreateInput,
  ) => Promise<TelegramInboundItem>;
  downloadTelegramFile: (filePath: string) => Promise<Buffer>;
  fetchTelegramFilePath: (fileId: string) => Promise<string>;
  findExistingInbound: (input: {
    telegramChatId: string;
    telegramMessageId: string;
  }) => Promise<TelegramInboundItem | null>;
  listInboundItems: (filters: {
    processingStatus?: string;
  }) => Promise<TelegramInboundListItem[]>;
  isAllowedSender: (input: {
    telegramUserId: string | null;
    telegramChatId: string;
  }) => boolean;
  parseTextMessage: (rawText: string) => Promise<ParsedEmailBodyResult>;
  runImport: (
    inferredImportType: 'supplier-price-list' | 'inventory' | 'sales',
    uploadFile: UploadFile,
  ) => Promise<ImportResponse>;
  updateInboundRecord: (
    id: string,
    input: Prisma.TelegramInboundItemUpdateInput,
  ) => Promise<TelegramInboundItem>;
};

export type TelegramInboundListItem = Prisma.TelegramInboundItemGetPayload<{
  include: {
    linkedImportBatch: {
      select: {
        id: true;
        kind: true;
        status: true;
        totalRows: true;
        validRows: true;
        invalidRows: true;
      };
    };
  };
}>;

function getTelegramApiBase(): string {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
}

async function fetchTelegramFilePath(fileId: string): Promise<string> {
  const response = await fetch(`${getTelegramApiBase()}/getFile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: { file_path?: string };
  };

  if (!response.ok || !payload.ok || !payload.result?.file_path) {
    throw new Error(
      payload.description || 'Failed to fetch Telegram file path.',
    );
  }

  return payload.result.file_path;
}

async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`,
  );

  if (!response.ok) {
    throw new Error('Failed to download Telegram file.');
  }

  return Buffer.from(await response.arrayBuffer());
}

async function createInboundRecord(
  input: Prisma.TelegramInboundItemCreateInput,
) {
  return db.telegramInboundItem.create({
    data: input,
  });
}

async function updateInboundRecord(
  id: string,
  input: Prisma.TelegramInboundItemUpdateInput,
): Promise<TelegramInboundItem> {
  return db.telegramInboundItem.update({
    where: { id },
    data: input,
  });
}

function createUploadFile(
  fileName: string | null,
  mimeType: string | null,
  buffer: Buffer,
): UploadFile {
  return {
    buffer,
    mimetype: mimeType || 'application/octet-stream',
    originalname: fileName || 'telegram-upload',
    size: buffer.byteLength,
  };
}

async function runImport(
  inferredImportType: 'supplier-price-list' | 'inventory' | 'sales',
  uploadFile: UploadFile,
): Promise<ImportResponse> {
  if (inferredImportType === 'supplier-price-list') {
    return importSupplierPriceList({
      file: uploadFile,
      supplierName: undefined,
      sourceDate: undefined,
      currencyCode: undefined,
    });
  }

  if (inferredImportType === 'inventory') {
    return importInventory({
      file: uploadFile,
    });
  }

  return importSales({
    file: uploadFile,
  });
}

function buildImportAck(
  result: ImportResponse,
  inferredImportType: string,
): string {
  const warnings =
    result.summary.warnings.length > 0
      ? `\nWarnings: ${result.summary.warnings.join('; ')}`
      : '';

  return (
    [
      `Imported ${inferredImportType}`,
      `Total rows: ${result.summary.totalRows}`,
      `Valid rows: ${result.summary.validRows}`,
      `Invalid rows: ${result.summary.invalidRows}`,
    ].join('\n') + warnings
  );
}

async function acknowledge(
  chatId: string,
  message: string,
  replyToMessageId?: number,
) {
  await sendTelegramText(chatId, message, replyToMessageId);
}

function buildTextParseAck(
  parsedLineCount: number,
  reviewRecommended: boolean,
): string {
  return [
    'Received price text.',
    `Parsed lines: ${parsedLineCount}`,
    `Review needed: ${reviewRecommended ? 'Yes' : 'No'}`,
  ].join('\n');
}

export function createTelegramInboundService(
  dependencies: TelegramInboundServiceDependencies = {
    acknowledge,
    createInboundRecord,
    downloadTelegramFile,
    fetchTelegramFilePath,
    findExistingInbound: async ({ telegramChatId, telegramMessageId }) =>
      db.telegramInboundItem.findFirst({
        where: {
          telegramChatId,
          telegramMessageId,
        },
      }),
    listInboundItems: async (filters) =>
      db.telegramInboundItem.findMany({
        where: {
          ...(filters.processingStatus
            ? { processingStatus: filters.processingStatus as never }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          linkedImportBatch: {
            select: {
              id: true,
              kind: true,
              status: true,
              totalRows: true,
              validRows: true,
              invalidRows: true,
            },
          },
        },
      }),
    isAllowedSender: isAllowedTelegramSender,
    parseTextMessage: async (rawText) =>
      parseStructuredPriceText(rawText, {
        source: 'TELEGRAM_TEXT',
      }),
    runImport,
    updateInboundRecord,
  },
) {
  async function handleTelegramUpdate(update: TelegramUpdate) {
    const message = update.message;

    if (!message) {
      return {
        ignored: true,
        reason: 'Update has no message payload.',
      };
    }

    const telegramChatId = String(message.chat.id);
    const telegramUserId = message.from ? String(message.from.id) : null;

    if (!dependencies.isAllowedSender({ telegramUserId, telegramChatId })) {
      logger.warn('Ignored inbound Telegram update from unapproved sender', {
        telegramChatId,
        telegramUserId,
      });

      return {
        ignored: true,
        reason: 'Sender is not on the Telegram allowlist.',
      };
    }

    const existingInbound = await dependencies.findExistingInbound({
      telegramChatId,
      telegramMessageId: String(message.message_id),
    });

    if (existingInbound) {
      return {
        ignored: true,
        inboundId: existingInbound.id,
        reason: 'Telegram update was already processed.',
      };
    }

    const attachment = extractAttachment(message);
    const textContent = message.text?.trim() ?? '';

    if (!attachment) {
      if (!textContent) {
        await dependencies.acknowledge(
          telegramChatId,
          'Received message. No importable file or structured price lines found.',
          message.message_id,
        );
        return {
          ignored: true,
          reason: 'No supported file attachment found.',
        };
      }

      const parsedText = await dependencies.parseTextMessage(textContent);

      if (parsedText.parsedRows.length === 0) {
        await dependencies.acknowledge(
          telegramChatId,
          'Received message. No importable file or structured price lines found.',
          message.message_id,
        );
        return {
          ignored: true,
          reason: 'No importable file or structured price lines found.',
          parsedText,
        };
      }

      const inbound = await dependencies.createInboundRecord({
        telegramMessageId: String(message.message_id),
        telegramUserId,
        telegramChatId,
        senderDisplayName: buildSenderDisplayName(message),
        fileType: 'UNKNOWN',
        fileName: null,
        mimeType: null,
        telegramFileId: null,
        telegramFileUniqueId: null,
        caption: null,
        processingStatus: 'NEEDS_REVIEW',
        metadata: {
          rawText: textContent,
          reason: parsedText.reviewRecommended
            ? 'Structured price lines were parsed from Telegram text, but review is recommended.'
            : 'Structured price lines were parsed from Telegram text with high confidence and kept review-first.',
          textParsing: parsedText,
          updateId: update.update_id ?? null,
        },
      });

      await dependencies.acknowledge(
        telegramChatId,
        buildTextParseAck(
          parsedText.parsedRows.length,
          parsedText.reviewRecommended,
        ),
        message.message_id,
      );

      return {
        ignored: false,
        inboundId: inbound.id,
        processingStatus: 'NEEDS_REVIEW',
        parsedText,
      };
    }

    const decision = inferImportDecision({
      fileType: attachment.fileType,
      fileName: attachment.fileName,
      caption: message.caption ?? null,
    });

    const inbound = await dependencies.createInboundRecord({
      telegramMessageId: String(message.message_id),
      telegramUserId,
      telegramChatId,
      senderDisplayName: buildSenderDisplayName(message),
      fileType: attachment.fileType,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      telegramFileId: attachment.telegramFileId,
      telegramFileUniqueId: attachment.telegramFileUniqueId,
      caption: message.caption ?? null,
      processingStatus: decision.processingStatus,
      metadata: {
        inferredImportType: decision.inferredImportType,
        reason: decision.reason,
        size: attachment.size,
        updateId: update.update_id ?? null,
      },
    });

    if (
      decision.processingStatus === 'REVIEW_REQUIRED' ||
      decision.processingStatus === 'NEEDS_REVIEW'
    ) {
      await dependencies.acknowledge(
        telegramChatId,
        decision.processingStatus === 'REVIEW_REQUIRED'
          ? 'Received file. Queued for manual review.'
          : 'Received file. Import type is unclear, so it was queued for manual review.',
        message.message_id,
      );

      return {
        ignored: false,
        inboundId: inbound.id,
        processingStatus: decision.processingStatus,
      };
    }

    try {
      const filePath = await dependencies.fetchTelegramFilePath(
        attachment.telegramFileId,
      );
      const buffer = await dependencies.downloadTelegramFile(filePath);
      const uploadFile = createUploadFile(
        attachment.fileName,
        attachment.mimeType,
        buffer,
      );
      const importResult = await dependencies.runImport(
        decision.inferredImportType!,
        uploadFile,
      );

      await dependencies.updateInboundRecord(inbound.id, {
        linkedImportBatch: {
          connect: {
            id: importResult.importBatchId,
          },
        },
        processingStatus: 'IMPORTED',
        metadata: {
          inferredImportType: decision.inferredImportType,
          reason: decision.reason,
          filePath,
          size: attachment.size,
          summary: importResult.summary,
        },
      });

      await dependencies.acknowledge(
        telegramChatId,
        buildImportAck(importResult, decision.inferredImportType!),
        message.message_id,
      );

      logger.info('Imported Telegram inbound file', {
        inboundId: inbound.id,
        importBatchId: importResult.importBatchId,
        inferredImportType: decision.inferredImportType,
      });

      return {
        ignored: false,
        inboundId: inbound.id,
        importResult,
        processingStatus: 'IMPORTED',
      };
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : 'Inbound Telegram processing failed.';

      await dependencies.updateInboundRecord(inbound.id, {
        processingStatus: 'FAILED',
        errorMessage: messageText,
      });

      await dependencies.acknowledge(
        telegramChatId,
        `Received file but could not process it.\nError: ${messageText}`,
        message.message_id,
      );

      logger.error('Failed to process inbound Telegram file', {
        error: messageText,
        inboundId: inbound.id,
      });

      return {
        ignored: false,
        inboundId: inbound.id,
        processingStatus: 'FAILED',
        error: messageText,
      };
    }
  }

  async function listInboundItems(filters: {
    processingStatus?: string;
  }): Promise<TelegramInboundListItem[]> {
    return dependencies.listInboundItems(filters);
  }

  return {
    handleTelegramUpdate,
    listInboundItems,
  };
}

const telegramInboundService = createTelegramInboundService();

export const handleTelegramUpdate = telegramInboundService.handleTelegramUpdate;
export const listInboundItems = telegramInboundService.listInboundItems;
