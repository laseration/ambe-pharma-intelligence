import Link from 'next/link';

import {
  getAccountOpeningCase,
  type AccountOpeningCaseDetail,
  type AccountOpeningMissingInfoResponses,
} from '../../../../lib/accountOpeningApi';
import {
  submitAccountOpeningFieldMappingsAction,
  submitGenerateAccountOpeningFillPreviewAction,
  submitGenerateAccountOpeningDraftAction,
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
const FIELD_MAPPING_STATUSES = [
  'UNMAPPED',
  'MAPPED_SAFE',
  'MAPPED_REVIEW_REQUIRED',
  'BLOCKED',
  'IGNORED',
  'NEEDS_OPERATOR_INPUT',
] as const;

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

function renderValue(
  value: string | null | undefined,
  fallback = 'Not available',
) {
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

function renderNullable(
  value: string | number | boolean | null | undefined,
  fallback = 'Not available',
) {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return renderValue(value, fallback);
}

function renderSummaryValue(
  record: Record<string, unknown> | null | undefined,
  key: string,
  fallback = '0',
) {
  const value = record?.[key];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return fallback;
}

function hiddenInput(name: string, value: string) {
  return <input name={name} type="hidden" value={value} />;
}

function downloadHref(caseId: string, fileName: string) {
  return `/dashboard/account-opening/${encodeURIComponent(caseId)}/downloads/${encodeURIComponent(fileName)}`;
}

function MissingInfoForm({
  item,
  returnTo,
}: {
  item: AccountOpeningCaseDetail;
  returnTo: string;
}) {
  return (
    <form
      action={submitAccountOpeningMissingInfoAction}
      className="action-form"
    >
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
        <textarea
          name="note"
          placeholder="Add a short review note if useful"
          rows={3}
        />
      </label>
      <button
        className={
          action === 'APPROVED_FOR_COMPLETION'
            ? 'button button-primary button-large'
            : 'button button-large'
        }
        type="submit"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function FieldMappingForm({
  item,
  returnTo,
}: {
  item: AccountOpeningCaseDetail;
  returnTo: string;
}) {
  const draftFields = item.completionDraft.fields;

  return (
    <form
      action={submitAccountOpeningFieldMappingsAction}
      className="action-form"
    >
      {hiddenInput('caseId', item.id)}
      {hiddenInput('returnTo', returnTo)}
      {hiddenInput('mappingCount', String(item.fieldMappings.mappings.length))}
      <dl className="duplicate-product-details">
        <div>
          <dt>Mapping status</dt>
          <dd>{item.fieldMappings.status}</dd>
        </div>
        <div>
          <dt>Total mappings</dt>
          <dd>{item.fieldMappings.summary.totalMappings}</dd>
        </div>
        <div>
          <dt>Mapped safe</dt>
          <dd>{item.fieldMappings.summary.mappedSafe}</dd>
        </div>
        <div>
          <dt>Needs review</dt>
          <dd>{item.fieldMappings.summary.reviewRequired}</dd>
        </div>
        <div>
          <dt>Blocked</dt>
          <dd>{item.fieldMappings.summary.blocked}</dd>
        </div>
        <div>
          <dt>Safe to fill supplier forms</dt>
          <dd>
            {item.fieldMappings.summary.safeToFillSupplierForms ? 'Yes' : 'No'}
          </dd>
        </div>
      </dl>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Supplier field</th>
              <th>Mapped AMBE field</th>
              <th>Proposed value</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Risk</th>
              <th>Review reason</th>
              <th>Operator note</th>
            </tr>
          </thead>
          <tbody>
            {item.fieldMappings.mappings.map((mapping, index) => {
              const prefix = `mapping-${index}`;

              return (
                <tr key={mapping.id}>
                  <td>
                    {hiddenInput(`${prefix}-id`, mapping.id)}
                    {hiddenInput(
                      `${prefix}-supplierFieldLabel`,
                      mapping.supplierFieldLabel,
                    )}
                    {hiddenInput(
                      `${prefix}-supplierSectionLabel`,
                      mapping.supplierSectionLabel ?? '',
                    )}
                    {hiddenInput(`${prefix}-sourceType`, mapping.sourceType)}
                    {hiddenInput(
                      `${prefix}-sourceEvidenceId`,
                      mapping.sourceEvidenceId ?? '',
                    )}
                    {hiddenInput(
                      `${prefix}-evidenceSnippet`,
                      mapping.evidenceSnippet ?? '',
                    )}
                    {hiddenInput(
                      `${prefix}-suggestedDraftFieldKey`,
                      mapping.suggestedDraftFieldKey ?? '',
                    )}
                    <strong>{mapping.supplierFieldLabel}</strong>
                    <span className="muted-text">
                      {mapping.supplierSectionLabel
                        ? ` ${mapping.supplierSectionLabel}`
                        : ''}
                      {` ${mapping.sourceType.toLowerCase().replace(/_/g, ' ')}`}
                    </span>
                  </td>
                  <td>
                    <select
                      defaultValue={mapping.mappedDraftFieldKey ?? ''}
                      name={`${prefix}-mappedDraftFieldKey`}
                    >
                      <option value="">Unmapped</option>
                      {draftFields.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.supplierLabel}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{renderNullable(mapping.proposedValue, 'Blank')}</td>
                  <td>
                    <select
                      defaultValue={mapping.status}
                      name={`${prefix}-status`}
                    >
                      {FIELD_MAPPING_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {humanizeStatus(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{mapping.confidence}</td>
                  <td>{mapping.riskLevel}</td>
                  <td>
                    {renderValue(
                      mapping.blockedReason ?? mapping.reviewReason,
                      mapping.requiresReview ? 'Review required' : 'No',
                    )}
                  </td>
                  <td>
                    <input
                      defaultValue={mapping.operatorNote ?? ''}
                      name={`${prefix}-operatorNote`}
                      placeholder="Optional review note"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {renderList(
        item.fieldMappings.safetyNotes,
        'No field-mapping safety notes recorded.',
      )}
      <button className="button button-primary button-large" type="submit">
        Save field mappings
      </button>
    </form>
  );
}

export default async function AccountOpeningDetailPage({
  params,
  searchParams,
}: PageProps) {
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
              <h2 className="title">
                {renderValue(item.subject, 'Account opening form')}
              </h2>
              <p className="copy">
                Review the account-opening case before completion. This page
                does not sign the form, send anything to the supplier, submit
                the form, or fill PDF/Word supplier forms.
              </p>
            </div>
            <Link className="button" href={returnTo}>
              Back
            </Link>
          </div>

          <p className="alert alert-success">
            {signingNotes.defaultSigningStatement} Leave signature fields blank
            until approved by a human reviewer.
          </p>
          <p className="alert alert-warning">
            Signature fields remain blank until human approval. This workflow is
            a review desk only; it prepares safe structured data but does not
            complete supplier documents.
          </p>
          {query?.error ? (
            <p className="alert alert-error">{query.error}</p>
          ) : null}
          {query?.message ? (
            <p className="alert alert-success">{query.message}</p>
          ) : null}
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Source</h3>
              <p className="copy">
                {item.extractedTextSummary ??
                  'Structured account-opening review case.'}
              </p>
            </div>
            <span className="pill pill-high">
              {humanizeStatus(item.status)}
            </span>
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
              <dd>
                {item.sourceAttachmentNames.length
                  ? item.sourceAttachmentNames.join(', ')
                  : 'No attachment names stored'}
              </dd>
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
          <h3 className="section-title">Microsoft Drive archive</h3>
          <p className="copy review-summary-copy">
            Review archive only. This does not upload signed forms, raw
            extracted text, completed forms, or supplier messages.
          </p>
          <dl className="duplicate-product-details">
            <div>
              <dt>Status</dt>
              <dd>{renderValue(item.storageStatus, 'Not attempted')}</dd>
            </div>
            <div>
              <dt>Note</dt>
              <dd>{renderValue(item.storageNote)}</dd>
            </div>
            <div>
              <dt>Skipped reason</dt>
              <dd>{renderValue(item.storageSkippedReason)}</dd>
            </div>
            <div>
              <dt>Last attempt</dt>
              <dd>{formatDateTime(item.storageLastAttemptAt)}</dd>
            </div>
            <div>
              <dt>Folder URL</dt>
              <dd>
                {item.storageFolderUrl ? (
                  <a href={item.storageFolderUrl}>{item.storageFolderUrl}</a>
                ) : (
                  'No archive folder URL stored'
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Safe review exports</h3>
          <p className="copy review-summary-copy">
            Internal review downloads only. These files include safe draft,
            field mapping, unresolved and blocked fields, signing notes, risk
            summary, and source evidence metadata. They do not include raw
            extracted text, raw bank details, signed forms, completed supplier
            forms, supplier-facing messages, or purchase/order/buy workflow
            actions. Downloads require an operator download token before the web
            proxy can use server-side internal API credentials.
          </p>
          <div className="actions">
            <a
              className="button"
              href={downloadHref(item.id, 'review-pack.md')}
            >
              Download review markdown
            </a>
            <a
              className="button"
              href={downloadHref(item.id, 'review-pack.json')}
            >
              Download review JSON
            </a>
            <a
              className="button"
              href={downloadHref(item.id, 'source-evidence.json')}
            >
              Download evidence JSON
            </a>
            <a
              className="button"
              href={downloadHref(item.id, 'field-mapping-summary.json')}
            >
              Download field mapping
            </a>
            <a
              className="button"
              href={downloadHref(item.id, 'blocked-fields.json')}
            >
              Download blocked fields
            </a>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Completion draft</h3>
              <p className="copy review-summary-copy">
                Structured draft only. It uses the approved AMBE master profile
                plus reviewer responses and keeps signing, sending, supplier
                submission, PDF/Word form filling, Direct Debit, bank authority,
                guarantee, indemnity, director-only, and RP/GDP/WDA sections
                review-blocked.
              </p>
            </div>
            <form action={submitGenerateAccountOpeningDraftAction}>
              {hiddenInput('caseId', item.id)}
              {hiddenInput('returnTo', returnTo)}
              <button className="button" type="submit">
                {item.completionDraft.isStored
                  ? 'Regenerate completion draft'
                  : 'Generate completion draft'}
              </button>
            </form>
          </div>
          <dl className="duplicate-product-details">
            <div>
              <dt>Draft status</dt>
              <dd>{humanizeStatus(item.completionDraft.status)}</dd>
            </div>
            <div>
              <dt>Stored draft</dt>
              <dd>{item.completionDraft.isStored ? 'Yes' : 'Preview only'}</dd>
            </div>
            <div>
              <dt>Overall confidence</dt>
              <dd>{item.completionDraft.overallConfidence}</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>
                {formatDateTime(
                  item.draftGeneratedAt ?? item.completionDraft.generatedAt,
                )}
              </dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>{item.completionDraft.profileVersion}</dd>
            </div>
            <div>
              <dt>Total fields</dt>
              <dd>{item.completionDraft.summary.totalFields}</dd>
            </div>
            <div>
              <dt>High confidence</dt>
              <dd>{item.completionDraft.summary.highConfidenceFields}</dd>
            </div>
            <div>
              <dt>Needs review</dt>
              <dd>{item.completionDraft.summary.reviewRequiredFields}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{item.completionDraft.summary.blockedFields}</dd>
            </div>
            <div>
              <dt>Safe to auto-fill</dt>
              <dd>
                {item.completionDraft.summary.safeToAutoFill ? 'Yes' : 'No'}
              </dd>
            </div>
          </dl>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Proposed value</th>
                  <th>Source</th>
                  <th>Confidence</th>
                  <th>Risk</th>
                  <th>Review</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {item.completionDraft.fields.map((field) => (
                  <tr key={field.key}>
                    <td>{field.supplierLabel}</td>
                    <td>{renderNullable(field.proposedValue, 'Blank')}</td>
                    <td>
                      {field.valueSource.toLowerCase().replace(/_/g, ' ')}
                    </td>
                    <td>{field.confidence}</td>
                    <td>{field.riskLevel}</td>
                    <td>
                      {field.requiresReview
                        ? (field.reviewReason ?? 'Review required')
                        : 'No'}
                    </td>
                    <td>
                      {field.evidence
                        .map((evidence) => evidence.snippet)
                        .filter((snippet): snippet is string =>
                          Boolean(snippet),
                        )
                        .slice(0, 2)
                        .join(' | ') || 'No snippet'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderList(
            item.completionDraft.safetyNotes,
            'No safety notes recorded.',
          )}
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Supplier field mappings</h3>
          <p className="copy review-summary-copy">
            Internal mapping controls only. These mappings help reviewers decide
            how supplier form labels line up with AMBE draft fields before any
            future document completion work. This does not fill PDF/Word
            supplier forms, sign, send, submit, or create purchase/order/buy
            workflow records.
          </p>
          <FieldMappingForm item={item} returnTo={returnTo} />
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Completed-form fill preview</h3>
              <p className="copy review-summary-copy">
                Internal preview only. This uses the original supplier/client
                form reference and saved reviewed mappings to prepare safe field
                values for operator review. It does not sign, send, submit, file
                to SharePoint, fill PDF/Word supplier forms, or trigger
                purchase/order/buy workflows. Blocked and review-required fields
                remain blank.
              </p>
            </div>
            <form action={submitGenerateAccountOpeningFillPreviewAction}>
              {hiddenInput('caseId', item.id)}
              {hiddenInput('returnTo', returnTo)}
              <button className="button" type="submit">
                Generate fill preview
              </button>
            </form>
          </div>

          <dl className="duplicate-product-details">
            <div>
              <dt>Original form references</dt>
              <dd>{item.originalForms.length}</dd>
            </div>
            <div>
              <dt>Latest preview</dt>
              <dd>
                {item.latestFillPreview
                  ? formatDateTime(item.latestFillPreview.generatedAt)
                  : 'Not generated'}
              </dd>
            </div>
            <div>
              <dt>Filled fields</dt>
              <dd>
                {renderSummaryValue(
                  item.latestFillPreview?.summary,
                  'filledFieldCount',
                )}
              </dd>
            </div>
            <div>
              <dt>Blank fields</dt>
              <dd>
                {renderSummaryValue(
                  item.latestFillPreview?.summary,
                  'blankFieldCount',
                )}
              </dd>
            </div>
          </dl>

          {item.originalForms.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Original form</th>
                    <th>Type</th>
                    <th>Fill support</th>
                    <th>Storage ref</th>
                  </tr>
                </thead>
                <tbody>
                  {item.originalForms.map((form) => (
                    <tr key={form.id}>
                      <td>{form.fileName}</td>
                      <td>{form.formType}</td>
                      <td>{form.fillSupportStatus}</td>
                      <td>
                        {renderValue(
                          form.storageFileUrl ?? form.storageFolderUrl,
                          form.localBlobAvailable
                            ? 'Local blob available'
                            : 'Metadata only',
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="copy review-summary-copy">
              No original supplier/client form reference has been captured yet.
            </p>
          )}

          {item.latestFillPreview ? (
            <div className="actions">
              <a
                className="button"
                href={downloadHref(item.id, 'fill-preview.md')}
              >
                Download preview markdown
              </a>
              <a
                className="button"
                href={downloadHref(item.id, 'fill-preview.json')}
              >
                Download preview JSON
              </a>
              <a
                className="button"
                href={downloadHref(item.id, 'fill-values.json')}
              >
                Download fill values
              </a>
              <a
                className="button"
                href={downloadHref(item.id, 'blank-fields.json')}
              >
                Download blank fields
              </a>
              <a
                className="button"
                href={downloadHref(item.id, 'original-form-reference.json')}
              >
                Download form reference
              </a>
            </div>
          ) : null}

          <p className="alert alert-warning">
            This is not a signed or submitted supplier form. Signature, Direct
            Debit, bank authority, bank details, guarantee, indemnity,
            director-only, and unresolved regulatory fields remain blank. This
            does not fill PDF/Word supplier forms.
          </p>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Source evidence</h3>
          <p className="copy review-summary-copy">
            Metadata and safe snippets only. Raw extracted text, original file
            bytes, bank account numbers, and sort codes are not shown here.
          </p>
          {item.sourceEvidence.length === 0 ? (
            <p className="copy">
              No source evidence records have been stored yet.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>File</th>
                    <th>Extraction</th>
                    <th>Text hash</th>
                    <th>Snippet</th>
                    <th>Storage ref</th>
                  </tr>
                </thead>
                <tbody>
                  {item.sourceEvidence.map((evidence, index) => (
                    <tr key={evidence.id ?? `${evidence.sourceType}-${index}`}>
                      <td>
                        {renderValue(
                          evidence.sourceLabel ?? evidence.sourceType,
                        )}
                      </td>
                      <td>{renderValue(evidence.fileName, 'Email body')}</td>
                      <td>
                        {renderValue(
                          evidence.extractionMethod,
                          evidence.extractedTextChars
                            ? `${evidence.extractedTextChars} chars`
                            : 'Metadata only',
                        )}
                      </td>
                      <td>
                        {evidence.extractedTextHash
                          ? evidence.extractedTextHash.slice(0, 12)
                          : 'No text hash'}
                      </td>
                      <td>{renderValue(evidence.safeSnippet)}</td>
                      <td>
                        {renderValue(
                          evidence.storageFileUrl ?? evidence.storageFolderUrl,
                          'Not filed yet',
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Detected names and sections</h3>
          <div className="operator-summary-grid">
            <div className="operator-summary-card">
              <dt>Detected names</dt>
              <dd>
                {renderList(
                  signingNotes.detectedNames,
                  'No named signer was detected.',
                )}
              </dd>
            </div>
            <div className="operator-summary-card">
              <dt>Detected roles/sections</dt>
              <dd>
                {renderList(
                  signingNotes.detectedRolesOrSections,
                  'No roles or signing sections detected.',
                )}
              </dd>
            </div>
            <div className="operator-summary-card">
              <dt>Reviewer checks</dt>
              <dd>
                {renderList(
                  signingNotes.reviewerChecks,
                  'Review before approval.',
                )}
              </dd>
            </div>
            <div className="operator-summary-card">
              <dt>Risk flags</dt>
              <dd>
                {renderList(
                  signingNotes.riskFlags,
                  'No high-risk clauses detected.',
                )}
              </dd>
            </div>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Missing or unclear fields</h3>
          {renderList(
            signingNotes.missingOrUnclear,
            'No missing fields were recorded.',
          )}
          <MissingInfoForm item={item} returnTo={returnTo} />
        </section>

        <section className="panel dashboard-panel" id="decision">
          <h3 className="section-title">Safe review actions</h3>
          <p className="copy review-summary-copy">
            These actions only update the account-opening review case. They do
            not create a purchase approval, buy decision, order, signature,
            upload, or outbound email.
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
          {error instanceof Error
            ? error.message
            : 'Failed to load account-opening case.'}
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
