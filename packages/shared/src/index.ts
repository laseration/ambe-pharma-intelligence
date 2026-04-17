export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  status: 'active' | 'inactive';
};

export type Supplier = {
  id: string;
  name: string;
  country: string;
  contactEmail: string;
};

export type InventorySnapshot = {
  productId: string;
  warehouseCode: string;
  quantityOnHand: number;
  capturedAt: string;
};

export type Opportunity = {
  id: string;
  customerId: string;
  productId: string;
  stage: 'lead' | 'qualified' | 'proposal' | 'won' | 'lost';
  estimatedValue: number;
};

export type Customer = {
  id: string;
  name: string;
  segment: string;
  primaryContactEmail: string;
};

export function formatEntityLabel(id: string, name: string): string {
  return `${name} (${id})`;
}
