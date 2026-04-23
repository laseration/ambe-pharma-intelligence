import Link from 'next/link';

import { listRecentImportBatches } from '../../../lib/importsApi';

export const dynamic = 'force-dynamic';

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

export default async function ImportsPage() {
  try {
    const batches = await listRecentImportBatches();

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Imports</p>
              <h2 className="title">Recent Import Batches</h2>
              <p className="copy">
                A bounded read-only view of recent file imports, whether they completed cleanly,
                completed with errors, or need operator follow-up.
              </p>
            </div>
            <Link className="button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </section>

        {batches.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No Imports Yet</h3>
            <p className="copy">
              No import batches have been recorded yet. Once supplier price lists, inventory files,
              or sales files are imported, they will appear here.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Latest Results</h3>
                <p className="copy">
                  {batches.length} recent import
                  {batches.length === 1 ? '' : 's'} recorded.
                </p>
              </div>
              <span className="pill pill-neutral">{batches.length} recent</span>
            </div>

            <div className="dashboard-opportunity-list">
              {batches.map((batch) => (
                <article className="dashboard-opportunity-card" key={batch.id}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">{batch.fileName}</p>
                      <p className="dashboard-opportunity-meta">
                        {formatImportKind(batch.kind)}
                        {formatFileSize(batch.fileSizeBytes) ? ` | ${formatFileSize(batch.fileSizeBytes)}` : ''}
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

                  <div className="actions">
                    <Link className="button" href={`/dashboard/imports/${batch.id}`}>
                      View batch
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Imports</p>
        <h2 className="title">Import History Unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load recent import batches.'}
        </p>
        <div className="actions">
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>
    );
  }
}
