import Link from 'next/link';

import {
  listReviewQueueItems,
  listReviewWorkflowItems,
  type ReviewQueueItem,
  type ReviewWorkflowListItem,
} from '../../../lib/reviewApi';
import {
  formatSafeSenderLabel,
  redactDashboardText,
  summarizeCommercialActionState,
} from '../../../lib/operatorTrust';
import {
  countReviewQueueFilters,
  filterReviewWorkflowItems,
  normalizeReviewQueueFilter,
  reviewQueueFilterMap,
  reviewQueueFilterDefinitions,
  type ReviewQueueFilterKey,
} from '../../../lib/reviewQueueFilters';
import { requireCurrentWebCapability } from '../../../lib/serverWebAuth';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    sort?: string;
    filter?: string;
    message?: string;
    error?: string;
    dealId?: string;
  }>;
};

type ReviewEmailGroup = {
  id: string;
  senderLabel: string;
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

function normalizeReviewQueueSortMode(
  value: string | undefined,
): ReviewQueueSortMode {
  return value === 'stale' ? 'stale' : 'priority';
}

function buildReviewQueueHref(
  filter: ReviewQueueFilterKey,
  sortMode: ReviewQueueSortMode,
): string {
  const searchParams = new URLSearchParams();

  if (sortMode === 'stale') {
    searchParams.set('sort', 'stale');
  }

  if (filter !== 'all') {
    searchParams.set('filter', filter);
  }

  const query = searchParams.toString();

  return query ? `/dashboard/review?${query}` : '/dashboard/review';
}

function buildReviewReturnTo(
  filter: ReviewQueueFilterKey,
  sortMode: ReviewQueueSortMode,
): string {
  return buildReviewQueueHref(filter, sortMode);
}

function getAccountOpeningCaseId(item: ReviewQueueItem): string {
  return item.id.startsWith('account-opening-')
    ? item.id.slice('account-opening-'.length)
    : item.id;
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
    const inboundEmailId =
      item.inboundEmailId ?? item.inboundEmail?.id ?? item.id;
    const existing = groups.get(inboundEmailId);
    const nextReason =
      item.sourceReviewReason ??
      item.qualificationRiskNote ??
      item.latestNote ??
      'Needs review.';

    if (!existing) {
      groups.set(inboundEmailId, {
        id: inboundEmailId,
        senderLabel: formatSafeSenderLabel(item.inboundEmail?.fromEmail),
        subject:
          item.inboundEmail?.subject ??
          item.emailDerivedOffer?.rawProductText ??
          item.id,
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

    if (
      (PRIORITY_ORDER[item.priority] ?? 9) <
      (PRIORITY_ORDER[existing.highestPriority] ?? 9)
    ) {
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
  await requireCurrentWebCapability('review:view');

  const query = searchParams ? await searchParams : undefined;
  const sortMode = normalizeReviewQueueSortMode(query?.sort);
  const selectedFilter = normalizeReviewQueueFilter(query?.filter);
  const selectedFilterDefinition =
    reviewQueueFilterMap.get(selectedFilter) ??
    reviewQueueFilterMap.get('all')!;
  const returnTo = buildReviewReturnTo(selectedFilter, sortMode);

  try {
    const [items, reviewQueueItems] = await Promise.all([
      listReviewWorkflowItems({
        includeAllOpenStatuses: true,
        staleFirst: sortMode === 'stale',
      }),
      listReviewQueueItems(),
    ]);
    const filterCounts = countReviewQueueFilters(items);
    const filteredItems = filterReviewWorkflowItems(items, selectedFilter);
    const emailGroups = groupWorkflowItemsByInboundEmail(
      filteredItems,
      sortMode,
    );
    const accountOpeningItems = reviewQueueItems.filter(
      (item) => item.sourceType === 'ACCOUNT_OPENING',
    );
    const showAccountOpeningItems = selectedFilter === 'all';

    return (
      <section className="review-layout">
        <div className="review-header">
          <div>
            <p className="eyebrow">Review</p>
            <h2 className="title">Supplier emails to check</h2>
            <p className="copy">
              Review supplier offers and open account-opening cases in their
              dedicated workflow.
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

        <div className="dashboard-filter-row">
          <span className="dashboard-filter-label">Filter queue:</span>
          {reviewQueueFilterDefinitions.map((definition) => (
            <Link
              className={`pill ${selectedFilter === definition.key ? 'pill-high' : 'pill-neutral'}`}
              href={buildReviewQueueHref(definition.key, sortMode)}
              key={definition.key}
              title={definition.description}
            >
              {definition.label} ({filterCounts[definition.key]})
            </Link>
          ))}
        </div>
        <section className="panel dashboard-panel">
          <p className="eyebrow">Current filter</p>
          <h3 className="section-title">{selectedFilterDefinition.label}</h3>
          <p className="copy">
            {selectedFilterDefinition.description} Showing{' '}
            {filterCounts[selectedFilter]} matching supplier{' '}
            {filterCounts[selectedFilter] === 1 ? 'row' : 'rows'}.
          </p>
        </section>

        {query?.error ? (
          <p className="alert alert-error">
            {redactDashboardText(query.error)}
          </p>
        ) : null}
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

        {emailGroups.length === 0 &&
        (accountOpeningItems.length === 0 || !showAccountOpeningItems) ? (
          <section className="panel">
            <p className="eyebrow">All clear</p>
            <h3 className="section-title">
              {selectedFilterDefinition.emptyTitle}
            </h3>
            <p className="copy">{selectedFilterDefinition.emptyCopy}</p>
          </section>
        ) : (
          <>
            {showAccountOpeningItems && accountOpeningItems.length > 0 ? (
              <section className="review-section">
                <div className="dashboard-section-header">
                  <div>
                    <p className="eyebrow">Account opening</p>
                    <h3>Dedicated workflow</h3>
                  </div>
                </div>
                <div className="review-grid">
                  {accountOpeningItems.map((item) => {
                    const caseId = getAccountOpeningCaseId(item);

                    return (
                      <Link
                        className="review-card"
                        href={`/dashboard/account-opening/${encodeURIComponent(caseId)}?returnTo=${encodeURIComponent(returnTo)}`}
                        key={item.id}
                      >
                        <div className="review-card-top">
                          <span className="pill pill-high">
                            ACCOUNT OPENING
                          </span>
                          <span className="pill pill-neutral">
                            {item.processingStatus}
                          </span>
                        </div>
                        <h3 className="review-card-title">
                          {item.subject ?? 'Account opening form'}
                        </h3>
                        <p className="review-card-meta">
                          {formatSafeSenderLabel(item.sender)}
                          {item.receivedAt
                            ? ` | ${formatDateTime(item.receivedAt)}`
                            : ''}
                        </p>
                        <p className="review-card-copy">
                          {item.reviewSummary?.reviewReason ?? item.reason}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {emailGroups.length > 0 ? (
              <section className="review-section">
                <div className="dashboard-section-header">
                  <div>
                    <p className="eyebrow">Supplier review</p>
                    <h3>Commercial email reviews</h3>
                  </div>
                </div>
                <div className="review-grid">
                  {emailGroups.map((group) => {
                    const actionState = summarizeCommercialActionState(
                      group.items[0]!,
                    );

                    return (
                      <Link
                        className="review-card"
                        href={`/dashboard/review/${group.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        key={group.id}
                      >
                        <div className="review-card-top">
                          <span
                            className={`pill pill-${group.highestPriority.toLowerCase()}`}
                          >
                            {group.highestPriority}
                          </span>
                          <span className="pill pill-neutral">
                            {group.rowCount}{' '}
                            {group.rowCount === 1 ? 'offer' : 'offers'}
                          </span>
                        </div>
                        <h3 className="review-card-title">{group.subject}</h3>
                        <p className="review-card-meta">
                          {group.senderLabel}
                          {group.receivedAt
                            ? ` | ${formatDateTime(group.receivedAt)}`
                            : ''}
                        </p>
                        <p className="review-card-meta">
                          Source: EMAIL_DERIVED_OFFER | State:{' '}
                          {actionState.label}
                        </p>
                        <p className="review-card-copy">
                          Needs checking because {group.primaryReason}
                        </p>
                        <p className="review-card-copy">
                          Next action: {actionState.blockedReason}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Review</p>
        <h2 className="title">Review queue unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? redactDashboardText(error.message)
            : 'Failed to load review workflows.'}
        </p>
      </section>
    );
  }
}
