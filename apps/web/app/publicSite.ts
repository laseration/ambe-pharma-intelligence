export const publicSiteUrl = 'https://www.ambemedical.com';

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
  { path: '/onboarding', label: 'Onboarding' },
  { path: '/contact', label: 'Contact' },
] as const;

export function publicUrl(path: string): string {
  return new URL(path, publicSiteUrl).toString();
}
