import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildImportIdempotencyKey,
  createEmailInboundService,
} from '../service';
import type { EmailInboundMessage, NormalizedEmailAttachment } from '../types';

function attachment(
  overrides: Partial<NormalizedEmailAttachment> = {},
): NormalizedEmailAttachment {
  const hasBuffer = 'buffer' in overrides;
  const buffer = hasBuffer
    ? (overrides.buffer ?? null)
    : Buffer.from('supplierName,productName,unitPrice\nAcme Labs,Aspirin,1.20');

  const base: NormalizedEmailAttachment = {
    fileType: 'CSV',
    fileName: 'supplier-price-list.csv',
    mimeType: 'text/csv',
    buffer,
    size: buffer?.byteLength ?? null,
    contentId: null,
    disposition: 'attachment',
    graphAttachmentId: 'att-1',
  };

  return { ...base, ...overrides, buffer };
}

function message(
  overrides: Partial<EmailInboundMessage> = {},
): EmailInboundMessage {
  return {
    from: 'supplier@example.com',
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: 'graph-1',
    messageId: 'internet-1',
    ...overrides,
  };
}

test('same email + same attachment yields a stable 64-char key', () => {
  const a = attachment();
  const key1 = buildImportIdempotencyKey({
    message: message(),
    attachment: a,
    importType: 'supplier-price-list',
  });
  const key2 = buildImportIdempotencyKey({
    message: message(),
    attachment: a,
    importType: 'supplier-price-list',
  });

  assert.equal(key1, key2);
  assert.equal(key1?.length, 64);
});

test('different attachments in the same email get different keys', () => {
  const base = message();
  const k1 = buildImportIdempotencyKey({
    message: base,
    attachment: attachment({ graphAttachmentId: 'att-1' }),
    importType: 'supplier-price-list',
  });
  const k2 = buildImportIdempotencyKey({
    message: base,
    attachment: attachment({ graphAttachmentId: 'att-2' }),
    importType: 'supplier-price-list',
  });

  assert.notEqual(k1, k2);
});

test('same filename with different content gets different keys', () => {
  const base = message();
  const k1 = buildImportIdempotencyKey({
    message: base,
    attachment: attachment({
      buffer: Buffer.from('content-A'),
      graphAttachmentId: null,
      contentId: null,
    }),
    importType: 'supplier-price-list',
  });
  const k2 = buildImportIdempotencyKey({
    message: base,
    attachment: attachment({
      buffer: Buffer.from('content-B'),
      graphAttachmentId: null,
      contentId: null,
    }),
    importType: 'supplier-price-list',
  });

  assert.notEqual(k1, k2);
});

test('same content in a different email imports separately (different key)', () => {
  const buildAttachment = () =>
    attachment({
      buffer: Buffer.from('identical-content'),
      graphAttachmentId: null,
      contentId: null,
    });
  const k1 = buildImportIdempotencyKey({
    message: message({ externalMessageId: 'graph-1', messageId: 'internet-1' }),
    attachment: buildAttachment(),
    importType: 'supplier-price-list',
  });
  const k2 = buildImportIdempotencyKey({
    message: message({ externalMessageId: 'graph-2', messageId: 'internet-2' }),
    attachment: buildAttachment(),
    importType: 'supplier-price-list',
  });

  assert.notEqual(k1, k2);
});

test('the same bytes classified as a different import kind get different keys', () => {
  const a = attachment();
  const k1 = buildImportIdempotencyKey({
    message: message(),
    attachment: a,
    importType: 'supplier-price-list',
  });
  const k2 = buildImportIdempotencyKey({
    message: message(),
    attachment: a,
    importType: 'inventory',
  });

  assert.notEqual(k1, k2);
});

test('dedupe is disabled (null key) without attachment bytes or an email id', () => {
  assert.equal(
    buildImportIdempotencyKey({
      message: message(),
      attachment: attachment({ buffer: null }),
      importType: 'supplier-price-list',
    }),
    null,
  );
  assert.equal(
    buildImportIdempotencyKey({
      message: message({ externalMessageId: null, messageId: null }),
      attachment: attachment(),
      importType: 'supplier-price-list',
    }),
    null,
  );
});

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

