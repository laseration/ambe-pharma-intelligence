import { createHash } from 'node:crypto';

import type {
  CustomerDemandConfidence,
  CustomerDemandRequestType,
  CustomerDemandStatus,
  Prisma,
} from '@prisma/client';

import { ConflictError } from '../http/errors';
import { buildProductCandidates, normalizeText } from '../imports/normalization';
import { determineProductMatchDecision } from '../imports/productMatching';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import {
  createCustomerDemandParser,
  type CustomerDemandParser,
  type CustomerDemandParsingAttemptResult,
} from './aiParser';
import type { AiCustomerDemandItem, CustomerRequestIntent } from './schema';

type CustomerDemandDocument = {
  id: string;
  kind: string;
  textContent: string;
};

type CustomerDemandActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

type CustomerDemandRepository = {
  findProductByStoredCanonicalField: (storedCanonicalField: string) => Promise<any | null>;
  findProductAliasByRawName: (rawProductName: string) => Promise<any | null>;
  listProductAliasesForCanonicalComparison: () => Promise<any[]>;
  findCustomerByNormalizedName: (normalizedName: string) => Promise<any | null>;
  upsertDemandSignal: (data: Prisma.CustomerDemandSignalUncheckedCreateInput) => Promise<any>;
  listDemandSignals: (filters: CustomerDemandListFilters) => Promise<any[]>;
  getDemandSignal: (id: string) => Promise<any | null>;
  updateDemandSignal: (id: string, data: Prisma.CustomerDemandSignalUncheckedUpdateInput) => Promise<any>;
};

export type CustomerDemandListFilters = {
  status?: CustomerDemandStatus | null;
  requestType?: CustomerDemandRequestType | null;
  productId?: string | null;
  customerId?: string | null;
  take?: number | null;
};

export type CustomerDemandActionInput = CustomerDemandActor & {
  action: 'APPROVE' | 'REJECT' | 'EXPIRE';
  note?: string | null;
};

export type CustomerDemandExtractionInput = {
  inboundEmailId: string;
  documents: CustomerDemandDocument[];
  senderEmail: string;
  subject: string | null;
};

export type CustomerDemandExtractionResult = {
  attempted: boolean;
  intent: CustomerRequestIntent | null;
  createdOrUpdatedCount: number;
  parserStatus: CustomerDemandParsingAttemptResult['status'] | null;
  reason: string | null;
};

const CUSTOMER_REQUEST_SIGNAL_PATTERN =
  /\b(?:can you source|could you source|please source|source for us|do you have|have you got|need\s+(?:\d+\s*)?(?:packs?|boxes?|units?|stock)|looking for|any availability|please quote|request quote|customer\s+\w+\s+wants?|customer(?:s)?\s+wants?|buyer(?:s)?\s+wants?|quote us|source(?:d)?\s+for us|can you quote|please price|availability on)\b/i;

const ADMIN_ONLY_PATTERN =
  /^\s*(?:thanks|thank you|regards|kind regards|best regards|see attached invoice|invoice attached|meeting notes|minutes attached)[\s,!.]*$/i;

export function hasCustomerDemandSignal(sourceText: string): boolean {
  const normalized = sourceText.replace(/\s+/g, ' ').trim();
  if (!normalized || ADMIN_ONLY_PATTERN.test(normalized)) {
    return false;
  }

  return CUSTOMER_REQUEST_SIGNAL_PATTERN.test(normalized);
}

function createCustomerDemandRepository(client: typeof db = db): CustomerDemandRepository {
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
    findCustomerByNormalizedName: (normalizedName) =>
      client.customer.findUnique({
        where: { normalizedName },
      }),
    upsertDemandSignal: (data) =>
      client.customerDemandSignal.upsert({
        where: {
          inboundEmailId_itemFingerprint: {
            inboundEmailId: data.inboundEmailId!,
            itemFingerprint: data.itemFingerprint,
          },
        },
        update: {
          sourceDocumentId: data.sourceDocumentId,
          requestType: data.requestType,
          customerName: data.customerName,
          customerId: data.customerId,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          productText: data.productText,
          productId: data.productId,
          quantityRequested: data.quantityRequested,
          targetPrice: data.targetPrice,
          currency: data.currency,
          neededByDate: data.neededByDate,
          urgency: data.urgency,
          evidenceText: data.evidenceText,
          confidence: data.confidence,
          reviewReason: data.reviewReason,
          aiAssisted: data.aiAssisted,
          validUntil: data.validUntil,
          metadata: data.metadata,
        },
        create: data,
      }),
    listDemandSignals: (filters) =>
      client.customerDemandSignal.findMany({
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.requestType ? { requestType: filters.requestType } : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: filters.take ?? 100,
        include: {
          inboundEmail: true,
          sourceDocument: true,
          product: true,
          customer: true,
        },
      }),
    getDemandSignal: (id) =>
      client.customerDemandSignal.findUnique({
        where: { id },
        include: {
          inboundEmail: true,
          sourceDocument: true,
          product: true,
          customer: true,
        },
      }),
    updateDemandSignal: (id, data) =>
      client.customerDemandSignal.update({
        where: { id },
        data,
        include: {
          inboundEmail: true,
          sourceDocument: true,
          product: true,
          customer: true,
        },
      }),
  };
}

function normalizeActor(actor: CustomerDemandActor) {
  return {
    actorType: actor.actorType?.trim() || 'OPERATOR',
    actorIdentifier: actor.actorIdentifier?.trim() || null,
  };
}

