import type {
  BuyerTradeEnquiry,
  BuyerTradeEnquiryPriority,
  BuyerTradeEnquiryStatus,
  SupplierDraftOpportunity,
  SupplierDraftOpportunityStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

import { BadRequestError, ConflictError } from '../http/errors';
import { db } from '../lib/db';

export const BUYER_TRADE_ENQUIRY_STATUSES = [
  'NEW',
  'REVIEWING',
  'MATCHED',
  'QUOTED',
  'CLOSED',
  'REJECTED',
  'DUPLICATE',
  'SPAM',
  'ARCHIVED',
] as const satisfies readonly BuyerTradeEnquiryStatus[];

export const BUYER_TRADE_ENQUIRY_PRIORITIES = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
] as const satisfies readonly BuyerTradeEnquiryPriority[];

export const SUPPLIER_DRAFT_OPPORTUNITY_STATUSES = [
  'DRAFT',
  'REVIEWING',
  'APPROVED_INTERNAL',
  'REJECTED',
] as const satisfies readonly SupplierDraftOpportunityStatus[];

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const REVIEW_WARNING =
  'Internal draft only. Human review is required before any buyer-facing use.';

export type CreateBuyerTradeEnquiryInput = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  businessType?: string | null;
  country?: string | null;
  productName: string;
  strength?: string | null;
  packSize?: string | null;
  quantityRequired?: string | null;
  targetMarket?: string | null;
  requiredBy?: Date | null;
  documentationNotes?: string | null;
  additionalNotes?: string | null;
  honeypot?: string | null;
};

export type BuyerTradeEnquiryListItem = {
  id: string;
  status: BuyerTradeEnquiryStatus;
  priority: BuyerTradeEnquiryPriority;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  businessType: string | null;
  country: string | null;
  productName: string;
  strength: string | null;
  packSize: string | null;
  quantityRequired: string | null;
  targetMarket: string | null;
  requiredBy: string | null;
  documentationNotes: string | null;
  additionalNotes: string | null;
  source: string;
  reviewNotes: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierDraftParsedRow = {
  productName: string;
  strength?: string | null;
  packSize?: string | null;
  quantity?: string | null;
  expiry?: Date | string | null;
  storage?: string | null;
  country?: string | null;
  supplierPrice?: number | string | null;
  currencyCode?: string | null;
  confidence?: number | null;
  warnings?: string[] | null;
  rawRow?: Prisma.JsonObject | null;
  sourceImportBatchId?: string | null;
};

export type SupplierDraftOpportunityListItem = {
  id: string;
  status: SupplierDraftOpportunityStatus;
  productName: string;
  strength: string | null;
  packSize: string | null;
  quantity: string | null;
  expiry: string | null;
  storage: string | null;
  country: string | null;
  supplierPrice: string | null;
  currencyCode: string | null;
  confidence: number;
  expiryWarning: string | null;
  reviewWarning: string | null;
  warnings: Prisma.JsonValue | null;
  sourceType: string;
  sourceImportBatchId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListBuyerTradeEnquiriesOptions = {
  status?: BuyerTradeEnquiryStatus;
  priority?: BuyerTradeEnquiryPriority;
  company?: string;
  createdFrom?: Date;
  createdTo?: Date;
  take?: number;
};

type ListSupplierDraftOpportunitiesOptions = {
  status?: SupplierDraftOpportunityStatus;
  take?: number;
};

type UpdateBuyerTradeEnquiryStatusInput = {
  enquiryId: string;
  status: BuyerTradeEnquiryStatus;
  reviewNotes?: string | null;
  actorType: string;
  actorIdentifier?: string | null;
  now?: Date;
};

function trimNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function textFields(input: CreateBuyerTradeEnquiryInput): string[] {
  return [
    input.companyName,
    input.contactName,
    input.contactEmail,
    input.contactPhone,
    input.businessType,
    input.country,
    input.productName,
    input.strength,
    input.packSize,
    input.quantityRequired,
    input.targetMarket,
    input.documentationNotes,
    input.additionalNotes,
  ].filter((value): value is string => Boolean(value));
}

export function detectPublicTradeEnquirySpam(
  input: CreateBuyerTradeEnquiryInput & { honeypot?: string | null },
): string[] {
  const signals: string[] = [];

  if (trimNullable(input.honeypot)) {
    signals.push('honeypot field was populated');
  }

  const combinedText = textFields(input).join('\n');
  const urlMatches = combinedText.match(/https?:\/\/|www\.|\.ru\b|\.cn\b/gi);
  if ((urlMatches?.length ?? 0) > 2) {
    signals.push('too many links or link-like values');
  }

  if (/(.)\1{18,}/.test(combinedText)) {
    signals.push('repeated-character spam pattern');
  }

  if (
    /\b(casino|crypto|loan|seo backlinks|guest post|telegram subscribers)\b/i.test(
      combinedText,
    )
  ) {
    signals.push('obvious unrelated solicitation wording');
  }

  return signals;
}

function inferBuyerTradeEnquiryPriority(input: {
  requiredBy?: Date | null;
  additionalNotes?: string | null;
  documentationNotes?: string | null;
}): BuyerTradeEnquiryPriority {
  const now = new Date();
  const requiredBy = input.requiredBy ?? null;
  const combinedNotes = `${input.additionalNotes ?? ''} ${
    input.documentationNotes ?? ''
  }`;

  if (
    /\b(urgent|same day|today|tomorrow|critical)\b/i.test(combinedNotes) ||
    (requiredBy &&
      requiredBy.getTime() - now.getTime() <= 2 * 24 * 60 * 60 * 1000)
  ) {
    return 'URGENT';
  }

  if (
    /\b(soon|this week|priority)\b/i.test(combinedNotes) ||
    (requiredBy &&
      requiredBy.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000)
  ) {
    return 'HIGH';
  }

  return 'NORMAL';
}

function duplicateWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - DUPLICATE_WINDOW_MS);
}

