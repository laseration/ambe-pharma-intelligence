import { Router } from 'express';
import { z } from 'zod';

import { requireInternalOperatorAccess, resolveInternalActor } from '../http/auth';
import { asyncHandler, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  optionalDateInputSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import {
  getRegulatoryAlert,
  getRegulatoryReviewItem,
  getRegulatorySignal,
  getRegulatoryUpdate,
  ingestRegulatoryUpdate,
  listRegulatoryAlerts,
  listRegulatoryReviewItems,
  listRegulatorySignals,
  listRegulatoryUpdates,
  matchRegulatorySignal,
  parseStoredRegulatoryUpdate,
  previewRegulatoryAlertMessage,
  updateRegulatoryAlertStatus,
  updateRegulatoryReviewItem,
} from './service';

export const regulatoryRouter = Router();

const regulatoryAlertStatusSchema = z.enum([
  'NEW',
  'REVIEWING',
  'ACTIONED',
  'IGNORED',
  'FALSE_MATCH',
]);

const regulatoryIngestBodySchema = z.object({
  sourceUrl: z.string().trim().url(),
  title: z.string().trim().min(1),
  publishedAt: optionalDateInputSchema,
  rawText: z.string().trim().min(1),
  regulator: optionalTrimmedStringSchema,
  category: optionalTrimmedStringSchema,
  evidence: z.unknown().optional(),
}).merge(actorBodySchema);

const listByStatusQuerySchema = z.object({
  status: regulatoryAlertStatusSchema.optional(),
});

const statusPatchBodySchema = z.object({
  status: regulatoryAlertStatusSchema,
  note: optionalTrimmedStringSchema,
}).merge(actorBodySchema);

const reviewItemPatchBodySchema = z.object({
  status: regulatoryAlertStatusSchema.optional(),
  note: optionalTrimmedStringSchema,
  assigneeLabel: z.union([z.string().trim().min(1), z.null()]).optional(),
}).merge(actorBodySchema);

regulatoryRouter.get('/updates', asyncHandler(async (_request, response) => {
  response.json({
    items: await listRegulatoryUpdates(),
  });
}));

regulatoryRouter.get('/updates/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(await getRegulatoryUpdate(params.id), 'Regulatory update not found.'),
  });
}));

regulatoryRouter.post('/updates/ingest', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { body } = parseRequest<unknown, unknown, z.infer<typeof regulatoryIngestBodySchema>>(request, {
    body: regulatoryIngestBodySchema,
  });

  response.status(201).json({
    item: await ingestRegulatoryUpdate(body, resolveInternalActor(request, body)),
  });
}));

regulatoryRouter.post('/updates/:id/parse', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof actorBodySchema>
  >(request, {
    params: idParamSchema,
    body: actorBodySchema,
  });

  response.status(201).json({
    item: await parseStoredRegulatoryUpdate(params.id, resolveInternalActor(request, body)),
  });
}));

regulatoryRouter.get('/signals', asyncHandler(async (_request, response) => {
  response.json({
    items: await listRegulatorySignals(),
  });
}));

regulatoryRouter.get('/signals/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(await getRegulatorySignal(params.id), 'Regulatory signal not found.'),
  });
}));

regulatoryRouter.post('/signals/:id/match-products', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof actorBodySchema>
  >(request, {
    params: idParamSchema,
    body: actorBodySchema,
  });

  response.status(201).json(await matchRegulatorySignal(params.id, resolveInternalActor(request, body)));
}));

regulatoryRouter.get('/alerts', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listByStatusQuerySchema>>(request, {
    query: listByStatusQuerySchema,
  });

  response.json({
    items: await listRegulatoryAlerts({ status: query.status }),
  });
}));

regulatoryRouter.get('/alerts/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(await getRegulatoryAlert(params.id), 'Regulatory alert not found.'),
  });
}));

regulatoryRouter.post('/alerts/:id/preview-message', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json(await previewRegulatoryAlertMessage(params.id));
}));

regulatoryRouter.patch('/alerts/:id/status', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof statusPatchBodySchema>
  >(request, {
    params: idParamSchema,
    body: statusPatchBodySchema,
  });

  response.json({
    item: await updateRegulatoryAlertStatus({
      alertId: params.id,
      status: body.status,
      note: body.note,
      ...resolveInternalActor(request, body),
    }),
  });
}));

regulatoryRouter.get('/review-items', asyncHandler(async (request, response) => {
  const { query } = parseRequest<unknown, z.infer<typeof listByStatusQuerySchema>>(request, {
    query: listByStatusQuerySchema,
  });

  response.json({
    items: await listRegulatoryReviewItems({ status: query.status }),
  });
}));

regulatoryRouter.get('/review-items/:id', asyncHandler(async (request, response) => {
  const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
    params: idParamSchema,
  });

  response.json({
    item: requireFound(await getRegulatoryReviewItem(params.id), 'Regulatory review item not found.'),
  });
}));

regulatoryRouter.patch('/review-items/:id', requireInternalOperatorAccess, asyncHandler(async (request, response) => {
  const { params, body } = parseRequest<
    z.infer<typeof idParamSchema>,
    unknown,
    z.infer<typeof reviewItemPatchBodySchema>
  >(request, {
    params: idParamSchema,
    body: reviewItemPatchBodySchema,
  });

  response.json({
    item: await updateRegulatoryReviewItem({
      reviewItemId: params.id,
      status: body.status,
      note: body.note,
      assigneeLabel: body.assigneeLabel,
      ...resolveInternalActor(request, body),
    }),
  });
}));
