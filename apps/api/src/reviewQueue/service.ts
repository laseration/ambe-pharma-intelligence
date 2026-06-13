import { db } from '../lib/db';
import { summarizeBuyExecution } from '../buyExecutions/service';
import {
  automationService,
  type AutomationReadinessOverview,
  type OfferFeedbackSummary,
} from '../automation/service';
import {
  buildSigningNotesFromPersistedCase,
  listOpenAccountOpeningCases,
  type AccountOpeningSigningNotes,
  type PersistedAccountOpeningReviewCase,
} from '../accountOpening/service';
import { offerCorrectionService } from '../corrections/service';
import {
  tradeOpportunityService,
  type EnrichedTradeOpportunityRecord,
} from '../deals/service';
import {
  listStoredEmailReviewItems,
  type StoredEmailReviewItem,
} from '../email/inbound/reviewStore';
import { listOpenRegulatoryReviewQueueItems } from '../regulatory/service';
import {
  supplierScorecardService,
  type SupplierScorecardRecord,
} from '../suppliers/scorecardService';
import { listInboundItems } from '../telegram/inbound/service';
import {
  buildReviewSummary,
  describeReviewReason,
  type ReviewSummary,
} from './summary';
import { offerWorkflowService } from './workflowService';

type TelegramReviewItem = Awaited<ReturnType<typeof listInboundItems>>[number];
type OfferWorkflowReviewItem = Awaited<
  ReturnType<typeof offerWorkflowService.listWorkflowItems>
>[number];
type RegulatoryReviewItem = Awaited<
  ReturnType<typeof listOpenRegulatoryReviewQueueItems>
>[number];

export type ReviewQueueItem = {
  id: string;
  sourceType:
    | 'TELEGRAM_INBOUND'
    | 'EMAIL_INBOUND'
    | 'EMAIL_DERIVED_OFFER'
    | 'REGULATORY_REVIEW'
    | 'ACCOUNT_OPENING';
  receivedAt: Date | null;
  sender: string | null;
  fileName: string | null;
  subject: string | null;
  processingStatus: string;
  reason: string;
  workflowPriority?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  workflowAssignee?: string | null;
  qualificationStatus?: string | null;
  qualificationRiskSummary?: string | null;
  hasBuyDecision?: boolean;
  buyDecisionId?: string | null;
  hasBuyExecution?: boolean;
  buyExecutionId?: string | null;
  hasTradeOpportunity?: boolean;
  tradeOpportunityId?: string | null;
  tradeOpportunityStatus?: string | null;
  tradeOpportunityStage?: string | null;
  tradeEstimatedMarginAmount?: number | null;
  tradeEstimatedMarginPct?: number | null;
  tradeMessagingPolicyViolationCount?: number | null;
  executionFulfillmentStatus?: string | null;
  executionReconciliationStatus?: string | null;
  hasCommercialDrift?: boolean;
  hasOperatorFeedback?: boolean;
  hasOfferCorrection?: boolean;
  sourceReliabilityTier?: string | null;
  sourceReliabilityScore?: number | null;
  hasLearnedSupplierSuggestion?: boolean;
  learnedSupplierName?: string | null;
  hasLearnedProductSuggestion?: boolean;
  learnedProductName?: string | null;
  hasLearnedManufacturerSuggestion?: boolean;
  learnedManufacturer?: string | null;
  learningRecommendedAction?: string | null;
  extractionFeedbackVerdict?: string | null;
  supplierResolutionFeedbackVerdict?: string | null;
  signalFeedbackVerdict?: string | null;
  automationMode?: string | null;
  automationEligibleForInternalSignals?: boolean | null;
  automationEligibleForDrafts?: boolean | null;
  automationBlockedReasons?: string[];
  automationRecommendedAction?: string | null;
  supplierPerformanceSummary?: Pick<
    SupplierScorecardRecord,
    'qualificationStatus' | 'fulfillmentRate' | 'score' | 'tier' | 'summary'
  > | null;
  recommendedNextAction?: string | null;
  reviewSummary: ReviewSummary | null;
  linkedImportBatch: {
    id: string;
    kind: string | null;
    status: string | null;
    totalRows?: number | null;
    validRows?: number | null;
    invalidRows?: number | null;
  } | null;
  regulatoryReviewItemId?: string | null;
  regulatorySignalId?: string | null;
  regulatoryAlertId?: string | null;
  regulatorySeverity?: string | null;
  regulatoryEventType?: string | null;
  sourceUrl?: string | null;
  accountOpeningSigningNotes?: AccountOpeningSigningNotes;
};

