import { Prisma } from '@prisma/client';

import {
  buildAccountOpeningSourceFingerprint,
  buildAccountOpeningCase,
  detectAccountOpeningEmail,
  upsertAccountOpeningCase,
} from '../../accountOpening/service';
import { env } from '../../config/env';
import { extractAttachmentText } from '../attachmentTextExtraction';
import {
  parseStructuredPriceEmailBody,
  parseStructuredPriceText,
} from '../parsing';
import { parseUploadedFile } from '../../imports/parsers';
import {
  importInventory,
  importSales,
  importSupplierPriceList,
} from '../../imports/service';
import type { ImportResponse, UploadFile } from '../../imports/types';
import { db } from '../../lib/db';
import { logger } from '../../lib/logger';
import {
  extractManualSupplierOverride,
  filterIgnorableEmailAttachments,
  inferEmailImportDecision,
  isAllowedEmailSenderForList,
  isAllowedEmailSender,
  normalizeEmailAttachment,
  resolveSupplierNameFromSender,
} from './helpers';
import {
  listStoredEmailReviewItems,
  recordEmailReviewItems,
} from './reviewStore';
import {
  scoreInboundEmailTriage,
  type EmailTriageParserConfidence,
} from './triage';
import { stageInboundEmailSafely } from './pipeline';
import type {
  EmailInboundDependencies,
  EmailInboundItemResult,
  EmailInboundImportType,
  EmailInboundMessage,
  EmailInboundResult,
  NormalizedEmailAttachment,
} from './types';

export type InboundEmailInboxStatusFilter =
  | 'REVIEW_REQUIRED'
  | 'FAILED'
  | 'RECEIVED_ONLY';

export type InboundEmailInboxListItem = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  processedAt: Date | null;
  processingStatus: string;
  triageStatus: string | null;
  parserConfidence: string | null;
  reviewReason: string | null;
  sourceTrustScore: number | null;
  structureConfidence: number | null;
  businessWorthinessScore: number | null;
  _count: {
    documents: number;
    extractionRuns: number;
    derivedOffers: number;
    offerWorkflowItems: number;
  };
};

function createUploadFile(
  attachment: NormalizedEmailAttachment,
): UploadFile | null {
  if (!attachment.buffer) {
    return null;
  }

  return {
    buffer: attachment.buffer,
    mimetype: attachment.mimeType || 'application/octet-stream',
    originalname: attachment.fileName || 'email-attachment',
    size: attachment.size ?? attachment.buffer.byteLength,
  };
}

async function runImport(
  dependencies: Pick<
    EmailInboundDependencies,
    'importSupplierPriceList' | 'importInventory' | 'importSales'
  >,
  inferredImportType: EmailInboundImportType,
  uploadFile: UploadFile,
  supplierName?: string,
): Promise<ImportResponse> {
  if (inferredImportType === 'supplier-price-list') {
    return dependencies.importSupplierPriceList({
      file: uploadFile,
      supplierName,
    });
  }

  if (inferredImportType === 'inventory') {
    return dependencies.importInventory({
      file: uploadFile,
    });
  }

  return dependencies.importSales({
    file: uploadFile,
  });
}

function mapDeterministicParserConfidence(input: {
  parsedRowCount: number;
  overallConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}): EmailTriageParserConfidence {
  if (input.parsedRowCount === 0) {
    return 'NONE';
  }

  return input.overallConfidence ?? 'LOW';
}

function buildTriageMetadata(
  item: EmailInboundItemResult,
  triage: ReturnType<typeof scoreInboundEmailTriage>,
) {
  return {
    ...item,
    triageStatus: triage.status,
    triageReasons: triage.reasons,
    triageScores: {
      supplierLikelihoodScore: triage.supplierLikelihoodScore,
      structureScore: triage.structureScore,
      businessWorthinessScore: triage.businessWorthinessScore,
    },
    parserConfidence: triage.parserConfidence,
    aiEligible: triage.aiEligible,
    aiEscalated: false,
    aiBlockedReason: triage.aiBlockedReason,
    triageMetrics: triage.metrics,
  };
}

