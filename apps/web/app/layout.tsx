import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'Ambe Pharma Intelligence',
  description: 'Internal business tooling for pharma operations.',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <h1 className="brand">Ambe Pharma Intelligence</h1>
            <nav className="nav">
              <Link href="/">Login</Link>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/dashboard/review">Review Queue</Link>
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
