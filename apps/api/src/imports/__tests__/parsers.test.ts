import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';

import { parseUploadedFile } from '../parsers';
import {
  validateInventoryRows,
  validateSalesRows,
  validateSupplierPriceRows,
} from '../validators';

const fixturesDir = path.resolve(process.cwd(), 'fixtures/imports');

test('parses supplier price list CSV fixture', async () => {
  const buffer = await readFile(
    path.join(fixturesDir, 'supplier-price-list.csv'),
  );
  const parsed = parseUploadedFile({
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
  const parsed = parseUploadedFile({
    buffer,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalname: 'supplier-price-list.xlsx',
    size: buffer.byteLength,
  });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.warnings.length, 0);
});

test('parses CSV with title rows before the real header', () => {
  const csv = [
    'Ambe Pharma Supplier Catalogue',
    'Generated on,2026-04-18',
    'Description,Unit Cost,MOQ,Stock,Supplier',
    'Paracetamol 500mg Tablets,2.35,50,120,Acme Labs',
  ].join('\n');

  const parsed = parseUploadedFile({
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
  assert.match(parsed.warnings.join(' '), /skipped 2 title rows/i);
});

test('parses CSV with repeated header rows', () => {
  const csv = [
    'Description,Unit Cost,MOQ,Stock',
    'Paracetamol 500mg Tablets,2.35,50,120',
    'Description,Unit Cost,MOQ,Stock',
    'Ibuprofen 200mg Tablets,1.95,20,80',
  ].join('\n');

  const parsed = parseUploadedFile({
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

test('parses XLSX with multiple sheets where the useful sheet is not first', () => {
  const workbook = XLSX.utils.book_new();
  const coverSheet = XLSX.utils.aoa_to_sheet([
    ['Ambe Pharma Intelligence'],
    ['Supplier upload'],
  ]);
  const dataSheet = XLSX.utils.aoa_to_sheet([
    ['Description', 'Unit Cost', 'MOQ', 'Stock', 'Supplier'],
    ['Paracetamol 500mg Tablets', '2.35', '50', '120', 'Acme Labs'],
  ]);

  XLSX.utils.book_append_sheet(workbook, coverSheet, 'Cover');
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Price List');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = parseUploadedFile({
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

test('adds safe canonical aliases for Description / Unit Cost / MOQ / Stock', () => {
  const csv = [
    'Description,Unit Cost,MOQ,Stock,Supplier',
    'Paracetamol 500mg Tablets,2.35,50,120,Acme Labs',
  ].join('\n');

  const parsed = parseUploadedFile({
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

test('validates inventory CSV fixture', async () => {
  const buffer = await readFile(path.join(fixturesDir, 'inventory.csv'));
  const parsed = parseUploadedFile({
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

test('validates sales CSV fixture', async () => {
  const buffer = await readFile(path.join(fixturesDir, 'sales.csv'));
  const parsed = parseUploadedFile({
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
