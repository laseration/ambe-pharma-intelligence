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
import { commercialIntelService } from './service';

const commercialIntelStatusSchema = z.enum(['NEW', 'APPROVED', 'REJECTED', 'EXPIRED']);
const commercialIntelItemTypeSchema = z.enum([
  'SUPPLIER_RELIABILITY_NOTE',
  'BUYER_DEMAND_SIGNAL',
  'MANUAL_BUY_TRIGGER',
  'MANUAL_SELL_TRIGGER',
  'MARKET_PRICE_INTEL',
  'EXPIRY_RISK_RULE',
  'PRODUCT_NOTE',
  'CONTACT_NOTE',
  'OTHER',
]);

const listCommercialIntelQuerySchema = z.object({
  status: commercialIntelStatusSchema.optional(),
  itemType: commercialIntelItemTypeSchema.optional(),
  productId: optionalTrimmedStringSchema,
  supplierId: optionalTrimmedStringSchema,
  take: optionalNumberQuerySchema,
});

const updateCommercialIntelBodySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'EXPIRE']),
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

const parsePreviewBodySchema = z.object({
  rawText: z.string().trim().min(1),
});

type CommercialIntelRouteService = Pick<
  typeof commercialIntelService,
  'getItem' | 'listItems' | 'parsePreview' | 'updateItemStatus'
>;

export function createCommercialIntelRouter(
  service: CommercialIntelRouteService = commercialIntelService,
): Router {
  const router = Router();

  router.get('/', asyncHandler(async (request, response) => {
    const { query } = parseRequest<unknown, z.infer<typeof listCommercialIntelQuerySchema>>(request, {
      query: listCommercialIntelQuerySchema,
    });

    response.json({
      items: await service.listItems(query),
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
      item: requireFound(await service.getItem(params.id), 'Commercial intel item not found.'),
    });
  }));

  router.patch('/:id', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof updateCommercialIntelBodySchema>
    >(request, {
      params: idParamSchema,
      body: updateCommercialIntelBodySchema,
    });

    response.json({
      item: await service.updateItemStatus(params.id, {
        action: body.action,
        note: body.note,
        ...resolveInternalActor(request, body),
      }),
    });
  }));

  return router;
}

export const commercialIntelRouter = createCommercialIntelRouter();
