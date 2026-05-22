import type { ParsedFileResult, ParsedTableRow } from '../types';

type TableParseOptions = {
  sourceLabel: string;
  rows: unknown[][];
};

type TableParseResult = ParsedFileResult & {
  headerRowIndex: number | null;
  recognizedHeaderScore: number;
};

const CANONICAL_HEADER_ALIASES: Record<string, string[]> = {
  productName: [
    'productname',
    'rawproductname',
    'product',
    'name',
    'item',
    'itemname',
    'description',
    'productdescription',
  ],
  unitPrice: ['unitprice', 'price', 'unitcost'],
  supplierName: ['suppliername', 'supplier', 'vendor', 'vendorname'],
  packDescription: ['packdescription', 'packsize', 'pack'],
  minimumOrderQuantity: [
    'minimumorderquantity',
    'minimumorderqty',
    'minorderqty',
    'minimumquantity',
    'moq',
  ],
  quantityAvailable: [
    'quantityavailable',
    'availablequantity',
    'qtyavailable',
    'stock',
  ],
};

const DIRECT_HEADER_KEYS = [
  'productName',
  'rawProductName',
  'product',
  'name',
  'packDescription',
  'packSize',
  'unitPrice',
  'price',
  'currencyCode',
  'currency',
  'minimumOrderQuantity',
  'minOrderQty',
  'minimumOrderQty',
  'isAvailable',
  'available',
  'supplierName',
  'supplier',
  'warehouseCode',
  'warehouse',
  'snapshotDate',
  'date',
  'quantityOnHand',
  'quantity',
  'quantityReserved',
  'reserved',
  'quantityAvailable',
  'availableQuantity',
  'unitCost',
  'cost',
  'totalValue',
  'inventoryValue',
  'saleDate',
  'customerName',
  'customer',
  'buyerName',
  'units',
  'totalRevenue',
  'revenue',
];

const NORMALIZED_HEADER_TO_CANONICAL = new Map<string, string>();

for (const key of DIRECT_HEADER_KEYS) {
  NORMALIZED_HEADER_TO_CANONICAL.set(normalizeHeaderKey(key), key);
}

for (const [canonicalKey, aliases] of Object.entries(
  CANONICAL_HEADER_ALIASES,
)) {
  NORMALIZED_HEADER_TO_CANONICAL.set(
    normalizeHeaderKey(canonicalKey),
    canonicalKey,
  );

  for (const alias of aliases) {
    NORMALIZED_HEADER_TO_CANONICAL.set(alias, canonicalKey);
  }
}

function normalizeHeaderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function normalizeComparisonValue(value: unknown): string {
  return normalizeCellValue(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function trimTrailingEmpty(values: string[]): string[] {
  const result = [...values];

  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  return result;
}

function countNonEmpty(values: string[]): number {
  return values.filter((value) => value.trim() !== '').length;
}

function scoreHeaderRow(values: string[]): number {
  const nonEmptyValues = values.filter((value) => value.trim() !== '');

  if (nonEmptyValues.length < 2) {
    return -1;
  }

  const recognizedHeaders = new Set<string>();
  const canonicalHeaders = new Set<string>();

  for (const value of nonEmptyValues) {
    const normalized = normalizeHeaderKey(value);

    if (!normalized) {
      continue;
    }

    const canonical = NORMALIZED_HEADER_TO_CANONICAL.get(normalized);

    if (!canonical) {
      continue;
    }

    recognizedHeaders.add(normalized);
    canonicalHeaders.add(canonical);
  }

  if (recognizedHeaders.size === 0) {
    return -1;
  }

  return (
    canonicalHeaders.size * 10 +
    recognizedHeaders.size * 5 +
    nonEmptyValues.length
  );
}

function findHeaderRowIndex(rows: string[][]): {
  index: number | null;
  score: number;
} {
  let bestIndex: number | null = null;
  let bestScore = -1;

  rows.forEach((row, index) => {
    const score = scoreHeaderRow(row);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestScore < 0) {
    const fallbackIndex = rows.findIndex((row) => countNonEmpty(row) >= 2);
    return {
      index: fallbackIndex >= 0 ? fallbackIndex : null,
      score: 0,
    };
  }

  return {
    index: bestIndex,
    score: bestScore,
  };
}

function getCanonicalAlias(header: string): string | null {
  const normalized = normalizeHeaderKey(header);

  if (!normalized) {
    return null;
  }

  return NORMALIZED_HEADER_TO_CANONICAL.get(normalized) ?? null;
}

function buildHeaders(
  rawHeaderRow: string[],
  warnings: string[],
  sourceLabel: string,
): string[] {
  const seen = new Map<string, number>();

  return rawHeaderRow.map((header, index) => {
    if (header.trim() === '') {
      const generatedHeader = `Column ${index + 1}`;
      warnings.push(
        `${sourceLabel}: blank header in column ${index + 1} was replaced with "${generatedHeader}".`,
      );
      return generatedHeader;
    }

    const seenCount = seen.get(header) ?? 0;
    seen.set(header, seenCount + 1);

    if (seenCount === 0) {
      return header;
    }

    const deduplicatedHeader = `${header} (${seenCount + 1})`;
    warnings.push(
      `${sourceLabel}: duplicate header "${header}" was renamed to "${deduplicatedHeader}".`,
    );
    return deduplicatedHeader;
  });
}

function isRepeatedHeaderRow(
  row: string[],
  headerComparison: string[],
): boolean {
  const normalizedRow = trimTrailingEmpty(row.map(normalizeComparisonValue));

  return (
    normalizedRow.length > 0 &&
    normalizedRow.join('|') === headerComparison.join('|')
  );
}

function buildParsedRow(headers: string[], row: string[]): ParsedTableRow {
  const parsedRow: ParsedTableRow = {};

  headers.forEach((header, index) => {
    parsedRow[header] = row[index] ?? '';
  });

  headers.forEach((header, index) => {
    const alias = getCanonicalAlias(header);

    if (!alias || parsedRow[alias] !== undefined) {
      return;
    }

    parsedRow[alias] = row[index] ?? '';
  });

  return parsedRow;
}

export function parseTableRows(options: TableParseOptions): TableParseResult {
  const warnings: string[] = [];
  const rows = options.rows.map((row) => row.map(normalizeCellValue));
  const { index: headerRowIndex, score: recognizedHeaderScore } =
    findHeaderRowIndex(rows);

  if (headerRowIndex === null) {
    return {
      rows: [],
      warnings: [`${options.sourceLabel}: no tabular data could be detected.`],
      headerRowIndex: null,
      recognizedHeaderScore,
    };
  }

  if (headerRowIndex > 0) {
    warnings.push(
      `${options.sourceLabel}: skipped ${headerRowIndex} title row${headerRowIndex === 1 ? '' : 's'} before the detected header.`,
    );
  }

  if (recognizedHeaderScore === 0) {
    warnings.push(
      `${options.sourceLabel}: could not confidently identify a header row; using the first non-empty row.`,
    );
  }

  const headers = buildHeaders(
    rows[headerRowIndex] ?? [],
    warnings,
    options.sourceLabel,
  );
  const headerComparison = trimTrailingEmpty(
    headers.map(normalizeComparisonValue),
  );
  const parsedRows: ParsedTableRow[] = [];
  let repeatedHeaderCount = 0;

  for (const row of rows.slice(headerRowIndex + 1)) {
    if (countNonEmpty(row) === 0) {
      continue;
    }

    if (isRepeatedHeaderRow(row, headerComparison)) {
      repeatedHeaderCount += 1;
      continue;
    }

    parsedRows.push(buildParsedRow(headers, row));
  }

  if (repeatedHeaderCount > 0) {
    warnings.push(
      `${options.sourceLabel}: skipped ${repeatedHeaderCount} repeated header row${repeatedHeaderCount === 1 ? '' : 's'}.`,
    );
  }

  return {
    rows: parsedRows,
    warnings,
    headerRowIndex,
    recognizedHeaderScore,
  };
}
