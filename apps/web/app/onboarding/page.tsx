import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';

const steps = [
  {
    title: 'Enquiry',
    copy: 'Capture the product, supplier, customer, market, and commercial context.',
  },
  {
    title: 'Product / Requirement Review',
    copy: 'Review product detail, presentation, timing, route to market, and practical constraints.',
  },
  {
    title: 'Documentation',
    copy: 'Coordinate GDP questionnaires, account opening forms, licences, compliance details, and related information where applicable.',
  },
  {
    title: 'Trade Discussion',
    copy: 'Progress qualified supplier or customer conversations with clear commercial next steps.',
  },
];

export const metadata: Metadata = {
  title: 'Supplier & Customer Onboarding | Ambe Medical Group',
  description:
    'Supplier onboarding and customer onboarding support for pharmaceutical trading, including documentation-led account review and trade discussion steps.',
  openGraph: {
    title: 'Supplier & Customer Onboarding | Ambe Medical Group',
    description:
      'Documentation-led supplier and customer onboarding support for pharmaceutical trading relationships.',
    type: 'website',
  },
};

export default function OnboardingPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="onboarding-title">
        <p className="public-eyebrow">Onboarding</p>
        <h1 id="onboarding-title">
          Supplier and customer onboarding for trading conversations
        </h1>
        <p>
          Ambe Medical Group supports supplier onboarding and customer
          onboarding with a documentation-led process before pharmaceutical
          trading and procurement conversations move forward.
        </p>
      </section>

      <section className="public-page-section">
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
          <p className="public-eyebrow">Documents</p>
          <h2>Common materials reviewed during onboarding</h2>
        </div>
        <div className="public-check-list">
          <p>GDP questionnaires and account opening forms</p>
          <p>Licences and relevant compliance details where applicable</p>
          <p>Supplier and customer account information</p>
          <p>Commercial and route to market context</p>
        </div>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Start onboarding</p>
          <h2>Prepare documentation before trade discussion</h2>
          <p>
            Send the requirement and available documents so the next onboarding
            step can be reviewed.
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
