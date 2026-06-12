import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  decimalInputSchema,
  idParamSchema,
  optionalBooleanQuerySchema,
  optionalDateInputSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { buyDecisionService } from './service';

export const buyDecisionsRouter = Router();

buyDecisionsRouter.use(requireInternalOperatorAccess);

const approvalStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
const orderStatusSchema = z.enum([
  'NOT_ORDERED',
  'ORDERED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'CANCELLED',
]);

const listBuyDecisionsQuerySchema = z.object({
  approvalStatus: approvalStatusSchema.optional(),
  orderStatus: orderStatusSchema.optional(),
  supplierId: optionalTrimmedStringSchema,
  hasQualificationRisk: optionalBooleanQuerySchema,
  approvedByIdentifier: optionalTrimmedStringSchema,
  approvedFrom: optionalDateInputSchema,
  approvedTo: optionalDateInputSchema,
});

const markOrderStatusBodySchema = z
  .object({
    action: z.literal('MARK_ORDER_STATUS'),
    orderStatus: orderStatusSchema,
    note: optionalTrimmedStringSchema,
    externalOrderReference: z
      .union([z.string().trim().min(1), z.null()])
      .optional(),
    orderPlacedAt: optionalDateInputSchema,
    orderedQuantity: z.number().optional(),
    orderedUnitPrice: decimalInputSchema.optional(),
    orderedCurrencyCode: optionalTrimmedStringSchema,
    orderedMinimumOrderQuantity: z.number().optional(),
    confirmedAvailability: z.boolean().optional(),
    expectedDeliveryDate: optionalDateInputSchema,
  })
  .merge(actorBodySchema);

const updateReferenceBodySchema = z
  .object({
    action: z.literal('UPDATE_REFERENCE'),
    externalOrderReference: z.union([z.string().trim().min(1), z.null()]),
    note: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);

const addNoteBodySchema = z
  .object({
    action: z.literal('ADD_NOTE'),
    note: z.string().trim().min(1),
  })
  .merge(actorBodySchema);

const buyDecisionActionBodySchema = z.union([
  markOrderStatusBodySchema,
  updateReferenceBodySchema,
  addNoteBodySchema,
]);

buyDecisionsRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listBuyDecisionsQuerySchema>
    >(request, {
      query: listBuyDecisionsQuerySchema,
    });

    response.json({
      items: await buyDecisionService.listBuyDecisions(query),
    });
  }),
);

buyDecisionsRouter.get(
  '/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await buyDecisionService.getBuyDecision(params.id),
        'Buy decision not found.',
      ),
    });
  }),
);

buyDecisionsRouter.patch(
  '/:id',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof buyDecisionActionBodySchema>
    >(request, {
      params: idParamSchema,
      body: buyDecisionActionBodySchema,
    });

    const actor = resolveInternalActor(request, body);

    const item =
      body.action === 'MARK_ORDER_STATUS'
        ? await buyDecisionService.updateOrderStatus(params.id, {
            orderStatus: body.orderStatus,
            note: body.note ?? null,
            externalOrderReference: body.externalOrderReference ?? null,
            orderPlacedAt: body.orderPlacedAt,
            orderedQuantity: body.orderedQuantity,
            orderedUnitPrice: body.orderedUnitPrice,
            orderedCurrencyCode: body.orderedCurrencyCode,
            orderedMinimumOrderQuantity: body.orderedMinimumOrderQuantity,
            confirmedAvailability: body.confirmedAvailability,
            expectedDeliveryDate: body.expectedDeliveryDate,
            ...actor,
          })
        : body.action === 'UPDATE_REFERENCE'
          ? await buyDecisionService.updateReference(params.id, {
              externalOrderReference: body.externalOrderReference,
              note: body.note ?? null,
              ...actor,
            })
          : await buyDecisionService.addNote(params.id, {
              note: body.note,
              ...actor,
            });

    response.json({ item });
  }),
);
