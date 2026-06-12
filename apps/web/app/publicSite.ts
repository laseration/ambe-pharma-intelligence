const DEFAULT_PUBLIC_SITE_URL = 'https://ambemedical.com';

function normalizePublicSiteUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, '');

  return trimmed || DEFAULT_PUBLIC_SITE_URL;
}

export const publicSiteUrl = normalizePublicSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL,
);

export const publicContact = {
  email: 'info@ambemedical.com',
  phone: '+44 (0)1732 760900',
  phoneHref: 'tel:+441732760900',
  emailHref: 'mailto:info@ambemedical.com',
};

export const publicRoutes = [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About' },
  { path: '/services', label: 'Services' },
  { path: '/comparator-sourcing', label: 'Comparator Sourcing' },
  { path: '/trade-access', label: 'Trade Access' },
  { path: '/onboarding', label: 'Onboarding' },
  { path: '/contact', label: 'Contact' },
] as const;

export const publicNavItems = [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About' },
  { path: '/services', label: 'Services' },
  { path: '/comparator-sourcing', label: 'Comparator Sourcing' },
  { path: '/trade-access', label: 'Trade Access' },
  { path: '/onboarding', label: 'Onboarding' },
  { path: '/contact', label: 'Contact' },
] as const;

export function publicUrl(path: string): string {
  return new URL(path, publicSiteUrl).toString();
}
