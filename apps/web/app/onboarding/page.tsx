import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { buildPublicMetadata } from '../seo';

const supplierItems = [
  'Registered company details and trading contact',
  'Business role, product area, and route-to-market context',
  'Relevant licences, registrations, questionnaires, or account documents where applicable',
  'Commercial contact point for supply discussion and follow-up',
];

const customerItems = [
  'Company details, buying contact, and account information',
  'Business type, procurement need, and delivery or receiving context where relevant',
  'Relevant licences, registrations, or supporting documents where applicable',
  'Product interests, timing, and any existing supplier or market constraints',
];

const steps = [
  {
    title: 'Identify the relationship',
    copy: 'Clarify whether the enquiry is supplier-led, customer-led, comparator-led, or a broader commercial discussion.',
  },
  {
    title: 'Collect the core details',
    copy: 'Gather company, contact, business type, product, timing, and document information relevant to the enquiry.',
  },
  {
    title: 'Review documents',
    copy: 'Check which licences, registrations, GDP questionnaires, account forms, or supporting materials are available or still required.',
  },
  {
    title: 'Set the next step',
    copy: 'Move to account review, a supplier discussion, a customer conversation, or a request for further information.',
  },
];

export const metadata: Metadata = buildPublicMetadata({
  path: '/onboarding',
  title: 'Supplier & Customer Onboarding Documentation | Ambe',
  description:
    'Supplier and customer onboarding documentation process for pharmaceutical trade enquiries, account information, and review.',
  openGraphTitle: 'Supplier & Customer Onboarding Documentation | Ambe',
  openGraphDescription:
    'Supplier and customer onboarding documentation process for pharmaceutical trade enquiries and account review.',
});

export default function OnboardingPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="onboarding-title">
        <p className="public-eyebrow">Onboarding</p>
        <h1 id="onboarding-title">
          Supplier and customer onboarding are reviewed separately
        </h1>
        <p>
          Pharmaceutical trade enquiries often fail when supplier and customer
          information is mixed together. Ambe keeps the two routes distinct so
          the right company details, documents, and commercial context can be
          reviewed before discussion progresses.
        </p>
      </section>

      <section className="public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">Two onboarding routes</p>
          <h2>Different information is needed on each side of the trade</h2>
        </div>
        <div className="public-page-card-grid">
          <article className="public-page-card">
            <h2>Supplier onboarding</h2>
            <p>
              Used where a supplier, manufacturer, or commercial source wants to
              discuss a possible trade relationship or product route.
            </p>
            <div className="public-check-list">
              {supplierItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>
          <article className="public-page-card">
            <h2>Customer onboarding</h2>
            <p>
              Used where a pharmacy, wholesaler, healthcare buyer, or other
              trade customer wants account review or product procurement
              discussion.
            </p>
            <div className="public-check-list">
              {customerItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">Process</p>
          <h2>From enquiry to review-ready information</h2>
        </div>
        <ol className="public-workflow-list public-workflow-list-wide">
          {steps.map((step) => (
            <li key={step.title}>
              <span>{step.title}</span>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Document handling</p>
          <h2>Documents support review; they do not replace it</h2>
        </div>
        <div className="public-copy-stack">
          <p>
            Onboarding material may include account forms, GDP questionnaires,
            licences or registrations, company details, contacts, product
            interests, and commercial context. The exact documents depend on the
            role of the counterparty and the nature of the enquiry.
          </p>
          <p>
            Supplying documents does not confirm account approval or trading
            terms. It gives Ambe the information needed to decide whether the
            discussion can continue and what should happen next.
          </p>
        </div>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Start onboarding</p>
          <h2>Start with the correct onboarding route</h2>
          <p>
            Send company, document, and trading context for structured review,
            or contact Ambe first if the route is uncertain.
          </p>
        </div>
        <div className="public-cta-actions">
          <Link className="public-button public-button-primary" href="/contact">
            Contact Ambe
          </Link>
          <Link
            className="public-button public-button-secondary"
            href="/services"
          >
            View Services
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
