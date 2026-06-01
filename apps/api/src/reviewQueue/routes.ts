import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { BadRequestError, asyncHandler, requireFound } from '../http/errors';
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
import { offerCorrectionService } from '../corrections/service';
import { automationService } from '../automation/service';
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

const workflowCorrectionFieldsSchema = z.object({
  correctedSupplierId: optionalTrimmedStringSchema,
  correctedSupplierName: optionalTrimmedStringSchema,
  correctedProductId: optionalTrimmedStringSchema,
  correctedRawProductText: optionalTrimmedStringSchema,
  correctedNormalizedProductName: optionalTrimmedStringSchema,
  correctedManufacturer: optionalTrimmedStringSchema,
  correctedUnitPrice: decimalInputSchema.optional(),
  correctedCurrencyCode: optionalTrimmedStringSchema,
  correctedMinimumOrderQuantity: z.number().optional(),
  correctedAvailability: optionalTrimmedStringSchema,
  note: optionalTrimmedStringSchema,
});

const workflowCorrectionBodySchema =
  workflowCorrectionFieldsSchema.merge(actorBodySchema);

const supplierReviewDetailsSchema = z
  .object({
    supplierName: nullableTrimmedStringSchema,
    contactName: nullableTrimmedStringSchema,
    email: nullableTrimmedStringSchema,
    phone: nullableTrimmedStringSchema,
  })
  .optional();

const assignWorkflowBodySchema = z
  .object({
    action: z.literal('ASSIGN'),
    assigneeUserId: z.union([z.string().trim().min(1), z.null()]).optional(),
    assigneeLabel: z.union([z.string().trim().min(1), z.null()]).optional(),
    note: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);

const noteWorkflowBodySchema = z
  .object({
    action: z.literal('ADD_NOTE'),
    note: z.string().trim().min(1),
  })
  .merge(actorBodySchema);

const simpleWorkflowActionSchema = z
  .object({
    action: z.enum(['START_REVIEW', 'NEEDS_INFO', 'CLOSE']),
    note: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);

const decisionWorkflowActionSchema = z
  .object({
    action: z.enum(['APPROVE_TO_BUY', 'REJECT']),
    note: optionalTrimmedStringSchema,
    allowQualificationRisk: z.boolean().optional(),
    supplierDetails: supplierReviewDetailsSchema,
    correction: workflowCorrectionFieldsSchema.optional(),
    feedback: workflowFeedbackSchema,
  })
  .merge(actorBodySchema);

const markOrderedWorkflowBodySchema = z
  .object({
    action: z.literal('MARK_ORDERED'),
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

const workflowActionBodySchema = z.union([
  assignWorkflowBodySchema,
  noteWorkflowBodySchema,
  simpleWorkflowActionSchema,
  decisionWorkflowActionSchema,
  markOrderedWorkflowBodySchema,
]);

type WorkflowCorrectionInput = z.infer<typeof workflowCorrectionFieldsSchema>;

function hasCorrectionInput(input: WorkflowCorrectionInput | undefined) {
  if (!input) {
    return false;
  }

  return Object.values(input).some(
    (fieldValue) =>
      fieldValue !== undefined && fieldValue !== null && fieldValue !== '',
  );
}

function correctionFeedbackMetadata(input: WorkflowCorrectionInput) {
  return {
    createdFrom: 'review_workflow_correction',
    correctedFields: Object.entries(input)
      .filter(
        ([key, value]) =>
          key !== 'note' &&
          value !== undefined &&
          value !== null &&
          value !== '',
      )
      .map(([key]) => key),
  };
}

async function createWorkflowCorrectionAndFeedback(input: {
  workflowItemId: string;
  correction: WorkflowCorrectionInput;
  actor: ReturnType<typeof resolveInternalActor>;
}) {
  const workflowItem = requireFound(
    await offerWorkflowService.getWorkflowItem(input.workflowItemId),
    'Offer workflow item not found.',
  );
  const emailDerivedOfferId = workflowItem.emailDerivedOffer?.id;

  if (!emailDerivedOfferId) {
    throw new BadRequestError(
      'Review workflow item is missing an extracted offer.',
    );
  }

  const metadata = {
    ...correctionFeedbackMetadata(input.correction),
    workflowItemStatus: workflowItem.status,
    sourceKind:
      workflowItem.sourceKind ?? workflowItem.emailDerivedOffer?.sourceKind ?? null,
    reviewReason:
      workflowItem.sourceReviewReason ??
      workflowItem.emailDerivedOffer?.reviewReason ??
      null,
  };
  const correction = await offerCorrectionService.createCorrection({
    ...input.correction,
    emailDerivedOfferId,
    offerWorkflowItemId: workflowItem.id,
    inboundEmailId:
      workflowItem.inboundEmailId ?? workflowItem.inboundEmail?.id ?? null,
    metadata,
    ...input.actor,
  });

  await automationService.recordFeedback({
    emailDerivedOfferId,
    offerWorkflowItemId: workflowItem.id,
    feedbackType: 'EXTRACTION',
    verdict: 'PARTIALLY_CORRECT',
    productTextCorrect:
      input.correction.correctedRawProductText ||
      input.correction.correctedNormalizedProductName
        ? false
        : null,
    priceCorrect:
      input.correction.correctedUnitPrice !== undefined ? false : null,
    currencyCorrect: input.correction.correctedCurrencyCode ? false : null,
    manufacturerCorrect: input.correction.correctedManufacturer ? false : null,
    availabilityCorrect:
      input.correction.correctedAvailability ? false : null,
    moqCorrect:
      input.correction.correctedMinimumOrderQuantity !== undefined
        ? false
        : null,
    note: input.correction.note ?? null,
    metadata,
    ...input.actor,
  });

  if (
    input.correction.correctedSupplierId ||
    input.correction.correctedSupplierName
  ) {
    await automationService.recordFeedback({
      emailDerivedOfferId,
      offerWorkflowItemId: workflowItem.id,
      feedbackType: 'SUPPLIER_RESOLUTION',
      verdict: 'PARTIALLY_CORRECT',
      supplierCorrect: false,
      note: input.correction.note ?? null,
      metadata,
      ...input.actor,
    });
  }

  return correction;
}

reviewQueueRouter.get(
  '/',
  asyncHandler(async (_request, response) => {
    response.json({
      items: await listReviewQueueItems(),
    });
  }),
);

reviewQueueRouter.get(
  '/workflows',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listWorkflowItemsQuerySchema>
    >(request, {
      query: listWorkflowItemsQuerySchema,
    });

    response.json({
      items: await offerWorkflowService.listWorkflowItems({
        ...query,
        onlyOpen: query.onlyOpen ?? true,
        staleFirst: query.staleFirst ?? false,
      }),
    });
  }),
);

reviewQueueRouter.get(
  '/workflows/:id/events',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      items: await offerWorkflowService.listWorkflowEvents(params.id),
    });
  }),
);