type ReviewQueueDependencies = {
  listTelegramInboundItems: () => Promise<TelegramReviewItem[]>;
  listEmailReviewItems: () => StoredEmailReviewItem[];
  listAccountOpeningCases?: () => Promise<PersistedAccountOpeningReviewCase[]>;
  listEmailDerivedOfferItems: () => Promise<OfferWorkflowReviewItem[]>;
  listRegulatoryReviewItems: () => Promise<RegulatoryReviewItem[]>;
  getSupplierScorecardsForIds: (
    supplierIds: string[],
  ) => Promise<Record<string, SupplierScorecardRecord>>;
  getTradeOpportunitiesForOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<Record<string, EnrichedTradeOpportunityRecord>>;
  getOfferFeedbackSummariesForOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<Record<string, OfferFeedbackSummary>>;
  getOfferLearningSummariesForOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<
    Record<
      string,
      Awaited<
        ReturnType<
          typeof offerCorrectionService.getOfferLearningSummariesForOfferIds
        >
      >[string]
    >
  >;
  getAutomationReadinessOverview: () => Promise<AutomationReadinessOverview>;
};

const REVIEW_STATUSES = new Set(['NEEDS_REVIEW', 'REVIEW_REQUIRED', 'FAILED']);

function mapTelegramItem(item: TelegramReviewItem): ReviewQueueItem | null {
  if (!REVIEW_STATUSES.has(item.processingStatus)) {
    return null;
  }

  const metadata =
    item.metadata &&
    typeof item.metadata === 'object' &&
    !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, unknown>)
      : null;
  const reason =
    (typeof metadata?.reason === 'string' && metadata.reason) ||
    item.errorMessage ||
    'Queued for internal review.';
  const textParsing =
    metadata?.textParsing &&
    typeof metadata.textParsing === 'object' &&
    !Array.isArray(metadata.textParsing)
      ? (metadata.textParsing as Record<string, unknown>)
      : null;
  const reviewSummary = buildReviewSummary({
    processingStatus: item.processingStatus,
    fileType: item.fileType,
    fileName: item.fileName,
    inferredImportType:
      typeof metadata?.inferredImportType === 'string'
        ? metadata.inferredImportType
        : null,
    reason,
    sender:
      item.senderDisplayName || item.telegramUserId || item.telegramChatId,
    subjectOrCaption: item.caption,
    parsedLineCount:
      typeof textParsing?.parsedRows === 'object' &&
      Array.isArray(textParsing.parsedRows)
        ? textParsing.parsedRows.length
        : null,
  });

  return {
    id: `telegram-review-${item.id}`,
    sourceType: 'TELEGRAM_INBOUND',
    receivedAt: item.createdAt,
    sender:
      item.senderDisplayName || item.telegramUserId || item.telegramChatId,
    fileName: item.fileName,
    subject: item.caption,
    processingStatus: item.processingStatus,
    reason: describeReviewReason({ reason }),
    reviewSummary,
    linkedImportBatch: item.linkedImportBatch
      ? {
          id: item.linkedImportBatch.id,
          kind: item.linkedImportBatch.kind,
          status: item.linkedImportBatch.status,
          totalRows: item.linkedImportBatch.totalRows,
          validRows: item.linkedImportBatch.validRows,
          invalidRows: item.linkedImportBatch.invalidRows,
        }
      : null,
  };
}

