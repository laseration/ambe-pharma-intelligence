import { Router } from 'express';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema, operatorFeedbackSchema } from '../http/routeSchemas';
import {
  decimalInputSchema,
  idParamSchema,
  nullableTrimmedStringSchema,
  optionalBooleanQuerySchema,
  optionalDateInputSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { listReviewQueueItems } from './service';
import { offerWorkflowService } from './workflowService';

export const reviewQueueRouter = Router();

const workflowStatusSchema = z.enum([
  'NEW',
  'IN_REVIEW',
  'NEEDS_INFO',
  'APPROVED_TO_BUY',
  'REJECTED',
  'ORDERED',
  'CLOSED',
]);

const workflowPrioritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const supplierQualificationStatusSchema = z.enum([
  'UNKNOWN',
  'PENDING_REVIEW',
  'APPROVED',
  'RESTRICTED',
  'BLOCKED',
]);

const listWorkflowItemsQuerySchema = z.object({
  status: workflowStatusSchema.optional(),
  inboundEmailId: optionalTrimmedStringSchema,
  assigneeUserId: optionalTrimmedStringSchema,
  assigneeLabel: optionalTrimmedStringSchema,
  priority: workflowPrioritySchema.optional(),
  sourceKind: optionalTrimmedStringSchema,
  staleFirst: optionalBooleanQuerySchema,
  onlyOpen: optionalBooleanQuerySchema,
  unresolvedSupplier: optionalBooleanQuerySchema,
  conflictingSupplierCues: optionalBooleanQuerySchema,
  manufacturerAmbiguity: optionalBooleanQuerySchema,
  supplierQualificationStatus: supplierQualificationStatusSchema.optional(),
  blockedSupplier: optionalBooleanQuerySchema,
  restrictedSupplier: optionalBooleanQuerySchema,
  unknownQualification: optionalBooleanQuerySchema,
  hasBuyDecision: optionalBooleanQuerySchema,
});

const workflowFeedbackSchema = operatorFeedbackSchema
  .omit({
    emailDerivedOfferId: true,
    offerWorkflowItemId: true,
  })
  .optional();

const supplierReviewDetailsSchema = z.object({
  supplierName: nullableTrimmedStringSchema,
  contactName: nullableTrimmedStringSchema,
  email: nullableTrimmedStringSchema,
  phone: nullableTrimmedStringSchema,
}).optional();

const assignWorkflowBodySchema = z.object({
  action: z.literal('ASSIGN'),
  assigneeUserId: z.union([z.string().trim().min(1), z.null()]).optional(),
  assigneeLabel: z.union([z.string().trim().min(1), z.null()]).optional(),
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

const noteWorkflowBodySchema = z.object({
  action: z.literal('ADD_NOTE'),
  note: z.string().trim().min(1),
}).merge(actorBodySchema);

const simpleWorkflowActionSchema = z.object({
  action: z.enum(['START_REVIEW', 'NEEDS_INFO', 'CLOSE']),
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

const decisionWorkflowActionSchema = z.object({
  action: z.enum(['APPROVE_TO_BUY', 'REJECT']),
  note: optionalTrimmedStringSchema,
  allowQualificationRisk: z.boolean().optional(),
  supplierDetails: supplierReviewDetailsSchema,
  feedback: workflowFeedbackSchema,
}).merge(actorBodySchema);

const markOrderedWorkflowBodySchema = z.object({
  action: z.literal('MARK_ORDERED'),
  note: optionalTrimmedStringSchema,
  externalOrderReference: z.union([z.string().trim().min(1), z.null()]).optional(),
  orderPlacedAt: optionalDateInputSchema,
  orderedQuantity: z.number().optional(),
  orderedUnitPrice: decimalInputSchema.optional(),
  orderedCurrencyCode: optionalTrimmedStringSchema,
  orderedMinimumOrderQuantity: z.number().optional(),
  confirmedAvailability: z.boolean().optional(),
  expectedDeliveryDate: optionalDateInputSchema,
}).merge(actorBodySchema);

const workflowActionBodySchema = z.union([
  assignWorkflowBodySchema,
  noteWorkflowBodySchema,
  simpleWorkflowActionSchema,
  decisionWorkflowActionSchema,
  markOrderedWorkflowBodySchema,
]);

reviewQueueRouter.get('/', asyncHandler(async (_request, response) => {
  response.json({
    items: await listReviewQueueItems(),
  });
}));

reviewQueueRouter.get('/workflows', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listWorkflowItemsQuerySchema>>(request, {
    query: listWorkflowItemsQuerySchema,
  });

  response.json({
    items: await offerWorkflowService.listWorkflowItems({
      ...query,
      onlyOpen: query.onlyOpen ?? true,
      staleFirst: query.staleFirst ?? false,
    }),
  });
}));

reviewQueueRouter.get('/workflows/:id/events', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    items: await offerWorkflowService.listWorkflowEvents(params.id),
  });
}));

reviewQueueRouter.get('/workflows/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(
      await offerWorkflowService.getWorkflowItem(params.id),
      'Offer workflow item not found.',
    ),
  });
}));

reviewQueueRouter.patch('/workflows/:id', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof workflowActionBodySchema>
  >(request, {
    params: idParamSchema,
    body: workflowActionBodySchema,
  });

  const actor = resolveInternalActor(request, body);

  let actionOutcome: Record<string, unknown> | null = null;

  const item =
    body.action === 'ASSIGN'
      ? await offerWorkflowService.assignWorkflowItem({
          workflowItemId: params.id,
          assigneeUserId: body.assigneeUserId ?? null,
          assigneeLabel: body.assigneeLabel ?? null,
          note: body.note ?? null,
          ...actor,
        })
      : body.action === 'START_REVIEW'
        ? await offerWorkflowService.markInReview({
            workflowItemId: params.id,
            note: body.note ?? null,
            ...actor,
          })
        : body.action === 'NEEDS_INFO'
          ? await offerWorkflowService.markNeedsInfo({
              workflowItemId: params.id,
              note: body.note ?? null,
              ...actor,
            })
          : body.action === 'APPROVE_TO_BUY'
            ? await (async () => {
                const result = await offerWorkflowService.approveToBuyWithOutcome({
                  workflowItemId: params.id,
                  note: body.note ?? null,
                  allowQualificationRisk: body.allowQualificationRisk === true,
                  supplierDetails: body.supplierDetails,
                  feedback: body.feedback,
                  ...actor,
                });
                actionOutcome = {
                  action: 'APPROVE_TO_BUY',
                  ...result.outcome,
                };
                return result.item;
              })()
            : body.action === 'REJECT'
              ? await (async () => {
                  const result = await offerWorkflowService.rejectWorkflowItem({
                    workflowItemId: params.id,
                    note: body.note ?? null,
                    feedback: body.feedback,
                    ...actor,
                  });
                  actionOutcome = {
                    action: 'REJECT',
                  };
                  return result;
                })()
              : body.action === 'MARK_ORDERED'
                ? await offerWorkflowService.markOrdered({
                    workflowItemId: params.id,
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
                : body.action === 'CLOSE'
                  ? await offerWorkflowService.closeWorkflowItem({
                      workflowItemId: params.id,
                      note: body.note ?? null,
                      ...actor,
                    })
                  : await offerWorkflowService.addWorkflowNote({
                      workflowItemId: params.id,
                      note: body.note,
                      ...actor,
                    });

  response.json({ item, actionOutcome });
}));
