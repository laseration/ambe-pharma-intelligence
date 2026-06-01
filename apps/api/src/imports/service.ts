import { Prisma, type Product } from '@prisma/client';

import { db } from '../lib/db';
import { opportunityConfig } from '../opportunities/config';
import { normalizeText } from './normalization';
import { parseUploadedFile } from './parsers';
import {
  determineProductMatchDecision,
  evaluateNewProductAutoCreationEligibility,
  findMatchingAliasVariant,
} from './productMatching';
import { logger } from '../lib/logger';
import type {
  ImportResponse,
  ImportSummary,
  ParsedColumn,
  InventoryImportRequest,
  InventoryRowInput,
  ParsedFileResult,
  ParsedTableRow,
  RowIssue,
  SalesImportRequest,
  SalesRowInput,
  SupplierPriceListImportRequest,
  SupplierPriceListRowInput,
  ProductMatchDecision,
  ProductCandidates,
  ProductPriceIntelligence,
} from './types';
import {
  validateInventoryRows,
  validateSalesRows,
  validateSupplierPriceRows,
} from './validators';

type DbClient = typeof db | Prisma.TransactionClient;
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export type ImportBatchListItem = {
  id: string;
  kind: 'SUPPLIER_PRICE_LIST' | 'INVENTORY' | 'SALES';
  status: string;
  fileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  errorCount: number;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportBatchErrorItem = {
  id: string;
  rowNumber: number | null;
  fieldName: string | null;
  message: string;
  rawRow: Prisma.JsonValue | null;
  createdAt: Date;
};

export type ImportWarningCategory = {
  category:
    | 'header'
    | 'worksheet'
    | 'empty-data'
    | 'duplicate-header'
    | 'format'
    | 'other';
  count: number;
  messages: string[];
};

export type ImportProductMatchingSummary = {
  candidateConfidence: {
    high: number;
    medium: number;
    low: number;
  };
  duplicateCandidateGroups: Array<{
    normalizedKey: string;
    rowNumbers: number[];
    rawProductNames: string[];
  }>;
};

export type ImportDataQualityMetrics = {
  invalidRows: number;
  unresolvedProducts: number;
  duplicateCandidates: number;
};

export type ImportDiagnostics = {
  detectedColumns: ParsedColumn[];
  warningCategories: ImportWarningCategory[];
  suggestedFixes: string[];
  dataQualityMetrics: ImportDataQualityMetrics;
  productMatchingSummary: ImportProductMatchingSummary;
};

export type ImportBatchDetail = ImportBatchListItem & {
  warnings: string[];
  errors: ImportBatchErrorItem[];
  diagnostics: ImportDiagnostics;
};

type ImportDataRow =
  | SupplierPriceListRowInput
  | InventoryRowInput
  | SalesRowInput;

function buildSummary(
  totalRows: number,
  validRows: number,
  invalidRows: number,
  warnings: string[],
): ImportSummary {
  return {
    totalRows,
    validRows,
    invalidRows,
    warnings,
  };
}

function countWarnings(warnings: Prisma.JsonValue | null | undefined): number {
  return Array.isArray(warnings) ? warnings.length : 0;
}

function extractWarnings(
  warnings: Prisma.JsonValue | null | undefined,
  take = 10,
): string[] {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings
    .filter(
      (warning): warning is string =>
        typeof warning === 'string' && warning.trim().length > 0,
    )
    .slice(0, take);
}

function categorizeWarning(message: string): ImportWarningCategory['category'] {
  const normalized = message.toLowerCase();

  if (normalized.includes('worksheet')) {
    return 'worksheet';
  }
  if (
    normalized.includes('blank header') ||
    normalized.includes('header row')
  ) {
    return 'header';
  }
  if (normalized.includes('duplicate header')) {
    return 'duplicate-header';
  }
  if (normalized.includes('no tabular data')) {
    return 'empty-data';
  }
  if (normalized.includes('could not confidently')) {
    return 'format';
  }

  return 'other';
}

function buildWarningCategories(warnings: string[]): ImportWarningCategory[] {
  const grouped = new Map<ImportWarningCategory['category'], string[]>();

  for (const warning of warnings) {
    const category = categorizeWarning(warning);
    const existing = grouped.get(category) ?? [];
    existing.push(warning);
    grouped.set(category, existing);
  }

  return Array.from(grouped.entries()).map(([category, messages]) => ({
    category,
    count: messages.length,
    messages: messages.slice(0, 3),
  }));
}

function buildProductMatchingSummary(
  rows: ImportDataRow[],
): ImportProductMatchingSummary {
  const confidence = {
    high: 0,
    medium: 0,
    low: 0,
  };
  const byNormalizedKey = new Map<
    string,
    { rowNumbers: number[]; rawProductNames: Set<string> }
  >();

  for (const row of rows) {
    switch (row.productCandidates.confidence) {
      case 'HIGH':
        confidence.high += 1;
        break;
      case 'MEDIUM':
        confidence.medium += 1;
        break;
      case 'LOW':
        confidence.low += 1;
        break;
    }

    const existing = byNormalizedKey.get(
      row.productCandidates.normalizedKey,
    ) ?? {
      rowNumbers: [],
      rawProductNames: new Set<string>(),
    };
    existing.rowNumbers.push(row.rowNumber);
    existing.rawProductNames.add(row.rawProductName);
    byNormalizedKey.set(row.productCandidates.normalizedKey, existing);
  }

  return {
    candidateConfidence: confidence,
    duplicateCandidateGroups: Array.from(byNormalizedKey.entries())
      .filter(([, value]) => value.rowNumbers.length > 1)
      .map(([normalizedKey, value]) => ({
        normalizedKey,
        rowNumbers: value.rowNumbers.slice(0, 10),
        rawProductNames: Array.from(value.rawProductNames).slice(0, 5),
      }))
      .slice(0, 10),
  };
}

function isUnresolvedProductError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('needs product review') ||
    normalized.includes('no safe existing product match') ||
    normalized.includes('auto-creation blocked') ||
    normalized.includes('matched product') ||
    normalized.includes('product review')
  );
}

