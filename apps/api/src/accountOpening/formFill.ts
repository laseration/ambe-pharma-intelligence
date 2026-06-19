import {
  fillAccountOpeningDocx,
  type AccountOpeningDocxFillValues,
} from './docxFill';
import { fillAccountOpeningPdf } from './pdfFill';

/**
 * Format dispatcher for account-opening form filling. Routes by file type and
 * normalises the result so callers (email reply, future dashboard) don't care
 * whether the form was Word or PDF:
 *  - .docx → Word content-control fill
 *  - .pdf  → AcroForm fill (flat/scanned PDFs return no filled bytes)
 *  - other → not filled in place (caller falls back to the answers sheet)
 */

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_CONTENT_TYPE = 'application/pdf';

export type AccountOpeningUnifiedFillField = {
  section: string | null;
  label: string;
  value: string;
};

export type AccountOpeningUnifiedBlankField = {
  section: string | null;
  label: string;
  reason: string;
};

export type AccountOpeningUnifiedFillResult = {
  format: 'DOCX' | 'PDF' | 'OTHER';
  filledBytes: Uint8Array | null;
  filledContentType: string | null;
  filledFileSuffix: string;
  filledCount: number;
  blankCount: number;
  filledFields: AccountOpeningUnifiedFillField[];
  blankFields: AccountOpeningUnifiedBlankField[];
  warnings: string[];
};

function extensionOf(fileName: string): string {
  return (fileName.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '').toLowerCase();
}

export function contentTypeForFile(fileName: string): string {
  const ext = extensionOf(fileName);
  if (ext === '.pdf') {
    return PDF_CONTENT_TYPE;
  }
  if (ext === '.docx') {
    return DOCX_CONTENT_TYPE;
  }
  return 'application/octet-stream';
}

export async function fillAccountOpeningForm(input: {
  bytes: Uint8Array | Buffer;
  fileName: string;
  values: AccountOpeningDocxFillValues;
}): Promise<AccountOpeningUnifiedFillResult> {
  const ext = extensionOf(input.fileName);

  if (ext === '.docx') {
    const result = fillAccountOpeningDocx({
      docxBytes: input.bytes,
      values: input.values,
    });
    return {
      format: 'DOCX',
      filledBytes: result.filledBytes,
      filledContentType: result.filledBytes ? DOCX_CONTENT_TYPE : null,
      filledFileSuffix: '.docx',
      filledCount: result.filledCount,
      blankCount: result.blankCount,
      filledFields: result.filledFields.map((f) => ({
        section: f.section,
        label: f.label,
        value: f.value,
      })),
      blankFields: result.blankFields.map((b) => ({
        section: b.section,
        label: b.label,
        reason: b.reason,
      })),
      warnings: result.warnings,
    };
  }

  if (ext === '.pdf') {
    const result = await fillAccountOpeningPdf({
      pdfBytes: input.bytes,
      values: input.values,
    });
    return {
      format: 'PDF',
      filledBytes: result.filledBytes,
      filledContentType: result.filledBytes ? PDF_CONTENT_TYPE : null,
      filledFileSuffix: '.pdf',
      filledCount: result.filledCount,
      blankCount: result.blankCount,
      filledFields: result.filledFields.map((f) => ({
        section: null,
        label: f.name,
        value: f.value,
      })),
      blankFields: result.blankFields.map((b) => ({
        section: null,
        label: b.name,
        reason: b.reason,
      })),
      warnings: result.warnings,
    };
  }

  return {
    format: 'OTHER',
    filledBytes: null,
    filledContentType: null,
    filledFileSuffix: ext,
    filledCount: 0,
    blankCount: 0,
    filledFields: [],
    blankFields: [],
    warnings: [
      `In-place filling is not supported for "${ext || 'this file type'}" — the answers sheet is attached instead.`,
    ],
  };
}
