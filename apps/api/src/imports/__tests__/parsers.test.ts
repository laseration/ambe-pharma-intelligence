import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import { parseUploadedFile } from '../parsers';
import { buildImportDiagnostics, redactImportRawRow } from '../service';
import {
  validateInventoryRows,
  validateSalesRows,
  validateSupplierPriceRows,
} from '../validators';

const fixturesDir = path.resolve(process.cwd(), 'fixtures/imports');

async function buildWorkbookBuffer(
  sheets: Array<{ name: string; rows: unknown[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

test('parses supplier price list CSV fixture', async () => {
  const buffer = await readFile(
    path.join(fixturesDir, 'supplier-price-list.csv'),
  );
  const parsed = await parseUploadedFile({
    buffer,
    mimetype: 'text/csv',
    originalname: 'supplier-price-list.csv',
    size: buffer.byteLength,
  });

  assert.equal(parsed.rows.length, 2);
  const result = validateSupplierPriceRows(parsed.rows, 'USD');
  assert.equal(result.validRows.length, 1);
  assert.equal(result.errors.length, 1);
});

test('parses supplier price list XLSX fixture', async () => {
  const buffer = await readFile(
    path.join(fixturesDir, 'supplier-price-list.xlsx'),
  );
  const parsed = await parseUploadedFile({
    buffer,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalname: 'supplier-price-list.xlsx',
    size: buffer.byteLength,
  });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.warnings.length, 0);
});

test('parses CSV with title rows before the real header', async () => {
  const csv = [
    'Ambe Pharma Supplier Catalogue',
    'Generated on,2026-04-18',
    'Description,Unit Cost,MOQ,Stock,Supplier',
    'Paracetamol 500mg Tablets,2.35,50,120,Acme Labs',
  ].join('\n');

  const parsed = await parseUploadedFile({
    buffer: Buffer.from(csv, 'utf8'),
    mimetype: 'text/csv',
    originalname: 'supplier-price-list.csv',
    size: Buffer.byteLength(csv),
  });

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.Description, 'Paracetamol 500mg Tablets');
  assert.equal(parsed.rows[0]?.productName, 'Paracetamol 500mg Tablets');
  assert.equal(parsed.rows[0]?.unitPrice, '2.35');
  assert.equal(parsed.rows[0]?.minimumOrderQuantity, '50');
  assert.equal(parsed.rows[0]?.quantityAvailable, '120');
  assert.equal(parsed.rows[0]?.supplierName, 'Acme Labs');
  assert.deepEqual(
    parsed.detectedColumns.map((column) => [
      column.sourceHeader,
      column.canonicalField,
    ]),
    [
      ['Description', 'productName'],
      ['Unit Cost', 'unitPrice'],
      ['MOQ', 'minimumOrderQuantity'],
      ['Stock', 'quantityAvailable'],
      ['Supplier', 'supplierName'],
    ],
  );
  assert.match(parsed.warnings.join(' '), /skipped 2 title rows/i);
});

test('parses CSV with repeated header rows', async () => {
  const csv = [
    'Description,Unit Cost,MOQ,Stock',
    'Paracetamol 500mg Tablets,2.35,50,120',
    'Description,Unit Cost,MOQ,Stock',
    'Ibuprofen 200mg Tablets,1.95,20,80',
  ].join('\n');

  const parsed = await parseUploadedFile({
    buffer: Buffer.from(csv, 'utf8'),
    mimetype: 'text/csv',
    originalname: 'repeated-headers.csv',
    size: Buffer.byteLength(csv),
  });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]?.productName, 'Paracetamol 500mg Tablets');
  assert.equal(parsed.rows[1]?.productName, 'Ibuprofen 200mg Tablets');
  assert.match(parsed.warnings.join(' '), /repeated header row/i);
});

test('parses XLSX with multiple sheets where the useful sheet is not first', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'Cover',
      rows: [['Ambe Pharma Intelligence'], ['Supplier upload']],
    },
    {
      name: 'Price List',
      rows: [
        ['Description', 'Unit Cost', 'MOQ', 'Stock', 'Supplier'],
        ['Paracetamol 500mg Tablets', '2.35', '50', '120', 'Acme Labs'],
      ],
    },
  ]);
  const parsed = await parseUploadedFile({
    buffer,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalname: 'supplier-price-list.xlsx',
    size: buffer.byteLength,
  });

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.productName, 'Paracetamol 500mg Tablets');
  assert.match(parsed.warnings.join(' '), /selected worksheet "Price List"/i);
});

