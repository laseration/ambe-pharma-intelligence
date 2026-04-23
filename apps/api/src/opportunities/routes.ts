import { Router } from 'express';
import type { OpportunityStatus, OpportunityType } from '@prisma/client';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import { optionalTrimmedStringSchema } from '../http/validation';
import { idParamSchema, parseRequest } from '../http/validation';
import {
  getOpportunityScoringAudit,
  listOpportunities,
  regenerateOpportunities,
  updateOpportunityStatus,
} from './service';

const VALID_TYPES: OpportunityType[] = [
  'BUY',
  'PUSH',
  'DEAD_STOCK',
  'PRICE_ALERT',
  'LOW_MARGIN',
  'RESTOCK',
];

const VALID_STATUSES: OpportunityStatus[] = ['OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED'];

export const opportunitiesRouter = Router();

const listOpportunitiesQuerySchema = z.object({
  type: z.enum(VALID_TYPES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  sortBy: z.enum(['score', 'updatedAt']).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

const updateOpportunityStatusBodySchema = z.object({
  status: z.enum(['REVIEWED', 'ACTIONED', 'DISMISSED']),
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

opportunitiesRouter.get('/', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listOpportunitiesQuerySchema>>(request, {
    query: listOpportunitiesQuerySchema,
  });

  const opportunities = await listOpportunities({
    type: query.type,
    status: query.status,
    sortBy: query.sortBy,
    take: query.take,
  });

  response.json({
    items: opportunities,
  });
}));

const opportunityAuditParamSchema = z.object({
  productId: z.string().trim().min(1),
});

opportunitiesRouter.get('/audit/:productId', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof opportunityAuditParamSchema>>(request, {
    params: opportunityAuditParamSchema,
  });

  const audit = requireFound(
    await getOpportunityScoringAudit(params.productId),
    'Product scoring context not found.',
  );

  response.json(audit);
}));

opportunitiesRouter.patch('/:id/status', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof updateOpportunityStatusBodySchema>
  >(request, {
    params: idParamSchema,
    body: updateOpportunityStatusBodySchema,
  });

  const item = requireFound(
    await updateOpportunityStatus({
      opportunityId: params.id,
      status: body.status,
      note: body.note ?? null,
      ...resolveInternalActor(request, body),
    }),
    'Opportunity not found.',
  );

  response.json({
    item,
  });
}));

opportunitiesRouter.post('/regenerate', requireInternalOperatorAccess, asyncHandler(async (_request, response) => {
  const result = await regenerateOpportunities();

  response.status(201).json(result);
}));
