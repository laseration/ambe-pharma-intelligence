import { Router } from 'express';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  optionalDateInputSchema,
  optionalBooleanQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { supplierQualificationService } from './qualificationService';
import { supplierScorecardService } from './scorecardService';

export const suppliersRouter = Router();

const qualificationStatusSchema = z.enum([
  'UNKNOWN',
  'PENDING_REVIEW',
  'APPROVED',
  'RESTRICTED',
  'BLOCKED',
]);

const trustTierSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const supplierScorecardTierSchema = z.enum(['STRONG', 'WATCH', 'RISKY']);

const supplierScorecardsQuerySchema = z.object({
  qualificationStatus: qualificationStatusSchema.optional(),
  tier: supplierScorecardTierSchema.optional(),
});

const supplierQualificationsQuerySchema = z.object({
  qualificationStatus: qualificationStatusSchema.optional(),
  trustTier: trustTierSchema.optional(),
  requiresManualApproval: optionalBooleanQuerySchema,
});

const upsertQualificationBodySchema = z.object({
  qualificationStatus: qualificationStatusSchema.optional(),
  trustTier: trustTierSchema.optional(),
  qualificationNote: optionalTrimmedStringSchema,
  expiresAt: optionalDateInputSchema,
  requiresManualApproval: z.boolean().optional(),
  canAutoApproveBuyDecisions: z.boolean().optional(),
  metadata: z.unknown().optional(),
}).merge(actorBodySchema);

suppliersRouter.get('/scorecards', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof supplierScorecardsQuerySchema>>(request, {
    query: supplierScorecardsQuerySchema,
  });

  response.json({
    items: await supplierScorecardService.listScorecards({
      qualificationStatus: query.qualificationStatus,
      tier: query.tier,
    }),
  });
}));

suppliersRouter.get('/qualifications', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof supplierQualificationsQuerySchema>>(request, {
    query: supplierQualificationsQuerySchema,
  });

  response.json({
    items: await supplierQualificationService.listQualifications({
      qualificationStatus: query.qualificationStatus,
      trustTier: query.trustTier,
      requiresManualApproval: query.requiresManualApproval,
    }),
  });
}));

suppliersRouter.get('/:id/scorecard', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(
      await supplierScorecardService.getScorecardForSupplier(params.id),
      'Supplier scorecard not found.',
    ),
  });
}));

suppliersRouter.get('/:id/qualification', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(
      await supplierQualificationService.getQualificationForSupplier(params.id),
      'Supplier qualification not found.',
    ),
  });
}));

suppliersRouter.put('/:id/qualification', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof upsertQualificationBodySchema>
  >(request, {
    params: idParamSchema,
    body: upsertQualificationBodySchema,
  });

  response.json({
    item: await supplierQualificationService.upsertQualification({
      supplierId: params.id,
      qualificationStatus: body.qualificationStatus,
      trustTier: body.trustTier,
      qualificationNote: body.qualificationNote ?? null,
      expiresAt: body.expiresAt,
      requiresManualApproval: body.requiresManualApproval,
      canAutoApproveBuyDecisions: body.canAutoApproveBuyDecisions,
      ...resolveInternalActor(request, body),
      metadata: body.metadata,
    }),
  });
}));