test('rejects malformed XLSX files with a clear error', async () => {
  await assert.rejects(
    parseUploadedFile({
      buffer: Buffer.from('not-a-workbook', 'utf8'),
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'broken.xlsx',
      size: 14,
    }),
    /malformed xlsx/i,
  );
});

test('rejects oversized XLSX files before workbook parsing', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'Price List',
      rows: [
        ['Description', 'Unit Cost'],
        ['Paracetamol 500mg Tablets', '2.35'],
      ],
    },
  ]);

  await assert.rejects(
    parseUploadedFile({
      buffer,
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'too-large.xlsx',
      size: 8 * 1024 * 1024 + 1,
    }),
    /too large/i,
  );
});

test('rejects XLSX workbooks with too many sheets', async () => {
  const sheets = Array.from({ length: 21 }, (_, index) => ({
    name: `Sheet ${index + 1}`,
    rows: [
      ['Description', 'Unit Cost'],
      [`Product ${index + 1}`, '2.35'],
    ],
  }));
  const buffer = await buildWorkbookBuffer(sheets);

  await assert.rejects(
    parseUploadedFile({
      buffer,
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'too-many-sheets.xlsx',
      size: buffer.byteLength,
    }),
    /21 worksheets; the limit is 20/i,
  );
});

test('rejects XLSX worksheets with too many columns', async () => {
  const headers = Array.from(
    { length: 81 },
    (_, index) => `Column ${index + 1}`,
  );
  headers[0] = 'Description';
  headers[1] = 'Unit Cost';
  const buffer = await buildWorkbookBuffer([
    {
      name: 'Price List',
      rows: [headers, headers.map((_, index) => String(index + 1))],
    },
  ]);

  await assert.rejects(
    parseUploadedFile({
      buffer,
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'too-many-columns.xlsx',
      size: buffer.byteLength,
    }),
    /81 columns; the limit is 80/i,
  );
});

test('rejects XLSX worksheets with too many rows', async () => {
  const rows = [['Description', 'Unit Cost']];

  for (let index = 0; index < 5001; index += 1) {
    rows.push([`Product ${index + 1}`, '2.35']);
  }

  const buffer = await buildWorkbookBuffer([
    {
      name: 'Price List',
      rows,
    },
  ]);

  await assert.rejects(
    parseUploadedFile({
      buffer,
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'too-many-rows.xlsx',
      size: buffer.byteLength,
    }),
    /5002 rows; the limit is 5000/i,
  );
});

