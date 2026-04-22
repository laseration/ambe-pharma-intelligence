import { Router } from 'express';
import type { OpportunityStatus, OpportunityType } from '@prisma/client';
import { z } from 'zod';

import { requireInternalOperatorAccess } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { idParamSchema, parseRequest } from '../http/validation';
import { getOpportunityScoringAudit, listOpportunities, regenerateOpportunities } from './service';

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
});

opportunitiesRouter.get('/', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listOpportunitiesQuerySchema>>(request, {
    query: listOpportunitiesQuerySchema,
  });

  const opportunities = await listOpportunities({
    type: query.type,
    status: query.status,
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

opportunitiesRouter.post('/regenerate', requireInternalOperatorAccess, asyncHandler(async (_request, response) => {
  const result = await regenerateOpportunities();

  response.status(201).json(result);
}));
