import type { Metadata } from 'next';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { publicContact } from '../publicSite';
import { buildPublicMetadata } from '../seo';

export const metadata: Metadata = buildPublicMetadata({
  path: '/contact',
  title: 'Contact Ambe Medical Group | Pharmaceutical Trading Enquiries',
  description:
    'Contact Ambe Medical Group with pharmaceutical trading, comparator sourcing, procurement, account review, or onboarding enquiries.',
  openGraphTitle:
    'Contact Ambe Medical Group | Pharmaceutical Trading Enquiries',
  openGraphDescription:
    'Contact Ambe Medical Group with pharmaceutical trading, comparator sourcing, procurement, account review, or onboarding enquiries.',
});

export default function ContactPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="contact-title">
        <p className="public-eyebrow">Contact</p>
        <h1 id="contact-title">Contact Ambe Medical Group</h1>
        <p>
          Serious pharmaceutical trade enquiries should include enough company,
          product, timing, and documentation context for Ambe to review the next
          step.
        </p>
      </section>

      <section className="public-contact public-contact-page" id="contact">
        <div>
          <p className="public-eyebrow">Enquiry details</p>
          <h2>Send the practical details first</h2>
          <p>
            Email is preferred for product requirements and documentation-led
            enquiries because it gives both sides a clear record. Include only
            information relevant to the business enquiry and avoid sensitive
            personal data unless Ambe has requested it through an appropriate
            channel.
          </p>
          <div className="public-check-list">
            <p>Company name, business type, and main contact</p>
            <p>Product, comparator, supplier, or customer requirement</p>
            <p>Quantity, market, timing, and commercial context where relevant</p>
            <p>Current document status or account-opening position</p>
          </div>
        </div>
        <div className="public-contact-card">
          <p className="public-contact-card-heading">
            Trade enquiry contact
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
            For urgent timing constraints, include the required date and any
            immediate document limitations in the first email.
          </p>
          <a
            className="public-button public-button-primary"
            href={publicContact.emailHref}
          >
            Email Ambe Medical Group
          </a>
        </div>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Trade account application</p>
          <h2>Use account opening when documents are ready</h2>
          <p>
            Email Ambe when you are ready to provide company details, business
            type, relevant documents, and trading requirements for review.
          </p>
        </div>
        <a
          className="public-button public-button-primary"
          href={publicContact.emailHref}
        >
          Email Ambe Medical Group
        </a>
      </section>

      <PublicFooter />
    </main>
  );
}
