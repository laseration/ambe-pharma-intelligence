import type { ParsedEmailBodyResult } from '../parsing';
import type { PurchaseOrderPdfExtraction } from '../purchaseOrderPdf';
import type { ImportResponse, UploadFile } from '../../imports/types';
import type { AccountOpeningCase, AccountOpeningCasePersistenceInput } from '../../accountOpening/service';
import type { EmailTriageResult, EmailTriageStatus } from './triage';

export type EmailInboundFileType = 'CSV' | 'XLSX' | 'PDF' | 'IMAGE' | 'UNKNOWN';

export type EmailInboundProcessingStatus =
  | 'RECEIVED'
  | 'IMPORTED'
  | 'NEEDS_REVIEW'
  | 'REVIEW_REQUIRED'
  | 'IGNORED'
  | 'FAILED';

export type EmailInboundImportType = 'supplier-price-list' | 'inventory' | 'sales';

export type EmailInboundConfidence = 'HIGH' | 'LOW';

export type EmailAttachmentInput = {
  fileName?: string | null;
  mimeType?: string | null;
  content?: Buffer | string | null;
  size?: number | null;
  contentId?: string | null;
  disposition?: string | null;
};

export type EmailInboundMessage = {
  sourceSystem?: string | null;
  externalMessageId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  from: string;
  fromName?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  rawHtml?: string | null;
  receivedAt?: Date | null;
  supplierName?: string | null;
  attachments?: EmailAttachmentInput[];
};

export type NormalizedEmailAttachment = {
  fileType: EmailInboundFileType;
  fileName: string | null;
  mimeType: string | null;
  buffer: Buffer | null;
  size: number | null;
  contentId: string | null;
  disposition: string | null;
};

export type EmailInboundDecision = {
  processingStatus: EmailInboundProcessingStatus;
  inferredImportType: EmailInboundImportType | null;
  confidence: EmailInboundConfidence;
  reason: string;
};

export type EmailInboundSupplierMapping = {
  pattern: string;
  supplierName: string;
};

export type EmailInboundItemResult = {
  processingStatus: EmailInboundProcessingStatus;
  inferredImportType: EmailInboundImportType | null;
  confidence: EmailInboundConfidence;
  reason: string;
  fileType: EmailInboundFileType;
  attachment: {
    fileName: string | null;
    mimeType: string | null;
    size: number | null;
    contentId: string | null;
    disposition: string | null;
  };
  email: {
    messageId: string | null;
    from: string;
    subject: string;
    bodyText: string;
  };
  importBatchId?: string;
  importSummary?: ImportResponse['summary'];
  errors?: ImportResponse['errors'];
  error?: string;
  triageStatus?: EmailTriageStatus;
  triageReasons?: string[];
  triageScores?: {
    supplierLikelihoodScore: number;
    structureScore: number;
    businessWorthinessScore: number;
  };
  parserConfidence?: EmailTriageResult['parserConfidence'];
  aiEligible?: boolean;
  aiEscalated?: boolean;
  aiBlockedReason?: string | null;
  triageMetrics?: EmailTriageResult['metrics'];
  textParsing?: ParsedEmailBodyResult;
  attachmentTextExtraction?: {
    method: 'PDF_TEXT' | 'IMAGE_OCR';
    text: string;
    extractedTextChars: number;
    warnings: string[];
  };
  purchaseOrderPdf?: PurchaseOrderPdfExtraction;
  accountOpeningCase?: AccountOpeningCase;
};

export type EmailInboundResult = {
  ignored: boolean;
  reason?: string;
  items: EmailInboundItemResult[];
};

export type EmailInboundDependencies = {
  inferImportDecision: (input: {
    senderEmail: string;
    subject: string | null;
    fileName: string | null;
    fileType: EmailInboundFileType;
  }) => EmailInboundDecision;
  isTrustedSender?: (senderEmail: string) => boolean;
  importSupplierPriceList: (request: {
    file: UploadFile;
    supplierName?: string;
    sourceDate?: string;
    currencyCode?: string;
  }) => Promise<ImportResponse>;
  importInventory: (request: { file: UploadFile }) => Promise<ImportResponse>;
  importSales: (request: { file: UploadFile }) => Promise<ImportResponse>;
  parseUploadedFile: (file: UploadFile) => { rows: Record<string, string>[]; warnings: string[] };
  parseTextMessage: (rawText: string) => Promise<ParsedEmailBodyResult>;
  extractAttachmentText: (
    attachment: NormalizedEmailAttachment,
  ) => Promise<{
    method: 'PDF_TEXT' | 'IMAGE_OCR';
    text: string;
    warnings: string[];
  } | null>;
  persistAccountOpeningCase?: (input: AccountOpeningCasePersistenceInput) => Promise<unknown>;
  allowedSenders: string[];
  supplierMappings: EmailInboundSupplierMapping[];
  emailReviewEnabled?: boolean;
  emailReviewDailyLimit?: number;
  emailReviewPerSupplierDailyLimit?: number;
  emailReviewMinBusinessScore?: number;
  listStoredReviewItems?: () => Array<{
    createdAt: Date;
    updatedAt: Date;
    email: { from: string; subject: string; bodyText: string; messageId: string | null };
    triageStatus?: EmailTriageStatus;
    aiEscalated?: boolean;
  }>;
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
};