function buildSuggestedFixes(
  kind: ImportBatchListItem['kind'],
  parsed: ParsedFileResult,
  errors: RowIssue[],
  productMatchingSummary: ImportProductMatchingSummary,
): string[] {
  const fixes = new Set<string>();
  const fields = new Set(
    errors
      .map((error) => error.fieldName)
      .filter((field): field is string => Boolean(field)),
  );
  const warnings = parsed.warnings.join(' ').toLowerCase();

  if (parsed.detectedColumns.length === 0) {
    fixes.add(
      'Use a CSV or XLSX file with one clear header row and at least one data row.',
    );
  }
  if (warnings.includes('could not confidently identify a header row')) {
    fixes.add(
      'Rename columns to one of the documented template headers so the parser can map fields confidently.',
    );
  }
  if (fields.has('productName')) {
    fixes.add(
      'Add a product name/description column and make sure every data row has a value.',
    );
  }
  if (fields.has('unitPrice')) {
    fixes.add('Use numeric unit prices without currency symbols or text.');
  }
  if (fields.has('quantity') || fields.has('quantityOnHand')) {
    fixes.add('Use whole numbers for quantity fields.');
  }
  if (fields.has('snapshotDate') || fields.has('saleDate')) {
    fixes.add('Use ISO dates such as 2026-04-30 for date columns.');
  }
  if (fields.has('warehouseCode')) {
    fixes.add('Add a warehouseCode column for inventory imports.');
  }
  if (fields.has('customerName')) {
    fixes.add('Add a customerName column for sales imports.');
  }
  if (errors.some((error) => isUnresolvedProductError(error.message))) {
    fixes.add(
      'Review product names that could not be safely matched; add clearer strength, form, pack size, or a known alias before re-importing.',
    );
  }
  if (productMatchingSummary.duplicateCandidateGroups.length > 0) {
    fixes.add(
      'Check duplicate product candidate groups before re-importing; repeated normalized product keys may indicate duplicate rows or aliases.',
    );
  }
  if (kind === 'SUPPLIER_PRICE_LIST') {
    fixes.add(
      'For supplier price lists, provide supplierName in the upload form or include a supplierName column.',
    );
  }

  return Array.from(fixes).slice(0, 8);
}

export function buildImportDiagnostics(
  kind: ImportBatchListItem['kind'],
  parsed: ParsedFileResult,
  validRows: ImportDataRow[],
  errors: RowIssue[],
): ImportDiagnostics {
  const productMatchingSummary = buildProductMatchingSummary(validRows);
  const unresolvedProducts = errors.filter((error) =>
    isUnresolvedProductError(error.message),
  ).length;

  return {
    detectedColumns: parsed.detectedColumns,
    warningCategories: buildWarningCategories(parsed.warnings),
    suggestedFixes: buildSuggestedFixes(
      kind,
      parsed,
      errors,
      productMatchingSummary,
    ),
    dataQualityMetrics: {
      invalidRows: errors.length,
      unresolvedProducts,
      duplicateCandidates:
        productMatchingSummary.duplicateCandidateGroups.reduce(
          (total, group) => total + group.rowNumbers.length,
          0,
        ),
    },
    productMatchingSummary,
  };
}

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|authorization|connection|string)/i;

const SENSITIVE_VALUE_PATTERN =
  /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{8,}|password\s*=|api[_-]?key\s*=|client_secret\s*=)/i;

function redactImportValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string' && SENSITIVE_VALUE_PATTERN.test(value)) {
    return '[REDACTED]';
  }
  return value;
}

export function redactImportRawRow(value: Prisma.JsonValue | null): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => [
      key,
      redactImportValue(key, rawValue),
    ]),
  );
}

function fallbackImportDiagnostics(
  batch: Pick<
    ImportBatchDetail,
    'kind' | 'invalidRows' | 'errors' | 'warnings'
  > & { diagnostics?: Prisma.JsonValue | null },
): ImportDiagnostics {
  if (
    batch.diagnostics &&
    typeof batch.diagnostics === 'object' &&
    !Array.isArray(batch.diagnostics)
  ) {
    return batch.diagnostics as unknown as ImportDiagnostics;
  }

  return {
    detectedColumns: [],
    warningCategories: buildWarningCategories(batch.warnings),
    suggestedFixes: batch.errors.length
      ? ['Open the row error samples, fix the invalid fields, then re-import.']
      : [],
    dataQualityMetrics: {
      invalidRows: batch.invalidRows,
      unresolvedProducts: batch.errors.filter((error) =>
        isUnresolvedProductError(error.message),
      ).length,
      duplicateCandidates: 0,
    },
    productMatchingSummary: {
      candidateConfidence: {
        high: 0,
        medium: 0,
        low: 0,
      },
      duplicateCandidateGroups: [],
    },
  };
}

