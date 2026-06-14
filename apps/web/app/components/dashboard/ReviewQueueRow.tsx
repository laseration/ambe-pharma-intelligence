import Link from 'next/link';
import type { ReactNode } from 'react';

import { StatusBadge, type BadgeVariant } from './StatusBadge';
import styles from './Cockpit.module.css';

type ReviewQueueRowProps = {
  /** Primary description of the staged offer (product / supplier / price). */
  title: ReactNode;
  /** Secondary line, e.g. the originating email subject. */
  meta?: ReactNode;
  priorityLabel: ReactNode;
  priorityVariant: BadgeVariant;
  /** Destination for the operator decision (the review detail page). */
  decideHref: string;
};

/**
 * Compact supplier-offer row for the command-rail review queue. The whole row
 * is a single link to the review detail page (large, comfortable touch/keyboard
 * target with the global focus ring), matching the FeatureCard pattern. A
 * scannable summary — title + priority + a "Decide" affordance — the full
 * review console lives one click away.
 */
export function ReviewQueueRow({
  title,
  meta,
  priorityLabel,
  priorityVariant,
  decideHref,
}: ReviewQueueRowProps) {
  return (
    <Link className={styles.queueRow} href={decideHref}>
      <div className={styles.queueTop}>
        <p className={styles.queueTitle}>{title}</p>
        <StatusBadge variant={priorityVariant}>{priorityLabel}</StatusBadge>
      </div>
      {meta ? <p className={styles.queueMeta}>{meta}</p> : null}
      <span className="dashboard-metric-link">Decide</span>
    </Link>
  );
}
