import path from 'node:path';

import { parseCsvFile } from './csvParser';
import { parseXlsxFile } from './xlsxParser';
import type { ParsedFileResult, UploadFile } from '../types';

function getExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function parseUploadedFile(file: UploadFile): ParsedFileResult {
  const extension = getExtension(file.originalname);

  if (extension === '.csv' || file.mimetype === 'text/csv') {
    return parseCsvFile(file);
  }

  if (
    extension === '.xlsx' ||
    file.mimetype ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return parseXlsxFile(file);
  }

  throw new Error('Unsupported file type. Only CSV and XLSX uploads are supported.');
}