export async function listRecentImportBatches(
  take = 20,
): Promise<ImportBatchListItem[]> {
  const batches = await db.importBatch.findMany({
    orderBy: { uploadedAt: 'desc' },
    take,
    select: {
      id: true,
      kind: true,
      status: true,
      fileName: true,
      fileMimeType: true,
      fileSizeBytes: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      warnings: true,
      diagnostics: true,
      uploadedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          errors: true,
        },
      },
    },
  });

  return batches.map((batch) => ({
    id: batch.id,
    kind: batch.kind,
    status: batch.status,
    fileName: batch.fileName,
    fileMimeType: batch.fileMimeType,
    fileSizeBytes: batch.fileSizeBytes,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    warningCount: countWarnings(batch.warnings),
    errorCount: batch._count.errors,
    uploadedAt: batch.uploadedAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  }));
}

export async function getImportBatchDetail(
  importBatchId: string,
  errorTake = 10,
): Promise<ImportBatchDetail | null> {
  const batch = await db.importBatch.findUnique({
    where: { id: importBatchId },
    select: {
      id: true,
      kind: true,
      status: true,
      fileName: true,
      fileMimeType: true,
      fileSizeBytes: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      warnings: true,
      diagnostics: true,
      uploadedAt: true,
      createdAt: true,
      updatedAt: true,
      errors: {
        orderBy: [{ rowNumber: 'asc' }, { createdAt: 'asc' }],
        take: errorTake,
        select: {
          id: true,
          rowNumber: true,
          fieldName: true,
          message: true,
          rawRow: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          errors: true,
        },
      },
    },
  });

  if (!batch) {
    return null;
  }

  return {
    id: batch.id,
    kind: batch.kind,
    status: batch.status,
    fileName: batch.fileName,
    fileMimeType: batch.fileMimeType,
    fileSizeBytes: batch.fileSizeBytes,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    warningCount: countWarnings(batch.warnings),
    errorCount: batch._count.errors,
    warnings: extractWarnings(batch.warnings),
    uploadedAt: batch.uploadedAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    errors: batch.errors.map((error) => ({
      id: error.id,
      rowNumber: error.rowNumber,
      fieldName: error.fieldName,
      message: error.message,
      rawRow: redactImportRawRow(error.rawRow) as Prisma.JsonValue,
      createdAt: error.createdAt,
    })),
    diagnostics: fallbackImportDiagnostics({
      kind: batch.kind,
      invalidRows: batch.invalidRows,
      warnings: extractWarnings(batch.warnings, 100),
      errors: batch.errors.map((error) => ({
        id: error.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: redactImportRawRow(error.rawRow) as Prisma.JsonValue,
        createdAt: error.createdAt,
      })),
      diagnostics: batch.diagnostics,
    }),
  };
}

async function createImportBatch(
  kind: 'SUPPLIER_PRICE_LIST' | 'INVENTORY' | 'SALES',
  file: SupplierPriceListImportRequest['file'],
  summary: ImportSummary,
  errors: RowIssue[],
  diagnostics: ImportDiagnostics,
) {
  return db.importBatch.create({
    data: {
      kind,
      status: errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      fileSizeBytes: file.size,
      totalRows: summary.totalRows,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows,
      warnings: summary.warnings,
      diagnostics: diagnostics as unknown as Prisma.InputJsonValue,
      errors: {
        create: errors.map((error) => ({
          rowNumber: error.rowNumber,
          fieldName: error.fieldName,
          message: error.message,
          rawRow: error.rawRow,
        })),
      },
    },
  });
}

function roundNumber(value: number | null, precision = 4): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  return value.toNumber();
}

function toDecimal(value: number | null): Prisma.Decimal | null {
  if (value === null) {
    return null;
  }

  return new Prisma.Decimal(roundNumber(value, 2) ?? value);
}

function calculatePriceDeltaFromMarketPct(
  currentPrice: number | null,
  marketPrice: number | null,
): number | null {
  if (currentPrice === null || marketPrice === null || marketPrice <= 0) {
    return null;
  }

  return roundNumber((currentPrice - marketPrice) / marketPrice);
}

function calculateVolatilityScore(prices: number[]): number | null {
  if (prices.length === 0) {
    return null;
  }

  if (prices.length === 1) {
    return 0;
  }

  const averagePrice =
    prices.reduce((total, price) => total + price, 0) / prices.length;
  if (averagePrice <= 0) {
    return null;
  }

  const variance =
    prices.reduce((total, price) => total + (price - averagePrice) ** 2, 0) /
    prices.length;
  return roundNumber(clamp(Math.sqrt(variance) / averagePrice, 0, 1));
}

function calculateMarketConfidence(
  sampleCount: number,
  latestObservedAt: Date | null,
  prices: number[],
  referenceDate: Date,
): number | null {
  if (sampleCount === 0 || !latestObservedAt || prices.length === 0) {
    return null;
  }

  const sampleScore = clamp(
    sampleCount / Math.max(1, opportunityConfig.marketMinSampleCount),
    0,
    1,
  );
  const latestAgeDays = Math.max(
    0,
    (referenceDate.getTime() - latestObservedAt.getTime()) /
      MILLISECONDS_PER_DAY,
  );
  const recencyScore = clamp(
    1 - latestAgeDays / Math.max(1, opportunityConfig.marketLookbackDays),
    0,
    1,
  );
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice =
    prices.reduce((total, price) => total + price, 0) / prices.length;
  const spreadConsistency =
    averagePrice > 0
      ? clamp(1 - (maxPrice - minPrice) / averagePrice, 0, 1)
      : 0;

  return roundNumber(
    sampleScore * (0.5 + 0.3 * recencyScore + 0.2 * spreadConsistency),
  );
}

