import Link from 'next/link';

import { getImportBatchDetail } from '../../../../lib/importsApi';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

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

function formatImportKind(value: string): string {
  return value.replaceAll('_', ' ');
}

function formatFileSize(value: number | null | undefined): string | null {
  if (value === null || value === undefined || value <= 0) {
    return null;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${value} B`;
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'pill-high';
    case 'COMPLETED_WITH_ERRORS':
      return 'pill-medium';
    default:
      return 'pill-low';
  }
}

function getNextAction(batch: {
  errorCount: number;
  warningCount: number;
  diagnostics: {
    dataQualityMetrics: {
      unresolvedProducts: number;
      duplicateCandidates: number;
    };
    suggestedFixes: string[];
  };
}): string {
  if (batch.errorCount > 0) {
    return batch.diagnostics.suggestedFixes[0] ?? 'Fix row errors and re-import.';
  }
  if (batch.diagnostics.dataQualityMetrics.unresolvedProducts > 0) {
    return 'Review unresolved product names before relying on downstream signals.';
  }
  if (batch.diagnostics.dataQualityMetrics.duplicateCandidates > 0) {
    return 'Check duplicate product candidate groups before using import-driven recommendations.';
  }
  if (batch.warningCount > 0) {
    return 'Review parser warnings, then use the import if the detected columns look right.';
  }
  return 'No immediate import follow-up is required.';
}

function formatRawRowSnippet(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.length > 400 ? `${value.slice(0, 400)}...` : value;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 400
      ? `${serialized.slice(0, 400)}...`
      : serialized;
  } catch {
    return null;
  }
}

export default async function ImportBatchDetailPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const batch = await getImportBatchDetail(id);

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Imports</p>
              <h2 className="title">Import Batch Detail</h2>
              <p className="copy">
                A bounded read-only view of one import batch, parser
                diagnostics, row samples, and suggested recovery steps.
              </p>
            </div>
            <Link className="button" href="/dashboard/imports">
              Back to imports
            </Link>
          </div>

          <div className="dashboard-opportunity-card">
            <div className="dashboard-opportunity-top">
              <div>
                <p className="dashboard-opportunity-title">{batch.fileName}</p>
                <p className="dashboard-opportunity-meta">
                  {formatImportKind(batch.kind)}
                  {formatFileSize(batch.fileSizeBytes)
                    ? ` | ${formatFileSize(batch.fileSizeBytes)}`
                    : ''}
                </p>
              </div>
              <div className="dashboard-opportunity-badges">
                <span className={`pill ${statusPillClass(batch.status)}`}>
                  {batch.status.replaceAll('_', ' ')}
                </span>
              </div>
            </div>

            <p className="dashboard-triage-meta">
              Uploaded {formatDateTime(batch.uploadedAt) ?? 'recently'}
            </p>

            <dl className="duplicate-product-details">
              <div>
                <dt>Total rows</dt>
                <dd>{batch.totalRows}</dd>
              </div>
              <div>
                <dt>Valid rows</dt>
                <dd>{batch.validRows}</dd>
              </div>
              <div>
                <dt>Invalid rows</dt>
                <dd>{batch.invalidRows}</dd>
              </div>
              <div>
                <dt>Warnings</dt>
                <dd>{batch.warningCount}</dd>
              </div>
              <div>
                <dt>Errors</dt>
                <dd>{batch.errorCount}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDateTime(batch.updatedAt) ?? 'recently'}</dd>
              </div>
            </dl>

            <div className="source-block">
              <h3 className="subsection-title">Next Action</h3>
              <p className="copy">{getNextAction(batch)}</p>
            </div>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Data Quality</h3>
              <p className="copy">
                Import diagnostics are stored as safe metadata so operators can
                decide whether to fix and re-import or continue.
              </p>
            </div>
            <span className="pill pill-neutral">docs/import-templates.md</span>
          </div>

          <dl className="duplicate-product-details">
            <div>
              <dt>Invalid rows</dt>
              <dd>{batch.diagnostics.dataQualityMetrics.invalidRows}</dd>
            </div>
            <div>
              <dt>Unresolved products</dt>
              <dd>{batch.diagnostics.dataQualityMetrics.unresolvedProducts}</dd>
            </div>
            <div>
              <dt>Duplicate candidates</dt>
              <dd>{batch.diagnostics.dataQualityMetrics.duplicateCandidates}</dd>
            </div>
            <div>
              <dt>High confidence names</dt>
              <dd>
                {batch.diagnostics.productMatchingSummary.candidateConfidence.high}
              </dd>
            </div>
            <div>
              <dt>Medium confidence names</dt>
              <dd>
                {batch.diagnostics.productMatchingSummary.candidateConfidence.medium}
              </dd>
            </div>
            <div>
              <dt>Low confidence names</dt>
              <dd>
                {batch.diagnostics.productMatchingSummary.candidateConfidence.low}
              </dd>
            </div>
          </dl>

          {batch.diagnostics.suggestedFixes.length > 0 ? (
            <div className="source-block">
              <h4 className="subsection-title">Suggested Fixes</h4>
              <ul className="simple-list compact-list">
                {batch.diagnostics.suggestedFixes.map((fix) => (
                  <li key={fix}>{fix}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Detected Columns</h3>
              <p className="copy">
                Confirm that source headers mapped to the expected canonical
                import fields.
              </p>
            </div>
            <span className="pill pill-neutral">
              {batch.diagnostics.detectedColumns.length} columns
            </span>
          </div>
          {batch.diagnostics.detectedColumns.length > 0 ? (
            <div className="dashboard-opportunity-list">
              {batch.diagnostics.detectedColumns.map((column) => (
                <article
                  className="dashboard-opportunity-card"
                  key={`${column.sourceHeader}-${column.canonicalField ?? 'raw'}`}
                >
                  <p className="dashboard-opportunity-title">
                    {column.sourceHeader}
                  </p>
                  <p className="dashboard-opportunity-meta">
                    {column.canonicalField
                      ? `Mapped to ${column.canonicalField}`
                      : 'Stored as source-only context'}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="copy">
              No detected column metadata is stored for this batch.
            </p>
          )}
        </section>

        {batch.diagnostics.productMatchingSummary.duplicateCandidateGroups
          .length > 0 ? (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Duplicate Product Candidates</h3>
                <p className="copy">
                  Rows below normalized to the same product key. Some may be
                  valid repeats, but operators should check for accidental
                  duplicates or aliases.
                </p>
              </div>
            </div>
            <div className="dashboard-opportunity-list">
              {batch.diagnostics.productMatchingSummary.duplicateCandidateGroups.map(
                (group) => (
                  <article
                    className="dashboard-opportunity-card"
                    key={group.normalizedKey}
                  >
                    <p className="dashboard-opportunity-title">
                      {group.normalizedKey}
                    </p>
                    <p className="dashboard-opportunity-meta">
                      Rows {group.rowNumbers.join(', ')}
                    </p>
                    <p className="dashboard-opportunity-copy">
                      {group.rawProductNames.join(' | ')}
                    </p>
                  </article>
                ),
              )}
            </div>
          </section>
        ) : null}

        {batch.warnings.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No Stored Warnings</h3>
            <p className="copy">
              This batch does not have any stored warning messages.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Stored Warnings</h3>
                <p className="copy">
                  Showing the first {batch.warnings.length} stored warning
                  {batch.warnings.length === 1 ? '' : 's'} for this batch.
                </p>
              </div>
              <span className="pill pill-neutral">
                {batch.warningCount} total
              </span>
            </div>

            {batch.diagnostics.warningCategories.length > 0 ? (
              <dl className="duplicate-product-details">
                {batch.diagnostics.warningCategories.map((category) => (
                  <div key={category.category}>
                    <dt>{category.category.replaceAll('-', ' ')}</dt>
                    <dd>{category.count}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="dashboard-opportunity-list">
              {batch.warnings.map((warning) => (
                <article className="dashboard-opportunity-card" key={warning}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">Warning</p>
                    </div>
                  </div>

                  <p className="dashboard-opportunity-copy">{warning}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {batch.errors.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No Stored Errors</h3>
            <p className="copy">
              This batch does not have any stored import errors.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Stored Errors</h3>
                <p className="copy">
                  Showing the first {batch.errors.length} stored error
                  {batch.errors.length === 1 ? '' : 's'} for this batch.
                </p>
              </div>
              <span className="pill pill-neutral">
                {batch.errorCount} total
              </span>
            </div>

            <div className="dashboard-opportunity-list">
              {batch.errors.map((error) => {
                const rawRowSnippet = formatRawRowSnippet(error.rawRow);

                return (
                  <article
                    className="dashboard-opportunity-card"
                    key={error.id}
                  >
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          Row {error.rowNumber ?? 'Unknown'}
                          {error.fieldName ? ` | ${error.fieldName}` : ''}
                        </p>
                        <p className="dashboard-opportunity-meta">
                          Logged {formatDateTime(error.createdAt) ?? 'recently'}
                        </p>
                      </div>
                    </div>

                    <p className="dashboard-opportunity-copy">
                      {error.message}
                    </p>

                    {rawRowSnippet ? (
                      <div className="source-block">
                        <h4 className="subsection-title">
                          Redacted Row Snapshot
                        </h4>
                        <pre>{rawRowSnippet}</pre>
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
        <p className="eyebrow">Imports</p>
        <h2 className="title">Import Batch Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load the import batch.'}
        </p>
        <div className="actions">
          <Link className="button" href="/dashboard/imports">
            Back to imports
          </Link>
        </div>
      </section>
    );
  }
}