function buildFingerprint(inboundEmailId: string, item: AiCustomerDemandItem): string {
  return createHash('sha256')
    .update(
      [
        inboundEmailId,
        item.requestType,
        item.evidenceText.trim().toLowerCase(),
        item.productText?.trim().toLowerCase() ?? '',
        item.customerName?.trim().toLowerCase() ?? '',
        item.contactEmail?.trim().toLowerCase() ?? '',
        item.quantityRequested?.toString() ?? '',
        item.targetPrice?.toString() ?? '',
        item.currency ?? '',
      ].join('|'),
    )
    .digest('hex');
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function findSourceDocumentId(documents: CustomerDemandDocument[], evidenceText: string): string | null {
  const normalizedEvidence = evidenceText.trim();
  if (!normalizedEvidence) {
    return null;
  }

  return documents.find((document) => document.textContent.includes(normalizedEvidence))?.id ?? documents[0]?.id ?? null;
}

async function resolveProductId(
  repository: CustomerDemandRepository,
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

async function resolveCustomerId(
  repository: CustomerDemandRepository,
  customerName: string | null,
): Promise<string | null> {
  if (!customerName) {
    return null;
  }

  const customer = await repository.findCustomerByNormalizedName(normalizeText(customerName));
  return customer?.id ?? null;
}

function buildReviewReason(item: AiCustomerDemandItem): string | null {
  if (item.reviewReason) {
    return item.reviewReason;
  }

  if (item.confidence === 'LOW') {
    return 'low_confidence_requires_review';
  }

  if (!item.productText) {
    return 'missing_product_text';
  }

  return null;
}

function assertStatusTransitionAllowed(
  currentStatus: CustomerDemandStatus,
  action: CustomerDemandActionInput['action'],
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

  throw new ConflictError(`Customer demand signal cannot transition from ${currentStatus} with ${action}.`);
}

export function createCustomerDemandService(overrides?: {
  repository?: CustomerDemandRepository;
  parser?: CustomerDemandParser;
}) {
  const repository = overrides?.repository ?? createCustomerDemandRepository();
  const parser = overrides?.parser ?? createCustomerDemandParser();

  return {
    async parsePreview(rawText: string) {
      return parser.parseText({
        rawText,
        source: 'PARSE_PREVIEW',
      });
    },

    async processInboundEmail(input: CustomerDemandExtractionInput): Promise<CustomerDemandExtractionResult> {
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
          reason: 'No body text was available for customer demand extraction.',
        };
      }

      if (!hasCustomerDemandSignal(sourceText)) {
        return {
          attempted: false,
          intent: null,
          createdOrUpdatedCount: 0,
          parserStatus: null,
          reason: 'No customer-request language was detected before AI parsing.',
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

      if (attempt.result.intent !== 'CUSTOMER_REQUEST' && attempt.result.intent !== 'MIXED') {
        return {
          attempted: true,
          intent: attempt.result.intent,
          createdOrUpdatedCount: 0,
          parserStatus: attempt.status,
          reason: 'Customer demand parser found no customer request items to store.',
        };
      }

      let createdOrUpdatedCount = 0;
      for (const item of attempt.result.items) {
        const productId = await resolveProductId(repository, item.productText);
        const customerId = await resolveCustomerId(repository, item.customerName);
        const itemFingerprint = buildFingerprint(input.inboundEmailId, item);
        const sourceDocumentId = findSourceDocumentId(input.documents, item.evidenceText);

        await repository.upsertDemandSignal({
          inboundEmailId: input.inboundEmailId,
          sourceDocumentId,
          status: 'NEW',
          requestType: item.requestType,
          customerName: item.customerName,
          customerId,
          contactName: item.contactName,
          contactEmail: item.contactEmail,
          productText: item.productText,
          productId,
          quantityRequested: item.quantityRequested,
          targetPrice: item.targetPrice,
          currency: item.currency,
          neededByDate: parseDate(item.neededByDate),
          urgency: item.urgency,
          evidenceText: item.evidenceText,
          confidence: item.confidence,
          reviewReason: buildReviewReason(item),
          aiAssisted: true,
          validUntil: parseDate(item.validUntil),
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
        reason: 'Customer demand signals were stored.',
      };
    },

    listSignals(filters: CustomerDemandListFilters) {
      return repository.listDemandSignals(filters);
    },

    getSignal(id: string) {
      return repository.getDemandSignal(id);
    },

    async updateSignalStatus(id: string, input: CustomerDemandActionInput) {
      const existing = await repository.getDemandSignal(id);
      if (!existing) {
        throw new Error('Customer demand signal not found.');
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
        return repository.updateDemandSignal(id, {
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
        return repository.updateDemandSignal(id, {
          status: 'REJECTED',
          rejectedByType: actor.actorType,
          rejectedByIdentifier: actor.actorIdentifier,
          rejectedAt: now,
          reviewReason: note ?? 'rejected_by_operator',
        });
      }

      return repository.updateDemandSignal(id, {
        status: 'EXPIRED',
        reviewReason: note ?? 'expired_by_operator',
      });
    },
  };
}

export async function processInboundEmailCustomerDemand(
  input: CustomerDemandExtractionInput,
): Promise<CustomerDemandExtractionResult> {
  try {
    return await createCustomerDemandService().processInboundEmail(input);
  } catch (error) {
    logger.warn('Customer demand extraction failed', {
      inboundEmailId: input.inboundEmailId,
      error: error instanceof Error ? error.message : 'Unknown customer demand extraction error.',
    });
    return {
      attempted: true,
      intent: null,
      createdOrUpdatedCount: 0,
      parserStatus: 'error',
      reason: error instanceof Error ? error.message : 'Customer demand extraction failed.',
    };
  }
}

export const customerDemandService = createCustomerDemandService();
