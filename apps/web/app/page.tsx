import { PublicFooter, PublicHeader } from './components/PublicSiteChrome';

const serviceCards = [
  {
    marker: 'CS',
    title: 'Comparator Drug Sourcing',
    copy: 'Structured sourcing support for comparator medicine requirements, with clear commercial discussion and documentation-led supplier engagement.',
  },
  {
    marker: 'PT',
    title: 'Pharmaceutical Trading',
    copy: 'Relationship-led pharmaceutical trading support across qualified supplier and customer networks.',
  },
  {
    marker: 'PP',
    title: 'Product Procurement',
    copy: 'Practical pharmaceutical procurement assistance for defined product requirements, availability checks, and supplier conversations.',
  },
  {
    marker: 'RM',
    title: 'Route to Market Support',
    copy: 'Commercial support for route to market planning, customer introductions, and trade discussions.',
  },
  {
    marker: 'SO',
    title: 'Supplier & Customer Onboarding',
    copy: 'A documentation-aware process for supplier onboarding and customer onboarding before trade discussions progress.',
  },
  {
    marker: 'DS',
    title: 'Documentation Support',
    copy: 'Coordination around standard trade documents including GDP questionnaires, account opening forms, licences, and compliance details.',
  },
];

const trustItems = [
  'UK Pharmaceutical Sector',
  'Comparator Sourcing',
  'Supplier & Customer Network',
  'Documentation-Led Process',
];

const floatingCards = [
  {
    title: 'Comparator Sourcing',
    detail: 'Requirement-led review',
  },
  {
    title: 'Procurement',
    detail: 'Availability conversations',
  },
  {
    title: 'Supplier Documentation',
    detail: 'Onboarding materials',
  },
  {
    title: 'Route to Market',
    detail: 'Commercial next steps',
  },
];

const workflowSteps = [
  {
    title: 'Enquiry',
    copy: 'Share the product, market, timing, and commercial context.',
  },
  {
    title: 'Product / Requirement Review',
    copy: 'Review pack, strength, presentation, sourcing route, and practical constraints.',
  },
  {
    title: 'Documentation',
    copy: 'Coordinate GDP questionnaires, account opening forms, licences, and compliance details.',
  },
  {
    title: 'Trade Discussion',
    copy: 'Progress qualified supplier or customer conversations with clear next actions.',
  },
];

// TODO: Replace these placeholders when public contact details are verified in source material.
const contactEmail = 'Email to be confirmed';
const contactPhone = 'Phone to be confirmed';

export default function PublicHomePage() {
  return (
    <main className="public-site">
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-hero" aria-labelledby="public-hero-title">
        <div className="public-hero-content">
          <p className="public-eyebrow">Pharmaceutical trading support</p>
          <h1 id="public-hero-title">
            Comparator Drug Sourcing & Pharmaceutical Trading
          </h1>
          <p className="public-hero-copy">
            Ambe Medical Group supports pharmaceutical businesses with reliable
            sourcing, trading relationships, procurement support, and
            route-to-market solutions.
          </p>
          <div
            className="public-hero-proof"
            aria-label="Homepage service summary"
          >
            <span>Pharmaceutical procurement</span>
            <span>Supplier onboarding</span>
            <span>Customer onboarding</span>
          </div>
          <div className="public-hero-actions">
            <a className="public-button public-button-primary" href="/contact">
              Contact Ambe
            </a>
            <a
              className="public-button public-button-secondary"
              href="/contact"
            >
              Supplier / Customer Enquiries
            </a>
          </div>
        </div>
        <div
          className="public-hero-visual"
          aria-label="Trading service focus areas"
        >
          {floatingCards.map((card) => (
            <div className="public-floating-card" key={card.title}>
              <span>{card.title}</span>
              <small>{card.detail}</small>
            </div>
          ))}
          <div className="public-visual-core">
            <span>Trade review</span>
          </div>
        </div>
      </section>

      <section className="public-trust-strip" aria-label="Business focus areas">
        {trustItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </section>

      <section className="public-section public-about" id="about">
        <div>
          <p className="public-eyebrow">About</p>
          <h2>
            Professional trading relationships for pharmaceutical businesses
          </h2>
        </div>
        <p>
          Ambe Medical Group is focused on pharmaceutical trading, comparator
          drug sourcing, commercial procurement support, and route to market
          conversations. The business takes a relationship-led approach, with
          supplier and customer discussions supported by clear documentation,
          responsive communication, and careful review of trading requirements.
        </p>
      </section>

      <section
        className="public-section public-comparator"
        id="comparator-sourcing"
      >
        <div className="public-section-copy">
          <p className="public-eyebrow">Comparator sourcing</p>
          <h2>Requirement-led sourcing with clear commercial context</h2>
          <p>
            Comparator drug sourcing often depends on precise product
            requirements, market availability, documentation, and timing. Ambe
            supports these conversations through practical review of the
            requirement, supplier engagement, and documentation-aware next
            steps.
          </p>
        </div>
        <aside className="public-depth-panel">
          <p>Typical review points</p>
          <ul>
            <li>Product name, pack, strength, and presentation</li>
            <li>Target market and commercial context</li>
            <li>Supplier documentation and account status</li>
            <li>Customer onboarding and route to market considerations</li>
          </ul>
        </aside>
      </section>

      <section className="public-section" id="services">
        <div className="public-section-heading">
          <p className="public-eyebrow">Services</p>
          <h2>Trading, procurement, and onboarding support</h2>
        </div>
        <div className="public-service-grid">
          {serviceCards.map((service) => (
            <article className="public-service-card" key={service.title}>
              <span className="public-service-marker">{service.marker}</span>
              <h3>{service.title}</h3>
              <p>{service.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-workflow" id="onboarding">
        <div className="public-section-heading">
          <p className="public-eyebrow">Onboarding</p>
          <h2>A clear process before trade discussions progress</h2>
          <p>
            Standard onboarding may include GDP questionnaires, account opening
            forms, licences, compliance details, and commercial review. The
            process is designed to support responsible supplier onboarding and
            customer onboarding without replacing partner due diligence.
          </p>
        </div>
        <ol className="public-workflow-list">
          {workflowSteps.map((step) => (
            <li key={step.title}>
              <span>{step.title}</span>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="public-section public-compliance">
        <div>
          <p className="public-eyebrow">Compliance aware</p>
          <h2>Documentation and responsible trading processes matter</h2>
        </div>
        <p>
          We understand the importance of clear documentation, responsible
          trading processes, and working with appropriately qualified partners.
          Licence status, regulatory roles, storage requirements, and fulfilment
          arrangements should be confirmed during onboarding and trade review.
        </p>
      </section>

      <section className="public-contact" id="contact">
        <div>
          <p className="public-eyebrow">Contact</p>
          <h2>Start a focused trade conversation</h2>
          <p>
            Share your product requirement, sourcing enquiry, or onboarding
            question and the team will review the most appropriate next step.
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
            Direct enquiry details should be published once verified.
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
