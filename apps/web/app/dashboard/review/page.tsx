import Link from 'next/link';

import { listReviewWorkflowItems, type ReviewWorkflowListItem } from '../../../lib/reviewApi';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    sort?: string;
    message?: string;
    error?: string;
    dealId?: string;
  }>;
};

type ReviewEmailGroup = {
  id: string;
  fromEmail: string;
  subject: string;
  receivedAt: string | null;
  rowCount: number;
  highestPriority: string;
  primaryReason: string;
  items: ReviewWorkflowListItem[];
};

type ReviewQueueSummary = {
  received: string;
  reason: string;
  nextStep: string;
};

type ReviewQueueSortMode = 'priority' | 'stale';

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function normalizeReviewQueueSortMode(value: string | undefined): ReviewQueueSortMode {
  return value === 'stale' ? 'stale' : 'priority';
}

function buildReviewReturnTo(sortMode: ReviewQueueSortMode): string {
  return sortMode === 'stale' ? '/dashboard/review?sort=stale' : '/dashboard/review';
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
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

function renderValue(value: string | null | undefined, fallback = 'Not available') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function formatPriorityLabel(value: string): string {
  switch (value.trim().toUpperCase()) {
    case 'HIGH':
      return 'Ready to review';
    case 'MEDIUM':
      return 'Needs checking';
    case 'LOW':
      return 'Lower priority';
    default:
      return 'Needs review';
  }
}

function formatOperatorReason(reason: string | null | undefined): string {
  switch ((reason ?? '').trim().toLowerCase()) {
    case 'deterministic_row_low_confidence':
    case 'low_confidence':
      return 'Low confidence';
    case 'failed_parse':
      return 'Could not read automatically';
    case 'pending_review':
      return 'Needs review';
    case 'unresolved_supplier':
      return 'Missing supplier match';
    case 'weak_product_match':
      return 'Product match needs checking';
    case 'missing_price':
      return 'Price not found';
    case 'missing_currency':
      return 'Currency not found';
    case 'conflicting_supplier_cues':
      return 'Supplier details conflict';
    case 'source_trust_too_low':
      return 'Source needs checking';
    case 'ocr_text_too_weak':
      return 'Could not read attachment clearly';
    case 'weak_structured_content':
      return 'Email layout was hard to read';
    case 'promotion_threshold_missing_or_weak_fields':
      return 'Check prices before approving';
    case '':
      return 'Needs review';
    default:
      return reason ?? 'Needs review';
  }
}

function buildReviewQueueSummary(group: ReviewEmailGroup): ReviewQueueSummary {
  const reason = formatOperatorReason(group.primaryReason);
  const subject = renderValue(group.subject, 'Supplier email');
  const sender = renderValue(group.fromEmail, 'Unknown supplier');
  const receivedAt = formatDateTime(group.receivedAt);
  const received = `${subject} from ${sender}${receivedAt ? `, received ${receivedAt}` : ''}.`;
  const rowText = `${group.rowCount} ${group.rowCount === 1 ? 'offer needs' : 'offers need'} checking.`;

  return {
    received,
    reason,
    nextStep: `${rowText} Open the email, check prices and supplier details, then approve or reject.`,
  };
}

function groupWorkflowItemsByInboundEmail(
  items: ReviewWorkflowListItem[],
  sortMode: ReviewQueueSortMode,
): ReviewEmailGroup[] {
  const groups = new Map<string, ReviewEmailGroup>();

  for (const item of items) {
    const inboundEmailId = item.inboundEmailId ?? item.inboundEmail?.id ?? item.id;
    const existing = groups.get(inboundEmailId);
    const nextReason =
      item.sourceReviewReason ?? item.qualificationRiskNote ?? item.latestNote ?? 'Needs review.';

    if (!existing) {
      groups.set(inboundEmailId, {
        id: inboundEmailId,
        fromEmail: item.inboundEmail?.fromEmail ?? 'Unknown supplier',
        subject: item.inboundEmail?.subject ?? item.emailDerivedOffer?.rawProductText ?? item.id,
        receivedAt: item.inboundEmail?.receivedAt ?? null,
        rowCount: 1,
        highestPriority: item.priority,
        primaryReason: nextReason,
        items: [item],
      });
      continue;
    }

    existing.rowCount += 1;
    existing.items.push(item);

    if ((PRIORITY_ORDER[item.priority] ?? 9) < (PRIORITY_ORDER[existing.highestPriority] ?? 9)) {
      existing.highestPriority = item.priority;
    }
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftPriority = PRIORITY_ORDER[left.highestPriority] ?? 9;
    const rightPriority = PRIORITY_ORDER[right.highestPriority] ?? 9;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return sortMode === 'stale'
      ? (left.receivedAt ?? '').localeCompare(right.receivedAt ?? '')
      : (right.receivedAt ?? '').localeCompare(left.receivedAt ?? '');
  });
}

