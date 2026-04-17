import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseUploadedFile } from '../parsers';
import { validateInventoryRows, validateSalesRows, validateSupplierPriceRows } from '../validators';

const fixturesDir = path.resolve(process.cwd(), 'fixtures/imports');

test('parses supplier price list CSV fixture', async () => {
  const buffer = await readFile(path.join(fixturesDir, 'supplier-price-list.csv'));
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
  const buffer = await readFile(path.join(fixturesDir, 'supplier-price-list.xlsx'));
  const parsed = parseUploadedFile({
    buffer,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalname: 'supplier-price-list.xlsx',
    size: buffer.byteLength,
  });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.warnings.length, 0);
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
