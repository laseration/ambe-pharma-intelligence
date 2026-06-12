import type { Prisma, PrismaClient } from '@prisma/client';

import { db } from '../lib/db';
import { redactEmailAddress } from '../safety/redaction';

export type CustomerListFilters = {
  q?: string | null;
  activeOnly?: boolean | null;
  limit?: number;
  page?: number;
};

export type CustomerRecord = {
  id: string;
  name: string;
  normalizedName: string;
  legalEntityName: string | null;
  country: string | null;
  city: string | null;
  primaryContactEmail: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  salesRecords?: CustomerSalesRecord[];
  opportunities?: CustomerOpportunityRecord[];
  _count?: {
    salesRecords: number;
    opportunities: number;
  };
};

export type CustomerSalesRecord = {
  id: string;
  saleDate: Date;
  productId: string;
  supplierId: string | null;
  quantity: number;
  unitPrice: unknown;
  totalRevenue: unknown;
  currencyCode: string;
  rawProductName: string;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    manufacturer: string | null;
  };
  supplier?: {
    id: string;
    name: string;
  } | null;
};

export type CustomerOpportunityRecord = {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  score: number;
  dueDate: Date | null;
  product?: {
    id: string;
    name: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerTradeEnquiryRecord = {
  id: string;
  status: string;
  priority: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  country: string | null;
  productName: string;
  strength: string | null;
  packSize: string | null;
  quantityRequired: string | null;
  requiredBy: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerRepository = {
  listCustomers: (
    filters: Required<Pick<CustomerListFilters, 'limit' | 'page'>> &
      Omit<CustomerListFilters, 'limit' | 'page'>,
  ) => Promise<CustomerRecord[]>;
  findCustomerById: (customerId: string) => Promise<CustomerRecord | null>;
  listTradeEnquiriesByCompanyName: (
    companyName: string,
  ) => Promise<CustomerTradeEnquiryRecord[]>;
  listRecentTradeEnquiries: (
    since: Date,
    limit: number,
  ) => Promise<CustomerTradeEnquiryRecord[]>;
  listContactCandidateCustomers: (limit: number) => Promise<CustomerRecord[]>;
};

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

export type CustomerDetail = CustomerSummary & {
  recentSales: CustomerSaleSummary[];
  openOpportunities: CustomerOpportunitySummary[];
  tradeEnquiries: CustomerTradeEnquirySummary[];
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

export type ContactOpportunityReasonCode =
  | 'OPEN_OPPORTUNITY'
  | 'RECENT_RFQ'
  | 'STALE_CUSTOMER'
  | 'RECENT_PRODUCT_INTEREST';

export type ContactOpportunityReason = {
  code: ContactOpportunityReasonCode;
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
  reasons: ContactOpportunityReason[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CONTACT_STALE_DAYS = 90;
const RECENT_RFQ_DAYS = 60;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function pageOffset(page: number | undefined, limit: number): number {
  return Math.max((page ?? 1) - 1, 0) * limit;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emailDomain(value: string | null): string | null {
  const atIndex = value?.lastIndexOf('@') ?? -1;
  if (!value || atIndex <= 0 || atIndex === value.length - 1) {
    return null;
  }

  return value.slice(atIndex + 1).toLowerCase();
}

function recentCutoff(days: number, now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCustomerWhere(
  filters: Omit<CustomerListFilters, 'limit' | 'page'>,
): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};

  if (filters.activeOnly === true) {
    where.isActive = true;
  }

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { legalEntityName: { contains: filters.q, mode: 'insensitive' } },
      { country: { contains: filters.q, mode: 'insensitive' } },
      { city: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export function createCustomerRepository(
  client: PrismaClient = db,
): CustomerRepository {
  return {
    listCustomers: async (filters) => {
      const limit = clampLimit(filters.limit);

      return (await client.customer.findMany({
        where: buildCustomerWhere(filters),
        include: {
          salesRecords: {
            orderBy: { saleDate: 'desc' },
            take: 1,
          },
          opportunities: {
            where: { status: 'OPEN' },
            select: {
              id: true,
              type: true,
              status: true,
              title: true,
              description: true,
              score: true,
              dueDate: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
              createdAt: true,
              updatedAt: true,
            },
          },
          _count: {
            select: {
              salesRecords: true,
              opportunities: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        skip: pageOffset(filters.page, limit),
        take: limit,
      })) as CustomerRecord[];
    },

    findCustomerById: async (customerId) =>
      client.customer.findUnique({
        where: { id: customerId },
        include: {
          salesRecords: {
            orderBy: { saleDate: 'desc' },
            take: 10,
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  manufacturer: true,
                },
              },
              supplier: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          opportunities: {
            where: { status: 'OPEN' },
            orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
            take: 10,
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              salesRecords: true,
              opportunities: true,
            },
          },
        },
      }) as Promise<CustomerRecord | null>,

    listTradeEnquiriesByCompanyName: async (companyName) =>
      client.buyerTradeEnquiry.findMany({
        where: {
          companyName: {
            contains: companyName,
            mode: 'insensitive',
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 10,
      }) as Promise<CustomerTradeEnquiryRecord[]>,

    listRecentTradeEnquiries: async (since, limit) =>
      client.buyerTradeEnquiry.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
      }) as Promise<CustomerTradeEnquiryRecord[]>,

    listContactCandidateCustomers: async (limit) =>
      client.customer.findMany({
        where: {
          isActive: true,
        },
        include: {
          salesRecords: {
            orderBy: { saleDate: 'desc' },
            take: 5,
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  manufacturer: true,
                },
              },
              supplier: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          opportunities: {
            where: { status: 'OPEN' },
            orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
            take: 5,
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              salesRecords: true,
              opportunities: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        take: limit,
      }) as Promise<CustomerRecord[]>,
  };
}

function mapCustomerSummary(customer: CustomerRecord): CustomerSummary {
  const latestSale = customer.salesRecords?.[0] ?? null;
  const openOpportunityCount =
    customer.opportunities?.filter((item) => item.status === 'OPEN').length ??
    customer.opportunities?.length ??
    0;

  return {
    id: customer.id,
    name: customer.name,
    legalEntityName: customer.legalEntityName ?? null,
    country: customer.country ?? null,
    city: customer.city ?? null,
    isActive: customer.isActive,
    contactEmailPreview: customer.primaryContactEmail
      ? redactEmailAddress(customer.primaryContactEmail)
      : null,
    contactEmailDomain: emailDomain(customer.primaryContactEmail),
    lastSaleAt: latestSale?.saleDate.toISOString() ?? null,
    salesRecordCount:
      customer._count?.salesRecords ?? customer.salesRecords?.length ?? 0,
    openOpportunityCount,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function mapSale(sale: CustomerSalesRecord): CustomerSaleSummary {
  return {
    id: sale.id,
    saleDate: sale.saleDate.toISOString(),
    product: {
      id: sale.product?.id ?? sale.productId,
      name: sale.product?.name ?? sale.rawProductName,
      sku: sale.product?.sku ?? null,
      manufacturer: sale.product?.manufacturer ?? null,
    },
    supplier: sale.supplier
      ? {
          id: sale.supplier.id,
          name: sale.supplier.name,
        }
      : null,
    quantity: sale.quantity,
    unitPrice: toNumber(sale.unitPrice),
    totalRevenue: toNumber(sale.totalRevenue),
    currencyCode: sale.currencyCode,
  };
}

function mapOpportunity(
  opportunity: CustomerOpportunityRecord,
): CustomerOpportunitySummary {
  return {
    id: opportunity.id,
    type: opportunity.type,
    status: opportunity.status,
    title: opportunity.title,
    score: opportunity.score,
    dueDate: opportunity.dueDate?.toISOString() ?? null,
    product: opportunity.product
      ? {
          id: opportunity.product.id,
          name: opportunity.product.name,
        }
      : null,
    updatedAt: opportunity.updatedAt.toISOString(),
  };
}

function mapTradeEnquiry(
  enquiry: CustomerTradeEnquiryRecord,
): CustomerTradeEnquirySummary {
  return {
    id: enquiry.id,
    status: enquiry.status,
    priority: enquiry.priority,
    companyName: enquiry.companyName,
    contactName: enquiry.contactName,
    contactEmailPreview: redactEmailAddress(enquiry.contactEmail),
    country: enquiry.country ?? null,
    productName: enquiry.productName,
    strength: enquiry.strength ?? null,
    packSize: enquiry.packSize ?? null,
    quantityRequired: enquiry.quantityRequired ?? null,
    requiredBy: enquiry.requiredBy?.toISOString() ?? null,
    createdAt: enquiry.createdAt.toISOString(),
  };
}

function tradeEnquiriesForCustomer(
  customer: CustomerRecord,
  enquiries: CustomerTradeEnquiryRecord[],
): CustomerTradeEnquiryRecord[] {
  const customerName = normalizeMatchText(customer.name);
  const legalName = customer.legalEntityName
    ? normalizeMatchText(customer.legalEntityName)
    : null;

  return enquiries.filter((enquiry) => {
    const companyName = normalizeMatchText(enquiry.companyName);
    return (
      companyName === customerName ||
      Boolean(legalName && companyName === legalName)
    );
  });
}

function buildRecentProducts(
  sales: CustomerSalesRecord[],
): CustomerContactOpportunity['recentProducts'] {
  const seen = new Set<string>();
  const products: CustomerContactOpportunity['recentProducts'] = [];

  for (const sale of sales) {
    if (seen.has(sale.productId)) {
      continue;
    }

    seen.add(sale.productId);
    products.push({
      productId: sale.productId,
      productName: sale.product?.name ?? sale.rawProductName,
      lastSaleAt: sale.saleDate.toISOString(),
      quantity: sale.quantity,
    });
  }

  return products;
}

function buildContactOpportunity(
  customer: CustomerRecord,
  enquiries: CustomerTradeEnquiryRecord[],
  now: Date,
): CustomerContactOpportunity | null {
  const recentSales = customer.salesRecords ?? [];
  const openOpportunities = (customer.opportunities ?? []).filter(
    (item) => item.status === 'OPEN',
  );
  const latestSale = recentSales[0] ?? null;
  const matchingEnquiries = tradeEnquiriesForCustomer(customer, enquiries);
  const reasons: ContactOpportunityReason[] = [];

  if (openOpportunities.length > 0) {
    reasons.push({
      code: 'OPEN_OPPORTUNITY',
      message: `${openOpportunities.length} open opportunity signal(s) reference this customer.`,
    });
  }

  if (matchingEnquiries.length > 0) {
    reasons.push({
      code: 'RECENT_RFQ',
      message: `${matchingEnquiries.length} recent trade enquiry signal(s) match this customer name.`,
    });
  }

  if (
    latestSale &&
    latestSale.saleDate.getTime() <
      recentCutoff(CONTACT_STALE_DAYS, now).getTime()
  ) {
    reasons.push({
      code: 'STALE_CUSTOMER',
      message: `Last recorded sale was on ${latestSale.saleDate.toISOString()}.`,
    });
  }

  if (recentSales.length > 0) {
    reasons.push({
      code: 'RECENT_PRODUCT_INTEREST',
      message:
        'Recent sales history identifies product interest for a read-only follow-up queue.',
    });
  }

  if (reasons.length === 0) {
    return null;
  }

  const suggestedPriority: CustomerContactOpportunity['suggestedPriority'] =
    openOpportunities.length > 0 || matchingEnquiries.length > 0
      ? 'HIGH'
      : latestSale &&
          latestSale.saleDate.getTime() <
            recentCutoff(CONTACT_STALE_DAYS, now).getTime()
        ? 'MEDIUM'
        : 'LOW';

  return {
    customer: mapCustomerSummary(customer),
    suggestedPriority,
    lastSaleAt: latestSale?.saleDate.toISOString() ?? null,
    recentProducts: buildRecentProducts(recentSales),
    openOpportunities: openOpportunities.map(mapOpportunity),
    tradeEnquiries: matchingEnquiries.map(mapTradeEnquiry),
    reasons,
  };
}

function nowDate(): Date {
  return new Date();
}

export function createCustomerService(
  repository: CustomerRepository = createCustomerRepository(),
  now: () => Date = nowDate,
) {
  return {
    async listCustomers(filters: CustomerListFilters = {}) {
      const limit = clampLimit(filters.limit);
      const customers = await repository.listCustomers({
        q: filters.q?.trim() || null,
        activeOnly: filters.activeOnly ?? null,
        limit,
        page: filters.page ?? 1,
      });

      return {
        items: customers.map(mapCustomerSummary),
        page: filters.page ?? 1,
        limit,
        hasMore: customers.length === limit,
      };
    },

    async getCustomer(customerId: string): Promise<CustomerDetail | null> {
      const customer = await repository.findCustomerById(customerId);
      if (!customer) {
        return null;
      }

      const tradeEnquiries = await repository.listTradeEnquiriesByCompanyName(
        customer.legalEntityName || customer.name,
      );

      return {
        ...mapCustomerSummary(customer),
        recentSales: (customer.salesRecords ?? []).map(mapSale),
        openOpportunities: (customer.opportunities ?? [])
          .filter((item) => item.status === 'OPEN')
          .map(mapOpportunity),
        tradeEnquiries: tradeEnquiries.map(mapTradeEnquiry),
      };
    },

    async listContactOpportunities(filters: { limit?: number } = {}) {
      const limit = clampLimit(filters.limit);
      const currentTime = now();
      const [customers, enquiries] = await Promise.all([
        repository.listContactCandidateCustomers(limit),
        repository.listRecentTradeEnquiries(
          recentCutoff(RECENT_RFQ_DAYS, currentTime),
          200,
        ),
      ]);

      return customers
        .map((customer) =>
          buildContactOpportunity(customer, enquiries, currentTime),
        )
        .filter((item): item is CustomerContactOpportunity => item !== null)
        .sort((left, right) => {
          const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          if (
            priorityRank[left.suggestedPriority] !==
            priorityRank[right.suggestedPriority]
          ) {
            return (
              priorityRank[left.suggestedPriority] -
              priorityRank[right.suggestedPriority]
            );
          }

          return left.customer.name.localeCompare(right.customer.name);
        })
        .slice(0, limit);
    },
  };
}

export const customerService = createCustomerService();
