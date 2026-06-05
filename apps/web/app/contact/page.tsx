import type { Metadata } from 'next';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { publicContact, publicUrl } from '../publicSite';

export const metadata: Metadata = {
  title: 'Contact Ambe Medical Group | Pharmaceutical Trading Enquiries',
  description:
    'Contact Ambe Medical Group about pharmaceutical trading, comparator drug sourcing, procurement, route to market, supplier onboarding, or customer onboarding.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact Ambe Medical Group | Pharmaceutical Trading Enquiries',
    description:
      'Contact Ambe Medical Group for pharmaceutical trading, comparator sourcing, procurement, and onboarding enquiries.',
    type: 'website',
    url: publicUrl('/contact'),
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
            <a href={publicContact.emailHref}>{publicContact.email}</a>
          </p>
          <p>
            <span>Phone</span>
            <a href={publicContact.phoneHref}>{publicContact.phone}</a>
          </p>
          <p className="public-contact-note">
            Prefer email for product requirements and documentation-led
            onboarding enquiries.
          </p>
          <a
            className="public-button public-button-primary"
            href={publicContact.emailHref}
          >
            Email Ambe Medical Group
          </a>
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
