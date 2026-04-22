import Link from 'next/link';

import { listReviewWorkflowItems, type ReviewWorkflowListItem } from '../../../lib/reviewApi';

export const dynamic = 'force-dynamic';

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

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function groupWorkflowItemsByInboundEmail(items: ReviewWorkflowListItem[]): ReviewEmailGroup[] {
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

    return (right.receivedAt ?? '').localeCompare(left.receivedAt ?? '');
  });
}

export default async function ReviewQueuePage() {
  try {
    const items = await listReviewWorkflowItems();
    const emailGroups = groupWorkflowItemsByInboundEmail(items);

    return (
      <section className="review-layout">
        <div className="review-header">
          <div>
            <p className="eyebrow">Manual Review</p>
            <h2 className="title">Pending Supplier Emails</h2>
            <p className="copy">
              Review one inbound supplier email at a time instead of opening a separate card for
              every extracted spreadsheet row.
            </p>
          </div>
        </div>

        {emailGroups.length === 0 ? (
          <section className="panel">
            <p className="copy">No open supplier emails need manual review right now.</p>
          </section>
        ) : (
          <div className="review-grid">
            {emailGroups.map((group) => (
              <Link className="review-card" href={`/dashboard/review/${group.id}`} key={group.id}>
                <div className="review-card-top">
                  <span className={`pill pill-${group.highestPriority.toLowerCase()}`}>
                    {group.highestPriority}
                  </span>
                  <span className="pill pill-neutral">{group.rowCount} rows</span>
                </div>
                <h3 className="review-card-title">{group.subject}</h3>
                <p className="review-card-meta">
                  {group.fromEmail}
                  {group.receivedAt ? ` | ${group.receivedAt}` : ''}
                </p>
                <p className="review-card-copy">{group.primaryReason}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Manual Review</p>
        <h2 className="title">Review Queue Unavailable</h2>
        <p className="copy">{error instanceof Error ? error.message : 'Failed to load review workflows.'}</p>
      </section>
    );
  }
}
