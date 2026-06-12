import Link from 'next/link';

import {
  getAccountOpeningCase,
  getAccountOpeningReadiness,
  type AccountOpeningCaseDetail,
  type AccountOpeningMissingInfoResponses,
  type AccountOpeningReadinessReport,
  type AccountOpeningReadinessStatus,
} from '../../../../lib/accountOpeningApi';
import {
  submitApproveAccountOpeningCompletedFormFilingAction,
  submitFileAccountOpeningCompletedFormToSharePointAction,
  submitAccountOpeningFieldMappingsAction,
  submitGenerateAccountOpeningBinaryFillPreviewAction,
  submitGenerateAccountOpeningFillPreviewAction,
  submitGenerateAccountOpeningDraftAction,
  submitReprocessAccountOpeningStoredSourceAction,
  submitAccountOpeningMissingInfoAction,
  submitAccountOpeningStatusAction,
} from './actions';
import { AccountOpeningSafetyReviewSections } from './SafetyReviewSections';
import { requireCurrentWebCapability } from '../../../../lib/serverWebAuth';

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

function readinessPillClass(status: AccountOpeningReadinessStatus) {
  if (status === 'GREEN') {
    return 'pill pill-low';
  }

  if (status === 'AMBER') {
    return 'pill pill-medium';
  }

  return 'pill pill-high';
}

function readinessLabel(status: AccountOpeningReadinessStatus) {
  if (status === 'GREEN') {
    return 'Green';
  }

  if (status === 'AMBER') {
    return 'Amber';
  }

  return 'Red';
}

function boolLabel(value: boolean) {
  return value ? 'Yes' : 'No';
}

