import Link from 'next/link';
import type { ReactNode } from 'react';

import { InboxNavBadge } from './components/InboxNavBadge';
import { listInboundEmails } from '../lib/inboxApi';
import './globals.css';

export const metadata = {
  title: 'Ambe Pharma Intelligence',
  description: 'Internal business tooling for pharma operations.',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const recentInboxEmails = await listInboundEmails({ take: 25 }).catch(() => []);
  const recentEmailTimestamps = recentInboxEmails
    .map((email) => {
      const createdAt = email.createdAt ? Date.parse(email.createdAt) : Number.NaN;
      const receivedAt = email.receivedAt ? Date.parse(email.receivedAt) : Number.NaN;
      const newestTimestamp = Math.max(
        Number.isNaN(createdAt) ? 0 : createdAt,
        Number.isNaN(receivedAt) ? 0 : receivedAt,
      );

      return newestTimestamp > 0 ? new Date(newestTimestamp).toISOString() : null;
    })
    .filter((value): value is string => Boolean(value));

  return (
    <html lang="en">
      <body>
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
              <Link href="/">Login</Link>
              <Link href="/dashboard">Overview</Link>
              <InboxNavBadge
                href="/dashboard/inbox"
                label="Bot Inbox"
                recentEmailTimestamps={recentEmailTimestamps}
              />
              <Link href="/dashboard/imports">Imports</Link>
              <Link href="/dashboard/opportunities">Opportunities</Link>
              <Link href="/dashboard/review">Review</Link>
              <Link href="/dashboard/products">Product Records</Link>
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
