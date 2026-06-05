import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title:
    'Ambe Medical Group | Comparator Drug Sourcing & Pharmaceutical Trading',
  description:
    'Professional pharmaceutical trading, comparator drug sourcing, procurement support, and supplier/customer onboarding.',
  openGraph: {
    title:
      'Ambe Medical Group | Comparator Drug Sourcing & Pharmaceutical Trading',
    description:
      'Professional pharmaceutical trading, comparator drug sourcing, procurement support, and supplier/customer onboarding.',
    type: 'website',
    siteName: 'Ambe Medical Group',
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
