import type { ReactNode } from 'react';

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  copy?: ReactNode;
  /** Optional trailing element (button, link, badge) shown opposite the title. */
  action?: ReactNode;
};

/**
 * Eyebrow + title + supporting copy header used at the top of dashboard
 * panels, with an optional trailing action. Reuses the shared global
 * `.dashboard-section-header` / `.eyebrow` / `.section-title` / `.copy`
 * classes so the output matches the previous inline markup exactly.
 */
export function SectionHeader({
  eyebrow,
  title,
  copy,
  action,
}: SectionHeaderProps) {
  return (
    <div className="dashboard-section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="section-title">{title}</h3>
        {copy ? <p className="copy">{copy}</p> : null}
      </div>
      {action ?? null}
    </div>
  );
}