function buildProductPriceIntelligence(
  observations: Array<{ createdAt: Date; unitPrice: number }>,
  currentUnitPrice: number | null,
  referenceDate: Date,
): ProductPriceIntelligence {
  const prices = observations.map((observation) => observation.unitPrice);
  const latestObservedPrice = observations[0]?.unitPrice ?? null;
  const rollingAveragePrice =
    prices.length > 0
      ? roundNumber(
          prices.reduce((total, price) => total + price, 0) / prices.length,
        )
      : null;
  const bestObservedPrice =
    prices.length > 0 ? roundNumber(Math.min(...prices)) : null;
  const weightedTotals = observations.reduce(
    (totals, observation) => {
      const ageDays = Math.max(
        0,
        (referenceDate.getTime() - observation.createdAt.getTime()) /
          MILLISECONDS_PER_DAY,
      );
      const weight =
        1 /
        (1 + ageDays / Math.max(1, opportunityConfig.marketRecentWeightDays));

      return {
        weightTotal: totals.weightTotal + weight,
        weightedPriceTotal:
          totals.weightedPriceTotal + observation.unitPrice * weight,
      };
    },
    {
      weightTotal: 0,
      weightedPriceTotal: 0,
    },
  );
  const simulatedMarketPrice =
    weightedTotals.weightTotal > 0
      ? roundNumber(
          weightedTotals.weightedPriceTotal / weightedTotals.weightTotal,
        )
      : null;

  return {
    latestObservedPrice,
    rollingAveragePrice,
    bestObservedPrice,
    simulatedMarketPrice,
    marketConfidence: calculateMarketConfidence(
      observations.length,
      observations[0]?.createdAt ?? null,
      prices,
      referenceDate,
    ),
    volatilityScore: calculateVolatilityScore(prices),
    sampleCount: observations.length,
    priceDeltaFromMarketPct: calculatePriceDeltaFromMarketPct(
      currentUnitPrice,
      simulatedMarketPrice,
    ),
  };
}

