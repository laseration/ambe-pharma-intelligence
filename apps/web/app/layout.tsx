import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { publicSiteUrl } from './publicSite';

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
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
