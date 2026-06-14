import type { ReactNode } from 'react';

import styles from './Cockpit.module.css';

type ZoneProps = {
  children: ReactNode;
};

/**
 * Responsive three-zone layout for the dashboard overview.
 *
 * Children are placed by the wrapper components below into named grid areas
 * (`rail`, `deck`, `tower`). On narrow viewports the zones stack in priority
 * order; on wide viewports they become flanking columns around the deck. All
 * styling lives in Cockpit.module.css.
 */
export function CockpitGrid({ children }: ZoneProps) {
  return <div className={styles.grid}>{children}</div>;
}

/**
 * Command rail: "what to do first". Holds the supplier-review queue and the
 * prioritised next-action worklist. Complementary to the main deck, so it is a
 * labelled `<aside>`.
 */
export function CommandRail({ children }: ZoneProps) {
  return (
    <aside className={styles.rail} aria-label="What needs doing first">
      <div className={styles.zoneStack}>{children}</div>
    </aside>
  );
}

/**
 * Intelligence deck: the commercial operating picture (metrics, buying
 * signals, recent decisions). The largest, primary zone.
 */
export function IntelligenceDeck({ children }: ZoneProps) {
  return (
    <section className={styles.deck} aria-label="Commercial operating picture">
      <div className={styles.zoneStack}>{children}</div>
    </section>
  );
}

/**
 * Trust tower: whether the data and system can be trusted right now (signal
 * freshness, automation readiness, data quality). Complementary status, so a
 * labelled `<aside>`; sticks beside the deck on wide screens.
 */
export function TrustTower({ children }: ZoneProps) {
  return (
    <aside
      className={styles.tower}
      aria-label="Data trust and system readiness"
    >
      <div className={styles.zoneStack}>{children}</div>
    </aside>
  );
}
