import type { ReactNode } from 'react';

import { StatusBadge } from './StatusBadge';
import styles from './DashboardHero.module.css';

type DashboardHeroProps = {
  eyebrow: string;
  title: string;
  copy: ReactNode;
  /** Label above the freshness pill (e.g. "Signal freshness"). */
  statusLabel: string;
  /** Precomputed pill modifier class for the freshness state. */
  freshnessTone: string;
  freshnessLabel: ReactNode;
  freshnessDetail: ReactNode;
  /** Inline messages and the primary action row, rendered below the header. */
  children?: ReactNode;
};

/**
 * The overview cockpit header: an operational title bar plus a freshness
 * status block. Owns its styling via DashboardHero.module.css (extracted from
 * globals.css), reconstructing the panel surface locally so it does not rely on
 * the shared `.panel` classes.
 */
export function DashboardHero({
  eyebrow,
  title,
  copy,
  statusLabel,
  freshnessTone,
  freshnessLabel,
  freshnessDetail,
  children,
}: DashboardHeroProps) {
  return (
    <section className={styles.heroPanel}>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="title">{title}</h2>
          <p className="copy">{copy}</p>
        </div>
        <div className={styles.heroStatus}>
          <p className="dashboard-summary-label">{statusLabel}</p>
          <div className={styles.heroPillRow}>
            <StatusBadge tone={freshnessTone}>{freshnessLabel}</StatusBadge>
            <p className="dashboard-summary-note">{freshnessDetail}</p>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
