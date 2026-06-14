import type { ReactNode } from 'react';

export type BadgeVariant = 'high' | 'medium' | 'low' | 'neutral';

const VARIANT_PILL_CLASS: Record<BadgeVariant, string> = {
  high: 'pill-high',
  medium: 'pill-medium',
  low: 'pill-low',
  neutral: 'pill-neutral',
};

type StatusBadgeProps = {
  /** Semantic tone. Ignored when `tone` is supplied. */
  variant?: BadgeVariant;
  /**
   * Raw pill modifier class (e.g. a precomputed `freshness.pillClassName`).
   * Takes precedence over `variant` for cases that already resolve their own
   * pill class.
   */
  tone?: string;
  children: ReactNode;
};

/**
 * Status pill. Centralises the `pill` + modifier class mapping that was
 * previously repeated as inline ternaries and helper functions throughout the
 * dashboard. Emits the same global `.pill` classes, so the appearance is
 * unchanged.
 */
export function StatusBadge({
  variant = 'neutral',
  tone,
  children,
}: StatusBadgeProps) {
  const pillClass = tone ?? VARIANT_PILL_CLASS[variant];

  return <span className={`pill ${pillClass}`}>{children}</span>;
}
