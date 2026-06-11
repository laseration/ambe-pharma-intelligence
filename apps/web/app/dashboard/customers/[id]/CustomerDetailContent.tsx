import Link from 'next/link';
import React from 'react';

import type { CustomerDetail } from '../../../../lib/customersApi';

type CustomerDetailContentProps = {
  customer: CustomerDetail;
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

function formatMoney(value: number | null, currencyCode: string) {
  if (value === null) {
    return 'n/a';
  }

  return `${currencyCode} ${value.toFixed(2)}`;
}

export function CustomerDetailContent({
  customer,
}: CustomerDetailContentProps) {
  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Customer Detail</p>
            <h2 className="title">{customer.name}</h2>
            <p className="copy">
              Read-only customer context from stored sales, open opportunities,
              and matching trade enquiries.
            </p>
          </div>
          <Link className="button" href="/dashboard/customers">
            Back to customers
          </Link>
        </div>

        <div className="dashboard-summary-grid">
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-value">
              {customer.salesRecordCount}
            </p>
            <p className="dashboard-summary-label">Sales records</p>
            <p className="dashboard-summary-note">
              Last sale {formatDate(customer.lastSaleAt)}
            </p>
          </article>
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-value">
              {customer.openOpportunityCount}
            </p>
            <p className="dashboard-summary-label">Open opportunities</p>
            <p className="dashboard-summary-note">
              Signals are read-only from the opportunity engine.
            </p>
          </article>
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-value">
              {customer.tradeEnquiries.length}
            </p>
            <p className="dashboard-summary-label">Trade enquiries</p>
            <p className="dashboard-summary-note">
              Matching enquiries are based on stored company names.
            </p>
          </article>
        </div>

        <dl className="duplicate-product-details">
          <div>
            <dt>Legal entity</dt>
            <dd>{customer.legalEntityName ?? 'Not stored'}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {[customer.city, customer.country].filter(Boolean).join(', ') ||
                'Not stored'}
            </dd>
          </div>
          <div>
            <dt>Contact preview</dt>
            <dd>{customer.contactEmailPreview ?? 'No email stored'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{customer.isActive ? 'Active' : 'Inactive'}</dd>
          </div>
        </dl>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Sales Context</p>
            <h3 className="section-title">Recent sales</h3>
          </div>
          <span className="pill pill-neutral">
            {customer.recentSales.length} rows
          </span>
        </div>

        {customer.recentSales.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No recent sales returned</p>
            <p className="dashboard-proof-copy">
              Sales context appears after sales records are imported for this
              customer.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {customer.recentSales.map((sale) => (
              <article className="dashboard-opportunity-card" key={sale.id}>
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {sale.product.name}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {sale.product.sku ? `${sale.product.sku} | ` : ''}
                      {sale.supplier?.name ?? 'No supplier context'}
                    </p>
                  </div>
                  <span className="pill pill-neutral">Qty {sale.quantity}</span>
                </div>
                <dl className="duplicate-product-details">
                  <div>
                    <dt>Sale date</dt>
                    <dd>{formatDate(sale.saleDate)}</dd>
                  </div>
                  <div>
                    <dt>Unit price</dt>
                    <dd>{formatMoney(sale.unitPrice, sale.currencyCode)}</dd>
                  </div>
                  <div>
                    <dt>Total revenue</dt>
                    <dd>{formatMoney(sale.totalRevenue, sale.currencyCode)}</dd>
                  </div>
                  <div>
                    <dt>Manufacturer</dt>
                    <dd>{sale.product.manufacturer ?? 'Unknown'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Opportunity Context</p>
            <h3 className="section-title">Open signals</h3>
          </div>
          <span className="pill pill-neutral">
            {customer.openOpportunities.length} rows
          </span>
        </div>

        {customer.openOpportunities.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No open opportunities</p>
            <p className="dashboard-proof-copy">
              Open customer-linked opportunity context appears here when
              available.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {customer.openOpportunities.map((opportunity) => (
              <article
                className="dashboard-opportunity-card"
                key={opportunity.id}
              >
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {opportunity.title}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {opportunity.product?.name ?? 'No product context'}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    <span className="pill pill-neutral">
                      {opportunity.type.replace('_', ' ')}
                    </span>
                    <span className="pill pill-high">
                      Score {opportunity.score}
                    </span>
                  </div>
                </div>
                <p className="dashboard-triage-meta">
                  Updated {formatDate(opportunity.updatedAt)}
                  {opportunity.dueDate
                    ? ` | due ${formatDate(opportunity.dueDate)}`
                    : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">RFQ Context</p>
            <h3 className="section-title">Matching trade enquiries</h3>
          </div>
          <span className="pill pill-neutral">
            {customer.tradeEnquiries.length} rows
          </span>
        </div>

        {customer.tradeEnquiries.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No matching RFQs</p>
            <p className="dashboard-proof-copy">
              Matching trade enquiries appear here when stored company names
              line up with this customer.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {customer.tradeEnquiries.map((enquiry) => (
              <article className="dashboard-opportunity-card" key={enquiry.id}>
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {enquiry.productName}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {enquiry.companyName} | {enquiry.contactEmailPreview}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    <span className="pill pill-neutral">{enquiry.status}</span>
                    <span className="pill pill-medium">{enquiry.priority}</span>
                  </div>
                </div>
                <p className="dashboard-summary-note">
                  {[
                    enquiry.strength,
                    enquiry.packSize,
                    enquiry.quantityRequired,
                  ]
                    .filter(Boolean)
                    .join(' | ') || 'No structured quantity details'}
                </p>
                <p className="dashboard-triage-meta">
                  Created {formatDate(enquiry.createdAt)}
                  {enquiry.requiredBy
                    ? ` | required by ${formatDate(enquiry.requiredBy)}`
                    : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
