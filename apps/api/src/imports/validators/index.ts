import { Prisma } from '@prisma/client';

import { buildProductCandidates } from '../normalization';
import type {
  InventoryRowInput,
  ParsedTableRow,
  RowIssue,
  SalesRowInput,
  SupplierPriceListRowInput,
} from '../types';
import {
  createValidationContext,
  getIssues,
  optionalBoolean,
  optionalDecimal,
  optionalInteger,
  optionalString,
  requireDate,
  requireDecimal,
  requireInteger,
  requireString,
} from './shared';

type ValidationResult<T> = {
  validRows: T[];
  errors: RowIssue[];
};

export function validateSupplierPriceRows(
  rows: ParsedTableRow[],
  defaultCurrencyCode: string,
): ValidationResult<SupplierPriceListRowInput> {
  const validRows: SupplierPriceListRowInput[] = [];
  const errors: RowIssue[] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const context = createValidationContext(rowNumber, rawRow);
    const rawProductName = requireString(
      context,
      ['productName', 'rawProductName', 'product', 'name'],
      'productName',
    );
    const manufacturer = optionalString(context, ['manufacturer', 'manufacturerName', 'mfr', 'brand']);
    const unitPrice = requireDecimal(context, ['unitPrice', 'price'], 'unitPrice');
    const packDescription = optionalString(context, ['packDescription', 'packSize']);
    const minimumOrderQuantity = optionalInteger(
      context,
      ['minimumOrderQuantity', 'minOrderQty', 'minimumOrderQty'],
      'minimumOrderQuantity',
    );
    const isAvailable = optionalBoolean(context, ['isAvailable', 'available'], 'isAvailable') ?? true;
    const currencyCode = optionalString(context, ['currencyCode', 'currency']) ?? defaultCurrencyCode;

    const issues = getIssues(context);
    if (!rawProductName || !unitPrice || issues.length > 0) {
      errors.push(...issues);
      return;
    }

    validRows.push({
      rowNumber,
      rawRow,
      rawProductName,
      manufacturer,
      packDescription,
      unitPrice,
      currencyCode,
      minimumOrderQuantity,
      isAvailable,
      productCandidates: buildProductCandidates(rawProductName),
    });
  });

  return {
    validRows,
    errors,
  };
}

export function validateInventoryRows(rows: ParsedTableRow[]): ValidationResult<InventoryRowInput> {
  const validRows: InventoryRowInput[] = [];
  const errors: RowIssue[] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const context = createValidationContext(rowNumber, rawRow);
    const rawProductName = requireString(
      context,
      ['productName', 'rawProductName', 'product', 'name'],
      'productName',
    );
    const manufacturer = optionalString(context, ['manufacturer', 'manufacturerName', 'mfr', 'brand']);
    const rawSupplierName = optionalString(context, ['supplierName', 'supplier']);
    const warehouseCode = requireString(context, ['warehouseCode', 'warehouse'], 'warehouseCode');
    const snapshotDate = requireDate(context, ['snapshotDate', 'date'], 'snapshotDate');
    const quantityOnHand = requireInteger(context, ['quantityOnHand', 'quantity'], 'quantityOnHand');
    const quantityReserved =
      optionalInteger(context, ['quantityReserved', 'reserved'], 'quantityReserved') ?? 0;
    const quantityAvailable =
      optionalInteger(context, ['quantityAvailable', 'availableQuantity'], 'quantityAvailable') ??
      (quantityOnHand !== null ? quantityOnHand - quantityReserved : 0);
    const unitCost = optionalDecimal(context, ['unitCost', 'cost'], 'unitCost');
    const totalValue =
      optionalDecimal(context, ['totalValue', 'inventoryValue'], 'totalValue') ??
      (unitCost ? unitCost.mul(quantityOnHand ?? 0) : null);

    const issues = getIssues(context);
    if (
      !rawProductName ||
      !warehouseCode ||
      !snapshotDate ||
      quantityOnHand === null ||
      issues.length > 0
    ) {
      errors.push(...issues);
      return;
    }

    validRows.push({
      rowNumber,
      rawRow,
      rawProductName,
      manufacturer,
      rawSupplierName,
      warehouseCode,
      snapshotDate,
      quantityOnHand,
      quantityReserved,
      quantityAvailable,
      unitCost,
      totalValue,
      productCandidates: buildProductCandidates(rawProductName),
    });
  });

  return {
    validRows,
    errors,
  };
}

export function validateSalesRows(rows: ParsedTableRow[]): ValidationResult<SalesRowInput> {
  const validRows: SalesRowInput[] = [];
  const errors: RowIssue[] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const context = createValidationContext(rowNumber, rawRow);
    const saleDate = requireDate(context, ['saleDate', 'date'], 'saleDate');
    const rawCustomerName = requireString(
      context,
      ['customerName', 'customer', 'buyerName'],
      'customerName',
    );
    const rawProductName = requireString(
      context,
      ['productName', 'rawProductName', 'product', 'name'],
      'productName',
    );
    const manufacturer = optionalString(context, ['manufacturer', 'manufacturerName', 'mfr', 'brand']);
    const rawSupplierName = optionalString(context, ['supplierName', 'supplier']);
    const quantity = requireInteger(context, ['quantity', 'units'], 'quantity');
    const unitPrice = requireDecimal(context, ['unitPrice', 'price'], 'unitPrice');
    const currencyCode = optionalString(context, ['currencyCode', 'currency']) ?? 'USD';
    const totalRevenue =
      optionalDecimal(context, ['totalRevenue', 'revenue'], 'totalRevenue') ??
      (quantity !== null && unitPrice ? unitPrice.mul(quantity) : null);

    const issues = getIssues(context);
    if (
      !saleDate ||
      !rawCustomerName ||
      !rawProductName ||
      quantity === null ||
      !unitPrice ||
      !totalRevenue ||
      issues.length > 0
    ) {
      errors.push(...issues);
      return;
    }

    validRows.push({
      rowNumber,
      rawRow,
      rawProductName,
      manufacturer,
      rawCustomerName,
      rawSupplierName,
      saleDate,
      quantity,
      unitPrice: unitPrice instanceof Prisma.Decimal ? unitPrice : new Prisma.Decimal(unitPrice),
      totalRevenue:
        totalRevenue instanceof Prisma.Decimal
          ? totalRevenue
          : new Prisma.Decimal(totalRevenue),
      currencyCode,
      productCandidates: buildProductCandidates(rawProductName),
    });
  });

  return {
    validRows,
    errors,
  };
}
