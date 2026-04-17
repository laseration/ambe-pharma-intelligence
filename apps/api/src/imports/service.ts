import { Prisma } from '@prisma/client';

import { db } from '../lib/db';
import { normalizeText } from './normalization';
import { parseUploadedFile } from './parsers';
import type {
  ImportResponse,
  ImportSummary,
  InventoryImportRequest,
  InventoryRowInput,
  ParsedTableRow,
  RowIssue,
  SalesImportRequest,
  SalesRowInput,
  SupplierPriceListImportRequest,
  SupplierPriceListRowInput,
} from './types';
import { validateInventoryRows, validateSalesRows, validateSupplierPriceRows } from './validators';

function buildSummary(
  totalRows: number,
  validRows: number,
  invalidRows: number,
  warnings: string[],
): ImportSummary {
  return {
    totalRows,
    validRows,
    invalidRows,
    warnings,
  };
}

async function createImportBatch(
  kind: 'SUPPLIER_PRICE_LIST' | 'INVENTORY' | 'SALES',
  file: SupplierPriceListImportRequest['file'],
  summary: ImportSummary,
  errors: RowIssue[],
) {
  return db.importBatch.create({
    data: {
      kind,
      status: errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      fileSizeBytes: file.size,
      totalRows: summary.totalRows,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows,
      warnings: summary.warnings,
      errors: {
        create: errors.map((error) => ({
          rowNumber: error.rowNumber,
          fieldName: error.fieldName,
          message: error.message,
          rawRow: error.rawRow,
        })),
      },
    },
  });
}

async function findOrCreateSupplier(rawSupplierName: string) {
  const normalizedName = normalizeText(rawSupplierName);

  const existing = await db.supplier.findUnique({
    where: { normalizedName },
  });

  if (existing) {
    return existing;
  }

  return db.supplier.create({
    data: {
      name: rawSupplierName,
      normalizedName,
    },
  });
}

async function findOrCreateCustomer(rawCustomerName: string) {
  const normalizedName = normalizeText(rawCustomerName);

  const existing = await db.customer.findUnique({
    where: { normalizedName },
  });

  if (existing) {
    return existing;
  }

  return db.customer.create({
    data: {
      name: rawCustomerName,
      normalizedName,
    },
  });
}

async function ensureProductAlias(productId: string, rawProductName: string, sourceSystem: string) {
  const existingAlias = await db.productAlias.findFirst({
    where: {
      productId,
      aliasName: rawProductName,
    },
  });

  if (existingAlias) {
    return existingAlias;
  }

  return db.productAlias.create({
    data: {
      productId,
      aliasName: rawProductName,
      sourceSystem,
    },
  });
}

async function findOrCreateProduct(
  rawProductName: string,
  candidates: SupplierPriceListRowInput['productCandidates'],
  sourceSystem: string,
) {
  const existing = await db.product.findFirst({
    where: {
      normalizedName: candidates.normalizedName,
    },
  });

  if (existing) {
    await ensureProductAlias(existing.id, rawProductName, sourceSystem);
    return existing;
  }

  const product = await db.product.create({
    data: {
      name: rawProductName,
      normalizedName: candidates.normalizedName,
      strength: candidates.strength,
      dosageForm: candidates.formulation,
      packSize: candidates.packSize,
      aliases: {
        create: {
          aliasName: rawProductName,
          sourceSystem,
        },
      },
    },
  });

  return product;
}

function safeSourceDate(value?: string): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function persistSupplierPriceRows(
  supplierPriceListId: string,
  supplierId: string,
  rows: SupplierPriceListRowInput[],
) {
  for (const row of rows) {
    const product = await findOrCreateProduct(
      row.rawProductName,
      row.productCandidates,
      'import:supplier-price-list',
    );

    await db.supplierPriceItem.create({
      data: {
        supplierPriceListId,
        supplierId,
        productId: product.id,
        rawProductName: row.rawProductName,
        normalizedProductName: row.productCandidates.normalizedName,
        candidateStrength: row.productCandidates.strength,
        candidateFormulation: row.productCandidates.formulation,
        candidatePackSize: row.productCandidates.packSize,
        packDescription: row.packDescription,
        unitPrice: row.unitPrice,
        currencyCode: row.currencyCode,
        minimumOrderQuantity: row.minimumOrderQuantity,
        isAvailable: row.isAvailable,
        rawRow: row.rawRow,
      },
    });
  }
}

