import assert from 'node:assert/strict';
import test from 'node:test';

import { PDFDocument } from 'pdf-lib';

import { fillAccountOpeningPdf } from '../pdfFill';

async function buildAcroFormPdf(fieldNames: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const form = pdf.getForm();
  fieldNames.forEach((name, index) => {
    const field = form.createTextField(name);
    field.addToPage(page, {
      x: 50,
      y: 800 - index * 30,
      width: 300,
      height: 18,
    });
  });
  return pdf.save();
}

async function readFieldText(bytes: Uint8Array, name: string): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getForm().getTextField(name).getText() ?? '';
}

const VALUES = {
  legalCompanyName: 'AMBE LTD',
  vatNumber: 'GB743707428',
  companyNumber: '3809718',
};

test('fillAccountOpeningPdf fills recognised AcroForm text fields', async () => {
  const bytes = await buildAcroFormPdf([
    'Company Name',
    'VAT Number',
    'Company Registration No',
  ]);

  const result = await fillAccountOpeningPdf({
    pdfBytes: bytes,
    values: VALUES,
  });

  assert.equal(result.status, 'FILLED_FOR_REVIEW');
  assert.ok(result.filledBytes);
  assert.equal(result.filledCount, 3);
  assert.equal(
    await readFieldText(result.filledBytes!, 'Company Name'),
    'AMBE LTD',
  );
  assert.equal(
    await readFieldText(result.filledBytes!, 'VAT Number'),
    'GB743707428',
  );
});

test('fillAccountOpeningPdf never fills bank/signature fields', async () => {
  const bytes = await buildAcroFormPdf([
    'Company Name',
    'Sort Code',
    'Account Number',
    'Signature',
  ]);

  const result = await fillAccountOpeningPdf({
    pdfBytes: bytes,
    values: VALUES,
  });

  const blankNames = result.blankFields.map((b) => b.name);
  assert.ok(blankNames.includes('Sort Code'));
  assert.ok(blankNames.includes('Account Number'));
  assert.ok(blankNames.includes('Signature'));
  assert.equal(await readFieldText(result.filledBytes!, 'Sort Code'), '');
  assert.equal(await readFieldText(result.filledBytes!, 'Signature'), '');
});

test('fillAccountOpeningPdf reports NO_FILLABLE_FIELDS for a flat PDF', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText('Flat form, no fields');
  const flat = await pdf.save();

  const result = await fillAccountOpeningPdf({
    pdfBytes: flat,
    values: VALUES,
  });

  assert.equal(result.status, 'NO_FILLABLE_FIELDS');
  assert.equal(result.filledBytes, null);
});
