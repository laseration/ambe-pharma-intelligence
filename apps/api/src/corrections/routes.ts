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
import { offerCorrectionService } from './service';

export const correctionsRouter = Router();
export const sourceProfilesRouter = Router();

const correctionStatusSchema = z.enum(['APPLIED', 'SUPERSEDED', 'REJECTED']);
const sourceReliabilityTierSchema = z.enum(['TRUSTED', 'WATCH', 'RISKY']);

const listCorrectionsQuerySchema = z.object({
  emailDerivedOfferId: optionalTrimmedStringSchema,
  inboundEmailId: optionalTrimmedStringSchema,
  offerWorkflowItemId: optionalTrimmedStringSchema,
  status: correctionStatusSchema.optional(),
});

const correctionFieldsSchema = z.object({
  offerWorkflowItemId: optionalTrimmedStringSchema,
  inboundEmailId: optionalTrimmedStringSchema,
  correctionStatus: correctionStatusSchema.optional(),
  correctedSupplierId: optionalTrimmedStringSchema,
  correctedSupplierName: optionalTrimmedStringSchema,
  correctedProductId: optionalTrimmedStringSchema,
  correctedRawProductText: optionalTrimmedStringSchema,
  correctedNormalizedProductName: optionalTrimmedStringSchema,
  correctedStrength: optionalTrimmedStringSchema,
  correctedDosageForm: optionalTrimmedStringSchema,
  correctedPackSize: optionalTrimmedStringSchema,
  correctedManufacturer: optionalTrimmedStringSchema,
  correctedUnitPrice: z.union([z.number(), z.string().trim().min(1)]).optional(),
  correctedCurrencyCode: optionalTrimmedStringSchema,
  correctedMinimumOrderQuantity: z.number().optional(),
  correctedAvailability: optionalTrimmedStringSchema,
  note: optionalTrimmedStringSchema,
  metadata: z.unknown().optional(),
});

const createCorrectionBodySchema = correctionFieldsSchema.extend({
  emailDerivedOfferId: z.string().trim().min(1),
}).merge(actorBodySchema);

const updateCorrectionBodySchema = correctionFieldsSchema.merge(actorBodySchema);

const listSourceProfilesQuerySchema = z.object({
  reliabilityTier: sourceReliabilityTierSchema.optional(),
  senderEmail: optionalTrimmedStringSchema,
  senderDomain: optionalTrimmedStringSchema,
  supplierId: optionalTrimmedStringSchema,
});

correctionsRouter.get('/', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listCorrectionsQuerySchema>>(request, {
    query: listCorrectionsQuerySchema,
  });

  response.json({
    items: await offerCorrectionService.listCorrections(query),
  });
}));

correctionsRouter.post('/', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { body } = parseRequest<unknown, unknown, z.infer<typeof createCorrectionBodySchema>>(request, {
    body: createCorrectionBodySchema,
  });

  response.json({
    item: await offerCorrectionService.createCorrection({
      ...body,
      ...resolveInternalActor(request, body),
    }),
  });
}));

correctionsRouter.patch('/:id', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof updateCorrectionBodySchema>
  >(request, {
    params: idParamSchema,
    body: updateCorrectionBodySchema,
  });

  response.json({
    item: await offerCorrectionService.updateCorrection(params.id, {
      ...body,
      ...resolveInternalActor(request, body),
    }),
  });
}));

sourceProfilesRouter.get('/profiles', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listSourceProfilesQuerySchema>>(request, {
    query: listSourceProfilesQuerySchema,
  });

  response.json({
    items: await offerCorrectionService.listSourceProfiles(query),
  });
}));

sourceProfilesRouter.get('/profiles/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(
      await offerCorrectionService.getSourceProfile(params.id),
      'Source profile not found.',
    ),
  });
}));
