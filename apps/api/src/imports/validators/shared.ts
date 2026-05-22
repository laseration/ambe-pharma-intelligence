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

function addIssue(
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

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
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

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
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

  if (Number.isNaN(parsed)) {
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

  if (Number.isNaN(parsed)) {
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
