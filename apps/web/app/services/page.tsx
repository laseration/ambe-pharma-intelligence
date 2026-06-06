import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { buildPublicMetadata } from '../seo';

const serviceGroups = [
  {
    title: 'Comparator and procurement enquiries',
    copy: 'Defined product requirements are reviewed against presentation, market, timing, quantity, documentation, and commercial context. This is the right route when the enquiry begins with a specific medicine, comparator need, or procurement brief.',
    href: '/comparator-sourcing',
    linkLabel: 'Comparator sourcing',
  },
  {
    title: 'Trading relationships and commercial supply discussions',
    copy: 'Supplier and customer conversations are handled with attention to counterparty fit, product context, route to market, and realistic next steps. Ambe does not present the website as a public stock list or automated ordering channel.',
    href: '/contact',
    linkLabel: 'Discuss an enquiry',
  },
  {
    title: 'Onboarding and documentation coordination',
    copy: 'Company details, contacts, business type, relevant licences or registrations, GDP questionnaires, account forms, and supporting materials can be gathered before trade discussions progress.',
    href: '/onboarding',
    linkLabel: 'Onboarding process',
  },
];

const reviewSteps = [
  {
    title: 'Define the enquiry',
    copy: 'Product, party, timing, and commercial purpose are made clear before expectations are set.',
  },
  {
    title: 'Check document context',
    copy: 'Relevant account, licence, registration, questionnaire, or supporting material is identified where applicable.',
  },
  {
    title: 'Agree the next route',
    copy: 'The enquiry is directed towards account review, comparator sourcing, a supplier discussion, or a customer conversation.',
  },
];

export const metadata: Metadata = buildPublicMetadata({
  path: '/services',
  title: 'Pharmaceutical Trading Services & Procurement Support | Ambe',
  description:
    'Explore Ambe Medical Group services for pharmaceutical trading enquiries, procurement support, comparator requirements, and onboarding coordination.',
  openGraphTitle:
    'Pharmaceutical Trading Services & Procurement Support | Ambe',
  openGraphDescription:
    'Pharmaceutical trading services, procurement support, comparator requirements, and onboarding coordination from Ambe Medical Group.',
});

export default function ServicesPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="services-title">
        <p className="public-eyebrow">Services</p>
        <h1 id="services-title">
          Pharmaceutical trade services with a defined commercial purpose
        </h1>
        <p>
          Ambe Medical Group groups public enquiries into three practical
          routes. Each route starts with enough information to decide whether
          the discussion should progress and what should be checked first.
        </p>
      </section>

      <section className="public-page-section">
        <div className="public-page-card-grid">
          {serviceGroups.map((service) => (
            <article className="public-page-card" key={service.title}>
              <h2>{service.title}</h2>
              <p>{service.copy}</p>
              <Link href={service.href}>{service.linkLabel}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">How enquiries are handled</p>
          <h2>Review before expectation-setting</h2>
        </div>
        <ol className="public-workflow-list public-workflow-list-wide">
          {reviewSteps.map((step) => (
            <li key={step.title}>
              <span>{step.title}</span>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Next step</p>
          <h2>Choose the route that matches the enquiry</h2>
          <p>
            Use account opening for company and document review, or contact
            Ambe with a specific product, supplier, customer, or procurement
            requirement.
          </p>
        </div>
        <div className="public-cta-actions">
          <Link className="public-button public-button-primary" href="/contact">
            Contact Ambe
          </Link>
          <Link className="public-button public-button-secondary" href="/comparator-sourcing">
            Comparator Sourcing
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
