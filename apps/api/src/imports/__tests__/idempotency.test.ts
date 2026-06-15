import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { Prisma } from '@prisma/client';

import { db } from '../../lib/db';
import {
  importInventory,
  importSales,
  importSupplierPriceList,
} from '../service';
import type { UploadFile } from '../types';

function stubImportBatch(
  context: TestContext,
  method: 'findUnique' | 'create',
  impl: (args: unknown) => unknown,
) {
  const original = (db.importBatch as unknown as Record<string, unknown>)[
    method
  ];
  (db.importBatch as unknown as Record<string, unknown>)[method] = impl;
  context.after(() => {
    (db.importBatch as unknown as Record<string, unknown>)[method] = original;
  });
}

function csvUploadFile(
  content = 'supplierName,productName,unitPrice\nAcme Labs,Aspirin,1.20',
): UploadFile {
  const buffer = Buffer.from(content);
  return {
    buffer,
    mimetype: 'text/csv',
    originalname: 'list.csv',
    size: buffer.byteLength,
  };
}

const existingBatchRow = {
  id: 'existing-batch-1',
  totalRows: 5,
  validRows: 5,
  invalidRows: 0,
  warnings: [] as unknown,
  errors: [] as Array<{
    rowNumber: number | null;
    fieldName: string | null;
    message: string;
    rawRow: unknown;
  }>,
};

test('importSupplierPriceList returns the existing batch when the idempotency key already exists', async (t) => {
  let createCalls = 0;
  stubImportBatch(t, 'findUnique', async (args) => {
    const { where } = args as {
      where: { sourceAttachmentFingerprint: string };
    };
    assert.equal(where.sourceAttachmentFingerprint, 'key-1');
    return existingBatchRow;
  });
  stubImportBatch(t, 'create', async () => {
    createCalls += 1;
    throw new Error('create must not be called on a dedupe hit');
  });

  const result = await importSupplierPriceList({
    file: csvUploadFile(),
    idempotencyKey: 'key-1',
  });

  assert.equal(result.alreadyImported, true);
  assert.equal(result.importBatchId, 'existing-batch-1');
  assert.equal(result.summary.validRows, 5);
  assert.equal(createCalls, 0);
});

test('importInventory dedupes on an existing idempotency key without creating a new batch', async (t) => {
  let createCalls = 0;
  stubImportBatch(t, 'findUnique', async () => existingBatchRow);
  stubImportBatch(t, 'create', async () => {
    createCalls += 1;
    throw new Error('create must not be called on a dedupe hit');
  });

  const result = await importInventory({
    file: csvUploadFile(),
    idempotencyKey: 'key-inventory',
  });

  assert.equal(result.alreadyImported, true);
  assert.equal(result.importBatchId, 'existing-batch-1');
  assert.equal(createCalls, 0);
});

test('importSales dedupes on an existing idempotency key without creating a new batch', async (t) => {
  let createCalls = 0;
  stubImportBatch(t, 'findUnique', async () => existingBatchRow);
  stubImportBatch(t, 'create', async () => {
    createCalls += 1;
    throw new Error('create must not be called on a dedupe hit');
  });

  const result = await importSales({
    file: csvUploadFile(),
    idempotencyKey: 'key-sales',
  });

  assert.equal(result.alreadyImported, true);
  assert.equal(result.importBatchId, 'existing-batch-1');
  assert.equal(createCalls, 0);
});

test('a previously-failed batch is reused on retry so already-created rows are not duplicated', async (t) => {
  let createCalls = 0;
  stubImportBatch(t, 'findUnique', async () => ({
    ...existingBatchRow,
    invalidRows: 2,
    errors: [
      { rowNumber: 3, fieldName: 'unitPrice', message: 'invalid', rawRow: {} },
    ],
  }));
  stubImportBatch(t, 'create', async () => {
    createCalls += 1;
    throw new Error('create must not be called when a batch already exists');
  });

  const result = await importSupplierPriceList({
    file: csvUploadFile(),
    idempotencyKey: 'key-retry',
  });

  assert.equal(result.alreadyImported, true);
  assert.equal(result.importBatchId, 'existing-batch-1');
  assert.equal(result.errors.length, 1);
  assert.equal(createCalls, 0);
});

test('manual uploads (no idempotency key) skip the dedupe lookup entirely', async (t) => {
  let findCalls = 0;
  stubImportBatch(t, 'findUnique', async () => {
    findCalls += 1;
    return null;
  });
  stubImportBatch(t, 'create', async () => {
    // Stop right after the dedupe decision so we do not need the full
    // persistence path; we only assert the lookup was skipped.
    throw new Error('stop-after-dedupe-check');
  });

  await assert.rejects(
    importInventory({ file: csvUploadFile() }),
    /stop-after-dedupe-check/,
  );
  assert.equal(findCalls, 0);
});

test('a claim that loses the unique race returns the winner batch instead of throwing', async (t) => {
  const findResults: Array<typeof existingBatchRow | null> = [
    null,
    existingBatchRow,
  ];
  let findIndex = 0;
  stubImportBatch(t, 'findUnique', async () => {
    const value =
      findIndex < findResults.length
        ? findResults[findIndex]
        : existingBatchRow;
    findIndex += 1;
    return value;
  });
  stubImportBatch(t, 'create', async () => {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
  });

  const result = await importSupplierPriceList({
    file: csvUploadFile(),
    idempotencyKey: 'key-race',
  });

  assert.equal(result.alreadyImported, true);
  assert.equal(result.importBatchId, 'existing-batch-1');
  assert.equal(findIndex, 2);
});