function buildAccountOpeningReviewItem(input: {
  message: EmailInboundMessage;
  senderEmail: string;
  subject: string;
  bodyText: string;
  attachments: NormalizedEmailAttachment[];
  attachmentTexts: Array<{
    attachment: NormalizedEmailAttachment;
    text: string | null;
    method: 'PDF_TEXT' | 'IMAGE_OCR' | null;
    warnings: string[];
  }>;
  supplierName?: string;
  matchedTerms: string[];
}): EmailInboundItemResult {
  const firstAttachment = input.attachments[0] ?? null;
  const firstExtractedAttachment =
    input.attachmentTexts.find((item) => item.text?.trim()) ?? null;
  const sourceFingerprint = buildAccountOpeningSourceFingerprint({
    messageId:
      input.message.messageId ?? input.message.externalMessageId ?? null,
    externalMessageId: input.message.externalMessageId ?? null,
    senderEmail: input.senderEmail,
    subject: input.subject,
    attachmentFileNames: input.attachments.map(
      (attachment) => attachment.fileName,
    ),
    matchedTerms: input.matchedTerms,
  });
  const sourceEvidence = [
    ...(input.bodyText.trim()
      ? [
          {
            sourceType: 'EMAIL_BODY' as const,
            sourceLabel: 'Inbound email body',
            text: input.bodyText,
            rawFileAvailable: false,
            metadata: {
              messageId:
                input.message.messageId ??
                input.message.externalMessageId ??
                null,
            },
          },
        ]
      : []),
    ...input.attachments.map((attachment) => {
      const extracted = input.attachmentTexts.find(
        (entry) => entry.attachment === attachment,
      );

      return {
        sourceType: 'ATTACHMENT' as const,
        sourceLabel: attachment.fileName ?? 'Email attachment',
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.size,
        contentId: attachment.contentId,
        disposition: attachment.disposition,
        extractionMethod: extracted?.method ?? null,
        text: extracted?.text ?? null,
        rawFileAvailable: false,
        metadata: {
          rawBytesAvailableAtIngestion: Boolean(attachment.buffer),
          extractionWarnings: extracted?.warnings ?? [],
        },
      };
    }),
  ];
  const accountOpeningCase = buildAccountOpeningCase({
    senderEmail: input.senderEmail,
    senderDomain: input.senderEmail.includes('@')
      ? (input.senderEmail.split('@').pop() ?? null)
      : null,
    subject: input.subject,
    bodyText: input.bodyText,
    receivedAt: input.message.receivedAt ?? null,
    detectedCompanyOrSupplierName: input.supplierName ?? null,
    attachments: input.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      extractedText:
        input.attachmentTexts.find((entry) => entry.attachment === attachment)
          ?.text ?? null,
    })),
    sourceFingerprint,
    sourceEvidence,
  });

  return {
    processingStatus: 'REVIEW_REQUIRED',
    inferredImportType: null,
    confidence: 'HIGH',
    reason:
      'Account opening form detected - review required before completion/signing.',
    fileType: firstAttachment?.fileType ?? 'UNKNOWN',
    attachment: {
      fileName: firstAttachment?.fileName ?? null,
      mimeType: firstAttachment?.mimeType ?? null,
      size: firstAttachment?.size ?? null,
      contentId: firstAttachment?.contentId ?? null,
      disposition: firstAttachment?.disposition ?? null,
    },
    email: {
      messageId: input.message.messageId ?? null,
      from: input.senderEmail,
      subject: input.subject,
      bodyText: input.bodyText,
    },
    ...(firstExtractedAttachment?.text && firstExtractedAttachment.method
      ? {
          attachmentTextExtraction: {
            method: firstExtractedAttachment.method,
            text: firstExtractedAttachment.text,
            extractedTextChars: firstExtractedAttachment.text.length,
            warnings: firstExtractedAttachment.warnings,
          },
        }
      : {}),
    accountOpeningCase,
  };
}

function normalizeBodyFingerprint(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 500);
}