async function persistInventoryRows(importBatchId: string, rows: InventoryRowInput[]) {
  for (const row of rows) {
    const product = await findOrCreateProduct(
      row.rawProductName,
      row.productCandidates,
      'import:inventory',
    );

    const supplier = row.rawSupplierName ? await findOrCreateSupplier(row.rawSupplierName) : null;

    await db.inventorySnapshot.create({
      data: {
        importBatchId,
        productId: product.id,
        supplierId: supplier?.id,
        rawProductName: row.rawProductName,
        rawSupplierName: row.rawSupplierName,
        normalizedProductName: row.productCandidates.normalizedName,
        candidateStrength: row.productCandidates.strength,
        candidateFormulation: row.productCandidates.formulation,
        candidatePackSize: row.productCandidates.packSize,
        warehouseCode: row.warehouseCode,
        snapshotDate: row.snapshotDate,
        quantityOnHand: row.quantityOnHand,
        quantityReserved: row.quantityReserved,
        quantityAvailable: row.quantityAvailable,
        unitCost: row.unitCost,
        totalValue: row.totalValue,
        rawRow: row.rawRow,
      },
    });
  }
}

async function persistSalesRows(importBatchId: string, rows: SalesRowInput[]) {
  for (const row of rows) {
    const product = await findOrCreateProduct(row.rawProductName, row.productCandidates, 'import:sales');
    const customer = await findOrCreateCustomer(row.rawCustomerName);
    const supplier = row.rawSupplierName ? await findOrCreateSupplier(row.rawSupplierName) : null;

    await db.salesRecord.create({
      data: {
        importBatchId,
        saleDate: row.saleDate,
        customerId: customer.id,
        productId: product.id,
        supplierId: supplier?.id,
        rawProductName: row.rawProductName,
        rawCustomerName: row.rawCustomerName,
        rawSupplierName: row.rawSupplierName,
        normalizedProductName: row.productCandidates.normalizedName,
        candidateStrength: row.productCandidates.strength,
        candidateFormulation: row.productCandidates.formulation,
        candidatePackSize: row.productCandidates.packSize,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalRevenue: row.totalRevenue,
        currencyCode: row.currencyCode,
        rawRow: row.rawRow,
      },
    });
  }
}

function mapUnexpectedError(error: unknown, rawRow: ParsedTableRow, rowNumber: number): RowIssue {
  return {
    rowNumber,
    message: error instanceof Error ? error.message : 'Unexpected import error.',
    rawRow,
  };
}

export async function importSupplierPriceList(
  request: SupplierPriceListImportRequest,
): Promise<ImportResponse> {
  const parsed = parseUploadedFile(request.file);
  const currencyCode = request.currencyCode?.trim() || 'USD';
  const { validRows, errors } = validateSupplierPriceRows(parsed.rows, currencyCode);
  const summary = buildSummary(parsed.rows.length, validRows.length, errors.length, parsed.warnings);
  const importBatch = await createImportBatch('SUPPLIER_PRICE_LIST', request.file, summary, errors);

  const firstRowSupplierName = parsed.rows.find((row) => row.supplierName || row.SupplierName)?.supplierName;
  const supplierName = request.supplierName?.trim() || firstRowSupplierName?.trim();

  if (!supplierName) {
    await db.importError.create({
      data: {
        importBatchId: importBatch.id,
        message: 'supplierName is required as a form field or row column for supplier price list imports.',
      },
    });

    return {
      importBatchId: importBatch.id,
      summary: {
        ...summary,
        invalidRows: summary.invalidRows + 1,
      },
      errors: [
        ...errors,
        {
          rowNumber: 0,
          message: 'supplierName is required as a form field or row column for supplier price list imports.',
          rawRow: {},
        },
      ],
    };
  }

  const supplier = await findOrCreateSupplier(supplierName);
  const supplierPriceList = await db.supplierPriceList.create({
    data: {
      supplierId: supplier.id,
      importBatchId: importBatch.id,
      fileName: request.file.originalname,
      fileMimeType: request.file.mimetype,
      fileSizeBytes: request.file.size,
      sourceDate: safeSourceDate(request.sourceDate),
      currencyCode,
    },
  });

  const persistenceErrors: RowIssue[] = [];
  for (const row of validRows) {
    try {
      await persistSupplierPriceRows(supplierPriceList.id, supplier.id, [row]);
    } catch (error) {
      persistenceErrors.push(mapUnexpectedError(error, row.rawRow, row.rowNumber));
    }
  }

  if (persistenceErrors.length > 0) {
    await db.importError.createMany({
      data: persistenceErrors.map((error) => ({
        importBatchId: importBatch.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: error.rawRow as Prisma.InputJsonValue,
      })),
    });
  }

  const finalErrors = [...errors, ...persistenceErrors];
  const finalSummary = buildSummary(
    parsed.rows.length,
    validRows.length - persistenceErrors.length,
    finalErrors.length,
    parsed.warnings,
  );

  await db.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: finalErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      totalRows: finalSummary.totalRows,
      validRows: finalSummary.validRows,
      invalidRows: finalSummary.invalidRows,
      warnings: finalSummary.warnings,
    },
  });

  return {
    importBatchId: importBatch.id,
    summary: finalSummary,
    errors: finalErrors,
  };
}

