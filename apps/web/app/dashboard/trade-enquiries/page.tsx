import Link from 'next/link';

import {
  listBuyerTradeEnquiries,
  type BuyerTradeEnquiryListItem,
  type BuyerTradeEnquiryPriority,
  type BuyerTradeEnquiryStatus,
} from '../../../lib/tradeEnquiriesApi';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    company?: string;
    createdFrom?: string;
    createdTo?: string;
    error?: string;
    priority?: string;
    status?: string;
  }>;
};

const STATUS_OPTIONS: Array<{
  label: string;
  value: BuyerTradeEnquiryStatus | null;
}> = [
  { label: 'All', value: null },
  { label: 'New', value: 'NEW' },
  { label: 'Reviewing', value: 'REVIEWING' },
  { label: 'Matched', value: 'MATCHED' },
  { label: 'Quoted', value: 'QUOTED' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Duplicate', value: 'DUPLICATE' },
  { label: 'Spam', value: 'SPAM' },
  { label: 'Archived', value: 'ARCHIVED' },
];

const PRIORITY_OPTIONS: Array<{
  label: string;
  value: BuyerTradeEnquiryPriority | null;
}> = [
  { label: 'All priorities', value: null },
  { label: 'Urgent', value: 'URGENT' },
  { label: 'High', value: 'HIGH' },
  { label: 'Normal', value: 'NORMAL' },
  { label: 'Low', value: 'LOW' },
];

function normalizeStatus(value: string | undefined) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

function normalizePriority(value: string | undefined) {
  return (
    PRIORITY_OPTIONS.find((option) => option.value === value)?.value ?? null
  );
}

function normalizeDateInput(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not provided';
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

function statusPillClass(status: BuyerTradeEnquiryStatus) {
  switch (status) {
    case 'NEW':
    case 'REVIEWING':
      return 'pill-high';
    case 'MATCHED':
    case 'QUOTED':
      return 'pill-medium';
    case 'CLOSED':
    case 'ARCHIVED':
      return 'pill-low';
    case 'REJECTED':
    case 'DUPLICATE':
    case 'SPAM':
      return 'pill-neutral';
  }
}

function priorityPillClass(priority: BuyerTradeEnquiryPriority) {
  switch (priority) {
    case 'URGENT':
      return 'pill-high';
    case 'HIGH':
      return 'pill-medium';
    case 'NORMAL':
      return 'pill-neutral';
    case 'LOW':
      return 'pill-low';
  }
}

function compactRequirement(item: BuyerTradeEnquiryListItem): string {
  return [item.productName, item.strength, item.packSize]
    .filter((value): value is string => Boolean(value))
    .join(' | ');
}

function EnquiryFilters({
  company,
  createdFrom,
  createdTo,
  priority,
  status,
}: {
  company: string;
  createdFrom: string;
  createdTo: string;
  priority: BuyerTradeEnquiryPriority | null;
  status: BuyerTradeEnquiryStatus | null;
}) {
  return (
    <form className="dashboard-filter-form" method="get">
      <label>
        <span>Status</span>
        <select defaultValue={status ?? ''} name="status">
          {STATUS_OPTIONS.map((option) => (
            <option key={option.label} value={option.value ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Priority</span>
        <select defaultValue={priority ?? ''} name="priority">
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.label} value={option.value ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Company</span>
        <input
          defaultValue={company}
          name="company"
          placeholder="Company contains"
          type="search"
        />
      </label>
      <label>
        <span>From</span>
        <input defaultValue={createdFrom} name="createdFrom" type="date" />
      </label>
      <label>
        <span>To</span>
        <input defaultValue={createdTo} name="createdTo" type="date" />
      </label>
      <button className="button" type="submit">
        Apply filters
      </button>
      <Link
        className="button button-secondary"
        href="/dashboard/trade-enquiries"
      >
        Clear
      </Link>
    </form>
  );
}

function EnquiryTable({ items }: { items: BuyerTradeEnquiryListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="dashboard-empty-state">
        <p className="dashboard-feature-title">No trade enquiries found</p>
        <p className="dashboard-feature-copy">
          Buyer RFQs submitted through Trade Access will appear here for manual
          review. Nothing is quoted or progressed automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Priority</th>
            <th>Company</th>
            <th>Requirement</th>
            <th>Quantity / Market</th>
            <th>Timing</th>
            <th>Contact</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <span className={`pill ${statusPillClass(item.status)}`}>
                  {item.status.replace('_', ' ')}
                </span>
              </td>
              <td>
                <span className={`pill ${priorityPillClass(item.priority)}`}>
                  {item.priority}
                </span>
              </td>
              <td>
                <Link href={`/dashboard/trade-enquiries/${item.id}`}>
                  <strong>{item.companyName}</strong>
                </Link>
                <br />
                <span>{item.businessType ?? 'Business type not provided'}</span>
              </td>
              <td>
                <strong>{compactRequirement(item)}</strong>
                {item.documentationNotes ? (
                  <>
                    <br />
                    <span>{item.documentationNotes}</span>
                  </>
                ) : null}
              </td>
              <td>
                <span>{item.quantityRequired ?? 'Quantity not provided'}</span>
                <br />
                <span>
                  {item.targetMarket ?? item.country ?? 'Market not provided'}
                </span>
              </td>
              <td>
                <span>Received {formatDateTime(item.createdAt)}</span>
                <br />
                <span>Required {formatDateTime(item.requiredBy)}</span>
              </td>
              <td>
                <strong>{item.contactName}</strong>
                <br />
                <a href={`mailto:${item.contactEmail}`}>{item.contactEmail}</a>
                {item.contactPhone ? (
                  <>
                    <br />
                    <a href={`tel:${item.contactPhone.replace(/\s+/g, '')}`}>
                      {item.contactPhone}
                    </a>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TradeEnquiriesPage({ searchParams }: PageProps) {
  const query = searchParams ? await searchParams : undefined;
  const selectedStatus = normalizeStatus(query?.status);
  const selectedPriority = normalizePriority(query?.priority);
  const company = query?.company?.trim() ?? '';
  const createdFrom = normalizeDateInput(query?.createdFrom) ?? '';
  const createdTo = normalizeDateInput(query?.createdTo) ?? '';

  try {
    const items = await listBuyerTradeEnquiries({
      ...(selectedStatus ? { status: selectedStatus } : {}),
      ...(selectedPriority ? { priority: selectedPriority } : {}),
      ...(company ? { company } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
      take: 100,
    });

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Trade enquiries</p>
              <h2 className="title">Buyer RFQs</h2>
              <p className="copy">
                Public Trade Access submissions for internal manual review.
                Availability, pricing, account approval, and order placement are
                never automatic from this queue.
              </p>
            </div>
            <Link className="button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>

          {query?.error ? (
            <p className="dashboard-inline-message dashboard-inline-message-error">
              {query.error}
            </p>
          ) : null}

          <EnquiryFilters
            company={company}
            createdFrom={createdFrom}
            createdTo={createdTo}
            priority={selectedPriority}
            status={selectedStatus}
          />

          <EnquiryTable items={items} />
        </section>
      </section>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Trade enquiries could not load.';

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Trade enquiries</p>
              <h2 className="title">Buyer RFQs</h2>
              <p className="copy">
                The dashboard could not read the protected trade enquiry queue.
              </p>
            </div>
            <Link className="button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
          <p className="dashboard-inline-message dashboard-inline-message-error">
            {message}
          </p>
        </section>
      </section>
    );
  }
}
