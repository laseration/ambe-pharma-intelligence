import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  getInternalAuthContext,
  requireInternalOperatorAccess,
} from '../http/auth';
import { asyncHandler, requireFound, ValidationError } from '../http/errors';
import { logger } from '../lib/logger';
import {
  idParamSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import {
  getImportBatchDetail,
  importInventory,
  importSales,
  importSupplierPriceList,
  listRecentImportBatches,
} from './service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function requireFile(file: Express.Multer.File | undefined) {
  if (!file) {
    throw new ValidationError('A file upload is required in the "file" field.');
  }

  return file;
}

export const importsRouter = Router();

const listImportBatchesQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
});

importsRouter.get(
  '/batches',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listImportBatchesQuerySchema>
    >(request, {
      query: listImportBatchesQuerySchema,
    });

    response.json({
      items: await listRecentImportBatches(query.take ?? 20),
    });
  }),
);

importsRouter.get(
  '/batches/:id',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json({
      item: requireFound(
        await getImportBatchDetail(params.id),
        'Import batch not found.',
      ),
    });
  }),
);

const supplierPriceListBodySchema = z.object({
  supplierName: optionalTrimmedStringSchema,
  sourceDate: optionalTrimmedStringSchema.refine(
    (value) => value === undefined || !Number.isNaN(Date.parse(value)),
    'Invalid sourceDate value.',
  ),
  currencyCode: optionalTrimmedStringSchema,
});

importsRouter.post(
  '/supplier-price-list',
  requireInternalOperatorAccess,
  upload.single('file'),
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof supplierPriceListBodySchema>
    >(request, {
      body: supplierPriceListBodySchema,
    });
    const file = requireFile(request.file);
    const auth = getInternalAuthContext(request);

    logger.info('Internal supplier price list import requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
      fileName: file.originalname,
      supplierName: body.supplierName ?? null,
    });

    const result = await importSupplierPriceList({
      file,
      supplierName: body.supplierName,
      sourceDate: body.sourceDate,
      currencyCode: body.currencyCode,
    });

    response.status(201).json(result);
  }),
);

importsRouter.post(
  '/inventory',
  requireInternalOperatorAccess,
  upload.single('file'),
  asyncHandler(async (request, response) => {
    const file = requireFile(request.file);
    const auth = getInternalAuthContext(request);

    logger.info('Internal inventory import requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
      fileName: file.originalname,
    });

    const result = await importInventory({
      file,
    });

    response.status(201).json(result);
  }),
);

importsRouter.post(
  '/sales',
  requireInternalOperatorAccess,
  upload.single('file'),
  asyncHandler(async (request, response) => {
    const file = requireFile(request.file);
    const auth = getInternalAuthContext(request);

    logger.info('Internal sales import requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
      fileName: file.originalname,
    });

    const result = await importSales({
      file,
    });

    response.status(201).json(result);
  }),
);
