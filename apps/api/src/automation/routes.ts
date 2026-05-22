import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { asyncHandler } from '../http/errors';
import { actorBodySchema, operatorFeedbackSchema } from '../http/routeSchemas';
import {
  decimalInputSchema,
  optionalNumberQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { automationService } from './service';

export const automationRouter = Router();

const readinessQuerySchema = z.object({
  days: optionalNumberQuerySchema,
  scopeName: optionalTrimmedStringSchema,
});

const updateReadinessBodySchema = z
  .object({
    scopeName: optionalTrimmedStringSchema,
    globalMode: z
      .enum([
        'OBSERVE_ONLY',
        'INTERNAL_SIGNALS_ONLY',
        'DRAFTS_ONLY',
        'ASSISTED_OUTREACH',
        'FULLY_BLOCKED',
      ])
      .optional(),
    allowInternalSignals: z.boolean().optional(),
    allowDraftGeneration: z.boolean().optional(),
    allowSupplierDraftApprovalFlow: z.boolean().optional(),
    allowBuyerDraftApprovalFlow: z.boolean().optional(),
    allowActualSend: z.boolean().optional(),
    requireHumanApprovalBeforeSend: z.boolean().optional(),
    minimumExtractionPrecisionPct: decimalInputSchema.optional(),
    minimumSupplierResolutionPrecisionPct: decimalInputSchema.optional(),
    minimumSignalAcceptancePct: decimalInputSchema.optional(),
    minimumDraftPolicyPassPct: decimalInputSchema.optional(),
    minimumSampleSize: z.number().optional(),
    notes: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);

automationRouter.get(
  '/readiness',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof readinessQuerySchema>
    >(request, {
      query: readinessQuerySchema,
    });

    response.json({
      item: await automationService.getReadinessOverview({
        scopeName: query.scopeName,
        days: query.days,
      }),
    });
  }),
);

automationRouter.put(
  '/readiness',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof updateReadinessBodySchema>
    >(request, {
      body: updateReadinessBodySchema,
    });

    response.json({
      item: await automationService.updateReadinessPolicy({
        scopeName: body.scopeName,
        globalMode: body.globalMode,
        allowInternalSignals: body.allowInternalSignals,
        allowDraftGeneration: body.allowDraftGeneration,
        allowSupplierDraftApprovalFlow: body.allowSupplierDraftApprovalFlow,
        allowBuyerDraftApprovalFlow: body.allowBuyerDraftApprovalFlow,
        allowActualSend: body.allowActualSend,
        requireHumanApprovalBeforeSend: body.requireHumanApprovalBeforeSend,
        minimumExtractionPrecisionPct: body.minimumExtractionPrecisionPct,
        minimumSupplierResolutionPrecisionPct:
          body.minimumSupplierResolutionPrecisionPct,
        minimumSignalAcceptancePct: body.minimumSignalAcceptancePct,
        minimumDraftPolicyPassPct: body.minimumDraftPolicyPassPct,
        minimumSampleSize: body.minimumSampleSize,
        notes: body.notes,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);

automationRouter.get(
  '/evaluation',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof readinessQuerySchema>
    >(request, {
      query: readinessQuerySchema,
    });

    response.json({
      item: await automationService.getEvaluationMetrics({
        scopeName: query.scopeName,
        days: query.days,
      }),
    });
  }),
);

automationRouter.post(
  '/feedback',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof operatorFeedbackSchema>
    >(request, {
      body: operatorFeedbackSchema,
    });

    response.json({
      item: await automationService.recordFeedback({
        ...body,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);