test('ingesting an attachment threads a stable key into the import and surfaces dedupe on replay', async () => {
  const capturedKeys: Array<string | undefined> = [];
  let importCall = 0;
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      { pattern: 'supplier@example.com', supplierName: 'Acme Labs' },
    ],
    emailReviewEnabled: false,
    logger: silentLogger(),
    parseUploadedFile: async () => ({
      rows: [],
      warnings: [],
      detectedColumns: [],
    }),
    importSupplierPriceList: async ({ idempotencyKey }) => {
      capturedKeys.push(idempotencyKey);
      importCall += 1;
      return {
        importBatchId: 'batch-1',
        summary: { totalRows: 1, validRows: 1, invalidRows: 0, warnings: [] },
        errors: [],
        ...(importCall > 1 ? { alreadyImported: true } : {}),
      };
    },
    importInventory: async () => {
      throw new Error('inventory import must not run');
    },
    importSales: async () => {
      throw new Error('sales import must not run');
    },
  });

  const inboundMessage: EmailInboundMessage = {
    from: 'supplier@example.com',
    fromName: 'Supplier',
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: 'graph-att-1',
    messageId: 'internet-att-1',
    subject: 'Supplier price list April',
    bodyText: 'Attached.',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from(
          'supplierName,productName,unitPrice\nAcme Labs,Aspirin,1.20',
        ),
        graphAttachmentId: 'att-1',
      },
    ],
  };

  const first = await service.ingestMessage(inboundMessage);
  const second = await service.ingestMessage(inboundMessage);

  const importedFirst = first.items.find(
    (item) => item.processingStatus === 'IMPORTED',
  );
  const importedSecond = second.items.find(
    (item) => item.processingStatus === 'IMPORTED',
  );

  assert.ok(
    importedFirst,
    'expected the first ingest to import the attachment',
  );
  assert.ok(importedSecond, 'expected the second ingest to report an import');
  assert.equal(capturedKeys.length, 2);
  assert.equal(capturedKeys[0]?.length, 64);
  assert.equal(
    capturedKeys[0],
    capturedKeys[1],
    'the same email attachment must produce the same idempotency key',
  );
  assert.notEqual(importedFirst?.alreadyImported, true);
  assert.equal(importedSecond?.alreadyImported, true);
});

test('two different attachments in one email both import with different keys', async () => {
  const capturedKeys: string[] = [];
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      { pattern: 'supplier@example.com', supplierName: 'Acme Labs' },
    ],
    emailReviewEnabled: false,
    logger: silentLogger(),
    parseUploadedFile: async () => ({
      rows: [],
      warnings: [],
      detectedColumns: [],
    }),
    importSupplierPriceList: async ({ idempotencyKey }) => {
      if (idempotencyKey) {
        capturedKeys.push(idempotencyKey);
      }
      return {
        importBatchId: `batch-${capturedKeys.length}`,
        summary: { totalRows: 1, validRows: 1, invalidRows: 0, warnings: [] },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import must not run');
    },
    importSales: async () => {
      throw new Error('sales import must not run');
    },
  });

  const inboundMessage: EmailInboundMessage = {
    from: 'supplier@example.com',
    fromName: 'Supplier',
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: 'graph-two-attachments',
    messageId: 'internet-two-attachments',
    subject: 'Supplier price lists',
    bodyText: 'Attached.',
    attachments: [
      {
        fileName: 'supplier-price-list-a.csv',
        mimeType: 'text/csv',
        content: Buffer.from('supplierName,productName,unitPrice\nAcme,A,1.00'),
        graphAttachmentId: 'att-a',
      },
      {
        fileName: 'supplier-price-list-b.csv',
        mimeType: 'text/csv',
        content: Buffer.from('supplierName,productName,unitPrice\nAcme,B,2.00'),
        graphAttachmentId: 'att-b',
      },
    ],
  };

  const result = await service.ingestMessage(inboundMessage);
  const importedItems = result.items.filter(
    (item) => item.processingStatus === 'IMPORTED',
  );

  assert.equal(importedItems.length, 2);
  assert.equal(capturedKeys.length, 2);
  assert.notEqual(
    capturedKeys[0],
    capturedKeys[1],
    'different attachments must get different idempotency keys',
  );
});
