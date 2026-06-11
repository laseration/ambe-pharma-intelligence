import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '../auth/actions';
import { InboxNavBadge } from '../components/InboxNavBadge';
import { roleHasCapability } from '../../lib/authorisation';
import { listInboundEmails } from '../../lib/inboxApi';
import { requireCurrentWebCapability } from '../../lib/serverWebAuth';

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await requireCurrentWebCapability('dashboard:view');
  const canViewInbox = roleHasCapability(session.role, 'inbox:view');
  const canViewImports = roleHasCapability(session.role, 'imports:view');
  const canReview = roleHasCapability(session.role, 'review:view');
  const canViewSetup = roleHasCapability(session.role, 'system:admin');
  const recentInboxEmails = canViewInbox
    ? await listInboundEmails({ take: 25 }).catch(() => [])
    : [];
  const recentEmailTimestamps = recentInboxEmails
    .map((email) => {
      const createdAt = email.createdAt
        ? Date.parse(email.createdAt)
        : Number.NaN;
      const receivedAt = email.receivedAt
        ? Date.parse(email.receivedAt)
        : Number.NaN;
      const newestTimestamp = Math.max(
        Number.isNaN(createdAt) ? 0 : createdAt,
        Number.isNaN(receivedAt) ? 0 : receivedAt,
      );

      return newestTimestamp > 0
        ? new Date(newestTimestamp).toISOString()
        : null;
    })
    .filter((value): value is string => Boolean(value));

  return (
    <div className="shell">
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
          {canViewImports ? (
            <Link href="/dashboard/imports">Imports</Link>
          ) : null}
          <Link href="/dashboard/opportunities">Opportunities</Link>
          <Link href="/dashboard/deals">Deals</Link>
          {canReview ? <Link href="/dashboard/review">Review</Link> : null}
          <Link href="/dashboard/products">Product Records</Link>
          {canViewSetup ? <Link href="/dashboard/setup">Setup</Link> : null}
          <div className="nav-session">
            <span>
              {session.username} &middot; {session.role}
            </span>
            <form action={logoutAction}>
              <button className="nav-button" type="submit">
                Logout
              </button>
            </form>
          </div>
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
