import type { ReactNode } from 'react';

type DashboardPanelProps = {
  /** Optional anchor id (e.g. for in-page jump links). */
  id?: string;
  /** Extra class names appended after the shared panel classes. */
  className?: string;
  children: ReactNode;
};

/**
 * Standard dashboard section surface.
 *
 * Renders the shared global `.panel .dashboard-panel` classes so the visual
 * treatment is identical to the hand-written markup it replaces. The cockpit
 * redesign composes its three zones from these panels rather than repeating
 * the `<section className="panel dashboard-panel">` boilerplate.
 */
export function DashboardPanel({
  id,
  className,
  children,
}: DashboardPanelProps) {
  const classes = ['panel', 'dashboard-panel', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} id={id}>
      {children}
    </section>
  );
}
