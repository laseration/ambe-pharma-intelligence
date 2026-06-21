import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

import { buildProductCandidates } from '../../imports/normalization';
import { createEmailInboundService } from '../inbound/service';
import type { ParsedFileResult, ParsedTableRow } from '../../imports/types';

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

function createLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

function parsedFile(rows: ParsedTableRow[] = []): ParsedFileResult {
  return {
    rows,
    warnings: [],
    detectedColumns: [],
  };
}

test('supplier CSV attachment auto-imports through the import pipeline', async () => {
  const calls: string[] = [];
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      {
        pattern: 'supplier@example.com',
        supplierName: 'Acme Labs',
      },
    ],
    logger: createLogger(),
    importSupplierPriceList: async ({ file, supplierName }) => {
      calls.push(`${file.originalname}:${supplierName ?? ''}`);
      return {
        importBatchId: 'batch-supplier',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const csv = [
    'supplierName,productName,unitPrice',
    'Acme Labs,Paracetamol 500mg Tablets,2.35',
  ].join('\n');

  const result = await service.ingestMessage({
    messageId: 'msg-supplier',
    from: 'supplier@example.com',
    subject: 'Supplier price list April',
    bodyText: 'Latest supplier price list attached.',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from(csv).toString('base64'),
      },
    ],
  });

  assert.equal(result.ignored, false);
  assert.deepEqual(calls, ['supplier-price-list.csv:Acme Labs']);
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.equal(result.items[0]?.inferredImportType, 'supplier-price-list');
  assert.equal(result.items[0]?.email.subject, 'Supplier price list April');
  assert.equal(result.items[0]?.attachment.fileName, 'supplier-price-list.csv');
  assert.match(result.items[0]?.reason ?? '', /inferred confidently/i);
  assert.match(
    result.items[0]?.reason ?? '',
    /trusted supplier mapping was used for Acme Labs/i,
  );
});