function mapEmailItem(item: StoredEmailReviewItem): ReviewQueueItem | null {
  if (!REVIEW_STATUSES.has(item.processingStatus)) {
    return null;
  }

  const textParsing =
    item.textParsing &&
    typeof item.textParsing === 'object' &&
    !Array.isArray(item.textParsing)
      ? (item.textParsing as Record<string, unknown>)
      : null;
  const reviewSummary = buildReviewSummary({
    processingStatus: item.processingStatus,
    fileType: item.fileType,
    fileName: item.attachment.fileName,
    inferredImportType: item.inferredImportType,
    reason: item.error || item.reason,
    sender: item.email.from,
    subjectOrCaption: item.email.subject || null,
    triageBlockedReason: item.aiBlockedReason ?? null,
    parsedLineCount:
      typeof textParsing?.parsedRows === 'object' &&
      Array.isArray(textParsing.parsedRows)
        ? textParsing.parsedRows.length
        : null,
  });

  return {
    id: item.id,
    sourceType: 'EMAIL_INBOUND',
    receivedAt: item.updatedAt,
    sender: item.email.from,
    fileName: item.attachment.fileName,
    subject: item.email.subject || null,
    processingStatus: item.processingStatus,
    reason: describeReviewReason({
      reason: item.error || item.reason || 'Queued for internal review.',
    }),
    reviewSummary,
    linkedImportBatch: item.importBatchId
      ? {
          id: item.importBatchId,
          kind: null,
          status: null,
          totalRows: item.importSummary?.totalRows ?? null,
          validRows: item.importSummary?.validRows ?? null,
          invalidRows: item.importSummary?.invalidRows ?? null,
        }
      : null,
  };
}

function mapAccountOpeningCase(
  item: PersistedAccountOpeningReviewCase,
): ReviewQueueItem | null {
  if (!['PENDING_REVIEW', 'NEEDS_INFO'].includes(item.status)) {
    return null;
  }

  const signingNotes = buildSigningNotesFromPersistedCase(item);
  const riskFlags = signingNotes.riskFlags;
  const missingFields = signingNotes.missingOrUnclear;
  const reviewSummary = buildReviewSummary({
    processingStatus: item.status,
    fileType: 'PDF',
    fileName: null,
    inferredImportType: null,
    reason: 'Account opening form detected',
    sender: item.senderEmail,
    subjectOrCaption: item.subject,
    accountOpeningCase: {
      extractedTextSummary:
        item.extractedTextSummary ?? 'Persisted account-opening review case.',
      riskFlags,
      missingFields,
      signingSummary: {
        detectedNames: signingNotes.detectedNames,
        detectedSignatureRoles: signingNotes.detectedRolesOrSections,
        signingExplanation:
          item.signingExplanation ?? signingNotes.defaultSigningStatement,
        escalationNotes: [],
      },
    },
  });

  return {
    id: `account-opening-${item.id}`,
    sourceType: 'ACCOUNT_OPENING',
    receivedAt: item.receivedAt ?? item.updatedAt,
    sender: item.senderEmail,
    fileName: null,
    subject: item.subject,
    processingStatus: item.status,
    reason:
      'Account opening form detected - review required before completion/signing.',
    reviewSummary,
    accountOpeningSigningNotes: signingNotes,
    linkedImportBatch: null,
  };
}

function resolveWorkflowSupplierId(
  item: OfferWorkflowReviewItem,
): string | null {
  if (item.buyDecision?.supplierId) {
    return item.buyDecision.supplierId;
  }

  const selectedSupplier = item.emailDerivedOffer?.resolutionCandidates?.find(
    (candidate) => candidate.entityType === 'SUPPLIER' && candidate.selected,
  );

  return selectedSupplier?.candidateId ?? null;
}

