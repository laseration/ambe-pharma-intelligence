import { Router } from 'express';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  nullableTrimmedStringSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import {
  getAccountOpeningCaseDetail,
  saveAccountOpeningMissingInfo,
  updateAccountOpeningCaseStatus,
  type AccountOpeningCaseDetail,
  type AccountOpeningMissingInfoResponses,
  type AccountOpeningStatusAction,
} from './service';

type AccountOpeningRouteDependencies = {
  getCaseDetail: typeof getAccountOpeningCaseDetail;
  saveMissingInfo: typeof saveAccountOpeningMissingInfo;
  updateStatus: typeof updateAccountOpeningCaseStatus;
};

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
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

const defaultDependencies: AccountOpeningRouteDependencies = {
  getCaseDetail: getAccountOpeningCaseDetail,
  saveMissingInfo: saveAccountOpeningMissingInfo,
  updateStatus: updateAccountOpeningCaseStatus,
};

function pickMissingInfoResponses(
  body: z.infer<typeof missingInfoBodySchema>,
): AccountOpeningMissingInfoResponses {
  return {
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
  };
}

export function createAccountOpeningRouter(
  dependencies: AccountOpeningRouteDependencies = defaultDependencies,
) {
  const router = Router();

  router.get('/:id', asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await dependencies.getCaseDetail(params.id),
        'Account-opening case not found.',
      ),
    });
  }));

  router.patch(
    '/:id/missing-info',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof missingInfoBodySchema>
      >(request, {
        params: idParamSchema,
        body: missingInfoBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item: AccountOpeningCaseDetail = await dependencies.saveMissingInfo({
        id: params.id,
        missingInfoResponses: pickMissingInfoResponses(body),
        ...actor,
      });

      response.json({ item });
    }),
  );

  router.patch(
    '/:id/status',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof statusBodySchema>
      >(request, {
        params: idParamSchema,
        body: statusBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item = await dependencies.updateStatus({
        id: params.id,
        action: body.action as AccountOpeningStatusAction,
        note: body.note ?? null,
        ...actor,
      });

      response.json({ item });
    }),
  );

  return router;
}

export const accountOpeningRouter = createAccountOpeningRouter();
