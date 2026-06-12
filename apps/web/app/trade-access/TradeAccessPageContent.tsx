import React, { type ReactNode } from 'react';

import { PublicFooter, PublicHeader } from '../components/PublicSiteChrome';
import { publicContact } from '../publicSite';
import type { TradeAccessFormState } from './state';
import { TradeAccessForm } from './TradeAccessForm';

type TradeAccessPageContentProps = {
  formAction: (
    state: TradeAccessFormState,
    formData: FormData,
  ) => Promise<TradeAccessFormState>;
  initialFormState: TradeAccessFormState;
};

const reviewPoints = [
  'Company and contact details are checked before commercial follow-up.',
  'Product, strength, pack, quantity, market, and timing are reviewed together.',
  'Availability and pricing are not assumed from an enquiry or supplier list.',
  'Documentation requirements are handled before commitments are discussed.',
];

const processSteps = [
  {
    title: 'Submit the requirement',
    copy: 'Provide the product or comparator details, company context, target market, timing, and any documentation constraints.',
  },
  {
    title: 'Manual commercial review',
    copy: 'Ambe reviews whether the enquiry is appropriate to progress and what additional information may be needed.',
  },
  {
    title: 'Follow-up where suitable',
    copy: 'If the requirement can be reviewed further, Ambe will respond with practical next steps rather than automated ordering.',
  },
];

function TradeAccessLayout({ children }: { children: ReactNode }) {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />
      {children}
      <PublicFooter />
    </main>
  );
}

export function TradeAccessPageContent({
  formAction,
  initialFormState,
}: TradeAccessPageContentProps) {
  return (
    <TradeAccessLayout>
      <section
        className="public-page-hero"
        aria-labelledby="trade-access-title"
      >
        <p className="public-eyebrow">B2B Trade Access</p>
        <h1 id="trade-access-title">
          Submit a pharmaceutical trade requirement for manual review
        </h1>
        <p>
          Use this route for business-to-business comparator sourcing and trade
          enquiries. Ambe reviews each requirement manually; submission does not
          confirm availability, pricing, account approval, or an order.
        </p>
      </section>

      <section className="public-page-section public-trade-access-intro">
        <div className="public-copy-stack">
          <p className="public-eyebrow">Review basis</p>
          <h2>Clear requirements make a safer first review</h2>
          <p>
            This page is not a public storefront or medicine catalogue. It is a
            structured way for appropriate trade buyers to share requirements
            that need commercial and documentation review before any next step.
          </p>
          <p>
            Include the details a procurement or comparator sourcing team would
            normally need at the outset. If the requirement is incomplete, Ambe
            may ask for clarification before discussing commercial options.
          </p>
        </div>
        <div className="public-depth-panel">
          <p>What Ambe reviews first</p>
          <ul>
            {reviewPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="public-page-section public-rfq-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">RFQ details</p>
          <h2>Submit requirement details</h2>
          <p>
            Complete the form with practical trade information. Do not submit
            sensitive personal data or assume that a listed product, price, or
            timing can be supplied.
          </p>
        </div>
        <TradeAccessForm action={formAction} initialState={initialFormState} />
        <p className="public-rfq-privacy-note">
          Ambe may use the submitted information to review and respond to the
          trade enquiry. Do not submit patient information or unnecessary
          personal data.
        </p>
      </section>

      <section className="public-workflow public-page-section">
        <div className="public-section-heading">
          <p className="public-eyebrow">Process</p>
          <h2>Manual review before commercial commitments</h2>
          <p>
            The RFQ route is designed for conservative enquiry handling, not
            automated buying or public product advertising.
          </p>
        </div>
        <ol className="public-workflow-list public-workflow-list-wide">
          {processSteps.map((step) => (
            <li key={step.title}>
              <span>{step.title}</span>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="public-page-cta">
        <div>
          <p className="public-eyebrow">Prefer email?</p>
          <h2>Send the same details by email</h2>
          <p>
            Email remains suitable for longer requirements, document context, or
            urgent timing constraints.
          </p>
        </div>
        <a
          className="public-button public-button-primary"
          href={publicContact.emailHref}
        >
          Email Ambe Medical Group
        </a>
      </section>
    </TradeAccessLayout>
  );
}
