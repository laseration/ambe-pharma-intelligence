import Link from 'next/link';

const publicNavLinks = [
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/comparator-sourcing', label: 'Comparator Sourcing' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/contact', label: 'Contact' },
];

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
        {publicNavLinks.map((link) => (
          <Link href={link.href} key={link.href}>
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
      </div>
      <nav aria-label="Footer quick links">
        {publicNavLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
        <Link href="/login">Staff Login</Link>
      </nav>
    </footer>
  );
}
