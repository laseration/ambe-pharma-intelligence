import XLSX from 'xlsx';

import type { ParsedFileResult, UploadFile } from '../types';
import { parseTableRows } from './tableParser';

export function parseXlsxFile(file: UploadFile): ParsedFileResult {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    return {
      rows: [],
      warnings: ['No worksheet found in uploaded XLSX file.'],
    };
  }

  const parsedSheets = sheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return [];
    }

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });

    return [
      {
        sheetName,
        parsed: parseTableRows({
          sourceLabel: `XLSX sheet "${sheetName}"`,
          rows: rawRows,
        }),
      },
    ];
  });

  if (parsedSheets.length === 0) {
    return {
      rows: [],
      warnings: ['No readable worksheet found in uploaded XLSX file.'],
    };
  }

  const selectedSheet = parsedSheets.reduce((best, current) => {
    const bestScore = best.parsed.recognizedHeaderScore;
    const currentScore = current.parsed.recognizedHeaderScore;

    if (currentScore !== bestScore) {
      return currentScore > bestScore ? current : best;
    }

    if (current.parsed.rows.length !== best.parsed.rows.length) {
      return current.parsed.rows.length > best.parsed.rows.length ? current : best;
    }

    return current;
  });

  const warnings = [...selectedSheet.parsed.warnings];

  if (sheetNames.length > 1) {
    const selectedSheetIndex = sheetNames.indexOf(selectedSheet.sheetName);

    if (selectedSheetIndex > 0) {
      warnings.unshift(
        `Selected worksheet "${selectedSheet.sheetName}" instead of the first sheet because it looked like the best tabular data.`,
      );
    } else {
      warnings.unshift('Imported the worksheet that looked most like tabular data.');
    }
  }

  return {
    rows: selectedSheet.parsed.rows,
    warnings,
  };
}
