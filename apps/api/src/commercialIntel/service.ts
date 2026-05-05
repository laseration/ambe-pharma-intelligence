import { createHash } from 'node:crypto';

import type {
  CommercialIntelConfidence,
  CommercialIntelItemType,
  CommercialIntelStatus,
  Prisma,
} from '@prisma/client';

import { ConflictError } from '../http/errors';
import { buildProductCandidates, normalizeText } from '../imports/normalization';
import { determineProductMatchDecision } from '../imports/productMatching';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import {
  createCommercialIntelParser,
  type CommercialIntelParser,
  type CommercialIntelParsingAttemptResult,
} from './aiParser';
import type { AiCommercialIntelItem, EmailIntentClassification } from './schema';

type CommercialIntelDocument = {
  id: string;
  kind: string;
  textContent: string;
};

type CommercialIntelActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

type CommercialIntelRepository = {
  findProductByStoredCanonicalField: (storedCanonicalField: string) => Promise<any | null>;
  findProductAliasByRawName: (rawProductName: string) => Promise<any | null>;
  listProductAliasesForCanonicalComparison: () => Promise<any[]>;
  findSupplierByNormalizedName: (normalizedName: string) => Promise<any | null>;
  upsertIntelItem: (data: Prisma.CommercialIntelItemUncheckedCreateInput) => Promise<any>;
  listIntelItems: (filters: CommercialIntelListFilters) => Promise<any[]>;
  getIntelItem: (id: string) => Promise<any | null>;
  updateIntelItem: (id: string, data: Prisma.CommercialIntelItemUncheckedUpdateInput) => Promise<any>;
};

export type CommercialIntelListFilters = {
  status?: CommercialIntelStatus | null;
  itemType?: CommercialIntelItemType | null;
  productId?: string | null;
  supplierId?: string | null;
  take?: number | null;
};

export type CommercialIntelActionInput = CommercialIntelActor & {
  action: 'APPROVE' | 'REJECT' | 'EXPIRE';
  note?: string | null;
};

export type CommercialIntelExtractionInput = {
  inboundEmailId: string;
  documents: CommercialIntelDocument[];
  senderEmail: string;
  subject: string | null;
};

export type CommercialIntelExtractionResult = {
  attempted: boolean;
  intent: EmailIntentClassification | null;
  createdOrUpdatedCount: number;
  parserStatus: CommercialIntelParsingAttemptResult['status'] | null;
  reason: string | null;
};

function createCommercialIntelRepository(client: typeof db = db): CommercialIntelRepository {
  return {
    findProductByStoredCanonicalField: (storedCanonicalField) =>
      client.product.findFirst({
        where: { normalizedName: storedCanonicalField },
      }),
    findProductAliasByRawName: (rawProductName) =>
      client.productAlias.findFirst({
        where: { aliasName: rawProductName },
        include: { product: true },
      }),
    listProductAliasesForCanonicalComparison: () =>
      client.productAlias.findMany({
        include: { product: true },
      }),
    findSupplierByNormalizedName: (normalizedName) =>
      client.supplier.findUnique({
        where: { normalizedName },
      }),
    upsertIntelItem: (data) =>
      client.commercialIntelItem.upsert({
        where: {
          inboundEmailId_itemFingerprint: {
            inboundEmailId: data.inboundEmailId!,
            itemFingerprint: data.itemFingerprint,
          },
        },
        update: {
          sourceDocumentId: data.sourceDocumentId,
          itemType: data.itemType,
          productText: data.productText,
          productId: data.productId,
          supplierName: data.supplierName,
          supplierId: data.supplierId,
          customerName: data.customerName,
          contactName: data.contactName,
          priceThreshold: data.priceThreshold,
          currency: data.currency,
          availabilitySignal: data.availabilitySignal,
          riskLevel: data.riskLevel,
          urgency: data.urgency,
          signalEffect: data.signalEffect,
          evidenceText: data.evidenceText,
          confidence: data.confidence,
          reviewReason: data.reviewReason,
          aiAssisted: data.aiAssisted,
          validUntil: data.validUntil,
          metadata: data.metadata,
        },
        create: data,
      }),
    listIntelItems: (filters) =>
      client.commercialIntelItem.findMany({
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.itemType ? { itemType: filters.itemType } : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: filters.take ?? 100,
        include: {
          inboundEmail: true,
          sourceDocument: true,
          product: true,
          supplier: true,
        },
      }),
    getIntelItem: (id) =>
      client.commercialIntelItem.findUnique({
        where: { id },
        include: {
          inboundEmail: true,
          sourceDocument: true,
          product: true,
          supplier: true,
        },
      }),
    updateIntelItem: (id, data) =>
      client.commercialIntelItem.update({
        where: { id },
        data,
        include: {
          inboundEmail: true,
          sourceDocument: true,
          product: true,
          supplier: true,
        },
      }),
  };
}

