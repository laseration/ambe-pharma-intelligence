import { Prisma } from '@prisma/client';

import type { ParsedTableRow, RowIssue } from '../types';

type ParseContext = {
  rowNumber: number;
  rawRow: ParsedTableRow;
  issues: RowIssue[];
};

export function createValidationContext(
  rowNumber: number,
  rawRow: ParsedTableRow,
): ParseContext {
  return {
    rowNumber,
    rawRow,
    issues: [],
  };
}

export function getIssues(context: ParseContext): RowIssue[] {
  return context.issues;
}

export function addIssue(
  context: ParseContext,
  message: string,
  fieldName?: string,
): void {
  context.issues.push({
    rowNumber: context.rowNumber,
    fieldName,
    message,
    rawRow: context.rawRow,
  });
}

/**
 * Parse a spreadsheet cell as a plain decimal integer. Accepts an optional sign
 * and trailing-zero fraction ("100", "-5", "100.0"); rejects scientific ("1e3"),
 * hex ("0x10"), binary/octal, and non-integers — `Number()` would otherwise
 * silently coerce those into surprising values.
 */
function parseIntegerCell(value: string): number | null {
  if (!/^[+-]?\d+(\.0+)?$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function findValue(rawRow: ParsedTableRow, keys: string[]): string {
  for (const key of keys) {
    const direct = rawRow[key];

    if (direct !== undefined && direct !== '') {
      return direct;
    }

    const matchedKey = Object.keys(rawRow).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );

    if (matchedKey && rawRow[matchedKey] !== '') {
      return rawRow[matchedKey] ?? '';
    }
  }

  return '';
}

export function requireString(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): string | null {
  const value = findValue(context.rawRow, keys).trim();

  if (!value) {
    addIssue(context, `${fieldName} is required.`, fieldName);
    return null;
  }

  return value;
}

export function optionalString(
  context: ParseContext,
  keys: string[],
): string | null {
  const value = findValue(context.rawRow, keys).trim();

  return value || null;
}

export function optionalInteger(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): number | null {
  const value = findValue(context.rawRow, keys).trim();

  if (!value) {
    return null;
  }

  const parsed = parseIntegerCell(value);

  if (parsed === null) {
    addIssue(context, `${fieldName} must be an integer.`, fieldName);
    return null;
  }

  return parsed;
}

export function requireInteger(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): number | null {
  const value = requireString(context, keys, fieldName);

  if (value === null) {
    return null;
  }

  const parsed = parseIntegerCell(value);

  if (parsed === null) {
    addIssue(context, `${fieldName} must be an integer.`, fieldName);
    return null;
  }

  return parsed;
}

export function optionalDecimal(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): Prisma.Decimal | null {
  const value = findValue(context.rawRow, keys).trim();

  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, '');
  const parsed = Number(normalized);

  // `Number.isFinite` (not `Number.isNaN`) also rejects "Infinity"/"-Infinity",
  // which would otherwise build a Prisma.Decimal that explodes at persistence.
  if (!Number.isFinite(parsed)) {
    addIssue(context, `${fieldName} must be a number.`, fieldName);
    return null;
  }

  return new Prisma.Decimal(normalized);
}

export function requireDecimal(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): Prisma.Decimal | null {
  const value = requireString(context, keys, fieldName);

  if (value === null) {
    return null;
  }

  const normalized = value.replace(/,/g, '');
  const parsed = Number(normalized);

  // `Number.isFinite` (not `Number.isNaN`) also rejects "Infinity"/"-Infinity",
  // which would otherwise build a Prisma.Decimal that explodes at persistence.
  if (!Number.isFinite(parsed)) {
    addIssue(context, `${fieldName} must be a number.`, fieldName);
    return null;
  }

  return new Prisma.Decimal(normalized);
}

export function optionalDate(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): Date | null {
  const value = findValue(context.rawRow, keys).trim();

  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    addIssue(context, `${fieldName} must be a valid date.`, fieldName);
    return null;
  }

  return date;
}

export function requireDate(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): Date | null {
  const value = requireString(context, keys, fieldName);

  if (value === null) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    addIssue(context, `${fieldName} must be a valid date.`, fieldName);
    return null;
  }

  return date;
}

export function optionalBoolean(
  context: ParseContext,
  keys: string[],
  fieldName: string,
): boolean | null {
  const value = findValue(context.rawRow, keys).trim().toLowerCase();

  if (!value) {
    return null;
  }

  if (['true', 'yes', '1', 'y'].includes(value)) {
    return true;
  }

  if (['false', 'no', '0', 'n'].includes(value)) {
    return false;
  }

  addIssue(context, `${fieldName} must be a boolean value.`, fieldName);
  return null;
}
