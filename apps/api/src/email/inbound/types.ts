import type { ParsedEmailBodyResult } from '../parsing';
import type {
  ImportResponse,
  ParsedFileResult,
  UploadFile,
} from '../../imports/types';
import type {
  AccountOpeningCase,
  AccountOpeningCasePersistenceInput,
} from '../../accountOpening/service';
import type { EmailTriageResult, EmailTriageStatus } from './triage';

export type EmailInboundFileType = 'CSV' | 'XLSX' | 'PDF' | 'IMAGE' | 'UNKNOWN';

export type EmailInboundProcessingStatus =
  | 'RECEIVED'
  | 'IMPORTED'
  | 'NEEDS_REVIEW'
  | 'REVIEW_REQUIRED'
  | 'IGNORED'
  | 'FAILED';

export type EmailInboundImportType =
  | 'supplier-price-list'
  | 'inventory'
  | 'sales';

export type EmailInboundConfidence = 'HIGH' | 'LOW';

export type InboundDocumentClass =
  | 'ACCOUNT_OPENING_FORM'
  | 'SUPPLIER_PRICE_LIST'
  | 'SUPPLIER_CONTACT_FORM'
  | 'SUPPLIER_ONBOARDING_OR_KYC'
  | 'INVENTORY_REPORT'
  | 'SALES_REPORT'
  | 'INVOICE'
  | 'STATEMENT'
  | 'ORDER_CONFIRMATION'
  | 'DELIVERY_NOTE'
  | 'UNKNOWN_OR_AMBIGUOUS';

export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ClassificationRouting =
  | 'ACCOUNT_OPENING_REVIEW'
  | 'SUPPLIER_IMPORT'
  | 'SUPPLIER_CONTACT_REVIEW'
  | 'SUPPLIER_ONBOARDING_REVIEW'
  | 'INVENTORY_IMPORT'
  | 'SALES_IMPORT'
  | 'MANUAL_REVIEW'
  | 'ARCHIVE_OR_IGNORE';

export type ClassificationEvidenceSource =
  | 'TRUSTED_MAPPING'
  | 'FROM'
  | 'SENDER'
  | 'REPLY_TO'
  | 'RFC5322_HEADER'
  | 'SUBJECT'
  | 'BODY'
  | 'ATTACHMENT_NAME'
  | 'MIME_TYPE'
  | 'TABLE_HEADER'
  | 'TABLE_VALUE'
  | 'PDF_TEXT'
  | 'OCR_TEXT'
  | 'FORM_STRUCTURE';

export type ClassificationEvidence = {
  source: ClassificationEvidenceSource;
  signal: string;
  weight: number;
  snippet?: string;
  attachmentId?: string;
  page?: number;
};

export type ClassificationDecision = {
  primaryClass: InboundDocumentClass;
  confidence: ClassificationConfidence;
  score: number;
  runnerVersion: string;
  routing: ClassificationRouting;
  safeToAutoRoute: boolean;
  evidence: ClassificationEvidence[];
  negativeEvidence: ClassificationEvidence[];
  conflicts: string[];
  attachmentDecisions: Array<{
    attachmentId: string;
    class: InboundDocumentClass;
    confidence: ClassificationConfidence;
    score: number;
    conflicts: string[];
  }>;
  reason: string;
};

export type Rfc5322Header = {
  name: string;
  value: string;
};

export type EmailAttachmentInput = {
  fileName?: string | null;
  mimeType?: string | null;
  content?: Buffer | string | null;
  size?: number | null;
  contentId?: string | null;
  disposition?: string | null;
  graphAttachmentId?: string | null;
};

export type EmailInboundMessage = {
  sourceSystem?: string | null;
  externalMessageId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  from: string;
  fromName?: string | null;
  sender?: string | null;
  senderName?: string | null;
  replyTo?: Array<{ email: string; name?: string | null }> | null;
  internetMessageHeaders?: Rfc5322Header[] | null;
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
  graphAttachmentId: string | null;
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
  /**
   * True when this attachment had already been imported under the same
   * idempotency key, so the existing import batch was reused instead of creating
   * a duplicate. The attachment is still reported as IMPORTED.
   */
  alreadyImported?: boolean;
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
  accountOpeningCase?: AccountOpeningCase;
};

export type EmailInboundResult = {
  ignored: boolean;
  reason?: string;
  items: EmailInboundItemResult[];
  /**
   * Whether the inbound email was durably persisted (staged) to the database.
   * Set by `ingestInboundEmail`. The Graph poller only marks a message read
   * when this is explicitly `true`, so a staging failure leaves the message
   * unread for retry instead of silently losing it. Optional for backward
   * compatibility with callers that build results without staging.
   */
  durablyStaged?: boolean;
  /** Sanitized staging error message, present only when `durablyStaged` is false. */
  stagingError?: string;
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
    idempotencyKey?: string;
  }) => Promise<ImportResponse>;
  importInventory: (request: {
    file: UploadFile;
    idempotencyKey?: string;
  }) => Promise<ImportResponse>;
  importSales: (request: {
    file: UploadFile;
    idempotencyKey?: string;
  }) => Promise<ImportResponse>;
  parseUploadedFile: (file: UploadFile) => Promise<ParsedFileResult>;
  parseTextMessage: (rawText: string) => Promise<ParsedEmailBodyResult>;
  extractAttachmentText: (attachment: NormalizedEmailAttachment) => Promise<{
    method: 'PDF_TEXT' | 'IMAGE_OCR';
    text: string;
    warnings: string[];
  } | null>;
  persistAccountOpeningCase?: (
    input: AccountOpeningCasePersistenceInput,
  ) => Promise<unknown>;
  replyWithFilledAccountOpeningForm?: (input: {
    caseId: string | null;
    senderEmail: string;
    attachments: NormalizedEmailAttachment[];
    supplierName?: string | null;
  }) => Promise<unknown>;
  allowedSenders: string[];
  supplierMappings: EmailInboundSupplierMapping[];
  emailReviewEnabled?: boolean;
  emailReviewDailyLimit?: number;
  emailReviewPerSupplierDailyLimit?: number;
  emailReviewMinBusinessScore?: number;
  listStoredReviewItems?: () => Array<{
    createdAt: Date;
    updatedAt: Date;
    email: {
      from: string;
      subject: string;
      bodyText: string;
      messageId: string | null;
    };
    triageStatus?: EmailTriageStatus;
    aiEscalated?: boolean;
  }>;
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
};
