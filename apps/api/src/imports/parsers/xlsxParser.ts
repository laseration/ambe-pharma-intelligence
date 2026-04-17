import XLSX from 'xlsx';

import type { ParsedFileResult, ParsedTableRow, UploadFile } from '../types';

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

export function parseXlsxFile(file: UploadFile): ParsedFileResult {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      rows: [],
      warnings: ['No worksheet found in uploaded XLSX file.'],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return {
      rows: [],
      warnings: ['The first worksheet could not be read from the uploaded XLSX file.'],
    };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const rows: ParsedTableRow[] = rawRows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), normalizeCell(value)]),
    ),
  );

  return {
    rows,
    warnings: workbook.SheetNames.length > 1 ? ['Only the first worksheet was imported.'] : [],
  };
}
