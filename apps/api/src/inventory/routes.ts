import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../http/errors';
import {
  optionalBooleanQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { inventoryService } from './service';

export const inventoryRouter = Router();

const limitQuerySchema = z.coerce.number().int().min(1).max(100).optional();
const pageQuerySchema = z.coerce.number().int().min(1).max(500).optional();

const listInventoryQuerySchema = z.object({
  q: optionalTrimmedStringSchema,
  productId: optionalTrimmedStringSchema,
  supplierId: optionalTrimmedStringSchema,
  lowStockOnly: optionalBooleanQuerySchema,
  staleOnly: optionalBooleanQuerySchema,
  limit: limitQuerySchema,
  page: pageQuerySchema,
});

const stockRiskQuerySchema = z.object({
  limit: limitQuerySchema,
});

inventoryRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listInventoryQuerySchema>
    >(request, {
      query: listInventoryQuerySchema,
    });

    const result = await inventoryService.listInventory(query);

    response.json(result);
  }),
);

inventoryRouter.get(
  '/stock-risk',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof stockRiskQuerySchema>
    >(request, {
      query: stockRiskQuerySchema,
    });

    response.json({
      items: await inventoryService.listStockRisk(query),
    });
  }),
);