reviewQueueRouter.get(
  '/workflows/:id/audit-history',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      items: requireFound(
        await offerWorkflowService.getWorkflowAuditHistory(params.id),
        'Offer workflow item not found.',
      ),
    });
  }),
);

reviewQueueRouter.get(
  '/workflows/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await offerWorkflowService.getWorkflowItem(params.id),
        'Offer workflow item not found.',
      ),
    });
  }),
);

reviewQueueRouter.post(
  '/workflows/:id/corrections',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof workflowCorrectionBodySchema>
    >(request, {
      params: idParamSchema,
      body: workflowCorrectionBodySchema,
    });

    const actor = resolveInternalActor(request, body);

    response.json({
      item: await createWorkflowCorrectionAndFeedback({
        workflowItemId: params.id,
        correction: body,
        actor,
      }),
    });
  }),
);

reviewQueueRouter.patch(
  '/workflows/:id',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof workflowActionBodySchema>
    >(request, {
      params: idParamSchema,
      body: workflowActionBodySchema,
    });

    const actor = resolveInternalActor(request, body);
    if (
      body.action === 'APPROVE_TO_BUY' &&
      hasCorrectionInput(body.correction)
    ) {
      await createWorkflowCorrectionAndFeedback({
        workflowItemId: params.id,
        correction: body.correction!,
        actor,
      });
    }

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
                  const result =
                    await offerWorkflowService.approveToBuyWithOutcome({
                      workflowItemId: params.id,
                      note: body.note ?? null,
                      allowQualificationRisk:
                        body.allowQualificationRisk === true,
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
                    const result =
                      await offerWorkflowService.rejectWorkflowItem({
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
                      externalOrderReference:
                        body.externalOrderReference ?? null,
                      orderPlacedAt: body.orderPlacedAt,
                      orderedQuantity: body.orderedQuantity,
                      orderedUnitPrice: body.orderedUnitPrice,
                      orderedCurrencyCode: body.orderedCurrencyCode,
                      orderedMinimumOrderQuantity:
                        body.orderedMinimumOrderQuantity,
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
  }),
);