function mapEmailDerivedOfferItem(
  item: OfferWorkflowReviewItem,
  supplierScorecard: SupplierScorecardRecord | null,
  tradeOpportunity: EnrichedTradeOpportunityRecord | null,
  feedbackSummary: OfferFeedbackSummary | null,
  learningSummary:
    | Awaited<
        ReturnType<
          typeof offerCorrectionService.getOfferLearningSummariesForOfferIds
        >
      >[string]
    | null,
  readinessOverview: AutomationReadinessOverview,
): ReviewQueueItem | null {
  if (
    !['NEW', 'IN_REVIEW', 'NEEDS_INFO', 'APPROVED_TO_BUY', 'ORDERED'].includes(
      item.status,
    )
  ) {
    return null;
  }

  const metadata =
    item.emailDerivedOffer?.metadata &&
    typeof item.emailDerivedOffer.metadata === 'object' &&
    !Array.isArray(item.emailDerivedOffer.metadata)
      ? (item.emailDerivedOffer.metadata as Record<string, unknown>)
      : null;
  const executionSummary = item.buyDecision
    ? summarizeBuyExecution(
        item.buyDecision as never,
        item.buyDecision.execution ?? null,
      )
    : null;
  const recommendedNextAction =
    tradeOpportunity?.summary.recommendedNextStep ??
    learningSummary?.recommendedNextAction ??
    (supplierScorecard?.summary.recommendedAction === 'restrict supplier'
      ? 'restrict supplier'
      : (executionSummary?.recommendedNextAction ??
        (item.status === 'APPROVED_TO_BUY'
          ? 'place order'
          : item.status === 'ORDERED'
            ? 'confirm order'
            : 'review offer')));
  const draftBlockedReasons = Array.from(
    new Set([
      ...readinessOverview.decisions.supplierDrafts.blockedReasons,
      ...readinessOverview.decisions.buyerDrafts.blockedReasons,
    ]),
  );

  const reviewSummary = buildReviewSummary({
    processingStatus: item.status,
    fileType: 'UNKNOWN',
    fileName: null,
    inferredImportType: 'supplier-price-list',
    reason: item.sourceReviewReason ?? 'Email-derived offer requires review.',
    sender: typeof metadata?.sender === 'string' ? metadata.sender : null,
    subjectOrCaption:
      typeof metadata?.subject === 'string' ? metadata.subject : null,
    parsedLineCount: 1,
    qualificationStatus: item.supplierQualificationStatus,
    qualificationRiskSummary: item.qualificationRiskNote,
    hasBuyDecision: Boolean(item.buyDecision),
    hasUnresolvedSupplier: item.hasUnresolvedSupplier,
    hasConflictingSupplierCues: item.hasConflictingSupplierCues,
    hasManufacturerAmbiguity: item.hasManufacturerAmbiguity,
  });

  return {
    id: `email-derived-offer-${item.id}`,
    sourceType: 'EMAIL_DERIVED_OFFER',
    receivedAt: item.updatedAt,
    sender: typeof metadata?.sender === 'string' ? metadata.sender : null,
    fileName: null,
    subject: typeof metadata?.subject === 'string' ? metadata.subject : null,
    processingStatus: item.status,
    reason: describeReviewReason({
      reason: item.sourceReviewReason ?? 'Email-derived offer requires review.',
      hasUnresolvedSupplier: item.hasUnresolvedSupplier,
      hasConflictingSupplierCues: item.hasConflictingSupplierCues,
      hasManufacturerAmbiguity: item.hasManufacturerAmbiguity,
    }),
    workflowPriority: item.priority,
    workflowAssignee: item.assigneeLabel,
    qualificationStatus: item.supplierQualificationStatus,
    qualificationRiskSummary: item.qualificationRiskNote,
    hasBuyDecision: Boolean(item.buyDecision),
    buyDecisionId: item.buyDecision?.id ?? null,
    hasBuyExecution: Boolean(item.buyDecision?.execution),
    buyExecutionId: item.buyDecision?.execution?.id ?? null,
    hasTradeOpportunity: Boolean(tradeOpportunity),
    tradeOpportunityId: tradeOpportunity?.id ?? null,
    tradeOpportunityStatus: tradeOpportunity?.status ?? null,
    tradeOpportunityStage: tradeOpportunity?.stage ?? null,
    tradeEstimatedMarginAmount:
      tradeOpportunity?.summary.estimatedMarginAmount ?? null,
    tradeEstimatedMarginPct:
      tradeOpportunity?.summary.estimatedMarginPct ?? null,
    tradeMessagingPolicyViolationCount:
      tradeOpportunity?.messagingPolicyViolationCount ?? null,
    executionFulfillmentStatus:
      item.buyDecision?.execution?.fulfillmentStatus ?? null,
    executionReconciliationStatus:
      executionSummary?.reconciliationStatus ?? null,
    hasCommercialDrift: executionSummary?.hasCommercialDrift ?? false,
    hasOperatorFeedback: feedbackSummary?.hasFeedback ?? false,
    hasOfferCorrection: learningSummary?.hasCorrection ?? false,
    sourceReliabilityTier: learningSummary?.sourceReliabilityTier ?? null,
    sourceReliabilityScore: learningSummary?.sourceReliabilityScore ?? null,
    hasLearnedSupplierSuggestion:
      learningSummary?.hasLearnedSupplierSuggestion ?? false,
    learnedSupplierName: learningSummary?.learnedSupplierName ?? null,
    hasLearnedProductSuggestion:
      learningSummary?.hasLearnedProductSuggestion ?? false,
    learnedProductName: learningSummary?.learnedProductName ?? null,
    hasLearnedManufacturerSuggestion:
      learningSummary?.hasLearnedManufacturerSuggestion ?? false,
    learnedManufacturer: learningSummary?.learnedManufacturer ?? null,
    learningRecommendedAction: learningSummary?.recommendedNextAction ?? null,
    extractionFeedbackVerdict: feedbackSummary?.extractionVerdict ?? null,
    supplierResolutionFeedbackVerdict:
      feedbackSummary?.supplierResolutionVerdict ?? null,
    signalFeedbackVerdict: feedbackSummary?.signalVerdict ?? null,
    automationMode: readinessOverview.policy.globalMode,
    automationEligibleForInternalSignals:
      readinessOverview.decisions.internalSignals.eligible,
    automationEligibleForDrafts:
      readinessOverview.decisions.supplierDrafts.eligible ||
      readinessOverview.decisions.buyerDrafts.eligible,
    automationBlockedReasons: draftBlockedReasons,
    automationRecommendedAction: readinessOverview.recommendedAction,
    supplierPerformanceSummary: supplierScorecard
      ? {
          qualificationStatus: supplierScorecard.qualificationStatus,
          fulfillmentRate: supplierScorecard.fulfillmentRate,
          score: supplierScorecard.score,
          tier: supplierScorecard.tier,
          summary: supplierScorecard.summary,
        }
      : null,
    recommendedNextAction,
    reviewSummary,
    linkedImportBatch: null,
  };
}

