import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

import { CustomersDashboardContent } from './CustomersDashboardContent';
import type {
  CustomerContactOpportunity,
  CustomerListResponse,
} from '../../../lib/customersApi';

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

const customers: CustomerListResponse = {
  page: 1,
  limit: 25,
  hasMore: false,
  items: [
    {
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
      openOpportunityCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
};

const contactOpportunities: CustomerContactOpportunity[] = [
  {
    customer: customers.items[0]!,
    suggestedPriority: 'HIGH',
    lastSaleAt: '2026-05-15T00:00:00.000Z',
    recentProducts: [
      {
        productId: 'product-1',
        productName: 'Atorvastatin 20mg Tablets 28',
        lastSaleAt: '2026-05-15T00:00:00.000Z',
        quantity: 30,
      },
    ],
    openOpportunities: [],
    tradeEnquiries: [],
    reasons: [
      {
        code: 'RECENT_PRODUCT_INTEREST',
        message:
          'Recent sales history identifies product interest for a read-only follow-up queue.',
      },
    ],
  },
];

test('customers dashboard content renders safe contact opportunities and list rows', () => {
  const text = collectText(
    CustomersDashboardContent({
      contactOpportunities,
      customers,
      filters: { q: 'hospital', activeOnly: true, page: 1 },
    }),
  );

  assert.match(text, /Customer Follow-Up Signals/);
  assert.match(text, /Read-only follow-up queue/);
  assert.match(text, /Example Hospital/);
  assert.match(text, /o\*\*\*@example\.test/);
  assert.match(text, /Atorvastatin 20mg Tablets 28/);
  assert.doesNotMatch(text, /operator@example\.test/);
});
