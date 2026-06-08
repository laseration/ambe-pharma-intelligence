import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type BuyerTradeEnquiryStatus =
  | 'NEW'
  | 'REVIEWING'
  | 'MATCHED'
  | 'QUOTED'
  | 'CLOSED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'SPAM'
  | 'ARCHIVED';

export type BuyerTradeEnquiryPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type BuyerTradeEnquiryListItem = {
  id: string;
  status: BuyerTradeEnquiryStatus;
  priority: BuyerTradeEnquiryPriority;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  businessType: string | null;
  country: string | null;
  productName: string;
  strength: string | null;
  packSize: string | null;
  quantityRequired: string | null;
  targetMarket: string | null;
  requiredBy: string | null;
  documentationNotes: string | null;
  additionalNotes: string | null;
  source: string;
  reviewNotes: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListBuyerTradeEnquiriesOptions = {
  status?: BuyerTradeEnquiryStatus;
  priority?: BuyerTradeEnquiryPriority;
  company?: string;
  createdFrom?: string;
  createdTo?: string;
  take?: number;
};

const CALLER_NAME = 'web-dashboard';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
    init,
  });
}

export async function listBuyerTradeEnquiries(
  options: ListBuyerTradeEnquiriesOptions = {},
): Promise<BuyerTradeEnquiryListItem[]> {
  const searchParams = new URLSearchParams();

  if (options.status) {
    searchParams.set('status', options.status);
  }

  if (options.priority) {
    searchParams.set('priority', options.priority);
  }

  if (options.company) {
    searchParams.set('company', options.company);
  }

  if (options.createdFrom) {
    searchParams.set('createdFrom', options.createdFrom);
  }

  if (options.createdTo) {
    searchParams.set('createdTo', options.createdTo);
  }

  if (options.take) {
    searchParams.set('take', String(options.take));
  }

  const query = searchParams.toString();
  const payload = await requestJson<{ items: BuyerTradeEnquiryListItem[] }>(
    `/trade/buyer-enquiries${query ? `?${query}` : ''}`,
  );

  return payload.items;
}

export async function getBuyerTradeEnquiry(
  enquiryId: string,
): Promise<BuyerTradeEnquiryListItem> {
  const payload = await requestJson<{ item: BuyerTradeEnquiryListItem }>(
    `/trade/buyer-enquiries/${encodeURIComponent(enquiryId)}`,
  );

  return payload.item;
}

export async function updateBuyerTradeEnquiryStatus(
  enquiryId: string,
  body: {
    status: BuyerTradeEnquiryStatus;
    reviewNotes?: string;
    actorType: string;
    actorIdentifier: string;
  },
): Promise<BuyerTradeEnquiryListItem> {
  const payload = await requestJson<{ item: BuyerTradeEnquiryListItem }>(
    `/trade/buyer-enquiries/${encodeURIComponent(enquiryId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );

  return payload.item;
}
