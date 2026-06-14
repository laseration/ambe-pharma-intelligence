import type { ReactNode } from 'react';

import { DashboardSidebar } from '../components/dashboard';
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
  const canViewInventory = roleHasCapability(session.role, 'inventory:view');
  const canViewCustomers = roleHasCapability(session.role, 'customers:view');
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
      <DashboardSidebar
        username={session.username}
        role={session.role}
        canViewInbox={canViewInbox}
        canViewImports={canViewImports}
        canViewInventory={canViewInventory}
        canViewCustomers={canViewCustomers}
        canReview={canReview}
        canViewSetup={canViewSetup}
        recentEmailTimestamps={recentEmailTimestamps}
      />
      <main className="content">{children}</main>
    </div>
  );
}
