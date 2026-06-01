import Link from 'next/link';

import {
  getSystemReadinessReport,
  type SystemReadinessCheck,
  type SystemReadinessReport,
  type SystemReadinessStatus,
} from '../../../lib/systemApi';
import { getCurrentWebSession } from '../../../lib/serverWebAuth';

export const dynamic = 'force-dynamic';

function statusLabel(status: SystemReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'warning':
      return 'Warning';
    case 'not_configured':
      return 'Not configured';
  }
}

function statusPillClass(status: SystemReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'pill-high';
    case 'warning':
      return 'pill-medium';
    case 'not_configured':
      return 'pill-low';
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatDetailValue(
  value: boolean | number | string | string[] | null,
): string {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'none';
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (value === null || value === '') {
    return 'n/a';
  }

  return String(value);
}

function countByStatus(report: SystemReadinessReport) {
  return {
    ready: report.checks.filter((check) => check.status === 'ready').length,
    warning: report.checks.filter((check) => check.status === 'warning')
      .length,
    notConfigured: report.checks.filter(
      (check) => check.status === 'not_configured',
    ).length,
  };
}

function ReadinessCard({ check }: { check: SystemReadinessCheck }) {
  const details = Object.entries(check.details);

  return (
    <article className="dashboard-opportunity-card setup-card">
      <div className="dashboard-opportunity-top">
        <div>
          <p className="dashboard-opportunity-title">{check.title}</p>
          <p className="dashboard-opportunity-meta">{check.key}</p>
        </div>
        <span className={`pill ${statusPillClass(check.status)}`}>
          {statusLabel(check.status)}
        </span>
      </div>

      <p className="dashboard-opportunity-copy">{check.meaning}</p>

      <div className="setup-next-action">
        <p className="dashboard-summary-label">Next action</p>
        <p className="dashboard-summary-note">{check.nextAction}</p>
      </div>

      {check.envVars.length > 0 ? (
        <div className="setup-env-list">
          {check.envVars.map((envVar) => (
            <code key={envVar}>{envVar}</code>
          ))}
        </div>
      ) : null}

      {check.documentationPath ? (
        <p className="dashboard-triage-meta">
          Docs: <code>{check.documentationPath}</code>
        </p>
      ) : null}

      {details.length > 0 ? (
        <dl className="setup-detail-list">
          {details.map(([key, value]) => (
            <div key={key}>
              <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
              <dd>{formatDetailValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

export default async function SetupPage() {
  const session = await getCurrentWebSession();

  try {
    const report = await getSystemReadinessReport();
    const counts = countByStatus(report);

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Setup</p>
              <h2 className="title">Pilot Setup Checklist</h2>
              <p className="copy">
                Read-only checks for the services and credentials needed before
                running a commercial pilot. Secret values are never shown.
              </p>
            </div>
            <Link className="button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
          <div className="actions">
            <span className={`pill ${statusPillClass(report.status)}`}>
              Overall {statusLabel(report.status)}
            </span>
            <span className="pill pill-neutral">
              Checked {formatDateTime(report.generatedAt)}
            </span>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-summary-grid">
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">{counts.ready}</p>
              <p className="dashboard-summary-label">Ready</p>
              <p className="dashboard-summary-note">
                Checks that look usable for pilot operation.
              </p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">{counts.warning}</p>
              <p className="dashboard-summary-label">Warnings</p>
              <p className="dashboard-summary-note">
                Partially configured or reachable only after follow-up.
              </p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">
                {counts.notConfigured}
              </p>
              <p className="dashboard-summary-label">Not configured</p>
              <p className="dashboard-summary-note">
                Missing optional or required setup for pilot use.
              </p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">
                {session?.role ?? 'n/a'}
              </p>
              <p className="dashboard-summary-label">Web session</p>
              <p className="dashboard-summary-note">
                Dashboard access is protected by the internal web session.
              </p>
            </article>
          </div>
        </section>

        <section className="setup-check-grid">
          {report.checks.map((check) => (
            <ReadinessCard check={check} key={check.key} />
          ))}
        </section>
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Setup</p>
        <h2 className="title">Setup Checklist Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load setup readiness checks.'}
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