async function loadRecentProductPriceIntelligence(
  productId: string,
  currencyCode: string,
  currentUnitPrice: number | null,
  client: DbClient = db,
) {
  const lookbackStart = new Date(
    Date.now() - opportunityConfig.marketLookbackDays * MILLISECONDS_PER_DAY,
  );
  const recentPrices = await client.supplierPriceItem.findMany({
    where: {
      productId,
      currencyCode,
      isAvailable: true,
      createdAt: {
        gte: lookbackStart,
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      createdAt: true,
      unitPrice: true,
    },
  });

  return buildProductPriceIntelligence(
    recentPrices.map((price) => ({
      createdAt: price.createdAt,
      unitPrice: price.unitPrice.toNumber(),
    })),
    currentUnitPrice,
    new Date(),
  );
}

function getStructuredCompatibility(
  product: Product,
  candidates: ProductCandidates,
) {
  const conflictFields: Array<'strength' | 'formulation' | 'packSize'> = [];

  if (
    product.strength &&
    candidates.strength &&
    product.strength !== candidates.strength
  ) {
    conflictFields.push('strength');
  }

  if (
    product.dosageForm &&
    candidates.formulation &&
    product.dosageForm !== candidates.formulation
  ) {
    conflictFields.push('formulation');
  }

  if (
    product.packSize &&
    candidates.packSize &&
    product.packSize !== candidates.packSize
  ) {
    conflictFields.push('packSize');
  }

  return {
    compatible: conflictFields.length === 0,
    conflictFields,
  };
}

function countStructuredMatches(
  product: Product,
  candidates: ProductCandidates,
): number {
  return [
    product.strength &&
      candidates.strength &&
      product.strength === candidates.strength,
    product.dosageForm &&
      candidates.formulation &&
      product.dosageForm === candidates.formulation,
    product.packSize &&
      candidates.packSize &&
      product.packSize === candidates.packSize,
  ].filter(Boolean).length;
}

async function findStructuredBaseNameProductMatch(
  candidates: ProductCandidates,
  client: DbClient = db,
): Promise<Product | null> {
  const candidateBaseName = candidates.baseName.trim();
  const structuredSignalCount = [
    candidates.strength,
    candidates.formulation,
    candidates.packSize,
  ].filter(Boolean).length;

  if (!candidateBaseName || structuredSignalCount === 0) {
    return null;
  }

  const matches = await client.product.findMany({
    where: {
      // Prefer baseName for current records, but keep normalizedName base-name lookup
      // for compatibility with products created before baseName was populated consistently.
      OR: [
        { baseName: candidateBaseName },
        { normalizedName: candidateBaseName },
      ],
    },
  });

  const compatibleMatches = matches
    .map((product) => ({
      product,
      compatibility: getStructuredCompatibility(product, candidates),
      exactStructuredMatches: countStructuredMatches(product, candidates),
      prefersBaseNameField: product.baseName === candidateBaseName,
    }))
    .filter(
      (entry) =>
        entry.compatibility.compatible && entry.exactStructuredMatches > 0,
    )
    .sort((left, right) => {
      if (
        Number(left.prefersBaseNameField) !== Number(right.prefersBaseNameField)
      ) {
        return (
          Number(right.prefersBaseNameField) - Number(left.prefersBaseNameField)
        );
      }

      return right.exactStructuredMatches - left.exactStructuredMatches;
    });

  return compatibleMatches[0]?.product ?? null;
}

async function findProductByStoredCanonicalField(
  storedCanonicalField: string,
  client: DbClient = db,
): Promise<Product | null> {
  // Product.normalizedName currently stores the composite normalized key persisted by imports.
  return client.product.findFirst({
    where: { normalizedName: storedCanonicalField },
  });
}

async function updateProductCanonicalFields(
  product: Product,
  candidates: ProductCandidates,
  manufacturer: string | null | undefined,
  client: DbClient = db,
): Promise<Product> {
  const data: Prisma.ProductUpdateInput = {};

  if (manufacturer?.trim() && !product.manufacturer) {
    data.manufacturer = manufacturer.trim();
  }

  if (candidates.baseName && !product.baseName) {
    data.baseName = candidates.baseName;
  }

  if (Object.keys(data).length === 0) {
    return product;
  }

  return client.product.update({
    where: { id: product.id },
    data,
  });
}

async function applySupplierReliabilityFeedback(
  supplierId: string,
  productId: string,
  saleDate: Date,
  saleUnitPrice: Prisma.Decimal,
  currencyCode: string,
  client: DbClient = db,
) {
  const recentSupplierPrice = await client.supplierPriceItem.findFirst({
    where: {
      supplierId,
      productId,
      currencyCode,
      createdAt: {
        gte: new Date(
          saleDate.getTime() -
            opportunityConfig.marketLookbackDays * MILLISECONDS_PER_DAY,
        ),
        lte: saleDate,
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      unitPrice: true,
      marketPriceEstimate: true,
      marketPriceConfidence: true,
      priceDeltaFromMarketPct: true,
    },
  });

  if (!recentSupplierPrice) {
    return;
  }

  const saleUnitPriceNumber = saleUnitPrice.toNumber();
  const supplierUnitPrice = recentSupplierPrice.unitPrice.toNumber();
  if (saleUnitPriceNumber <= 0 || supplierUnitPrice <= 0) {
    return;
  }

  const realizedMarginPct =
    (saleUnitPriceNumber - supplierUnitPrice) / saleUnitPriceNumber;
  const marketPriceEstimate = toNumber(recentSupplierPrice.marketPriceEstimate);
  const priceDeltaFromMarketPct =
    recentSupplierPrice.priceDeltaFromMarketPct ??
    calculatePriceDeltaFromMarketPct(supplierUnitPrice, marketPriceEstimate);

  let adjustment = 0;

  if (
    realizedMarginPct >= opportunityConfig.pushMinMarginVsMarketPct &&
    (priceDeltaFromMarketPct === null || priceDeltaFromMarketPct <= 0)
  ) {
    adjustment = opportunityConfig.supplierReliabilityAdjustmentStep;
  } else if (
    realizedMarginPct < 0 &&
    (recentSupplierPrice.marketPriceConfidence ?? 0) >=
      opportunityConfig.marketConfidenceMinForBuy
  ) {
    adjustment = -opportunityConfig.supplierReliabilityAdjustmentStep;
  }

  if (adjustment === 0) {
    return;
  }

  const supplier = await client.supplier.findUnique({
    where: { id: supplierId },
    select: {
      reliabilityScore: true,
    },
  });

  if (!supplier) {
    return;
  }

  const nextReliabilityScore = roundNumber(
    clamp(supplier.reliabilityScore + adjustment, 0, 1),
  );

  if (
    nextReliabilityScore === null ||
    nextReliabilityScore === supplier.reliabilityScore
  ) {
    return;
  }

  await client.supplier.update({
    where: { id: supplierId },
    data: {
      reliabilityScore: nextReliabilityScore,
    },
  });
}

export async function findOrCreateSupplier(
  rawSupplierName: string,
  client: DbClient = db,
) {
  const normalizedName = normalizeText(rawSupplierName);

  const existing = await client.supplier.findUnique({
    where: { normalizedName },
  });

  if (existing) {
    return existing;
  }

  return client.supplier.create({
    data: {
      name: rawSupplierName,
      normalizedName,
    },
  });
}

async function findOrCreateCustomer(
  rawCustomerName: string,
  client: DbClient = db,
) {
  const normalizedName = normalizeText(rawCustomerName);

  const existing = await client.customer.findUnique({
    where: { normalizedName },
  });

  if (existing) {
    return existing;
  }

  return client.customer.create({
    data: {
      name: rawCustomerName,
      normalizedName,
    },
  });
}

async function ensureProductAlias(
  productId: string,
  rawProductName: string,
  sourceSystem: string,
  client: DbClient = db,
) {
  const exactRawAlias = await client.productAlias.findFirst({
    where: {
      productId,
      aliasName: rawProductName,
    },
  });

  if (exactRawAlias) {
    return exactRawAlias;
  }

  const existingAliasesForProduct = await client.productAlias.findMany({
    where: {
      productId,
    },
  });
  const existingAliasVariant = findMatchingAliasVariant(
    existingAliasesForProduct,
    rawProductName,
  );

  if (existingAliasVariant.alias) {
    return existingAliasVariant.alias;
  }

  return client.productAlias.create({
    data: {
      productId,
      aliasName: rawProductName,
      sourceSystem,
    },
  });
}

function logProductMatchDecision(
  decision: ProductMatchDecision,
  matchedProductId: string | null,
  rulesApplied: string[],
) {
  logger.info('Import product match decision', {
    outcome: decision.outcome,
    reasonCode: decision.reasonCode,
    rawProductName: decision.rawProductName,
    normalizedKey: decision.normalizedKey,
    normalizedName: decision.normalizedName,
    confidence: decision.confidence,
    matchedProductId,
    aliasMatchType: decision.aliasMatchType ?? null,
    structuredCompatibilityChecked:
      decision.structuredCompatibility?.checked ?? false,
    structuredCompatibilityPassed:
      decision.structuredCompatibility?.compatible ?? true,
    structuredCompatibilityConflictFields:
      decision.structuredCompatibility?.conflictFields ?? [],
    rulesApplied,
  });
}

export async function findOrCreateProduct(
  rawProductName: string,
  candidates: SupplierPriceListRowInput['productCandidates'],
  sourceSystem: string,
  manufacturer?: string | null,
  client: DbClient = db,
) {
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async (storedCanonicalField) =>
        findProductByStoredCanonicalField(storedCanonicalField, client),
      findAliasByRawName: async (aliasName) =>
        client.productAlias.findFirst({
          where: { aliasName },
          include: {
            product: true,
          },
        }),
      listAliasesForCanonicalComparison: async () =>
        client.productAlias.findMany({
          include: {
            product: true,
          },
        }),
    },
    {
      rawProductName,
      candidates,
    },
  );

  if (decision.matchedProductId) {
    const existingProduct = await client.product.findUnique({
      where: { id: decision.matchedProductId },
    });

    if (!existingProduct) {
      throw new Error(
        `Matched product ${decision.matchedProductId} was not found during persistence.`,
      );
    }

    const existing = await updateProductCanonicalFields(
      existingProduct,
      candidates,
      manufacturer,
      client,
    );

    await ensureProductAlias(existing.id, rawProductName, sourceSystem, client);
    logProductMatchDecision(
      decision,
      existing.id,
      candidates.explanation.rulesApplied,
    );
    return existing;
  }

  const structuredBaseNameMatch = await findStructuredBaseNameProductMatch(
    candidates,
    client,
  );

  if (structuredBaseNameMatch) {
    const matchedProduct = await updateProductCanonicalFields(
      structuredBaseNameMatch,
      candidates,
      manufacturer,
      client,
    );

    await ensureProductAlias(
      matchedProduct.id,
      rawProductName,
      sourceSystem,
      client,
    );
    logProductMatchDecision(
      {
        outcome: 'EXISTING_PRODUCT',
        matchedProductId: matchedProduct.id,
        reasonCode: 'STRUCTURED_BASE_NAME_MATCH',
        normalizedKey: candidates.normalizedKey,
        normalizedName: candidates.normalizedName,
        rawProductName,
        confidence: candidates.confidence,
        structuredCompatibility: {
          checked: true,
          compatible: true,
          conflictFields: [],
        },
      },
      matchedProduct.id,
      candidates.explanation.rulesApplied,
    );

    return matchedProduct;
  }

  const autoCreationEligibility = evaluateNewProductAutoCreationEligibility({
    rawProductName,
    candidates,
  });

  if (!autoCreationEligibility.allowed) {
    logProductMatchDecision(
      decision,
      null,
      candidates.explanation.rulesApplied,
    );
    logger.warn('Import product auto-creation blocked', {
      rawProductName,
      normalizedKey: candidates.normalizedKey,
      normalizedName: candidates.normalizedName,
      confidence: candidates.confidence,
      manufacturer: manufacturer?.trim() || null,
      reason: autoCreationEligibility.reason,
      rulesApplied: candidates.explanation.rulesApplied,
    });

    throw new Error(
      autoCreationEligibility.reason ??
        'No safe existing product match was found. This row needs product review before catalog creation.',
    );
  }

  const product = await client.product.create({
    data: {
      name: rawProductName,
      // Current schema persists the composite normalized key in Product.normalizedName.
      normalizedName: candidates.normalizedKey,
      baseName: candidates.baseName,
      manufacturer: manufacturer?.trim() || null,
      strength: candidates.strength,
      dosageForm: candidates.formulation,
      packSize: candidates.packSize,
      aliases: {
        create: {
          aliasName: rawProductName,
          sourceSystem,
        },
      },
    },
  });

  logProductMatchDecision(
    {
      ...decision,
      matchedProductId: product.id,
    },
    product.id,
    candidates.explanation.rulesApplied,
  );

  return product;
}

