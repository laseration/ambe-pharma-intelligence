import type { ImportKind, Prisma } from '@prisma/client';

export type ImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings: string[];
};

export type ParsedTableRow = Record<string, string>;

export type ParsedFileResult = {
  rows: ParsedTableRow[];
  warnings: string[];
};

export type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type ProductCandidates = {
  baseName: string;
  normalizedName: string;
  strength: string | null;
  formulation: string | null;
  packSize: string | null;
  normalizedKey: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: {
    cleanedInput: string;
    tokens: string[];
    rulesApplied: string[];
    extracted: {
      strength: string | null;
      formulation: string | null;
      packSize: string | null;
    };
  };
};

export type ProductMatchOutcome =
  | 'EXISTING_PRODUCT'
  | 'EXISTING_ALIAS'
  | 'NEW_PRODUCT';

export type ProductMatchReasonCode =
  | 'EXACT_NORMALIZED_KEY_MATCH'
  | 'EXACT_NORMALIZED_NAME_MATCH'
  | 'STRUCTURED_BASE_NAME_MATCH'
  | 'EXISTING_ALIAS_MATCH'
  | 'NO_SAFE_MATCH_CREATED_NEW_PRODUCT';

export type ProductMatchDecision = {
  outcome: ProductMatchOutcome;
  matchedProductId: string | null;
  reasonCode: ProductMatchReasonCode;
  normalizedKey: string;
  normalizedName: string;
  rawProductName: string;
  confidence: ProductCandidates['confidence'];
  aliasMatchType?: 'EXACT_RAW_ALIAS' | 'CANONICALIZED_ALIAS';
  structuredCompatibility?: {
    checked: boolean;
    compatible: boolean;
    conflictFields: Array<'strength' | 'formulation' | 'packSize'>;
  };
};

export type MarketPriceSimulation = {
  latestObservedPrice: number | null;
  rollingAveragePrice: number | null;
  bestObservedPrice: number | null;
  simulatedMarketPrice: number | null;
  marketConfidence: number | null;
  volatilityScore: number | null;
  sampleCount: number;
  priceDeltaFromMarketPct: number | null;
};

export type ProductPriceIntelligence = MarketPriceSimulation;

export type SupplierPriceListRowInput = {
  rowNumber: number;
  rawRow: ParsedTableRow;
  rawProductName: string;
  manufacturer: string | null;
  packDescription: string | null;
  unitPrice: Prisma.Decimal;
  currencyCode: string;
  minimumOrderQuantity: number | null;
  isAvailable: boolean;
  productCandidates: ProductCandidates;
};

export type InventoryRowInput = {
  rowNumber: number;
  rawRow: ParsedTableRow;
  rawProductName: string;
  manufacturer: string | null;
  rawSupplierName: string | null;
  warehouseCode: string;
  snapshotDate: Date;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  unitCost: Prisma.Decimal | null;
  totalValue: Prisma.Decimal | null;
  productCandidates: ProductCandidates;
};

export type SalesRowInput = {
  rowNumber: number;
  rawRow: ParsedTableRow;
  rawProductName: string;
  manufacturer: string | null;
  rawCustomerName: string;
  rawSupplierName: string | null;
  saleDate: Date;
  quantity: number;
  unitPrice: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
  currencyCode: string;
  productCandidates: ProductCandidates;
};

export type RowIssue = {
  rowNumber: number;
  fieldName?: string;
  message: string;
  rawRow: Prisma.InputJsonValue;
};

export type ImportResponse = {
  importBatchId: string;
  summary: ImportSummary;
  errors: RowIssue[];
};

export type ImportRequestBase = {
  file: UploadFile;
};

export type SupplierPriceListImportRequest = ImportRequestBase & {
  sourceDate?: string;
  supplierName?: string;
  currencyCode?: string;
};

export type InventoryImportRequest = ImportRequestBase;

export type SalesImportRequest = ImportRequestBase;

export type ImportHandler<TRequest> = (
  request: TRequest,
) => Promise<ImportResponse>;

export const IMPORT_KINDS: Record<
  'supplierPriceList' | 'inventory' | 'sales',
  ImportKind
> = {
  supplierPriceList: 'SUPPLIER_PRICE_LIST',
  inventory: 'INVENTORY',
  sales: 'SALES',
};
