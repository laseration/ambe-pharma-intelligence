import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { db } from '../lib/db';
import {
  buildSourceTemplateFingerprint,
  extractSenderDomain,
  normalizeFingerprintText,
} from '../email/inbound/sourceFingerprint';
import { findMatchingAliasVariant } from '../imports/productMatching';
import { buildCommercialAuditMetadata } from '../audit/commercialAudit';

export type OfferCorrectionStatus = 'APPLIED' | 'SUPERSEDED' | 'REJECTED';
export type OfferCorrectionActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'APPLIED'
  | 'SUPERSEDED'
  | 'REJECTED'
  | 'NOTE_ADDED';
export type SourceReliabilityTier = 'TRUSTED' | 'WATCH' | 'RISKY';

type CorrectionActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

type OfferCorrectionRecord = {
  id: string;
  emailDerivedOfferId: string;
  offerWorkflowItemId: string | null;
  inboundEmailId: string | null;
  correctionStatus: OfferCorrectionStatus;
  correctedSupplierId: string | null;
  correctedSupplierName: string | null;
  correctedProductId: string | null;
  correctedRawProductText: string | null;
  correctedNormalizedProductName: string | null;
  correctedStrength: string | null;
  correctedDosageForm: string | null;
  correctedPackSize: string | null;
  correctedManufacturer: string | null;
  correctedUnitPrice: unknown;
  correctedCurrencyCode: string | null;
  correctedMinimumOrderQuantity: number | null;
  correctedAvailability: string | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type OfferCorrectionEventRecord = {
  id: string;
  offerCorrectionId: string;
  actionType: OfferCorrectionActionType;
  previousStatus: OfferCorrectionStatus | null;
  newStatus: OfferCorrectionStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type SourceReliabilityProfileRecord = {
  id: string;
  profileKey: string;
  sourceSystem: string;
  senderEmail: string | null;
  senderDomain: string | null;
  supplierId: string | null;
  templateFingerprint: string | null;
  sampleCount: number;
  acceptedExtractionCount: number;
  rejectedExtractionCount: number;
  correctedExtractionCount: number;
  acceptedSupplierResolutionCount: number;
  rejectedSupplierResolutionCount: number;
  aiAssistCount: number;
  reviewRequiredCount: number;
  reliabilityScore: unknown;
  reliabilityTier: SourceReliabilityTier;
  notes: string | null;
  metadata: unknown;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supplier?: {
    id: string;
    name: string;
  } | null;
};

type OfferLearningSummary = {
  hasCorrection: boolean;
  latestCorrectionStatus: OfferCorrectionStatus | null;
  latestCorrectionId: string | null;
  sourceReliabilityTier: SourceReliabilityTier | null;
  sourceReliabilityScore: number | null;
  sourceProfileId: string | null;
  hasLearnedSupplierSuggestion: boolean;
  learnedSupplierId: string | null;
  learnedSupplierName: string | null;
  hasLearnedProductSuggestion: boolean;
  learnedProductId: string | null;
  learnedProductName: string | null;
  hasLearnedManufacturerSuggestion: boolean;
  learnedManufacturer: string | null;
  recommendedNextAction:
    | 'apply learned mapping'
    | 'review manually'
    | 'trust but verify'
    | 'downgrade source'
    | 'qualify supplier'
    | 'create alias';
};

export type LearnedResolutionHints = {
  sourceReliabilityTier: SourceReliabilityTier | null;
  sourceReliabilityScore: number | null;
  supplierSuggestion: {
    supplierId: string | null;
    supplierName: string;
    confidence: number;
    reason: string;
  } | null;
  manufacturerSuggestion: {
    manufacturer: string;
    confidence: number;
    reason: string;
  } | null;
  shouldForceReview: boolean;
};

type OfferCorrectionCreateInput = CorrectionActor & {
  emailDerivedOfferId: string;
  offerWorkflowItemId?: string | null;
  inboundEmailId?: string | null;
  correctionStatus?: OfferCorrectionStatus;
  correctedSupplierId?: string | null;
  correctedSupplierName?: string | null;
  correctedProductId?: string | null;
  correctedRawProductText?: string | null;
  correctedNormalizedProductName?: string | null;
  correctedStrength?: string | null;
  correctedDosageForm?: string | null;
  correctedPackSize?: string | null;
  correctedManufacturer?: string | null;
  correctedUnitPrice?: unknown;
  correctedCurrencyCode?: string | null;
  correctedMinimumOrderQuantity?: number | null;
  correctedAvailability?: string | null;
  note?: string | null;
  metadata?: unknown;
};

type OfferCorrectionUpdateInput = CorrectionActor & {
  correctionStatus?: OfferCorrectionStatus;
  correctedSupplierId?: string | null;
  correctedSupplierName?: string | null;
  correctedProductId?: string | null;
  correctedRawProductText?: string | null;
  correctedNormalizedProductName?: string | null;
  correctedStrength?: string | null;
  correctedDosageForm?: string | null;
  correctedPackSize?: string | null;
  correctedManufacturer?: string | null;
  correctedUnitPrice?: unknown;
  correctedCurrencyCode?: string | null;
  correctedMinimumOrderQuantity?: number | null;
  correctedAvailability?: string | null;
  note?: string | null;
  metadata?: unknown;
};

type OfferRecord = {
  id: string;
  inboundEmailId: string;
  status: 'STAGED' | 'AUTO_PROMOTED' | 'REVIEW_REQUIRED' | 'REJECTED';
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  supplierCandidate: string | null;
  aiAssisted: boolean;
  metadata: unknown;
  workflowItem?: {
    id: string;
    status: string;
  } | null;
  inboundEmail?: {
    id: string;
    sourceSystem: string;
    fromEmail: string;
    senderDomain: string | null;
    subject: string | null;
    sourceTemplateFingerprint: string | null;
    attachmentSummary: unknown;
    rawText: string | null;
    receivedAt: Date | null;
    createdAt: Date;
  } | null;
};

type FeedbackRecord = {
  id: string;
  emailDerivedOfferId: string | null;
  feedbackType:
    | 'EXTRACTION'
    | 'SUPPLIER_RESOLUTION'
    | 'SIGNAL'
    | 'DEAL'
    | 'DRAFT';
  verdict:
    | 'CORRECT'
    | 'PARTIALLY_CORRECT'
    | 'INCORRECT'
    | 'USEFUL'
    | 'NOT_USEFUL'
    | 'SAFE'
    | 'POLICY_ISSUE';
  createdAt: Date;
};

type ProductAliasRecord = {
  id: string;
  productId: string;
  aliasName: string;
};

type SourceProfileLookupInput = {
  sourceSystem: string | null | undefined;
  senderEmail: string | null | undefined;
  senderDomain?: string | null | undefined;
  templateFingerprint?: string | null | undefined;
};

type OfferCorrectionFilters = {
  emailDerivedOfferId?: string | null;
  inboundEmailId?: string | null;
  offerWorkflowItemId?: string | null;
  status?: OfferCorrectionStatus | null;
  take?: number;
};

type SourceReliabilityProfileFilters = {
  reliabilityTier?: SourceReliabilityTier | null;
  senderEmail?: string | null;
  senderDomain?: string | null;
  supplierId?: string | null;
  take?: number;
};

type OfferCorrectionRepository = {
  transaction: <T>(
    callback: (repository: OfferCorrectionRepository) => Promise<T>,
  ) => Promise<T>;
  findOfferById: (emailDerivedOfferId: string) => Promise<OfferRecord | null>;
  listOffersByIds: (emailDerivedOfferIds: string[]) => Promise<OfferRecord[]>;
  listOffersForSourceProfile: (input: {
    sourceSystem: string;
    senderEmail: string | null;
    senderDomain: string | null;
    templateFingerprint: string | null;
  }) => Promise<OfferRecord[]>;
  listCorrections: (
    filters: OfferCorrectionFilters,
  ) => Promise<OfferCorrectionRecord[]>;
  findCorrectionById: (
    correctionId: string,
  ) => Promise<OfferCorrectionRecord | null>;
  findEquivalentActiveCorrection: (input: {
    emailDerivedOfferId: string;
    correctionStatus: OfferCorrectionStatus;
    actorType: string;
    actorIdentifier: string | null;
    payloadHash: string;
    createdAfter: Date;
  }) => Promise<OfferCorrectionRecord | null>;
  createCorrection: (
    data: Record<string, unknown>,
  ) => Promise<OfferCorrectionRecord>;
  updateCorrection: (
    correctionId: string,
    data: Record<string, unknown>,
  ) => Promise<OfferCorrectionRecord>;
  createCorrectionEvent: (
    data: Record<string, unknown>,
  ) => Promise<OfferCorrectionEventRecord>;
  listFeedbackByOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<FeedbackRecord[]>;
  findSourceProfileByKey: (
    profileKey: string,
  ) => Promise<SourceReliabilityProfileRecord | null>;
  findSourceProfileById: (
    sourceProfileId: string,
  ) => Promise<SourceReliabilityProfileRecord | null>;
  listSourceProfiles: (
    filters: SourceReliabilityProfileFilters,
  ) => Promise<SourceReliabilityProfileRecord[]>;
  createSourceProfile: (
    data: Record<string, unknown>,
  ) => Promise<SourceReliabilityProfileRecord>;
  updateSourceProfile: (
    sourceProfileId: string,
    data: Record<string, unknown>,
  ) => Promise<SourceReliabilityProfileRecord>;
  listSourceProfilesForLookup: (
    input: SourceProfileLookupInput,
  ) => Promise<SourceReliabilityProfileRecord[]>;
  findSupplierById: (
    supplierId: string,
  ) => Promise<{ id: string; name: string } | null>;
  findProductById: (
    productId: string,
  ) => Promise<{ id: string; name: string } | null>;
  findAliasByRawName: (
    rawProductText: string,
  ) => Promise<
    (ProductAliasRecord & { product: { id: string; name: string } }) | null
  >;
  listAliasesForProduct: (productId: string) => Promise<ProductAliasRecord[]>;
  createProductAlias: (
    data: Record<string, unknown>,
  ) => Promise<ProductAliasRecord>;
};

function normalizeActor(actor?: CorrectionActor): {
  actorType: string;
  actorIdentifier: string | null;
} {
  return {
    actorType: actor?.actorType?.trim() || 'OPERATOR',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null;
  return normalized || null;
}

function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  return normalizeString(value)?.toUpperCase() ?? null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    typeof value === 'object' &&
    value &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function round(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissingSourceLearningTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /does not exist/i.test(error.message) &&
    /(OfferCorrection|OfferCorrectionEvent|SourceReliabilityProfile)/i.test(
      error.message,
    )
  );
}

function buildProfileKey(input: {
  sourceSystem: string;
  senderEmail: string | null;
  senderDomain: string | null;
  templateFingerprint: string | null;
}): string {
  return hashValue(
    [
      normalizeFingerprintText(input.sourceSystem),
      normalizeFingerprintText(input.senderEmail),
      normalizeFingerprintText(input.senderDomain),
      normalizeFingerprintText(input.templateFingerprint),
    ].join('|'),
  );
}

function buildCorrectionPayloadHash(input: {
  correctionStatus: OfferCorrectionStatus;
  correctedSupplierId: string | null;
  correctedSupplierName: string | null;
  correctedProductId: string | null;
  correctedRawProductText: string | null;
  correctedNormalizedProductName: string | null;
  correctedStrength: string | null;
  correctedDosageForm: string | null;
  correctedPackSize: string | null;
  correctedManufacturer: string | null;
  correctedUnitPrice: number | null;
  correctedCurrencyCode: string | null;
  correctedMinimumOrderQuantity: number | null;
  correctedAvailability: string | null;
  note: string | null;
}): string {
  return hashValue(JSON.stringify(input));
}

function manufacturerHintKey(input: {
  correctedNormalizedProductName?: string | null;
  correctedRawProductText?: string | null;
  normalizedProductNameCandidate?: string | null;
  rawProductText?: string | null;
}): string | null {
  const value =
    normalizeFingerprintText(input.correctedNormalizedProductName) ||
    normalizeFingerprintText(input.correctedRawProductText) ||
    normalizeFingerprintText(input.normalizedProductNameCandidate) ||
    normalizeFingerprintText(input.rawProductText);

  return value || null;
}

function latestByOfferId<
  T extends { emailDerivedOfferId: string | null; createdAt: Date },
>(records: T[]): Map<string, T> {
  const map = new Map<string, T>();

  for (const record of records) {
    if (!record.emailDerivedOfferId) {
      continue;
    }

    const existing = map.get(record.emailDerivedOfferId);
    if (!existing || record.createdAt > existing.createdAt) {
      map.set(record.emailDerivedOfferId, record);
    }
  }

  return map;
}

function parseProfileMetadata(metadata: unknown): {
  learnedManufacturerHints: Record<
    string,
    { manufacturer: string; count: number }
  >;
} {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      learnedManufacturerHints: {},
    };
  }

  const record = metadata as Record<string, unknown>;
  const learnedManufacturerHints =
    record.learnedManufacturerHints &&
    typeof record.learnedManufacturerHints === 'object' &&
    !Array.isArray(record.learnedManufacturerHints)
      ? (record.learnedManufacturerHints as Record<
          string,
          { manufacturer: string; count: number }
        >)
      : {};

  return {
    learnedManufacturerHints,
  };
}

