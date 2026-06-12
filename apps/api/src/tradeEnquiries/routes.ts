import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { actorBodySchema } from '../http/routeSchemas';
import { asyncHandler, RateLimitError, requireFound } from '../http/errors';
import {
  idParamSchema,
  optionalDateInputSchema,
  parseRequest,
} from '../http/validation';
import {
  BUYER_TRADE_ENQUIRY_PRIORITIES,
  BUYER_TRADE_ENQUIRY_STATUSES,
  createBuyerTradeEnquiry,
  getBuyerTradeEnquiry,
  listBuyerTradeEnquiries,
  listSupplierDraftOpportunities,
  SUPPLIER_DRAFT_OPPORTUNITY_STATUSES,
  updateBuyerTradeEnquiryStatus,
} from './service';

export const publicTradeEnquiriesRouter = Router();
export const tradeEnquiriesRouter = Router();

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const PUBLIC_TRADE_ENQUIRY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_TRADE_ENQUIRY_RATE_LIMIT_MAX = 5;
const publicTradeEnquiryRateLimitStore = new Map<string, RateLimitEntry>();

export function resetPublicTradeEnquiryRateLimitForTests() {
  publicTradeEnquiryRateLimitStore.clear();
}

function resolvePublicTradeEnquiryClientKey(request: Request): string {
  const forwardedFor = request.header('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor || request.ip || request.socket.remoteAddress || 'unknown'
  );
}

const publicTradeEnquiryRateLimit: RequestHandler = (
  request,
  _response,
  next,
) => {
  const now = Date.now();
  const clientKey = resolvePublicTradeEnquiryClientKey(request);
  const existing = publicTradeEnquiryRateLimitStore.get(clientKey);

  if (!existing || existing.resetAt <= now) {
    publicTradeEnquiryRateLimitStore.set(clientKey, {
      count: 1,
      resetAt: now + PUBLIC_TRADE_ENQUIRY_RATE_LIMIT_WINDOW_MS,
    });
    next();
    return;
  }

  if (existing.count >= PUBLIC_TRADE_ENQUIRY_RATE_LIMIT_MAX) {
    next(new RateLimitError('Too many trade enquiries submitted recently.'));
    return;
  }

  existing.count += 1;
  next();
};

const optionalShortTextSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).max(180).optional());

const optionalNoteTextSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).max(500).optional());

const requiredTextSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(2).max(180),
);

const createBuyerTradeEnquiryBodySchema = z.object({
  companyName: requiredTextSchema,
  contactName: requiredTextSchema,
  contactEmail: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().email().max(254),
    )
    .transform((value) => value.toLowerCase()),
  contactPhone: optionalShortTextSchema,
  businessType: optionalShortTextSchema,
  country: optionalShortTextSchema,
  productName: requiredTextSchema,
  strength: optionalShortTextSchema,
  packSize: optionalShortTextSchema,
  quantityRequired: optionalShortTextSchema,
  targetMarket: optionalShortTextSchema,
  requiredBy: optionalDateInputSchema,
  documentationNotes: optionalNoteTextSchema,
  additionalNotes: optionalNoteTextSchema,
  website: z.string().max(180).optional(),
});

const listBuyerTradeEnquiriesQuerySchema = z.object({
  status: z.enum(BUYER_TRADE_ENQUIRY_STATUSES).optional(),
  priority: z.enum(BUYER_TRADE_ENQUIRY_PRIORITIES).optional(),
  company: optionalShortTextSchema,
  createdFrom: optionalDateInputSchema,
  createdTo: optionalDateInputSchema,
  take: z.coerce.number().int().min(1).max(100).optional(),
});

const updateBuyerTradeEnquiryStatusBodySchema = z
  .object({
    status: z.enum(BUYER_TRADE_ENQUIRY_STATUSES),
    reviewNotes: optionalNoteTextSchema,
  })
  .merge(actorBodySchema);

function endOfDay(value: Date | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

const listSupplierDraftOpportunitiesQuerySchema = z.object({
  status: z.enum(SUPPLIER_DRAFT_OPPORTUNITY_STATUSES).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

publicTradeEnquiriesRouter.post(
  '/trade-enquiries',
  publicTradeEnquiryRateLimit,
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof createBuyerTradeEnquiryBodySchema>
    >(request, {
      body: createBuyerTradeEnquiryBodySchema,
    });

    const item = await createBuyerTradeEnquiry({
      ...body,
      honeypot: body.website,
    });

    response.status(201).json({
      item: {
        id: item.id,
        status: item.status,
        createdAt: item.createdAt,
      },
      message:
        'Trade enquiry received for manual review. Availability and pricing are not confirmed by submission.',
    });
  }),
);

tradeEnquiriesRouter.get(
  '/buyer-enquiries',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listBuyerTradeEnquiriesQuerySchema>
    >(request, {
      query: listBuyerTradeEnquiriesQuerySchema,
    });

    response.json({
      items: await listBuyerTradeEnquiries({
        status: query.status,
        priority: query.priority,
        company: query.company,
        createdFrom: query.createdFrom ?? undefined,
        createdTo: endOfDay(query.createdTo),
        take: query.take,
      }),
    });
  }),
);

tradeEnquiriesRouter.get(
  '/buyer-enquiries/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await getBuyerTradeEnquiry(params.id),
        'Trade enquiry not found.',
      ),
    });
  }),
);

tradeEnquiriesRouter.patch(
  '/buyer-enquiries/:id/status',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof updateBuyerTradeEnquiryStatusBodySchema>
    >(request, {
      params: idParamSchema,
      body: updateBuyerTradeEnquiryStatusBodySchema,
    });

    response.json({
      item: requireFound(
        await updateBuyerTradeEnquiryStatus({
          enquiryId: params.id,
          status: body.status,
          reviewNotes: body.reviewNotes,
          ...resolveInternalActor(request, body),
        }),
        'Trade enquiry not found.',
      ),
    });
  }),
);

tradeEnquiriesRouter.get(
  '/supplier-draft-opportunities',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listSupplierDraftOpportunitiesQuerySchema>
    >(request, {
      query: listSupplierDraftOpportunitiesQuerySchema,
    });

    response.json({
      items: await listSupplierDraftOpportunities({
        status: query.status,
        take: query.take,
      }),
    });
  }),
);
