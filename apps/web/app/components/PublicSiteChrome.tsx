import Link from 'next/link';

import { publicContact, publicNavItems } from '../publicSite';

const footerGroups = [
  {
    title: 'Company',
    links: [
      { href: '/', label: 'Home' },
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Services',
    links: [
      { href: '/services', label: 'Services' },
      { href: '/comparator-sourcing', label: 'Comparator Sourcing' },
      { href: '/onboarding', label: 'Onboarding' },
    ],
  },
  {
    title: 'Enquiries',
    links: [{ href: '/contact', label: 'Trade Enquiries' }],
  },
  {
    title: 'Internal',
    links: [{ href: '/login', label: 'Staff Login', lowProminence: true }],
  },
] as const;

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link
        className="public-wordmark"
        href="/"
        aria-label="Ambe Medical Group home"
      >
        <span className="public-wordmark-mark">AM</span>
        <span>Ambe Medical Group</span>
      </Link>
      <nav className="public-nav" aria-label="Public website navigation">
        {publicNavItems.map((link) => (
          <Link href={link.path} key={link.path}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="public-footer">
      <div className="public-footer-main">
        <div className="public-footer-summary">
          <p className="public-footer-brand">Ambe Medical Group</p>
          <p>
            UK pharmaceutical trade enquiries, comparator requirements, account
            review, and documentation-led onboarding for suitable healthcare
            trade relationships.
          </p>
          <dl className="public-footer-contact-list">
            <div>
              <dt>Email</dt>
              <dd>
                <a href={publicContact.emailHref}>{publicContact.email}</a>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={publicContact.phoneHref}>{publicContact.phone}</a>
              </dd>
            </div>
          </dl>
          <p className="public-footer-note">
            Public information is intentionally limited to trade enquiry routing
            and should be reviewed with Ambe before commercial next steps.
          </p>
        </div>
        <nav className="public-footer-groups" aria-label="Footer links">
          {footerGroups.map((group) => (
            <div className="public-footer-group" key={group.title}>
              <p>{group.title}</p>
              {group.links.map((link) => (
                <Link
                  className={
                    'lowProminence' in link && link.lowProminence
                      ? 'public-footer-link-muted'
                      : undefined
                  }
                  href={link.href}
                  key={`${group.title}-${link.href}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="public-footer-bottom">
        <p>&copy; {currentYear} Ambe Medical Group.</p>
        <p>Public pharmaceutical trade enquiries only.</p>
      </div>
    </footer>
  );
}
