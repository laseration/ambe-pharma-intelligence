import Link from 'next/link';
import type { ReactNode } from 'react';

type FeatureGridProps = {
  children: ReactNode;
};

/**
 * Grid container for the dense next-action worklist and the data-quality
 * cards. Reuses the shared global `.dashboard-feature-grid` layout.
 */
export function FeatureGrid({ children }: FeatureGridProps) {
  return <div className="dashboard-feature-grid">{children}</div>;
}

type FeatureCardProps = {
  href: string;
  children: ReactNode;
};

/**
 * Clickable worklist row / drill-in card. Reuses the shared global
 * `.dashboard-feature-card` styling. The cockpit command rail will be built
 * from these.
 */
export function FeatureCard({ href, children }: FeatureCardProps) {
  return (
    <Link className="dashboard-feature-card" href={href}>
      {children}
    </Link>
  );
}