function normalizeInboxTake(value: number | null | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

export async function listInboundEmailInboxItems(options?: {
  take?: number;
  status?: InboundEmailInboxStatusFilter;
}): Promise<InboundEmailInboxListItem[]> {
  const take = normalizeInboxTake(options?.take);
  const where: Prisma.InboundEmailWhereInput =
    options?.status === 'REVIEW_REQUIRED'
      ? { processingStatus: 'REVIEW_REQUIRED' }
      : options?.status === 'FAILED'
        ? { processingStatus: 'FAILED' }
        : options?.status === 'RECEIVED_ONLY'
          ? {
              processingStatus: 'RECEIVED',
              derivedOffers: {
                none: {},
              },
              offerWorkflowItems: {
                none: {},
              },
            }
          : {};

  return db.inboundEmail.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take,
    select: {
      id: true,
      fromEmail: true,
      fromName: true,
      subject: true,
      receivedAt: true,
      createdAt: true,
      processedAt: true,
      processingStatus: true,
      triageStatus: true,
      parserConfidence: true,
      reviewReason: true,
      sourceTrustScore: true,
      structureConfidence: true,
      businessWorthinessScore: true,
      _count: {
        select: {
          documents: true,
          extractionRuns: true,
          derivedOffers: true,
          offerWorkflowItems: true,
        },
      },
    },
  });
}