function mapRegulatoryReviewItem(
  item: RegulatoryReviewItem,
): ReviewQueueItem | null {
  if (!['NEW', 'REVIEWING'].includes(item.status)) {
    return null;
  }

  const update = item.regulatorySignal.regulatoryUpdate;
  const reviewSummary = buildReviewSummary({
    processingStatus: item.status,
    sourceType: 'REGULATORY_REVIEW',
    fileType: null,
    fileName: null,
    inferredImportType: null,
    reason: item.reason,
    sender: update.regulator,
    subjectOrCaption: update.title,
  });

  return {
    id: `regulatory-review-${item.id}`,
    sourceType: 'REGULATORY_REVIEW',
    receivedAt: update.publishedAt ?? item.createdAt,
    sender: update.regulator,
    fileName: null,
    subject: update.title,
    processingStatus: item.status,
    reason: describeReviewReason({ reason: 'Regulatory update needs review' }),
    workflowPriority:
      item.priority === 'CRITICAL' || item.priority === 'HIGH'
        ? 'HIGH'
        : item.priority === 'LOW'
          ? 'LOW'
          : 'MEDIUM',
    workflowAssignee: item.assigneeLabel,
    recommendedNextAction: 'review regulatory update',
    reviewSummary,
    linkedImportBatch: null,
    regulatoryReviewItemId: item.id,
    regulatorySignalId: item.regulatorySignalId,
    regulatorySeverity: item.regulatorySignal.severity,
    regulatoryEventType: item.regulatorySignal.eventType,
    sourceUrl: update.sourceUrl,
  };
}

