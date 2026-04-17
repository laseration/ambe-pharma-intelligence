import { Router } from 'express';
import type { OpportunityStatus, OpportunityType } from '@prisma/client';

import { listOpportunities, regenerateOpportunities } from './service';

const VALID_TYPES: OpportunityType[] = [
  'BUY',
  'PUSH',
  'DEAD_STOCK',
  'PRICE_ALERT',
  'LOW_MARGIN',
  'RESTOCK',
];

const VALID_STATUSES: OpportunityStatus[] = ['OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED'];

function parseType(value: unknown): OpportunityType | undefined {
  return typeof value === 'string' && VALID_TYPES.includes(value as OpportunityType)
    ? (value as OpportunityType)
    : undefined;
}

function parseStatus(value: unknown): OpportunityStatus | undefined {
  return typeof value === 'string' && VALID_STATUSES.includes(value as OpportunityStatus)
    ? (value as OpportunityStatus)
    : undefined;
}

export const opportunitiesRouter = Router();

opportunitiesRouter.get('/', async (request, response) => {
  try {
    const opportunities = await listOpportunities({
      type: parseType(request.query.type),
      status: parseStatus(request.query.status),
    });

    response.json({
      items: opportunities,
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list opportunities.',
    });
  }
});

opportunitiesRouter.post('/regenerate', async (_request, response) => {
  try {
    const result = await regenerateOpportunities();

    response.status(201).json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to regenerate opportunities.',
    });
  }
});
