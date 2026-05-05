import Link from 'next/link';

import {
  getPipelineDiagnosticsSummary,
  type DiagnosticsCommercialIntelItem,
  type DiagnosticsInboundEmail,
  type DiagnosticsOpportunity,
  type DiagnosticsSupplierPriceItem,
  type PipelineWindowDiagnostics,
} from '../../../lib/diagnosticsApi';

export const dynamic = 'force-dynamic';

function humanizeValue(value: string | null | undefined) {
  if (!value) {
    return 'Not found';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatMoney(value: number | string | null | undefined, currencyCode?: string | null) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return 'Not found';
  }

  return currencyCode?.trim()
    ? `${currencyCode.trim().toUpperCase()} ${numericValue.toFixed(2)}`
    : numericValue.toFixed(2);
}

function truncateText(value: string | null | undefined, maxLength = 150) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) {
    return 'Not found';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function MetricCard({ label, note, value }: { label: string; note: string; value: number | string }) {
  return (
    <article className="dashboard-summary-card">
      <p className="dashboard-summary-value">{value}</p>
      <p className="dashboard-summary-label">{label}</p>
      <p className="dashboard-summary-note">{note}</p>
    </article>
  );
}

function renderCountList(items: Array<{ name: string; count: number }>, emptyText: string) {
  if (items.length === 0) {
    return <p className="dashboard-triage-meta">{emptyText}</p>;
  }

  return (
    <ul className="dashboard-signal-list">
      {items.map((item) => (
        <li key={item.name}>
          {humanizeValue(item.name)}: {item.count}
        </li>
      ))}
    </ul>
  );
}

function EmailList({ emails }: { emails: DiagnosticsInboundEmail[] }) {
  if (emails.length === 0) {
    return <p className="copy">No matching emails in this window.</p>;
  }

  return (
    <div className="dashboard-opportunity-list">
      {emails.map((email) => (
        <article className="dashboard-opportunity-card" key={email.id}>
          <div className="dashboard-opportunity-top">
            <div>
              <p className="dashboard-opportunity-title">{email.subject || 'No subject'}</p>
              <p className="dashboard-opportunity-meta">{email.fromEmail}</p>
            </div>
            <span className="pill pill-neutral">{humanizeValue(email.processingStatus)}</span>
          </div>
          <p className="dashboard-triage-meta">
            Received {formatDateTime(email.receivedAt) ?? formatDateTime(email.createdAt) ?? 'recently'}
            {email.triageStatus ? ` | ${humanizeValue(email.triageStatus)}` : ''}
          </p>
          {email.reviewReason ? (
            <p className="dashboard-opportunity-copy">Reason: {email.reviewReason}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function CommercialIntelList({ items }: { items: DiagnosticsCommercialIntelItem[] }) {
  if (items.length === 0) {
    return <p className="copy">No commercial notes found in this window.</p>;
  }

  return (
    <div className="dashboard-opportunity-list">
      {items.map((item) => (
        <article className="dashboard-opportunity-card" key={item.id}>
          <div className="dashboard-opportunity-top">
            <div>
              <p className="dashboard-opportunity-title">{humanizeValue(item.itemType)}</p>
              <p className="dashboard-opportunity-meta">
                {[item.productText, item.supplierName, item.customerName].filter(Boolean).join(' | ') ||
                  'No linked entity'}
              </p>
            </div>
            <div className="dashboard-opportunity-badges">
              <span className="pill pill-neutral">{humanizeValue(item.status)}</span>
              <span className="pill pill-neutral">{humanizeValue(item.confidence)}</span>
            </div>
          </div>
          <p className="dashboard-opportunity-copy">{truncateText(item.evidenceText)}</p>
          <div className="actions">
            <Link className="button" href={`/dashboard/commercial-intel/${item.id}`}>
              Open note
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function SupplierPriceList({ items }: { items: DiagnosticsSupplierPriceItem[] }) {
  if (items.length === 0) {
    return <p className="copy">No supplier price records were created in this window.</p>;
  }

  return (
    <div className="dashboard-opportunity-list">
      {items.map((item) => (
        <article className="dashboard-opportunity-card" key={item.id}>
          <div className="dashboard-opportunity-top">
            <div>
              <p className="dashboard-opportunity-title">{item.product?.name ?? item.rawProductName}</p>
              <p className="dashboard-opportunity-meta">{item.supplier?.name ?? 'Supplier not linked'}</p>
            </div>
            <span className="pill pill-high">{formatMoney(item.unitPrice, item.currencyCode)}</span>
          </div>
          <p className="dashboard-triage-meta">
            Created {formatDateTime(item.createdAt) ?? 'recently'}
          </p>
        </article>
      ))}
    </div>
  );
}

function OpportunityList({ items }: { items: DiagnosticsOpportunity[] }) {
  if (items.length === 0) {
    return <p className="copy">No signals were created in this window.</p>;
  }

  return (
    <div className="dashboard-opportunity-list">
      {items.map((item) => (
        <article className="dashboard-opportunity-card" key={item.id}>
          <div className="dashboard-opportunity-top">
            <div>
              <p className="dashboard-opportunity-title">{item.title}</p>
              <p className="dashboard-opportunity-meta">
                {item.product?.name ?? 'Product not linked'}
                {item.supplier?.name ? ` | ${item.supplier.name}` : ''}
              </p>
            </div>
            <div className="dashboard-opportunity-badges">
              <span className="pill pill-neutral">{humanizeValue(item.type)}</span>
              <span className="pill pill-high">Score {item.score}</span>
            </div>
          </div>
          <p className="dashboard-triage-meta">
            Created {formatDateTime(item.createdAt) ?? 'recently'}
          </p>
        </article>
      ))}
    </div>
  );
}

function WindowSummary({ window }: { window: PipelineWindowDiagnostics }) {
  const mostCommonReviewReason = window.problems.topReviewReasons[0];

  return (
    <div className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">{window.label}</p>
            <h3 className="section-title">Pipeline health</h3>
            <p className="copy">
              Since {formatDateTime(window.since) ?? window.since}.
            </p>
          </div>
        </div>
        <div className="dashboard-summary-grid">
          <MetricCard
            label="Emails read"
            note="Inbound emails recorded by the bot."
            value={window.emailIntake.inboundEmailsReceived}
          />
          <MetricCard
            label="Offers found"
            note="Supplier offer rows staged from email or attachments."
            value={window.documentStaging.emailDerivedOffersCreated}
          />
          <MetricCard
            label="Commercial notes found"
            note="Dad-style market knowledge extracted from email."
            value={window.commercialIntel.commercialIntelItemsCreated}
          />
          <MetricCard
            label="Waiting for review"
            note="Open supplier-offer review workflow items."
            value={window.reviewWorkflow.openReviewWorkflowItems}
          />
          <MetricCard
            label="Approved into price intelligence"
            note="Best-effort count of reviewed email offers written to supplier prices."
            value={window.supplierPriceIntelligence.supplierPriceItemsFromEmailApprovedOffersBestEffort}
          />
          <MetricCard
            label="Signals created"
            note="New opportunity records created in this window."
            value={window.opportunities.opportunitiesCreated}
          />
          <MetricCard
            label="Failed emails"
            note="Emails that ended in a failed processing state."
            value={window.emailIntake.inboundEmailsFailed}
          />
          <MetricCard
            label="Most common review reason"
            note="Why items most often need a human."
            value={mostCommonReviewReason ? humanizeValue(mostCommonReviewReason.name) : 'None'}
          />
        </div>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Email pipeline</h3>
            <p className="copy">What happened after emails arrived.</p>
          </div>
        </div>
        <div className="dashboard-summary-grid">
          <MetricCard label="Ignored" note="Skipped as non-actionable." value={window.emailIntake.inboundEmailsIgnored} />
          <MetricCard label="Rejected" note="Rejected by triage or processing." value={window.emailIntake.inboundEmailsRejected} />
          <MetricCard label="Needs review" note="Emails left for human review." value={window.emailIntake.inboundEmailsReviewRequired} />
          <MetricCard label="Documents created" note="Body/attachment documents stored." value={window.documentStaging.inboundEmailDocumentsCreated} />
          <MetricCard label="Extraction runs" note="Deterministic or AI extraction runs recorded." value={window.documentStaging.extractionRunsCreated} />
          <MetricCard label="AI fallback runs" note="Best-effort count from AI fallback extraction runs." value={window.aiParserVisibility.aiFallbackAttemptedBestEffort} />
        </div>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Offers</h3>
            <p className="copy">Whether supplier rows became review items or price intelligence.</p>
          </div>
        </div>
        <div className="dashboard-summary-grid">
          <MetricCard label="Auto-promoted" note="Clean offers written without review." value={window.documentStaging.autoPromotedOffers} />
          <MetricCard label="Review-required offers" note="Offer rows that need checking." value={window.documentStaging.reviewRequiredOffers} />
          <MetricCard label="Rejected offers" note="Offer rows rejected by staging." value={window.documentStaging.rejectedOffers} />
          <MetricCard label="Price records created" note="All supplier price items created." value={window.supplierPriceIntelligence.supplierPriceItemsCreated} />
          <MetricCard label="AI-assisted offers" note="Offer candidates that came from AI extraction." value={window.aiParserVisibility.aiAssistedOfferCount} />
          <MetricCard label="AI fallback used" note="Best-effort count using AI-assisted offer rows." value={window.aiParserVisibility.aiFallbackUsedBestEffort} />
        </div>
        <div className="dashboard-section-header technical-details-card">
          <div>
            <h4 className="subsection-title">Latest supplier price records</h4>
            <p className="copy">Newest price intelligence written in this window.</p>
          </div>
        </div>
        <SupplierPriceList items={window.supplierPriceIntelligence.latestSupplierPriceItems} />
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Commercial intel</h3>
            <p className="copy">Review-first market knowledge and business notes.</p>
          </div>
          <Link className="button" href="/dashboard/commercial-intel">
            Open notes
          </Link>
        </div>
        <div className="dashboard-summary-grid">
          <MetricCard label="New" note="Waiting for a decision." value={window.commercialIntel.commercialIntelNew} />
          <MetricCard label="Approved" note="Accepted as internal context." value={window.commercialIntel.commercialIntelApproved} />
          <MetricCard label="Rejected" note="Marked not useful." value={window.commercialIntel.commercialIntelRejected} />
          <MetricCard label="Expired" note="No longer current." value={window.commercialIntel.commercialIntelExpired} />
          <MetricCard label="AI commercial notes" note="AI-assisted commercial intel items." value={window.aiParserVisibility.aiAssistedCommercialIntelCount} />
        </div>
        <div className="review-detail-grid technical-details-card">
          <div>
            <h4 className="subsection-title">By type</h4>
            {renderCountList(window.commercialIntel.commercialIntelByType, 'No commercial intel types yet.')}
          </div>
          <div>
            <h4 className="subsection-title">By confidence</h4>
            {renderCountList(window.commercialIntel.commercialIntelByConfidence, 'No confidence data yet.')}
          </div>
        </div>
        <div className="dashboard-section-header technical-details-card">
          <div>
            <h4 className="subsection-title">Latest commercial notes</h4>
            <p className="copy">Newest extracted knowledge items.</p>
          </div>
        </div>
        <CommercialIntelList items={window.commercialIntel.latestCommercialIntelItems} />
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Review queue</h3>
            <p className="copy">What operators are approving or rejecting.</p>
          </div>
          <Link className="button" href="/dashboard/review">
            Open review
          </Link>
        </div>
        <div className="dashboard-summary-grid">
          <MetricCard label="Approved to buy" note="Workflow items approved by operators." value={window.reviewWorkflow.approvedToBuyCount} />
          <MetricCard label="Rejected" note="Workflow items rejected by operators." value={window.reviewWorkflow.rejectedWorkflowCount} />
          <MetricCard label="Ordered" note="Approved items marked ordered." value={window.reviewWorkflow.orderedWorkflowCount} />
        </div>
        <div className="technical-details-card">
          <h4 className="subsection-title">Top review reasons</h4>
          {renderCountList(window.reviewWorkflow.topReviewReasons, 'No review reasons in this window.')}
        </div>
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Signals</h3>
            <p className="copy">Classic opportunities created from supplier prices, inventory, and sales.</p>
          </div>
          <Link className="button" href="/dashboard/opportunities">
            Open signals
          </Link>
        </div>
        <div className="dashboard-summary-grid">
          <MetricCard label="Open signals" note="Current open opportunities." value={window.opportunities.openOpportunities} />
          <MetricCard label="Signals created" note="New opportunities in this window." value={window.opportunities.opportunitiesCreated} />
        </div>
        <div className="review-detail-grid technical-details-card">
          <div>
            <h4 className="subsection-title">By signal type</h4>
            {renderCountList(window.opportunities.opportunitiesByType, 'No opportunity types in this window.')}
          </div>
        </div>
        <div className="dashboard-section-header technical-details-card">
          <div>
            <h4 className="subsection-title">Latest signals</h4>
            <p className="copy">Newest generated opportunities.</p>
          </div>
        </div>
        <OpportunityList items={window.opportunities.latestOpportunities} />
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Things stuck</h3>
            <p className="copy">Places where data stopped before becoming useful signal context.</p>
          </div>
        </div>
        <div className="review-detail-grid">
          <div>
            <h4 className="subsection-title">Missing-field reasons</h4>
            {renderCountList(window.problems.topMissingFieldReasons, 'No missing-field blockers found.')}
          </div>
          <div>
            <h4 className="subsection-title">Review reasons</h4>
            {renderCountList(window.problems.topReviewReasons, 'No review blockers found.')}
          </div>
        </div>

        <details className="document-card technical-details-card">
          <summary>Latest failed emails</summary>
          <div className="review-context">
            <EmailList emails={window.problems.latestFailedEmails} />
          </div>
        </details>

        <details className="document-card technical-details-card">
          <summary>Latest emails with no offers found</summary>
          <div className="review-context">
            <EmailList emails={window.problems.latestEmailsWithNoDerivedOffers} />
          </div>
        </details>

        <details className="document-card technical-details-card">
          <summary>Latest review items not yet in supplier prices</summary>
          <div className="review-context">
            {window.problems.latestReviewRequiredButNoSupplierPriceItem.length === 0 ? (
              <p className="copy">No open review-required offer rows in this window.</p>
            ) : (
              <div className="dashboard-opportunity-list">
                {window.problems.latestReviewRequiredButNoSupplierPriceItem.map((item) => (
                  <article className="dashboard-opportunity-card" key={item.id}>
                    <p className="dashboard-opportunity-title">
                      {item.emailDerivedOffer?.rawProductText ?? 'Unknown product'}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      Supplier: {item.emailDerivedOffer?.supplierCandidate ?? 'Not found'}
                    </p>
                    <p className="dashboard-opportunity-copy">
                      Reason: {item.sourceReviewReason ?? item.emailDerivedOffer?.reviewReason ?? item.latestNote ?? 'Needs review'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}

export default async function DiagnosticsPage() {
  try {
    const summary = await getPipelineDiagnosticsSummary();

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Diagnostics</p>
              <h2 className="title">Pipeline health</h2>
              <p className="copy">
                A read-only view of whether emails are becoming offers, commercial notes,
                price intelligence, reviews, and signals.
              </p>
            </div>
            <span className="pill pill-neutral">
              Refreshed {formatDateTime(summary.generatedAt) ?? 'recently'}
            </span>
          </div>
          <p className="alert alert-success">
            This page only reads internal records. It does not call OpenAI, poll email,
            send messages, or change business data.
          </p>
        </section>

        <WindowSummary window={summary.windows.last24h} />
        <WindowSummary window={summary.windows.last7d} />
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Diagnostics</p>
        <h2 className="title">Diagnostics unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load pipeline diagnostics.'}
        </p>
      </section>
    );
  }
}
