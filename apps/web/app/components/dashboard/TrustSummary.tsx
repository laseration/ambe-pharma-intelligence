import type { ReactNode } from 'react';

import { StatusBadge } from './StatusBadge';
import styles from './Cockpit.module.css';

export type TrustSummaryRow = {
  /** Trust dimension name, e.g. "Freshness". */
  label: string;
  /** Short plain-language explanation of what the dimension measures. */
  hint?: string;
  /** Status pill content, e.g. "Fresh" or "2 issues". */
  badgeText: ReactNode;
  /** Raw pill modifier class (e.g. a precomputed freshness `pillClassName`). */
  badgeTone: string;
};

type TrustSummaryProps = {
  rows: TrustSummaryRow[];
  /** Optional supporting note shown beneath the scorecard. */
  note?: ReactNode;
};

/**
 * At-a-glance trust scorecard for the trust tower: one status pill per trust
 * dimension (freshness, readiness, data quality) so an operator can see
 * whether the data is safe to act on without reading the detail panels. Status
 * is conveyed by both text and colour, never colour alone.
 */
export function TrustSummary({ rows, note }: TrustSummaryProps) {
  return (
    <>
      <div className={styles.trustScore}>
        {rows.map((row) => (
          <div className={styles.trustRow} key={row.label}>
            <div className={styles.trustRowLabel}>
              <p className={styles.trustLabel}>{row.label}</p>
              {row.hint ? <p className={styles.trustHint}>{row.hint}</p> : null}
            </div>
            <StatusBadge tone={row.badgeTone}>{row.badgeText}</StatusBadge>
          </div>
        ))}
      </div>
      {note ? <p className={styles.trustNote}>{note}</p> : null}
    </>
  );
}
