'use client';

import { usePathname } from 'next/navigation';

const SECTION_LABELS: Record<string, string> = {
  inbox: 'Bot Inbox',
  review: 'Review',
  'trade-enquiries': 'Trade Enquiries',
  opportunities: 'Opportunities',
  deals: 'Deals',
  customers: 'Customers',
  imports: 'Imports',
  inventory: 'Inventory',
  products: 'Product Records',
  'account-opening': 'Account Opening',
  setup: 'Setup',
};

type DashboardTopBarProps = {
  username: string;
  role: string;
  logoutAction: () => void | Promise<void>;
};

export function DashboardTopBar({
  username,
  role,
  logoutAction,
}: DashboardTopBarProps) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean); // e.g. ['dashboard','review','123']
  const sectionKey = segments[1];
  const sectionLabel = sectionKey ? SECTION_LABELS[sectionKey] : undefined;
  const hasDetail = segments.length > 2;
  const title = sectionLabel ?? 'Overview';

  return (
    <header className="dash-topbar">
      <nav className="dash-breadcrumb" aria-label="Breadcrumb">
        <span className="dash-breadcrumb-root">Dashboard</span>
        {sectionLabel ? (
          <>
            <span className="dash-breadcrumb-sep" aria-hidden="true">
              ›
            </span>
            <span
              className="dash-breadcrumb-current"
              aria-current={hasDetail ? undefined : 'page'}
            >
              {sectionLabel}
            </span>
          </>
        ) : (
          <span className="dash-breadcrumb-sep" aria-hidden="true" />
        )}
        {hasDetail ? (
          <>
            <span className="dash-breadcrumb-sep" aria-hidden="true">
              ›
            </span>
            <span className="dash-breadcrumb-current" aria-current="page">
              Detail
            </span>
          </>
        ) : null}
      </nav>

      <div className="dash-topbar-title" aria-hidden="true">
        {title}
      </div>

      <div className="dash-user">
        <span className="dash-user-id">
          <span className="dash-user-name">{username}</span>
          <span className="dash-user-role">{role}</span>
        </span>
        <form action={logoutAction}>
          <button className="dash-logout" type="submit">
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
