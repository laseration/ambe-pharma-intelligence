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
import { customerDemandService } from './service';

const customerDemandStatusSchema = z.enum(['NEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'MATCHED']);
const customerDemandRequestTypeSchema = z.enum([
  'SOURCE_PRODUCT',
  'CHECK_AVAILABILITY',
  'REQUEST_QUOTE',
  'BUYER_INTEREST',
  'REPEAT_DEMAND',
  'OTHER',
]);

const listCustomerDemandQuerySchema = z.object({
  status: customerDemandStatusSchema.optional(),
  requestType: customerDemandRequestTypeSchema.optional(),
  productId: optionalTrimmedStringSchema,
  customerId: optionalTrimmedStringSchema,
  take: optionalNumberQuerySchema,
});

const updateCustomerDemandBodySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'EXPIRE']),
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

const parsePreviewBodySchema = z.object({
  rawText: z.string().trim().min(1),
});

type CustomerDemandRouteService = Pick<
  typeof customerDemandService,
  'getSignal' | 'listSignals' | 'parsePreview' | 'updateSignalStatus'
>;

export function createCustomerDemandRouter(
  service: CustomerDemandRouteService = customerDemandService,
): Router {
  const router = Router();

  router.get('/', asyncHandler(async (request, response) => {
    const { query } = parseRequest<unknown, z.infer<typeof listCustomerDemandQuerySchema>>(request, {
      query: listCustomerDemandQuerySchema,
    });

    response.json({
      items: await service.listSignals(query),
    });
  }));

  router.post('/parse-preview', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
    const { body } = parseRequest<unknown, unknown, z.infer<typeof parsePreviewBodySchema>>(request, {
      body: parsePreviewBodySchema,
    });

    response.json(await service.parsePreview(body.rawText));
  }));

  router.get('/:id', asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(await service.getSignal(params.id), 'Customer demand signal not found.'),
    });
  }));

  router.patch('/:id', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof updateCustomerDemandBodySchema>
    >(request, {
      params: idParamSchema,
      body: updateCustomerDemandBodySchema,
    });

    response.json({
      item: await service.updateSignalStatus(params.id, {
        action: body.action,
        note: body.note,
        ...resolveInternalActor(request, body),
      }),
    });
  }));

  return router;
}

export const customerDemandRouter = createCustomerDemandRouter();
