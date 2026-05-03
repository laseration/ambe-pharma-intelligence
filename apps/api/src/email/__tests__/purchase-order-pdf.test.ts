import assert from 'node:assert/strict';
import test from 'node:test';

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