export async function importInventory(request: InventoryImportRequest): Promise<ImportResponse> {
  const parsed = parseUploadedFile(request.file);
  const { validRows, errors } = validateInventoryRows(parsed.rows);
  const summary = buildSummary(parsed.rows.length, validRows.length, errors.length, parsed.warnings);
  const importBatch = await createImportBatch('INVENTORY', request.file, summary, errors);

  const persistenceErrors: RowIssue[] = [];
  for (const row of validRows) {
    try {
      await persistInventoryRows(importBatch.id, [row]);
    } catch (error) {
      persistenceErrors.push(mapUnexpectedError(error, row.rawRow, row.rowNumber));
    }
  }

  if (persistenceErrors.length > 0) {
    await db.importError.createMany({
      data: persistenceErrors.map((error) => ({
        importBatchId: importBatch.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: error.rawRow as Prisma.InputJsonValue,
      })),
    });
  }

  const finalErrors = [...errors, ...persistenceErrors];
  const finalSummary = buildSummary(
    parsed.rows.length,
    validRows.length - persistenceErrors.length,
    finalErrors.length,
    parsed.warnings,
  );

  await db.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: finalErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      totalRows: finalSummary.totalRows,
      validRows: finalSummary.validRows,
      invalidRows: finalSummary.invalidRows,
      warnings: finalSummary.warnings,
    },
  });

  return {
    importBatchId: importBatch.id,
    summary: finalSummary,
    errors: finalErrors,
  };
}

export async function importSales(request: SalesImportRequest): Promise<ImportResponse> {
  const parsed = parseUploadedFile(request.file);
  const { validRows, errors } = validateSalesRows(parsed.rows);
  const summary = buildSummary(parsed.rows.length, validRows.length, errors.length, parsed.warnings);
  const importBatch = await createImportBatch('SALES', request.file, summary, errors);

  const persistenceErrors: RowIssue[] = [];
  for (const row of validRows) {
    try {
      await persistSalesRows(importBatch.id, [row]);
    } catch (error) {
      persistenceErrors.push(mapUnexpectedError(error, row.rawRow, row.rowNumber));
    }
  }

  if (persistenceErrors.length > 0) {
    await db.importError.createMany({
      data: persistenceErrors.map((error) => ({
        importBatchId: importBatch.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: error.rawRow as Prisma.InputJsonValue,
      })),
    });
  }

  const finalErrors = [...errors, ...persistenceErrors];
  const finalSummary = buildSummary(
    parsed.rows.length,
    validRows.length - persistenceErrors.length,
    finalErrors.length,
    parsed.warnings,
  );

  await db.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: finalErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      totalRows: finalSummary.totalRows,
      validRows: finalSummary.validRows,
      invalidRows: finalSummary.invalidRows,
      warnings: finalSummary.warnings,
    },
  });

  return {
    importBatchId: importBatch.id,
    summary: finalSummary,
    errors: finalErrors,
  };
}
