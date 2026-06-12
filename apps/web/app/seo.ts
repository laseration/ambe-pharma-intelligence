import type { Metadata } from 'next';

import { publicContact, publicSiteUrl, publicUrl } from './publicSite';

type PublicMetadataInput = {
  path: string;
  title: string;
  description: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
};

export function buildPublicMetadata(input: PublicMetadataInput): Metadata {
  const title = input.title;
  const description = input.description;

  return {
    title,
    description,
    alternates: {
      canonical: publicUrl(input.path),
    },
    openGraph: {
      title: input.openGraphTitle ?? title,
      description: input.openGraphDescription ?? description,
      type: 'website',
      siteName: 'Ambe Medical Group',
      url: publicUrl(input.path),
    },
  };
}

export function publicOrganizationJsonLd() {
  return {
    '@type': 'Organization',
    name: 'Ambe Medical Group',
    url: publicSiteUrl,
    email: publicContact.email,
    telephone: publicContact.phone,
  };
}

export function publicWebSiteJsonLd() {
  return {
    '@type': 'WebSite',
    name: 'Ambe Medical Group',
    url: publicSiteUrl,
  };
}

export function publicSchemaGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [publicOrganizationJsonLd(), publicWebSiteJsonLd()],
  };
}