function calculateReliabilityScore(input: {
  sampleCount: number;
  acceptedExtractionCount: number;
  rejectedExtractionCount: number;
  correctedExtractionCount: number;
  acceptedSupplierResolutionCount: number;
  rejectedSupplierResolutionCount: number;
  aiAssistCount: number;
  reviewRequiredCount: number;
}): { score: number; tier: SourceReliabilityTier } {
  const extractionDenominator =
    input.acceptedExtractionCount + input.rejectedExtractionCount;
  const supplierDenominator =
    input.acceptedSupplierResolutionCount +
    input.rejectedSupplierResolutionCount;
  const extractionPrecision =
    extractionDenominator > 0
      ? input.acceptedExtractionCount / extractionDenominator
      : 0.5;
  const supplierPrecision =
    supplierDenominator > 0
      ? input.acceptedSupplierResolutionCount / supplierDenominator
      : 0.5;
  const correctionBurden =
    input.sampleCount > 0
      ? input.correctedExtractionCount / input.sampleCount
      : 0;
  const reviewBurden =
    input.sampleCount > 0 ? input.reviewRequiredCount / input.sampleCount : 0;
  const aiAssistBurden =
    input.sampleCount > 0 ? input.aiAssistCount / input.sampleCount : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      round(
        30 +
          extractionPrecision * 35 +
          supplierPrecision * 20 -
          correctionBurden * 10 -
          reviewBurden * 10 -
          aiAssistBurden * 5,
        4,
      ),
    ),
  );

  if (score >= 75 && input.sampleCount >= 3) {
    return { score, tier: 'TRUSTED' };
  }

  if (score >= 45) {
    return { score, tier: 'WATCH' };
  }

  return { score, tier: 'RISKY' };
}

