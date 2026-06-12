import 'server-only';

import {
  buildInventoryListPath,
  buildStockRiskPath,
  type InventoryListPathOptions,
  type StockRiskPathOptions,
} from './inventoryApiPaths';
import { requestInternalJson } from './internalApiRequest';

export type InventoryProductSummary = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
};

export type InventorySupplierSummary = {
  id: string;
  name: string;
  country: string | null;
  isActive: boolean;
};

export type InventorySummaryRow = {
  id: string;
  product: InventoryProductSummary;
  supplier: InventorySupplierSummary | null;
  warehouseCode: string;
  snapshotDate: string;
  ageDays: number;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  unitCost: number | null;
  totalValue: number | null;
  lowStock: boolean;
  stale: boolean;
  source: {
    rawProductName: string;
    rawSupplierName: string | null;
  };
};

export type InventoryListResponse = {
  items: InventorySummaryRow[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type StockRiskReasonCode =
  | 'LOW_STOCK'
  | 'STALE_SNAPSHOT'
  | 'RECENT_SALES_VELOCITY'
  | 'OPEN_OPPORTUNITY'
  | 'MISSING_RECENT_SNAPSHOT';

export type StockRiskReason = {
  code: StockRiskReasonCode;
  message: string;
};

export type StockRiskRow = {
  product: InventoryProductSummary;
  supplier: InventorySupplierSummary | null;
  warehouseCode: string | null;
  snapshotDate: string | null;
  quantityAvailable: number | null;
  recentSalesQuantity: number;
  openOpportunityCount: number;
  riskScore: number;
  reasons: StockRiskReason[];
};

export type StockRiskResponse = {
  items: StockRiskRow[];
};

export type InventoryListOptions = InventoryListPathOptions;
export type StockRiskOptions = StockRiskPathOptions;

const CALLER_NAME = 'web-inventory';
export { buildInventoryListPath, buildStockRiskPath };

export async function listInventory(
  options: InventoryListOptions = {},
): Promise<InventoryListResponse> {
  return requestInternalJson<InventoryListResponse>(
    buildInventoryListPath(options),
    {
      callerName: CALLER_NAME,
      requiredCapability: 'inventory:view',
    },
  );
}

export async function listStockRisk(
  options: StockRiskOptions = {},
): Promise<StockRiskRow[]> {
  const payload = await requestInternalJson<StockRiskResponse>(
    buildStockRiskPath(options),
    {
      callerName: CALLER_NAME,
      requiredCapability: 'inventory:view',
    },
  );

  return payload.items;
}
