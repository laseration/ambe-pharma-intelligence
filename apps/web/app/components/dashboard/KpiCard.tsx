import type { ReactNode } from 'react';

type KpiCardProps = {
  value: ReactNode;
  label: ReactNode;
  note?: ReactNode;
};

/**
 * Single metric tile (large tabular value + label + optional note). Reuses the
 * shared global `.dashboard-summary-card` styling. Intended for the cockpit's
 * intelligence-deck KPI strip.
 */
export function KpiCard({ value, label, note }: KpiCardProps) {
  return (
    <article className="dashboard-summary-card">
      <p className="dashboard-summary-value">{value}</p>
      <p className="dashboard-summary-label">{label}</p>
      {note ? <p className="dashboard-summary-note">{note}</p> : null}
    </article>
  );
}
