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
                A bounded read-only view of one import batch and the first few
                stored errors.
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
          </div>
        </section>

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
                          Stored Row Snapshot
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
