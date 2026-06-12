import 'server-only';

import {
  buildCustomerContactOpportunitiesPath,
  buildCustomerDetailPath,
  buildCustomerListPath,
  type CustomerContactOpportunityPathOptions,
  type CustomerListPathOptions,
} from './customersApiPaths';
import { requestInternalJson } from './internalApiRequest';

export type CustomerSummary = {
  id: string;
  name: string;
  legalEntityName: string | null;
  country: string | null;
  city: string | null;
  isActive: boolean;
  contactEmailPreview: string | null;
  contactEmailDomain: string | null;
  lastSaleAt: string | null;
  salesRecordCount: number;
  openOpportunityCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListResponse = {
  items: CustomerSummary[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type CustomerSaleSummary = {
  id: string;
  saleDate: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
    manufacturer: string | null;
  };
  supplier: {
    id: string;
    name: string;
  } | null;
  quantity: number;
  unitPrice: number | null;
  totalRevenue: number | null;
  currencyCode: string;
};

export type CustomerOpportunitySummary = {
  id: string;
  type: string;
  status: string;
  title: string;
  score: number;
  dueDate: string | null;
  product: {
    id: string;
    name: string;
  } | null;
  updatedAt: string;
};

export type CustomerTradeEnquirySummary = {
  id: string;
  status: string;
  priority: string;
  companyName: string;
  contactName: string;
  contactEmailPreview: string;
  country: string | null;
  productName: string;
  strength: string | null;
  packSize: string | null;
  quantityRequired: string | null;
  requiredBy: string | null;
  createdAt: string;
};

export type CustomerDetail = CustomerSummary & {
  recentSales: CustomerSaleSummary[];
  openOpportunities: CustomerOpportunitySummary[];
  tradeEnquiries: CustomerTradeEnquirySummary[];
};

export type CustomerContactOpportunityReasonCode =
  | 'OPEN_OPPORTUNITY'
  | 'RECENT_RFQ'
  | 'STALE_CUSTOMER'
  | 'RECENT_PRODUCT_INTEREST';

export type CustomerContactOpportunityReason = {
  code: CustomerContactOpportunityReasonCode;
  message: string;
};

export type CustomerContactOpportunity = {
  customer: CustomerSummary;
  suggestedPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  lastSaleAt: string | null;
  recentProducts: Array<{
    productId: string;
    productName: string;
    lastSaleAt: string;
    quantity: number;
  }>;
  openOpportunities: CustomerOpportunitySummary[];
  tradeEnquiries: CustomerTradeEnquirySummary[];
  reasons: CustomerContactOpportunityReason[];
};

export type ContactOpportunitiesResponse = {
  items: CustomerContactOpportunity[];
};

export type CustomerListOptions = CustomerListPathOptions;
export type CustomerContactOpportunityOptions =
  CustomerContactOpportunityPathOptions;

const CALLER_NAME = 'web-customers';
export {
  buildCustomerContactOpportunitiesPath,
  buildCustomerDetailPath,
  buildCustomerListPath,
};

export async function listCustomers(
  options: CustomerListOptions = {},
): Promise<CustomerListResponse> {
  return requestInternalJson<CustomerListResponse>(
    buildCustomerListPath(options),
    {
      callerName: CALLER_NAME,
      requiredCapability: 'customers:view',
    },
  );
}

export async function getCustomer(customerId: string): Promise<CustomerDetail> {
  const payload = await requestInternalJson<{ item: CustomerDetail }>(
    buildCustomerDetailPath(customerId),
    {
      callerName: CALLER_NAME,
      requiredCapability: 'customers:view',
    },
  );

  return payload.item;
}

export async function listCustomerContactOpportunities(
  options: CustomerContactOpportunityOptions = {},
): Promise<CustomerContactOpportunity[]> {
  const payload = await requestInternalJson<ContactOpportunitiesResponse>(
    buildCustomerContactOpportunitiesPath(options),
    {
      callerName: CALLER_NAME,
      requiredCapability: 'customers:view',
    },
  );

  return payload.items;
}
