import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccountOpeningAnswersSheetPdf } from '../answersSheet';

function pdfHeader(bytes: Uint8Array): string {
  return Buffer.from(bytes.slice(0, 5)).toString('latin1');
}

test('buildAccountOpeningAnswersSheetPdf produces a valid PDF', async () => {
  const bytes = await buildAccountOpeningAnswersSheetPdf({
    values: {
      legalCompanyName: 'AMBE LTD',
      vatNumber: 'GB743707428',
      director: { name: 'Sandeep Patel', email: 'sandeep@ambemedical.com' },
    },
    supplierName: 'Acme Pharma',
    formName: 'form.pdf',
    generatedAtIso: '2026-06-19',
  });

  assert.equal(pdfHeader(bytes), '%PDF-');
  assert.ok(bytes.length > 1000, 'expected a non-trivial PDF');
});

test('buildAccountOpeningAnswersSheetPdf does not crash on empty values', async () => {
  const bytes = await buildAccountOpeningAnswersSheetPdf({ values: {} });
  assert.equal(pdfHeader(bytes), '%PDF-');
});

test('buildAccountOpeningAnswersSheetPdf handles very long addresses (wrapping/pagination)', async () => {
  const longAddress = Array.from({ length: 60 }, (_, i) => `Line${i}`).join(
    ' ',
  );
  const bytes = await buildAccountOpeningAnswersSheetPdf({
    values: {
      legalCompanyName: 'AMBE LTD',
      registeredAddress: longAddress,
      warehouseAddress: longAddress,
    },
  });
  assert.equal(pdfHeader(bytes), '%PDF-');
});
