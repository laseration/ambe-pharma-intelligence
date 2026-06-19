import assert from 'node:assert/strict';
import test from 'node:test';

import PizZip from 'pizzip';

import { fillAccountOpeningDocx } from '../docxFill';

// A Word content control showing its placeholder ("Click here to enter text.").
function control(): string {
  return (
    '<w:sdt><w:sdtPr><w:showingPlcHdr/></w:sdtPr><w:sdtContent>' +
    '<w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr>' +
    '<w:t>Click here to enter text.</w:t></w:r>' +
    '</w:sdtContent></w:sdt>'
  );
}

function label(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

/** Build a minimal .docx (only word/document.xml — all the filler reads). */
function buildDocx(bodyParts: string[]): Buffer {
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${bodyParts.join('')}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file('word/document.xml', documentXml);
  return Buffer.from(zip.generate({ type: 'uint8array' }));
}

function fieldByLabel<T extends { label: string }>(
  fields: T[],
  label: string,
): T | undefined {
  return fields.find((f) => f.label === label);
}

const VALUES = {
  legalCompanyName: 'AMBE LTD',
  vatNumber: 'GB743707428',
  director: {
    name: 'Sandeep Patel',
    email: 'sandeep@ambemedical.com',
    phone: '07740858586',
  },
};

test('fillAccountOpeningDocx fills a labelled content control from the profile', () => {
  const docx = buildDocx([
    label('COMPANY NAME'),
    control(),
    label('VAT NUMBER'),
    control(),
  ]);

  const result = fillAccountOpeningDocx({ docxBytes: docx, values: VALUES });

  assert.equal(result.status, 'FILLED_FOR_REVIEW');
  assert.ok(result.filledBytes);
  assert.equal(
    fieldByLabel(result.filledFields, 'COMPANY NAME')?.value,
    'AMBE LTD',
  );
  assert.equal(
    fieldByLabel(result.filledFields, 'VAT NUMBER')?.value,
    'GB743707428',
  );
});

test('fillAccountOpeningDocx never fills a bank/sort-code control', () => {
  const docx = buildDocx([
    label('COMPANY NAME'),
    control(),
    label('SORT CODE'),
    control(),
    label('ACCOUNT NUMBER'),
    control(),
  ]);

  const result = fillAccountOpeningDocx({ docxBytes: docx, values: VALUES });

  const sortCode = fieldByLabel(result.blankFields, 'SORT CODE');
  const accountNumber = fieldByLabel(result.blankFields, 'ACCOUNT NUMBER');
  assert.equal(sortCode?.reason, 'POLICY_MUST_STAY_BLANK');
  assert.equal(accountNumber?.reason, 'POLICY_MUST_STAY_BLANK');
  // ...and they were genuinely not written.
  assert.equal(fieldByLabel(result.filledFields, 'SORT CODE'), undefined);
});

test('fillAccountOpeningDocx resolves a contact field via its section header', () => {
  const docx = buildDocx([
    label('DIRECTOR'),
    label('NAME'),
    control(),
    label('E-MAIL'),
    control(),
    label('PHONE'),
    control(),
  ]);

  const result = fillAccountOpeningDocx({ docxBytes: docx, values: VALUES });

  const name = result.filledFields.find(
    (f) => f.label === 'NAME' && f.section?.includes('DIRECTOR'),
  );
  assert.equal(name?.value, 'Sandeep Patel');
  assert.equal(
    result.filledFields.find((f) => f.label === 'MAIL' || f.label === 'E-MAIL')
      ?.value,
    'sandeep@ambemedical.com',
  );
});

test('fillAccountOpeningDocx reports NO_FILLABLE_CONTROLS when there are no placeholders', () => {
  const docx = buildDocx([label('COMPANY NAME'), label('Just some text')]);

  const result = fillAccountOpeningDocx({ docxBytes: docx, values: VALUES });

  assert.equal(result.status, 'NO_FILLABLE_CONTROLS');
  assert.equal(result.filledBytes, null);
});

test('fillAccountOpeningDocx returns UNSUPPORTED for non-docx bytes', () => {
  const result = fillAccountOpeningDocx({
    docxBytes: Buffer.from('not a zip at all'),
    values: VALUES,
  });
  assert.equal(result.status, 'UNSUPPORTED');
});
