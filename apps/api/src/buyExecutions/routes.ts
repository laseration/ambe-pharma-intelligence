import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { executionUpdateBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  optionalBooleanQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { buyExecutionService } from './service';

export const buyExecutionsRouter = Router();

buyExecutionsRouter.use(requireInternalOperatorAccess);

const fulfillmentStatusSchema = z.enum([
  'NOT_STARTED',
  'ORDER_PLACED',
  'ORDER_CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);

const reconciliationStatusSchema = z.enum([
  'NOT_RECONCILED',
  'MATCHED',
  'PRICE_DRIFT',
  'QUANTITY_DRIFT',
  'CURRENCY_MISMATCH',
  'REQUIRES_REVIEW',
]);

const listBuyExecutionsQuerySchema = z.object({
  buyDecisionId: optionalTrimmedStringSchema,
  supplierId: optionalTrimmedStringSchema,
  fulfillmentStatus: fulfillmentStatusSchema.optional(),
  reconciliationStatus: reconciliationStatusSchema.optional(),
  hasDrift: optionalBooleanQuerySchema,
});

buyExecutionsRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listBuyExecutionsQuerySchema>
    >(request, {
      query: listBuyExecutionsQuerySchema,
    });

    response.json({
      items: await buyExecutionService.listBuyExecutions(query),
    });
  }),
);

buyExecutionsRouter.get(
  '/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await buyExecutionService.getBuyExecution(params.id),
        'Buy execution not found.',
      ),
    });
  }),
);

buyExecutionsRouter.patch(
  '/:id',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof executionUpdateBodySchema>
    >(request, {
      params: idParamSchema,
      body: executionUpdateBodySchema,
    });

    response.json({
      item: await buyExecutionService.updateBuyExecution(params.id, {
        ...body,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);