function FormReadinessSection({
  readiness,
}: {
  readiness: AccountOpeningReadinessReport;
}) {
  const lifecycle = readiness.documentLifecycle;

  return (
    <section className="panel dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <h3 className="section-title">Document lifecycle</h3>
          <p className="copy review-summary-copy">
            Metadata-only view of whether the original form can be binary-filled
            and internally filed. This does not expose raw extracted text,
            binary bytes, bank details, Direct Debit mandate values, signatures,
            guarantees, or director home address.
          </p>
        </div>
        <span className={readinessPillClass(readiness.status)}>
          {readinessLabel(readiness.status)}
        </span>
      </div>

      <dl className="duplicate-product-details">
        <div>
          <dt>Original forms</dt>
          <dd>{lifecycle.originalFormCount}</dd>
        </div>
        <div>
          <dt>Can attempt binary preview</dt>
          <dd>{boolLabel(lifecycle.canAttemptBinaryPreview)}</dd>
        </div>
        <div>
          <dt>Binary preview downloadable</dt>
          <dd>{boolLabel(lifecycle.canDownloadBinaryPreview)}</dd>
        </div>
        <div>
          <dt>Can approve filing</dt>
          <dd>{boolLabel(lifecycle.canApproveCompletedUnsignedFiling)}</dd>
        </div>
        <div>
          <dt>Can file completed unsigned form</dt>
          <dd>{boolLabel(lifecycle.canFileCompletedUnsignedForm)}</dd>
        </div>
        <div>
          <dt>Completed unsigned filing</dt>
          <dd>{renderNullable(lifecycle.completedUnsignedFilingStatus)}</dd>
        </div>
        <div>
          <dt>Primary blocker</dt>
          <dd>{renderValue(lifecycle.primaryBlocker, 'None')}</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{lifecycle.nextAction}</dd>
        </div>
      </dl>

      {lifecycle.forms.length ? (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Form</th>
                <th>Capture</th>
                <th>Bytes</th>
                <th>Type</th>
                <th>Binary support</th>
                <th>Preview</th>
                <th>Filing</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {lifecycle.forms.map((form) => (
                <tr key={form.originalFormId}>
                  <td>{form.fileName}</td>
                  <td>
                    {form.sourceEvidenceCaptured
                      ? form.textExtractionStatus === 'TEXT_EXTRACTED'
                        ? `Captured, ${form.extractedTextChars ?? 0} text chars`
                        : 'Captured, metadata only'
                      : 'Source evidence missing'}
                  </td>
                  <td>
                    {form.originalBytesRetrievable
                      ? humanizeStatus(form.originalBytesRetrievalStatus)
                      : 'Not retrievable'}
                  </td>
                  <td>{humanizeStatus(form.formType)}</td>
                  <td>
                    {form.fillablePdfLikely
                      ? `Supported PDF${form.acroFieldCountKnown ? `, ${form.acroFieldCount ?? 0} fields` : ''}`
                      : humanizeStatus(form.binaryFillSupportStatus)}
                  </td>
                  <td>
                    {form.binaryPreviewDownloadable
                      ? 'Generated and downloadable'
                      : renderNullable(
                          form.binaryPreviewStatus,
                          'Not generated',
                        )}
                  </td>
                  <td>{renderNullable(form.completedUnsignedFilingStatus)}</td>
                  <td>{form.primaryBlocker ?? form.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="alert alert-warning">
          No original supplier form reference has been captured yet.
        </p>
      )}
    </section>
  );
}

function ReadinessSection({
  readiness,
}: {
  readiness: AccountOpeningReadinessReport;
}) {
  return (
    <section className="panel dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <h3 className="section-title">Account-opening readiness</h3>
          <p className="copy review-summary-copy">
            Diagnostic checklist for end-to-end form filling and internal
            SharePoint/Microsoft Drive filing. This does not sign, send, submit,
            complete Direct Debit or guarantee sections, or create
            purchase/order/buy side effects.
          </p>
        </div>
        <span className={readinessPillClass(readiness.status)}>
          {readinessLabel(readiness.status)}
        </span>
      </div>

      <dl className="duplicate-product-details">
        <div>
          <dt>Diagnostic ID</dt>
          <dd>{renderValue(readiness.diagnosticCorrelationId)}</dd>
        </div>
        <div>
          <dt>Overall status</dt>
          <dd>
            {readiness.readyForEndToEndFillingAndFiling
              ? 'Ready and filed'
              : 'Not ready'}
          </dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{readiness.nextAction}</dd>
        </div>
        <div>
          <dt>PDF AcroForm fields</dt>
          <dd>{renderNullable(readiness.counts.pdfAcroFormFieldCount)}</dd>
        </div>
        <div>
          <dt>Safe mapped fields</dt>
          <dd>{readiness.counts.safeMappedFields}</dd>
        </div>
        <div>
          <dt>Blocked fields</dt>
          <dd>{readiness.counts.blockedFields}</dd>
        </div>
      </dl>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Status</th>
              <th>Value</th>
              <th>Blocker</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {readiness.checks.map((check) => (
              <tr key={check.key}>
                <td>{check.label}</td>
                <td>
                  <span className={readinessPillClass(check.status)}>
                    {readinessLabel(check.status)}
                  </span>
                </td>
                <td>{check.value}</td>
                <td>{check.blocker ?? 'None'}</td>
                <td>{check.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {readiness.blockerTexts.length ? (
        <div>
          <h4 className="section-subtitle">Blockers</h4>
          {renderList(readiness.blockerTexts, 'No blockers recorded.')}
        </div>
      ) : (
        <p className="alert alert-success">
          No readiness blockers are currently recorded.
        </p>
      )}

      <p className="alert alert-warning">
        Readiness output excludes binary bytes, raw extracted text, bank
        details, sort codes, signatures, and payment mandate content.
      </p>
    </section>
  );
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

function WorkflowLifecycleSection({
  item,
}: {
  item: AccountOpeningCaseDetail;
}) {
  return (
    <section className="panel dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <h3 className="section-title">Workflow lifecycle</h3>
          <p className="copy review-summary-copy">
            Backwards-compatible v1 lifecycle view derived from the current case
            status, draft, preview, and internal filing evidence.
          </p>
        </div>
        <span className="pill pill-medium">{item.lifecycle.currentLabel}</span>
      </div>

      <dl className="duplicate-product-details">
        <div>
          <dt>Legacy status</dt>
          <dd>{humanizeStatus(item.lifecycle.legacyStatus)}</dd>
        </div>
        <div>
          <dt>Current stage</dt>
          <dd>{humanizeStatus(item.lifecycle.currentStage)}</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{item.lifecycle.nextAction}</dd>
        </div>
      </dl>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {item.lifecycle.steps.map((step) => (
              <tr key={step.stage}>
                <td>{step.label}</td>
                <td>{humanizeStatus(step.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {renderList(
        item.lifecycle.compatibilityNotes,
        'No lifecycle compatibility notes recorded.',
      )}
      <p className="alert alert-warning">
        SENT_MANUALLY is manual-only. This workflow does not sign, submit, or
        send forms automatically.
      </p>
    </section>
  );
}

function DocumentClassificationSection({
  item,
}: {
  item: AccountOpeningCaseDetail;
}) {
  return (
    <section className="panel dashboard-panel">
      <h3 className="section-title">Document classifications</h3>
      <p className="copy review-summary-copy">
        Deterministic attachment classification from safe filenames, headings,
        and snippets. Low-confidence and risky documents stay in review.
      </p>
      {item.documentClassifications.length ? (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Class</th>
                <th>Confidence</th>
                <th>Evidence</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {item.documentClassifications.map((classification, index) => (
                <tr
                  key={
                    classification.sourceEvidenceId ??
                    `${classification.fileName}-${index}`
                  }
                >
                  <td>{renderValue(classification.fileName, 'Attachment')}</td>
                  <td>{humanizeStatus(classification.classification)}</td>
                  <td>
                    {classification.confidence} ({classification.score})
                  </td>
                  <td>
                    {classification.matchedEvidence.length
                      ? classification.matchedEvidence.join(', ')
                      : 'No deterministic evidence'}
                  </td>
                  <td>
                    {classification.warnings.length
                      ? classification.warnings.join(' ')
                      : 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="copy review-summary-copy">
          No attachment classifications are available yet.
        </p>
      )}
    </section>
  );
}

function CompanyProfileSection({ item }: { item: AccountOpeningCaseDetail }) {
  return (
    <section className="panel dashboard-panel">
      <h3 className="section-title">Company profile source</h3>
      <p className="copy review-summary-copy">
        Configured account-opening profile values used by the draft. Missing
        values remain To be confirmed; bank, director, and blocked fields are
        not included.
      </p>
      <dl className="duplicate-product-details">
        <div>
          <dt>Profile</dt>
          <dd>{item.companyProfile.profileId}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{item.companyProfile.profileVersion}</dd>
        </div>
        <div>
          <dt>Configured safe fields</dt>
          <dd>{item.companyProfile.safeConfiguredFieldCount}</dd>
        </div>
        <div>
          <dt>Missing profile fields</dt>
          <dd>{item.companyProfile.missingProfileFields.length}</dd>
        </div>
        <div>
          <dt>Review-required fields</dt>
          <dd>{item.companyProfile.reviewRequiredFields.length}</dd>
        </div>
        <div>
          <dt>Blocked fields</dt>
          <dd>{item.companyProfile.blockedFields.length}</dd>
        </div>
      </dl>

      {item.companyProfile.missingProfileFields.length ? (
        <div>
          <h4 className="section-subtitle">Missing profile data</h4>
          {renderList(
            item.companyProfile.missingProfileFields,
            'No missing profile fields.',
          )}
        </div>
      ) : null}
      {item.companyProfile.warnings.length ? (
        <div>
          <h4 className="section-subtitle">Profile warnings</h4>
          {renderList(item.companyProfile.warnings, 'No profile warnings.')}
        </div>
      ) : null}
    </section>
  );
}

export default async function AccountOpeningDetailPage({
  params,
  searchParams,
}: PageProps) {
  await requireCurrentWebCapability('account-opening:view');

  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const returnTo = sanitizeReturnTo(query?.returnTo);

  try {
    const [item, readiness] = await Promise.all([
      getAccountOpeningCase(id),
      getAccountOpeningReadiness(id),
    ]);
    const signingNotes = item.signingNotes;
    const latestBinaryPreview = item.latestBinaryFillPreview;
    const latestCompletedFormFiling = item.latestCompletedFormFiling;
    const filingMatchesLatestBinaryPreview =
      Boolean(latestBinaryPreview && latestCompletedFormFiling) &&
      latestCompletedFormFiling?.binaryFillPreviewId ===
        latestBinaryPreview?.id;
    const canApproveCompletedUnsignedForm = Boolean(
      latestBinaryPreview?.status === 'GENERATED_FOR_REVIEW' &&
      latestBinaryPreview.binaryPreviewBytesAvailable,
    );
    const canFileCompletedUnsignedForm =
      filingMatchesLatestBinaryPreview &&
      latestCompletedFormFiling?.status === 'APPROVED_FOR_FILING';

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

        <ReadinessSection readiness={readiness} />

        <FormReadinessSection readiness={readiness} />
        <WorkflowLifecycleSection item={item} />
        <DocumentClassificationSection item={item} />
        <CompanyProfileSection item={item} />

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Stored source</h3>
              <p className="copy">
                {item.extractedTextSummary ??
                  'Structured account-opening review case.'}
              </p>
            </div>
            <div className="actions">
              <span className="pill pill-high">
                {humanizeStatus(item.status)}
              </span>
              <form action={submitReprocessAccountOpeningStoredSourceAction}>
                {hiddenInput('caseId', item.id)}
                {hiddenInput('returnTo', returnTo)}
                <button className="button" type="submit">
                  Reprocess from stored source
                </button>
              </form>
            </div>
          </div>
          <dl className="duplicate-product-details">
            <div>
              <dt>Diagnostic ID</dt>
              <dd>{renderValue(item.diagnosticCorrelationId)}</dd>
            </div>
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
              <dd>{item.sourceProvenance.attachmentCount}</dd>
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
          {item.sourceProvenance.attachments.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Attachment</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Checksum</th>
                    <th>Classification</th>
                    <th>Replay pointer</th>
                  </tr>
                </thead>
                <tbody>
                  {item.sourceProvenance.attachments.map(
                    (attachment, index) => (
                      <tr
                        key={
                          attachment.sourceEvidenceId ??
                          attachment.fileName ??
                          `attachment-${index}`
                        }
                      >
                        <td>{renderValue(attachment.fileName)}</td>
                        <td>{renderValue(attachment.mimeType)}</td>
                        <td>{renderNullable(attachment.sizeBytes)}</td>
                        <td>
                          {attachment.checksumSha256
                            ? attachment.checksumSha256.slice(0, 12)
                            : 'Not available'}
                        </td>
                        <td>
                          {attachment.classification
                            ? humanizeStatus(attachment.classification)
                            : 'Not classified'}
                        </td>
                        <td>
                          {attachment.replayPointer.canReplayFromStoredSource
                            ? attachment.replayPointer.label
                            : 'Missing reference'}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="copy">No attachment inventory has been stored yet.</p>
          )}
          <p className="alert alert-warning">
            Stored-source replay uses safe evidence metadata and snippets only;
            it does not include raw email bodies, raw extracted text, attachment
            bytes, supplier submission, signing, sending, or approval changes.
          </p>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Processing run history</h3>
          {item.processingRuns.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Warnings</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {item.processingRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{humanizeStatus(run.triggerType)}</td>
                      <td>{humanizeStatus(run.status)}</td>
                      <td>{formatDateTime(run.startedAt)}</td>
                      <td>{formatDateTime(run.finishedAt)}</td>
                      <td>{renderValue(run.warningSummary, 'None')}</td>
                      <td>{renderValue(run.errorSummary, 'None')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="copy">No processing runs have been recorded yet.</p>
          )}
        </section>

        <AccountOpeningSafetyReviewSections item={item} />

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
              <h3 className="section-title">Internal fill-value preview</h3>
              <p className="copy review-summary-copy">
                Internal fill-value preview only. This uses the original
                supplier/client form reference and saved reviewed mappings to
                prepare safe values for operator review. It does not fill
                PDF/Word supplier forms, generate a completed supplier PDF/Word
                form, sign, send, submit, file completed forms to SharePoint, or
                trigger purchase/order/buy workflows. Blocked and
                review-required fields remain blank.
              </p>
            </div>
            <form action={submitGenerateAccountOpeningFillPreviewAction}>
              {hiddenInput('caseId', item.id)}
              {hiddenInput('returnTo', returnTo)}
              <button className="button" type="submit">
                Generate fill-value preview
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
              <dt>Preview value fields</dt>
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
            does not fill PDF/Word supplier forms or generate a completed
            supplier PDF/Word form.
          </p>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Binary PDF/DOCX preview</h3>
              <p className="copy review-summary-copy">
                Internal binary preview only. Fillable PDF AcroForms can be
                filled with saved reviewed low-risk mappings when original bytes
                are available. DOCX, flat/scanned PDFs, unknown forms, and
                missing-byte references remain unsupported or manual. This does
                not sign, send, submit, file completed forms to SharePoint, or
                trigger purchase/order/buy workflows.
              </p>
            </div>
            <form action={submitGenerateAccountOpeningBinaryFillPreviewAction}>
              {hiddenInput('caseId', item.id)}
              {hiddenInput('returnTo', returnTo)}
              <button className="button" type="submit">
                Generate binary preview
              </button>
            </form>
          </div>

          <dl className="duplicate-product-details">
            <div>
              <dt>Status</dt>
              <dd>{renderNullable(item.latestBinaryFillPreview?.status)}</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>
                {item.latestBinaryFillPreview
                  ? formatDateTime(item.latestBinaryFillPreview.generatedAt)
                  : 'Not generated'}
              </dd>
            </div>
            <div>
              <dt>Preview value fields</dt>
              <dd>{item.latestBinaryFillPreview?.filledFieldCount ?? 0}</dd>
            </div>
            <div>
              <dt>Blank fields</dt>
              <dd>{item.latestBinaryFillPreview?.blankFieldCount ?? 0}</dd>
            </div>
            <div>
              <dt>Output hash</dt>
              <dd>
                {renderNullable(
                  item.latestBinaryFillPreview?.binaryPreviewHash,
                )}
              </dd>
            </div>
          </dl>

          {item.latestBinaryFillPreview?.unsupportedReason ? (
            <p className="alert alert-warning">
              {item.latestBinaryFillPreview.unsupportedReason}
            </p>
          ) : null}

          {item.latestBinaryFillPreview?.warnings.length ? (
            <div>
              <h4 className="section-subtitle">Preview warnings</h4>
              {renderList(
                item.latestBinaryFillPreview.warnings,
                'No binary preview warnings recorded.',
              )}
            </div>
          ) : null}

          {item.latestBinaryFillPreview?.status === 'GENERATED_FOR_REVIEW' &&
          item.latestBinaryFillPreview.binaryPreviewFileName ? (
            <div className="actions">
              <a
                className="button"
                href={downloadHref(
                  item.id,
                  item.latestBinaryFillPreview.binaryPreviewFileName,
                )}
              >
                Download binary preview
              </a>
            </div>
          ) : null}

          <p className="alert alert-warning">
            Blocked and review-required fields stay blank. Signature, Direct
            Debit, bank authority, bank details, guarantee, indemnity,
            director-only, RP/GDP/WDA, GPhC/CQC, credit terms, and returns-risk
            fields are not filled. The preview is not flattened or signed.
          </p>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Completed unsigned form filing</h3>
              <p className="copy review-summary-copy">
                Completed unsigned form filing is internal SharePoint filing
                only. It files the approved binary PDF AcroForm preview after
                operator approval. It is not signed, not sent, and not
                submitted. Blocked and review-required fields remain blank.
              </p>
            </div>
          </div>

          <dl className="duplicate-product-details">
            <div>
              <dt>Approval status</dt>
              <dd>
                {filingMatchesLatestBinaryPreview &&
                latestCompletedFormFiling?.approvedAt
                  ? 'Approved for filing'
                  : 'Not approved'}
              </dd>
            </div>
            <div>
              <dt>Filing status</dt>
              <dd>
                {filingMatchesLatestBinaryPreview && latestCompletedFormFiling
                  ? humanizeStatus(latestCompletedFormFiling.status)
                  : 'Not approved'}
              </dd>
            </div>
            <div>
              <dt>Approved at</dt>
              <dd>
                {filingMatchesLatestBinaryPreview
                  ? formatDateTime(latestCompletedFormFiling?.approvedAt)
                  : 'Not available'}
              </dd>
            </div>
            <div>
              <dt>Filed at</dt>
              <dd>
                {filingMatchesLatestBinaryPreview
                  ? formatDateTime(latestCompletedFormFiling?.filedAt)
                  : 'Not available'}
              </dd>
            </div>
            <div>
              <dt>Filed file</dt>
              <dd>
                {filingMatchesLatestBinaryPreview
                  ? renderNullable(latestCompletedFormFiling?.fileName)
                  : 'Not available'}
              </dd>
            </div>
            <div>
              <dt>Skipped reason</dt>
              <dd>
                {filingMatchesLatestBinaryPreview
                  ? renderNullable(latestCompletedFormFiling?.skippedReason)
                  : 'Not available'}
              </dd>
            </div>
            <div>
              <dt>SharePoint/Drive link</dt>
              <dd>
                {filingMatchesLatestBinaryPreview &&
                latestCompletedFormFiling?.storageFileUrl ? (
                  <a href={latestCompletedFormFiling.storageFileUrl}>
                    {latestCompletedFormFiling.storageFileUrl}
                  </a>
                ) : filingMatchesLatestBinaryPreview &&
                  latestCompletedFormFiling?.storageFolderUrl ? (
                  <a href={latestCompletedFormFiling.storageFolderUrl}>
                    {latestCompletedFormFiling.storageFolderUrl}
                  </a>
                ) : (
                  'No filed SharePoint/Drive link stored'
                )}
              </dd>
            </div>
          </dl>

          <div className="actions">
            <form
              action={submitApproveAccountOpeningCompletedFormFilingAction}
              className="action-form"
            >
              {hiddenInput('caseId', item.id)}
              {hiddenInput('returnTo', returnTo)}
              {latestBinaryPreview
                ? hiddenInput('binaryFillPreviewId', latestBinaryPreview.id)
                : null}
              <label>
                Approval note
                <textarea
                  name="approvalNote"
                  placeholder="Operator verified the completed unsigned form values for internal SharePoint filing only."
                  rows={3}
                />
              </label>
              <button
                className="button"
                disabled={!canApproveCompletedUnsignedForm}
                type="submit"
              >
                Approve completed unsigned form for filing
              </button>
            </form>

            <form
              action={submitFileAccountOpeningCompletedFormToSharePointAction}
              className="action-form"
            >
              {hiddenInput('caseId', item.id)}
              {hiddenInput('returnTo', returnTo)}
              {latestBinaryPreview
                ? hiddenInput('binaryFillPreviewId', latestBinaryPreview.id)
                : null}
              <label>
                Filing note
                <textarea
                  name="filingNote"
                  placeholder="File the approved completed unsigned form to SharePoint only."
                  rows={3}
                />
              </label>
              <button
                className="button"
                disabled={!canFileCompletedUnsignedForm}
                type="submit"
              >
                File approved completed unsigned form to SharePoint
              </button>
            </form>
          </div>

          <p className="alert alert-warning">
            Internal SharePoint filing only. This does not sign, send, submit,
            approve supplier terms, complete Direct Debit mandates, complete
            payment authority, guarantee, indemnity, director-only, RP/GDP/WDA,
            GPhC/CQC, credit, or returns-risk sections, or create
            purchase/order/buy workflow side effects.
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