function safeSourceDate(value?: string): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function persistSupplierPriceRows(
  supplierPriceListId: string,
  supplierId: string,
  rows: SupplierPriceListRowInput[],
) {
  for (const row of rows) {
    const product = await findOrCreateProduct(
      row.rawProductName,
      row.productCandidates,
      'import:supplier-price-list',
      row.manufacturer,
    );

    const supplierPriceItem = await db.supplierPriceItem.create({
      data: {
        supplierPriceListId,
        supplierId,
        productId: product.id,
        rawProductName: row.rawProductName,
        normalizedProductName: row.productCandidates.normalizedKey,
        candidateStrength: row.productCandidates.strength,
        candidateFormulation: row.productCandidates.formulation,
        candidatePackSize: row.productCandidates.packSize,
        packDescription: row.packDescription,
        unitPrice: row.unitPrice,
        currencyCode: row.currencyCode,
        minimumOrderQuantity: row.minimumOrderQuantity,
        isAvailable: row.isAvailable,
        rawRow: row.rawRow,
      },
    });

    const priceIntelligence = await loadRecentProductPriceIntelligence(
      product.id,
      row.currencyCode,
      supplierPriceItem.unitPrice.toNumber(),
    );

    await db.supplierPriceItem.update({
      where: {
        id: supplierPriceItem.id,
      },
      data: {
        marketPriceEstimate: toDecimal(priceIntelligence.simulatedMarketPrice),
        marketPriceConfidence: priceIntelligence.marketConfidence,
        priceDeltaFromMarketPct: priceIntelligence.priceDeltaFromMarketPct,
      },
    });
  }
}

