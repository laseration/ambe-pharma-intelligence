import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { PublicFooter, PublicHeader } from './components/PublicSiteChrome';
import { publicContact } from './publicSite';
import { buildPublicMetadata, publicSchemaGraph } from './seo';

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  className?: string;
  children: ReactNode;
};

type ButtonProps = {
  href: string;
  variant?: 'primary' | 'secondary';
  children: ReactNode;
};

type CardContent = {
  title: string;
  copy: string;
  href?: string;
};

type ProcessStepData = {
  title: string;
  copy: string;
};

const trustPoints = [
  'UK pharmaceutical trade enquiries',
  'Comparator requirements reviewed case by case',
  'Documentation-led account review',
];

const audiences: CardContent[] = [
  {
    title: 'Pharmacies',
    copy: 'A direct route for account and product enquiries where pharmacy context, documentation, and buying intent need to be understood early.',
  },
  {
    title: 'Wholesalers',
    copy: 'Commercial discussions shaped around defined requirements, counterparties, documentation status, and practical next steps.',
  },
  {
    title: 'Healthcare buyers',
    copy: 'Procurement enquiries reviewed with attention to product presentation, timing, intended market, and buying process.',
  },
  {
    title: 'Suppliers & manufacturers',
    copy: 'Initial conversations for suitable trade relationships, with company information and route-to-market context gathered before review.',
  },
];

const services: CardContent[] = [
  {
    title: 'Discuss a procurement requirement',
    copy: 'Share the product, presentation, target market, quantity, timing, and commercial context needed for a sensible first review.',
    href: '/contact',
  },
  {
    title: 'Submit comparator details',
    copy: 'For defined comparator enquiries, Ambe asks for precise product information and any documentation constraints from the outset.',
    href: '/comparator-sourcing',
  },
  {
    title: 'Share account context',
    copy: 'Provide company details, business type, contacts, licences where relevant, and supporting documents before trade discussion.',
    href: '/onboarding',
  },
];

const accountSteps: ProcessStepData[] = [
  {
    title: 'Company details',
    copy: 'Registered company, trading name, address, and core business information.',
  },
  {
    title: 'Main contact',
    copy: 'Named account, procurement, or commercial contact for follow-up.',
  },
  {
    title: 'Business type',
    copy: 'Pharmacy, wholesaler, healthcare buyer, supplier, manufacturer, or other trade role.',
  },
  {
    title: 'Licences and documents',
    copy: 'Relevant licences, registrations, GDP questionnaires, account forms, or supporting material where applicable.',
  },
  {
    title: 'Trading requirement',
    copy: 'Product interest, procurement need, supply discussion, or route-to-market context.',
  },
  {
    title: 'Review and next step',
    copy: 'Ambe reviews the enquiry before any account or commercial discussion progresses.',
  },
];

const whyItems: CardContent[] = [
  {
    title: 'Defined requirements first',
    copy: 'Enquiries are easier to assess when the product, presentation, market, quantity, and timing are clear.',
    href: '/services',
  },
  {
    title: 'Manual review before commitments',
    copy: 'Company details, documentation, and commercial context are reviewed before Ambe sets expectations or progresses discussion.',
  },
  {
    title: 'Careful public positioning',
    copy: 'The website avoids claims about licences, premises, storage, fulfilment, or regulatory status that should be confirmed case by case.',
  },
  {
    title: 'Procurement-friendly communication',
    copy: 'The emphasis is on concise information, realistic next steps, and a clear record of what has and has not been established.',
  },
];

export const metadata: Metadata = buildPublicMetadata({
  path: '/',
  title: 'UK Pharmaceutical Trading & Comparator Sourcing | Ambe',
  description:
    'Ambe Medical Group reviews UK pharmaceutical trading enquiries, comparator sourcing requirements, and documentation-led account discussions.',
  openGraphTitle: 'UK Pharmaceutical Trading & Comparator Sourcing | Ambe',
  openGraphDescription:
    'UK pharmaceutical trading enquiries, comparator sourcing requirements, and documentation-led account review from Ambe Medical Group.',
});

