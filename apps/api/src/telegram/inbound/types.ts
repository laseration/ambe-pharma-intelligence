import type {
  TelegramInboundFileType,
  TelegramInboundProcessingStatus,
} from '@prisma/client';

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

export type TelegramMessage = {
  message_id: number;
  caption?: string;
  text?: string;
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
    title?: string;
  };
  document?: {
    file_id: string;
    file_unique_id?: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  photo?: Array<{
    file_id: string;
    file_unique_id?: string;
    file_size?: number;
    width?: number;
    height?: number;
  }>;
};

export type InboundAttachment = {
  fileType: TelegramInboundFileType;
  fileName: string | null;
  mimeType: string | null;
  telegramFileId: string;
  telegramFileUniqueId: string | null;
  size: number | null;
};

export type InboundDecision = {
  processingStatus: TelegramInboundProcessingStatus;
  inferredImportType: 'supplier-price-list' | 'inventory' | 'sales' | null;
  reason: string;
};