async function persistInventoryRows(
  importBatchId: string,
  rows: InventoryRowInput[],
) {
  for (const row of rows) {
    const product = await findOrCreateProduct(
      row.rawProductName,
      row.productCandidates,
      'import:inventory',
      row.manufacturer,
    );

    const supplier = row.rawSupplierName
      ? await findOrCreateSupplier(row.rawSupplierName)
      : null;

    await db.inventorySnapshot.create({
      data: {
        importBatchId,
        productId: product.id,
        supplierId: supplier?.id,
        rawProductName: row.rawProductName,
        rawSupplierName: row.rawSupplierName,
        normalizedProductName: row.productCandidates.normalizedKey,
        candidateStrength: row.productCandidates.strength,
        candidateFormulation: row.productCandidates.formulation,
        candidatePackSize: row.productCandidates.packSize,
        warehouseCode: row.warehouseCode,
        snapshotDate: row.snapshotDate,
        quantityOnHand: row.quantityOnHand,
        quantityReserved: row.quantityReserved,
        quantityAvailable: row.quantityAvailable,
        unitCost: row.unitCost,
        totalValue: row.totalValue,
        rawRow: row.rawRow,
      },
    });
  }
}

async function persistSalesRows(importBatchId: string, rows: SalesRowInput[]) {
  for (const row of rows) {
    const product = await findOrCreateProduct(
      row.rawProductName,
      row.productCandidates,
      'import:sales',
      row.manufacturer,
    );
    const customer = await findOrCreateCustomer(row.rawCustomerName);
    const supplier = row.rawSupplierName
      ? await findOrCreateSupplier(row.rawSupplierName)
      : null;

    await db.salesRecord.create({
      data: {
        importBatchId,
        saleDate: row.saleDate,
        customerId: customer.id,
        productId: product.id,
        supplierId: supplier?.id,
        rawProductName: row.rawProductName,
        rawCustomerName: row.rawCustomerName,
        rawSupplierName: row.rawSupplierName,
        normalizedProductName: row.productCandidates.normalizedKey,
        candidateStrength: row.productCandidates.strength,
        candidateFormulation: row.productCandidates.formulation,
        candidatePackSize: row.productCandidates.packSize,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalRevenue: row.totalRevenue,
        currencyCode: row.currencyCode,
        rawRow: row.rawRow,
      },
    });

    if (supplier?.id) {
      await applySupplierReliabilityFeedback(
        supplier.id,
        product.id,
        row.saleDate,
        row.unitPrice,
        row.currencyCode,
      );
    }
  }
}

function mapUnexpectedError(
  error: unknown,
  rawRow: ParsedTableRow,
  rowNumber: number,
): RowIssue {
  return {
    rowNumber,
    message:
      error instanceof Error ? error.message : 'Unexpected import error.',
    rawRow,
  };
}

export async function importSupplierPriceList(
  request: SupplierPriceListImportRequest,
): Promise<ImportResponse> {
  const parsed = parseUploadedFile(request.file);
  const currencyCode = request.currencyCode?.trim() || 'USD';
  const { validRows, errors } = validateSupplierPriceRows(
    parsed.rows,
    currencyCode,
  );
  const summary = buildSummary(
    parsed.rows.length,
    validRows.length,
    errors.length,
    parsed.warnings,
  );
  const initialDiagnostics = buildImportDiagnostics(
    'SUPPLIER_PRICE_LIST',
    parsed,
    validRows,
    errors,
  );
  const importBatch = await createImportBatch(
    'SUPPLIER_PRICE_LIST',
    request.file,
    summary,
    errors,
    initialDiagnostics,
  );

  const firstRowSupplierName = parsed.rows.find(
    (row) => row.supplierName || row.SupplierName,
  )?.supplierName;
  const supplierName =
    request.supplierName?.trim() || firstRowSupplierName?.trim();

  if (!supplierName) {
    const supplierNameError: RowIssue = {
      rowNumber: 0,
      message:
        'supplierName is required as a form field or row column for supplier price list imports.',
      rawRow: {},
    };
    const finalErrors = [...errors, supplierNameError];
    const finalSummary = {
      ...summary,
      invalidRows: summary.invalidRows + 1,
    };
    const finalDiagnostics = buildImportDiagnostics(
      'SUPPLIER_PRICE_LIST',
      parsed,
      validRows,
      finalErrors,
    );

    await db.importError.create({
      data: {
        importBatchId: importBatch.id,
        message: supplierNameError.message,
      },
    });
    await db.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status: 'COMPLETED_WITH_ERRORS',
        invalidRows: finalSummary.invalidRows,
        diagnostics: finalDiagnostics as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      importBatchId: importBatch.id,
      summary: finalSummary,
      errors: finalErrors,
    };
  }

  const supplier = await findOrCreateSupplier(supplierName);
  const supplierPriceList = await db.supplierPriceList.create({
    data: {
      supplierId: supplier.id,
      importBatchId: importBatch.id,
      fileName: request.file.originalname,
      fileMimeType: request.file.mimetype,
      fileSizeBytes: request.file.size,
      sourceDate: safeSourceDate(request.sourceDate),
      currencyCode,
    },
  });

  const persistenceErrors: RowIssue[] = [];
  for (const row of validRows) {
    try {
      await persistSupplierPriceRows(supplierPriceList.id, supplier.id, [row]);
    } catch (error) {
      persistenceErrors.push(
        mapUnexpectedError(error, row.rawRow, row.rowNumber),
      );
    }
  }

  if (persistenceErrors.length > 0) {
    await db.importError.createMany({
      data: persistenceErrors.map((error) => ({
        importBatchId: importBatch.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: error.rawRow as Prisma.InputJsonValue,
      })),
    });
  }

  const finalErrors = [...errors, ...persistenceErrors];
  const finalSummary = buildSummary(
    parsed.rows.length,
    validRows.length - persistenceErrors.length,
    finalErrors.length,
    parsed.warnings,
  );
  const finalDiagnostics = buildImportDiagnostics(
    'SUPPLIER_PRICE_LIST',
    parsed,
    validRows,
    finalErrors,
  );

  await db.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: finalErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      totalRows: finalSummary.totalRows,
      validRows: finalSummary.validRows,
      invalidRows: finalSummary.invalidRows,
      warnings: finalSummary.warnings,
      diagnostics: finalDiagnostics as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    importBatchId: importBatch.id,
    summary: finalSummary,
    errors: finalErrors,
  };
}

