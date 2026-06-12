import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, requireFound } from '../http/errors';
import {
  idParamSchema,
  optionalBooleanQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { customerService } from './service';

export const customersRouter = Router();

const limitQuerySchema = z.coerce.number().int().min(1).max(100).optional();
const pageQuerySchema = z.coerce.number().int().min(1).max(500).optional();

const listCustomersQuerySchema = z.object({
  q: optionalTrimmedStringSchema,
  activeOnly: optionalBooleanQuerySchema,
  limit: limitQuerySchema,
  page: pageQuerySchema,
});

const contactOpportunitiesQuerySchema = z.object({
  limit: limitQuerySchema,
});

customersRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listCustomersQuerySchema>
    >(request, {
      query: listCustomersQuerySchema,
    });

    response.json(await customerService.listCustomers(query));
  }),
);

customersRouter.get(
  '/contact-opportunities',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof contactOpportunitiesQuerySchema>
    >(request, {
      query: contactOpportunitiesQuerySchema,
    });

    response.json({
      items: await customerService.listContactOpportunities(query),
    });
  }),
);

customersRouter.get(
  '/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await customerService.getCustomer(params.id),
        'Customer not found.',
      ),
    });
  }),
);
