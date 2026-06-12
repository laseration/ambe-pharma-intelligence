import Link from 'next/link';

import {
  listInboundEmails,
  type InboundEmailInboxFilter,
  type InboundEmailInboxListItem,
} from '../../../lib/inboxApi';
import { requireCurrentWebCapability } from '../../../lib/serverWebAuth';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    status?: string;
  }>;
};

const FILTER_OPTIONS: Array<{
  label: string;
  value: InboundEmailInboxFilter | null;
}> = [
  { label: 'All', value: null },
  { label: 'Needs review', value: 'REVIEW_REQUIRED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Received only', value: 'RECEIVED_ONLY' },
];

function normalizeInboxFilter(
  value: string | undefined,
): InboundEmailInboxFilter | null {
  switch (value) {
    case 'REVIEW_REQUIRED':
    case 'FAILED':
    case 'RECEIVED_ONLY':
      return value;
    default:
      return null;
  }
}

function buildInboxReturnTo(
  activeFilter: InboundEmailInboxFilter | null,
): string {
  return activeFilter
    ? `/dashboard/inbox?status=${encodeURIComponent(activeFilter)}`
    : '/dashboard/inbox';
}

function formatDateTime(value: string | null | undefined) {
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

function formatPctScore(value: number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return `${value}%`;
}

function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function deriveInboxStatus(item: InboundEmailInboxListItem): {
  label: string;
  pillClassName: string;
} {
  if (item.processingStatus === 'REVIEW_REQUIRED') {
    return {
      label: 'Needs review',
      pillClassName: 'pill-high',
    };
  }

  if (item.processingStatus === 'FAILED') {
    return {
      label: 'Failed',
      pillClassName: 'pill-low',
    };
  }

  if (
    item.processingStatus === 'RECEIVED' &&
    item._count.derivedOffers === 0 &&
    item._count.offerWorkflowItems === 0
  ) {
    return {
      label: 'Received only',
      pillClassName: 'pill-neutral',
    };
  }

  if (item.processingStatus === 'AUTO_PROMOTED') {
    return {
      label: 'Auto processed',
      pillClassName: 'pill-high',
    };
  }

  if (item.processingStatus === 'REJECTED') {
    return {
      label: 'Rejected',
      pillClassName: 'pill-low',
    };
  }

  return {
    label: humanizeStatus(item.processingStatus),
    pillClassName: 'pill-medium',
  };
}

function buildConfidenceSummary(
  item: InboundEmailInboxListItem,
): string | null {
  const parts = [
    item.parserConfidence
      ? `Parser ${item.parserConfidence.toLowerCase()}`
      : null,
    item.sourceTrustScore !== null
      ? `Source trust ${formatPctScore(item.sourceTrustScore)}`
      : null,
    item.structureConfidence !== null
      ? `Structure ${formatPctScore(item.structureConfidence)}`
      : null,
    item.businessWorthinessScore !== null
      ? `Business value ${formatPctScore(item.businessWorthinessScore)}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' | ') : null;
}

export default async function BotInboxPage({ searchParams }: PageProps) {
  await requireCurrentWebCapability('inbox:view');

  const query = searchParams ? await searchParams : undefined;
  const activeFilter = normalizeInboxFilter(query?.status);
  const returnTo = buildInboxReturnTo(activeFilter);

  try {
    const emails = await listInboundEmails({
      status: activeFilter ?? undefined,
    });

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2 className="title">Emails sent to the bot</h2>
              <p className="copy">
                See what the bot received, parsed, ignored, or sent for review.
              </p>
            </div>
            <Link className="button" href="/dashboard/review">
              Open review
            </Link>
          </div>

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Show:</span>
            {FILTER_OPTIONS.map((option) => {
              const href = option.value
                ? `/dashboard/inbox?status=${encodeURIComponent(option.value)}`
                : '/dashboard/inbox';

              return (
                <Link
                  className={`pill ${activeFilter === option.value ? 'pill-high' : 'pill-neutral'}`}
                  href={href}
                  key={option.label}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </section>

        {emails.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No emails yet</h3>
            <p className="copy">
              When the bot receives emails, they will appear here.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Recent inbound emails</h3>
                <p className="copy">
                  {emails.length} recent{' '}
                  {emails.length === 1 ? 'email' : 'emails'} recorded.
                </p>
              </div>
              <span className="pill pill-neutral">{emails.length} shown</span>
            </div>

            <div className="dashboard-opportunity-list">
              {emails.map((email) => {
                const status = deriveInboxStatus(email);
                const senderLabel = email.fromName?.trim()
                  ? `${email.fromName.trim()} <${email.fromEmail}>`
                  : email.fromEmail;
                const confidenceSummary = buildConfidenceSummary(email);

                return (
                  <article
                    className="dashboard-opportunity-card"
                    key={email.id}
                  >
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          {email.subject?.trim() || 'No subject'}
                        </p>
                        <p className="dashboard-opportunity-meta">
                          {senderLabel}
                        </p>
                      </div>
                      <div className="dashboard-opportunity-badges">
                        <span className={`pill ${status.pillClassName}`}>
                          {status.label}
                        </span>
                        {email.triageStatus ? (
                          <span className="pill pill-neutral">
                            {humanizeStatus(email.triageStatus)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="dashboard-triage-meta">
                      Received{' '}
                      {formatDateTime(email.receivedAt) ??
                        formatDateTime(email.createdAt) ??
                        'recently'}
                      {email.processedAt
                        ? ` | Processed ${formatDateTime(email.processedAt)}`
                        : ''}
                    </p>

                    {email.reviewReason ? (
                      <p className="dashboard-opportunity-copy">
                        Review reason: {email.reviewReason}
                      </p>
                    ) : null}

                    {confidenceSummary ? (
                      <p className="dashboard-triage-meta">
                        {confidenceSummary}
                      </p>
                    ) : null}

                    <dl className="duplicate-product-details">
                      <div>
                        <dt>Offers found</dt>
                        <dd>{email._count.derivedOffers}</dd>
                      </div>
                      <div>
                        <dt>Review items</dt>
                        <dd>{email._count.offerWorkflowItems}</dd>
                      </div>
                      <div>
                        <dt>Documents</dt>
                        <dd>{email._count.documents}</dd>
                      </div>
                      <div>
                        <dt>Extraction runs</dt>
                        <dd>{email._count.extractionRuns}</dd>
                      </div>
                    </dl>

                    {email._count.offerWorkflowItems > 0 ? (
                      <div className="actions">
                        <Link
                          className="button"
                          href={`/dashboard/review/${email.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        >
                          Open review
                        </Link>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Inbox</p>
        <h2 className="title">Inbox unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load inbound bot emails.'}
        </p>
      </section>
    );
  }
}
