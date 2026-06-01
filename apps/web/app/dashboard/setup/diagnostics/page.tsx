import Link from 'next/link';

import {
  getPollingWorkerStatuses,
  getSystemReadinessReport,
  type PollingWorkerStatus,
  type SystemReadinessCheck,
  type SystemReadinessReport,
} from '../../../../lib/systemApi';

export const dynamic = 'force-dynamic';

type LoadResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      message: string;
    };

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'n/a';
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

function formatError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The dashboard could not load this diagnostic check.';
}

function readinessCounts(report: SystemReadinessReport) {
  return {
    ready: report.checks.filter((check) => check.status === 'ready').length,
    warning: report.checks.filter((check) => check.status === 'warning').length,
    notConfigured: report.checks.filter(
      (check) => check.status === 'not_configured',
    ).length,
  };
}

function workerDisplayName(name: PollingWorkerStatus['name']): string {
  switch (name) {
    case 'email-inbound':
      return 'Email inbox polling';
    case 'telegram':
      return 'Telegram polling';
  }
}

function workerNextAction(worker: PollingWorkerStatus): string {
  if (!worker.enabled) {
    return 'Enable polling only after credentials, allowlists, and intake ownership are ready.';
  }

  if (!worker.configured) {
    return 'Check required environment variables and allowlists for this worker.';
  }

  if (!worker.running) {
    return 'Confirm the API process started this worker and check startup logs.';
  }

  if (worker.consecutiveFailures > 0) {
    return 'Check the last error, request id if present, and integration credentials before retrying.';
  }

  return 'No action needed. Keep monitoring processed and failed counts during pilot runs.';
}

function formatDetailValue(
  value: boolean | number | string | string[] | null | undefined,
): string {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'none';
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }

  return String(value);
}

function GraphPreflightDiagnostics({
  check,
}: {
  check: SystemReadinessCheck | undefined;
}) {
  if (!check) {
    return null;
  }

  const warnings = Array.isArray(check.details.warnings)
    ? check.details.warnings
    : [];

  return (
    <article className="dashboard-opportunity-card setup-card">
      <div className="dashboard-opportunity-top">
        <div>
          <p className="dashboard-opportunity-title">Graph inbox preflight</p>
          <p className="dashboard-opportunity-meta">{check.key}</p>
        </div>
        <span
          className={`pill ${
            check.status === 'ready'
              ? 'pill-high'
              : check.status === 'warning'
                ? 'pill-medium'
                : 'pill-low'
          }`}
        >
          {check.status.replace('_', ' ')}
        </span>
      </div>
      <p className="dashboard-opportunity-copy">{check.meaning}</p>
      <dl className="setup-detail-list">
        <div>
          <dt>mailbox</dt>
          <dd>{formatDetailValue(check.details.mailbox)}</dd>
        </div>
        <div>
          <dt>credential source</dt>
          <dd>{formatDetailValue(check.details.credentialSource)}</dd>
        </div>
        <div>
          <dt>credential mode</dt>
          <dd>{formatDetailValue(check.details.credentialMode)}</dd>
        </div>
        <div>
          <dt>polling enabled</dt>
          <dd>{formatDetailValue(check.details.pollingEnabled)}</dd>
        </div>
        <div>
          <dt>allowed senders</dt>
          <dd>{formatDetailValue(check.details.allowedSenderCount)}</dd>
        </div>
        <div>
          <dt>supplier mappings</dt>
          <dd>{formatDetailValue(check.details.supplierMappingCount)}</dd>
        </div>
        <div>
          <dt>dry-run safe</dt>
          <dd>{formatDetailValue(check.details.dryRunSafe)}</dd>
        </div>
      </dl>
      {warnings.length > 0 ? (
        <div className="setup-next-action">
          <p className="dashboard-summary-label">Warnings</p>
          <p className="dashboard-summary-note">{warnings.join(' ')}</p>
        </div>
      ) : null}
      <div className="setup-next-action">
        <p className="dashboard-summary-label">What to check next</p>
        <p className="dashboard-summary-note">{check.nextAction}</p>
      </div>
    </article>
  );
}

function DiagnosticErrorCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <article className="dashboard-opportunity-card setup-card">
      <div className="dashboard-opportunity-top">
        <p className="dashboard-opportunity-title">{title}</p>
        <span className="pill pill-low">Unavailable</span>
      </div>
      <p className="dashboard-opportunity-copy">{message}</p>
      <div className="setup-next-action">
        <p className="dashboard-summary-label">What to check next</p>
        <p className="dashboard-summary-note">
          Confirm the API is running, internal API credentials are configured,
          and use any request id in the error message to find the server log.
        </p>
      </div>
    </article>
  );
}

