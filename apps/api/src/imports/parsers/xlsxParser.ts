import ExcelJS from 'exceljs';

import type { ParsedFileResult, UploadFile } from '../types';
import { parseTableRows } from './tableParser';

const MAX_XLSX_BYTES = 8 * 1024 * 1024;
const MAX_WORKSHEETS = 20;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLUMNS_PER_SHEET = 80;
const MAX_CELLS_PER_SHEET = MAX_ROWS_PER_SHEET * MAX_COLUMNS_PER_SHEET;

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasUnsafePrototypeKey(value: string): boolean {
  return POLLUTION_KEYS.has(value.trim().toLowerCase());
}

function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    return value;
  }

  if ('formula' in value) {
    return normalizeCellValue(value.result ?? '');
  }

  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }

  if ('text' in value) {
    return value.text;
  }

  if ('hyperlink' in value && 'text' in value) {
    return value.text;
  }

  if ('error' in value) {
    return '';
  }

  return String(value);
}

function worksheetToRows(worksheet: ExcelJS.Worksheet): unknown[][] {
  if (worksheet.rowCount > MAX_ROWS_PER_SHEET) {
    throw new Error(
      `XLSX worksheet "${worksheet.name}" has ${worksheet.rowCount} rows; the limit is ${MAX_ROWS_PER_SHEET}.`,
    );
  }

  if (worksheet.columnCount > MAX_COLUMNS_PER_SHEET) {
    throw new Error(
      `XLSX worksheet "${worksheet.name}" has ${worksheet.columnCount} columns; the limit is ${MAX_COLUMNS_PER_SHEET}.`,
    );
  }

  if (worksheet.rowCount * worksheet.columnCount > MAX_CELLS_PER_SHEET) {
    throw new Error(
      `XLSX worksheet "${worksheet.name}" is too large to import safely.`,
    );
  }

  const rows: unknown[][] = [];

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];

    for (
      let columnNumber = 1;
      columnNumber <= worksheet.columnCount;
      columnNumber += 1
    ) {
      const normalizedValue = normalizeCellValue(
        row.getCell(columnNumber).value,
      );

      if (
        typeof normalizedValue === 'string' &&
        hasUnsafePrototypeKey(normalizedValue)
      ) {
        values.push(`Blocked column ${columnNumber}`);
        continue;
      }

      values.push(normalizedValue);
    }

    rows.push(values);
  }

  return rows;
}

export async function parseXlsxFile(
  file: UploadFile,
): Promise<ParsedFileResult> {
  if (file.size > MAX_XLSX_BYTES || file.buffer.byteLength > MAX_XLSX_BYTES) {
    throw new Error(
      `XLSX file is too large to import safely. Maximum size is ${MAX_XLSX_BYTES} bytes.`,
    );
  }

  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(
      file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new Error('Malformed XLSX file could not be read safely.');
  }

  const worksheets = workbook.worksheets;

  if (worksheets.length === 0) {
    return {
      rows: [],
      warnings: ['No worksheet found in uploaded XLSX file.'],
      detectedColumns: [],
    };
  }

  if (worksheets.length > MAX_WORKSHEETS) {
    throw new Error(
      `XLSX file has ${worksheets.length} worksheets; the limit is ${MAX_WORKSHEETS}.`,
    );
  }

  const parsedSheets = worksheets.map((worksheet) => ({
    sheetName: worksheet.name,
    parsed: parseTableRows({
      sourceLabel: `XLSX sheet "${worksheet.name}"`,
      rows: worksheetToRows(worksheet),
    }),
  }));

  if (parsedSheets.length === 0) {
    return {
      rows: [],
      warnings: ['No readable worksheet found in uploaded XLSX file.'],
      detectedColumns: [],
    };
  }

  const selectedSheet = parsedSheets.reduce((best, current) => {
    const bestScore = best.parsed.recognizedHeaderScore;
    const currentScore = current.parsed.recognizedHeaderScore;

    if (currentScore !== bestScore) {
      return currentScore > bestScore ? current : best;
    }

    if (current.parsed.rows.length !== best.parsed.rows.length) {
      return current.parsed.rows.length > best.parsed.rows.length
        ? current
        : best;
    }

    return current;
  });

  const warnings = [...selectedSheet.parsed.warnings];

  if (worksheets.length > 1) {
    const selectedSheetIndex = worksheets.findIndex(
      (worksheet) => worksheet.name === selectedSheet.sheetName,
    );

    if (selectedSheetIndex > 0) {
      warnings.unshift(
        `Selected worksheet "${selectedSheet.sheetName}" instead of the first sheet because it looked like the best tabular data.`,
      );
    } else {
      warnings.unshift(
        'Imported the worksheet that looked most like tabular data.',
      );
    }
  }

  return {
    rows: selectedSheet.parsed.rows,
    warnings,
    detectedColumns: selectedSheet.parsed.detectedColumns,
  };
}