function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        className ? `public-container ${className}` : 'public-container'
      }
    >
      {children}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  intro,
  className,
  children,
}: SectionProps) {
  return (
    <section
      className={className ? `public-section ${className}` : 'public-section'}
      id={id}
    >
      <Container>
        {(eyebrow || title || intro) && (
          <div className="public-section-heading">
            {eyebrow ? <p className="public-eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {intro ? <p>{intro}</p> : null}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}

function Button({ href, variant = 'primary', children }: ButtonProps) {
  return (
    <Link className={`public-button public-button-${variant}`} href={href}>
      {children}
    </Link>
  );
}

function AudienceCard({ title, copy }: CardContent) {
  return (
    <article className="public-audience-card">
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}

function ServiceCard({ title, copy, href = '/services' }: CardContent) {
  return (
    <Link className="public-premium-service-card" href={href}>
      <span aria-hidden="true" />
      <h3>{title}</h3>
      <p>{copy}</p>
    </Link>
  );
}

function ProcessStep({
  step,
  index,
}: {
  step: ProcessStepData;
  index: number;
}) {
  return (
    <li>
      <span>{String(index + 1).padStart(2, '0')}</span>
      <div>
        <p>{step.title}</p>
        <small>{step.copy}</small>
      </div>
    </li>
  );
}

function ContactForm() {
  return (
    <form
      className="public-contact-form"
      action={publicContact.emailHref}
      method="post"
      encType="text/plain"
    >
      <div className="public-form-grid">
        <label>
          Name
          <input name="name" type="text" autoComplete="name" required />
        </label>
        <label>
          Company
          <input
            name="company"
            type="text"
            autoComplete="organization"
            required
          />
        </label>
      </div>
      <div className="public-form-grid">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" autoComplete="tel" />
        </label>
      </div>
      <label>
        Business Type
        <select name="businessType" required>
          <option value="">Select a business type</option>
          <option>Pharmacy</option>
          <option>Wholesaler</option>
          <option>Healthcare buyer</option>
          <option>Supplier or manufacturer</option>
          <option>Other healthcare trade partner</option>
        </select>
      </label>
      <label>
        Message
        <textarea
          name="message"
          rows={5}
          required
        />
      </label>
      <p className="public-form-note">
        This form opens your email client and does not store a website
        submission.
      </p>
      <button className="public-button public-button-primary" type="submit">
        Send Enquiry
      </button>
    </form>
  );
}

export default function PublicHomePage() {
  const schema = JSON.stringify(publicSchemaGraph()).replace(/</g, '\\u003c');

  return (
    <main className="public-site">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: schema }}
      />
      <div className="public-depth-layer" aria-hidden="true" />
      <PublicHeader />

      <section className="public-hero" aria-labelledby="public-hero-title">
        <Container className="public-hero-grid">
          <div className="public-hero-content">
            <p className="public-eyebrow">UK pharmaceutical trade partner</p>
            <h1 id="public-hero-title">Ambe Medical Group</h1>
            <p className="public-hero-copy">
              A conservative route into pharmaceutical trade conversations,
              comparator requirements, account review, and documentation-led
              onboarding for suitable UK healthcare trade partners.
            </p>
            <div className="public-hero-actions">
              <Button href="/contact">Start a Trade Enquiry</Button>
              <Button href="#contact" variant="secondary">
                Contact Us
              </Button>
            </div>
          </div>

          <div
            className="public-hero-visual public-trade-visual"
            aria-label="Pharmaceutical enquiry review illustration"
          >
            <div className="public-document-visual">
              <div className="public-document-panel public-document-panel-primary">
                <p className="public-document-kicker">Comparator enquiry</p>
                <p className="public-document-title">
                  Defined product requirement
                </p>
                <div className="public-document-fields" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <dl className="public-document-data">
                  <div>
                    <dt>Market</dt>
                    <dd>To confirm</dd>
                  </div>
                  <div>
                    <dt>Timing</dt>
                    <dd>Under review</dd>
                  </div>
                </dl>
              </div>

              <div className="public-document-panel public-document-panel-secondary">
                <p className="public-document-kicker">Account review</p>
                <p className="public-document-title">
                  Company and document context
                </p>
                <div className="public-document-checks" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="public-review-rail" aria-hidden="true">
                <span>Enquiry</span>
                <span>Documents</span>
                <span>Review</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <section
          className="public-trust-strip"
          aria-label="Business focus areas"
        >
          {trustPoints.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </section>
      </Container>

      <Section
        className="public-who-section"
        eyebrow="Who We Help"
        title="For enquiries that need context before a price conversation"
        intro="Ambe is best suited to serious trade enquiries where the counterparty, product requirement, documentation position, and commercial purpose can be explained clearly."
      >
        <div className="public-audience-grid">
          {audiences.map((audience) => (
            <AudienceCard {...audience} key={audience.title} />
          ))}
        </div>
      </Section>

      <Section
        className="public-service-feature"
        id="services"
        eyebrow="Enquiry routes"
        title="Three practical ways to start"
        intro="The first step is to send the right information to the right route. Ambe reviews the context before setting expectations about availability, counterparties, or next steps."
      >
        <div className="public-premium-service-grid">
          {services.map((service) => (
            <ServiceCard {...service} key={service.title} />
          ))}
        </div>
        <div className="public-section-actions">
          <Button href="/services" variant="secondary">
            View Services
          </Button>
        </div>
      </Section>

      <Section className="public-account-section" id="open-account">
        <div className="public-account-copy">
          <p className="public-eyebrow">Open a Trade Account</p>
          <h2>A structured account path before trade discussion</h2>
          <p>
            Account opening can involve company information, named contacts,
            business type, relevant documents, product interests, and other
            supporting material. The application gives Ambe the context needed
            to decide how the enquiry should be handled.
          </p>
          <Button href="/contact">Discuss Account Review</Button>
        </div>
        <ol className="public-account-step-list">
          {accountSteps.map((step, index) => (
            <ProcessStep index={index} key={step.title} step={step} />
          ))}
        </ol>
      </Section>

      <Section
        className="public-why-section"
        eyebrow="Why Work With Ambe"
        title="A careful commercial posture"
        intro="The public site is intentionally restrained. It is designed to start qualified conversations, not to imply automatic availability, account approval, or operational capability."
      >
        <div className="public-why-grid">
          {whyItems.map((item) => (
            <article className="public-why-item" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </Section>

      <section className="public-contact public-home-contact" id="contact">
        <Container className="public-contact-grid">
          <div>
            <p className="public-eyebrow">Contact</p>
            <h2>Speak to Ambe Medical Group</h2>
            <p>
              Send the company, counterparty, product, timing, and
              documentation context needed for Ambe to review a serious trade
              enquiry.
            </p>
            <p className="public-contact-direct">
              <a href={publicContact.emailHref}>{publicContact.email}</a>
              <a href={publicContact.phoneHref}>{publicContact.phone}</a>
            </p>
          </div>
          <ContactForm />
        </Container>
      </section>

      <PublicFooter />
    </main>
  );
}
