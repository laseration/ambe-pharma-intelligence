import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema, operatorFeedbackSchema } from '../http/routeSchemas';
import {
  decimalInputSchema,
  idParamSchema,
  optionalBooleanQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { tradeOpportunityService } from './service';

export const dealsRouter = Router();

const tradeOpportunityStatusSchema = z.enum([
  'OPEN',
  'ON_HOLD',
  'DROPPED',
  'WON',
  'LOST',
]);
const tradeOpportunityStageSchema = z.enum([
  'NEW',
  'REVIEW',
  'READY_FOR_SUPPLIER_OUTREACH',
  'READY_FOR_BUY',
  'BUY_APPROVED',
  'BUY_ORDERED',
  'READY_FOR_BUYER_OUTREACH',
  'BUYER_CONTACTED',
  'NEGOTIATING',
  'DEAL_CONFIRMED',
  'CLOSED',
]);

const tradeMessageDirectionSchema = z.enum([
  'TO_SUPPLIER',
  'TO_BUYER',
  'INTERNAL',
]);
const tradeMessagePurposeSchema = z.enum([
  'INITIAL_BUYER_OFFER',
  'INITIAL_SUPPLIER_ENQUIRY',
  'PRICE_CONFIRMATION',
  'AVAILABILITY_CHECK',
  'NEGOTIATION_REPLY',
  'INTERNAL_SUMMARY',
]);

const listDealsQuerySchema = z.object({
  status: tradeOpportunityStatusSchema.optional(),
  stage: tradeOpportunityStageSchema.optional(),
  supplierId: optionalTrimmedStringSchema,
  productId: optionalTrimmedStringSchema,
  emailDerivedOfferId: optionalTrimmedStringSchema,
  hasMessagingPolicyViolations: optionalBooleanQuerySchema,
});

const messagingPolicySchema = z
  .object({
    allowSupplierOutreachDrafts: z.boolean().optional(),
    allowBuyerOutreachDrafts: z.boolean().optional(),
    blockSupplierIdentityLeak: z.boolean().optional(),
    blockBuyerIdentityLeak: z.boolean().optional(),
    requireHumanApprovalBeforeSend: z.boolean().optional(),
    allowedMessageTypes: z.unknown().optional(),
    pricingDisclosureMode: optionalTrimmedStringSchema,
    notes: optionalTrimmedStringSchema,
  })
  .optional();

const createDealBodySchema = z
  .object({
    sourceType: z
      .enum([
        'EMAIL_DERIVED_OFFER',
        'WORKFLOW_ITEM',
        'BUY_DECISION',
        'OPERATOR_CREATED',
      ])
      .optional(),
    emailDerivedOfferId: optionalTrimmedStringSchema,
    offerWorkflowItemId: optionalTrimmedStringSchema,
    buyDecisionId: optionalTrimmedStringSchema,
    buyExecutionId: optionalTrimmedStringSchema,
    supplierId: optionalTrimmedStringSchema,
    productId: optionalTrimmedStringSchema,
    rawProductText: optionalTrimmedStringSchema,
    normalizedProductNameCandidate: optionalTrimmedStringSchema,
    manufacturerCandidate: optionalTrimmedStringSchema,
    sourceSupplierNameSnapshot: optionalTrimmedStringSchema,
    targetBuyerNameSnapshot: optionalTrimmedStringSchema,
    targetBuyerCompanySnapshot: optionalTrimmedStringSchema,
    quotedBuyUnitPrice: decimalInputSchema.optional(),
    quotedBuyCurrencyCode: optionalTrimmedStringSchema,
    quotedBuyMinimumOrderQuantity: z.number().optional(),
    quotedAvailability: optionalTrimmedStringSchema,
    targetSellUnitPrice: decimalInputSchema.optional(),
    targetSellCurrencyCode: optionalTrimmedStringSchema,
    minimumMarginAmount: decimalInputSchema.optional(),
    minimumMarginPct: decimalInputSchema.optional(),
    quantityTarget: z.number().optional(),
    rationale: optionalTrimmedStringSchema,
    ownerUserId: optionalTrimmedStringSchema,
    ownerLabel: optionalTrimmedStringSchema,
    allowDuplicateActiveDeal: z.boolean().optional(),
    metadata: z.unknown().optional(),
  })
  .merge(actorBodySchema);

const updateDealBodySchema = z
  .object({
    status: tradeOpportunityStatusSchema.optional(),
    stage: tradeOpportunityStageSchema.optional(),
    targetBuyerNameSnapshot: optionalTrimmedStringSchema,
    targetBuyerCompanySnapshot: optionalTrimmedStringSchema,
    targetSellUnitPrice: decimalInputSchema.optional(),
    targetSellCurrencyCode: optionalTrimmedStringSchema,
    minimumMarginAmount: decimalInputSchema.optional(),
    minimumMarginPct: decimalInputSchema.optional(),
    quantityTarget: z.number().optional(),
    rationale: optionalTrimmedStringSchema,
    ownerUserId: optionalTrimmedStringSchema,
    ownerLabel: optionalTrimmedStringSchema,
    closeReason: optionalTrimmedStringSchema,
    note: optionalTrimmedStringSchema,
    metadata: z.unknown().optional(),
    policy: messagingPolicySchema,
  })
  .merge(actorBodySchema);

const createDraftBodySchema = z
  .object({
    direction: tradeMessageDirectionSchema,
    messagePurpose: tradeMessagePurposeSchema,
    audienceLabel: optionalTrimmedStringSchema,
    recipientNameSnapshot: optionalTrimmedStringSchema,
    recipientCompanySnapshot: optionalTrimmedStringSchema,
    subject: optionalTrimmedStringSchema,
    body: optionalTrimmedStringSchema,
    note: optionalTrimmedStringSchema,
    metadata: z.unknown().optional(),
  })
  .merge(actorBodySchema);

const updateDraftBodySchema = z
  .object({
    action: z
      .enum(['UPDATE', 'APPROVE', 'REJECT', 'CANCEL', 'MARK_SENT'])
      .optional(),
    subject: optionalTrimmedStringSchema,
    body: optionalTrimmedStringSchema,
    note: optionalTrimmedStringSchema,
    metadata: z.unknown().optional(),
    feedback: operatorFeedbackSchema
      .omit({
        tradeOpportunityId: true,
        tradeMessageDraftId: true,
      })
      .optional(),
  })
  .merge(actorBodySchema);

const draftParamSchema = z.object({
  draftId: z.string().trim().min(1),
});

dealsRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listDealsQuerySchema>
    >(request, {
      query: listDealsQuerySchema,
    });

    response.json({
      items: await tradeOpportunityService.listTradeOpportunities(query),
    });
  }),
);

