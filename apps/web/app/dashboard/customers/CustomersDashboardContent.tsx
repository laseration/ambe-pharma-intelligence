import Link from 'next/link';
import React from 'react';

import type {
  CustomerContactOpportunity,
  CustomerListResponse,
} from '../../../lib/customersApi';

type CustomersDashboardContentProps = {
  customers: CustomerListResponse;
  contactOpportunities: CustomerContactOpportunity[];
  filters: {
    q: string;
    activeOnly: boolean;
    page: number;
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'No date';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
  }).format(parsed);
}

function buildCustomersHref(input: {
  q?: string;
  activeOnly?: boolean;
  page?: number;
}) {
  const searchParams = new URLSearchParams();

  if (input.q?.trim()) {
    searchParams.set('q', input.q.trim());
  }

  if (input.activeOnly) {
    searchParams.set('activeOnly', 'true');
  }

  if (input.page && input.page > 1) {
    searchParams.set('page', String(input.page));
  }

  const query = searchParams.toString();
  return `/dashboard/customers${query ? `?${query}` : ''}`;
}

function priorityPillClass(
  priority: CustomerContactOpportunity['suggestedPriority'],
) {
  switch (priority) {
    case 'HIGH':
      return 'pill-high';
    case 'MEDIUM':
      return 'pill-medium';
    case 'LOW':
      return 'pill-neutral';
  }
}

export function CustomersDashboardContent({
  customers,
  contactOpportunities,
  filters,
}: CustomersDashboardContentProps) {
  const activeFilterCount = (filters.q ? 1 : 0) + (filters.activeOnly ? 1 : 0);

  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Customers</p>
            <h2 className="title">Customer Follow-Up Signals</h2>
            <p className="copy">
              Read-only customer records, recent sales context, and safe
              follow-up candidates. This page does not send messages or create
              outreach records.
            </p>
          </div>
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
        </div>

        <form action="/dashboard/customers" className="action-form">
          <label>
            Search customers
            <input
              defaultValue={filters.q}
              name="q"
              placeholder="Name, legal entity, city, country"
              type="search"
            />
          </label>
          <label className="checkbox-label">
            <input
              defaultChecked={filters.activeOnly}
              name="activeOnly"
              type="checkbox"
              value="true"
            />
            Active customers only
          </label>
          <button className="button button-primary" type="submit">
            Apply filters
          </button>
          {activeFilterCount > 0 ? (
            <Link className="button" href="/dashboard/customers">
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Contact Opportunities</p>
            <h3 className="section-title">Read-only follow-up queue</h3>
            <p className="copy">
              Suggested follow-up rows are based on sales history, open
              opportunities, and recent trade enquiries where available.
            </p>
          </div>
          <span className="pill pill-neutral">
            {contactOpportunities.length} candidates
          </span>
        </div>

        {contactOpportunities.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">
              No follow-up candidates returned
            </p>
            <p className="dashboard-proof-copy">
              Candidate rows appear after customer sales history, open
              opportunities, or matching RFQ signals are available.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {contactOpportunities.map((item) => (
              <article
                className="dashboard-opportunity-card"
                key={item.customer.id}
              >
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {item.customer.name}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {item.customer.city ?? 'Unknown city'}
                      {item.customer.country
                        ? ` | ${item.customer.country}`
                        : ''}
                      {item.customer.contactEmailPreview
                        ? ` | ${item.customer.contactEmailPreview}`
                        : ''}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    <span
                      className={`pill ${priorityPillClass(item.suggestedPriority)}`}
                    >
                      {item.suggestedPriority}
                    </span>
                    <span className="pill pill-neutral">
                      {item.openOpportunities.length} open signals
                    </span>
                  </div>
                </div>
                <p className="dashboard-triage-meta">
                  Last sale {formatDate(item.lastSaleAt)}
                </p>
                <ul className="dashboard-signal-list">
                  {item.reasons.map((reason) => (
                    <li key={`${reason.code}-${reason.message}`}>
                      {reason.message}
                    </li>
                  ))}
                </ul>
                {item.recentProducts.length > 0 ? (
                  <p className="dashboard-summary-note">
                    Recent interest:{' '}
                    {item.recentProducts
                      .map((product) => product.productName)
                      .slice(0, 3)
                      .join(', ')}
                  </p>
                ) : null}
                <div className="actions">
                  <Link
                    className="button"
                    href={`/dashboard/customers/${encodeURIComponent(item.customer.id)}`}
                  >
                    Open customer
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Customer Records</p>
            <h3 className="section-title">Customer summaries</h3>
            <p className="copy">
              Showing page {customers.page} with up to {customers.limit} rows.
            </p>
          </div>
          <span className="pill pill-neutral">
            {customers.items.length} rows
          </span>
        </div>

        {customers.items.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No customers found</p>
            <p className="dashboard-proof-copy">
              Import sales data or adjust the current filters.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {customers.items.map((customer) => (
              <article className="dashboard-opportunity-card" key={customer.id}>
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {customer.name}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {customer.legalEntityName ?? 'No legal entity'}
                      {customer.city ? ` | ${customer.city}` : ''}
                      {customer.country ? ` | ${customer.country}` : ''}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    <span
                      className={`pill ${customer.isActive ? 'pill-high' : 'pill-neutral'}`}
                    >
                      {customer.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="pill pill-neutral">
                      {customer.openOpportunityCount} open signals
                    </span>
                  </div>
                </div>
                <dl className="duplicate-product-details">
                  <div>
                    <dt>Contact preview</dt>
                    <dd>{customer.contactEmailPreview ?? 'No email stored'}</dd>
                  </div>
                  <div>
                    <dt>Sales records</dt>
                    <dd>{customer.salesRecordCount}</dd>
                  </div>
                  <div>
                    <dt>Last sale</dt>
                    <dd>{formatDate(customer.lastSaleAt)}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDate(customer.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="actions">
                  <Link
                    className="button"
                    href={`/dashboard/customers/${encodeURIComponent(customer.id)}`}
                  >
                    Open detail
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="actions">
          {customers.page > 1 ? (
            <Link
              className="button"
              href={buildCustomersHref({
                ...filters,
                page: customers.page - 1,
              })}
            >
              Previous
            </Link>
          ) : null}
          {customers.hasMore ? (
            <Link
              className="button"
              href={buildCustomersHref({
                ...filters,
                page: customers.page + 1,
              })}
            >
              Next
            </Link>
          ) : null}
        </div>
      </section>
    </section>
  );
}
