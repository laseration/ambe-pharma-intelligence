import assert from 'node:assert/strict';
import test from 'node:test';

import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';

import { contentTypeForFile, fillAccountOpeningForm } from '../formFill';

const DOCX_CT =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function buildContentControlDocx(): Buffer {
  const control =
    '<w:sdt><w:sdtPr><w:showingPlcHdr/></w:sdtPr><w:sdtContent>' +
    '<w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr>' +
    '<w:t>Click here to enter text.</w:t></w:r></w:sdtContent></w:sdt>';
  const xml =
    '<?xml version="1.0"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>COMPANY NAME</w:t></w:r></w:p>' +
    control +
    '</w:body></w:document>';
  const zip = new PizZip();
  zip.file('word/document.xml', xml);
  return Buffer.from(zip.generate({ type: 'uint8array' }));
}

async function buildFlatPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText('Flat form');
  return pdf.save();
}

const VALUES = { legalCompanyName: 'AMBE LTD' };

test('contentTypeForFile maps known extensions', () => {
  assert.equal(contentTypeForFile('x.pdf'), 'application/pdf');
  assert.equal(contentTypeForFile('x.docx'), DOCX_CT);
  assert.equal(contentTypeForFile('x.bin'), 'application/octet-stream');
});

test('fillAccountOpeningForm routes .docx to the Word filler', async () => {
  const result = await fillAccountOpeningForm({
    bytes: buildContentControlDocx(),
    fileName: 'form.docx',
    values: VALUES,
  });
  assert.equal(result.format, 'DOCX');
  assert.ok(result.filledCount >= 1);
  assert.ok(result.filledBytes);
  assert.equal(result.filledContentType, DOCX_CT);
});

test('fillAccountOpeningForm routes .pdf to the AcroForm filler (flat PDF = no fill)', async () => {
  const result = await fillAccountOpeningForm({
    bytes: await buildFlatPdf(),
    fileName: 'form.pdf',
    values: VALUES,
  });
  assert.equal(result.format, 'PDF');
  assert.equal(result.filledBytes, null);
  assert.equal(result.filledCount, 0);
});

test('fillAccountOpeningForm reports OTHER for an unsupported file type', async () => {
  const result = await fillAccountOpeningForm({
    bytes: Buffer.from('hello'),
    fileName: 'notes.txt',
    values: VALUES,
  });
  assert.equal(result.format, 'OTHER');
  assert.equal(result.filledBytes, null);
  assert.ok(result.warnings.length > 0);
});
