import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';

const services = [
  {
    title: 'Comparator Drug Sourcing',
    copy: 'Structured support for comparator requirements, with attention to product details, availability conversations, timing, and documentation.',
  },
  {
    title: 'Pharmaceutical Trading',
    copy: 'Relationship-led pharmaceutical trading support across supplier and customer conversations.',
  },
  {
    title: 'Pharmaceutical Procurement',
    copy: 'Practical procurement support for defined product requirements and supplier discussions.',
  },
  {
    title: 'Route to Market Support',
    copy: 'Commercial route to market discussion for qualified product and customer opportunities.',
  },
  {
    title: 'Supplier Onboarding',
    copy: 'Coordination around supplier documents, account information, licences, and compliance details where applicable.',
  },
  {
    title: 'Customer Onboarding',
    copy: 'Support for account opening workflows, documentation review, and customer qualification steps.',
  },
];

export const metadata: Metadata = {
  title: 'Pharmaceutical Trading & Procurement Services | Ambe Medical Group',
  description:
    'Explore Ambe Medical Group services for pharmaceutical trading, comparator drug sourcing, procurement, route to market support, and onboarding.',
  openGraph: {
    title: 'Pharmaceutical Trading & Procurement Services | Ambe Medical Group',
    description:
      'Pharmaceutical trading, comparator sourcing, procurement, route to market support, and onboarding services.',
    type: 'website',
  },
};

export default function ServicesPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="services-title">
        <p className="public-eyebrow">Services</p>
        <h1 id="services-title">
          Pharmaceutical trading and procurement services
        </h1>
        <p>
          Ambe Medical Group supports carefully scoped pharmaceutical trading,
          comparator drug sourcing, pharmaceutical procurement, route to market,
          supplier onboarding, and customer onboarding workflows.
        </p>
      </section>

      <section className="public-page-section">
        <div className="public-page-card-grid">
          {services.map((service) => (
            <article className="public-page-card" key={service.title}>
              <h2>{service.title}</h2>
              <p>{service.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Next step</p>
          <h2>Discuss a specific product or onboarding requirement</h2>
          <p>
            Share the product, supplier, customer, or route to market context so
            the appropriate documentation and commercial next steps can be
            reviewed.
          </p>
        </div>
        <Link className="public-button public-button-primary" href="/contact">
          Contact Ambe
        </Link>
      </section>

      <PublicFooter />
    </main>
  );
}