export default async function ReviewQueuePage({ searchParams }: PageProps) {
  const query = searchParams ? await searchParams : undefined;
  const sortMode = normalizeReviewQueueSortMode(query?.sort);
  const returnTo = buildReviewReturnTo(sortMode);

  try {
    const items = await listReviewWorkflowItems({
      staleFirst: sortMode === 'stale',
    });
    const emailGroups = groupWorkflowItemsByInboundEmail(items, sortMode);

    return (
      <section className="review-layout">
        <div className="review-header">
          <div>
            <p className="eyebrow">Review</p>
            <h2 className="title">Supplier emails to check</h2>
            <p className="copy">
              Review new supplier offers before they are added to the system.
            </p>
          </div>
        </div>

        <div className="dashboard-filter-row">
          <span className="dashboard-filter-label">Order queue:</span>
          <Link
            className={`pill ${sortMode === 'priority' ? 'pill-high' : 'pill-neutral'}`}
            href="/dashboard/review"
          >
            Priority first
          </Link>
          <Link
            className={`pill ${sortMode === 'stale' ? 'pill-high' : 'pill-neutral'}`}
            href="/dashboard/review?sort=stale"
          >
            Stale first
          </Link>
        </div>

        {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
        {query?.message ? (
          <p className="alert alert-success">
            {query.message}
            {query.dealId ? (
              <>
                {' '}
                <Link href="/dashboard/deals">Open deal</Link>
              </>
            ) : null}
          </p>
        ) : null}

        {emailGroups.length === 0 ? (
          <section className="panel">
            <p className="eyebrow">All clear</p>
            <h3 className="section-title">Nothing needs review right now.</h3>
            <p className="copy">
              New supplier emails will appear here when prices, products, or supplier details need an operator check.
            </p>
          </section>
        ) : (
          <div className="review-grid">
            {emailGroups.map((group) => {
              const summary = buildReviewQueueSummary(group);

              return (
              <Link
                className="review-card"
                href={`/dashboard/review/${group.id}?returnTo=${encodeURIComponent(returnTo)}`}
                key={group.id}
              >
                <div className="review-card-top">
                  <span className={`pill pill-${group.highestPriority.toLowerCase()}`}>
                    {formatPriorityLabel(group.highestPriority)}
                  </span>
                  <span className="pill pill-neutral">
                    {group.rowCount} {group.rowCount === 1 ? 'offer' : 'offers'}
                  </span>
                </div>
                <h3 className="review-card-title">{renderValue(group.subject, 'Supplier email')}</h3>
                <p className="review-card-meta">
                  {renderValue(group.fromEmail, 'Unknown supplier')}
                  {group.receivedAt ? ` • ${formatDateTime(group.receivedAt)}` : ''}
                </p>
                <div className="review-card-summary">
                  <div>
                    <p className="review-card-label">What was received</p>
                    <p className="review-card-copy">{summary.received}</p>
                  </div>
                  <div>
                    <p className="review-card-label">Needs checking</p>
                    <p className="review-card-copy">{summary.reason}</p>
                  </div>
                  <div>
                    <p className="review-card-label">What to do next</p>
                    <p className="review-card-copy">{summary.nextStep}</p>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Review</p>
        <h2 className="title">Review queue unavailable</h2>
        <p className="copy">{error instanceof Error ? error.message : 'Failed to load review workflows.'}</p>
      </section>
    );
  }
}
