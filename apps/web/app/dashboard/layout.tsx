import type { ReactNode } from 'react';

import { logoutAction } from '../auth/actions';
import {
  SidebarNav,
  type SidebarNavGroup,
  type SidebarNavItem,
} from '../components/SidebarNav';
import { DashboardTopBar } from '../components/DashboardTopBar';
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

  // `show !== false` keeps an item; items with `show: false` are gated out.
  const rawGroups: Array<{
    label: string;
    items: Array<SidebarNavItem & { show?: boolean }>;
  }> = [
    {
      label: 'Overview',
      items: [{ href: '/dashboard', label: 'Overview', iconKey: 'overview' }],
    },
    {
      label: 'Operations',
      items: [
        {
          href: '/dashboard/inbox',
          label: 'Bot Inbox',
          iconKey: 'inbox',
          inboxUnread: true,
          show: canViewInbox,
        },
        {
          href: '/dashboard/review',
          label: 'Review',
          iconKey: 'review',
          show: canReview,
        },
        {
          href: '/dashboard/trade-enquiries',
          label: 'Trade Enquiries',
          iconKey: 'trade',
        },
      ],
    },
    {
      label: 'Commercial',
      items: [
        {
          href: '/dashboard/opportunities',
          label: 'Opportunities',
          iconKey: 'opportunities',
        },
        { href: '/dashboard/deals', label: 'Deals', iconKey: 'deals' },
        {
          href: '/dashboard/customers',
          label: 'Customers',
          iconKey: 'customers',
          show: canViewCustomers,
        },
      ],
    },
    {
      label: 'Catalogue & Data',
      items: [
        {
          href: '/dashboard/imports',
          label: 'Imports',
          iconKey: 'imports',
          show: canViewImports,
        },
        {
          href: '/dashboard/inventory',
          label: 'Inventory',
          iconKey: 'inventory',
          show: canViewInventory,
        },
        {
          href: '/dashboard/products',
          label: 'Product Records',
          iconKey: 'products',
        },
      ],
    },
    {
      label: 'System',
      items: [
        {
          href: '/dashboard/setup',
          label: 'Setup',
          iconKey: 'setup',
          show: canViewSetup,
        },
      ],
    },
  ];

  const groups: SidebarNavGroup[] = rawGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => item.show !== false),
    }))
    .filter((group) => group.items.length > 0);

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
        <SidebarNav groups={groups} recentEmailTimestamps={recentEmailTimestamps} />
      </aside>
      <div className="content-col">
        <DashboardTopBar
          username={session.username}
          role={session.role}
          logoutAction={logoutAction}
        />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
