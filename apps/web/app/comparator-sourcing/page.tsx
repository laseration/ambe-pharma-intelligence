import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';

export const metadata: Metadata = {
  title: 'Comparator Drug Sourcing | Ambe Medical Group',
  description:
    'Comparator drug sourcing support for pharmaceutical businesses, including requirement review, procurement context, documentation, and trade discussion.',
  openGraph: {
    title: 'Comparator Drug Sourcing | Ambe Medical Group',
    description:
      'Requirement-led comparator drug sourcing support with procurement context and documentation-aware next steps.',
    type: 'website',
  },
};

export default function ComparatorSourcingPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="comparator-title">
        <p className="public-eyebrow">Comparator sourcing</p>
        <h1 id="comparator-title">
          Comparator drug sourcing for defined pharmaceutical requirements
        </h1>
        <p>
          Comparator drug sourcing depends on accurate product requirements,
          market context, availability conversations, documentation, and
          appropriate supplier and customer qualification.
        </p>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Review points</p>
          <h2>Clear product context before sourcing conversations</h2>
        </div>
        <div className="public-check-list">
          <p>Product name, pack size, strength, and presentation</p>
          <p>Target market, intended use context, and timing</p>
          <p>Supplier documentation and account readiness</p>
          <p>Customer onboarding and route to market considerations</p>
        </div>
      </section>

      <section className="public-page-section public-page-card-grid">
        <article className="public-page-card">
          <h2>Requirement-led sourcing</h2>
          <p>
            Enquiries are reviewed against the specific product requirement,
            rather than broad claims of stockholding or immediate availability.
          </p>
        </article>
        <article className="public-page-card">
          <h2>Documentation-aware process</h2>
          <p>
            Supplier and customer documents, licences, compliance details, and
            account forms may be required before discussions progress.
          </p>
        </article>
        <article className="public-page-card">
          <h2>Route to market support</h2>
          <p>
            Commercial route to market context helps shape the most appropriate
            supplier or customer conversation.
          </p>
        </article>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Comparator enquiry</p>
          <h2>Share a product requirement for review</h2>
          <p>
            Include product details, timing, and any documentation context that
            may affect sourcing or onboarding.
          </p>
        </div>
        <Link className="public-button public-button-primary" href="/contact">
          Start an enquiry
        </Link>
      </section>

      <PublicFooter />
    </main>
  );
}
