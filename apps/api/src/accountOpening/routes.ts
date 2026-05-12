import { Router } from 'express';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import { idParamSchema, nullableTrimmedStringSchema, parseRequest } from '../http/validation';
import {
  generateCompletedAccountOpeningDraft,
  getAccountOpeningCaseDetail,
  saveAccountOpeningMissingInfo,
  updateAccountOpeningCaseStatus,
} from './service';

const missingInfoBodySchema = z.object({
  website: nullableTrimmedStringSchema,
  numberOfEmployees: nullableTrimmedStringSchema,
  businessHours: nullableTrimmedStringSchema,
  estimatedMonthlyPurchases: nullableTrimmedStringSchema,
  webOrdering: nullableTrimmedStringSchema,
  directDebitRequested: nullableTrimmedStringSchema,
  cdLicenceApplies: nullableTrimmedStringSchema,
  gphcPremisesNumber: nullableTrimmedStringSchema,
  cqcRegistration: nullableTrimmedStringSchema,
  reviewerNotes: nullableTrimmedStringSchema,
}).merge(actorBodySchema);

const statusBodySchema = z.object({
  action: z.enum(['MARKED_NEEDS_INFO', 'APPROVED_FOR_COMPLETION', 'REJECTED']),
  note: nullableTrimmedStringSchema,
}).merge(actorBodySchema);

const generateDraftBodySchema = actorBodySchema;

export const accountOpeningRouter = Router();

accountOpeningRouter.get('/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(await getAccountOpeningCaseDetail(params.id), 'Account-opening case not found.'),
  });
}));

accountOpeningRouter.patch('/:id/missing-info', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof missingInfoBodySchema>
  >(request, {
    params: idParamSchema,
    body: missingInfoBodySchema,
  });

  response.json({
    item: await saveAccountOpeningMissingInfo({
      id: params.id,
      missingInfoResponses: {
        website: body.website,
        numberOfEmployees: body.numberOfEmployees,
        businessHours: body.businessHours,
        estimatedMonthlyPurchases: body.estimatedMonthlyPurchases,
        webOrdering: body.webOrdering,
        directDebitRequested: body.directDebitRequested,
        cdLicenceApplies: body.cdLicenceApplies,
        gphcPremisesNumber: body.gphcPremisesNumber,
        cqcRegistration: body.cqcRegistration,
        reviewerNotes: body.reviewerNotes,
      },
      ...resolveInternalActor(request, body),
    }),
  });
}));

accountOpeningRouter.patch('/:id/status', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof statusBodySchema>
  >(request, {
    params: idParamSchema,
    body: statusBodySchema,
  });

  response.json({
    item: await updateAccountOpeningCaseStatus({
      id: params.id,
      action: body.action,
      note: body.note,
      ...resolveInternalActor(request, body),
    }),
  });
}));

accountOpeningRouter.post('/:id/generate-draft', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof generateDraftBodySchema>
  >(request, {
    params: idParamSchema,
    body: generateDraftBodySchema,
  });

  response.json({
    item: await generateCompletedAccountOpeningDraft({
      id: params.id,
      ...resolveInternalActor(request, body),
    }),
  });
}));
