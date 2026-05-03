import { Prisma, type Product, type ProductAlias, type Supplier } from '@prisma/client';

import { buildProductCandidates, normalizeText } from '../imports/normalization';
import { parseUploadedFile } from '../imports/parsers';
import { determineProductMatchDecision } from '../imports/productMatching';
import type { ParsedTableRow, ProductMatchDecision, UploadFile } from '../imports/types';
import { db } from '../lib/db';

type PurchaseOrderLineStatus = 'IMPORTED' | 'NEEDS_REVIEW' | 'IGNORED';
type PurchaseOrderImportStatus = 'COMPLETED' | 'COMPLETED_WITH_REVIEW' | 'FAILED';

type PurchaseOrderActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

type ParsedPurchaseOrderLine = {
  sourceRowNumber: number;
  rawRow: ParsedTableRow;
  poNumber: string | null;
  orderDate: Date | null;
  supplierText: string | null;
  productText: string | null;
  manufacturerText: string | null;
  quantity: number | null;
  unitPrice: Prisma.Decimal | null;
  currency: string | null;
  minimumOrderQuantity: number | null;
};

type PurchaseOrderLineCreateInput = ParsedPurchaseOrderLine & {
  matchedProductId: string | null;
  matchedSupplierId: string | null;
  productMatchConfidence: number | null;
  supplierMatchConfidence: number | null;
  matchReason: string | null;
  matchEvidence: Prisma.InputJsonValue;
  status: PurchaseOrderLineStatus;
  reviewReason: string | null;
};

type PurchaseOrderRepository = {
  createImport: (data: {
    status: PurchaseOrderImportStatus;
    fileName: string;
    fileMimeType: string | null;
    fileSizeBytes: number | null;
    totalRows: number;
    importedRows: number;
    reviewRows: number;
    ignoredRows: number;
    warnings: string[];
    uploadedByType: string;
    uploadedByIdentifier: string | null;
  }) => Promise<{ id: string }>;
  createLines: (purchaseOrderImportId: string, lines: PurchaseOrderLineCreateInput[]) => Promise<void>;
  findProductByStoredCanonicalField: (storedCanonicalField: string) => Promise<Product | null>;
  findProductAliasByRawName: (aliasName: string) => Promise<(ProductAlias & { product: Product }) | null>;
  listProductAliasesForCanonicalComparison: () => Promise<Array<ProductAlias & { product: Product }>>;
  findSupplierByNormalizedName: (normalizedName: string) => Promise<Supplier | null>;
  listImportedLinesForProduct: (productId: string) => Promise<PurchaseHistoryLine[]>;
};

export type PurchaseOrderImportRequest = PurchaseOrderActor & {
  file: UploadFile;
};

export type PurchaseOrderImportResult = {
  purchaseOrderImportId: string;
  summary: {
    totalRows: number;
    importedRows: number;
    reviewRows: number;
    ignoredRows: number;
    warnings: string[];
  };
  lines: Array<{
    sourceRowNumber: number;
    status: PurchaseOrderLineStatus;
    reviewReason: string | null;
    productText: string | null;
    supplierText: string | null;
    matchedProductId: string | null;
    matchedSupplierId: string | null;
  }>;
};

export type ProductPurchaseHistory = {
  productId: string;
  purchaseCount: number;
  lastPurchase: PurchaseHistoryLine | null;
  averageUnitPrice: number | null;
  lowestUnitPrice: number | null;
  currency: string | null;
  usualQuantity: number | null;
  usualMinimumOrderQuantity: number | null;
  recentLines: PurchaseHistoryLine[];
};

export type PurchaseHistoryLine = {
  id: string;
  poNumber: string | null;
  orderDate: Date | null;
  supplierText: string | null;
  productText: string | null;
  manufacturerText: string | null;
  quantity: number | null;
  unitPrice: Prisma.Decimal | number | null;
  currency: string | null;
  minimumOrderQuantity: number | null;
  matchedSupplierId: string | null;
  matchedSupplier?: {
    id: string;
    name: string;
  } | null;
  sourceRowNumber: number;
  createdAt: Date;
};

