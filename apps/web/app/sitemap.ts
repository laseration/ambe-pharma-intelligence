import type { MetadataRoute } from 'next';

import { publicRoutes, publicUrl } from './publicSite';

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: publicUrl(route.path),
    lastModified: new Date(),
    changeFrequency: route.path === '/' ? 'weekly' : 'monthly',
    priority: route.path === '/' ? 1 : 0.7,
  }));
}
