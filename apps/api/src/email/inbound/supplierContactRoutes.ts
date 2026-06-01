import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../../http/auth';
import { asyncHandler, requireFound } from '../../http/errors';
import { actorBodySchema } from '../../http/routeSchemas';
import {
  idParamSchema,
  nullableTrimmedStringSchema,
  parseRequest,
} from '../../http/validation';
import {
  getSupplierContactCandidate,
  listSupplierContactCandidates,
  listSupplierContactEvents,
  reviewSupplierContactCandidate,
  type SupplierContactStatus,
} from './supplierContactPersistence';

export const supplierContactRouter = Router();

const supplierContactStatusSchema = z.enum([
  'STAGED',
  'AUTO_ACCEPTED',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
]);

const listSupplierContactsQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
  status: supplierContactStatusSchema.optional(),
  inboundEmailId: nullableTrimmedStringSchema,
  supplierId: nullableTrimmedStringSchema,
});

const supplierContactActionBodySchema = z
  .object({
    action: z.enum([
      'APPROVE',
      'REJECT',
      'SUPERSEDE',
      'LINK_SUPPLIER',
      'ADD_NOTE',
    ]),
    supplierId: nullableTrimmedStringSchema,
    note: nullableTrimmedStringSchema,
  })
  .merge(actorBodySchema);

supplierContactRouter.use(requireInternalOperatorAccess);

supplierContactRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listSupplierContactsQuerySchema>
    >(request, {
      query: listSupplierContactsQuerySchema,
    });

    response.json({
      items: await listSupplierContactCandidates({
        take: query.take,
        status: (query.status ?? null) as SupplierContactStatus | null,
        inboundEmailId: query.inboundEmailId ?? null,
        supplierId: query.supplierId ?? null,
      }),
    });
  }),
);

supplierContactRouter.get(
  '/:id',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await getSupplierContactCandidate(params.id),
        'Supplier contact candidate not found.',
      ),
    });
  }),
);

supplierContactRouter.get(
  '/:id/events',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      items: await listSupplierContactEvents(params.id),
    });
  }),
);

supplierContactRouter.patch(
  '/:id',
  asyncHandler(async (request, response) => {
    const { params, body } = parseRequest<
      z.infer<typeof idParamSchema>,
      unknown,
      z.infer<typeof supplierContactActionBodySchema>
    >(request, {
      params: idParamSchema,
      body: supplierContactActionBodySchema,
    });

    response.json({
      item: await reviewSupplierContactCandidate({
        id: params.id,
        action: body.action,
        supplierId: body.supplierId ?? null,
        note: body.note ?? null,
        ...resolveInternalActor(request, body),
      }),
    });
  }),
);
