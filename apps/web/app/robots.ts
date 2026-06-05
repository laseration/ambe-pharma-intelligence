import type { MetadataRoute } from 'next';

import { publicSiteUrl, publicUrl } from './publicSite';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/dashboard/', '/login'],
    },
    sitemap: publicUrl('/sitemap.xml'),
    host: publicSiteUrl,
  };
}
