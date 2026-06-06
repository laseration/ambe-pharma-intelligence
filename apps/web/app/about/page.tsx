import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { buildPublicMetadata } from '../seo';

export const metadata: Metadata = buildPublicMetadata({
  path: '/about',
  title: 'About Ambe Medical Group | UK Pharmaceutical Trading Business',
  description:
    'Learn about Ambe Medical Group and its conservative approach to UK pharmaceutical trading enquiries and account review.',
  openGraphTitle:
    'About Ambe Medical Group | UK Pharmaceutical Trading Business',
  openGraphDescription:
    'A conservative, documentation-aware approach to UK pharmaceutical trading enquiries and account review.',
});

export default function AboutPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="about-title">
        <p className="public-eyebrow">About Ambe</p>
        <h1 id="about-title">
          A careful public profile for pharmaceutical trade
        </h1>
        <p>
          Ambe Medical Group keeps its public positioning deliberately
          conservative. The website is designed to introduce the business,
          direct serious enquiries, and avoid assumptions that should only be
          made after company, product, and documentation review.
        </p>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Approach</p>
          <h2>Commercially practical, documentation aware</h2>
        </div>
        <div className="public-copy-stack">
          <p>
            Pharmaceutical trade conversations are rarely helped by vague public
            claims. Ambe therefore starts with the practical details: who the
            counterparty is, what product or relationship is being discussed,
            which documents are available, and what timing or market constraints
            need to be understood.
          </p>
          <p>
            Licence status, regulatory roles, premises, storage, fulfilment, and
            other operating responsibilities should be confirmed during the
            relevant review process. The public site does not present those
            points as settled facts where they have not been verified for the
            specific relationship.
          </p>
        </div>
      </section>

      <section className="public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">Business posture</p>
          <h2>How Ambe prefers to handle enquiries</h2>
        </div>
        <div className="public-page-card-grid">
          <article className="public-page-card">
            <h3>Specific before speculative</h3>
            <p>
              Product names, pack details, presentation, market context, and
              timing are more useful than broad sourcing requests.
            </p>
          </article>
          <article className="public-page-card">
            <h3>Documentation kept visible</h3>
            <p>
              Account forms, licences, registrations, questionnaires, and
              supporting documents are treated as part of the commercial
              discussion, not an afterthought.
            </p>
          </article>
          <article className="public-page-card">
            <h3>Claims stay proportionate</h3>
            <p>
              Ambe avoids public statements that could imply approvals,
              facilities, stock, or fulfilment capabilities unless those details
              have been confirmed for publication.
            </p>
          </article>
        </div>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Work with Ambe</p>
          <h2>Start with the facts of the enquiry</h2>
          <p>
            Share company details, product context, and document status so Ambe
            can decide the appropriate route for review.
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
