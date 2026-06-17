import Link from 'next/link';

import { logoutAction } from '../../auth/actions';
import { InboxNavBadge } from '../InboxNavBadge';

type DashboardSidebarProps = {
  username: string;
  role: string;
  canViewInbox: boolean;
  canViewImports: boolean;
  canViewInventory: boolean;
  canViewCustomers: boolean;
  canReview: boolean;
  canViewAccountOpening: boolean;
  canViewSetup: boolean;
  recentEmailTimestamps: string[];
};

/**
 * Dashboard navigation rail. The presentational shell extracted from the
 * dashboard layout; data fetching and capability resolution stay in the
 * layout and are passed in as props. Markup and classes are unchanged.
 */
export function DashboardSidebar({
  username,
  role,
  canViewInbox,
  canViewImports,
  canViewInventory,
  canViewCustomers,
  canReview,
  canViewAccountOpening,
  canViewSetup,
  recentEmailTimestamps,
}: DashboardSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AI</div>
        <div className="brand-copy">
          <p className="brand-eyebrow">Ambe Intelligence</p>
          <h1 className="brand-title">Ambe Pharma</h1>
        </div>
      </div>
      <nav className="nav">
        <Link href="/login">Login</Link>
        <Link href="/dashboard">Overview</Link>
        {canViewInbox ? (
          <InboxNavBadge
            href="/dashboard/inbox"
            label="Bot Inbox"
            recentEmailTimestamps={recentEmailTimestamps}
          />
        ) : null}
        <Link href="/dashboard/trade-enquiries">Trade Enquiries</Link>
        {canViewImports ? <Link href="/dashboard/imports">Imports</Link> : null}
        {canViewInventory ? (
          <Link href="/dashboard/inventory">Inventory</Link>
        ) : null}
        {canViewCustomers ? (
          <Link href="/dashboard/customers">Customers</Link>
        ) : null}
        <Link href="/dashboard/opportunities">Opportunities</Link>
        <Link href="/dashboard/deals">Deals</Link>
        {canReview ? <Link href="/dashboard/review">Review</Link> : null}
        {canViewAccountOpening ? (
          <Link href="/dashboard/account-opening">Account Opening</Link>
        ) : null}
        <Link href="/dashboard/products">Product Records</Link>
        {canViewSetup ? <Link href="/dashboard/setup">Setup</Link> : null}
        <div className="nav-session">
          <span>
            {username} &middot; {role}
          </span>
          <form action={logoutAction}>
            <button className="nav-button" type="submit">
              Logout
            </button>
          </form>
        </div>
      </nav>
    </aside>
  );
}
