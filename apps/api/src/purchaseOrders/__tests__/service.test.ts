import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as XLSX from 'xlsx';

import { createPurchaseOrderService, parsePurchaseOrderRows, type PurchaseHistoryLine } from '../service';

type Repository = NonNullable<Parameters<typeof createPurchaseOrderService>[0]>;
type CreatedLine = Parameters<Repository['createLines']>[1][number] & {
  id?: string;
  createdAt?: Date;
};

function csvFile(content: string, originalname = 'purchase-orders.csv') {
  return {
    buffer: Buffer.from(content),
    mimetype: 'text/csv',
    originalname,
    size: Buffer.byteLength(content),
  };
}

function xlsxFile(rows: Array<Record<string, string | number>>, originalname = 'purchase-orders.xlsx') {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'POs');
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    buffer,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalname,
    size: buffer.byteLength,
  };
}

function buildRepository() {
  const imports: Array<Record<string, unknown>> = [];
  const lines: CreatedLine[] = [];
  const products = [
    {
      id: 'product-1',
      sku: null,
      name: 'Amlodipine 5mg tablets 28',
      normalizedName: 'amlodipine|5mg|tablet|28',
      baseName: 'amlodipine',
      manufacturer: null,
      strength: '5mg',
      dosageForm: 'tablet',
      packSize: '28',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];
  const suppliers = [
    {
      id: 'supplier-1',
      name: 'Supplier Co',
      normalizedName: 'supplier co',
      country: null,
      contactEmail: null,
      reliabilityScore: 0.5,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];
  const aliases: Array<{
    id: string;
    productId: string;
    aliasName: string;
    sourceSystem: string | null;
    createdAt: Date;
    updatedAt: Date;
    product: (typeof products)[number];
  }> = [
    {
      id: 'alias-1',
      productId: 'product-1',
      aliasName: 'Amlodipine tabs 5mg 28',
      sourceSystem: 'test',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      product: products[0]!,
    },
  ];

  const repository: Repository = {
    createImport: async (data) => {
      const created = {
        id: `po-import-${imports.length + 1}`,
        ...data,
      };
      imports.push(created);
      return { id: created.id };
    },
    createLines: async (purchaseOrderImportId, inputLines) => {
      lines.push(
        ...inputLines.map((line, index) => ({
          ...line,
          id: `po-line-${lines.length + index + 1}`,
          purchaseOrderImportId,
          createdAt: new Date(`2026-02-${String(index + 1).padStart(2, '0')}T00:00:00Z`),
        })),
      );
    },
    findProductByStoredCanonicalField: async (storedCanonicalField) =>
      products.find((product) => product.normalizedName === storedCanonicalField) ?? null,
    findProductAliasByRawName: async (aliasName) =>
      aliases.find((alias) => alias.aliasName === aliasName) ?? null,
    listProductAliasesForCanonicalComparison: async () => aliases,
    findSupplierByNormalizedName: async (normalizedName) =>
      suppliers.find((supplier) => supplier.normalizedName === normalizedName) ?? null,
    listImportedLinesForProduct: async (productId) =>
      lines
        .filter((line) => line.status === 'IMPORTED' && line.matchedProductId === productId)
        .map((line): PurchaseHistoryLine => ({
          id: line.id ?? 'po-line',
          poNumber: line.poNumber,
          orderDate: line.orderDate,
          supplierText: line.supplierText,
          productText: line.productText,
          manufacturerText: line.manufacturerText,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: line.currency,
          minimumOrderQuantity: line.minimumOrderQuantity,
          matchedSupplierId: line.matchedSupplierId,
          matchedSupplier: line.matchedSupplierId
            ? {
                id: line.matchedSupplierId,
                name: 'Supplier Co',
              }
            : null,
          sourceRowNumber: line.sourceRowNumber,
          createdAt: line.createdAt ?? new Date('2026-01-01T00:00:00Z'),
        })),
  };

  return {
    imports,
    lines,
    repository,
    service: createPurchaseOrderService(repository),
  };
}

test('CSV purchase order rows parse and preserve raw rows', async () => {
  const state = buildRepository();
  const result = await state.service.importPurchaseOrders({
    file: csvFile(
      [
        'PO Number,Order Date,Supplier,Product,Qty,Unit Price,Currency,MOQ',
        'PO-001,2026-01-12,Supplier Co,Amlodipine 5mg tabs 28,12,1.25,GBP,6',
      ].join('\n'),
    ),
    actorType: 'OPERATOR',
    actorIdentifier: 'test',
  });

  assert.equal(result.summary.totalRows, 1);
  assert.equal(result.summary.importedRows, 1);
  assert.equal(state.lines[0]?.status, 'IMPORTED');
  assert.equal(state.lines[0]?.matchedProductId, 'product-1');
  assert.equal(state.lines[0]?.matchedSupplierId, 'supplier-1');
  assert.equal(state.lines[0]?.rawRow['PO Number'], 'PO-001');
  assert.equal(state.lines[0]?.rawRow.Supplier, 'Supplier Co');
  assert.equal(state.lines[0]?.rawRow.Product, 'Amlodipine 5mg tabs 28');
  assert.equal(state.lines[0]?.rawRow.MOQ, '6');
});

test('XLSX purchase order rows parse into purchase order lines', async () => {
  const state = buildRepository();
  const result = await state.service.importPurchaseOrders({
    file: xlsxFile([
      {
        'Purchase Order': 'PO-002',
        Date: '2026-01-13',
        Vendor: 'Supplier Co',
        Description: 'Amlodipine 5mg tabs 28',
        Quantity: 20,
        Cost: 1.1,
        Currency: 'GBP',
      },
    ]),
  });

  assert.equal(result.summary.importedRows, 1);
  assert.equal(state.lines[0]?.poNumber, 'PO-002');
  assert.equal(state.lines[0]?.quantity, 20);
  assert.equal(state.lines[0]?.unitPrice?.toString(), '1.1');
});

test('weak product and supplier matches do not create records automatically', async () => {
  const state = buildRepository();
  const result = await state.service.importPurchaseOrders({
    file: csvFile(
      [
        'PO Number,Supplier,Product,Qty,Unit Price,Currency',
        'PO-003,Unknown Supplier,Unknown Medicine,4,10.50,GBP',
      ].join('\n'),
    ),
  });

  assert.equal(result.summary.reviewRows, 1);
  assert.equal(state.lines[0]?.status, 'NEEDS_REVIEW');
  assert.equal(state.lines[0]?.matchedProductId, null);
  assert.equal(state.lines[0]?.matchedSupplierId, null);
  assert.equal(state.lines[0]?.reviewReason, 'weak_or_missing_product_match');
  assert.match(state.lines[0]?.matchReason ?? '', /NO_SAFE_MATCH_CREATED_NEW_PRODUCT/);
});

test('parser supports flexible column names', () => {
  const lines = parsePurchaseOrderRows([
    {
      'Order Number': 'PO-004',
      Vendor: 'Supplier Co',
      Medicine: 'Amlodipine 5mg tabs 28',
      Units: '15',
      Price: '£1.20',
      'Minimum Order Quantity': '5',
    },
  ]);

  assert.equal(lines[0]?.poNumber, 'PO-004');
  assert.equal(lines[0]?.supplierText, 'Supplier Co');
  assert.equal(lines[0]?.productText, 'Amlodipine 5mg tabs 28');
  assert.equal(lines[0]?.quantity, 15);
  assert.equal(lines[0]?.currency, 'GBP');
  assert.equal(lines[0]?.minimumOrderQuantity, 5);
});

test('product purchase history returns aggregate context', async () => {
  const state = buildRepository();
  await state.service.importPurchaseOrders({
    file: csvFile(
      [
        'PO Number,Order Date,Supplier,Product,Qty,Unit Price,Currency,MOQ',
        'PO-001,2026-01-12,Supplier Co,Amlodipine 5mg tabs 28,12,1.25,GBP,6',
        'PO-002,2026-01-13,Supplier Co,Amlodipine 5mg tabs 28,20,1.10,GBP,6',
      ].join('\n'),
    ),
  });

  const history = await state.service.getProductPurchaseHistory('product-1');

  assert.equal(history.purchaseCount, 2);
  assert.equal(history.averageUnitPrice, 1.18);
  assert.equal(history.lowestUnitPrice, 1.1);
  assert.equal(history.currency, 'GBP');
  assert.equal(history.usualMinimumOrderQuantity, 6);
  assert.equal(history.recentLines.length, 2);
});