function WorkerDiagnostics({ workers }: { workers: PollingWorkerStatus[] }) {
  if (workers.length === 0) {
    return (
      <article className="dashboard-opportunity-card setup-card">
        <p className="dashboard-opportunity-title">No worker status returned</p>
        <p className="dashboard-opportunity-copy">
          The API responded, but did not report email or Telegram worker state.
        </p>
      </article>
    );
  }

  return workers.map((worker) => (
    <article
      className="dashboard-opportunity-card setup-card"
      key={worker.name}
    >
      <div className="dashboard-opportunity-top">
        <div>
          <p className="dashboard-opportunity-title">
            {workerDisplayName(worker.name)}
          </p>
          <p className="dashboard-opportunity-meta">{worker.name}</p>
        </div>
        <span
          className={`pill ${
            worker.running && worker.consecutiveFailures === 0
              ? 'pill-high'
              : 'pill-medium'
          }`}
        >
          {worker.running ? 'Running' : 'Not running'}
        </span>
      </div>
      <dl className="setup-detail-list">
        <div>
          <dt>enabled</dt>
          <dd>{worker.enabled ? 'yes' : 'no'}</dd>
        </div>
        <div>
          <dt>configured</dt>
          <dd>{worker.configured ? 'yes' : 'no'}</dd>
        </div>
        <div>
          <dt>last run</dt>
          <dd>{formatDateTime(worker.lastRunFinishedAt)}</dd>
        </div>
        <div>
          <dt>last success</dt>
          <dd>{formatDateTime(worker.lastSuccessAt)}</dd>
        </div>
        <div>
          <dt>last error</dt>
          <dd>{worker.lastError ?? 'none'}</dd>
        </div>
        <div>
          <dt>failures</dt>
          <dd>{worker.consecutiveFailures}</dd>
        </div>
      </dl>
      <div className="setup-next-action">
        <p className="dashboard-summary-label">What to check next</p>
        <p className="dashboard-summary-note">{workerNextAction(worker)}</p>
      </div>
    </article>
  ));
}

export default async function DiagnosticsPage() {
  const [readinessResult, workersResult] = await Promise.allSettled([
    getSystemReadinessReport(),
    getPollingWorkerStatuses(),
  ]);
  const readiness: LoadResult<SystemReadinessReport> =
    readinessResult.status === 'fulfilled'
      ? { ok: true, value: readinessResult.value }
      : { ok: false, message: formatError(readinessResult.reason) };
  const workers: LoadResult<PollingWorkerStatus[]> =
    workersResult.status === 'fulfilled'
      ? { ok: true, value: workersResult.value }
      : { ok: false, message: formatError(workersResult.reason) };
  const counts = readiness.ok ? readinessCounts(readiness.value) : null;
  const graphPreflightCheck = readiness.ok
    ? readiness.value.checks.find(
        (check) => check.key === 'graph-mail-preflight',
      )
    : undefined;
  const readinessErrorMessage = readiness.ok ? null : readiness.message;
  const workersErrorMessage = workers.ok ? null : workers.message;

  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Diagnostics</p>
            <h2 className="title">Operator-safe system checks</h2>
            <p className="copy">
              A support view for common pilot failures. It shows readiness,
              worker state, and next checks without exposing secrets, raw email
              bodies, file contents, tokens, or connection strings.
            </p>
          </div>
          <Link className="button" href="/dashboard/setup">
            Setup checklist
          </Link>
        </div>
        <div className="actions">
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="button" href="/dashboard/inbox">
            Check inbox
          </Link>
          <Link className="button" href="/dashboard/imports">
            Check imports
          </Link>
        </div>
      </section>

      {readiness.ok ? (
        <section className="setup-check-grid">
          <GraphPreflightDiagnostics check={graphPreflightCheck} />
        </section>
      ) : null}

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">API Readiness</p>
            <h3 className="section-title">Configuration and connectivity</h3>
            <p className="copy">
              If this section fails, check API process health, internal API key
              configuration, and any request id shown in the error.
            </p>
          </div>
          {readiness.ok ? (
            <span className="pill pill-neutral">
              Checked {formatDateTime(readiness.value.generatedAt)}
            </span>
          ) : null}
        </div>

        {readiness.ok && counts ? (
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
                Items that need operator or engineer follow-up.
              </p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">{counts.notConfigured}</p>
              <p className="dashboard-summary-label">Not configured</p>
              <p className="dashboard-summary-note">
                Missing optional or required pilot setup.
              </p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">
                {readiness.value.status.replace('_', ' ')}
              </p>
              <p className="dashboard-summary-label">Overall status</p>
              <p className="dashboard-summary-note">
                Highest-severity readiness status currently reported.
              </p>
            </article>
          </div>
        ) : (
          <DiagnosticErrorCard
            message={
              readinessErrorMessage ??
              'The readiness endpoint did not return a diagnostic response.'
            }
            title="Readiness endpoint failed"
          />
        )}
      </section>

      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Ingestion</p>
            <h3 className="section-title">Worker failure visibility</h3>
            <p className="copy">
              Email and Telegram polling failures should be visible here before
              operators rely on the review queue.
            </p>
          </div>
        </div>
      </section>

      <section className="setup-check-grid">
        {workers.ok ? (
          <WorkerDiagnostics workers={workers.value} />
        ) : (
          <DiagnosticErrorCard
            message={
              workersErrorMessage ??
              'The worker endpoint did not return a diagnostic response.'
            }
            title="Worker status endpoint failed"
          />
        )}
      </section>

      <section className="panel dashboard-panel">
        <p className="eyebrow">Runbook</p>
        <h3 className="section-title">Common next checks</h3>
        <ul className="dashboard-signal-list">
          <li>
            API unavailable: confirm the API process is running and the web
            server points at the correct internal API base URL.
          </li>
          <li>
            Unauthorized or forbidden: check internal API keys and dashboard
            role/session configuration.
          </li>
          <li>
            Import failure: check the import detail page for row samples,
            detected columns, warnings, and suggested fixes.
          </li>
          <li>
            Polling failure: check worker last error, Microsoft Graph or
            Telegram credentials, and sender/user allowlists.
          </li>
        </ul>
        <div className="actions">
          <Link className="button" href="/dashboard/setup">
            Setup checks
          </Link>
          <Link className="button" href="/dashboard/imports">
            Import diagnostics
          </Link>
        </div>
      </section>
    </section>
  );
}
