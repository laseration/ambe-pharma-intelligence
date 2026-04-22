import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmailInboundService } from '../inbound/service';
import type { EmailInboundResult } from '../inbound/types';
import { createEmailInboundPollingWorker } from '../polling';

function createLogger() {
  return {
    errorCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    infoCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    warnCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    error(message: string, meta?: Record<string, unknown>) {
      this.errorCalls.push({ message, meta });
    },
    info(message: string, meta?: Record<string, unknown>) {
      this.infoCalls.push({ message, meta });
    },
    warn(message: string, meta?: Record<string, unknown>) {
      this.warnCalls.push({ message, meta });
    },
  };
}

test('allowed sender accepted through Graph polling and structured body reaches intake', async () => {
  const logger = createLogger();
  let capturedResult: EmailInboundResult | null = null;
  const markReadCalls: string[] = [];
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    isTrustedSender: () => true,
    supplierMappings: [
      {
        pattern: 'supplier@example.com',
        supplierName: 'Supplier Co',
      },
    ],
    logger,
  });

  const worker = createEmailInboundPollingWorker({
    ingestInboundEmail: async (message) => {
      capturedResult = await service.ingestMessage(message);
      return capturedResult;
    },
    listUnreadInboxMessages: async () => [
      {
        id: 'graph-1',
        internetMessageId: '<internet-1>',
        from: {
          emailAddress: {
            address: 'supplier@example.com',
            name: 'Supplier',
          },
        },
        subject: 'Price list',
        body: {
          contentType: 'text',
          content: [
            'Amlodipine 5mg tabs 28 - 8.40 GBP',
            'Paracetamol 500mg caplets 16 - 1.25 GBP',
            'Metformin 500mg 28 - 3.10 GBP',
          ].join('\n'),
        },
      },
    ],
    listAttachments: async () => [],
    logger,
    lookupExistingInboundEmail: async () => null,
    markMessageRead: async (messageId) => {
      markReadCalls.push(messageId);
    },
  });

  await worker.runOnce();

  if (!capturedResult) {
    throw new Error('Expected captured result');
  }
  const result = capturedResult as EmailInboundResult;
  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.email.from, 'supplier@example.com');
  assert.equal(result.items[0]?.triageStatus, 'AUTO_PROCESSED');
  assert.deepEqual(markReadCalls, ['graph-1']);
});

test('unapproved sender is ignored safely through Graph polling', async () => {
  const logger = createLogger();
  let capturedResult: EmailInboundResult | null = null;
  const markReadCalls: string[] = [];
  const service = createEmailInboundService({
    allowedSenders: ['approved@example.com'],
    logger,
  });

  const worker = createEmailInboundPollingWorker({
    ingestInboundEmail: async (message) => {
      capturedResult = await service.ingestMessage(message);
      return capturedResult;
    },
    listUnreadInboxMessages: async () => [
      {
        id: 'graph-2',
        from: {
          emailAddress: {
            address: 'unknown@example.com',
            name: 'Unknown',
          },
        },
        subject: 'Quote',
        body: {
          contentType: 'text',
          content: 'Paracetamol 500mg caplets 16 - 1.25 GBP',
        },
      },
    ],
    listAttachments: async () => [],
    logger,
    lookupExistingInboundEmail: async () => null,
    markMessageRead: async (messageId) => {
      markReadCalls.push(messageId);
    },
  });

  await worker.runOnce();

  if (!capturedResult) {
    throw new Error('Expected captured result');
  }
  const result = capturedResult as EmailInboundResult;
  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'Sender is not on the email allowlist.');
  assert.deepEqual(markReadCalls, ['graph-2']);
});

