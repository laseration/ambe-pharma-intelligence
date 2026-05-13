import Link from 'next/link';

import {
  getAccountOpeningCase,
  type AccountOpeningCaseDetail,
  type AccountOpeningMissingInfoResponses,
} from '../../../../lib/accountOpeningApi';
import {
  submitAccountOpeningMissingInfoAction,
  submitAccountOpeningStatusAction,
} from './actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
    returnTo?: string;
  }>;
};

type MissingInfoField = {
  key: keyof AccountOpeningMissingInfoResponses;
  label: string;
  multiline?: boolean;
};

const MISSING_INFO_FIELDS: MissingInfoField[] = [
  { key: 'website', label: 'Website' },
  { key: 'numberOfEmployees', label: 'Number of employees' },
  { key: 'businessHours', label: 'Business hours' },
  { key: 'estimatedMonthlyPurchases', label: 'Estimated monthly purchases' },
  { key: 'webOrdering', label: 'Web ordering' },
  { key: 'directDebitRequested', label: 'Direct Debit requested' },
  { key: 'cdLicenceApplies', label: 'CD licence applies' },
  { key: 'gphcPremisesNumber', label: 'GPhC premises number' },
  { key: 'cqcRegistration', label: 'CQC registration' },
  { key: 'reviewerNotes', label: 'Reviewer notes', multiline: true },
];

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/review';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/review';
  }

  return trimmed;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderValue(value: string | null | undefined, fallback = 'Not available') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function renderList(values: string[], fallback: string) {
  if (values.length === 0) {
    return <p className="copy">{fallback}</p>;
  }

  return (
    <ul className="simple-list compact-list">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function hiddenInput(name: string, value: string) {
  return <input name={name} type="hidden" value={value} />;
}

function MissingInfoForm({ item, returnTo }: { item: AccountOpeningCaseDetail; returnTo: string }) {
  return (
    <form action={submitAccountOpeningMissingInfoAction} className="action-form">
      {hiddenInput('caseId', item.id)}
      {hiddenInput('returnTo', returnTo)}
      <div className="duplicate-product-details technical-details-grid">
        {MISSING_INFO_FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.multiline ? (
              <textarea
                defaultValue={item.missingInfoResponses[field.key] ?? ''}
                name={field.key}
                placeholder="To be confirmed"
                rows={4}
              />
            ) : (
              <input
                defaultValue={item.missingInfoResponses[field.key] ?? ''}
                name={field.key}
                placeholder="To be confirmed"
              />
            )}
          </label>
        ))}
      </div>
      <button className="button button-primary button-large" type="submit">
        Save missing info
      </button>
    </form>
  );
}

