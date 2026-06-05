import type { Metadata } from 'next';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';

// TODO: Replace placeholders once public contact details are verified in source material.
const contactEmail = 'Email to be confirmed';
const contactPhone = 'Phone to be confirmed';

export const metadata: Metadata = {
  title: 'Contact Ambe Medical Group | Pharmaceutical Trading Enquiries',
  description:
    'Contact Ambe Medical Group about pharmaceutical trading, comparator drug sourcing, procurement, route to market, supplier onboarding, or customer onboarding.',
  openGraph: {
    title: 'Contact Ambe Medical Group | Pharmaceutical Trading Enquiries',
    description:
      'Contact Ambe Medical Group for pharmaceutical trading, comparator sourcing, procurement, and onboarding enquiries.',
    type: 'website',
  },
};

export default function ContactPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="contact-title">
        <p className="public-eyebrow">Contact</p>
        <h1 id="contact-title">Contact Ambe Medical Group</h1>
        <p>
          Share a pharmaceutical trading, comparator drug sourcing,
          pharmaceutical procurement, route to market, supplier onboarding, or
          customer onboarding enquiry for review.
        </p>
      </section>

      <section className="public-contact public-contact-page" id="contact">
        <div>
          <p className="public-eyebrow">Enquiry details</p>
          <h2>What to include</h2>
          <p>
            Include the product or service requirement, target timing, supplier
            or customer context, and any documents already available. Do not
            include sensitive personal data unless requested through an
            appropriate channel.
          </p>
        </div>
        <div className="public-contact-card">
          <p className="public-contact-card-heading">
            Supplier / Customer Enquiry
          </p>
          <p>
            <span>Email</span>
            {contactEmail}
          </p>
          <p>
            <span>Phone</span>
            {contactPhone}
          </p>
          <p className="public-contact-note">
            Direct public enquiry details should be published once verified.
          </p>
        </div>
      </section>

      <section className="public-page-section public-page-card-grid">
        <article className="public-page-card">
          <h2>Comparator sourcing</h2>
          <p>
            Product name, strength, pack, presentation, timing, and target
            market context are useful for comparator drug sourcing enquiries.
          </p>
        </article>
        <article className="public-page-card">
          <h2>Trading and procurement</h2>
          <p>
            Share commercial context, supplier or customer status, and any route
            to market considerations.
          </p>
        </article>
        <article className="public-page-card">
          <h2>Onboarding</h2>
          <p>
            Account opening forms, GDP questionnaires, licences, and compliance
            details may be relevant depending on the enquiry.
          </p>
        </article>
      </section>

      <PublicFooter />
    </main>
  );
}