const COLUMN_ALIASES = {
  poNumber: ['ponumber', 'ordernumber', 'purchaseorder', 'purchaseordernumber', 'po'],
  orderDate: ['orderdate', 'date', 'purchasedate'],
  supplierText: ['supplier', 'vendor', 'suppliername', 'vendorname'],
  productText: ['product', 'description', 'item', 'medicine', 'productname', 'itemdescription'],
  manufacturerText: ['manufacturer', 'brand', 'mfr'],
  quantity: ['qty', 'quantity', 'units', 'orderquantity'],
  unitPrice: ['unitprice', 'price', 'cost', 'unitcost'],
  currency: ['currency', 'currencycode', 'ccy'],
  minimumOrderQuantity: ['moq', 'minimumorderquantity', 'minimumorderqty'],
} as const;

function createDefaultRepository(): PurchaseOrderRepository {
  return {
    createImport: (data) =>
      db.purchaseOrderImport.create({
        data: {
          ...data,
          warnings: data.warnings,
        },
        select: {
          id: true,
        },
      }),
    createLines: async (purchaseOrderImportId, lines) => {
      if (lines.length === 0) {
        return;
      }

      await db.purchaseOrderLine.createMany({
        data: lines.map((line) => ({
          purchaseOrderImportId,
          sourceRowNumber: line.sourceRowNumber,
          rawRow: line.rawRow,
          poNumber: line.poNumber,
          orderDate: line.orderDate,
          supplierText: line.supplierText,
          productText: line.productText,
          manufacturerText: line.manufacturerText,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: line.currency,
          minimumOrderQuantity: line.minimumOrderQuantity,
          matchedProductId: line.matchedProductId,
          matchedSupplierId: line.matchedSupplierId,
          productMatchConfidence: line.productMatchConfidence,
          supplierMatchConfidence: line.supplierMatchConfidence,
          matchReason: line.matchReason,
          matchEvidence: line.matchEvidence,
          status: line.status,
          reviewReason: line.reviewReason,
        })),
      });
    },
    findProductByStoredCanonicalField: (storedCanonicalField) =>
      db.product.findFirst({
        where: { normalizedName: storedCanonicalField },
      }),
    findProductAliasByRawName: (aliasName) =>
      db.productAlias.findFirst({
        where: { aliasName },
        include: { product: true },
      }),
    listProductAliasesForCanonicalComparison: () =>
      db.productAlias.findMany({
        include: { product: true },
      }),
    findSupplierByNormalizedName: (normalizedName) =>
      db.supplier.findUnique({
        where: { normalizedName },
      }),
    listImportedLinesForProduct: (productId) =>
      db.purchaseOrderLine.findMany({
        where: {
          matchedProductId: productId,
          status: 'IMPORTED',
        },
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        select: {
          id: true,
          poNumber: true,
          orderDate: true,
          supplierText: true,
          productText: true,
          manufacturerText: true,
          quantity: true,
          unitPrice: true,
          currency: true,
          minimumOrderQuantity: true,
          matchedSupplierId: true,
          matchedSupplier: {
            select: {
              id: true,
              name: true,
            },
          },
          sourceRowNumber: true,
          createdAt: true,
        },
      }),
  };
}

function canonicalColumnName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getCell(row: ParsedTableRow, aliases: readonly string[]): string | null {
  const aliasSet = new Set(aliases);
  const entry = Object.entries(row).find(([key]) => aliasSet.has(canonicalColumnName(key)));
  const value = entry?.[1]?.trim();

  return value ? value : null;
}

function parseInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/,/g, '').match(/-?\d+/)?.[0];
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseDecimal(value: string | null): Prisma.Decimal | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0];
  if (!cleaned) {
    return null;
  }

  return new Prisma.Decimal(cleaned);
}

