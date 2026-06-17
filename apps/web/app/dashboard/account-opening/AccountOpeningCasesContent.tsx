import Link from 'next/link';
import React from 'react';

import {
  StatusBadge,
  type BadgeVariant,
} from '../../components/dashboard/StatusBadge';
import type {
  AccountOpeningCaseListItem,
  AccountOpeningCaseListResponse,
} from '@ambe/shared';

export const ACCOUNT_OPENING_STATUS_FILTERS = [
  'PENDING_REVIEW',
  'NEEDS_INFO',
  'APPROVED_FOR_COMPLETION',
  'REJECTED',
  'CLOSED',
] as const;

type AccountOpeningCasesContentProps = {
  cases: AccountOpeningCaseListResponse;
  filters: {
    status: string;
    q: string;
  };
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pending review',
  NEEDS_INFO: 'Needs info',
  APPROVED_FOR_COMPLETION: 'Ready to complete',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'APPROVED_FOR_COMPLETION':
      return 'high';
    case 'PENDING_REVIEW':
    case 'NEEDS_INFO':
      return 'medium';
    case 'REJECTED':
      return 'low';
    default:
      return 'neutral';
  }
}

function caseTypeLabel(
  hint: AccountOpeningCaseListItem['caseTypeHint'],
): string {
  switch (hint) {
    case 'SUPPLIER':
      return 'Supplier onboarding';
    case 'CUSTOMER':
      return 'Customer onboarding';
    default:
      return 'Type unconfirmed';
  }
}

function sourceLabel(
  channel: AccountOpeningCaseListItem['sourceChannel'],
): string {
  return channel === 'EMAIL' ? 'Email / EML intake' : 'Manual';
}

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
    timeStyle: 'short',
  }).format(parsed);
}

function buildListHref(input: { status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (input.status) {
    params.set('status', input.status);
  }
  if (input.q?.trim()) {
    params.set('q', input.q.trim());
  }
  const query = params.toString();
  return `/dashboard/account-opening${query ? `?${query}` : ''}`;
}

export function AccountOpeningCasesContent({
  cases,
  filters,
}: AccountOpeningCasesContentProps) {
  const hasActiveFilters = Boolean(filters.q || filters.status);

  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Account Opening</p>
            <h2 className="title">Account Opening Cases</h2>
            <p className="copy">
              Read-only list of supplier and customer account-opening cases
              across every status. Open a case to review documents, safe
              suggestions, risk flags, and signing notes. This page never signs,
              sends, or submits anything.
            </p>
          </div>
          <div className="actions">
            <Link
              className="button button-primary"
              href="/dashboard/account-opening/new"
            >
              New case
            </Link>
            <Link className="button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="actions">
          <Link
            className={`pill ${filters.status === '' ? 'pill-high' : 'pill-neutral'}`}
            href={buildListHref({ q: filters.q })}
          >
            All statuses
          </Link>
          {ACCOUNT_OPENING_STATUS_FILTERS.map((status) => (
            <Link
              key={status}
              className={`pill ${
                filters.status === status ? 'pill-high' : 'pill-neutral'
              }`}
              href={buildListHref({ status, q: filters.q })}
            >
              {statusLabel(status)}
            </Link>
          ))}
        </div>

        <form action="/dashboard/account-opening" className="action-form">
          {filters.status ? (
            <input name="status" type="hidden" value={filters.status} />
          ) : null}
          <label>
            Search cases
            <input
              defaultValue={filters.q}
              name="q"
              placeholder="Company, counterparty email, or subject"
              type="search"
            />
          </label>
          <button className="button button-primary" type="submit">
            Apply
          </button>
          {hasActiveFilters ? (
            <Link className="button" href="/dashboard/account-opening">
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Cases</p>
            <h3 className="section-title">
              {filters.status ? statusLabel(filters.status) : 'All'} cases
            </h3>
            <p className="copy">
              Showing {cases.items.length} case
              {cases.items.length === 1 ? '' : 's'}
              {filters.q ? ` matching "${filters.q}"` : ''}.
            </p>
          </div>
          <span className="pill pill-neutral">{cases.total} shown</span>
        </div>

        {cases.items.length === 0 ? (
          <div className="dashboard-proof-callout">
            <p className="dashboard-proof-title">No account-opening cases</p>
            <p className="dashboard-proof-copy">
              Cases appear here once an account-opening pack is imported, or
              start one now with the “New case” button above.
            </p>
          </div>
        ) : (
          <div className="dashboard-opportunity-list">
            {cases.items.map((item) => (
              <article className="dashboard-opportunity-card" key={item.id}>
                <div className="dashboard-opportunity-top">
                  <div>
                    <p className="dashboard-opportunity-title">
                      {item.companyName ?? 'Unknown counterparty'}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      {caseTypeLabel(item.caseTypeHint)}
                      {item.counterpartyEmail
                        ? ` | ${item.counterpartyEmail}`
                        : ''}
                      {` | ${sourceLabel(item.sourceChannel)}`}
                    </p>
                  </div>
                  <div className="dashboard-opportunity-badges">
                    <StatusBadge variant={statusVariant(item.status)}>
                      {statusLabel(item.status)}
                    </StatusBadge>
                    <span
                      className={`pill ${
                        item.riskFlagCount > 0 ? 'pill-medium' : 'pill-neutral'
                      }`}
                    >
                      {item.riskFlagCount} risk flag
                      {item.riskFlagCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <dl className="duplicate-product-details">
                  <div>
                    <dt>Form type</dt>
                    <dd>{item.detectedFormType ?? 'Unclassified'}</dd>
                  </div>
                  <div>
                    <dt>Recommended signer</dt>
                    <dd>{item.recommendedSigner}</dd>
                  </div>
                  <div>
                    <dt>Subject</dt>
                    <dd>{item.subject ?? 'No subject'}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDate(item.updatedAt)}</dd>
                  </div>
                </dl>
                {item.riskFlagLabels.length > 0 ? (
                  <p className="dashboard-summary-note">
                    Risk flags: {item.riskFlagLabels.join(', ')}
                  </p>
                ) : null}
                <div className="actions">
                  <Link
                    className="button"
                    href={`/dashboard/account-opening/${encodeURIComponent(
                      item.id,
                    )}`}
                  >
                    Open case
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