function normalizeActor(actor: CommercialIntelActor) {
  return {
    actorType: actor.actorType?.trim() || 'OPERATOR',
    actorIdentifier: actor.actorIdentifier?.trim() || null,
  };
}

function buildFingerprint(inboundEmailId: string, item: AiCommercialIntelItem): string {
  return createHash('sha256')
    .update(
      [
        inboundEmailId,
        item.itemType,
        item.evidenceText.trim().toLowerCase(),
        item.productText?.trim().toLowerCase() ?? '',
        item.supplierName?.trim().toLowerCase() ?? '',
        item.customerName?.trim().toLowerCase() ?? '',
        item.priceThreshold?.toString() ?? '',
        item.currency ?? '',
      ].join('|'),
    )
    .digest('hex');
}

function parseValidUntil(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function findSourceDocumentId(documents: CommercialIntelDocument[], evidenceText: string): string | null {
  const normalizedEvidence = evidenceText.trim();
  if (!normalizedEvidence) {
    return null;
  }

  return documents.find((document) => document.textContent.includes(normalizedEvidence))?.id ?? documents[0]?.id ?? null;
}

const COMMERCIAL_INTEL_SIGNAL_PATTERN =
  /\b(?:do not trust|don't trust|never deliver|unreliable|avoid|buyer(?:s)?|customer(?:s)?|wants?|looking|demand|buy quickly|sell quickly|manual trigger|if anyone offers|stock is tight|tight stock|price (?:likely|will|expected)\s+(?:rise|rises|fall|falls|drop|drops)|short expiry|expiry risk|market intel|supplier risk|requires review)\b/i;

function hasCommercialIntelSignal(sourceText: string): boolean {
  return COMMERCIAL_INTEL_SIGNAL_PATTERN.test(sourceText);
}

async function resolveProductId(
  repository: CommercialIntelRepository,
  productText: string | null,
): Promise<string | null> {
  if (!productText) {
    return null;
  }

  const candidates = buildProductCandidates(productText);
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: repository.findProductByStoredCanonicalField,
      findAliasByRawName: repository.findProductAliasByRawName,
      listAliasesForCanonicalComparison: repository.listProductAliasesForCanonicalComparison,
    },
    {
      rawProductName: productText,
      candidates,
    },
  );

  return decision.matchedProductId;
}

async function resolveSupplierId(
  repository: CommercialIntelRepository,
  supplierName: string | null,
): Promise<string | null> {
  if (!supplierName) {
    return null;
  }

  const supplier = await repository.findSupplierByNormalizedName(normalizeText(supplierName));
  return supplier?.id ?? null;
}

function buildReviewReason(item: AiCommercialIntelItem): string | null {
  if (item.reviewReason) {
    return item.reviewReason;
  }

  if (item.confidence === 'LOW') {
    return 'low_confidence_requires_review';
  }

  if (!item.productText && !item.supplierName && !item.customerName && !item.contactName) {
    return 'unresolved_entities';
  }

  return null;
}

function assertStatusTransitionAllowed(
  currentStatus: CommercialIntelStatus,
  action: CommercialIntelActionInput['action'],
): void {
  if (action === 'APPROVE' && (currentStatus === 'NEW' || currentStatus === 'APPROVED')) {
    return;
  }

  if (action === 'REJECT' && (currentStatus === 'NEW' || currentStatus === 'REJECTED')) {
    return;
  }

  if (action === 'EXPIRE' && (currentStatus === 'NEW' || currentStatus === 'APPROVED' || currentStatus === 'EXPIRED')) {
    return;
  }

  throw new ConflictError(`Commercial intel item cannot transition from ${currentStatus} with ${action}.`);
}

