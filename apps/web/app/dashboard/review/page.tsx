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

type ReviewQueueSortMode = 'priority' | 'stale';

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function normalizeReviewQueueSortMode(value: string | undefined): ReviewQueueSortMode {
  return value === 'stale' ? 'stale' : 'priority';
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
        fromEmail: item.inboundEmail?.fromEmail ?? 'Unknown sender',
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
            <p className="copy">There are no supplier emails waiting for review.</p>
          </section>
        ) : (
          <div className="review-grid">
            {emailGroups.map((group) => (
              <Link className="review-card" href={`/dashboard/review/${group.id}`} key={group.id}>
                <div className="review-card-top">
                  <span className={`pill pill-${group.highestPriority.toLowerCase()}`}>
                    {group.highestPriority}
                  </span>
                  <span className="pill pill-neutral">
                    {group.rowCount} {group.rowCount === 1 ? 'offer' : 'offers'}
                  </span>
                </div>
                <h3 className="review-card-title">{group.subject}</h3>
                <p className="review-card-meta">
                  {group.fromEmail}
                  {group.receivedAt ? ` • ${formatDateTime(group.receivedAt)}` : ''}
                </p>
                <p className="review-card-copy">Needs checking because {group.primaryReason}</p>
              </Link>
            ))}
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
