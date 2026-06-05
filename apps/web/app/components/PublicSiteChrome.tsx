import Link from 'next/link';

import { publicContact, publicRoutes } from '../publicSite';

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
        {publicRoutes.map((link) => (
          <Link href={link.path} key={link.path}>
            {link.label}
          </Link>
        ))}
      </nav>
      <Link className="public-header-cta" href="/contact">
        Supplier / Customer Enquiry
      </Link>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <p className="public-footer-brand">Ambe Medical Group</p>
        <p>
          Pharmaceutical trading, comparator drug sourcing, procurement support,
          and supplier/customer onboarding.
        </p>
        <p className="public-footer-contact">
          <a href={publicContact.emailHref}>{publicContact.email}</a>
          <a href={publicContact.phoneHref}>{publicContact.phone}</a>
        </p>
      </div>
      <nav aria-label="Footer quick links">
        {publicRoutes.map((link) => (
          <Link href={link.path} key={link.path}>
            {link.label}
          </Link>
        ))}
        <Link href="/login">Staff Login</Link>
      </nav>
    </footer>
  );
}
