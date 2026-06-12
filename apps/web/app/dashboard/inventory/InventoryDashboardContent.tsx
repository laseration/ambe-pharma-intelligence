import Link from 'next/link';
import React from 'react';

import type {
  InventoryListResponse,
  StockRiskRow,
} from '../../../lib/inventoryApi';

type InventoryDashboardContentProps = {
  inventory: InventoryListResponse;
  stockRisk: StockRiskRow[];
  filters: {
    q: string;
    lowStockOnly: boolean;
    staleOnly: boolean;
    page: number;
  };
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatMoney(value: number | null, currencyCode = 'GBP') {
  if (value === null) {
    return 'n/a';
  }

  return `${currencyCode} ${value.toFixed(2)}`;
}

function buildInventoryHref(input: {
  q?: string;
  lowStockOnly?: boolean;
  staleOnly?: boolean;
  page?: number;
}) {
  const searchParams = new URLSearchParams();

  if (input.q?.trim()) {
    searchParams.set('q', input.q.trim());
  }

  if (input.lowStockOnly) {
    searchParams.set('lowStockOnly', 'true');
  }

  if (input.staleOnly) {
    searchParams.set('staleOnly', 'true');
  }

  if (input.page && input.page > 1) {
    searchParams.set('page', String(input.page));
  }

  const query = searchParams.toString();
  return `/dashboard/inventory${query ? `?${query}` : ''}`;
}

function riskPillClass(riskScore: number) {
  if (riskScore >= 70) {
    return 'pill-high';
  }

  if (riskScore >= 35) {
    return 'pill-medium';
  }

  return 'pill-neutral';
}

export function InventoryDashboardContent({
  inventory,
  stockRisk,
  filters,
}: InventoryDashboardContentProps) {
  const activeFilterCount =
    (filters.q ? 1 : 0) +
    (filters.lowStockOnly ? 1 : 0) +
    (filters.staleOnly ? 1 : 0);

  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2 className="title">Stock and Snapshot Freshness</h2>
            <p className="copy">
              Read-only inventory summaries from the latest stored snapshots,
              with deterministic stock-risk signals for operator triage.
            </p>
          </div>
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
        </div>

        <form action="/dashboard/inventory" className="action-form">
          <label>
            Search inventory
            <input
              defaultValue={filters.q}
              name="q"
              placeholder="Product, supplier, SKU, warehouse"
              type="search"
            />
          </label>
          <label className="checkbox-label">
            <input
              defaultChecked={filters.lowStockOnly}
              name="lowStockOnly"
              type="checkbox"
              value="true"
            />
            Low stock only
          </label>
          <label className="checkbox-label">
            <input
              defaultChecked={filters.staleOnly}
              name="staleOnly"
              type="checkbox"
              value="true"
            />
            Stale snapshots only
          </label>
          <button className="button button-primary" type="submit">
            Apply filters
          </button>
          {activeFilterCount > 0 ? (
            <Link className="button" href="/dashboard/inventory">
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Stock Risk</p>
            <h3 className="section-title">Products needing stock attention</h3>
            <p className="copy">
              Reasons are generated from low stock, stale snapshots, recent
              sales velocity, open opportunity signals, or missing recent
              snapshots.
            </p>
          </div>
          <span className="pill pill-neutral">{stockRisk.length} risks</span>
        </div>

        {stockRisk.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No stock risk rows returned</p>
            <p className="dashboard-proof-copy">
              Risk rows appear after inventory, sales, or opportunity data
              creates a deterministic reason to review stock.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {stockRisk.map((row) => (
              <article
                className="dashboard-opportunity-card"
                key={`${row.product.id}-${row.warehouseCode ?? 'missing'}-${row.snapshotDate ?? 'none'}`}
              >
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {row.product.name}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {row.supplier?.name ?? 'No supplier context'}
                      {row.warehouseCode ? ` | ${row.warehouseCode}` : ''}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    <span className={`pill ${riskPillClass(row.riskScore)}`}>
                      Risk {row.riskScore}
                    </span>
                    <span className="pill pill-neutral">
                      {row.quantityAvailable === null
                        ? 'No recent quantity'
                        : `${row.quantityAvailable} available`}
                    </span>
                  </div>
                </div>
                <p className="dashboard-triage-meta">
                  Snapshot {formatDateTime(row.snapshotDate)}
                  {row.recentSalesQuantity > 0
                    ? ` | recent sales ${row.recentSalesQuantity}`
                    : ''}
                  {row.openOpportunityCount > 0
                    ? ` | ${row.openOpportunityCount} open signal(s)`
                    : ''}
                </p>
                <ul className="dashboard-signal-list">
                  {row.reasons.map((reason) => (
                    <li key={`${reason.code}-${reason.message}`}>
                      {reason.message}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Latest Inventory</p>
            <h3 className="section-title">Snapshot summaries</h3>
            <p className="copy">
              Showing page {inventory.page} with up to {inventory.limit} rows.
            </p>
          </div>
          <span className="pill pill-neutral">
            {inventory.items.length} rows
          </span>
        </div>

        {inventory.items.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No inventory rows found</p>
            <p className="dashboard-proof-copy">
              Import inventory data or adjust the current filters.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {inventory.items.map((item) => (
              <article className="dashboard-opportunity-card" key={item.id}>
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {item.product.name}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {item.product.sku ? `${item.product.sku} | ` : ''}
                      {item.supplier?.name ?? 'No supplier context'}
                      {' | '}
                      {item.warehouseCode}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    {item.lowStock ? (
                      <span className="pill pill-high">Low stock</span>
                    ) : null}
                    {item.stale ? (
                      <span className="pill pill-medium">Stale</span>
                    ) : null}
                    <span className="pill pill-neutral">
                      {item.quantityAvailable} available
                    </span>
                  </div>
                </div>
                <dl className="duplicate-product-details">
                  <div>
                    <dt>On hand</dt>
                    <dd>{item.quantityOnHand}</dd>
                  </div>
                  <div>
                    <dt>Reserved</dt>
                    <dd>{item.quantityReserved}</dd>
                  </div>
                  <div>
                    <dt>Snapshot</dt>
                    <dd>
                      {formatDateTime(item.snapshotDate)} ({item.ageDays}d)
                    </dd>
                  </div>
                  <div>
                    <dt>Total value</dt>
                    <dd>{formatMoney(item.totalValue)}</dd>
                  </div>
                </dl>
                <p className="dashboard-summary-note">
                  Source row product: {item.source.rawProductName}
                  {item.source.rawSupplierName
                    ? ` | supplier: ${item.source.rawSupplierName}`
                    : ''}
                </p>
              </article>
            ))}
          </div>
        )}

        <div className="actions">
          {inventory.page > 1 ? (
            <Link
              className="button"
              href={buildInventoryHref({
                ...filters,
                page: inventory.page - 1,
              })}
            >
              Previous
            </Link>
          ) : null}
          {inventory.hasMore ? (
            <Link
              className="button"
              href={buildInventoryHref({
                ...filters,
                page: inventory.page + 1,
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
