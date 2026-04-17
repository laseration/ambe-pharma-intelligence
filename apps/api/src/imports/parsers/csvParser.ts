import { parse } from 'csv-parse/sync';

import type { ParsedFileResult, ParsedTableRow, UploadFile } from '../types';

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

export function parseCsvFile(file: UploadFile): ParsedFileResult {
  const records = parse(file.buffer, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  const rows: ParsedTableRow[] = records.map((record) =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key.trim(), normalizeCell(value)]),
    ),
  );

  return {
    rows,
    warnings: [],
  };
}
