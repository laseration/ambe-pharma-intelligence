import { Router } from 'express';
import multer from 'multer';

import { importInventory, importSales, importSupplierPriceList } from './service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function requireFile(file: Express.Multer.File | undefined) {
  if (!file) {
    throw new Error('A file upload is required in the "file" field.');
  }

  return file;
}

export const importsRouter = Router();

importsRouter.post('/supplier-price-list', upload.single('file'), async (request, response) => {
  try {
    const result = await importSupplierPriceList({
      file: requireFile(request.file),
      supplierName: typeof request.body.supplierName === 'string' ? request.body.supplierName : undefined,
      sourceDate: typeof request.body.sourceDate === 'string' ? request.body.sourceDate : undefined,
      currencyCode: typeof request.body.currencyCode === 'string' ? request.body.currencyCode : undefined,
    });

    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Import failed.',
    });
  }
});

importsRouter.post('/inventory', upload.single('file'), async (request, response) => {
  try {
    const result = await importInventory({
      file: requireFile(request.file),
    });

    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Import failed.',
    });
  }
});

importsRouter.post('/sales', upload.single('file'), async (request, response) => {
  try {
    const result = await importSales({
      file: requireFile(request.file),
    });

    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Import failed.',
    });
  }
});
