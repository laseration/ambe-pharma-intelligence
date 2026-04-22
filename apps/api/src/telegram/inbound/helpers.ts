import path from 'node:path';

import { env } from '../../config/env';
import type { TelegramInboundFileType } from '@prisma/client';
import type { InboundAttachment, InboundDecision, TelegramMessage } from './types';

function lower(value: string | null | undefined): string {
  return (value || '').toLowerCase();
}

export function isAllowedTelegramSender(input: {
  telegramUserId: string | null;
  telegramChatId: string;
}): boolean {
  return isAllowedTelegramSenderForLists(
    {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
    },
    env.telegramAllowedUserIds,
    env.telegramAllowedChatIds,
  );
}

export function isAllowedTelegramSenderForLists(
  input: {
    telegramUserId: string | null;
    telegramChatId: string;
  },
  allowedUsers: string[],
  allowedChats: string[],
): boolean {
  const userAllowed =
    input.telegramUserId !== null &&
    allowedUsers.length > 0 &&
    allowedUsers.includes(input.telegramUserId);
  const chatAllowed = allowedChats.length > 0 && allowedChats.includes(input.telegramChatId);

  if (allowedUsers.length === 0 && allowedChats.length === 0) {
    return false;
  }

  return userAllowed || chatAllowed;
}

function detectFileType(fileName: string | null, mimeType: string | null): TelegramInboundFileType {
  const extension = fileName ? path.extname(fileName).toLowerCase() : '';
  const mime = lower(mimeType);

  if (extension === '.csv' || mime === 'text/csv') {
    return 'CSV';
  }

  if (
    extension === '.xlsx' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'XLSX';
  }

  if (extension === '.pdf' || mime === 'application/pdf') {
    return 'PDF';
  }

  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
    return 'IMAGE';
  }

  return 'UNKNOWN';
}

export function extractAttachment(message: TelegramMessage): InboundAttachment | null {
  if (message.document) {
    return {
      fileType: detectFileType(message.document.file_name ?? null, message.document.mime_type ?? null),
      fileName: message.document.file_name ?? null,
      mimeType: message.document.mime_type ?? null,
      telegramFileId: message.document.file_id,
      telegramFileUniqueId: message.document.file_unique_id ?? null,
      size: message.document.file_size ?? null,
    };
  }

  const largestPhoto = message.photo?.reduce((largest, current) => {
    if (!largest) {
      return current;
    }

    return (current.file_size ?? 0) > (largest.file_size ?? 0) ? current : largest;
  }, message.photo?.[0]);

  if (largestPhoto) {
    return {
      fileType: 'IMAGE',
      fileName: null,
      mimeType: 'image/jpeg',
      telegramFileId: largestPhoto.file_id,
      telegramFileUniqueId: largestPhoto.file_unique_id ?? null,
      size: largestPhoto.file_size ?? null,
    };
  }

  return null;
}

export function inferImportDecision(input: {
  fileType: TelegramInboundFileType;
  fileName: string | null;
  caption: string | null;
}): InboundDecision {
  if (input.fileType === 'PDF' || input.fileType === 'IMAGE') {
    return {
      processingStatus: 'REVIEW_REQUIRED',
      inferredImportType: null,
      reason: 'File type requires manual review.',
    };
  }

  if (input.fileType !== 'CSV' && input.fileType !== 'XLSX') {
    return {
      processingStatus: 'NEEDS_REVIEW',
      inferredImportType: null,
      reason: 'Unsupported or ambiguous file type.',
    };
  }

  const combined = `${lower(input.caption)} ${lower(input.fileName)}`;

  if (combined.includes('supplier') || combined.includes('price')) {
    return {
      processingStatus: 'RECEIVED',
      inferredImportType: 'supplier-price-list',
      reason: 'Matched supplier/price keywords.',
    };
  }

  if (combined.includes('inventory') || combined.includes('stock')) {
    return {
      processingStatus: 'RECEIVED',
      inferredImportType: 'inventory',
      reason: 'Matched inventory/stock keywords.',
    };
  }

  if (combined.includes('sales')) {
    return {
      processingStatus: 'RECEIVED',
      inferredImportType: 'sales',
      reason: 'Matched sales keyword.',
    };
  }

  return {
    processingStatus: 'NEEDS_REVIEW',
    inferredImportType: null,
    reason: 'Could not infer import type confidently from caption or filename.',
  };
}

export function buildSenderDisplayName(message: TelegramMessage): string | null {
  const parts = [
    message.from?.first_name?.trim(),
    message.from?.last_name?.trim(),
    message.from?.username ? `@${message.from.username.trim()}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : null;
}
