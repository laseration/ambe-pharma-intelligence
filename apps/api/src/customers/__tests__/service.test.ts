import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerService,
  type CustomerRecord,
  type CustomerRepository,
  type CustomerTradeEnquiryRecord,
} from '../service';

const now = new Date('2026-06-11T12:00:00.000Z');

const customer: CustomerRecord = {
  id: 'customer-1',
  name: 'Central Pharmacy',
  normalizedName: 'central pharmacy',
  legalEntityName: 'Central Pharmacy Ltd',
  country: 'GB',
  city: 'London',
  primaryContactEmail: 'buyer@central.example',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  salesRecords: [
    {
      id: 'sale-1',
      saleDate: new Date('2026-02-01T00:00:00.000Z'),
      productId: 'product-1',
      supplierId: null,
      quantity: 24,
      unitPrice: '4.20',
      totalRevenue: '100.80',
      currencyCode: 'GBP',
      rawProductName: 'Atorvastatin',
      product: {
        id: 'product-1',
        name: 'Atorvastatin 20mg Tablets',
        sku: 'ATOR-20',
        manufacturer: 'Example Pharma',
      },
      supplier: null,
    },
  ],
  opportunities: [
    {
      id: 'opportunity-1',
      type: 'PUSH',
      status: 'OPEN',
      title: 'Follow up on Atorvastatin',
      description: 'Safe summary only.',
      score: 72,
      dueDate: null,
      product: {
        id: 'product-1',
        name: 'Atorvastatin 20mg Tablets',
      },
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    },
  ],
  _count: {
    salesRecords: 1,
    opportunities: 1,
  },
};

const enquiry: CustomerTradeEnquiryRecord = {
  id: 'rfq-1',
  status: 'NEW',
  priority: 'HIGH',
  companyName: 'Central Pharmacy Ltd',
  contactName: 'Buyer One',
  contactEmail: 'buyer@central.example',
  country: 'GB',
  productName: 'Atorvastatin',
  strength: '20mg',
  packSize: '28',
  quantityRequired: '50',
  requiredBy: null,
  createdAt: new Date('2026-06-05T00:00:00.000Z'),
  updatedAt: new Date('2026-06-05T00:00:00.000Z'),
};

function createRepository(): CustomerRepository {
  return {
    async listCustomers() {
      return [customer];
    },
    async findCustomerById(customerId) {
      return customerId === customer.id ? customer : null;
    },
    async listTradeEnquiriesByCompanyName() {
      return [enquiry];
    },
    async listRecentTradeEnquiries() {
      return [enquiry];
    },
    async listContactCandidateCustomers() {
      return [customer];
    },
  };
}

test('customer list returns safe summaries without raw email addresses', async () => {
  const service = createCustomerService(createRepository(), () => now);
  const result = await service.listCustomers({ limit: 10 });
  const item = result.items[0];

  assert.equal(result.items.length, 1);
  assert.ok(item);
  assert.equal(item.name, 'Central Pharmacy');
  assert.equal(item.contactEmailPreview, '***@central.example');
  assert.equal(item.contactEmailDomain, 'central.example');
  assert.doesNotMatch(JSON.stringify(result), /buyer@central\.example/);
});

test('customer detail includes recent sales, opportunities, and redacted RFQ context', async () => {
  const service = createCustomerService(createRepository(), () => now);
  const detail = await service.getCustomer(customer.id);

  assert.ok(detail);
  assert.equal(
    detail.recentSales[0]?.product.name,
    'Atorvastatin 20mg Tablets',
  );
  assert.equal(detail.openOpportunities[0]?.id, 'opportunity-1');
  assert.equal(
    detail.tradeEnquiries[0]?.contactEmailPreview,
    '***@central.example',
  );
  assert.doesNotMatch(JSON.stringify(detail), /buyer@central\.example/);
});

test('contact opportunities are deterministic and read-only', async () => {
  const service = createCustomerService(createRepository(), () => now);
  const rows = await service.listContactOpportunities({ limit: 10 });
  const row = rows[0];

  assert.equal(rows.length, 1);
  assert.ok(row);
  assert.equal(row.suggestedPriority, 'HIGH');
  assert.deepEqual(
    row.reasons.map((reason) => reason.code),
    [
      'OPEN_OPPORTUNITY',
      'RECENT_RFQ',
      'STALE_CUSTOMER',
      'RECENT_PRODUCT_INTEREST',
    ],
  );
  assert.equal(row.recentProducts[0]?.productName, 'Atorvastatin 20mg Tablets');
  assert.doesNotMatch(JSON.stringify(rows), /buyer@central\.example/);
});