test('a confidently classified price list imports without filename/subject keywords', async () => {
  const calls: string[] = [];
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      { pattern: 'supplier@example.com', supplierName: 'Acme Labs' },
    ],
    logger: createLogger(),
    importSupplierPriceList: async ({ supplierName }) => {
      calls.push(supplierName ?? '');
      return {
        importBatchId: 'batch-classified',
        summary: { totalRows: 1, validRows: 1, invalidRows: 0, warnings: [] },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    // A clear price-list table — the document classifier should recognise it
    // even though the subject and filename carry no import keywords.
    parseUploadedFile: async () =>
      parsedFile([
        {
          productName: 'Aspirin 75mg tablets 100',
          unitPrice: '1.50',
          packSize: '100',
          currency: 'GBP',
        } as ParsedTableRow,
      ]),
  });

  const csv = [
    'productName,unitPrice,packSize,currency',
    'Aspirin 75mg tablets 100,1.50,100,GBP',
  ].join('\n');

  const result = await service.ingestMessage({
    messageId: 'msg-classified',
    from: 'supplier@example.com',
    subject: 'Hello there', // deliberately no import keyword
    bodyText:
      'Please find our latest wholesale price list with unit prices and pack sizes attached.',
    attachments: [
      {
        fileName: 'data.csv', // deliberately no import keyword
        mimeType: 'text/csv',
        content: Buffer.from(csv).toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.equal(result.items[0]?.inferredImportType, 'supplier-price-list');
  assert.match(result.items[0]?.reason ?? '', /document classifier/i);
  assert.deepEqual(calls, ['Acme Labs']);
});

test('trusted domain sender is allowed for direct supplier emails', async () => {
  let called = false;
  const service = createEmailInboundService({
    allowedSenders: ['supplier.co'],
    supplierMappings: [
      {
        pattern: '@supplier.co',
        supplierName: 'Supplier Co',
      },
    ],
    logger: createLogger(),
    importSupplierPriceList: async ({ supplierName }) => {
      called = supplierName === 'Supplier Co';
      return {
        importBatchId: 'batch-domain-supplier',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'pricing@supplier.co',
    subject: 'Supplier price list June',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(called, true);
  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
});

test('inventory XLSX attachment auto-imports through the import pipeline', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'Inventory',
      rows: [
        ['productName', 'warehouseCode', 'snapshotDate', 'quantityOnHand'],
        ['Paracetamol 500mg Tablets', 'MAIN', '2026-04-18', '120'],
      ],
    },
  ]);

  let called = false;
  const service = createEmailInboundService({
    allowedSenders: ['ops@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async ({ file }) => {
      called = file.originalname === 'weekly-inventory.xlsx';
      return {
        importBatchId: 'batch-inventory',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    messageId: 'msg-inventory',
    from: 'ops@ambe.test',
    subject: 'Weekly inventory export',
    bodyText: 'Inventory snapshot attached.',
    attachments: [
      {
        fileName: 'weekly-inventory.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: buffer.toString('base64'),
      },
    ],
  });

  assert.equal(called, true);
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.equal(result.items[0]?.inferredImportType, 'inventory');
});

test('PDF attachment is marked review-required', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
  });

  const result = await service.ingestMessage({
    from: 'supplier@example.com',
    subject: 'Quote attached',
    bodyText: 'Please review the PDF quote.',
    attachments: [
      {
        fileName: 'quote.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('pdf').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(result.items[0]?.inferredImportType, null);
});

test('PDF attachment text can be extracted into structured review rows', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    extractAttachmentText: async () => ({
      method: 'PDF_TEXT',
      text: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
      warnings: [],
    }),
    parseTextMessage: async (rawText) => ({
      totalLines: 1,
      candidateLines: 1,
      parsedRows: [
        {
          lineNumber: 1,
          rawLine: rawText,
          rawProductName: 'Amlodipine 5mg tabs 28',
          rawProductText: 'Amlodipine 5mg tabs 28',
          strength: '5mg',
          formulation: 'tabs',
          packSize: '28',
          price: 8.4,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates('Amlodipine 5mg tabs 28'),
          confidence: 'HIGH',
          explanation: 'Strong extracted line structure.',
        },
      ],
      skippedLines: [],
      overallConfidence: 'HIGH',
      reviewRecommended: true,
      reviewRequired: true,
      rawBodyText: rawText,
      rawBody: rawText,
      parsingSource: 'DETERMINISTIC',
      aiFallbackUsed: false,
    }),
  });

  const result = await service.ingestMessage({
    from: 'supplier@example.com',
    subject: 'Quote attached',
    bodyText: 'Please review the PDF quote.',
    attachments: [
      {
        fileName: 'quote.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('pdf').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.textParsing?.parsedRows.length, 1);
  assert.equal(result.items[0]?.attachmentTextExtraction?.method, 'PDF_TEXT');
  assert.match(result.items[0]?.reason ?? '', /extracted structured text/i);
});

test('image attachment text can be extracted into structured review rows', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    extractAttachmentText: async () => ({
      method: 'IMAGE_OCR',
      text: 'Paracetamol 500mg caplets 16 - 1.25 GBP',
      warnings: [],
    }),
    parseTextMessage: async (rawText) => ({
      totalLines: 1,
      candidateLines: 1,
      parsedRows: [
        {
          lineNumber: 1,
          rawLine: rawText,
          rawProductName: 'Paracetamol 500mg caplets 16',
          rawProductText: 'Paracetamol 500mg caplets 16',
          strength: '500mg',
          formulation: 'caplets',
          packSize: '16',
          price: 1.25,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates(
            'Paracetamol 500mg caplets 16',
          ),
          confidence: 'MEDIUM',
          explanation: 'OCR extracted a usable commercial line.',
        },
      ],
      skippedLines: [],
      overallConfidence: 'MEDIUM',
      reviewRecommended: true,
      reviewRequired: true,
      rawBodyText: rawText,
      rawBody: rawText,
      parsingSource: 'DETERMINISTIC',
      aiFallbackUsed: false,
    }),
  });

  const result = await service.ingestMessage({
    from: 'supplier@example.com',
    subject: 'Photo offer',
    bodyText: 'Please review the image quote.',
    attachments: [
      {
        fileName: 'offer.jpg',
        mimeType: 'image/jpeg',
        content: Buffer.from('jpg').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.textParsing?.parsedRows.length, 1);
  assert.equal(result.items[0]?.attachmentTextExtraction?.method, 'IMAGE_OCR');
  assert.match(result.items[0]?.reason ?? '', /image attachment/i);
});

test('inline image is ignored when a spreadsheet attachment is present', async () => {
  let importedFileName: string | null = null;
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      { pattern: 'supplier@example.com', supplierName: 'Supplier Co' },
    ],
    logger: createLogger(),
    importSupplierPriceList: async ({ file }) => {
      importedFileName = file.originalname;
      return {
        importBatchId: 'batch-inline-image-filtered',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
    extractAttachmentText: async () => ({
      method: 'IMAGE_OCR',
      text: 'Decorative inline image text should be ignored',
      warnings: [],
    }),
  });

  const result = await service.ingestMessage({
    from: 'supplier@example.com',
    subject: 'Supplier price list April',
    attachments: [
      {
        fileName: 'image002.png',
        mimeType: 'image/png',
        disposition: 'inline',
        contentId: 'cid-image',
        content: Buffer.from('png').toString('base64'),
      },
      {
        fileName: 'supplier-price-list.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: 'attachment',
        content: Buffer.from('xlsx').toString('base64'),
      },
    ],
  });

  assert.equal(importedFileName, 'supplier-price-list.xlsx');
  assert.equal(result.items.length, 1);
  assert.equal(
    result.items[0]?.attachment.fileName,
    'supplier-price-list.xlsx',
  );
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
});

test('unclear CSV attachment is marked needs-review', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['ops@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'ops@ambe.test',
    subject: 'Data file',
    bodyText: 'Please process this.',
    attachments: [
      {
        fileName: 'data.csv',
        mimeType: 'text/csv',
        content: Buffer.from('a,b\n1,2').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.inferredImportType, null);
});

test('disallowed sender is ignored safely', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['ops@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'unknown@example.com',
    subject: 'Supplier price list',
    bodyText: 'Attached.',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('supplierName,productName,unitPrice').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'Sender is not on the email allowlist.');
  assert.equal(result.items.length, 0);
});

test('generic sender like sales@company.com does not create sales-import confidence by itself', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['company.com'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'sales@company.com',
    subject: 'Attached',
    bodyText: 'Please review.',
    attachments: [
      {
        fileName: 'report.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from('x').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.inferredImportType, null);
});

test('vague spreadsheet filename becomes needs-review', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['ops@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'ops@ambe.test',
    subject: 'Attached',
    attachments: [
      {
        fileName: 'spreadsheet.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from('x').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
});

test('trusted supplier sender mapping populates supplierName for supplier price list import', async () => {
  let capturedSupplierName: string | undefined;
  const service = createEmailInboundService({
    allowedSenders: ['supplier.co'],
    supplierMappings: [
      {
        pattern: '@supplier.co',
        supplierName: 'Supplier Co',
      },
    ],
    logger: createLogger(),
    importSupplierPriceList: async ({ supplierName }) => {
      capturedSupplierName = supplierName;
      return {
        importBatchId: 'batch-supplier-map',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'pricing@supplier.co',
    subject: 'Supplier price list May',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(capturedSupplierName, 'Supplier Co');
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.match(result.items[0]?.reason ?? '', /inferred confidently/i);
  assert.match(
    result.items[0]?.reason ?? '',
    /trusted supplier mapping was used for Supplier Co/i,
  );
});

test('forwarded owner email can use manual supplier override and it takes priority', async () => {
  let capturedSupplierName: string | undefined;
  const service = createEmailInboundService({
    allowedSenders: ['owner@ambe.test'],
    supplierMappings: [
      {
        pattern: 'owner@ambe.test',
        supplierName: 'Wrong Supplier',
      },
    ],
    logger: createLogger(),
    importSupplierPriceList: async ({ supplierName }) => {
      capturedSupplierName = supplierName;
      return {
        importBatchId: 'batch-forwarded-owner',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'owner@ambe.test',
    supplierName: 'Forwarded Supplier Ltd',
    subject: 'Supplier price list forwarded',
    bodyText: 'Forwarded from supplier.',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(capturedSupplierName, 'Forwarded Supplier Ltd');
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.match(
    result.items[0]?.reason ?? '',
    /payload supplier override was used for Forwarded Supplier Ltd/i,
  );
});

test('subject supplier override populates supplierName', async () => {
  let capturedSupplierName: string | undefined;
  const service = createEmailInboundService({
    allowedSenders: ['owner@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async ({ supplierName }) => {
      capturedSupplierName = supplierName;
      return {
        importBatchId: 'batch-subject-override',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'owner@ambe.test',
    subject: '[Supplier: ABC Pharma] Supplier price list forwarded',
    bodyText: 'Forwarded from supplier.',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(capturedSupplierName, 'ABC Pharma');
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.match(
    result.items[0]?.reason ?? '',
    /manual supplier override from forwarded email content was used for ABC Pharma/i,
  );
});

test('body supplier override populates supplierName', async () => {
  let capturedSupplierName: string | undefined;
  const service = createEmailInboundService({
    allowedSenders: ['owner@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async ({ supplierName }) => {
      capturedSupplierName = supplierName;
      return {
        importBatchId: 'batch-body-override',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warnings: [],
        },
        errors: [],
      };
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'owner@ambe.test',
    subject: 'Supplier price list forwarded',
    bodyText: 'Forwarded from supplier.\nSupplier: ABC Pharma',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(capturedSupplierName, 'ABC Pharma');
  assert.equal(result.items[0]?.processingStatus, 'IMPORTED');
  assert.match(
    result.items[0]?.reason ?? '',
    /manual supplier override from forwarded email content was used for ABC Pharma/i,
  );
});

test('malformed supplier override is ignored safely', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['owner@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'owner@ambe.test',
    subject: '[Supplier:   ] Supplier price list forwarded',
    bodyText: 'Supplier:   ',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
});

test('forwarded email from approved sender without reliable supplier info becomes needs-review', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['owner@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'owner@ambe.test',
    subject: 'Supplier price list forwarded',
    bodyText: 'Forwarded from supplier.',
    attachments: [
      {
        fileName: 'supplier-price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('productName,unitPrice\nAspirin,1.50').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
});

test('mixed ambiguous signals do not auto-import', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['ops@ambe.test'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'ops@ambe.test',
    subject: 'Sales inventory report',
    attachments: [
      {
        fileName: 'sales-stock.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from('x').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.inferredImportType, null);
});

test('supplier contact forms are routed to review rather than import', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () =>
      parsedFile([
        {
          Supplier: 'Acme Labs',
          'Contact Email': 'buyer@example.com',
          Telephone: '02000000000',
        },
      ]),
  });

  const result = await service.ingestMessage({
    from: 'supplier@example.com',
    subject: 'Supplier contact details form',
    attachments: [
      {
        fileName: 'supplier-contact-details.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from('x').toString('base64'),
      },
    ],
  });

  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(result.items[0]?.inferredImportType, null);
  assert.match(result.items[0]?.reason ?? '', /requires operator review/i);
});

test('mixed account-opening and supplier price-list signals stay in manual review', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () =>
      parsedFile([
        {
          Product: 'Aspirin',
          'Unit Price': '1.50',
          'Available Qty': '20',
        },
      ]),
  });

  const result = await service.ingestMessage({
    from: 'supplier@example.com',
    subject: 'Account opening form and price list',
    bodyText: 'Please review the account opening form and weekly stock offer.',
    attachments: [
      {
        fileName: 'account-opening-form.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('pdf').toString('base64'),
      },
      {
        fileName: 'price-list.csv',
        mimeType: 'text/csv',
        content: Buffer.from('Product,Unit Price,Available Qty').toString(
          'base64',
        ),
      },
    ],
  });

  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.inferredImportType, null);
  assert.match(result.items[0]?.reason ?? '', /conflicting signals/i);
});

test('missing inferredImportType does not crash import flow', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['ops@ambe.test'],
    logger: createLogger(),
    inferImportDecision: () => ({
      processingStatus: 'RECEIVED',
      inferredImportType: null,
      confidence: 'HIGH',
      reason: 'Test decision reached import step.',
    }),
    importSupplierPriceList: async () => {
      throw new Error('supplier import should not run');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    parseUploadedFile: async () => parsedFile(),
  });

  const result = await service.ingestMessage({
    from: 'ops@ambe.test',
    subject: 'Inventory export',
    attachments: [
      {
        fileName: 'inventory.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from('x').toString('base64'),
      },
    ],
  });

  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.match(
    result.items[0]?.reason ?? '',
    /test decision reached import step/i,
  );
  assert.match(
    result.items[0]?.reason ?? '',
    /import type was missing at execution time/i,
  );
});

test('body-only known supplier structured price list is triaged as auto-processed', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier.co'],
    supplierMappings: [
      { pattern: '@supplier.co', supplierName: 'Supplier Co' },
    ],
    logger: createLogger(),
  });

  const result = await service.ingestMessage({
    from: 'pricing@supplier.co',
    subject: 'Price list April',
    bodyText: [
      'Amlodipine 5mg tabs 28 - 8.40 GBP',
      'Paracetamol 500mg caplets 16 - 1.25 GBP',
      'Metformin 500mg 28 - 3.10 GBP',
    ].join('\n'),
  });

  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.triageStatus, 'AUTO_PROCESSED');
  assert.equal(result.items[0]?.processingStatus, 'RECEIVED');
});

test('body-only known supplier messy commercial email is marked ai-review-eligible', async () => {
  const service = createEmailInboundService({
    allowedSenders: ['supplier.co'],
    supplierMappings: [
      { pattern: '@supplier.co', supplierName: 'Supplier Co' },
    ],
    emailReviewEnabled: false,
    logger: createLogger(),
  });

  const result = await service.ingestMessage({
    from: 'pricing@supplier.co',
    subject: 'Offer this week',
    bodyText: [
      'We can do Paracetamol 500mg caplets 16 at 1.25 GBP if useful.',
      'Metformin 500mg tablets 28 can also be supplied at 3.10 GBP.',
    ].join('\n'),
  });

  assert.equal(result.ignored, false);
  assert.equal(result.items[0]?.triageStatus, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(result.items[0]?.aiBlockedReason, 'email_ai_review_disabled');
});