test('attachment email reaches import path through Graph polling', async () => {
  const logger = createLogger();
  let capturedResult: EmailInboundResult | null = null;
  const markReadCalls: string[] = [];
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      {
        pattern: 'supplier@example.com',
        supplierName: 'Acme Labs',
      },
    ],
    logger,
    importSupplierPriceList: async () => ({
      importBatchId: 'batch-1',
      summary: {
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        warnings: [],
      },
      errors: [],
    }),
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: () => ({
      rows: [],
      warnings: [],
    }),
  });

  const worker = createEmailInboundPollingWorker({
    ingestInboundEmail: async (message) => {
      capturedResult = await service.ingestMessage(message);
      return capturedResult;
    },
    listUnreadInboxMessages: async () => [
      {
        id: 'graph-3',
        internetMessageId: '<internet-3>',
        from: {
          emailAddress: {
            address: 'supplier@example.com',
            name: 'Supplier',
          },
        },
        subject: 'Supplier price list April',
        body: {
          contentType: 'html',
          content: '<p>Attached.</p>',
        },
        hasAttachments: true,
      },
    ],
    listAttachments: async () => [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'supplier-price-list.csv',
        contentType: 'text/csv',
        contentBytes: Buffer.from('supplierName,productName,unitPrice\nAcme Labs,Aspirin,1.20').toString('base64'),
      },
    ],
    logger,
    lookupExistingInboundEmail: async () => null,
    markMessageRead: async (messageId) => {
      markReadCalls.push(messageId);
    },
  });

  await worker.runOnce();

  if (!capturedResult) {
    throw new Error('Expected captured result');
  }
  const result = capturedResult as EmailInboundResult;
  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.equal(result.items[0]?.attachment.fileName, 'supplier-price-list.csv');
  assert.deepEqual(markReadCalls, ['graph-3']);
});

test('one bad email does not kill the polling loop', async () => {
  const logger = createLogger();
  const handled: string[] = [];
  const markReadCalls: string[] = [];

  const worker = createEmailInboundPollingWorker({
    ingestInboundEmail: async (message) => {
      if (message.externalMessageId === 'graph-4a') {
        throw new Error('boom');
      }

      handled.push(message.externalMessageId ?? 'missing');
      return {
        ignored: false,
        items: [],
      };
    },
    listUnreadInboxMessages: async () => [
      {
        id: 'graph-4a',
        from: {
          emailAddress: {
            address: 'supplier@example.com',
          },
        },
        subject: 'Bad one',
        body: {
          contentType: 'text',
          content: 'bad',
        },
      },
      {
        id: 'graph-4b',
        from: {
          emailAddress: {
            address: 'supplier@example.com',
          },
        },
        subject: 'Good one',
        body: {
          contentType: 'text',
          content: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
        },
      },
    ],
    listAttachments: async () => [],
    logger,
    lookupExistingInboundEmail: async () => null,
    markMessageRead: async (messageId) => {
      markReadCalls.push(messageId);
    },
  });

  await worker.runOnce();

  assert.deepEqual(handled, ['graph-4b']);
  assert.deepEqual(markReadCalls, ['graph-4b']);
  assert.equal(logger.errorCalls.length, 1);
  assert.match(logger.errorCalls[0]?.message ?? '', /continued/i);
});

test('duplicate replayed unread message is not reprocessed dangerously', async () => {
  const logger = createLogger();
  let ingestCalls = 0;
  const markReadCalls: string[] = [];

  const worker = createEmailInboundPollingWorker({
    ingestInboundEmail: async () => {
      ingestCalls += 1;
      return {
        ignored: false,
        items: [],
      };
    },
    listUnreadInboxMessages: async () => [
      {
        id: 'graph-5',
        from: {
          emailAddress: {
            address: 'supplier@example.com',
          },
        },
        subject: 'Replay',
        body: {
          contentType: 'text',
          content: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
        },
      },
    ],
    listAttachments: async () => [],
    logger,
    lookupExistingInboundEmail: async () => ({
      id: 'inbound-1',
      processingStatus: 'REVIEW_REQUIRED',
    }),
    markMessageRead: async (messageId) => {
      markReadCalls.push(messageId);
    },
  });

  await worker.runOnce();

  assert.equal(ingestCalls, 0);
  assert.deepEqual(markReadCalls, ['graph-5']);
});

test('malformed sender-less message is marked read so it does not poison the inbox loop', async () => {
  const logger = createLogger();
  let ingestCalls = 0;
  const markReadCalls: string[] = [];

  const worker = createEmailInboundPollingWorker({
    ingestInboundEmail: async () => {
      ingestCalls += 1;
      return {
        ignored: false,
        items: [],
      };
    },
    listUnreadInboxMessages: async () => [
      {
        id: 'graph-6',
        subject: 'No sender',
        body: {
          contentType: 'text',
          content: 'content',
        },
      },
    ],
    listAttachments: async () => [],
    logger,
    lookupExistingInboundEmail: async () => null,
    markMessageRead: async (messageId) => {
      markReadCalls.push(messageId);
    },
  });

  await worker.runOnce();

  assert.equal(ingestCalls, 0);
  assert.deepEqual(markReadCalls, ['graph-6']);
  assert.equal(logger.warnCalls.length, 1);
});