export function createCommercialIntelService(overrides?: {
  repository?: CommercialIntelRepository;
  parser?: CommercialIntelParser;
}) {
  const repository = overrides?.repository ?? createCommercialIntelRepository();
  const parser = overrides?.parser ?? createCommercialIntelParser();

  return {
    async parsePreview(rawText: string) {
      return parser.parseText({
        rawText,
        source: 'PARSE_PREVIEW',
      });
    },

    async processInboundEmail(input: CommercialIntelExtractionInput): Promise<CommercialIntelExtractionResult> {
      const sourceText = input.documents
        .filter((document) => ['BODY_MAIN', 'BODY_FORWARDED'].includes(document.kind))
        .map((document) => document.textContent)
        .join('\n\n')
        .trim();

      if (!sourceText) {
        return {
          attempted: false,
          intent: null,
          createdOrUpdatedCount: 0,
          parserStatus: null,
          reason: 'No body text was available for commercial intel extraction.',
        };
      }

      if (!hasCommercialIntelSignal(sourceText)) {
        return {
          attempted: false,
          intent: null,
          createdOrUpdatedCount: 0,
          parserStatus: null,
          reason: 'No commercial-intel language was detected before AI parsing.',
        };
      }

      const attempt = await parser.parseText({
        rawText: sourceText,
        source: 'INBOUND_EMAIL',
      });

      if (attempt.status !== 'success') {
        return {
          attempted: true,
          intent: null,
          createdOrUpdatedCount: 0,
          parserStatus: attempt.status,
          reason: attempt.reason,
        };
      }

      if (
        attempt.result.intent !== 'COMMERCIAL_INTEL' &&
        attempt.result.intent !== 'CUSTOMER_REQUEST' &&
        attempt.result.intent !== 'MIXED'
      ) {
        return {
          attempted: true,
          intent: attempt.result.intent,
          createdOrUpdatedCount: 0,
          parserStatus: attempt.status,
          reason: 'Commercial intel parser found no commercial-intel items to store.',
        };
      }

      let createdOrUpdatedCount = 0;
      for (const item of attempt.result.items) {
        const productId = await resolveProductId(repository, item.productText);
        const supplierId = await resolveSupplierId(repository, item.supplierName);
        const itemFingerprint = buildFingerprint(input.inboundEmailId, item);
        const sourceDocumentId = findSourceDocumentId(input.documents, item.evidenceText);

        await repository.upsertIntelItem({
          inboundEmailId: input.inboundEmailId,
          sourceDocumentId,
          itemType: item.itemType,
          status: 'NEW',
          productText: item.productText,
          productId,
          supplierName: item.supplierName,
          supplierId,
          customerName: item.customerName,
          contactName: item.contactName,
          priceThreshold: item.priceThreshold,
          currency: item.currency,
          availabilitySignal: item.availabilitySignal,
          riskLevel: item.riskLevel,
          urgency: item.urgency,
          signalEffect: item.signalEffect,
          evidenceText: item.evidenceText,
          confidence: item.confidence,
          reviewReason: buildReviewReason(item),
          aiAssisted: true,
          validUntil: parseValidUntil(item.validUntil),
          itemFingerprint,
          metadata: {
            intent: attempt.result.intent,
            overallConfidence: attempt.result.overallConfidence,
            reviewRecommended: attempt.result.reviewRecommended,
            notes: attempt.result.notes,
            promptVersion: attempt.promptVersion,
            requestId: attempt.requestId,
            senderEmail: input.senderEmail,
            subject: input.subject,
          },
        });
        createdOrUpdatedCount += 1;
      }

      return {
        attempted: true,
        intent: attempt.result.intent,
        createdOrUpdatedCount,
        parserStatus: attempt.status,
        reason: 'Commercial intel items were stored.',
      };
    },

    listItems(filters: CommercialIntelListFilters) {
      return repository.listIntelItems(filters);
    },

    getItem(id: string) {
      return repository.getIntelItem(id);
    },

    async updateItemStatus(id: string, input: CommercialIntelActionInput) {
      const existing = await repository.getIntelItem(id);
      if (!existing) {
        throw new Error('Commercial intel item not found.');
      }

      assertStatusTransitionAllowed(existing.status, input.action);

      if (
        (input.action === 'APPROVE' && existing.status === 'APPROVED') ||
        (input.action === 'REJECT' && existing.status === 'REJECTED') ||
        (input.action === 'EXPIRE' && existing.status === 'EXPIRED')
      ) {
        return existing;
      }

      const actor = normalizeActor(input);
      const now = new Date();
      const note = input.note?.trim() || null;

      if (input.action === 'APPROVE') {
        return repository.updateIntelItem(id, {
          status: 'APPROVED',
          approvedByType: actor.actorType,
          approvedByIdentifier: actor.actorIdentifier,
          approvedAt: now,
          rejectedByType: null,
          rejectedByIdentifier: null,
          rejectedAt: null,
          reviewReason: note,
        });
      }

      if (input.action === 'REJECT') {
        return repository.updateIntelItem(id, {
          status: 'REJECTED',
          rejectedByType: actor.actorType,
          rejectedByIdentifier: actor.actorIdentifier,
          rejectedAt: now,
          reviewReason: note ?? 'rejected_by_operator',
        });
      }

      return repository.updateIntelItem(id, {
        status: 'EXPIRED',
        reviewReason: note ?? 'expired_by_operator',
      });
    },
  };
}

export async function processInboundEmailCommercialIntel(
  input: CommercialIntelExtractionInput,
): Promise<CommercialIntelExtractionResult> {
  try {
    return await createCommercialIntelService().processInboundEmail(input);
  } catch (error) {
    logger.warn('Commercial intel extraction failed', {
      inboundEmailId: input.inboundEmailId,
      error: error instanceof Error ? error.message : 'Unknown commercial intel extraction error.',
    });
    return {
      attempted: true,
      intent: null,
      createdOrUpdatedCount: 0,
      parserStatus: 'error',
      reason: error instanceof Error ? error.message : 'Commercial intel extraction failed.',
    };
  }
}

export const commercialIntelService = createCommercialIntelService();
