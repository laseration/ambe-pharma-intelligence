import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

import { CustomerDetailContent } from './[id]/CustomerDetailContent';
import type { CustomerDetail } from '../../../lib/customersApi';

function collectText(node: ReactNode): string {
  const parts: string[] = [];

  function walk(value: ReactNode) {
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!isValidElement(value)) {
      return;
    }

    Children.forEach(
      (value as { props: { children?: ReactNode } }).props.children,
      walk,
    );
  }

  walk(node);
  return parts.join(' ');
}

const customer: CustomerDetail = {
  id: 'customer-1',
  name: 'Example Hospital',
  legalEntityName: 'Example Hospital NHS Trust',
  country: 'GB',
  city: 'London',
  isActive: true,
  contactEmailPreview: 'o***@example.test',
  contactEmailDomain: 'example.test',
  lastSaleAt: '2026-05-15T00:00:00.000Z',
  salesRecordCount: 12,
  openOpportunityCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  recentSales: [
    {
      id: 'sale-1',
      saleDate: '2026-05-15T00:00:00.000Z',
      product: {
        id: 'product-1',
        name: 'Atorvastatin 20mg Tablets 28',
        sku: 'ATOR-20-28',
        manufacturer: 'Example Pharma',
      },
      supplier: {
        id: 'supplier-1',
        name: 'Example Supplier',
      },
      quantity: 30,
      unitPrice: 6.5,
      totalRevenue: 195,
      currencyCode: 'GBP',
    },
  ],
  openOpportunities: [
    {
      id: 'opportunity-1',
      type: 'PUSH',
      status: 'OPEN',
      title: 'Push Atorvastatin',
      score: 82,
      dueDate: null,
      product: {
        id: 'product-1',
        name: 'Atorvastatin 20mg Tablets 28',
      },
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
  tradeEnquiries: [
    {
      id: 'enquiry-1',
      status: 'NEW',
      priority: 'HIGH',
      companyName: 'Example Hospital',
      contactName: 'Ops Buyer',
      contactEmailPreview: 'b***@example.test',
      country: 'GB',
      productName: 'Atorvastatin',
      strength: '20mg',
      packSize: '28',
      quantityRequired: '100',
      requiredBy: '2026-06-20T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  ],
};

test('customer detail content renders sales, opportunity, and RFQ context read-only', () => {
  const text = collectText(CustomerDetailContent({ customer }));

  assert.match(text, /Customer Detail/);
  assert.match(text, /Example Hospital/);
  assert.match(text, /Recent sales/);
  assert.match(text, /Push Atorvastatin/);
  assert.match(text, /Matching trade enquiries/);
  assert.match(text, /b\*\*\*@example\.test/);
  assert.doesNotMatch(text, /buyer@example\.test/);
});
