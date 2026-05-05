import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductCandidates } from '../../imports/normalization';
import { createEmailInboundService } from '../inbound/service';
import { parseAmbePurchaseOrderPdfText } from '../purchaseOrderPdf';

const DIXONS_PO_TEXT = [
  'Ambe Limited t/a Ambe Medical Group',
  'PURCHASE ORDER',
  'Supplier Name',
  'DIXONS PHARMACEUTICALS UK LIMITED',
  'Unit 4 Trade Park',
  'Account No: DIXONS',
  'Order No. 5981',
  'Invoice / Tax date: 28/04/2026',
  '',
  'Qty Stock Code Product Description Unit Price Net VAT Code',
  '50 4006607 BRIVIACT TABS 100MG 56s 76.00 3800.00 T1',
  '20 1234567 Clexane safety syr 100mg x 10 30.25 605.00 T1',
  '10 7654321 Clexane solution for injection pre-filled syringes 35.10 351.00 T1',
  '30 1112223 Fultium-D3 capsules 3200 units 30 12.00 360.00 T1',
  '1 000BDE BATCH / EXPIRY 0.00 0.00 T1',
  '',
  'Total Net: 5116.00',
  'Total VAT: 1023.20',
  'Order Total: 6139.20',
].join('\n');

function createLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

test('detects Ambe purchase order PDF and extracts header fields', () => {
  const result = parseAmbePurchaseOrderPdfText(DIXONS_PO_TEXT);

  assert.equal(result.detected, true);
  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.supplierName, 'DIXONS PHARMACEUTICALS UK LIMITED');
  assert.equal(result.poNumber, '5981');
  assert.equal(result.orderDate, '2026-04-28');
  assert.equal(result.accountNo, 'DIXONS');
  assert.equal(result.totalNetAmount, 5116);
  assert.equal(result.totalVatAmount, 1023.2);
  assert.equal(result.orderTotal, 6139.2);
});

test('extracts product lines and ignores batch expiry note rows', () => {
  const result = parseAmbePurchaseOrderPdfText(DIXONS_PO_TEXT);

  assert.equal(result.lines.length, 4);
  assert.deepEqual(result.lines[0], {
    quantity: 50,
    stockCode: '4006607',
    productDescription: 'BRIVIACT TABS 100MG 56s',
    unitPrice: 76,
    netAmount: 3800,
    vatCode: 'T1',
    rawLine: '50 4006607 BRIVIACT TABS 100MG 56s 76.00 3800.00 T1',
  });
  assert.equal(result.lines.some((line) => line.stockCode === '000BDE'), false);
  assert.equal(result.evidence.some((line) => /BRIVIACT TABS/i.test(line)), true);
});

test('detected purchase order PDF is not auto-imported as a supplier price list', async () => {
  let supplierImportCalls = 0;
  const service = createEmailInboundService({
    allowedSenders: ['supplier@example.com'],
    supplierMappings: [
      {
        pattern: 'supplier@example.com',
        supplierName: 'Dixons Pharmaceuticals UK Limited',
      },
    ],
    logger: createLogger(),
    importSupplierPriceList: async () => {
      supplierImportCalls += 1;
      throw new Error('supplier price list import should not run for purchase order PDFs');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run');
    },
    importSales: async () => {
      throw new Error('sales import should not run');
    },
    extractAttachmentText: async () => ({
      method: 'PDF_TEXT',
      text: DIXONS_PO_TEXT,
      warnings: [],
    }),
    parseTextMessage: async (rawText) => ({
      totalLines: rawText.split('\n').length,
      candidateLines: 1,
      parsedRows: [
        {
          lineNumber: 11,
          rawLine: '50 4006607 BRIVIACT TABS 100MG 56s 76.00 3800.00 T1',
          rawProductName: 'BRIVIACT TABS 100MG 56s',
          rawProductText: 'BRIVIACT TABS 100MG 56s',
          strength: '100mg',
          formulation: 'tabs',
          packSize: '56s',
          price: 76,
          currencyCode: 'GBP',
          productCandidates: buildProductCandidates('BRIVIACT TABS 100MG 56s'),
          confidence: 'HIGH',
          explanation: 'PO line has structured product and price-like fields.',
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
    subject: 'Supplier price list April',
    bodyText: 'Please import the attached supplier price list.',
    attachments: [
      {
        fileName: 'supplier-price-list.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('pdf').toString('base64'),
      },
    ],
  });

  assert.equal(supplierImportCalls, 0);
  assert.equal(result.items[0]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(result.items[0]?.inferredImportType, null);
  assert.equal(result.items[0]?.purchaseOrderPdf?.detected, true);
  assert.equal(result.items[0]?.purchaseOrderPdf?.supplierName, 'DIXONS PHARMACEUTICALS UK LIMITED');
  assert.match(result.items[0]?.reason ?? '', /Purchase order PDF found/);
  assert.match(result.items[0]?.reason ?? '', /Review before importing into purchase history/);
});