function correctionDataFromInput(
  input: OfferCorrectionCreateInput | OfferCorrectionUpdateInput,
) {
  return {
    correctionStatus: input.correctionStatus ?? 'APPLIED',
    correctedSupplierId: normalizeString(input.correctedSupplierId),
    correctedSupplierName: normalizeString(input.correctedSupplierName),
    correctedProductId: normalizeString(input.correctedProductId),
    correctedRawProductText: normalizeString(input.correctedRawProductText),
    correctedNormalizedProductName: normalizeString(
      input.correctedNormalizedProductName,
    ),
    correctedStrength: normalizeString(input.correctedStrength),
    correctedDosageForm: normalizeString(input.correctedDosageForm),
    correctedPackSize: normalizeString(input.correctedPackSize),
    correctedManufacturer: normalizeString(input.correctedManufacturer),
    correctedUnitPrice: toNumber(input.correctedUnitPrice),
    correctedCurrencyCode: normalizeCurrencyCode(input.correctedCurrencyCode),
    correctedMinimumOrderQuantity:
      typeof input.correctedMinimumOrderQuantity === 'number'
        ? input.correctedMinimumOrderQuantity
        : null,
    correctedAvailability: normalizeString(input.correctedAvailability),
    note: normalizeString(input.note),
    metadata: input.metadata ?? null,
  };
}

function correctedFieldNames(correction: OfferCorrectionRecord): string[] {
  return [
    ['correctedSupplierId', correction.correctedSupplierId],
    ['correctedSupplierName', correction.correctedSupplierName],
    ['correctedProductId', correction.correctedProductId],
    ['correctedRawProductText', correction.correctedRawProductText],
    [
      'correctedNormalizedProductName',
      correction.correctedNormalizedProductName,
    ],
    ['correctedStrength', correction.correctedStrength],
    ['correctedDosageForm', correction.correctedDosageForm],
    ['correctedPackSize', correction.correctedPackSize],
    ['correctedManufacturer', correction.correctedManufacturer],
    ['correctedUnitPrice', correction.correctedUnitPrice],
    ['correctedCurrencyCode', correction.correctedCurrencyCode],
    [
      'correctedMinimumOrderQuantity',
      correction.correctedMinimumOrderQuantity,
    ],
    ['correctedAvailability', correction.correctedAvailability],
  ]
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([field]) => String(field));
}

function buildCorrectionEventMetadata(input: {
  correction: OfferCorrectionRecord;
  actionType: OfferCorrectionActionType;
  previousStatus: OfferCorrectionStatus | null;
  newStatus: OfferCorrectionStatus | null;
  metadata?: unknown;
}) {
  return buildCommercialAuditMetadata(
    {
      entityType: 'OFFER_CORRECTION',
      entityId: input.correction.id,
      action: input.actionType,
      status: {
        previous: input.previousStatus,
        next: input.newStatus,
      },
      source: {
        inboundEmailId: input.correction.inboundEmailId,
        emailDerivedOfferId: input.correction.emailDerivedOfferId,
        offerWorkflowItemId: input.correction.offerWorkflowItemId,
      },
      changedFields: correctedFieldNames(input.correction),
    },
    input.metadata ?? input.correction.metadata,
  );
}

