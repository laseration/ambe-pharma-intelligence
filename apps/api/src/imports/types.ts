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
  normalizedName: string;
  strength: string | null;
  formulation: string | null;
  packSize: string | null;
};

export type SupplierPriceListRowInput = {
  rowNumber: number;
  rawRow: ParsedTableRow;
  rawProductName: string;
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

export type ImportHandler<TRequest> = (request: TRequest) => Promise<ImportResponse>;

export const IMPORT_KINDS: Record<'supplierPriceList' | 'inventory' | 'sales', ImportKind> = {
  supplierPriceList: 'SUPPLIER_PRICE_LIST',
  inventory: 'INVENTORY',
  sales: 'SALES',
};
