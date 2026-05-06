import { Router } from 'express';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  optionalNumberQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { demandSupplyMatchService } from './service';

const demandSupplyMatchStatusSchema = z.enum(['NEW', 'REVIEWED', 'REJECTED', 'PROMOTED', 'EXPIRED']);
const demandSupplyMatchConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

const listDemandSupplyMatchQuerySchema = z.object({
  status: demandSupplyMatchStatusSchema.optional(),
  confidence: demandSupplyMatchConfidenceSchema.optional(),
  productId: optionalTrimmedStringSchema,
  customerId: optionalTrimmedStringSchema,
  supplierId: optionalTrimmedStringSchema,
  take: optionalNumberQuerySchema,
});

const generationBodySchema = z.object({
  lookbackDays: z.number().positive().optional(),
  take: z.number().positive().optional(),
});

const updateDemandSupplyMatchBodySchema = z.object({
  action: z.enum(['REVIEW', 'REJECT', 'EXPIRE']),
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

type DemandSupplyMatchRouteService = Pick<
  typeof demandSupplyMatchService,
  | 'generateDemandSupplyMatches'
  | 'getDemandSupplyMatch'
  | 'listDemandSupplyMatches'
  | 'previewDemandSupplyMatches'
  | 'updateDemandSupplyMatch'
>;

export function createDemandSupplyMatchRouter(
  service: DemandSupplyMatchRouteService = demandSupplyMatchService,
): Router {
  const router = Router();

  router.get('/', asyncHandler(async (request, response) => {
    const { query } = parseRequest<unknown, z.infer<typeof listDemandSupplyMatchQuerySchema>>(request, {
      query: listDemandSupplyMatchQuerySchema,
    });

    response.json({
      items: await service.listDemandSupplyMatches(query),
    });
  }));

  router.post('/generate-preview', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
    const { body } = parseRequest<unknown, unknown, z.infer<typeof generationBodySchema>>(request, {
      body: generationBodySchema,
    });

    response.json(await service.previewDemandSupplyMatches(body));
  }));

  router.post('/generate', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
    const { body } = parseRequest<unknown, unknown, z.infer<typeof generationBodySchema>>(request, {
      body: generationBodySchema,
    });

    response.json(await service.generateDemandSupplyMatches(body));
  }));

  router.get('/:id', asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(await service.getDemandSupplyMatch(params.id), 'Demand supply match not found.'),
    });
  }));

  router.patch('/:id', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof updateDemandSupplyMatchBodySchema>
    >(request, {
      params: idParamSchema,
      body: updateDemandSupplyMatchBodySchema,
    });

    response.json({
      item: await service.updateDemandSupplyMatch(params.id, {
        action: body.action,
        note: body.note,
        ...resolveInternalActor(request, body),
      }),
    });
  }));

  return router;
}

export const demandSupplyMatchRouter = createDemandSupplyMatchRouter();
