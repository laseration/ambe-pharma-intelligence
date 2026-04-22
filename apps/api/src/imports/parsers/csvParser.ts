import { parse } from 'csv-parse/sync';

import type { ParsedFileResult, UploadFile } from '../types';
import { parseTableRows } from './tableParser';

export function parseCsvFile(file: UploadFile): ParsedFileResult {
  const records = parse(file.buffer, {
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as unknown[][];

  return parseTableRows({
    sourceLabel: 'CSV import',
    rows: records,
  });
}