test('sanitizes prototype-pollution header keys in XLSX imports', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'Price List',
      rows: [
        ['Generated supplier upload'],
        ['__proto__', 'Description', 'constructor', 'Unit Cost', 'prototype'],
        ['polluted', 'Paracetamol 500mg Tablets', 'unsafe', '2.35', 'unsafe'],
      ],
    },
  ]);

  const parsed = await parseUploadedFile({
    buffer,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalname: 'pollution.xlsx',
    size: buffer.byteLength,
  });

  assert.equal(parsed.rows[0]?.productName, 'Paracetamol 500mg Tablets');
  assert.equal(parsed.rows[0]?.unitPrice, '2.35');
  assert.equal(Object.hasOwn(parsed.rows[0] ?? {}, '__proto__'), false);
  assert.equal(Object.hasOwn(parsed.rows[0] ?? {}, 'constructor'), false);
  assert.equal(Object.hasOwn(parsed.rows[0] ?? {}, 'prototype'), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('adds safe canonical aliases for Description / Unit Cost / MOQ / Stock', async () => {
  const csv = [
    'Description,Unit Cost,MOQ,Stock,Supplier',
    'Paracetamol 500mg Tablets,2.35,50,120,Acme Labs',
  ].join('\n');

  const parsed = await parseUploadedFile({
    buffer: Buffer.from(csv, 'utf8'),
    mimetype: 'text/csv',
    originalname: 'supplier-aliases.csv',
    size: Buffer.byteLength(csv),
  });

  assert.equal(parsed.rows[0]?.Description, 'Paracetamol 500mg Tablets');
  assert.equal(parsed.rows[0]?.['Unit Cost'], '2.35');
  assert.equal(parsed.rows[0]?.MOQ, '50');
  assert.equal(parsed.rows[0]?.Stock, '120');

  const validation = validateSupplierPriceRows(parsed.rows, 'USD');
  assert.equal(validation.validRows.length, 1);
  assert.equal(
    validation.validRows[0]?.rawProductName,
    'Paracetamol 500mg Tablets',
  );
  assert.equal(validation.validRows[0]?.unitPrice.toString(), '2.35');
  assert.equal(validation.validRows[0]?.minimumOrderQuantity, 50);
});

test('diagnostics summarize invalid rows, columns, fixes, and duplicate product candidates', async () => {
  const csv = [
    'Description,Unit Cost,MOQ,Stock,Supplier',
    'Paracetamol 500mg Tablets,2.35,50,120,Acme Labs',
    'Paracetamol 500mg Tablets,2.40,50,100,Acme Labs',
    'Missing Price,,20,80,Acme Labs',
  ].join('\n');

  const parsed = await parseUploadedFile({
    buffer: Buffer.from(csv, 'utf8'),
    mimetype: 'text/csv',
    originalname: 'supplier-diagnostics.csv',
    size: Buffer.byteLength(csv),
  });
  const validation = validateSupplierPriceRows(parsed.rows, 'GBP');
  const diagnostics = buildImportDiagnostics(
    'SUPPLIER_PRICE_LIST',
    parsed,
    validation.validRows,
    validation.errors,
  );

  assert.equal(diagnostics.detectedColumns.length, 5);
  assert.equal(diagnostics.dataQualityMetrics.invalidRows, 1);
  assert.equal(diagnostics.productMatchingSummary.candidateConfidence.high, 2);
  assert.equal(
    diagnostics.productMatchingSummary.duplicateCandidateGroups.length,
    1,
  );
  assert.equal(
    diagnostics.productMatchingSummary.duplicateCandidateGroups[0]?.rowNumbers
      .length,
    2,
  );
  assert.match(diagnostics.suggestedFixes.join(' '), /unit prices/i);
});

test('import raw row redaction removes obvious secrets from API previews', () => {
  const redacted = redactImportRawRow({
    productName: 'Amlodipine 5mg',
    apiKey: 'sk-fake-redaction-canary',
    Notes: 'Bearer abcdef12345',
  });

  assert.deepEqual(redacted, {
    productName: 'Amlodipine 5mg',
    apiKey: '[REDACTED]',
    Notes: '[REDACTED]',
  });
});

test('validates inventory CSV fixture', async () => {
  const buffer = await readFile(path.join(fixturesDir, 'inventory.csv'));
  const parsed = await parseUploadedFile({
    buffer,
    mimetype: 'text/csv',
    originalname: 'inventory.csv',
    size: buffer.byteLength,
  });

  const result = validateInventoryRows(parsed.rows);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.validRows[0]?.quantityAvailable, 100);
});

test('supplier price validation rejects non-finite numbers (Infinity)', () => {
  const result = validateSupplierPriceRows(
    [{ productName: 'Aspirin 100mg', unitPrice: 'Infinity' }],
    'USD',
  );

  assert.equal(result.validRows.length, 0);
  assert.ok(
    result.errors.some((issue) => /must be a number/i.test(issue.message)),
  );
});

test('integer validation rejects scientific notation but accepts trailing-zero decimals', () => {
  const scientific = validateInventoryRows([
    {
      productName: 'Aspirin 100mg',
      warehouseCode: 'WH1',
      snapshotDate: '2026-01-01',
      quantityOnHand: '1e3',
    },
  ]);
  assert.equal(scientific.validRows.length, 0);
  assert.ok(
    scientific.errors.some((issue) =>
      /must be an integer/i.test(issue.message),
    ),
  );

  const trailingZero = validateInventoryRows([
    {
      productName: 'Aspirin 100mg',
      warehouseCode: 'WH1',
      snapshotDate: '2026-01-01',
      quantityOnHand: '100.0',
      quantityReserved: '0',
    },
  ]);
  assert.equal(trailingZero.validRows.length, 1);
  assert.equal(trailingZero.validRows[0]?.quantityAvailable, 100);
});

test('inventory validation rejects a negative derived available quantity', () => {
  const result = validateInventoryRows([
    {
      productName: 'Aspirin 100mg',
      warehouseCode: 'WH1',
      snapshotDate: '2026-01-01',
      quantityOnHand: '5',
      quantityReserved: '10',
    },
  ]);

  assert.equal(result.validRows.length, 0);
  assert.ok(
    result.errors.some((issue) => /cannot be negative/i.test(issue.message)),
  );
});

test('validates sales CSV fixture', async () => {
  const buffer = await readFile(path.join(fixturesDir, 'sales.csv'));
  const parsed = await parseUploadedFile({
    buffer,
    mimetype: 'text/csv',
    originalname: 'sales.csv',
    size: buffer.byteLength,
  });

  const result = validateSalesRows(parsed.rows);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.validRows[0]?.currencyCode, 'USD');
});
