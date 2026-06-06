import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { buildPublicMetadata } from '../seo';

const requiredDetails = [
  'Product name, active ingredient, strength, pack size, and presentation',
  'Country or market requirement, including any language or pack constraints',
  'Quantity, target timing, and whether the requirement is urgent or planned',
  'Intended procurement context, such as comparator use, customer request, or supplier discussion',
  'Available documents, account status, and any known onboarding requirements',
];

const reviewPoints = [
  {
    title: 'Requirement fit',
    copy: 'The enquiry is checked for clarity, specificity, and whether enough information exists to discuss it responsibly.',
  },
  {
    title: 'Counterparty readiness',
    copy: 'Supplier or customer context, account status, and documentation position can affect whether a discussion can progress.',
  },
  {
    title: 'Commercial practicality',
    copy: 'Timing, quantity, market presentation, and route-to-market context are considered before expectations are set.',
  },
];

const cannotAssume = [
  'Immediate availability, allocation, or price cannot be assumed from a website enquiry.',
  'Licence status, market permissions, storage, transport, and fulfilment responsibilities must be confirmed for the specific transaction.',
  'A comparator enquiry does not guarantee account approval, supplier acceptance, customer acceptance, or successful sourcing.',
  'Documents may be requested before Ambe can progress a discussion or introduce further commercial steps.',
];

export const metadata: Metadata = buildPublicMetadata({
  path: '/comparator-sourcing',
  title: 'Comparator Drug Sourcing Support | Ambe Medical Group',
  description:
    'Comparator drug sourcing enquiries reviewed against product details, market presentation, timing, documentation, and commercial context.',
  openGraphTitle: 'Comparator Drug Sourcing Support | Ambe Medical Group',
  openGraphDescription:
    'Comparator drug sourcing support for defined product, market, timing, documentation, and commercial requirements.',
});

export default function ComparatorSourcingPage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-page-hero" aria-labelledby="comparator-title">
        <p className="public-eyebrow">Comparator sourcing</p>
        <h1 id="comparator-title">
          Comparator drug sourcing for specific pharmaceutical requirements
        </h1>
        <p>
          Comparator sourcing should begin with a precise brief, not a general
          request for availability. Ambe reviews the product detail, market
          presentation, timing, documents, and commercial context before setting
          expectations or progressing a sourcing conversation.
        </p>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Information needed</p>
          <h2>What to include in a comparator sourcing enquiry</h2>
        </div>
        <div className="public-check-list">
          {requiredDetails.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </div>
      </section>

      <section className="public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">Review process</p>
          <h2>How requirements are assessed</h2>
        </div>
        <div className="public-page-card-grid">
          {reviewPoints.map((point) => (
            <article className="public-page-card" key={point.title}>
              <h2>{point.title}</h2>
              <p>{point.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Documentation and timing</p>
          <h2>Small details can decide whether an enquiry is workable</h2>
        </div>
        <div className="public-copy-stack">
          <p>
            Comparator work is sensitive to pack presentation, market
            suitability, lead time, documentation, and account readiness. A
            requirement that looks simple at headline level may need further
            checks before any sensible commercial discussion can take place.
          </p>
          <p>
            Timing matters because documents, counterparty review, product
            identification, and commercial confirmation can each affect the next
            step. The earlier these points are shared, the easier it is to give
            a useful response.
          </p>
        </div>
      </section>

      <section className="public-page-grid public-page-section">
        <div className="public-copy-block">
          <p className="public-eyebrow">Important limits</p>
          <h2>What cannot be assumed or guaranteed</h2>
        </div>
        <div className="public-check-list">
          {cannotAssume.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </div>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Comparator enquiry</p>
          <h2>Send a precise product requirement</h2>
          <p>
            Include the product, pack, market, quantity, timing, commercial
            purpose, and documentation context needed for a serious review.
          </p>
        </div>
        <div className="public-cta-actions">
          <Link className="public-button public-button-primary" href="/contact">
            Start an Enquiry
          </Link>
          <Link className="public-button public-button-secondary" href="/onboarding">
            Onboarding Process
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