function createOfferCorrectionRepository(
  client: typeof db | Prisma.TransactionClient = db,
  inTransaction = false,
): OfferCorrectionRepository {
  return {
    transaction: async (callback) => {
      if (inTransaction) {
        return callback(createOfferCorrectionRepository(client, true));
      }

      return db.$transaction(async (tx) =>
        callback(createOfferCorrectionRepository(tx as never, true)),
      );
    },
    findOfferById: async (emailDerivedOfferId) =>
      client.emailDerivedOffer.findUnique({
        where: { id: emailDerivedOfferId },
        include: {
          workflowItem: {
            select: {
              id: true,
              status: true,
            },
          },
          inboundEmail: {
            select: {
              id: true,
              sourceSystem: true,
              fromEmail: true,
              senderDomain: true,
              subject: true,
              sourceTemplateFingerprint: true,
              attachmentSummary: true,
              rawText: true,
              receivedAt: true,
              createdAt: true,
            },
          },
        },
      }) as Promise<OfferRecord | null>,
    listOffersByIds: async (emailDerivedOfferIds) =>
      (await client.emailDerivedOffer.findMany({
        where: {
          id: {
            in: emailDerivedOfferIds,
          },
        },
        include: {
          workflowItem: {
            select: {
              id: true,
              status: true,
            },
          },
          inboundEmail: {
            select: {
              id: true,
              sourceSystem: true,
              fromEmail: true,
              senderDomain: true,
              subject: true,
              sourceTemplateFingerprint: true,
              attachmentSummary: true,
              rawText: true,
              receivedAt: true,
              createdAt: true,
            },
          },
        },
      })) as OfferRecord[],
    listOffersForSourceProfile: async (input) =>
      (await client.emailDerivedOffer.findMany({
        where: {
          inboundEmail: {
            sourceSystem: input.sourceSystem,
            fromEmail: input.senderEmail ?? undefined,
            senderDomain: input.senderDomain ?? undefined,
            sourceTemplateFingerprint: input.templateFingerprint ?? undefined,
          },
        },
        include: {
          workflowItem: {
            select: {
              id: true,
              status: true,
            },
          },
          inboundEmail: {
            select: {
              id: true,
              sourceSystem: true,
              fromEmail: true,
              senderDomain: true,
              subject: true,
              sourceTemplateFingerprint: true,
              attachmentSummary: true,
              rawText: true,
              receivedAt: true,
              createdAt: true,
            },
          },
        },
      })) as OfferRecord[],
    listCorrections: async (filters) => {
      const where: Record<string, unknown> = {};
      if (filters.emailDerivedOfferId) {
        where.emailDerivedOfferId = filters.emailDerivedOfferId;
      }
      if (filters.inboundEmailId) {
        where.inboundEmailId = filters.inboundEmailId;
      }
      if (filters.offerWorkflowItemId) {
        where.offerWorkflowItemId = filters.offerWorkflowItemId;
      }
      if (filters.status) {
        where.correctionStatus = filters.status;
      }
      try {
        return (await client.offerCorrection.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: filters.take ?? 100,
        })) as OfferCorrectionRecord[];
      } catch (error) {
        if (isMissingSourceLearningTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    findCorrectionById: async (correctionId) => {
      try {
        return (await client.offerCorrection.findUnique({
          where: { id: correctionId },
        })) as OfferCorrectionRecord | null;
      } catch (error) {
        if (isMissingSourceLearningTableError(error)) {
          return null;
        }

        throw error;
      }
    },
    findEquivalentActiveCorrection: async (input) => {
      const existing = await client.offerCorrection.findFirst({
        where: {
          emailDerivedOfferId: input.emailDerivedOfferId,
          actorType: input.actorType,
          actorIdentifier: input.actorIdentifier,
          correctionStatus: input.correctionStatus,
          createdAt: {
            gte: input.createdAfter,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!existing) {
        return null;
      }

      const currentHash = buildCorrectionPayloadHash({
        correctionStatus: existing.correctionStatus,
        correctedSupplierId: existing.correctedSupplierId,
        correctedSupplierName: existing.correctedSupplierName,
        correctedProductId: existing.correctedProductId,
        correctedRawProductText: existing.correctedRawProductText,
        correctedNormalizedProductName: existing.correctedNormalizedProductName,
        correctedStrength: existing.correctedStrength,
        correctedDosageForm: existing.correctedDosageForm,
        correctedPackSize: existing.correctedPackSize,
        correctedManufacturer: existing.correctedManufacturer,
        correctedUnitPrice: toNumber(existing.correctedUnitPrice),
        correctedCurrencyCode: existing.correctedCurrencyCode,
        correctedMinimumOrderQuantity: existing.correctedMinimumOrderQuantity,
        correctedAvailability: existing.correctedAvailability,
        note: existing.note,
      });

      return currentHash === input.payloadHash
        ? (existing as OfferCorrectionRecord)
        : null;
    },
    createCorrection: async (data) =>
      client.offerCorrection.create({
        data: data as never,
      }) as Promise<OfferCorrectionRecord>,
    updateCorrection: async (correctionId, data) =>
      client.offerCorrection.update({
        where: { id: correctionId },
        data: data as never,
      }) as Promise<OfferCorrectionRecord>,
    createCorrectionEvent: async (data) =>
      client.offerCorrectionEvent.create({
        data: data as never,
      }) as Promise<OfferCorrectionEventRecord>,
    listFeedbackByOfferIds: async (emailDerivedOfferIds) =>
      (await client.operatorValidationFeedback.findMany({
        where: {
          emailDerivedOfferId: {
            in: emailDerivedOfferIds,
          },
        },
        orderBy: { createdAt: 'desc' },
      })) as FeedbackRecord[],
    findSourceProfileByKey: async (profileKey) => {
      try {
        return (await client.sourceReliabilityProfile.findUnique({
          where: { profileKey },
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })) as SourceReliabilityProfileRecord | null;
      } catch (error) {
        if (isMissingSourceLearningTableError(error)) {
          return null;
        }

        throw error;
      }
    },
    findSourceProfileById: async (sourceProfileId) => {
      try {
        return (await client.sourceReliabilityProfile.findUnique({
          where: { id: sourceProfileId },
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })) as SourceReliabilityProfileRecord | null;
      } catch (error) {
        if (isMissingSourceLearningTableError(error)) {
          return null;
        }

        throw error;
      }
    },
    listSourceProfiles: async (filters) => {
      const where: Record<string, unknown> = {};
      if (filters.reliabilityTier) {
        where.reliabilityTier = filters.reliabilityTier;
      }
      if (filters.senderEmail) {
        where.senderEmail = filters.senderEmail;
      }
      if (filters.senderDomain) {
        where.senderDomain = filters.senderDomain;
      }
      if (filters.supplierId) {
        where.supplierId = filters.supplierId;
      }

      try {
        return (await client.sourceReliabilityProfile.findMany({
          where,
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { reliabilityScore: 'desc' },
            { sampleCount: 'desc' },
            { updatedAt: 'desc' },
          ],
          take: filters.take ?? 100,
        })) as SourceReliabilityProfileRecord[];
      } catch (error) {
        if (isMissingSourceLearningTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    createSourceProfile: async (data) =>
      client.sourceReliabilityProfile.create({
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }) as Promise<SourceReliabilityProfileRecord>,
    updateSourceProfile: async (sourceProfileId, data) =>
      client.sourceReliabilityProfile.update({
        where: { id: sourceProfileId },
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }) as Promise<SourceReliabilityProfileRecord>,
    listSourceProfilesForLookup: async (input) => {
      try {
        return (await client.sourceReliabilityProfile.findMany({
          where: {
            sourceSystem: normalizeString(input.sourceSystem) ?? undefined,
            OR: [
              input.templateFingerprint
                ? {
                    senderEmail:
                      normalizeString(input.senderEmail) ?? undefined,
                    templateFingerprint:
                      normalizeString(input.templateFingerprint) ?? undefined,
                  }
                : undefined,
              input.templateFingerprint
                ? {
                    senderDomain:
                      normalizeString(
                        input.senderDomain ??
                          extractSenderDomain(input.senderEmail),
                      ) ?? undefined,
                    templateFingerprint:
                      normalizeString(input.templateFingerprint) ?? undefined,
                  }
                : undefined,
              {
                senderEmail: normalizeString(input.senderEmail) ?? undefined,
              },
              {
                senderDomain:
                  normalizeString(
                    input.senderDomain ??
                      extractSenderDomain(input.senderEmail),
                  ) ?? undefined,
              },
            ].filter(Boolean) as Array<Record<string, unknown>>,
          },
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { reliabilityScore: 'desc' },
            { sampleCount: 'desc' },
            { updatedAt: 'desc' },
          ],
          take: 10,
        })) as SourceReliabilityProfileRecord[];
      } catch (error) {
        if (isMissingSourceLearningTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    findSupplierById: async (supplierId) =>
      client.supplier.findUnique({
        where: { id: supplierId },
        select: {
          id: true,
          name: true,
        },
      }),
    findProductById: async (productId) =>
      client.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
        },
      }),
    findAliasByRawName: async (rawProductText) =>
      client.productAlias.findFirst({
        where: {
          aliasName: rawProductText,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }) as Promise<
        (ProductAliasRecord & { product: { id: string; name: string } }) | null
      >,
    listAliasesForProduct: async (productId) =>
      (await client.productAlias.findMany({
        where: { productId },
      })) as ProductAliasRecord[],
    createProductAlias: async (data) =>
      client.productAlias.create({
        data: data as never,
      }) as Promise<ProductAliasRecord>,
  };
}

async function ensureCorrectedProductAlias(
  repository: OfferCorrectionRepository,
  correction: Pick<
    OfferCorrectionRecord,
    'correctedProductId' | 'correctedRawProductText'
  >,
) {
  if (!correction.correctedProductId || !correction.correctedRawProductText) {
    return;
  }

  const existingAliases = await repository.listAliasesForProduct(
    correction.correctedProductId,
  );
  const existingVariant = findMatchingAliasVariant(
    existingAliases,
    correction.correctedRawProductText,
  );

  if (existingVariant.alias) {
    return;
  }

  await repository.createProductAlias({
    productId: correction.correctedProductId,
    aliasName: correction.correctedRawProductText,
    sourceSystem: 'operator:offer-correction',
  });
}

async function refreshSourceReliabilityProfileByTuple(
  repository: OfferCorrectionRepository,
  input: {
    sourceSystem: string;
    senderEmail: string | null;
    senderDomain: string | null;
    templateFingerprint: string | null;
  },
) {
  const offers = await repository.listOffersForSourceProfile(input);
  const emailDerivedOfferIds = offers.map((offer) => offer.id);
  const feedbacks =
    emailDerivedOfferIds.length > 0
      ? await repository.listFeedbackByOfferIds(emailDerivedOfferIds)
      : [];
  const corrections =
    emailDerivedOfferIds.length > 0
      ? await repository.listCorrections({
          status: 'APPLIED',
          take: 500,
        })
      : [];
  const relevantCorrections = corrections.filter((correction) =>
    emailDerivedOfferIds.includes(correction.emailDerivedOfferId),
  );
  const latestCorrections = latestByOfferId(relevantCorrections);
  let acceptedExtractionCount = 0;
  let rejectedExtractionCount = 0;
  let acceptedSupplierResolutionCount = 0;
  let rejectedSupplierResolutionCount = 0;
  let correctedExtractionCount = 0;
  let aiAssistCount = 0;
  let reviewRequiredCount = 0;
  let lastSeenAt: Date | null = null;

  const supplierCounts = new Map<
    string,
    { supplierId: string; supplierName: string | null; count: number }
  >();
  const learnedManufacturerHints = new Map<
    string,
    { manufacturer: string; count: number }
  >();

  for (const offer of offers) {
    const extractionFeedback = feedbacks.find(
      (feedback) =>
        feedback.emailDerivedOfferId === offer.id &&
        feedback.feedbackType === 'EXTRACTION',
    );
    const supplierFeedback = feedbacks.find(
      (feedback) =>
        feedback.emailDerivedOfferId === offer.id &&
        feedback.feedbackType === 'SUPPLIER_RESOLUTION',
    );
    const latestCorrection = latestCorrections.get(offer.id);

    if (offer.aiAssisted) {
      aiAssistCount += 1;
    }
    if (offer.status === 'REVIEW_REQUIRED') {
      reviewRequiredCount += 1;
    }
    const seenAt =
      offer.inboundEmail?.receivedAt ?? offer.inboundEmail?.createdAt ?? null;
    if (seenAt && (!lastSeenAt || seenAt > lastSeenAt)) {
      lastSeenAt = seenAt;
    }

    if (extractionFeedback?.verdict === 'CORRECT') {
      acceptedExtractionCount += 1;
    } else if (extractionFeedback?.verdict === 'INCORRECT') {
      rejectedExtractionCount += 1;
    }

    if (supplierFeedback?.verdict === 'CORRECT') {
      acceptedSupplierResolutionCount += 1;
    } else if (supplierFeedback?.verdict === 'INCORRECT') {
      rejectedSupplierResolutionCount += 1;
    }

    if (latestCorrection?.correctionStatus === 'APPLIED') {
      correctedExtractionCount += 1;
      if (latestCorrection.correctedSupplierId) {
        const existingSupplier = supplierCounts.get(
          latestCorrection.correctedSupplierId,
        );
        supplierCounts.set(latestCorrection.correctedSupplierId, {
          supplierId: latestCorrection.correctedSupplierId,
          supplierName: latestCorrection.correctedSupplierName,
          count: (existingSupplier?.count ?? 0) + 1,
        });
      }

      const manufacturerKey = manufacturerHintKey({
        correctedNormalizedProductName:
          latestCorrection.correctedNormalizedProductName,
        correctedRawProductText: latestCorrection.correctedRawProductText,
        normalizedProductNameCandidate: offer.normalizedProductNameCandidate,
        rawProductText: offer.rawProductText,
      });
      if (manufacturerKey && latestCorrection.correctedManufacturer) {
        const existingManufacturerHint =
          learnedManufacturerHints.get(manufacturerKey);
        learnedManufacturerHints.set(manufacturerKey, {
          manufacturer: latestCorrection.correctedManufacturer,
          count: (existingManufacturerHint?.count ?? 0) + 1,
        });
      }
    }
  }

  const dominantSupplier =
    Array.from(supplierCounts.values()).sort(
      (left, right) => right.count - left.count,
    )[0] ?? null;
  const scoring = calculateReliabilityScore({
    sampleCount: offers.length,
    acceptedExtractionCount,
    rejectedExtractionCount,
    correctedExtractionCount,
    acceptedSupplierResolutionCount,
    rejectedSupplierResolutionCount,
    aiAssistCount,
    reviewRequiredCount,
  });
  const profileKey = buildProfileKey(input);
  const existingProfile = await repository.findSourceProfileByKey(profileKey);
  const profileData = {
    profileKey,
    sourceSystem: input.sourceSystem,
    senderEmail: input.senderEmail,
    senderDomain: input.senderDomain,
    supplierId: dominantSupplier?.supplierId ?? null,
    templateFingerprint: input.templateFingerprint,
    sampleCount: offers.length,
    acceptedExtractionCount,
    rejectedExtractionCount,
    correctedExtractionCount,
    acceptedSupplierResolutionCount,
    rejectedSupplierResolutionCount,
    aiAssistCount,
    reviewRequiredCount,
    reliabilityScore: scoring.score,
    reliabilityTier: scoring.tier,
    metadata: {
      learnedManufacturerHints: Object.fromEntries(
        learnedManufacturerHints.entries(),
      ),
    },
    lastSeenAt,
  };

  if (!existingProfile) {
    try {
      return await repository.createSourceProfile(profileData);
    } catch (error) {
      if (!isMissingSourceLearningTableError(error)) {
        throw error;
      }

      return {
        id: `ephemeral-${profileKey}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        supplier: null,
        notes: null,
        ...profileData,
      } as SourceReliabilityProfileRecord;
    }
  }

  try {
    return await repository.updateSourceProfile(
      existingProfile.id,
      profileData,
    );
  } catch (error) {
    if (!isMissingSourceLearningTableError(error)) {
      throw error;
    }

    return {
      ...existingProfile,
      ...profileData,
      supplier: existingProfile.supplier ?? null,
      updatedAt: new Date(),
    } as SourceReliabilityProfileRecord;
  }
}

function sourceTupleFromOffer(offer: OfferRecord): {
  sourceSystem: string;
  senderEmail: string | null;
  senderDomain: string | null;
  templateFingerprint: string | null;
} | null {
  if (!offer.inboundEmail) {
    return null;
  }

  return {
    sourceSystem: offer.inboundEmail.sourceSystem,
    senderEmail: offer.inboundEmail.fromEmail,
    senderDomain:
      offer.inboundEmail.senderDomain ??
      extractSenderDomain(offer.inboundEmail.fromEmail),
    templateFingerprint:
      offer.inboundEmail.sourceTemplateFingerprint ??
      buildSourceTemplateFingerprint({
        sourceSystem: offer.inboundEmail.sourceSystem,
        senderEmail: offer.inboundEmail.fromEmail,
        subject: offer.inboundEmail.subject,
        attachmentSummary: offer.inboundEmail.attachmentSummary,
        bodyText: offer.inboundEmail.rawText,
      }),
  };
}

function chooseProfileForHintLookup(
  profiles: SourceReliabilityProfileRecord[],
  input: {
    senderEmail: string | null;
    senderDomain: string | null;
    templateFingerprint: string | null;
  },
): SourceReliabilityProfileRecord | null {
  const rankedProfiles = profiles
    .map((profile) => {
      let matchWeight = 0;
      if (
        normalizeFingerprintText(profile.senderEmail) ===
          normalizeFingerprintText(input.senderEmail) &&
        normalizeFingerprintText(profile.templateFingerprint) ===
          normalizeFingerprintText(input.templateFingerprint)
      ) {
        matchWeight = 4;
      } else if (
        normalizeFingerprintText(profile.senderDomain) ===
          normalizeFingerprintText(input.senderDomain) &&
        normalizeFingerprintText(profile.templateFingerprint) ===
          normalizeFingerprintText(input.templateFingerprint)
      ) {
        matchWeight = 3;
      } else if (
        normalizeFingerprintText(profile.senderEmail) ===
        normalizeFingerprintText(input.senderEmail)
      ) {
        matchWeight = 2;
      } else if (
        normalizeFingerprintText(profile.senderDomain) ===
        normalizeFingerprintText(input.senderDomain)
      ) {
        matchWeight = 1;
      }

      return {
        profile,
        matchWeight,
        reliabilityScore: toNumber(profile.reliabilityScore) ?? 0,
      };
    })
    .filter((entry) => entry.matchWeight > 0)
    .sort(
      (left, right) =>
        right.matchWeight - left.matchWeight ||
        right.reliabilityScore - left.reliabilityScore ||
        right.profile.sampleCount - left.profile.sampleCount,
    );

  return rankedProfiles[0]?.profile ?? null;
}

async function buildOfferLearningSummary(
  repository: OfferCorrectionRepository,
  offer: OfferRecord,
  latestCorrection: OfferCorrectionRecord | null,
): Promise<OfferLearningSummary> {
  const sourceTuple = sourceTupleFromOffer(offer);
  const profile = sourceTuple
    ? await refreshSourceReliabilityProfileByTuple(repository, sourceTuple)
    : null;
  const learnedHints = sourceTuple
    ? await getLearnedResolutionHintsWithRepository(repository, {
        sourceSystem: sourceTuple.sourceSystem,
        senderEmail: sourceTuple.senderEmail,
        senderDomain: sourceTuple.senderDomain,
        templateFingerprint: sourceTuple.templateFingerprint,
        rawProductText: offer.rawProductText,
        normalizedProductNameCandidate: offer.normalizedProductNameCandidate,
      })
    : {
        sourceReliabilityTier: null,
        sourceReliabilityScore: null,
        supplierSuggestion: null,
        manufacturerSuggestion: null,
        shouldForceReview: false,
      };
  const aliasMatch = offer.rawProductText
    ? await repository.findAliasByRawName(offer.rawProductText)
    : null;

  const recommendedNextAction: OfferLearningSummary['recommendedNextAction'] =
    learnedHints.sourceReliabilityTier === 'RISKY'
      ? 'downgrade source'
      : latestCorrection?.correctionStatus === 'APPLIED' &&
          Boolean(
            latestCorrection.correctedProductId &&
            latestCorrection.correctedRawProductText,
          )
        ? 'trust but verify'
        : learnedHints.supplierSuggestion && !offer.supplierCandidate
          ? 'apply learned mapping'
          : aliasMatch && !offer.normalizedProductNameCandidate
            ? 'create alias'
            : learnedHints.sourceReliabilityTier === 'TRUSTED'
              ? 'trust but verify'
              : offer.workflowItem?.status === 'NEW'
                ? 'review manually'
                : 'qualify supplier';

  return {
    hasCorrection: Boolean(latestCorrection),
    latestCorrectionStatus: latestCorrection?.correctionStatus ?? null,
    latestCorrectionId: latestCorrection?.id ?? null,
    sourceReliabilityTier:
      profile?.reliabilityTier ?? learnedHints.sourceReliabilityTier,
    sourceReliabilityScore:
      toNumber(profile?.reliabilityScore) ??
      learnedHints.sourceReliabilityScore ??
      null,
    sourceProfileId: profile?.id ?? null,
    hasLearnedSupplierSuggestion: Boolean(learnedHints.supplierSuggestion),
    learnedSupplierId: learnedHints.supplierSuggestion?.supplierId ?? null,
    learnedSupplierName: learnedHints.supplierSuggestion?.supplierName ?? null,
    hasLearnedProductSuggestion: Boolean(
      aliasMatch || latestCorrection?.correctedProductId,
    ),
    learnedProductId:
      aliasMatch?.product.id ?? latestCorrection?.correctedProductId ?? null,
    learnedProductName: aliasMatch?.product.name ?? null,
    hasLearnedManufacturerSuggestion: Boolean(
      learnedHints.manufacturerSuggestion,
    ),
    learnedManufacturer:
      learnedHints.manufacturerSuggestion?.manufacturer ?? null,
    recommendedNextAction,
  };
}

export async function getLearnedResolutionHintsWithRepository(
  repository: OfferCorrectionRepository,
  input: SourceProfileLookupInput & {
    rawProductText?: string | null;
    normalizedProductNameCandidate?: string | null;
  },
): Promise<LearnedResolutionHints> {
  const sourceSystem = normalizeString(input.sourceSystem) ?? 'MICROSOFT_GRAPH';
  const senderEmail = normalizeString(input.senderEmail);
  const senderDomain =
    normalizeString(input.senderDomain) ??
    extractSenderDomain(input.senderEmail) ??
    null;
  const templateFingerprint = normalizeString(input.templateFingerprint);
  const profiles = await repository.listSourceProfilesForLookup({
    sourceSystem,
    senderEmail,
    senderDomain,
    templateFingerprint,
  });
  const bestProfile = chooseProfileForHintLookup(profiles, {
    senderEmail,
    senderDomain,
    templateFingerprint,
  });

  if (!bestProfile) {
    return {
      sourceReliabilityTier: null,
      sourceReliabilityScore: null,
      supplierSuggestion: null,
      manufacturerSuggestion: null,
      shouldForceReview: false,
    };
  }

  const bestProfileScore = toNumber(bestProfile.reliabilityScore) ?? null;
  const supplierSuggestion =
    bestProfile.supplierId &&
    bestProfile.supplier &&
    bestProfile.reliabilityTier !== 'RISKY' &&
    bestProfile.sampleCount >= 2
      ? {
          supplierId: bestProfile.supplier.id,
          supplierName: bestProfile.supplier.name,
          confidence:
            bestProfile.reliabilityTier === 'TRUSTED'
              ? 74
              : normalizeFingerprintText(bestProfile.templateFingerprint) ===
                  normalizeFingerprintText(templateFingerprint)
                ? 68
                : 64,
          reason:
            normalizeFingerprintText(bestProfile.templateFingerprint) ===
            normalizeFingerprintText(templateFingerprint)
              ? 'learned_source_template_supplier_hint'
              : 'learned_source_supplier_hint',
        }
      : null;

  const metadata = parseProfileMetadata(bestProfile.metadata);
  const manufacturerKey = manufacturerHintKey({
    correctedNormalizedProductName: input.normalizedProductNameCandidate,
    correctedRawProductText: input.rawProductText,
  });
  const manufacturerEvidence = manufacturerKey
    ? (metadata.learnedManufacturerHints[manufacturerKey] ?? null)
    : null;
  const manufacturerHint =
    manufacturerEvidence && manufacturerEvidence.count >= 2
      ? {
          manufacturer: manufacturerEvidence.manufacturer,
          confidence: bestProfile.reliabilityTier === 'TRUSTED' ? 64 : 58,
          reason: 'learned_source_manufacturer_hint',
        }
      : null;

  return {
    sourceReliabilityTier: bestProfile.reliabilityTier,
    sourceReliabilityScore: bestProfileScore,
    supplierSuggestion,
    manufacturerSuggestion: manufacturerHint,
    shouldForceReview: bestProfile.reliabilityTier === 'RISKY',
  };
}

export async function getLearnedResolutionHints(
  input: SourceProfileLookupInput & {
    rawProductText?: string | null;
    normalizedProductNameCandidate?: string | null;
  },
): Promise<LearnedResolutionHints> {
  return getLearnedResolutionHintsWithRepository(
    createOfferCorrectionRepository(),
    input,
  );
}

export function createOfferCorrectionService(
  repository: OfferCorrectionRepository = createOfferCorrectionRepository(),
) {
  return {
    async listCorrections(
      filters: OfferCorrectionFilters = {},
    ): Promise<OfferCorrectionRecord[]> {
      return repository.listCorrections(filters);
    },

    async createCorrection(
      input: OfferCorrectionCreateInput,
    ): Promise<OfferCorrectionRecord> {
      if (!normalizeString(input.emailDerivedOfferId)) {
        throw new Error('emailDerivedOfferId is required.');
      }

      return repository.transaction(async (txRepository) => {
        const offer = await txRepository.findOfferById(
          input.emailDerivedOfferId,
        );
        if (!offer) {
          throw new Error('Email-derived offer not found.');
        }

        const actor = normalizeActor(input);
        const correctionData = correctionDataFromInput(input);
        const payloadHash = buildCorrectionPayloadHash(correctionData);
        const existingEquivalent =
          await txRepository.findEquivalentActiveCorrection({
            emailDerivedOfferId: input.emailDerivedOfferId,
            correctionStatus: correctionData.correctionStatus,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            payloadHash,
            createdAfter: new Date(Date.now() - 5 * 60 * 1000),
          });

        if (existingEquivalent) {
          return existingEquivalent;
        }

        if (correctionData.correctionStatus === 'APPLIED') {
          const activeCorrections = await txRepository.listCorrections({
            emailDerivedOfferId: input.emailDerivedOfferId,
            status: 'APPLIED',
            take: 50,
          });
          for (const activeCorrection of activeCorrections) {
            await txRepository.updateCorrection(activeCorrection.id, {
              correctionStatus: 'SUPERSEDED',
            });
            await txRepository.createCorrectionEvent({
              offerCorrectionId: activeCorrection.id,
              actionType: 'SUPERSEDED',
              previousStatus: activeCorrection.correctionStatus,
              newStatus: 'SUPERSEDED',
              actorType: actor.actorType,
              actorIdentifier: actor.actorIdentifier,
              note: 'Superseded by a newer operator correction.',
              metadata: buildCorrectionEventMetadata({
                correction: activeCorrection,
                actionType: 'SUPERSEDED',
                previousStatus: activeCorrection.correctionStatus,
                newStatus: 'SUPERSEDED',
              }),
            });
          }
        }

        const created = await txRepository.createCorrection({
          emailDerivedOfferId: offer.id,
          offerWorkflowItemId:
            normalizeString(input.offerWorkflowItemId) ??
            offer.workflowItem?.id ??
            null,
          inboundEmailId:
            normalizeString(input.inboundEmailId) ?? offer.inboundEmailId,
          ...correctionData,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
        });
        await txRepository.createCorrectionEvent({
          offerCorrectionId: created.id,
          actionType: 'CREATED',
          previousStatus: null,
          newStatus: created.correctionStatus,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: created.note,
          metadata: buildCorrectionEventMetadata({
            correction: created,
            actionType: 'CREATED',
            previousStatus: null,
            newStatus: created.correctionStatus,
          }),
        });
        await txRepository.createCorrectionEvent({
          offerCorrectionId: created.id,
          actionType:
            created.correctionStatus === 'REJECTED' ? 'REJECTED' : 'APPLIED',
          previousStatus: null,
          newStatus: created.correctionStatus,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: created.note,
          metadata: buildCorrectionEventMetadata({
            correction: created,
            actionType:
              created.correctionStatus === 'REJECTED'
                ? 'REJECTED'
                : 'APPLIED',
            previousStatus: null,
            newStatus: created.correctionStatus,
          }),
        });

        await ensureCorrectedProductAlias(txRepository, created);
        const sourceTuple = sourceTupleFromOffer(offer);
        if (sourceTuple) {
          await refreshSourceReliabilityProfileByTuple(
            txRepository,
            sourceTuple,
          );
        }

        return created;
      });
    },

    async updateCorrection(
      correctionId: string,
      input: OfferCorrectionUpdateInput,
    ): Promise<OfferCorrectionRecord> {
      return repository.transaction(async (txRepository) => {
        const existing = await txRepository.findCorrectionById(correctionId);
        if (!existing) {
          throw new Error('Offer correction not found.');
        }

        const actor = normalizeActor(input);
        const correctionData = correctionDataFromInput({
          ...existing,
          ...input,
          correctionStatus: input.correctionStatus ?? existing.correctionStatus,
        });
        const previousStatus = existing.correctionStatus;
        if (correctionData.correctionStatus === 'APPLIED') {
          const activeCorrections = await txRepository.listCorrections({
            emailDerivedOfferId: existing.emailDerivedOfferId,
            status: 'APPLIED',
            take: 50,
          });
          for (const activeCorrection of activeCorrections) {
            if (activeCorrection.id === existing.id) {
              continue;
            }

            await txRepository.updateCorrection(activeCorrection.id, {
              correctionStatus: 'SUPERSEDED',
            });
            await txRepository.createCorrectionEvent({
              offerCorrectionId: activeCorrection.id,
              actionType: 'SUPERSEDED',
              previousStatus: activeCorrection.correctionStatus,
              newStatus: 'SUPERSEDED',
              actorType: actor.actorType,
              actorIdentifier: actor.actorIdentifier,
              note: 'Superseded by a newer operator correction.',
              metadata: buildCorrectionEventMetadata({
                correction: activeCorrection,
                actionType: 'SUPERSEDED',
                previousStatus: activeCorrection.correctionStatus,
                newStatus: 'SUPERSEDED',
              }),
            });
          }
        }
        const updated = await txRepository.updateCorrection(correctionId, {
          ...correctionData,
        });

        await txRepository.createCorrectionEvent({
          offerCorrectionId: correctionId,
          actionType: 'UPDATED',
          previousStatus,
          newStatus: updated.correctionStatus,
          actorType: actor.actorType,
          actorIdentifier: actor.actorIdentifier,
          note: correctionData.note,
          metadata: buildCorrectionEventMetadata({
            correction: updated,
            actionType: 'UPDATED',
            previousStatus,
            newStatus: updated.correctionStatus,
            metadata: correctionData.metadata,
          }),
        });

        if (previousStatus !== updated.correctionStatus) {
          await txRepository.createCorrectionEvent({
            offerCorrectionId: correctionId,
            actionType:
              updated.correctionStatus === 'REJECTED'
                ? 'REJECTED'
                : updated.correctionStatus === 'SUPERSEDED'
                  ? 'SUPERSEDED'
                  : 'APPLIED',
            previousStatus,
            newStatus: updated.correctionStatus,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            note: correctionData.note,
            metadata: buildCorrectionEventMetadata({
              correction: updated,
              actionType:
                updated.correctionStatus === 'REJECTED'
                  ? 'REJECTED'
                  : updated.correctionStatus === 'SUPERSEDED'
                    ? 'SUPERSEDED'
                    : 'APPLIED',
              previousStatus,
              newStatus: updated.correctionStatus,
              metadata: correctionData.metadata,
            }),
          });
        } else if (
          correctionData.note &&
          correctionData.note !== existing.note
        ) {
          await txRepository.createCorrectionEvent({
            offerCorrectionId: correctionId,
            actionType: 'NOTE_ADDED',
            previousStatus,
            newStatus: updated.correctionStatus,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            note: correctionData.note,
            metadata: buildCorrectionEventMetadata({
              correction: updated,
              actionType: 'NOTE_ADDED',
              previousStatus,
              newStatus: updated.correctionStatus,
              metadata: correctionData.metadata,
            }),
          });
        }

        await ensureCorrectedProductAlias(txRepository, updated);
        const offer = await txRepository.findOfferById(
          updated.emailDerivedOfferId,
        );
        const sourceTuple = offer ? sourceTupleFromOffer(offer) : null;
        if (sourceTuple) {
          await refreshSourceReliabilityProfileByTuple(
            txRepository,
            sourceTuple,
          );
        }

        return updated;
      });
    },

    async listSourceProfiles(
      filters: SourceReliabilityProfileFilters = {},
    ): Promise<SourceReliabilityProfileRecord[]> {
      const profiles = await repository.listSourceProfiles(filters);

      const refreshedProfiles: SourceReliabilityProfileRecord[] = [];
      for (const profile of profiles) {
        if (
          profile.senderEmail ||
          profile.senderDomain ||
          profile.templateFingerprint
        ) {
          refreshedProfiles.push(
            await refreshSourceReliabilityProfileByTuple(repository, {
              sourceSystem: profile.sourceSystem,
              senderEmail: profile.senderEmail,
              senderDomain: profile.senderDomain,
              templateFingerprint: profile.templateFingerprint,
            }),
          );
        } else {
          refreshedProfiles.push(profile);
        }
      }

      return refreshedProfiles;
    },

    async getSourceProfile(
      sourceProfileId: string,
    ): Promise<SourceReliabilityProfileRecord | null> {
      const profile = await repository.findSourceProfileById(sourceProfileId);
      if (!profile) {
        return null;
      }

      return refreshSourceReliabilityProfileByTuple(repository, {
        sourceSystem: profile.sourceSystem,
        senderEmail: profile.senderEmail,
        senderDomain: profile.senderDomain,
        templateFingerprint: profile.templateFingerprint,
      });
    },

    async getOfferLearningSummariesForOfferIds(
      emailDerivedOfferIds: string[],
    ): Promise<Record<string, OfferLearningSummary>> {
      if (emailDerivedOfferIds.length === 0) {
        return {};
      }

      const offers = await repository.listOffersByIds(emailDerivedOfferIds);
      const corrections = await repository.listCorrections({
        status: 'APPLIED',
        take: 500,
      });
      const latestCorrections = latestByOfferId(
        corrections.filter((correction) =>
          emailDerivedOfferIds.includes(correction.emailDerivedOfferId),
        ),
      );

      const summaries: Record<string, OfferLearningSummary> = {};
      for (const offer of offers) {
        summaries[offer.id] = await buildOfferLearningSummary(
          repository,
          offer,
          latestCorrections.get(offer.id) ?? null,
        );
      }

      return summaries;
    },
  };
}

export const offerCorrectionService = createOfferCorrectionService();