export function createReviewQueueService(
  overrides?: Partial<ReviewQueueDependencies>,
) {
  const dependencies: ReviewQueueDependencies = {
    listTelegramInboundItems: async () => listInboundItems({}),
    listEmailReviewItems: () => listStoredEmailReviewItems(),
    listAccountOpeningCases: async () => {
      try {
        return await listOpenAccountOpeningCases();
      } catch {
        return [];
      }
    },
    listEmailDerivedOfferItems: async () => {
      if (!('offerWorkflowItem' in db) || !db.offerWorkflowItem) {
        return [];
      }

      try {
        return await offerWorkflowService.listWorkflowItems({
          onlyOpen: true,
          staleFirst: false,
          take: 100,
        });
      } catch {
        return [];
      }
    },
    listRegulatoryReviewItems: async () => {
      try {
        return await listOpenRegulatoryReviewQueueItems();
      } catch {
        return [];
      }
    },
    getSupplierScorecardsForIds: async (supplierIds) =>
      supplierScorecardService.getScorecardsForSupplierIds(supplierIds),
    getTradeOpportunitiesForOfferIds: async (emailDerivedOfferIds) =>
      tradeOpportunityService.getActiveTradeOpportunitiesForOfferIds(
        emailDerivedOfferIds,
      ),
    getOfferFeedbackSummariesForOfferIds: async (emailDerivedOfferIds) =>
      automationService.getOfferFeedbackSummariesForOfferIds(
        emailDerivedOfferIds,
      ),
    getOfferLearningSummariesForOfferIds: async (emailDerivedOfferIds) =>
      offerCorrectionService.getOfferLearningSummariesForOfferIds(
        emailDerivedOfferIds,
      ),
    getAutomationReadinessOverview: async () =>
      automationService.getReadinessOverview(),
    ...overrides,
  };

  return {
    async listItems(): Promise<ReviewQueueItem[]> {
      const [
        telegramItems,
        emailItems,
        accountOpeningCases,
        emailDerivedOfferItems,
        regulatoryReviewItems,
      ] = await Promise.all([
        dependencies.listTelegramInboundItems(),
        Promise.resolve(dependencies.listEmailReviewItems()),
        dependencies.listAccountOpeningCases?.() ?? Promise.resolve([]),
        dependencies.listEmailDerivedOfferItems(),
        dependencies.listRegulatoryReviewItems(),
      ]);
      const persistedAccountOpeningFingerprints = new Set(
        accountOpeningCases.map((item) => item.sourceFingerprint),
      );
      const emailReviewItems = emailItems.filter(
        (item) =>
          !item.accountOpeningCase ||
          !persistedAccountOpeningFingerprints.has(
            item.accountOpeningCase.sourceFingerprint,
          ),
      );
      const supplierScorecards = await dependencies.getSupplierScorecardsForIds(
        emailDerivedOfferItems.flatMap((item) => {
          const supplierId = resolveWorkflowSupplierId(item);
          return supplierId ? [supplierId] : [];
        }),
      );
      const tradeOpportunities =
        await dependencies.getTradeOpportunitiesForOfferIds(
          emailDerivedOfferItems.map((item) => item.emailDerivedOfferId),
        );
      const offerFeedbackSummaries =
        emailDerivedOfferItems.length > 0
          ? await dependencies.getOfferFeedbackSummariesForOfferIds(
              emailDerivedOfferItems.map((item) => item.emailDerivedOfferId),
            )
          : {};
      const offerLearningSummaries =
        emailDerivedOfferItems.length > 0
          ? await dependencies.getOfferLearningSummariesForOfferIds(
              emailDerivedOfferItems.map((item) => item.emailDerivedOfferId),
            )
          : {};
      const readinessOverview =
        emailDerivedOfferItems.length > 0
          ? await dependencies.getAutomationReadinessOverview()
          : ({
              policy: {
                globalMode: 'INTERNAL_SIGNALS_ONLY',
              },
              evaluation: {
                readinessRecommendation: 'review more samples',
              },
              decisions: {
                internalSignals: { eligible: false, blockedReasons: [] },
                supplierDrafts: { eligible: false, blockedReasons: [] },
                buyerDrafts: { eligible: false, blockedReasons: [] },
              },
              recommendedAction: 'review more samples',
            } as unknown as AutomationReadinessOverview);

      return [
        ...telegramItems.map(mapTelegramItem),
        ...emailReviewItems.map(mapEmailItem),
        ...accountOpeningCases.map(mapAccountOpeningCase),
        ...regulatoryReviewItems.map(mapRegulatoryReviewItem),
        ...emailDerivedOfferItems.map((item) =>
          mapEmailDerivedOfferItem(
            item,
            (() => {
              const supplierId = resolveWorkflowSupplierId(item);
              return supplierId
                ? (supplierScorecards[supplierId] ?? null)
                : null;
            })(),
            tradeOpportunities[item.emailDerivedOfferId] ?? null,
            offerFeedbackSummaries[item.emailDerivedOfferId] ?? null,
            offerLearningSummaries[item.emailDerivedOfferId] ?? null,
            readinessOverview,
          ),
        ),
      ]
        .filter((item): item is ReviewQueueItem => Boolean(item))
        .sort((left, right) => {
          const leftTime = left.receivedAt?.getTime() ?? 0;
          const rightTime = right.receivedAt?.getTime() ?? 0;
          return rightTime - leftTime;
        });
    },
  };
}

export async function listReviewQueueItems(): Promise<ReviewQueueItem[]> {
  return createReviewQueueService().listItems();
}