function parseCurrency(rowCurrency: string | null, priceText: string | null): string | null {
  const explicit = rowCurrency?.trim().toUpperCase();
  if (explicit) {
    return explicit.slice(0, 3);
  }

  const text = priceText ?? '';
  if (/£|GBP/i.test(text)) {
    return 'GBP';
  }

  if (/\$|USD/i.test(text)) {
    return 'USD';
  }

  if (/€|EUR/i.test(text)) {
    return 'EUR';
  }

  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parsePurchaseOrderRows(rows: ParsedTableRow[]): ParsedPurchaseOrderLine[] {
  return rows.map((row, index) => {
    const priceText = getCell(row, COLUMN_ALIASES.unitPrice);

    return {
      sourceRowNumber: index + 2,
      rawRow: row,
      poNumber: getCell(row, COLUMN_ALIASES.poNumber),
      orderDate: parseDate(getCell(row, COLUMN_ALIASES.orderDate)),
      supplierText: getCell(row, COLUMN_ALIASES.supplierText),
      productText: getCell(row, COLUMN_ALIASES.productText),
      manufacturerText: getCell(row, COLUMN_ALIASES.manufacturerText),
      quantity: parseInteger(getCell(row, COLUMN_ALIASES.quantity)),
      unitPrice: parseDecimal(priceText),
      currency: parseCurrency(getCell(row, COLUMN_ALIASES.currency), priceText),
      minimumOrderQuantity: parseInteger(getCell(row, COLUMN_ALIASES.minimumOrderQuantity)),
    };
  });
}

function productConfidenceScore(decision: ProductMatchDecision): number {
  if (!decision.matchedProductId) {
    return 0;
  }

  if (decision.reasonCode === 'EXACT_NORMALIZED_KEY_MATCH') {
    return 95;
  }

  if (decision.reasonCode === 'EXISTING_ALIAS_MATCH') {
    return decision.aliasMatchType === 'EXACT_RAW_ALIAS' ? 92 : 88;
  }

  return 80;
}

async function matchProduct(
  repository: PurchaseOrderRepository,
  productText: string | null,
): Promise<{
  matchedProductId: string | null;
  confidence: number | null;
  reason: string | null;
  evidence: Prisma.InputJsonValue;
}> {
  if (!productText) {
    return {
      matchedProductId: null,
      confidence: null,
      reason: 'missing_product_text',
      evidence: {},
    };
  }

  const candidates = buildProductCandidates(productText);
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: repository.findProductByStoredCanonicalField,
      findAliasByRawName: repository.findProductAliasByRawName,
      listAliasesForCanonicalComparison: repository.listProductAliasesForCanonicalComparison,
    },
    {
      rawProductName: productText,
      candidates,
    },
  );

  return {
    matchedProductId: decision.matchedProductId,
    confidence: decision.matchedProductId ? productConfidenceScore(decision) : null,
    reason: decision.reasonCode,
    evidence: {
      normalizedKey: decision.normalizedKey,
      normalizedName: decision.normalizedName,
      confidence: decision.confidence,
      aliasMatchType: decision.aliasMatchType ?? null,
      structuredCompatibility: decision.structuredCompatibility ?? null,
      rulesApplied: candidates.explanation.rulesApplied,
    },
  };
}

async function matchSupplier(
  repository: PurchaseOrderRepository,
  supplierText: string | null,
): Promise<{
  matchedSupplierId: string | null;
  confidence: number | null;
  reason: string | null;
  evidence: Prisma.InputJsonValue;
}> {
  if (!supplierText) {
    return {
      matchedSupplierId: null,
      confidence: null,
      reason: 'missing_supplier_text',
      evidence: {},
    };
  }

  const normalizedName = normalizeText(supplierText);
  const supplier = await repository.findSupplierByNormalizedName(normalizedName);

  return {
    matchedSupplierId: supplier?.id ?? null,
    confidence: supplier ? 92 : null,
    reason: supplier ? 'EXACT_SUPPLIER_NORMALIZED_NAME_MATCH' : 'NO_SAFE_SUPPLIER_MATCH',
    evidence: {
      normalizedName,
      supplierName: supplier?.name ?? null,
    },
  };
}

function decideLineStatus(input: {
  line: ParsedPurchaseOrderLine;
  matchedProductId: string | null;
  matchedSupplierId: string | null;
}): {
  status: PurchaseOrderLineStatus;
  reviewReason: string | null;
} {
  const hasAnyPurchaseSignal = Boolean(
    input.line.poNumber ||
      input.line.orderDate ||
      input.line.supplierText ||
      input.line.productText ||
      input.line.quantity ||
      input.line.unitPrice,
  );

  if (!hasAnyPurchaseSignal) {
    return {
      status: 'IGNORED',
      reviewReason: 'blank_or_non_purchase_row',
    };
  }

  if (!input.line.productText) {
    return {
      status: 'NEEDS_REVIEW',
      reviewReason: 'missing_product_text',
    };
  }

  if (!input.line.supplierText) {
    return {
      status: 'NEEDS_REVIEW',
      reviewReason: 'missing_supplier_text',
    };
  }

  if (!input.matchedProductId) {
    return {
      status: 'NEEDS_REVIEW',
      reviewReason: 'weak_or_missing_product_match',
    };
  }

  if (!input.matchedSupplierId) {
    return {
      status: 'NEEDS_REVIEW',
      reviewReason: 'weak_or_missing_supplier_match',
    };
  }

  return {
    status: 'IMPORTED',
    reviewReason: null,
  };
}

