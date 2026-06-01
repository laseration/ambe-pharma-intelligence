'use client';

import Link from 'next/link';

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  return (
    <section className="panel dashboard-panel">
      <p className="eyebrow">Dashboard Error</p>
      <h2 className="title">This page could not load safely</h2>
      <p className="copy">
        The dashboard hit an unexpected error. Retry the page, then check the
        setup diagnostics and API logs if it keeps failing.
      </p>
      {error.digest ? (
        <p className="dashboard-inline-message dashboard-inline-message-error">
          Error digest: {error.digest}
        </p>
      ) : null}
      <div className="actions">
        <button className="button button-primary" onClick={reset} type="button">
          Retry
        </button>
        <Link className="button" href="/dashboard/setup/diagnostics">
          Open diagnostics
        </Link>
        <Link className="button" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