export async function importInventory(
  request: InventoryImportRequest,
): Promise<ImportResponse> {
  const parsed = parseUploadedFile(request.file);
  const { validRows, errors } = validateInventoryRows(parsed.rows);
  const summary = buildSummary(
    parsed.rows.length,
    validRows.length,
    errors.length,
    parsed.warnings,
  );
  const initialDiagnostics = buildImportDiagnostics(
    'INVENTORY',
    parsed,
    validRows,
    errors,
  );
  const importBatch = await createImportBatch(
    'INVENTORY',
    request.file,
    summary,
    errors,
    initialDiagnostics,
  );

  const persistenceErrors: RowIssue[] = [];
  for (const row of validRows) {
    try {
      await persistInventoryRows(importBatch.id, [row]);
    } catch (error) {
      persistenceErrors.push(
        mapUnexpectedError(error, row.rawRow, row.rowNumber),
      );
    }
  }

  if (persistenceErrors.length > 0) {
    await db.importError.createMany({
      data: persistenceErrors.map((error) => ({
        importBatchId: importBatch.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: error.rawRow as Prisma.InputJsonValue,
      })),
    });
  }

  const finalErrors = [...errors, ...persistenceErrors];
  const finalSummary = buildSummary(
    parsed.rows.length,
    validRows.length - persistenceErrors.length,
    finalErrors.length,
    parsed.warnings,
  );
  const finalDiagnostics = buildImportDiagnostics(
    'INVENTORY',
    parsed,
    validRows,
    finalErrors,
  );

  await db.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: finalErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      totalRows: finalSummary.totalRows,
      validRows: finalSummary.validRows,
      invalidRows: finalSummary.invalidRows,
      warnings: finalSummary.warnings,
      diagnostics: finalDiagnostics as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    importBatchId: importBatch.id,
    summary: finalSummary,
    errors: finalErrors,
  };
}

export async function importSales(
  request: SalesImportRequest,
): Promise<ImportResponse> {
  const parsed = parseUploadedFile(request.file);
  const { validRows, errors } = validateSalesRows(parsed.rows);
  const summary = buildSummary(
    parsed.rows.length,
    validRows.length,
    errors.length,
    parsed.warnings,
  );
  const initialDiagnostics = buildImportDiagnostics(
    'SALES',
    parsed,
    validRows,
    errors,
  );
  const importBatch = await createImportBatch(
    'SALES',
    request.file,
    summary,
    errors,
    initialDiagnostics,
  );

  const persistenceErrors: RowIssue[] = [];
  for (const row of validRows) {
    try {
      await persistSalesRows(importBatch.id, [row]);
    } catch (error) {
      persistenceErrors.push(
        mapUnexpectedError(error, row.rawRow, row.rowNumber),
      );
    }
  }

  if (persistenceErrors.length > 0) {
    await db.importError.createMany({
      data: persistenceErrors.map((error) => ({
        importBatchId: importBatch.id,
        rowNumber: error.rowNumber,
        fieldName: error.fieldName,
        message: error.message,
        rawRow: error.rawRow as Prisma.InputJsonValue,
      })),
    });
  }

  const finalErrors = [...errors, ...persistenceErrors];
  const finalSummary = buildSummary(
    parsed.rows.length,
    validRows.length - persistenceErrors.length,
    finalErrors.length,
    parsed.warnings,
  );
  const finalDiagnostics = buildImportDiagnostics(
    'SALES',
    parsed,
    validRows,
    finalErrors,
  );

  await db.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: finalErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      totalRows: finalSummary.totalRows,
      validRows: finalSummary.validRows,
      invalidRows: finalSummary.invalidRows,
      warnings: finalSummary.warnings,
      diagnostics: finalDiagnostics as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    importBatchId: importBatch.id,
    summary: finalSummary,
    errors: finalErrors,
  };
}