const ALLOWED_STATUS_TRANSITIONS: Record<
  BuyerTradeEnquiryStatus,
  BuyerTradeEnquiryStatus[]
> = {
  NEW: ['REVIEWING', 'REJECTED', 'DUPLICATE', 'SPAM', 'ARCHIVED'],
  REVIEWING: [
    'MATCHED',
    'QUOTED',
    'CLOSED',
    'REJECTED',
    'DUPLICATE',
    'SPAM',
    'ARCHIVED',
  ],
  MATCHED: ['QUOTED', 'CLOSED', 'REJECTED', 'ARCHIVED'],
  QUOTED: ['CLOSED', 'REJECTED', 'ARCHIVED'],
  CLOSED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  DUPLICATE: ['ARCHIVED'],
  SPAM: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isBuyerTradeEnquiryStatusTransitionAllowed(
  fromStatus: BuyerTradeEnquiryStatus,
  toStatus: BuyerTradeEnquiryStatus,
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  return ALLOWED_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

function buildExpiryWarning(expiry: Date | null): string | null {
  if (!expiry) {
    return 'Expiry was not supplied; review before using this draft opportunity.';
  }

  const now = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysUntilExpiry < 0) {
    return 'Supplier-stated expiry has passed; do not progress without review.';
  }

  if (daysUntilExpiry <= 180) {
    return 'Supplier-stated expiry is within 180 days; review timing and suitability.';
  }

  return null;
}

function clampConfidence(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSupplierPrice(
  value: number | string | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized =
    typeof value === 'string' ? value.trim().replace(/,/g, '') : value;
  if (normalized === '') {
    return null;
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return new Prisma.Decimal(numericValue);
}

function serializeBuyerTradeEnquiry(
  item: BuyerTradeEnquiry,
): BuyerTradeEnquiryListItem {
  return {
    id: item.id,
    status: item.status,
    priority: item.priority,
    companyName: item.companyName,
    contactName: item.contactName,
    contactEmail: item.contactEmail,
    contactPhone: item.contactPhone,
    businessType: item.businessType,
    country: item.country,
    productName: item.productName,
    strength: item.strength,
    packSize: item.packSize,
    quantityRequired: item.quantityRequired,
    targetMarket: item.targetMarket,
    requiredBy: item.requiredBy?.toISOString() ?? null,
    documentationNotes: item.documentationNotes,
    additionalNotes: item.additionalNotes,
    source: item.source,
    reviewNotes: item.reviewNotes,
    statusUpdatedAt: item.statusUpdatedAt?.toISOString() ?? null,
    statusUpdatedBy: item.statusUpdatedBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeSupplierDraftOpportunity(
  item: SupplierDraftOpportunity,
): SupplierDraftOpportunityListItem {
  return {
    id: item.id,
    status: item.status,
    productName: item.productName,
    strength: item.strength,
    packSize: item.packSize,
    quantity: item.quantity,
    expiry: item.expiry?.toISOString() ?? null,
    storage: item.storage,
    country: item.country,
    supplierPrice: item.supplierPrice?.toFixed(2) ?? null,
    currencyCode: item.currencyCode,
    confidence: item.confidence,
    expiryWarning: item.expiryWarning,
    reviewWarning: item.reviewWarning,
    warnings: item.warnings,
    sourceType: item.sourceType,
    sourceImportBatchId: item.sourceImportBatchId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function createBuyerTradeEnquiry(
  input: CreateBuyerTradeEnquiryInput,
): Promise<BuyerTradeEnquiryListItem> {
  const spamSignals = detectPublicTradeEnquirySpam(input);
  if (spamSignals.length > 0) {
    throw new BadRequestError('Trade enquiry rejected by validation checks.');
  }

  const contactEmail = input.contactEmail.trim().toLowerCase();
  const productName = input.productName.trim();
  const companyName = input.companyName.trim();
  const existingDuplicate = await db.buyerTradeEnquiry.findFirst({
    where: {
      contactEmail,
      companyName,
      productName,
      createdAt: {
        gte: duplicateWindowStart(),
      },
    },
    select: {
      id: true,
    },
  });

  if (existingDuplicate) {
    throw new ConflictError(
      'A similar trade enquiry was already submitted recently.',
      { duplicateId: existingDuplicate.id },
    );
  }

  const item = await db.buyerTradeEnquiry.create({
    data: {
      priority: inferBuyerTradeEnquiryPriority(input),
      companyName,
      contactName: input.contactName.trim(),
      contactEmail,
      contactPhone: trimNullable(input.contactPhone),
      businessType: trimNullable(input.businessType),
      country: trimNullable(input.country),
      productName,
      strength: trimNullable(input.strength),
      packSize: trimNullable(input.packSize),
      quantityRequired: trimNullable(input.quantityRequired),
      targetMarket: trimNullable(input.targetMarket),
      requiredBy: input.requiredBy ?? null,
      documentationNotes: trimNullable(input.documentationNotes),
      additionalNotes: trimNullable(input.additionalNotes),
    },
  });

  return serializeBuyerTradeEnquiry(item);
}

export async function listBuyerTradeEnquiries(
  options: ListBuyerTradeEnquiriesOptions = {},
): Promise<BuyerTradeEnquiryListItem[]> {
  const items = await db.buyerTradeEnquiry.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
      ...(options.company
        ? {
            companyName: {
              contains: options.company.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(options.createdFrom || options.createdTo
        ? {
            createdAt: {
              ...(options.createdFrom ? { gte: options.createdFrom } : {}),
              ...(options.createdTo ? { lte: options.createdTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 50,
  });

  return items.map(serializeBuyerTradeEnquiry);
}

export async function getBuyerTradeEnquiry(
  enquiryId: string,
): Promise<BuyerTradeEnquiryListItem | null> {
  const item = await db.buyerTradeEnquiry.findUnique({
    where: {
      id: enquiryId,
    },
  });

  return item ? serializeBuyerTradeEnquiry(item) : null;
}

export async function updateBuyerTradeEnquiryStatus(
  input: UpdateBuyerTradeEnquiryStatusInput,
): Promise<BuyerTradeEnquiryListItem | null> {
  const existing = await db.buyerTradeEnquiry.findUnique({
    where: {
      id: input.enquiryId,
    },
  });

  if (!existing) {
    return null;
  }

  if (
    !isBuyerTradeEnquiryStatusTransitionAllowed(existing.status, input.status)
  ) {
    throw new ConflictError(
      `Trade enquiry cannot move from ${existing.status} to ${input.status}.`,
    );
  }

  const updated = await db.buyerTradeEnquiry.update({
    where: {
      id: input.enquiryId,
    },
    data: {
      status: input.status,
      ...(input.reviewNotes !== undefined
        ? { reviewNotes: trimNullable(input.reviewNotes) }
        : {}),
      statusUpdatedAt: input.now ?? new Date(),
      statusUpdatedBy:
        trimNullable(input.actorIdentifier) ?? input.actorType.trim(),
    },
  });

  return serializeBuyerTradeEnquiry(updated);
}

export function buildSupplierDraftOpportunityInput(
  row: SupplierDraftParsedRow,
): Prisma.SupplierDraftOpportunityCreateInput {
  const expiry = normalizeDate(row.expiry);
  const expiryWarning = buildExpiryWarning(expiry);
  const warnings = [
    ...(row.warnings ?? []),
    ...(expiryWarning ? [expiryWarning] : []),
    REVIEW_WARNING,
  ];

  return {
    productName: row.productName.trim(),
    strength: trimNullable(row.strength),
    packSize: trimNullable(row.packSize),
    quantity: trimNullable(row.quantity),
    expiry,
    storage: trimNullable(row.storage),
    country: trimNullable(row.country),
    supplierPrice: normalizeSupplierPrice(row.supplierPrice),
    currencyCode: trimNullable(row.currencyCode)?.toUpperCase() ?? null,
    confidence: clampConfidence(row.confidence),
    expiryWarning,
    reviewWarning: REVIEW_WARNING,
    warnings,
    rawRow: row.rawRow ?? undefined,
    sourceImportBatchId: trimNullable(row.sourceImportBatchId),
  };
}

export async function createSupplierDraftOpportunityFromParsedRow(
  row: SupplierDraftParsedRow,
): Promise<SupplierDraftOpportunityListItem> {
  const item = await db.supplierDraftOpportunity.create({
    data: buildSupplierDraftOpportunityInput(row),
  });

  return serializeSupplierDraftOpportunity(item);
}

export async function listSupplierDraftOpportunities(
  options: ListSupplierDraftOpportunitiesOptions = {},
): Promise<SupplierDraftOpportunityListItem[]> {
  const items = await db.supplierDraftOpportunity.findMany({
    where: options.status ? { status: options.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 50,
  });

  return items.map(serializeSupplierDraftOpportunity);
}