function decimalToNumber(value: Prisma.Decimal | number | null): number | null {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' ? value : value.toNumber();
}

function mode(values: Array<number | null>): number | null {
  const counts = new Map<number, number>();

  for (const value of values) {
    if (value === null) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;
}

export function createPurchaseOrderService(repository: PurchaseOrderRepository = createDefaultRepository()) {
  return {
    async importPurchaseOrders(request: PurchaseOrderImportRequest): Promise<PurchaseOrderImportResult> {
      const parsed = parseUploadedFile(request.file);
      const parsedLines = parsePurchaseOrderRows(parsed.rows);
      const lines: PurchaseOrderLineCreateInput[] = [];

      for (const line of parsedLines) {
        const productMatch = await matchProduct(repository, line.productText);
        const supplierMatch = await matchSupplier(repository, line.supplierText);
        const decision = decideLineStatus({
          line,
          matchedProductId: productMatch.matchedProductId,
          matchedSupplierId: supplierMatch.matchedSupplierId,
        });

        lines.push({
          ...line,
          matchedProductId: productMatch.matchedProductId,
          matchedSupplierId: supplierMatch.matchedSupplierId,
          productMatchConfidence: productMatch.confidence,
          supplierMatchConfidence: supplierMatch.confidence,
          matchReason: [productMatch.reason, supplierMatch.reason].filter(Boolean).join('; ') || null,
          matchEvidence: {
            product: productMatch.evidence,
            supplier: supplierMatch.evidence,
          },
          status: decision.status,
          reviewReason: decision.reviewReason,
        });
      }

      const importedRows = lines.filter((line) => line.status === 'IMPORTED').length;
      const reviewRows = lines.filter((line) => line.status === 'NEEDS_REVIEW').length;
      const ignoredRows = lines.filter((line) => line.status === 'IGNORED').length;
      const purchaseOrderImport = await repository.createImport({
        status: reviewRows > 0 ? 'COMPLETED_WITH_REVIEW' : 'COMPLETED',
        fileName: request.file.originalname,
        fileMimeType: request.file.mimetype || null,
        fileSizeBytes: request.file.size ?? null,
        totalRows: parsed.rows.length,
        importedRows,
        reviewRows,
        ignoredRows,
        warnings: parsed.warnings,
        uploadedByType: request.actorType?.trim() || 'SYSTEM',
        uploadedByIdentifier: request.actorIdentifier?.trim() || null,
      });

      await repository.createLines(purchaseOrderImport.id, lines);

      return {
        purchaseOrderImportId: purchaseOrderImport.id,
        summary: {
          totalRows: parsed.rows.length,
          importedRows,
          reviewRows,
          ignoredRows,
          warnings: parsed.warnings,
        },
        lines: lines.map((line) => ({
          sourceRowNumber: line.sourceRowNumber,
          status: line.status,
          reviewReason: line.reviewReason,
          productText: line.productText,
          supplierText: line.supplierText,
          matchedProductId: line.matchedProductId,
          matchedSupplierId: line.matchedSupplierId,
        })),
      };
    },

    async getProductPurchaseHistory(productId: string): Promise<ProductPurchaseHistory> {
      const lines = await repository.listImportedLinesForProduct(productId);
      const prices = lines.map((line) => decimalToNumber(line.unitPrice)).filter((value): value is number => value !== null);
      const currencies = Array.from(new Set(lines.map((line) => line.currency).filter(Boolean)));

      return {
        productId,
        purchaseCount: lines.length,
        lastPurchase: lines[0] ?? null,
        averageUnitPrice:
          prices.length > 0
            ? Math.round((prices.reduce((total, price) => total + price, 0) / prices.length) * 100) / 100
            : null,
        lowestUnitPrice: prices.length > 0 ? Math.min(...prices) : null,
        currency: currencies.length === 1 ? currencies[0] ?? null : null,
        usualQuantity: mode(lines.map((line) => line.quantity)),
        usualMinimumOrderQuantity: mode(lines.map((line) => line.minimumOrderQuantity)),
        recentLines: lines.slice(0, 20),
      };
    },
  };
}

export const purchaseOrderService = createPurchaseOrderService();