export function createEmailInboundService(
  overrides?: Partial<EmailInboundDependencies>,
) {
  const dependencies: EmailInboundDependencies = {
    inferImportDecision: inferEmailImportDecision,
    importSupplierPriceList,
    importInventory,
    importSales,
    parseUploadedFile,
    parseTextMessage: async (rawText) =>
      parseStructuredPriceText(rawText, {
        source: 'EMAIL_BODY',
      }),
    extractAttachmentText,
    allowedSenders: env.emailInboundAllowedSenders,
    supplierMappings: env.emailInboundSupplierMappings,
    isTrustedSender: isAllowedEmailSender,
    emailReviewEnabled: env.openAiEmailReviewEnabled,
    emailReviewDailyLimit: env.openAiEmailReviewDailyLimit,
    emailReviewPerSupplierDailyLimit:
      env.openAiEmailReviewPerSupplierDailyLimit,
    emailReviewMinBusinessScore: env.openAiEmailReviewMinBusinessScore,
    listStoredReviewItems: listStoredEmailReviewItems,
    persistAccountOpeningCase: upsertAccountOpeningCase,
    logger,
    ...overrides,
  };

  return {
    async ingestMessage(
      message: EmailInboundMessage,
    ): Promise<EmailInboundResult> {
      const senderEmail = message.from.trim().toLowerCase();
      const trustedSender =
        dependencies.isTrustedSender?.(senderEmail) ?? false;
      const subject = message.subject?.trim() || '';
      const bodyText = message.bodyText ?? '';
      const payloadSupplierName = message.supplierName?.trim() || undefined;
      const extractedSupplierName =
        extractManualSupplierOverride({
          subject,
          bodyText,
        }) ?? undefined;

      if (!senderEmail) {
        return {
          ignored: true,
          reason: 'Sender email address is required.',
          items: [],
        };
      }

      if (
        !isAllowedEmailSenderForList(senderEmail, dependencies.allowedSenders)
      ) {
        dependencies.logger.warn(
          'Ignored inbound email from unapproved sender',
          {
            senderEmail,
            subject,
          },
        );

        return {
          ignored: true,
          reason: 'Sender is not on the email allowlist.',
          items: [],
        };
      }

      const normalizedAttachments = filterIgnorableEmailAttachments(
        (message.attachments ?? []).map(normalizeEmailAttachment),
      );
      const accountOpeningAttachmentTexts: Array<{
        attachment: NormalizedEmailAttachment;
        text: string | null;
        method: 'PDF_TEXT' | 'IMAGE_OCR' | null;
        warnings: string[];
      }> = [];

      for (const attachment of normalizedAttachments) {
        const attachmentTextExtraction =
          attachment.fileType === 'PDF' || attachment.fileType === 'IMAGE'
            ? await dependencies.extractAttachmentText(attachment)
            : null;

        accountOpeningAttachmentTexts.push({
          attachment,
          text: attachmentTextExtraction?.text ?? null,
          method: attachmentTextExtraction?.method ?? null,
          warnings: attachmentTextExtraction?.warnings ?? [],
        });
      }

      const accountOpeningDetection = detectAccountOpeningEmail({
        subject,
        bodyText,
        attachmentFileNames: normalizedAttachments.map(
          (attachment) => attachment.fileName,
        ),
        attachmentTexts: accountOpeningAttachmentTexts.map((item) => item.text),
      });

      if (accountOpeningDetection.detected) {
        const accountOpeningItem = buildAccountOpeningReviewItem({
          message,
          senderEmail,
          subject,
          bodyText,
          attachments: normalizedAttachments,
          attachmentTexts: accountOpeningAttachmentTexts,
          supplierName: payloadSupplierName ?? extractedSupplierName,
          matchedTerms: accountOpeningDetection.matchedTerms,
        });

        await dependencies.persistAccountOpeningCase?.({
          accountCase: accountOpeningItem.accountOpeningCase!,
          messageId: message.messageId ?? message.externalMessageId ?? null,
          detectedFormType: accountOpeningDetection.matchedTerms[0] ?? null,
        });
        recordEmailReviewItems([accountOpeningItem]);
        dependencies.logger.info(
          'Inbound account opening form queued for review',
          {
            senderEmail,
            subject,
            matchedTerms: accountOpeningDetection.matchedTerms,
            attachmentCount: normalizedAttachments.length,
          },
        );

        return {
          ignored: false,
          items: [accountOpeningItem],
        };
      }

      const storedReviewItems = dependencies.listStoredReviewItems?.() ?? [];
      const now = Date.now();
      const last24Hours = storedReviewItems.filter(
        (item) => now - item.updatedAt.getTime() < 24 * 60 * 60 * 1000,
      );
      const dailyAiReviewCount = last24Hours.filter(
        (item) => item.aiEscalated,
      ).length;
      const senderFingerprint = senderEmail.includes('@')
        ? (senderEmail.split('@').pop() ?? senderEmail)
        : senderEmail;
      const perSupplierDailyAiReviewCount = last24Hours.filter(
        (item) =>
          item.aiEscalated &&
          item.email.from.toLowerCase().includes(senderFingerprint),
      ).length;
      const knownSupplierEmails = dependencies.supplierMappings
        .map((mapping) => mapping.pattern.trim().toLowerCase())
        .filter((pattern) => pattern.includes('@') && !pattern.startsWith('@'));
      const knownSupplierDomains = dependencies.supplierMappings
        .map((mapping) => mapping.pattern.trim().toLowerCase())
        .filter(Boolean)
        .map((pattern) =>
          pattern.startsWith('@') ? pattern.slice(1) : pattern,
        )
        .filter((pattern) => !pattern.includes('@'));
      const duplicateBodyDetected =
        bodyText.trim() !== '' &&
        last24Hours.some(
          (item) =>
            normalizeBodyFingerprint(item.email.bodyText) ===
              normalizeBodyFingerprint(bodyText) &&
            normalizeBodyFingerprint(item.email.bodyText) !== '',
        );

      if (normalizedAttachments.length === 0) {
        const deterministicBodyParse = parseStructuredPriceEmailBody(bodyText);
        const triage = scoreInboundEmailTriage({
          fromEmail: senderEmail,
          fromName: null,
          subject,
          bodyText,
          hasAttachment: false,
          trustedSender,
          knownSupplierEmails,
          knownSupplierDomains,
          dailyAiReviewCount,
          dailyAiReviewLimit: dependencies.emailReviewDailyLimit ?? 10,
          perSupplierDailyAiReviewCount,
          perSupplierDailyAiReviewLimit:
            dependencies.emailReviewPerSupplierDailyLimit ?? 2,
          duplicateBodyDetected,
          parsedStructuredRowCount: deterministicBodyParse.parsedRows.length,
          parserConfidence: mapDeterministicParserConfidence({
            parsedRowCount: deterministicBodyParse.parsedRows.length,
            overallConfidence: deterministicBodyParse.overallConfidence,
          }),
        });

        dependencies.logger.info('Inbound email triage evaluated', {
          fromEmail: senderEmail,
          subject,
          status: triage.status,
          supplierLikelihoodScore: triage.supplierLikelihoodScore,
          structureScore: triage.structureScore,
          businessWorthinessScore: triage.businessWorthinessScore,
          parserConfidence: triage.parserConfidence,
          reasons: triage.reasons,
          preventedAiReason: triage.aiBlockedReason,
        });

        const bodyItemBase: EmailInboundItemResult = {
          processingStatus:
            triage.status === 'AI_REVIEW_ELIGIBLE' ||
            triage.status === 'MANUAL_REVIEW_REQUIRED'
              ? 'NEEDS_REVIEW'
              : triage.status === 'AUTO_PROCESSED'
                ? 'RECEIVED'
                : 'IGNORED',
          inferredImportType: null,
          confidence:
            triage.parserConfidence === 'HIGH' ||
            triage.parserConfidence === 'MEDIUM'
              ? 'HIGH'
              : 'LOW',
          reason: triage.reasons[0] ?? 'Email was triaged.',
          fileType: 'UNKNOWN',
          attachment: {
            fileName: null,
            mimeType: null,
            size: null,
            contentId: null,
            disposition: null,
          },
          email: {
            messageId: message.messageId ?? null,
            from: senderEmail,
            subject,
            bodyText,
          },
        };

        let finalBodyItem = buildTriageMetadata(bodyItemBase, triage);

        if (
          triage.status === 'AI_REVIEW_ELIGIBLE' &&
          (dependencies.emailReviewEnabled ?? false) &&
          triage.businessWorthinessScore >=
            (dependencies.emailReviewMinBusinessScore ?? 65)
        ) {
          const aiParsedResult = await parseStructuredPriceText(bodyText, {
            source: 'EMAIL_BODY',
          });
          finalBodyItem = {
            ...finalBodyItem,
            aiEscalated: aiParsedResult.aiFallbackUsed ?? false,
            aiBlockedReason:
              aiParsedResult.aiFallbackUsed === true
                ? null
                : (aiParsedResult.aiFallbackRejectedReason ??
                  triage.aiBlockedReason),
            reason: aiParsedResult.parsingReason ?? finalBodyItem.reason,
          };
        } else if (
          triage.status === 'AI_REVIEW_ELIGIBLE' &&
          !(dependencies.emailReviewEnabled ?? false)
        ) {
          finalBodyItem = {
            ...finalBodyItem,
            triageStatus: 'MANUAL_REVIEW_REQUIRED',
            aiEligible: false,
            aiBlockedReason: 'email_ai_review_disabled',
          };
        }

        recordEmailReviewItems([finalBodyItem]);

        return {
          ignored:
            finalBodyItem.triageStatus === 'IGNORED_NON_ACTIONABLE' ||
            finalBodyItem.triageStatus === 'REJECTED_LOW_VALUE',
          reason:
            finalBodyItem.triageStatus === 'IGNORED_NON_ACTIONABLE'
              ? 'Email was ignored as non-actionable.'
              : finalBodyItem.triageStatus === 'REJECTED_LOW_VALUE'
                ? 'Email was rejected as low value.'
                : undefined,
          items: [finalBodyItem],
        };
      }

      const items: EmailInboundItemResult[] = [];

      for (const attachment of normalizedAttachments) {
        const triageUploadFile =
          attachment.fileType === 'CSV' || attachment.fileType === 'XLSX'
            ? createUploadFile(attachment)
            : null;
        const attachmentTextExtraction =
          attachment.fileType === 'PDF' || attachment.fileType === 'IMAGE'
            ? await dependencies.extractAttachmentText(attachment)
            : null;
        const attachmentTextParsing = attachmentTextExtraction
          ? await dependencies.parseTextMessage(attachmentTextExtraction.text)
          : null;
        const parsedAttachment = triageUploadFile
          ? dependencies.parseUploadedFile(triageUploadFile)
          : null;
        const extractedParsedRowCount =
          attachmentTextParsing?.parsedRows.length ?? 0;
        const triage = scoreInboundEmailTriage({
          fromEmail: senderEmail,
          fromName: null,
          subject,
          bodyText,
          attachmentFileName: attachment.fileName,
          attachmentMimeType: attachment.mimeType,
          hasAttachment: true,
          trustedSender,
          knownSupplierEmails,
          knownSupplierDomains,
          dailyAiReviewCount,
          dailyAiReviewLimit: dependencies.emailReviewDailyLimit ?? 10,
          perSupplierDailyAiReviewCount,
          perSupplierDailyAiReviewLimit:
            dependencies.emailReviewPerSupplierDailyLimit ?? 2,
          duplicateBodyDetected,
          parsedStructuredRowCount:
            parsedAttachment?.rows.length ?? extractedParsedRowCount,
          parserConfidence: mapDeterministicParserConfidence({
            parsedRowCount:
              parsedAttachment?.rows.length ?? extractedParsedRowCount,
            overallConfidence:
              (parsedAttachment?.rows.length ?? extractedParsedRowCount) >= 3
                ? 'HIGH'
                : (parsedAttachment?.rows.length ?? extractedParsedRowCount) >=
                    1
                  ? (attachmentTextParsing?.overallConfidence ?? 'MEDIUM')
                  : undefined,
          }),
        });
        let decision = dependencies.inferImportDecision({
          senderEmail,
          subject,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
        });

        if (attachment.fileType === 'PDF' || attachment.fileType === 'IMAGE') {
          decision =
            extractedParsedRowCount > 0
              ? {
                  processingStatus: 'NEEDS_REVIEW',
                  inferredImportType: null,
                  confidence:
                    attachmentTextParsing?.overallConfidence === 'HIGH' ||
                    attachmentTextParsing?.overallConfidence === 'MEDIUM'
                      ? 'HIGH'
                      : 'LOW',
                  reason:
                    attachment.fileType === 'PDF'
                      ? 'Extracted structured text from the PDF attachment and queued it for review.'
                      : 'Extracted structured text from the image attachment and queued it for review.',
                }
              : attachmentTextExtraction
                ? {
                    processingStatus: 'REVIEW_REQUIRED',
                    inferredImportType: null,
                    confidence: 'LOW',
                    reason:
                      attachment.fileType === 'PDF'
                        ? 'Extracted text from the PDF attachment but found no safe structured commercial rows.'
                        : 'Extracted text from the image attachment but found no safe structured commercial rows.',
                  }
                : decision;
        }

        const baseItem = {
          processingStatus: decision.processingStatus,
          inferredImportType: decision.inferredImportType,
          confidence: decision.confidence,
          reason: decision.reason,
          fileType: attachment.fileType,
          attachment: {
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            contentId: attachment.contentId,
            disposition: attachment.disposition,
          },
          email: {
            messageId: message.messageId ?? null,
            from: senderEmail,
            subject,
            bodyText,
          },
          ...(attachmentTextParsing
            ? {
                textParsing: attachmentTextParsing,
              }
            : {}),
          ...(attachmentTextExtraction
            ? {
                attachmentTextExtraction: {
                  method: attachmentTextExtraction.method,
                  text: attachmentTextExtraction.text,
                  extractedTextChars: attachmentTextExtraction.text.length,
                  warnings: attachmentTextExtraction.warnings,
                },
              }
            : {}),
        };

        dependencies.logger.info('Inbound email triage evaluated', {
          fromEmail: senderEmail,
          subject,
          status: triage.status,
          supplierLikelihoodScore: triage.supplierLikelihoodScore,
          structureScore: triage.structureScore,
          businessWorthinessScore: triage.businessWorthinessScore,
          parserConfidence: triage.parserConfidence,
          reasons: triage.reasons,
          preventedAiReason: triage.aiBlockedReason,
        });

        if (
          decision.processingStatus === 'REVIEW_REQUIRED' ||
          decision.processingStatus === 'NEEDS_REVIEW'
        ) {
          items.push(buildTriageMetadata(baseItem, triage));
          continue;
        }

        const uploadFile = createUploadFile(attachment);

        if (!uploadFile) {
          items.push({
            ...buildTriageMetadata(baseItem, triage),
            processingStatus: 'NEEDS_REVIEW',
            confidence: 'LOW',
            reason: 'Attachment content could not be decoded safely.',
          });
          continue;
        }

        try {
          const inferredImportType = decision.inferredImportType;

          if (!inferredImportType) {
            items.push({
              ...buildTriageMetadata(baseItem, triage),
              processingStatus: 'NEEDS_REVIEW',
              confidence: 'LOW',
              reason: `${decision.reason} Import type was missing at execution time, so the attachment was queued for review.`,
            });
            continue;
          }

          let trustedSupplierName: string | undefined;
          let supplierReasonSuffix = '';

          if (inferredImportType === 'supplier-price-list') {
            const parsed =
              parsedAttachment ?? dependencies.parseUploadedFile(uploadFile);
            const attachmentRowSupplierName = parsed.rows.find(
              (row) =>
                Boolean(row.supplierName?.trim()) ||
                Boolean(row.SupplierName?.trim()) ||
                Boolean(row.supplier?.trim()),
            );
            const supplierNameFromRows =
              attachmentRowSupplierName?.supplierName?.trim() ||
              attachmentRowSupplierName?.SupplierName?.trim() ||
              attachmentRowSupplierName?.supplier?.trim() ||
              undefined;
            const supplierNameFromMapping =
              resolveSupplierNameFromSender(
                senderEmail,
                dependencies.supplierMappings,
              ) ?? undefined;

            trustedSupplierName =
              payloadSupplierName ??
              extractedSupplierName ??
              supplierNameFromRows ??
              supplierNameFromMapping;

            if (payloadSupplierName) {
              supplierReasonSuffix = ` Payload supplier override was used for ${payloadSupplierName}.`;
            } else if (extractedSupplierName) {
              supplierReasonSuffix = ` Manual supplier override from forwarded email content was used for ${extractedSupplierName}.`;
            } else if (supplierNameFromRows) {
              supplierReasonSuffix = ` Supplier name was taken from the attachment rows (${supplierNameFromRows}).`;
            } else if (supplierNameFromMapping) {
              supplierReasonSuffix = ` Trusted supplier mapping was used for ${supplierNameFromMapping}.`;
            } else {
              items.push({
                ...buildTriageMetadata(baseItem, triage),
                processingStatus: 'NEEDS_REVIEW',
                confidence: 'LOW',
                reason:
                  'Supplier price list import needs an explicit supplier override, supplierName in the attachment rows, or a trusted supplier mapping.',
              });
              continue;
            }
          }

          const importResult = await runImport(
            dependencies,
            inferredImportType,
            uploadFile,
            trustedSupplierName,
          );

          items.push({
            ...buildTriageMetadata(baseItem, triage),
            processingStatus: 'IMPORTED',
            importBatchId: importResult.importBatchId,
            importSummary: importResult.summary,
            errors: importResult.errors,
            ...(supplierReasonSuffix
              ? {
                  reason: `${decision.reason}${supplierReasonSuffix}`,
                }
              : {}),
          });

          dependencies.logger.info('Imported inbound email attachment', {
            senderEmail,
            subject,
            fileName: attachment.fileName,
            inferredImportType,
            importBatchId: importResult.importBatchId,
            supplierName: trustedSupplierName,
          });
        } catch (error) {
          const messageText =
            error instanceof Error
              ? error.message
              : 'Inbound email attachment processing failed.';

          items.push({
            ...buildTriageMetadata(baseItem, triage),
            processingStatus: 'FAILED',
            error: messageText,
          });

          dependencies.logger.error(
            'Failed to process inbound email attachment',
            {
              error: messageText,
              senderEmail,
              subject,
              fileName: attachment.fileName,
              inferredImportType: decision.inferredImportType,
            },
          );
        }
      }

      recordEmailReviewItems(items);

      return {
        ignored: false,
        items,
      };
    },
  };
}

export async function ingestInboundEmail(
  message: EmailInboundMessage,
): Promise<EmailInboundResult> {
  const result = await createEmailInboundService().ingestMessage(message);
  await stageInboundEmailSafely(message, result);
  return result;
}