function StatusActionForm({
  action,
  buttonLabel,
  copy,
  item,
  returnTo,
}: {
  action: 'MARKED_NEEDS_INFO' | 'APPROVED_FOR_COMPLETION' | 'REJECTED';
  buttonLabel: string;
  copy: string;
  item: AccountOpeningCaseDetail;
  returnTo: string;
}) {
  return (
    <form action={submitAccountOpeningStatusAction} className="action-form">
      {hiddenInput('caseId', item.id)}
      {hiddenInput('action', action)}
      {hiddenInput('returnTo', returnTo)}
      <p className="copy review-summary-copy">{copy}</p>
      <label>
        Note
        <textarea name="note" placeholder="Add a short review note if useful" rows={3} />
      </label>
      <button
        className={action === 'APPROVED_FOR_COMPLETION' ? 'button button-primary button-large' : 'button button-large'}
        type="submit"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

export default async function AccountOpeningDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const returnTo = sanitizeReturnTo(query?.returnTo);

  try {
    const item = await getAccountOpeningCase(id);
    const signingNotes = item.signingNotes;

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Account Opening</p>
              <h2 className="title">{renderValue(item.subject, 'Account opening form')}</h2>
              <p className="copy">
                Review the account-opening case before completion. This page does not sign, upload, submit, or send any form.
              </p>
            </div>
            <Link className="button" href={returnTo}>
              Back
            </Link>
          </div>

          <p className="alert alert-success">
            {signingNotes.defaultSigningStatement} Leave signature fields blank until approved by a human reviewer.
          </p>
          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Source</h3>
              <p className="copy">{item.extractedTextSummary ?? 'Structured account-opening review case.'}</p>
            </div>
            <span className="pill pill-high">{humanizeStatus(item.status)}</span>
          </div>
          <dl className="duplicate-product-details">
            <div>
              <dt>Sender email</dt>
              <dd>{renderValue(item.senderEmail, 'Unknown sender')}</dd>
            </div>
            <div>
              <dt>Sender domain</dt>
              <dd>{renderValue(item.senderDomain)}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{renderValue(item.subject, 'Account opening form')}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatDateTime(item.receivedAt)}</dd>
            </div>
            <div>
              <dt>Attachments</dt>
              <dd>{item.sourceAttachmentNames.length ? item.sourceAttachmentNames.join(', ') : 'No attachment names stored'}</dd>
            </div>
            <div>
              <dt>Company</dt>
              <dd>{renderValue(item.companyName, 'AMBE LTD')}</dd>
            </div>
            <div>
              <dt>Form type</dt>
              <dd>{renderValue(item.detectedFormType)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Signing notes</h3>
          <dl className="duplicate-product-details">
            <div>
              <dt>Recommended signer</dt>
              <dd>{signingNotes.recommendedSigner}</dd>
            </div>
            <div>
              <dt>Can Aman sign?</dt>
              <dd>Yes. {signingNotes.defaultSigningStatement}</dd>
            </div>
            <div>
              <dt>Signature instruction</dt>
              <dd>{signingNotes.signatureInstruction}</dd>
            </div>
          </dl>
          <p className="copy review-summary-copy">{signingNotes.summary}</p>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Detected names and sections</h3>
          <div className="operator-summary-grid">
            <div className="operator-summary-card">
              <dt>Detected names</dt>
              <dd>{renderList(signingNotes.detectedNames, 'No named signer was detected.')}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Detected roles/sections</dt>
              <dd>{renderList(signingNotes.detectedRolesOrSections, 'No roles or signing sections detected.')}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Reviewer checks</dt>
              <dd>{renderList(signingNotes.reviewerChecks, 'Review before approval.')}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Risk flags</dt>
              <dd>{renderList(signingNotes.riskFlags, 'No high-risk clauses detected.')}</dd>
            </div>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Missing or unclear fields</h3>
          {renderList(signingNotes.missingOrUnclear, 'No missing fields were recorded.')}
          <MissingInfoForm item={item} returnTo={returnTo} />
        </section>

        <section className="panel dashboard-panel" id="decision">
          <h3 className="section-title">Safe review actions</h3>
          <p className="copy review-summary-copy">
            These actions only update the account-opening review case. They do not create a purchase approval,
            buy decision, order, signature, upload, or outbound email.
          </p>
          <div className="action-row action-row-stacked-mobile">
            <StatusActionForm
              action="MARKED_NEEDS_INFO"
              buttonLabel="Mark needs info"
              copy="Use this when the reviewer needs more information before completion."
              item={item}
              returnTo={returnTo}
            />
            <StatusActionForm
              action="APPROVED_FOR_COMPLETION"
              buttonLabel="Approve for completion"
              copy="Approved for completion only — this does not sign or send the form."
              item={item}
              returnTo={returnTo}
            />
            <StatusActionForm
              action="REJECTED"
              buttonLabel="Reject"
              copy="Rejected — no form will be completed, signed, uploaded, or sent."
              item={item}
              returnTo={returnTo}
            />
          </div>
        </section>
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Account Opening</p>
        <h2 className="title">Account-opening case unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load account-opening case.'}
        </p>
        <div className="actions">
          <Link className="button" href={returnTo}>
            Back
          </Link>
        </div>
      </section>
    );
  }
}
