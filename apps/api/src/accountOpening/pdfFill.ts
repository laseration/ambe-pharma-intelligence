import { PDFDocument, PDFTextField, type PDFField } from 'pdf-lib';

import {
  normaliseLabel,
  resolveControl,
  type AccountOpeningDocxFillValues,
} from './docxFill';

/**
 * Fills a *fillable* (AcroForm) PDF account-opening form. Uses the SAME safe
 * resolver as the Word filler — bank/sort-code/signature fields are never
 * filled, only recognised company/contact fields are.
 *
 * Flat or scanned PDFs (no form fields) return NO_FILLABLE_FIELDS — the caller
 * falls back to the standalone answers sheet rather than guessing pixel
 * positions on the page.
 */

export type AccountOpeningPdfFillStatus =
  | 'FILLED_FOR_REVIEW'
  | 'NO_FILLABLE_FIELDS'
  | 'UNSUPPORTED'
  | 'FAILED';

export type AccountOpeningPdfFilledField = {
  name: string;
  value: string;
};

export type AccountOpeningPdfBlankField = {
  name: string;
  reason: 'POLICY_MUST_STAY_BLANK' | 'NO_PROFILE_VALUE' | 'UNRECOGNISED_FIELD';
};

export type AccountOpeningPdfFillResult = {
  status: AccountOpeningPdfFillStatus;
  filledBytes: Uint8Array | null;
  totalFields: number;
  filledCount: number;
  blankCount: number;
  filledFields: AccountOpeningPdfFilledField[];
  blankFields: AccountOpeningPdfBlankField[];
  warnings: string[];
};

export async function fillAccountOpeningPdf(input: {
  pdfBytes: Uint8Array | Buffer;
  values: AccountOpeningDocxFillValues;
}): Promise<AccountOpeningPdfFillResult> {
  const warnings: string[] = [];

  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(input.pdfBytes, { ignoreEncryption: true });
  } catch (error) {
    return {
      status: 'UNSUPPORTED',
      filledBytes: null,
      totalFields: 0,
      filledCount: 0,
      blankCount: 0,
      filledFields: [],
      blankFields: [],
      warnings: [`Could not read PDF: ${(error as Error).message}`],
    };
  }

  let fields: PDFField[] = [];
  try {
    fields = pdf.getForm().getFields();
  } catch {
    fields = [];
  }

  if (fields.length === 0) {
    return {
      status: 'NO_FILLABLE_FIELDS',
      filledBytes: null,
      totalFields: 0,
      filledCount: 0,
      blankCount: 0,
      filledFields: [],
      blankFields: [],
      warnings: [
        'This PDF has no fillable form fields (likely flat or scanned). Use the answers sheet instead.',
      ],
    };
  }

  const filledFields: AccountOpeningPdfFilledField[] = [];
  const blankFields: AccountOpeningPdfBlankField[] = [];

  for (const field of fields) {
    if (!(field instanceof PDFTextField)) {
      // Never auto-tick checkboxes / radios / dropdowns.
      continue;
    }
    const name = field.getName();
    const resolution = resolveControl(null, normaliseLabel(name), input.values);
    if (resolution.kind === 'FILL') {
      try {
        field.setText(resolution.value);
        filledFields.push({ name, value: resolution.value });
      } catch (error) {
        warnings.push(
          `Could not set field "${name}": ${(error as Error).message}`,
        );
        blankFields.push({ name, reason: 'UNRECOGNISED_FIELD' });
      }
    } else {
      blankFields.push({ name, reason: resolution.reason });
    }
  }

  if (filledFields.length === 0) {
    return {
      status: 'NO_FILLABLE_FIELDS',
      filledBytes: null,
      totalFields: fields.length,
      filledCount: 0,
      blankCount: blankFields.length,
      filledFields,
      blankFields,
      warnings: [
        ...warnings,
        'No PDF field matched the Ambe master profile — nothing was filled.',
      ],
    };
  }

  let filledBytes: Uint8Array;
  try {
    filledBytes = await pdf.save();
  } catch (error) {
    return {
      status: 'FAILED',
      filledBytes: null,
      totalFields: fields.length,
      filledCount: filledFields.length,
      blankCount: blankFields.length,
      filledFields,
      blankFields,
      warnings: [
        ...warnings,
        `Could not save PDF: ${(error as Error).message}`,
      ],
    };
  }

  return {
    status: 'FILLED_FOR_REVIEW',
    filledBytes,
    totalFields: fields.length,
    filledCount: filledFields.length,
    blankCount: blankFields.length,
    filledFields,
    blankFields,
    warnings,
  };
}
