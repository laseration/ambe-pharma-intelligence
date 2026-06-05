import type { Metadata } from 'next';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';

export const metadata: Metadata = {
  title: 'About Ambe Medical Group | Pharmaceutical Trading Experience',
  description:
    'Learn about Ambe Medical Group and its relationship-led pharmaceutical trading, comparator sourcing, procurement, and onboarding support.',
  openGraph: {
    title: 'About Ambe Medical Group | Pharmaceutical Trading Experience',
    description:
      'Relationship-led pharmaceutical trading, comparator sourcing, procurement, and onboarding support.',
    type: 'website',
  },
};

export default function AboutPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="about-title">
        <p className="public-eyebrow">About Ambe</p>
        <h1 id="about-title">
          Pharmaceutical trading built around clear relationships and careful
          documentation
        </h1>
        <p>
          Ambe Medical Group supports pharmaceutical businesses with comparator
          drug sourcing, pharmaceutical trading conversations, pharmaceutical
          procurement support, route to market planning, and supplier and
          customer onboarding.
        </p>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Approach</p>
          <h2>Commercially practical, documentation aware</h2>
        </div>
        <div className="public-copy-stack">
          <p>
            The public Ambe Medical Group website is positioned around
            responsible pharmaceutical trading support rather than operational
            claims. Product requirements, customer context, supplier readiness,
            and documentation are reviewed before any trade discussion moves
            forward.
          </p>
          <p>
            The team focuses on communication, sourcing context, and structured
            onboarding conversations. Licence status, regulatory roles, storage
            requirements, and fulfilment arrangements should be confirmed with
            the relevant parties during account review and trade due diligence.
          </p>
        </div>
      </section>

      <section className="public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">Focus areas</p>
          <h2>Support across the trading relationship</h2>
        </div>
        <div className="public-page-card-grid">
          <article className="public-page-card">
            <h3>Comparator sourcing</h3>
            <p>
              Requirement-led review of product, presentation, timing, and
              commercial context for comparator drug sourcing enquiries.
            </p>
          </article>
          <article className="public-page-card">
            <h3>Trading relationships</h3>
            <p>
              Supplier and customer conversations that keep documentation and
              qualification needs visible from the start.
            </p>
          </article>
          <article className="public-page-card">
            <h3>Onboarding support</h3>
            <p>
              Coordination around standard supplier onboarding and customer
              onboarding materials before trade discussions progress.
            </p>
          </article>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