dealsRouter.get(
  '/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await tradeOpportunityService.getTradeOpportunity(params.id),
        'Trade opportunity not found.',
      ),
    });
  }),
);

dealsRouter.post(
  '/',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof createDealBodySchema>
    >(request, {
      body: createDealBodySchema,
    });

    response.json({
      item: await tradeOpportunityService.createTradeOpportunity({
        ...body,
        allowDuplicateActiveDeal: body.allowDuplicateActiveDeal === true,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);

dealsRouter.patch(
  '/:id',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof updateDealBodySchema>
    >(request, {
      params: idParamSchema,
      body: updateDealBodySchema,
    });

    response.json({
      item: await tradeOpportunityService.updateTradeOpportunity(params.id, {
        ...body,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);

dealsRouter.get(
  '/:id/events',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      items: await tradeOpportunityService.listTradeOpportunityEvents(
        params.id,
      ),
    });
  }),
);

dealsRouter.get(
  '/:id/drafts',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      items: await tradeOpportunityService.listTradeMessageDrafts(params.id),
    });
  }),
);

dealsRouter.post(
  '/:id/drafts',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof createDraftBodySchema>
    >(request, {
      params: idParamSchema,
      body: createDraftBodySchema,
    });

    response.json({
      item: await tradeOpportunityService.generateTradeMessageDraft(params.id, {
        ...body,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);

dealsRouter.patch(
  '/drafts/:draftId',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof draftParamSchema>,
      unknown,
      z.infer<typeof updateDraftBodySchema>
    >(request, {
      params: draftParamSchema,
      body: updateDraftBodySchema,
    });

    response.json({
      item: await tradeOpportunityService.updateTradeMessageDraft(
        params.draftId,
        {
          ...body,
          ...resolveInternalActor(request, body),
        },
      ),
    });
  }),
);
