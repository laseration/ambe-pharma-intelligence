import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { publicSiteUrl } from './publicSite';

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title:
    'Ambe Medical Group | Comparator Drug Sourcing & Pharmaceutical Trading',
  description:
    'Professional pharmaceutical trading, comparator drug sourcing, procurement support, and supplier/customer onboarding.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title:
      'Ambe Medical Group | Comparator Drug Sourcing & Pharmaceutical Trading',
    description:
      'Professional pharmaceutical trading, comparator drug sourcing, procurement support, and supplier/customer onboarding.',
    type: 'website',
    siteName: 'Ambe Medical Group',
    url: '/',
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
