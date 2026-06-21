import assert from 'node:assert/strict';
import test from 'node:test';

import { PDFDocument } from 'pdf-lib';

import {
  buildAccountOpeningCase,
  buildAccountOpeningCasePersistenceData,
  buildAccountOpeningCaseDetail,
  buildAccountOpeningSigningNotes,
  buildAccountOpeningSigningSummary,
  buildAccountOpeningSourceFingerprint,
  approveAccountOpeningCompletedFormFiling,
  downloadAccountOpeningBinaryFillPreviewFile,
  detectAccountOpeningEmail,
  downloadAccountOpeningFillPreviewFile,
  downloadAccountOpeningReviewedExportFile,
  exportAccountOpeningReviewedPack,
  generateAccountOpeningBinaryFillPreview,
  generateAccountOpeningFillPreview,
  generateAccountOpeningDraft,
  getAccountOpeningReadinessReport,
  fileAccountOpeningCompletedFormToSharePoint,
  reprocessAccountOpeningCaseFromStoredSource,
  saveAccountOpeningFieldMappings,
  sanitizeAccountOpeningMissingInfoResponses,
  saveAccountOpeningMissingInfo,
  accountOpeningCaseMatchesSearch,
  buildAccountOpeningCaseListQueryArgs,
  buildManualAccountOpeningSourceFingerprint,
  createManualAccountOpeningCase,
  toAccountOpeningCaseListItem,
  updateAccountOpeningCaseStatus,
  writeDraftAuditEvents,
  type AccountOpeningCaseDetail,
  type AccountOpeningCasePersistenceInput,
  type AccountOpeningCaseRepository,
  type AccountOpeningCaseEventInput,
  type PersistedAccountOpeningBinaryFillPreview,
  type PersistedAccountOpeningCompletedFormFiling,
  type PersistedAccountOpeningFillPreview,
  type PersistedAccountOpeningOriginalForm,
  type PersistedAccountOpeningProcessingRun,
  type PersistedAccountOpeningReviewCase,
  type PersistedAccountOpeningSourceEvidence,
} from '../service';
import type { AccountOpeningCompletionDraft } from '../draft';
import type { AccountOpeningDriveArchiveConfig } from '../driveArchive';
import type { PersistedAccountOpeningFieldMapping } from '../fieldMapping';
import {
  MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES,
  MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES,
} from '../binaryFillPreview';
import { evaluateAccountOpeningAutofillPolicy } from '../policy';

function accountOpeningPolicyFields(input: {
  key: string;
  supplierLabel: string;
}) {
  const policy = evaluateAccountOpeningAutofillPolicy({
    fieldKey: input.key,
    fieldLabel: input.supplierLabel,
  });

  return {
    fieldClass: policy.fieldClass,
    policyDecision: policy.policyDecision,
    riskCategory: policy.riskCategory,
    policyReason: policy.reason,
    signatoryRoutingNote: policy.defaultSignatoryRoutingNote,
    signingNote: policy.signingNote,
  };
}

test('detectAccountOpeningEmail detects account-opening body and attachment names', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Please complete new account form',
    bodyText: 'Can you return the trade account application?',
    attachmentFileNames: ['AMBE account opening form.pdf'],
  });

  assert.equal(result.detected, true);
  assert.ok(result.matchedTerms.includes('new account application'));
  assert.ok(
    result.matchedAttachmentNames.includes('AMBE account opening form.pdf'),
  );
});

test('detectAccountOpeningEmail detects account-opening from attachment filename only', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Documents attached',
    bodyText: 'Please see attached.',
    attachmentFileNames: ['supplier-account-application-form.pdf'],
  });

  assert.equal(result.detected, true);
  assert.deepEqual(result.matchedAttachmentNames, [
    'supplier-account-application-form.pdf',
  ]);
  assert.match(result.classificationReason ?? '', /attachment filename/);
});

test('detectAccountOpeningEmail detects vague emails from extracted attachment text', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Form attached',
    bodyText: 'Please complete and return.',
    attachmentFileNames: ['form.pdf'],
    attachmentTexts: [
      'Credit account application. Company details, VAT number, company number and WDA number.',
    ],
  });

  assert.equal(result.detected, true);
  assert.ok(result.matchedTerms.includes('credit account application'));
  assert.match(result.classificationReason ?? '', /extracted attachment text/);
});

test('detectAccountOpeningEmail does not classify normal supplier price lists', () => {
  const result = detectAccountOpeningEmail({
    subject: 'May supplier price list',
    bodyText:
      'Please find our wholesale price list attached. Amlodipine 5mg tablets GBP 1.20.',
    attachmentFileNames: ['supplier-price-list-may.xlsx'],
  });

  assert.equal(result.detected, false);
});

test('detectAccountOpeningEmail does not classify stock or offer lists as account-opening', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Products available and stock list',
    bodyText:
      'Please see offer list below. Batch, expiry, MOQ and price rows are included for your account team.',
    attachmentFileNames: ['stock-offer-list.xlsx'],
  });

  assert.equal(result.detected, false);
});

test('detectAccountOpeningEmail does not classify generic account or customer wording', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Customer account update',
    bodyText:
      'Please ask your accounts customer contact to confirm the latest quote and account statement.',
    attachmentFileNames: ['quote.pdf'],
  });

  assert.equal(result.detected, false);
});

test('detectAccountOpeningEmail does not classify invoices or account statements', () => {
  const invoiceResult = detectAccountOpeningEmail({
    subject: 'Invoice and statement',
    bodyText:
      'Attached invoice, delivery note and wholesale account statement for your records.',
    attachmentFileNames: ['invoice-1044.pdf', 'account-statement.pdf'],
  });
  const orderResult = detectAccountOpeningEmail({
    subject: 'Order confirmation',
    bodyText: 'Your order confirmation and delivery note are attached.',
    attachmentFileNames: ['order-confirmation.pdf', 'delivery-note.pdf'],
  });

  assert.equal(invoiceResult.detected, false);
  assert.equal(orderResult.detected, false);
});

test('account-opening case flags direct debit and guarantee wording', () => {
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Credit account application',
    bodyText:
      'Please complete the Direct Debit mandate and personal guarantee section.',
    receivedAt: new Date('2026-05-12T10:00:00.000Z'),
    attachments: [],
  });

  assert.equal(accountCase.structuredFields.directDebitRequested, true);
  assert.equal(accountCase.structuredFields.guaranteeDetected, true);
  assert.ok(accountCase.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.riskFlags.includes('Personal guarantee'));
  assert.ok(
    accountCase.signingNotes.riskFlags.includes('Direct Debit mandate'),
  );
  assert.ok(accountCase.signingNotes.riskFlags.includes('Personal guarantee'));
});

test('signer recommendation keeps Aman as default and explains director/regulatory/high-risk escalation', () => {
  const summary = buildAccountOpeningSigningSummary(
    'Director signature required. Responsible Person RP GDP WDA. Direct Debit guarantee indemnity.',
  );

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.equal(summary.detectedNames.length, 0);
  assert.ok(summary.detectedSignatureRoles.includes('Director'));
  assert.ok(
    summary.signingExplanation.includes(
      'Aman Dhillon can sign this account-opening form by default.',
    ),
  );
  assert.ok(
    summary.escalationNotes.some((note) =>
      note.includes('director-only signature'),
    ),
  );
  assert.ok(
    summary.escalationNotes.some((note) =>
      note.includes('regulatory/RP wording'),
    ),
  );
  assert.ok(
    summary.escalationNotes.some((note) =>
      note.includes('High-risk section detected'),
    ),
  );
});

test('Director wording keeps Aman as default signer with director-only escalation note', () => {
  const summary = buildAccountOpeningSigningSummary(
    'Director signature box for the account opening form.',
  );
  const notes = buildAccountOpeningSigningNotes({
    signingSummary: summary,
    riskFlags: ['Guarantee'],
    missingOrUnclear: [],
  });

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.match(
    summary.signingExplanation,
    /Aman Dhillon can sign this account-opening form by default/,
  );
  assert.ok(
    summary.escalationNotes.some((note) =>
      note.includes('director-only signature'),
    ),
  );
  assert.equal(notes.recommendedSigner, 'Aman Dhillon');
  assert.ok(
    notes.reviewerChecks.some((check) =>
      check.includes('director-only signature'),
    ),
  );
});

test('RP GDP WDA wording keeps Aman as default signer with regulatory check note', () => {
  const summary = buildAccountOpeningSigningSummary(
    'Responsible Person RP GDP WDA declaration.',
  );
  const notes = buildAccountOpeningSigningNotes({
    signingSummary: summary,
    riskFlags: ['RP/GDP/WDA regulatory declaration'],
    missingOrUnclear: [],
  });

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.match(
    summary.signingExplanation,
    /Aman Dhillon can sign this account-opening form by default/,
  );
  assert.ok(
    summary.escalationNotes.some((note) =>
      note.includes('regulatory/RP wording'),
    ),
  );
  assert.ok(
    notes.reviewerChecks.some((check) =>
      check.includes('regulatory/RP wording'),
    ),
  );
});

test('unknown account-opening fields remain To be confirmed', () => {
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Supplier onboarding questionnaire',
    bodyText: 'Please complete this supplier onboarding questionnaire.',
    attachments: [],
  });

  assert.equal(accountCase.structuredFields.companyName, 'To be confirmed');
  assert.equal(accountCase.structuredFields.tradingName, 'To be confirmed');
  assert.equal(accountCase.structuredFields.companyNumber, 'To be confirmed');
  assert.equal(accountCase.structuredFields.vatNumber, 'To be confirmed');
  assert.ok(accountCase.missingFields.includes('companyName'));
  assert.ok(accountCase.missingFields.includes('tradingName'));
  assert.ok(accountCase.missingFields.includes('companyNumber'));
  assert.ok(accountCase.missingFields.includes('registeredAddress'));
  assert.ok(
    accountCase.signingNotes.missingOrUnclear.includes('companyNumber'),
  );
});

test('ordinary account-opening form generates signing notes', () => {
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText: 'Please complete the account opening form.',
    attachments: [],
  });

  assert.equal(accountCase.signingNotes.title, 'Account opening signing notes');
  assert.equal(accountCase.signingNotes.recommendedSigner, 'Aman Dhillon');
  assert.equal(
    accountCase.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.match(
    accountCase.signingNotes.summary,
    /Leave signature fields blank/,
  );
});

test('Direct Debit bank authority and guarantee wording appear in signing note risk flags', () => {
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText:
      'Direct Debit mandate, bank authority signature, guarantee and indemnity sections apply.',
    attachments: [],
  });

  assert.ok(
    accountCase.signingNotes.riskFlags.includes('Direct Debit mandate'),
  );
  assert.ok(
    accountCase.signingNotes.riskFlags.includes('bank authority signature'),
  );
  assert.ok(accountCase.signingNotes.riskFlags.includes('Guarantee'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('indemnity'));
});

test('dashboard-facing signing notes do not include bank account numbers', () => {
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText:
      'Please complete the Direct Debit mandate. Account number 12345678 sort code 12-34-56 bank authority required.',
    attachments: [],
  });
  const dashboardFacingNotes = JSON.stringify(accountCase.signingNotes);

  assert.doesNotMatch(dashboardFacingNotes, /12345678/);
  assert.doesNotMatch(dashboardFacingNotes, /12-34-56/);
  assert.match(dashboardFacingNotes, /Direct Debit mandate/);
  assert.match(dashboardFacingNotes, /bank authority signature/);
});

test('source fingerprint is stable for duplicate account-opening messages', () => {
  const first = buildAccountOpeningSourceFingerprint({
    messageId: '<message-1>',
    senderEmail: 'Forms@Supplier.co.uk',
    subject: 'Account opening form',
    attachmentFileNames: ['new-account-form.pdf', 'terms.pdf'],
    matchedTerms: ['new account form', 'account opening form'],
  });
  const second = buildAccountOpeningSourceFingerprint({
    messageId: '<message-1>',
    senderEmail: 'forms@supplier.co.uk',
    subject: '  Account   opening form ',
    attachmentFileNames: ['terms.pdf', 'new-account-form.pdf'],
    matchedTerms: ['account opening form', 'new account form'],
  });

  assert.equal(first, second);
});

test('persistence payload stores safe signing summary without raw bank values', () => {
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText:
      'Please complete the Direct Debit mandate. Account number 12345678 sort code 12-34-56 bank authority required.',
    attachments: [{ fileName: 'direct-debit-form.pdf', extractedText: null }],
  });
  const payload = buildAccountOpeningCasePersistenceData({
    accountCase,
    messageId: '<message-1>',
    detectedFormType: 'account opening form',
  });
  const persistedText = JSON.stringify(payload.create);

  assert.equal(payload.where.sourceFingerprint, accountCase.sourceFingerprint);
  assert.equal(payload.create.status, 'PENDING_REVIEW');
  assert.equal(payload.create.recommendedSigner, 'Aman Dhillon');
  assert.equal(
    payload.create.signingStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.match(persistedText, /Direct Debit mandate/);
  assert.match(persistedText, /bank authority signature/);
  assert.doesNotMatch(persistedText, /12345678/);
  assert.doesNotMatch(persistedText, /12-34-56/);
});

function buildPersistedAccountOpeningCase(
  overrides: Partial<PersistedAccountOpeningReviewCase> = {},
): PersistedAccountOpeningReviewCase {
  return {
    id: 'account-case-1',
    sourceFingerprint: 'fingerprint-1',
    messageId: 'message-1',
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    receivedAt: new Date('2026-05-12T09:00:00.000Z'),
    companyName: 'AMBE LTD',
    detectedFormType: 'account opening form',
    caseType: null,
    sourceChannel: null,
    status: 'PENDING_REVIEW',
    recommendedSigner: 'Aman Dhillon',
    signingStatement:
      'Aman Dhillon can sign this account-opening form by default.',
    signingExplanation:
      'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: ['Sandeep Patel'],
    detectedRoles: ['Director', 'Direct Debit', 'bank authority'],
    escalationNotes: [
      'The form mentions a director. Reviewer should confirm the supplier does not specifically require a director-only signature.',
    ],
    riskFlags: [
      'Direct Debit mandate',
      'bank authority signature',
      'Guarantee',
    ],
    missingFields: ['companyNumber', 'vatNumber'],
    reviewerChecks: [
      'Check whether the supplier specifically requires a director-only signature.',
      'Leave all signature fields blank unless a human reviewer approves signing.',
    ],
    signingNotes: {
      title: 'Account opening signing notes',
      recommendedSigner: 'Aman Dhillon',
      defaultSigningStatement:
        'Aman Dhillon can sign this account-opening form by default.',
      detectedNames: ['Sandeep Patel'],
      detectedRolesOrSections: ['Director', 'Direct Debit', 'bank authority'],
      reviewerChecks: [
        'Check whether the supplier specifically requires a director-only signature.',
        'Leave all signature fields blank unless a human reviewer approves signing.',
      ],
      riskFlags: [
        'Direct Debit mandate',
        'bank authority signature',
        'Guarantee',
      ],
      missingOrUnclear: ['companyNumber', 'vatNumber'],
      signatureInstruction:
        'Leave signature fields blank until approved by a human reviewer.',
      summary:
        'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default. Leave signature fields blank until approved by a human reviewer.',
    },
    missingInfoResponses: {},
    extractedTextSummary:
      'Extracted account-opening text from email body (40 chars).',
    storageStatus: null,
    storageNote: null,
    storageSkippedReason: null,
    storageLastAttemptAt: null,
    storageFolderUrl: null,
    sourceAttachmentNames: ['account-opening-form.pdf'],
    draftStatus: null,
    draftVersion: null,
    draftGeneratedAt: null,
    draftJson: null,
    draftSummary: null,
    sourceEvidence: [],
    fieldMappings: [],
    originalForms: [],
    fillPreviews: [],
    binaryFillPreviews: [],
    completedFormFilings: [],
    processingRuns: [],
    createdAt: new Date('2026-05-12T09:00:00.000Z'),
    updatedAt: new Date('2026-05-12T09:00:00.000Z'),
    ...overrides,
  };
}

function buildPersistedOriginalForm(
  overrides: Partial<PersistedAccountOpeningOriginalForm> = {},
): PersistedAccountOpeningOriginalForm {
  return {
    id: 'original-form-1',
    accountOpeningCaseId: 'account-case-1',
    sourceEvidenceId: 'evidence-1',
    fileName: 'supplier-account-opening-form.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12000,
    fileHash: 'form-hash-1',
    storageProvider: 'MICROSOFT_DRIVE',
    storageFolderUrl: 'https://sharepoint.example/account-opening',
    storageFileUrl: 'https://sharepoint.example/account-opening/form.pdf',
    storageDriveItemId: 'drive-item-1',
    localBlobAvailable: false,
    formType: 'PDF',
    fillSupportStatus: 'PREVIEW_SUPPORTED',
    detectedFieldCount: null,
    detectionSummary: {
      metadataOnly: true,
      rawFileBytesStored: false,
    },
    createdAt: new Date('2026-05-12T09:00:00.000Z'),
    updatedAt: new Date('2026-05-12T09:00:00.000Z'),
    ...overrides,
  };
}

function buildPersistedSourceEvidence(
  overrides: Partial<PersistedAccountOpeningSourceEvidence> = {},
): PersistedAccountOpeningSourceEvidence {
  return {
    id: 'evidence-1',
    accountOpeningCaseId: 'account-case-1',
    sourceType: 'ATTACHMENT',
    sourceLabel: 'supplier-account-opening-form.pdf',
    fileName: 'supplier-account-opening-form.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12000,
    contentId: null,
    disposition: 'attachment',
    extractionMethod: 'PDF_TEXT',
    extractedTextHash: 'text-hash-1',
    extractedTextChars: 240,
    safeSnippet: 'Account opening form company details.',
    rawFileAvailable: false,
    storageProvider: 'MICROSOFT_DRIVE',
    storageFolderUrl: 'https://sharepoint.example/account-opening',
    storageFileUrl: 'https://sharepoint.example/account-opening/form.pdf',
    storageDriveItemId: 'drive-item-1',
    metadata: { rawExtractedTextStored: false },
    createdAt: new Date('2026-05-12T09:00:00.000Z'),
    updatedAt: new Date('2026-05-12T09:00:00.000Z'),
    ...overrides,
  };
}

function buildPersistedProcessingRun(
  overrides: Partial<PersistedAccountOpeningProcessingRun> = {},
): PersistedAccountOpeningProcessingRun {
  return {
    id: 'processing-run-1',
    accountOpeningCaseId: 'account-case-1',
    triggerType: 'INITIAL_INGEST',
    status: 'COMPLETED',
    startedAt: new Date('2026-05-12T09:00:00.000Z'),
    finishedAt: new Date('2026-05-12T09:00:01.000Z'),
    warningSummary: null,
    errorSummary: null,
    diagnostics: {
      sourceEvidenceCount: 1,
      attachmentEvidenceCount: 1,
      replaySource: 'STORED_SOURCE_EVIDENCE',
      rawEmailBodyRequired: false,
      attachmentBytesRequired: false,
    },
    actorType: 'SYSTEM',
    actorIdentifier: 'email-account-opening-ingestion',
    createdAt: new Date('2026-05-12T09:00:01.000Z'),
    updatedAt: new Date('2026-05-12T09:00:01.000Z'),
    ...overrides,
  };
}

test('case detail exposes lifecycle document classifications and profile gaps', () => {
  const detail = buildAccountOpeningCaseDetail(
    buildPersistedAccountOpeningCase({
      sourceEvidence: [
        buildPersistedSourceEvidence({
          safeSnippet:
            'Credit application with Direct Debit mandate and bank authority.',
        }),
      ],
      originalForms: [
        buildPersistedOriginalForm({
          fileName: 'credit-application-direct-debit.pdf',
        }),
      ],
      processingRuns: [buildPersistedProcessingRun()],
    }),
  );

  assert.equal(detail.lifecycle.legacyStatus, 'PENDING_REVIEW');
  assert.equal(detail.lifecycle.currentStage, 'NEEDS_REVIEW');
  assert.equal(detail.lifecycle.safety.noAutoSign, true);
  assert.equal(detail.lifecycle.safety.noAutoSubmit, true);
  assert.equal(detail.documentClassifications.length, 1);
  assert.equal(
    detail.documentClassifications[0]?.classification,
    'DIRECT_DEBIT_MANDATE',
  );
  assert.equal(
    detail.documentClassifications[0]?.safeForAutomaticCompletion,
    false,
  );
  assert.equal(detail.companyProfile.profileId, 'ambe-account-opening-profile');
  assert.ok(detail.companyProfile.missingProfileFields.length > 0);
  assert.ok(detail.companyProfile.blockedFields.includes('Bank details'));
  assert.equal(detail.companyProfile.safety.valuesInvented, false);
  assert.ok(
    detail.policyRiskFlags.some((flag) => flag.fieldClass === 'DIRECT_DEBIT'),
  );
  assert.ok(
    detail.policySigningNotes.some((note) => note.includes('Sandeep Patel')),
  );
  assert.equal(detail.sourceProvenance.messageId, 'message-1');
  assert.equal(detail.sourceProvenance.subject, 'Account opening form');
  assert.equal(detail.sourceProvenance.attachmentCount, 1);
  assert.equal(
    detail.sourceProvenance.attachments[0]?.fileName,
    'supplier-account-opening-form.pdf',
  );
  assert.equal(
    detail.sourceProvenance.attachments[0]?.classification,
    'DIRECT_DEBIT_MANDATE',
  );
  assert.equal(
    detail.sourceProvenance.attachments[0]?.checksumSha256,
    'form-hash-1',
  );
  assert.equal(
    detail.sourceProvenance.attachments[0]?.replayPointer
      .canReplayFromStoredSource,
    true,
  );
  assert.equal(detail.sourceProvenance.safety.rawEmailBodyIncluded, false);
  assert.equal(detail.sourceProvenance.safety.rawExtractedTextIncluded, false);
  assert.equal(detail.sourceProvenance.safety.attachmentBytesIncluded, false);
  assert.equal(detail.processingRuns.length, 1);
  assert.equal(detail.processingRuns[0]?.triggerType, 'INITIAL_INGEST');
  assert.equal(detail.processingRuns[0]?.status, 'COMPLETED');
});

test('stored-source replay regenerates draft and replaces original form references safely', async () => {
  const {
    repository,
    events,
    getCurrent,
    getOriginalForms,
    getProcessingRuns,
  } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      status: 'PENDING_REVIEW',
      draftGeneratedAt: null,
      sourceEvidence: [
        buildPersistedSourceEvidence({
          safeSnippet:
            'Credit account application with Direct Debit mandate, bank authority and guarantee section.',
        }),
      ],
      originalForms: [],
    }),
  );

  const first = await reprocessAccountOpeningCaseFromStoredSource({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'stored-source-test',
    repository,
    now: new Date('2026-05-12T13:00:00.000Z'),
  });
  const second = await reprocessAccountOpeningCaseFromStoredSource({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'stored-source-test',
    repository,
    now: new Date('2026-05-12T13:05:00.000Z'),
  });
  const directDebitField = second.completionDraft.fields.find(
    (field) => field.key === 'directDebitOrBankAuthority',
  );
  const latestRun = getProcessingRuns()[0];
  const latestRunDiagnostics =
    latestRun?.diagnostics && typeof latestRun.diagnostics === 'object'
      ? (latestRun.diagnostics as Record<string, unknown>)
      : {};

  assert.equal(first.status, 'PENDING_REVIEW');
  assert.equal(second.status, 'PENDING_REVIEW');
  assert.equal(getCurrent().status, 'PENDING_REVIEW');
  assert.equal(getOriginalForms().length, 1);
  assert.equal(getOriginalForms()[0]?.sourceEvidenceId, 'evidence-1');
  assert.equal(getProcessingRuns().length, 2);
  assert.equal(latestRun?.triggerType, 'MANUAL_REPROCESS');
  assert.equal(latestRun?.status, 'COMPLETED');
  assert.equal(latestRunDiagnostics.outboundActionsTriggered, false);
  assert.equal(
    events.some(
      (event) => event.actionType === 'REPROCESSED_FROM_STORED_SOURCE',
    ),
    true,
  );
  assert.equal(second.completionDraft.summary.safeToAutoFill, false);
  assert.ok(second.completionDraft.summary.blockedFields > 0);
  assert.equal(directDebitField?.policyDecision, 'MUST_STAY_BLANK');
  assert.equal(directDebitField?.proposedValue, null);
  assert.equal(directDebitField?.requiresReview, true);
  assert.equal(second.lifecycle.safety.noAutoSign, true);
  assert.equal(second.lifecycle.safety.noAutoSubmit, true);
  assert.equal(second.lifecycle.safety.noOutboundSend, true);
});

function buildPersistedFieldMapping(
  overrides: Partial<PersistedAccountOpeningFieldMapping> = {},
): PersistedAccountOpeningFieldMapping {
  return {
    id: 'field-mapping-1',
    accountOpeningCaseId: 'account-case-1',
    supplierFieldLabel: 'Company Name',
    supplierSectionLabel: null,
    normalizedLabel: 'company name',
    sourceType: 'SOURCE_EVIDENCE',
    sourceEvidenceId: 'evidence-1',
    evidenceSnippet: 'Company Name',
    suggestedDraftFieldKey: 'legalCompanyName',
    mappedDraftFieldKey: 'legalCompanyName',
    proposedValue: 'AMBE LTD',
    valueSource: 'AMBE_MASTER_PROFILE',
    confidence: 'HIGH',
    riskLevel: 'LOW',
    status: 'MAPPED_SAFE',
    requiresReview: false,
    blockedReason: null,
    reviewReason: null,
    operatorNote: null,
    sortOrder: 0,
    createdAt: new Date('2026-05-12T10:00:00.000Z'),
    updatedAt: new Date('2026-05-12T10:00:00.000Z'),
    ...overrides,
  };
}

function buildPersistedBinaryFillPreview(
  overrides: Partial<PersistedAccountOpeningBinaryFillPreview> = {},
): PersistedAccountOpeningBinaryFillPreview {
  return {
    id: 'binary-fill-preview-1',
    accountOpeningCaseId: 'account-case-1',
    originalFormId: 'original-form-1',
    status: 'GENERATED_FOR_REVIEW',
    previewVersion: 'binary-fill-preview-v1',
    binaryPreviewFileName: 'binary-fill-preview.pdf',
    binaryPreviewContentType: 'application/pdf',
    binaryPreviewHash: 'binary-preview-hash-1',
    binaryPreviewBytes: new Uint8Array([37, 80, 68, 70, 45]),
    filledFieldCount: 1,
    blankFieldCount: 3,
    unsupportedReason: null,
    warnings: [],
    brandingPreservationCheck: {
      originalBrandingPreservationRequired: true,
      originalLayoutPreservationRequired: true,
      formFlattened: false,
    },
    safetySummary: {
      internalPreviewOnly: true,
      binaryPreviewGenerated: true,
      blockedFieldsLeftBlank: true,
      reviewRequiredFieldsLeftBlank: true,
      signedFormsIncluded: false,
      supplierSubmissionTriggered: false,
      sharePointCompletedFormFiled: false,
      purchaseWorkflowTriggered: false,
    },
    createdByType: 'OPERATOR',
    createdByIdentifier: 'test-reviewer',
    createdAt: new Date('2026-05-12T11:30:00.000Z'),
    ...overrides,
  };
}

function buildPersistedCompletedFormFiling(
  overrides: Partial<PersistedAccountOpeningCompletedFormFiling> = {},
): PersistedAccountOpeningCompletedFormFiling {
  return {
    id: 'completed-form-filing-1',
    accountOpeningCaseId: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    status: 'FILED',
    fileName:
      'supplier-account-opening-form-completed-unsigned-20260517T100000Z.pdf',
    contentType: 'application/pdf',
    fileHash: 'binary-preview-hash-1',
    fileSizeBytes: 5,
    storageProvider: 'SHAREPOINT',
    storageFolderUrl: 'https://sharepoint.example/folder',
    storageFileUrl: 'https://sharepoint.example/file.pdf',
    storageDriveItemId: 'file-drive-item-1',
    approvedByType: 'OPERATOR',
    approvedByIdentifier: 'test-reviewer',
    approvedAt: new Date('2026-05-17T10:00:00.000Z'),
    approvalNote: 'Operator approved internal filing only.',
    filedByType: 'OPERATOR',
    filedByIdentifier: 'test-reviewer',
    filedAt: new Date('2026-05-17T10:01:00.000Z'),
    filingNote: 'Filed internally only.',
    skippedReason: null,
    safetySummary: {
      internalSharePointFilingOnly: true,
      notSigned: true,
      notSent: true,
      notSubmitted: true,
    },
    metadata: {
      rawFileBytesIncludedInAudit: false,
      supplierSubmissionTriggered: false,
    },
    createdAt: new Date('2026-05-17T10:00:00.000Z'),
    updatedAt: new Date('2026-05-17T10:01:00.000Z'),
    ...overrides,
  };
}

const enabledStorageConfig: AccountOpeningDriveArchiveConfig = {
  provider: 'SHAREPOINT',
  enabled: true,
  siteId: 'site-1',
  driveId: 'drive-1',
  rootFolder: 'AMBE',
  baseFolder: 'Account Opening',
  graphAuthConfigured: true,
};

const disabledStorageConfig: AccountOpeningDriveArchiveConfig = {
  ...enabledStorageConfig,
  enabled: false,
};

function createAccountOpeningRepository(
  initial: PersistedAccountOpeningReviewCase,
) {
  let current = initial;
  let fieldMappings = initial.fieldMappings ?? [];
  let originalForms = initial.originalForms ?? [];
  let fillPreviews = initial.fillPreviews ?? [];
  let binaryFillPreviews = initial.binaryFillPreviews ?? [];
  let completedFormFilings = initial.completedFormFilings ?? [];
  let processingRuns = initial.processingRuns ?? [];
  const events: AccountOpeningCaseEventInput[] = [];
  const repository: AccountOpeningCaseRepository = {
    findUnique: async () => ({
      ...current,
      fieldMappings,
      originalForms,
      fillPreviews: fillPreviews
        .slice()
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        ),
      binaryFillPreviews: binaryFillPreviews
        .slice()
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        ),
      completedFormFilings: completedFormFilings
        .slice()
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        ),
      processingRuns: processingRuns
        .slice()
        .sort(
          (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
        ),
    }),
    update: async (args: unknown) => {
      const data =
        (args as { data?: Partial<PersistedAccountOpeningReviewCase> }).data ??
        {};
      current = {
        ...current,
        ...data,
        fieldMappings,
        originalForms,
        fillPreviews,
        binaryFillPreviews,
        completedFormFilings,
        processingRuns,
        updatedAt: new Date('2026-05-12T10:00:00.000Z'),
      };
      return current;
    },
    replaceFieldMappings: async ({ mappings }) => {
      fieldMappings = mappings.map((mapping, index) => ({
        ...mapping,
        id: `field-mapping-${index + 1}`,
        sortOrder: index,
        createdAt: new Date('2026-05-12T10:00:00.000Z'),
        updatedAt: new Date('2026-05-12T10:00:00.000Z'),
      }));
      current = {
        ...current,
        fieldMappings,
      };
      return fieldMappings;
    },
    replaceOriginalForms: async ({ forms }) => {
      originalForms = forms.map((form, index) => ({
        ...form,
        id: `original-form-${index + 1}`,
        createdAt: new Date('2026-05-12T10:00:00.000Z'),
        updatedAt: new Date('2026-05-12T10:00:00.000Z'),
      }));
      current = {
        ...current,
        originalForms,
      };
      return originalForms;
    },
    createFillPreview: async ({ data }) => {
      const created: PersistedAccountOpeningFillPreview = {
        ...data,
        id: `fill-preview-${fillPreviews.length + 1}`,
        createdAt: new Date('2026-05-12T11:00:00.000Z'),
      };
      fillPreviews = [created, ...fillPreviews];
      current = {
        ...current,
        fillPreviews,
      };
      return created;
    },
    createBinaryFillPreview: async ({ data }) => {
      const created: PersistedAccountOpeningBinaryFillPreview = {
        ...data,
        id: `binary-fill-preview-${binaryFillPreviews.length + 1}`,
        createdAt: new Date('2026-05-12T11:30:00.000Z'),
      };
      binaryFillPreviews = [created, ...binaryFillPreviews];
      current = {
        ...current,
        binaryFillPreviews,
      };
      return created;
    },
    findBinaryFillPreview: async ({ where }) =>
      binaryFillPreviews.find((preview) => preview.id === where.id) ?? null,
    findCompletedFormFiling: async ({ where }) => {
      const matches = completedFormFilings.filter((filing) => {
        if (where?.id && filing.id !== where.id) {
          return false;
        }
        if (
          where?.accountOpeningCaseId &&
          filing.accountOpeningCaseId !== where.accountOpeningCaseId
        ) {
          return false;
        }
        if (
          where?.binaryFillPreviewId &&
          filing.binaryFillPreviewId !== where.binaryFillPreviewId
        ) {
          return false;
        }
        return true;
      });

      return (
        matches.sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )[0] ?? null
      );
    },
    createCompletedFormFiling: async ({ data }) => {
      const created: PersistedAccountOpeningCompletedFormFiling = {
        ...data,
        id: `completed-form-filing-${completedFormFilings.length + 1}`,
        createdAt: new Date('2026-05-12T12:00:00.000Z'),
        updatedAt: new Date('2026-05-12T12:00:00.000Z'),
      };
      completedFormFilings = [created, ...completedFormFilings];
      current = {
        ...current,
        completedFormFilings,
      };
      return created;
    },
    updateCompletedFormFiling: async ({ where, data }) => {
      let updated: PersistedAccountOpeningCompletedFormFiling | null = null;
      completedFormFilings = completedFormFilings.map((filing) => {
        if (filing.id !== where.id) {
          return filing;
        }

        updated = {
          ...filing,
          ...data,
          updatedAt: new Date('2026-05-12T12:30:00.000Z'),
        };
        return updated;
      });

      if (!updated) {
        throw new Error('Account-opening completed form filing not found.');
      }

      current = {
        ...current,
        completedFormFilings,
      };
      return updated;
    },
    createProcessingRun: async ({ data }) => {
      const created: PersistedAccountOpeningProcessingRun = {
        ...data,
        id: `processing-run-${processingRuns.length + 1}`,
        createdAt: new Date('2026-05-12T13:00:00.000Z'),
        updatedAt: new Date('2026-05-12T13:00:00.000Z'),
      };
      processingRuns = [created, ...processingRuns];
      current = {
        ...current,
        processingRuns,
      };
      return created;
    },
    updateProcessingRun: async ({ where, data }) => {
      let updated: PersistedAccountOpeningProcessingRun | null = null;
      processingRuns = processingRuns.map((run) => {
        if (run.id !== where.id) {
          return run;
        }

        updated = {
          ...run,
          ...data,
          updatedAt: new Date('2026-05-12T13:30:00.000Z'),
        };
        return updated;
      });

      if (!updated) {
        throw new Error('Account-opening processing run not found.');
      }

      current = {
        ...current,
        processingRuns,
      };
      return updated;
    },
    findEvents: async ({ where }) =>
      events
        .filter((event) => {
          if (event.accountOpeningCaseId !== where.accountOpeningCaseId) {
            return false;
          }

          if (where.actionType && event.actionType !== where.actionType) {
            return false;
          }

          return true;
        })
        .map((event, index) => ({
          id: `event-${index + 1}`,
          accountOpeningCaseId: event.accountOpeningCaseId,
          actionType: event.actionType,
          previousStatus: event.previousStatus ?? null,
          newStatus: event.newStatus ?? null,
          actorType: event.actorType ?? 'SYSTEM',
          actorIdentifier: event.actorIdentifier ?? null,
          note: event.note ?? null,
          metadata: event.metadata ?? null,
          createdAt: new Date(
            Date.parse('2026-05-12T12:00:00.000Z') + index * 1000,
          ),
        })),
    createEvent: async (args) => {
      events.push(args.data);
      return args.data;
    },
  };

  return {
    repository,
    events,
    getCurrent: () => current,
    getOriginalForms: () => originalForms,
    getFillPreviews: () => fillPreviews,
    getBinaryFillPreviews: () => binaryFillPreviews,
    getCompletedFormFilings: () => completedFormFilings,
    getProcessingRuns: () => processingRuns,
  };
}

function buildDraftFixture(
  overrides: Partial<AccountOpeningCompletionDraft> = {},
): AccountOpeningCompletionDraft {
  const status = overrides.status ?? 'BLOCKED';
  const blockedFields = status === 'BLOCKED' ? 1 : 0;
  const reviewRequiredFields = status === 'REVIEW_REQUIRED' ? 1 : blockedFields;
  return {
    status,
    overallConfidence:
      overrides.overallConfidence ??
      (status === 'READY_FOR_REVIEW'
        ? 'HIGH'
        : status === 'REVIEW_REQUIRED'
          ? 'LOW'
          : 'BLOCKED'),
    isStored: true,
    profileId: 'ambe-account-opening-profile',
    profileVersion: '2026-06-09',
    generatedAt: '2026-05-15T10:00:00.000Z',
    fields: [],
    summary: {
      totalFields: 1,
      highConfidenceFields: status === 'READY_FOR_REVIEW' ? 1 : 0,
      reviewRequiredFields,
      blockedFields,
      safeToAutoFill: false,
    },
    safetyNotes: ['Review draft only. This does not sign or submit anything.'],
    riskFlags: [],
    signingNotes: [],
    ...overrides,
  };
}

async function recordDraftAuditEventTypes(input: {
  draft: AccountOpeningCompletionDraft;
  generatedActionType?: 'DRAFT_GENERATED' | 'DRAFT_REGENERATED';
}): Promise<string[]> {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  await writeDraftAuditEvents({
    accountCaseId: 'account-case-1',
    previousStatus: 'PENDING_REVIEW',
    draft: input.draft,
    generatedActionType: input.generatedActionType ?? 'DRAFT_GENERATED',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });

  return events.map((event) => event.actionType);
}

test('missing-info responses are sanitized before dashboard display', () => {
  const responses = sanitizeAccountOpeningMissingInfoResponses({
    website: 'https://supplier.example',
    reviewerNotes:
      'Account number 12345678 and sort code 12-34-56 were on the mandate.',
  });

  assert.equal(responses.website, 'https://supplier.example');
  assert.match(
    responses.reviewerNotes ?? '',
    /\[redacted bank account number\]/,
  );
  assert.match(responses.reviewerNotes ?? '', /\[redacted sort code\]/);
  assert.doesNotMatch(JSON.stringify(responses), /12345678/);
  assert.doesNotMatch(JSON.stringify(responses), /12-34-56/);
});

test('account-opening detail exposes safe structured fields and signing notes', () => {
  const detail = buildAccountOpeningCaseDetail(
    buildPersistedAccountOpeningCase({
      missingInfoResponses: {
        reviewerNotes: 'Sort code 12-34-56. Account number 12345678.',
      },
      sourceAttachmentNames: [
        'bank-mandate-account-12345678-sort-12-34-56.pdf',
      ],
    }),
  );
  const dashboardText = JSON.stringify(detail);

  assert.equal(
    detail.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.ok(detail.detectedNames.includes('Sandeep Patel'));
  assert.ok(detail.detectedRoles.includes('Director'));
  assert.ok(detail.riskFlags.includes('Direct Debit mandate'));
  assert.doesNotMatch(dashboardText, /12345678/);
  assert.doesNotMatch(dashboardText, /12-34-56/);
});

test('account-opening detail exposes safe field mapping candidates', () => {
  const detail = buildAccountOpeningCaseDetail(
    buildPersistedAccountOpeningCase({
      sourceEvidence: [
        {
          id: 'evidence-1',
          sourceType: 'ATTACHMENT',
          sourceLabel: 'supplier-form.pdf',
          fileName: 'supplier-form.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          contentId: null,
          disposition: 'attachment',
          extractionMethod: 'PDF_TEXT',
          extractedTextHash: 'hash-1',
          extractedTextChars: 120,
          safeSnippet:
            'Company Name, Direct Debit Mandate, Bank Account Number and Responsible Person requested.',
          rawFileAvailable: false,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
          createdAt: new Date('2026-05-12T09:00:00.000Z'),
          updatedAt: new Date('2026-05-12T09:00:00.000Z'),
        },
      ],
    }),
  );

  assert.equal(detail.fieldMappings.status, 'PREVIEW');
  assert.equal(detail.fieldMappings.summary.safeToFillSupplierForms, false);
  assert.ok(
    detail.fieldMappings.mappings.some(
      (mapping) =>
        mapping.supplierFieldLabel === 'Direct Debit Mandate' &&
        mapping.status === 'BLOCKED',
    ),
  );
  assert.ok(
    detail.fieldMappings.mappings.some(
      (mapping) =>
        mapping.supplierFieldLabel === 'Responsible Person' &&
        mapping.status === 'BLOCKED' &&
        mapping.proposedValue === null &&
        mapping.fieldClass === 'REGULATORY_DECLARATION',
    ),
  );
});

test('saving missing info persists responses and records an audit event', async () => {
  const { repository, events, getCurrent } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  const detail = await saveAccountOpeningMissingInfo({
    id: 'account-case-1',
    missingInfoResponses: {
      website: 'https://supplier.example',
      businessHours: '9am to 5pm',
      reviewerNotes: 'Account number 12345678 should not be displayed.',
    },
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });

  assert.equal(detail.missingInfoResponses.website, 'https://supplier.example');
  assert.equal(detail.missingInfoResponses.businessHours, '9am to 5pm');
  assert.doesNotMatch(JSON.stringify(detail.missingInfoResponses), /12345678/);
  assert.equal(
    (events[0] as { actionType?: string }).actionType,
    'MISSING_INFO_SAVED',
  );
  assert.equal(
    (events[0] as { previousStatus?: string }).previousStatus,
    'PENDING_REVIEW',
  );
  assert.equal(getCurrent().status, 'PENDING_REVIEW');
});

test('saving field mappings persists safe decisions and records safe audit metadata', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      sourceEvidence: [
        {
          id: 'evidence-1',
          sourceType: 'ATTACHMENT',
          sourceLabel: 'direct-debit-form.pdf',
          fileName: 'direct-debit-form.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          contentId: null,
          disposition: 'attachment',
          extractionMethod: 'PDF_TEXT',
          extractedTextHash: 'hash-1',
          extractedTextChars: 120,
          safeSnippet:
            'Direct Debit Mandate. Account number 12345678 and sort code 12-34-56.',
          rawFileAvailable: false,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
          createdAt: new Date('2026-05-12T09:00:00.000Z'),
          updatedAt: new Date('2026-05-12T09:00:00.000Z'),
        },
      ],
    }),
  );

  const review = await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'SOURCE_EVIDENCE',
        sourceEvidenceId: 'evidence-1',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'Bank Account Number',
        sourceType: 'SOURCE_EVIDENCE',
        sourceEvidenceId: 'evidence-1',
        mappedDraftFieldKey: 'bankDetails',
        status: 'MAPPED_SAFE',
        operatorNote:
          'Supplier asked for account number 12345678 and sort code 12-34-56.',
      },
    ],
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });
  const reviewText = JSON.stringify(review);
  const event = events[0];

  assert.equal(review.status, 'SAVED');
  assert.equal(review.mappings[0]?.status, 'MAPPED_REVIEW_REQUIRED');
  assert.equal(review.mappings[1]?.status, 'BLOCKED');
  assert.equal(review.mappings[1]?.riskLevel, 'BLOCKED');
  assert.doesNotMatch(reviewText, /12345678/);
  assert.doesNotMatch(reviewText, /12-34-56/);
  assert.equal(event?.actionType, 'FIELD_MAPPINGS_SAVED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /12345678/);
  assert.doesNotMatch(JSON.stringify(event?.metadata), /12-34-56/);
  assert.match(
    JSON.stringify(event?.metadata),
    /rawBankDetailsIncluded":false/,
  );
});

function buildStoredFillPreviewDraft(): AccountOpeningCompletionDraft {
  return {
    ...buildDraftFixture({
      status: 'REVIEW_REQUIRED',
      overallConfidence: 'MEDIUM',
      summary: {
        totalFields: 4,
        highConfidenceFields: 1,
        reviewRequiredFields: 1,
        blockedFields: 2,
        safeToAutoFill: false,
      },
    }),
    fields: [
      {
        key: 'legalCompanyName',
        supplierLabel: 'Company Name',
        proposedValue: 'AMBE LTD',
        valueSource: 'AMBE_MASTER_PROFILE',
        confidence: 'HIGH',
        riskLevel: 'LOW',
        ...accountOpeningPolicyFields({
          key: 'legalCompanyName',
          supplierLabel: 'Company Name',
        }),
        requiresReview: false,
        reviewReason: null,
        evidence: [],
      },
      {
        key: 'bankDetails',
        supplierLabel: 'Bank Details',
        proposedValue: null,
        valueSource: 'NOT_PROVIDED',
        confidence: 'BLOCKED',
        riskLevel: 'BLOCKED',
        ...accountOpeningPolicyFields({
          key: 'bankDetails',
          supplierLabel: 'Bank Details',
        }),
        requiresReview: true,
        reviewReason: 'Bank details require secure review.',
        evidence: [],
      },
      {
        key: 'signature',
        supplierLabel: 'Signature',
        proposedValue: null,
        valueSource: 'SYSTEM_PLACEHOLDER',
        confidence: 'BLOCKED',
        riskLevel: 'BLOCKED',
        ...accountOpeningPolicyFields({
          key: 'signature',
          supplierLabel: 'Signature',
        }),
        requiresReview: true,
        reviewReason: 'Signature fields remain blank.',
        evidence: [],
      },
      {
        key: 'gphcPremisesNumber',
        supplierLabel: 'GPhC Premises Number',
        proposedValue: null,
        valueSource: 'NOT_PROVIDED',
        confidence: 'BLOCKED',
        riskLevel: 'HIGH',
        ...accountOpeningPolicyFields({
          key: 'gphcPremisesNumber',
          supplierLabel: 'GPhC Premises Number',
        }),
        requiresReview: true,
        reviewReason: 'GPhC details require review.',
        evidence: [],
      },
    ],
  };
}

async function buildFillableAccountOpeningPdfBytes(): Promise<Uint8Array> {
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([500, 700]);
  const form = pdfDocument.getForm();
  const fields = [
    { name: 'Company Name', y: 620 },
    { name: 'Bank Account Number', y: 580 },
    { name: 'Director Signature', y: 540 },
    { name: 'GPhC Premises Number', y: 500 },
  ];

  for (const field of fields) {
    const textField = form.createTextField(field.name);
    textField.addToPage(page, {
      x: 50,
      y: field.y,
      width: 260,
      height: 24,
    });
  }

  return pdfDocument.save();
}

test('fill preview uses original form reference and fills only saved safe mapped values', async () => {
  const draft = buildStoredFillPreviewDraft();
  const { repository, events, getFillPreviews } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
        originalForms: [buildPersistedOriginalForm()],
      }),
    );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'Bank Account Number',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'bankDetails',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'Director Signature',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'signature',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'GPhC Premises Number',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'gphcPremisesNumber',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningFillPreview({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-16T12:00:00.000Z'),
  });
  const previewText = JSON.stringify(result.preview);
  const event = events.find(
    (item) => item.actionType === 'FILL_PREVIEW_GENERATED',
  );

  assert.equal(result.preview.payload.summary.filledFieldCount, 1);
  assert.equal(
    result.preview.payload.filledFields[0]?.proposedValue,
    'AMBE LTD',
  );
  assert.equal(result.preview.payload.summary.blankFieldCount, 3);
  assert.match(
    JSON.stringify(result.preview.payload.blankFields),
    /Bank Account Number/,
  );
  assert.match(
    JSON.stringify(result.preview.payload.blankFields),
    /Director Signature/,
  );
  assert.equal(result.preview.metadata.sharePointCompletedFormFiled, false);
  assert.equal(result.preview.metadata.supplierSubmissionTriggered, false);
  assert.equal(result.preview.metadata.purchaseWorkflowTriggered, false);
  assert.doesNotMatch(previewText, /12345678/);
  assert.doesNotMatch(previewText, /12-34-56/);
  assert.equal(getFillPreviews().length, 1);
  assert.equal(result.item.latestFillPreview?.status, 'GENERATED_FOR_REVIEW');
  assert.equal(event?.actionType, 'FILL_PREVIEW_GENERATED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /12345678/);
  assert.match(
    JSON.stringify(event?.metadata),
    /sharePointCompletedFormFiled":false/,
  );
});

test('fill preview requires stored draft, saved mappings, and original form reference', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  await assert.rejects(
    () =>
      generateAccountOpeningFillPreview({
        id: 'account-case-1',
        repository,
      }),
    /Generate and store the completion draft/,
  );

  const draft = buildStoredFillPreviewDraft();
  const { repository: missingMappingsRepository } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
        originalForms: [buildPersistedOriginalForm()],
      }),
    );

  await assert.rejects(
    () =>
      generateAccountOpeningFillPreview({
        id: 'account-case-1',
        repository: missingMappingsRepository,
      }),
    /Save reviewed field mappings/,
  );

  const { repository: missingOriginalFormRepository } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
      }),
    );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository: missingOriginalFormRepository,
  });
  await assert.rejects(
    () =>
      generateAccountOpeningFillPreview({
        id: 'account-case-1',
        repository: missingOriginalFormRepository,
      }),
    /No original supplier\/client form reference/,
  );
});

test('fill preview backfills original form references from attachment evidence', async () => {
  const draft = buildStoredFillPreviewDraft();
  const { repository, events, getOriginalForms } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
        sourceEvidence: [
          {
            id: 'evidence-1',
            sourceType: 'ATTACHMENT',
            sourceLabel: 'supplier-account-opening-form.pdf',
            fileName: 'supplier-account-opening-form.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 12000,
            contentId: null,
            disposition: 'attachment',
            extractionMethod: 'PDF_TEXT',
            extractedTextHash: 'hash-1',
            extractedTextChars: 120,
            safeSnippet: 'Company Name and website requested.',
            rawFileAvailable: false,
            storageProvider: 'MICROSOFT_DRIVE',
            storageFolderUrl: 'https://sharepoint.example/account-opening',
            storageFileUrl:
              'https://sharepoint.example/account-opening/form.pdf',
            storageDriveItemId: 'drive-item-1',
            createdAt: new Date('2026-05-12T09:00:00.000Z'),
            updatedAt: new Date('2026-05-12T09:00:00.000Z'),
          },
        ],
      }),
    );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'SOURCE_EVIDENCE',
        sourceEvidenceId: 'evidence-1',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningFillPreview({
    id: 'account-case-1',
    repository,
  });
  const capturedEvent = events.find(
    (item) => item.actionType === 'ORIGINAL_FORM_REFERENCE_CAPTURED',
  );

  assert.equal(getOriginalForms().length, 1);
  assert.equal(result.item.originalForms[0]?.formType, 'PDF');
  assert.equal(
    result.item.originalForms[0]?.fillSupportStatus,
    'PREVIEW_SUPPORTED',
  );
  assert.equal(capturedEvent?.actorType, 'SYSTEM');
  assert.doesNotMatch(JSON.stringify(capturedEvent?.metadata), /raw text/i);
  assert.match(
    JSON.stringify(capturedEvent?.metadata),
    /completedSupplierFormsGenerated":false/,
  );
});

test('fill preview download returns persisted safe files and records audit event', async () => {
  const draft = buildStoredFillPreviewDraft();
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftStatus: draft.status,
      draftVersion: draft.profileVersion,
      draftGeneratedAt: new Date(draft.generatedAt),
      draftJson: draft,
      draftSummary: draft.summary,
      originalForms: [buildPersistedOriginalForm()],
    }),
  );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });
  await generateAccountOpeningFillPreview({
    id: 'account-case-1',
    repository,
  });

  const file = await downloadAccountOpeningFillPreviewFile({
    id: 'account-case-1',
    fileName: 'fill-preview.md',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });
  const event = events.find(
    (item) => item.actionType === 'FILL_PREVIEW_FILE_DOWNLOADED',
  );

  assert.equal(file.fileName, 'fill-preview.md');
  assert.match(file.content, /Internal preview only/);
  assert.doesNotMatch(file.content, /12345678/);
  assert.doesNotMatch(file.content, /12-34-56/);
  assert.equal(event?.actionType, 'FILL_PREVIEW_FILE_DOWNLOADED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /AMBE LTD/);
});

test('binary fill preview fills only reviewed low-risk PDF fields and leaves blocked fields blank', async () => {
  const draft = buildStoredFillPreviewDraft();
  const pdfBytes = await buildFillableAccountOpeningPdfBytes();
  const { repository, events, getBinaryFillPreviews } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
        originalForms: [
          buildPersistedOriginalForm({
            localBlobAvailable: true,
            detectedFieldCount: 4,
          }),
        ],
      }),
    );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'Bank Account Number',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'bankDetails',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'Director Signature',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'signature',
        status: 'MAPPED_SAFE',
      },
      {
        supplierFieldLabel: 'GPhC Premises Number',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'gphcPremisesNumber',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningBinaryFillPreview({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    originalFormBytesLoader: async () => ({
      status: 'AVAILABLE',
      bytes: pdfBytes,
    }),
  });
  const generatedEvent = events.find(
    (item) => item.actionType === 'BINARY_FILL_PREVIEW_GENERATED',
  );

  assert.equal(result.preview.status, 'GENERATED_FOR_REVIEW');
  assert.equal(result.preview.binaryPreviewFileName, 'binary-fill-preview.pdf');
  assert.equal(result.preview.binaryPreviewContentType, 'application/pdf');
  assert.equal(result.preview.binaryPreviewBytesAvailable, true);
  assert.equal(result.preview.filledFieldCount, 1);
  assert.equal(result.preview.blankFieldCount, 3);
  assert.equal(getBinaryFillPreviews().length, 1);
  assert.equal(
    result.item.latestBinaryFillPreview?.status,
    'GENERATED_FOR_REVIEW',
  );
  assert.equal(generatedEvent?.actionType, 'BINARY_FILL_PREVIEW_GENERATED');
  assert.doesNotMatch(JSON.stringify(generatedEvent?.metadata), /12345678/);
  assert.doesNotMatch(JSON.stringify(generatedEvent?.metadata), /12-34-56/);
  assert.match(
    JSON.stringify(generatedEvent?.metadata),
    /sharePointCompletedFormFiled":false/,
  );
  assert.match(
    JSON.stringify(generatedEvent?.metadata),
    /purchaseWorkflowTriggered":false/,
  );

  const file = await downloadAccountOpeningBinaryFillPreviewFile({
    id: 'account-case-1',
    fileName: 'binary-fill-preview.pdf',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });
  const outputDocument = await PDFDocument.load(file.content);
  const outputForm = outputDocument.getForm();
  const downloadedEvent = events.find(
    (item) => item.actionType === 'BINARY_FILL_PREVIEW_DOWNLOADED',
  );

  assert.equal(file.contentType, 'application/pdf');
  assert.equal(outputForm.getTextField('Company Name').getText(), 'AMBE LTD');
  assert.equal(
    outputForm.getTextField('Bank Account Number').getText() ?? '',
    '',
  );
  assert.equal(
    outputForm.getTextField('Director Signature').getText() ?? '',
    '',
  );
  assert.equal(
    outputForm.getTextField('GPhC Premises Number').getText() ?? '',
    '',
  );
  assert.equal(downloadedEvent?.actionType, 'BINARY_FILL_PREVIEW_DOWNLOADED');
  assert.doesNotMatch(JSON.stringify(downloadedEvent?.metadata), /12345678/);
});

test('binary fill preview returns unsupported when original bytes are unavailable', async () => {
  const draft = buildStoredFillPreviewDraft();
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftStatus: draft.status,
      draftVersion: draft.profileVersion,
      draftGeneratedAt: new Date(draft.generatedAt),
      draftJson: draft,
      draftSummary: draft.summary,
      originalForms: [buildPersistedOriginalForm()],
    }),
  );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningBinaryFillPreview({
    id: 'account-case-1',
    repository,
    originalFormBytesLoader: async () => ({
      status: 'UNAVAILABLE',
      reason: 'No reviewed original form byte loader is configured.',
    }),
  });
  const event = events.find(
    (item) => item.actionType === 'BINARY_FILL_PREVIEW_UNSUPPORTED',
  );

  assert.equal(result.preview.status, 'UNSUPPORTED');
  assert.equal(result.preview.binaryPreviewBytesAvailable, false);
  assert.match(
    result.preview.unsupportedReason ?? '',
    /No reviewed original form byte loader/,
  );
  assert.equal(event?.actionType, 'BINARY_FILL_PREVIEW_UNSUPPORTED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /raw file/i);
});

test('binary fill preview rejects oversized original bytes before PDF loading', async () => {
  assert.ok(MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES > 0);
  assert.ok(MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES > 0);

  const draft = buildStoredFillPreviewDraft();
  const pdfBytes = await buildFillableAccountOpeningPdfBytes();
  const { repository, events, getBinaryFillPreviews } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
        originalForms: [
          buildPersistedOriginalForm({
            localBlobAvailable: true,
            detectedFieldCount: 4,
          }),
        ],
      }),
    );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningBinaryFillPreview({
    id: 'account-case-1',
    repository,
    originalFormBytesLoader: async () => ({
      status: 'AVAILABLE',
      bytes: pdfBytes,
    }),
    sizeLimits: {
      maxOriginalBytes: pdfBytes.byteLength - 1,
    },
  });
  const event = events.find(
    (item) => item.actionType === 'BINARY_FILL_PREVIEW_UNSUPPORTED',
  );

  assert.equal(result.preview.status, 'UNSUPPORTED');
  assert.equal(result.preview.binaryPreviewBytesAvailable, false);
  assert.match(result.preview.unsupportedReason ?? '', /size limit/);
  assert.equal(getBinaryFillPreviews()[0]?.binaryPreviewBytes, null);
  assert.equal(event?.actionType, 'BINARY_FILL_PREVIEW_UNSUPPORTED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /binaryPreviewBytes/);
  assert.doesNotMatch(JSON.stringify(event?.metadata), /%PDF/);
});

test('binary fill preview does not persist oversized generated preview bytes', async () => {
  const draft = buildStoredFillPreviewDraft();
  const pdfBytes = await buildFillableAccountOpeningPdfBytes();
  const { repository, events, getBinaryFillPreviews } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: draft,
        draftSummary: draft.summary,
        originalForms: [
          buildPersistedOriginalForm({
            localBlobAvailable: true,
            detectedFieldCount: 4,
          }),
        ],
      }),
    );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningBinaryFillPreview({
    id: 'account-case-1',
    repository,
    originalFormBytesLoader: async () => ({
      status: 'AVAILABLE',
      bytes: pdfBytes,
    }),
    sizeLimits: {
      maxGeneratedPreviewBytes: 1,
    },
  });
  const previewRows = getBinaryFillPreviews();
  const event = events.find(
    (item) => item.actionType === 'BINARY_FILL_PREVIEW_FAILED',
  );

  assert.equal(result.preview.status, 'FAILED');
  assert.equal(result.preview.binaryPreviewBytesAvailable, false);
  assert.equal(previewRows[0]?.binaryPreviewBytes, null);
  assert.match(result.preview.unsupportedReason ?? '', /storage size limit/);
  assert.equal(event?.actionType, 'BINARY_FILL_PREVIEW_FAILED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /binaryPreviewBytes/);
  assert.doesNotMatch(JSON.stringify(event?.metadata), /%PDF/);
  assert.match(
    JSON.stringify(event?.metadata),
    /rawFileContentsIncluded":false/,
  );
});

test('binary fill preview requires manual completion for flat PDFs without AcroForm fields', async () => {
  const draft = buildStoredFillPreviewDraft();
  const flatPdf = await PDFDocument.create();
  flatPdf.addPage([400, 400]);
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftStatus: draft.status,
      draftVersion: draft.profileVersion,
      draftGeneratedAt: new Date(draft.generatedAt),
      draftJson: draft,
      draftSummary: draft.summary,
      originalForms: [buildPersistedOriginalForm({ localBlobAvailable: true })],
    }),
  );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningBinaryFillPreview({
    id: 'account-case-1',
    repository,
    originalFormBytesLoader: async () => ({
      status: 'AVAILABLE',
      bytes: await flatPdf.save(),
    }),
  });
  const event = events.find(
    (item) => item.actionType === 'BINARY_FILL_PREVIEW_UNSUPPORTED',
  );

  assert.equal(result.preview.status, 'REQUIRES_MANUAL_COMPLETION');
  assert.equal(result.preview.binaryPreviewBytesAvailable, false);
  assert.match(result.preview.unsupportedReason ?? '', /no AcroForm fields/i);
  assert.equal(event?.actionType, 'BINARY_FILL_PREVIEW_UNSUPPORTED');
});

test('binary fill preview keeps DOCX unsupported until layout-safe filling exists', async () => {
  const draft = buildStoredFillPreviewDraft();
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftStatus: draft.status,
      draftVersion: draft.profileVersion,
      draftGeneratedAt: new Date(draft.generatedAt),
      draftJson: draft,
      draftSummary: draft.summary,
      originalForms: [
        buildPersistedOriginalForm({
          fileName: 'supplier-account-opening-form.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          formType: 'WORD',
          fillSupportStatus: 'UNSUPPORTED',
          localBlobAvailable: true,
        }),
      ],
    }),
  );

  await saveAccountOpeningFieldMappings({
    id: 'account-case-1',
    mappings: [
      {
        supplierFieldLabel: 'Company Name',
        sourceType: 'OPERATOR_CREATED',
        mappedDraftFieldKey: 'legalCompanyName',
        status: 'MAPPED_SAFE',
      },
    ],
    repository,
  });

  const result = await generateAccountOpeningBinaryFillPreview({
    id: 'account-case-1',
    repository,
    originalFormBytesLoader: async () => ({
      status: 'AVAILABLE',
      bytes: new Uint8Array([80, 75, 3, 4]),
    }),
  });

  assert.equal(result.preview.status, 'UNSUPPORTED');
  assert.match(
    result.preview.unsupportedReason ?? '',
    /DOCX binary fill preview is not enabled/,
  );
  assert.equal(result.preview.binaryPreviewBytesAvailable, false);
});

test('readiness blocks when no original form is available', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [buildPersistedFieldMapping()],
      originalForms: [],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });

  assert.equal(readiness?.status, 'RED');
  assert.ok(
    readiness?.blockerTexts.includes('No original form reference is present.'),
  );
  assert.equal(readiness?.documentLifecycle.originalFormCount, 0);
  assert.equal(readiness?.documentLifecycle.canAttemptBinaryPreview, false);
  assert.equal(
    readiness?.documentLifecycle.nextAction,
    'Capture the supplier original form reference.',
  );
});

test('readiness lifecycle blocks PDF references without retrievable bytes', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [buildPersistedFieldMapping()],
      sourceEvidence: [buildPersistedSourceEvidence()],
      originalForms: [
        buildPersistedOriginalForm({
          detectedFieldCount: 4,
          storageDriveItemId: null,
          storageFileUrl: null,
          localBlobAvailable: false,
        }),
      ],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });
  const lifecycle = readiness?.documentLifecycle.forms[0];

  assert.equal(readiness?.documentLifecycle.canAttemptBinaryPreview, false);
  assert.equal(lifecycle?.sourceEvidenceCaptured, true);
  assert.equal(lifecycle?.textExtractionStatus, 'TEXT_EXTRACTED');
  assert.equal(lifecycle?.originalBytesRetrievable, false);
  assert.equal(
    lifecycle?.originalBytesRetrievalStatus,
    'MISSING_BYTES_REFERENCE',
  );
  assert.match(
    lifecycle?.primaryBlocker ?? '',
    /Original form bytes are not retrievable/,
  );
});

test('readiness blocks when reviewed field mappings are not saved', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [],
      originalForms: [buildPersistedOriginalForm({ detectedFieldCount: 4 })],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });

  assert.equal(readiness?.status, 'RED');
  assert.ok(
    readiness?.blockerTexts.includes(
      'Reviewed field mappings have not been saved.',
    ),
  );
  assert.equal(readiness?.counts.safeMappedFields, 0);
});

test('readiness blocks when original form type is unsupported', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [buildPersistedFieldMapping()],
      originalForms: [
        buildPersistedOriginalForm({
          formType: 'WORD',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName: 'supplier-account-opening-form.docx',
          detectedFieldCount: null,
        }),
      ],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });

  assert.equal(readiness?.status, 'RED');
  assert.ok(
    readiness?.blockerTexts.includes(
      'Only fillable PDF AcroForms are supported for binary preview.',
    ),
  );
});

test('readiness blocks when SharePoint or Microsoft Drive storage is disabled', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [buildPersistedFieldMapping()],
      originalForms: [buildPersistedOriginalForm({ detectedFieldCount: 4 })],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      completedFormFilings: [
        buildPersistedCompletedFormFiling({
          status: 'APPROVED_FOR_FILING',
          filedAt: null,
          filedByType: null,
          filedByIdentifier: null,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
        }),
      ],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: disabledStorageConfig,
  });

  assert.equal(readiness?.status, 'RED');
  assert.ok(
    readiness?.blockerTexts.some((blocker) =>
      blocker.includes('account-opening upload is disabled'),
    ),
  );
});

test('readiness passes when binary preview is approved and filed', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [buildPersistedFieldMapping()],
      originalForms: [buildPersistedOriginalForm({ detectedFieldCount: 4 })],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      completedFormFilings: [buildPersistedCompletedFormFiling()],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });

  assert.equal(readiness?.status, 'GREEN');
  assert.equal(readiness?.readyForEndToEndFillingAndFiling, true);
  assert.deepEqual(readiness?.blockerTexts, []);
  assert.equal(readiness?.documentLifecycle.canAttemptBinaryPreview, true);
  assert.equal(readiness?.documentLifecycle.canDownloadBinaryPreview, true);
  assert.equal(
    readiness?.documentLifecycle.completedUnsignedFilingStatus,
    'FILED',
  );
  assert.equal(
    readiness?.documentLifecycle.forms[0]?.binaryPreviewStatus,
    'GENERATED_FOR_REVIEW',
  );
  assert.equal(
    readiness?.documentLifecycle.forms[0]?.completedUnsignedFilingStatus,
    'FILED',
  );
});

test('readiness lifecycle exposes approved completed unsigned form as fileable', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [buildPersistedFieldMapping()],
      originalForms: [buildPersistedOriginalForm({ detectedFieldCount: 4 })],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      completedFormFilings: [
        buildPersistedCompletedFormFiling({
          status: 'APPROVED_FOR_FILING',
          filedAt: null,
          filedByType: null,
          filedByIdentifier: null,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
        }),
      ],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });

  assert.equal(
    readiness?.documentLifecycle.completedUnsignedFilingStatus,
    'APPROVED_FOR_FILING',
  );
  assert.equal(readiness?.documentLifecycle.canFileCompletedUnsignedForm, true);
  assert.equal(
    readiness?.documentLifecycle.forms[0]?.completedUnsignedFilingStatus,
    'APPROVED_FOR_FILING',
  );
});

test('readiness lifecycle reflects skipped and failed filing statuses safely', async () => {
  for (const status of ['FILING_SKIPPED', 'FILING_FAILED']) {
    const { repository } = createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
        fieldMappings: [buildPersistedFieldMapping()],
        originalForms: [buildPersistedOriginalForm({ detectedFieldCount: 4 })],
        binaryFillPreviews: [buildPersistedBinaryFillPreview()],
        completedFormFilings: [
          buildPersistedCompletedFormFiling({
            status,
            filedAt: null,
            storageProvider: null,
            storageFolderUrl: null,
            storageFileUrl: null,
            storageDriveItemId: null,
            skippedReason: `${status} without sensitive text.`,
          }),
        ],
      }),
    );

    const readiness = await getAccountOpeningReadinessReport({
      id: 'account-case-1',
      repository,
      storageConfig: enabledStorageConfig,
    });

    assert.equal(
      readiness?.documentLifecycle.completedUnsignedFilingStatus,
      status,
    );
    assert.equal(
      readiness?.documentLifecycle.forms[0]?.completedUnsignedFilingStatus,
      status,
    );
    assert.equal(
      readiness?.documentLifecycle.canFileCompletedUnsignedForm,
      false,
    );
  }
});

test('readiness response excludes sensitive account-opening data', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      subject:
        'Account number 12345678 sort code 12-34-56 account-opening form',
      extractedTextSummary:
        'Supplier form includes account number 12345678 and sort code 12-34-56.',
      draftJson: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
      fieldMappings: [
        buildPersistedFieldMapping({
          operatorNote: 'Bank account number 12345678 and sort code 12-34-56.',
        }),
      ],
      originalForms: [buildPersistedOriginalForm({ detectedFieldCount: 4 })],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      completedFormFilings: [
        buildPersistedCompletedFormFiling({
          approvalNote:
            'Approved despite account number 12345678 and sort code 12-34-56 being present elsewhere.',
          filingNote:
            'Filed with bank account number 12345678 and sort code 12-34-56 redacted from diagnostics.',
        }),
      ],
    }),
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: 'account-case-1',
    repository,
    storageConfig: enabledStorageConfig,
  });
  const readinessText = JSON.stringify(readiness);

  assert.doesNotMatch(readinessText, /12345678/);
  assert.doesNotMatch(readinessText, /12-34-56/);
  assert.equal(readiness?.safety.binaryBytesIncluded, false);
  assert.equal(readiness?.safety.rawExtractedTextIncluded, false);
  assert.equal(readiness?.safety.bankDetailsIncluded, false);
  assert.equal(readiness?.safety.sortCodesIncluded, false);
  assert.equal(
    readiness?.documentLifecycle.safety.rawExtractedTextIncluded,
    false,
  );
  assert.equal(readiness?.documentLifecycle.safety.binaryBytesIncluded, false);
  assert.equal(readiness?.documentLifecycle.safety.bankDetailsIncluded, false);
});

test('completed unsigned form approval requires an existing generated preview', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  await assert.rejects(
    () =>
      approveAccountOpeningCompletedFormFiling({
        id: 'account-case-1',
        repository,
      }),
    /Generate a binary fill preview/,
  );
  await assert.rejects(
    () =>
      approveAccountOpeningCompletedFormFiling({
        id: 'account-case-1',
        binaryFillPreviewId: 'missing-preview',
        repository,
      }),
    /binary fill preview not found/i,
  );
});

test('completed unsigned form approval rejects previews from another case', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      binaryFillPreviews: [
        buildPersistedBinaryFillPreview({
          accountOpeningCaseId: 'other-account-case',
        }),
      ],
    }),
  );

  await assert.rejects(
    () =>
      approveAccountOpeningCompletedFormFiling({
        id: 'account-case-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        repository,
      }),
    /does not belong to this case/,
  );
});

test('completed unsigned form approval rejects unsupported or failed previews', async () => {
  const { repository } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      binaryFillPreviews: [
        buildPersistedBinaryFillPreview({
          status: 'FAILED',
          binaryPreviewBytes: null,
          binaryPreviewFileName: null,
          binaryPreviewContentType: null,
        }),
      ],
    }),
  );

  await assert.rejects(
    () =>
      approveAccountOpeningCompletedFormFiling({
        id: 'account-case-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        repository,
      }),
    /Only generated supported binary PDF AcroForm previews/,
  );
});

test('rejected account-opening case cannot be approved for completed unsigned form filing', async () => {
  const { repository, events, getCompletedFormFilings } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        status: 'REJECTED',
        binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      }),
    );

  await assert.rejects(
    () =>
      approveAccountOpeningCompletedFormFiling({
        id: 'account-case-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        approvalNote:
          'Rejected case note with account number 12345678 and sort code 12-34-56.',
        repository,
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        'Rejected or closed account-opening cases cannot be approved or filed.',
      );
      assert.doesNotMatch(error.message, /12345678/);
      assert.doesNotMatch(error.message, /12-34-56/);
      return true;
    },
  );
  assert.equal(getCompletedFormFilings().length, 0);
  assert.equal(events.length, 0);
});

test('closed account-opening case cannot be approved for completed unsigned form filing', async () => {
  const { repository, events, getCompletedFormFilings } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        status: 'CLOSED',
        binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      }),
    );

  await assert.rejects(
    () =>
      approveAccountOpeningCompletedFormFiling({
        id: 'account-case-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        repository,
      }),
    /Rejected or closed account-opening cases cannot be approved or filed\./,
  );
  assert.equal(getCompletedFormFilings().length, 0);
  assert.equal(events.length, 0);
});

test('completed unsigned form approval records safe approval metadata', async () => {
  const { repository, events, getCompletedFormFilings } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        originalForms: [buildPersistedOriginalForm()],
        binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      }),
    );

  const result = await approveAccountOpeningCompletedFormFiling({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    approvalNote:
      'Operator verified completed unsigned form values for SharePoint only.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-17T10:00:00.000Z'),
  });
  const event = events.find(
    (item) => item.actionType === 'COMPLETED_UNSIGNED_FORM_APPROVED_FOR_FILING',
  );
  const eventText = JSON.stringify(event?.metadata);

  assert.equal(result.filing.status, 'APPROVED_FOR_FILING');
  assert.equal(
    result.item.latestCompletedFormFiling?.status,
    'APPROVED_FOR_FILING',
  );
  assert.equal(getCompletedFormFilings().length, 1);
  assert.equal(event?.actorIdentifier, 'test-reviewer');
  assert.match(eventText, /ACCOUNT_OPENING_APPROVE_COMPLETED_UNSIGNED_FORM/);
  assert.match(eventText, /supplierSubmissionTriggered":false/);
  assert.match(eventText, /purchaseWorkflowTriggered":false/);
  assert.doesNotMatch(eventText, /%PDF/);
  assert.doesNotMatch(eventText, /12345678/);
});

test('rejected account-opening case cannot be filed to SharePoint', async () => {
  let uploadCalled = false;
  const { repository, events, getCompletedFormFilings } =
    createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({
        status: 'REJECTED',
        binaryFillPreviews: [buildPersistedBinaryFillPreview()],
      }),
    );

  await assert.rejects(
    () =>
      fileAccountOpeningCompletedFormToSharePoint({
        id: 'account-case-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        filingNote:
          'Rejected case note with account number 12345678 and sort code 12-34-56.',
        repository,
        storageUploader: {
          uploadCompletedForm: async () => {
            uploadCalled = true;
            return {
              folderUrl: 'https://sharepoint.example/folder',
              fileUrl: 'https://sharepoint.example/file.pdf',
              driveItemId: 'drive-item-1',
            };
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        'Rejected or closed account-opening cases cannot be approved or filed.',
      );
      assert.doesNotMatch(error.message, /12345678/);
      assert.doesNotMatch(error.message, /12-34-56/);
      return true;
    },
  );
  assert.equal(uploadCalled, false);
  assert.equal(getCompletedFormFilings().length, 0);
  assert.equal(events.length, 0);
});

test('completed unsigned form filing skips when approval is missing', async () => {
  let uploadCalled = false;
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      originalForms: [buildPersistedOriginalForm()],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
    }),
  );

  const result = await fileAccountOpeningCompletedFormToSharePoint({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    repository,
    storageUploader: {
      uploadCompletedForm: async () => {
        uploadCalled = true;
        return {
          folderUrl: 'https://sharepoint.example/folder',
          fileUrl: 'https://sharepoint.example/file.pdf',
          driveItemId: 'drive-item-1',
        };
      },
    },
  });
  const event = events.find(
    (item) => item.actionType === 'COMPLETED_UNSIGNED_FORM_FILING_SKIPPED',
  );

  assert.equal(uploadCalled, false);
  assert.equal(result.filing.status, 'FILING_SKIPPED');
  assert.match(result.filing.skippedReason ?? '', /Approve/);
  assert.equal(event?.actionType, 'COMPLETED_UNSIGNED_FORM_FILING_SKIPPED');
  assert.match(
    JSON.stringify(event?.metadata),
    /ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM/,
  );
});

test('completed unsigned form filing skips safely when storage is unavailable', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      originalForms: [buildPersistedOriginalForm()],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
    }),
  );

  await approveAccountOpeningCompletedFormFiling({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    repository,
  });

  const result = await fileAccountOpeningCompletedFormToSharePoint({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    repository,
    storageConfig: {
      provider: 'SHAREPOINT',
      enabled: false,
      siteId: '',
      driveId: '',
      baseFolder: 'Account Opening',
      graphAuthConfigured: false,
    },
  });
  const event = events
    .slice()
    .reverse()
    .find(
      (item) => item.actionType === 'COMPLETED_UNSIGNED_FORM_FILING_SKIPPED',
    );

  assert.equal(result.filing.status, 'FILING_SKIPPED');
  assert.match(result.filing.skippedReason ?? '', /disabled/);
  assert.equal(result.filing.storageFileUrl, null);
  assert.equal(event?.actionType, 'COMPLETED_UNSIGNED_FORM_FILING_SKIPPED');
  assert.match(
    JSON.stringify(event?.metadata),
    /ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM/,
  );
  assert.doesNotMatch(JSON.stringify(event?.metadata), /%PDF/);
});

test('completed unsigned form filing uploads approved preview and is idempotent once filed', async () => {
  let uploadCalls = 0;
  let uploadedFileName = '';
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      originalForms: [buildPersistedOriginalForm()],
      binaryFillPreviews: [buildPersistedBinaryFillPreview()],
    }),
  );

  await approveAccountOpeningCompletedFormFiling({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    approvalNote: 'Approved completed unsigned form for filing.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-17T10:00:00.000Z'),
  });

  const firstResult = await fileAccountOpeningCompletedFormToSharePoint({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    filingNote: 'Internal SharePoint filing only.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    storageConfig: {
      provider: 'SHAREPOINT',
      enabled: true,
      siteId: 'site-1',
      driveId: 'drive-1',
      baseFolder: 'Account Opening',
      graphAuthConfigured: true,
    },
    storageUploader: {
      uploadCompletedForm: async (pack) => {
        uploadCalls += 1;
        uploadedFileName = pack.file.fileName;
        return {
          folderUrl: 'https://sharepoint.example/folder',
          fileUrl: 'https://sharepoint.example/file.pdf',
          driveItemId: 'drive-item-1',
        };
      },
    },
    now: new Date('2026-05-17T10:01:00.000Z'),
  });
  const secondResult = await fileAccountOpeningCompletedFormToSharePoint({
    id: 'account-case-1',
    binaryFillPreviewId: 'binary-fill-preview-1',
    repository,
    storageUploader: {
      uploadCompletedForm: async () => {
        uploadCalls += 1;
        return {
          folderUrl: 'https://sharepoint.example/duplicate',
          fileUrl: 'https://sharepoint.example/duplicate.pdf',
          driveItemId: 'duplicate-drive-item',
        };
      },
    },
  });
  const event = events.find(
    (item) => item.actionType === 'COMPLETED_UNSIGNED_FORM_FILING_COMPLETED',
  );
  const eventText = JSON.stringify(event?.metadata);

  assert.equal(uploadCalls, 1);
  assert.equal(firstResult.filing.status, 'FILED');
  assert.equal(secondResult.filing.status, 'FILED');
  assert.match(uploadedFileName, /completed-unsigned/);
  assert.equal(firstResult.filing.storageProvider, 'SHAREPOINT');
  assert.equal(
    firstResult.filing.storageFileUrl,
    'https://sharepoint.example/file.pdf',
  );
  assert.match(eventText, /supplierSubmissionTriggered":false/);
  assert.match(eventText, /purchaseWorkflowTriggered":false/);
  assert.match(eventText, /ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM/);
  assert.doesNotMatch(eventText, /binaryPreviewBytes/);
  assert.doesNotMatch(eventText, /%PDF/);
});

test('generate draft stores safe draft metadata and records blocked audit route only', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      missingInfoResponses: {
        reviewerNotes: 'Account number 12345678 and sort code 12-34-56.',
      },
      sourceEvidence: [
        {
          id: 'evidence-1',
          sourceType: 'ATTACHMENT',
          sourceLabel: 'account-form.pdf',
          fileName: 'account-form.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          contentId: null,
          disposition: 'attachment',
          extractionMethod: 'PDF_TEXT',
          extractedTextHash: 'hash-1',
          extractedTextChars: 80,
          safeSnippet:
            'Direct Debit mandate with [redacted bank account number] and [redacted sort code].',
          rawFileAvailable: false,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
          createdAt: new Date('2026-05-12T09:00:00.000Z'),
          updatedAt: new Date('2026-05-12T09:00:00.000Z'),
        },
      ],
    }),
  );

  const detail = await generateAccountOpeningDraft({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-15T10:00:00.000Z'),
  });
  const detailText = JSON.stringify(detail);
  const eventTypes = events.map(
    (event) => (event as { actionType?: string }).actionType,
  );

  assert.equal(detail.draftStatus, 'BLOCKED');
  assert.equal(detail.draftVersion, '2026-06-09');
  assert.equal(detail.draftGeneratedAt, '2026-05-15T10:00:00.000Z');
  assert.equal(detail.completionDraft.isStored, true);
  assert.equal(detail.completionDraft.status, 'BLOCKED');
  assert.ok(eventTypes.includes('DRAFT_GENERATED'));
  assert.ok(eventTypes.includes('DRAFT_BLOCKED'));
  assert.ok(eventTypes.includes('POLICY_APPLIED'));
  assert.ok(eventTypes.includes('FIELD_BLOCKED'));
  assert.ok(eventTypes.includes('FIELD_LEFT_BLANK_BY_POLICY'));
  assert.equal(eventTypes.includes('DRAFT_READY_FOR_REVIEW'), false);
  assert.equal(eventTypes.includes('DRAFT_REVIEW_REQUIRED'), false);
  assert.doesNotMatch(detailText, /12345678/);
  assert.doesNotMatch(detailText, /12-34-56/);
});

test('regenerating a draft records DRAFT_REGENERATED', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      draftGeneratedAt: new Date('2026-05-14T10:00:00.000Z'),
    }),
  );

  await generateAccountOpeningDraft({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-15T10:00:00.000Z'),
  });

  assert.equal(
    (events[0] as { actionType?: string }).actionType,
    'DRAFT_REGENERATED',
  );
});

test('blocked draft records generated plus blocked routing only', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'BLOCKED' }),
  });

  assert.deepEqual(eventTypes, [
    'DRAFT_GENERATED',
    'DRAFT_BLOCKED',
    'POLICY_APPLIED',
    'FIELD_BLOCKED',
    'FIELD_LEFT_BLANK_BY_POLICY',
  ]);
});

test('review-required draft records generated plus review-required routing only', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'REVIEW_REQUIRED' }),
  });

  assert.deepEqual(eventTypes, [
    'DRAFT_GENERATED',
    'DRAFT_REVIEW_REQUIRED',
    'POLICY_APPLIED',
    'FIELD_BLOCKED',
    'FIELD_LEFT_BLANK_BY_POLICY',
  ]);
});

test('ready draft records generated plus ready-for-review routing only', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
  });

  assert.deepEqual(eventTypes, [
    'DRAFT_GENERATED',
    'DRAFT_READY_FOR_REVIEW',
    'POLICY_APPLIED',
    'FIELD_BLOCKED',
    'FIELD_LEFT_BLANK_BY_POLICY',
  ]);
});

test('regenerated draft records regenerated plus exactly one routing event', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'BLOCKED' }),
    generatedActionType: 'DRAFT_REGENERATED',
  });

  assert.deepEqual(eventTypes, [
    'DRAFT_REGENERATED',
    'DRAFT_BLOCKED',
    'POLICY_APPLIED',
    'FIELD_BLOCKED',
    'FIELD_LEFT_BLANK_BY_POLICY',
  ]);
});

test('safe review export pack includes review files and records export audit event', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      sourceAttachmentNames: [
        'direct-debit-account-12345678-sort-12-34-56.pdf',
      ],
      sourceEvidence: [
        {
          id: 'evidence-1',
          sourceType: 'ATTACHMENT',
          sourceLabel: 'direct-debit-account-12345678-sort-12-34-56.pdf',
          fileName: 'direct-debit-account-12345678-sort-12-34-56.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          contentId: null,
          disposition: 'attachment',
          extractionMethod: 'PDF_TEXT',
          extractedTextHash: 'hash-1',
          extractedTextChars: 80,
          safeSnippet:
            'Direct Debit mandate with account number 12345678 and sort code 12-34-56.',
          rawFileAvailable: false,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
          createdAt: new Date('2026-05-12T09:00:00.000Z'),
          updatedAt: new Date('2026-05-12T09:00:00.000Z'),
        },
      ],
    }),
  );

  const pack = await exportAccountOpeningReviewedPack({
    id: 'account-case-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-16T10:00:00.000Z'),
  });
  const packText = JSON.stringify(pack);
  const event = events[0];

  assert.deepEqual(pack.metadata.fileNames, [
    'review-pack.json',
    'review-pack.md',
    'completion-draft.json',
    'field-mapping-summary.json',
    'unresolved-fields.json',
    'blocked-fields.json',
    'signing-notes.json',
    'risk-summary.json',
    'source-evidence.json',
    'source-evidence.md',
  ]);
  assert.equal(pack.files.length, pack.metadata.fileNames.length);
  assert.equal(
    pack.files.some((file) => /\.(pdf|docx?|xlsx?)$/i.test(file.fileName)),
    false,
  );
  assert.equal(pack.metadata.rawExtractedTextIncluded, false);
  assert.equal(pack.metadata.rawBankDetailsIncluded, false);
  assert.equal(pack.metadata.signedFormsIncluded, false);
  assert.equal(pack.metadata.completedSupplierFormsIncluded, false);
  assert.equal(pack.metadata.pdfWordFormsFilled, false);
  assert.equal(pack.metadata.supplierMessageIncluded, false);
  assert.equal(pack.metadata.purchaseWorkflowTriggered, false);
  assert.match(
    pack.files.find((file) => file.fileName === 'field-mapping-summary.json')
      ?.content ?? '',
    /safeToFillSupplierForms/,
  );
  assert.doesNotMatch(packText, /12345678/);
  assert.doesNotMatch(packText, /12-34-56/);
  for (const file of pack.files) {
    assert.doesNotMatch(file.content, /12345678/);
    assert.doesNotMatch(file.content, /12-34-56/);
    assert.doesNotMatch(file.content, /raw extracted text":\s*true/i);
    assert.doesNotMatch(file.content, /signed forms included":\s*true/i);
    assert.doesNotMatch(
      file.content,
      /completed supplier forms included":\s*true/i,
    );
  }
  assert.equal(event?.actionType, 'SAFE_REVIEW_EXPORT_PACK_EXPORTED');
  assert.doesNotMatch(JSON.stringify(event?.metadata), /12345678/);
  assert.doesNotMatch(JSON.stringify(event?.metadata), /12-34-56/);
  assert.doesNotMatch(JSON.stringify(event?.metadata), /This does not sign/);
});

test('safe review export file download records file audit event', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  const file = await downloadAccountOpeningReviewedExportFile({
    id: 'account-case-1',
    fileName: 'review-pack.md',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    now: new Date('2026-05-16T10:00:00.000Z'),
  });
  const event = events[0];

  assert.equal(file.fileName, 'review-pack.md');
  assert.match(file.content, /This does not sign the form\./);
  assert.match(file.content, /This does not send anything to the supplier\./);
  assert.match(file.content, /This does not submit the form\./);
  assert.match(file.content, /This does not fill PDF\/Word supplier forms\./);
  assert.equal(event?.actionType, 'SAFE_REVIEW_EXPORT_FILE_DOWNLOADED');
  assert.match(JSON.stringify(event?.metadata), /review-pack\.md/);
});

test('approve for completion changes status and records skipped storage when disabled', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'APPROVED_FOR_COMPLETION',
    note: 'Ready for human completion only.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    storageConfig: {
      provider: 'SHAREPOINT',
      enabled: false,
      siteId: '',
      driveId: '',
      baseFolder: 'Account Opening',
      graphAuthConfigured: false,
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(detail.status, 'APPROVED_FOR_COMPLETION');
  assert.equal(detail.storageStatus, 'SKIPPED_DISABLED');
  assert.match(detail.storageNote ?? '', /upload skipped/i);
  assert.equal(detail.storageLastAttemptAt, '2026-05-12T10:00:00.000Z');
  assert.equal(
    (events[0] as { actionType?: string }).actionType,
    'APPROVED_FOR_COMPLETION',
  );
  assert.equal(
    (events[0] as { newStatus?: string }).newStatus,
    'APPROVED_FOR_COMPLETION',
  );
  assert.equal(
    (events[1] as { actionType?: string }).actionType,
    'MICROSOFT_DRIVE_ARCHIVE_SKIPPED',
  );
});

test('approve for completion calls enabled storage adapter with safe archive payload', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({
      missingInfoResponses: {
        reviewerNotes: 'Account number 12345678 and sort code 12-34-56.',
      },
      sourceAttachmentNames: ['mandate-account-12345678-sort-12-34-56.pdf'],
    }),
  );
  let uploadedPackText = '';

  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'APPROVED_FOR_COMPLETION',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    storageConfig: {
      provider: 'SHAREPOINT',
      enabled: true,
      siteId: 'site-1',
      driveId: 'drive-1',
      baseFolder: 'Account Opening',
      graphAuthConfigured: true,
    },
    storageUploader: {
      uploadArchivePack: async (pack) => {
        uploadedPackText = JSON.stringify(pack);
        return {
          folderUrl: 'https://sharepoint.example/folder',
          uploadedFileNames: pack.files.map((file) => file.fileName),
        };
      },
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(detail.storageStatus, 'UPLOADED');
  assert.equal(detail.storageFolderUrl, 'https://sharepoint.example/folder');
  assert.match(uploadedPackText, /signing-notes\.json/);
  assert.match(uploadedPackText, /risk-summary\.json/);
  assert.match(uploadedPackText, /missing-info\.json/);
  assert.doesNotMatch(uploadedPackText, /12345678/);
  assert.doesNotMatch(uploadedPackText, /12-34-56/);
  assert.equal(
    (events[1] as { actionType?: string }).actionType,
    'MICROSOFT_DRIVE_ARCHIVE_UPLOADED',
  );
});

test('mark needs info changes account-opening status and records review event', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'MARKED_NEEDS_INFO',
    note: 'Website and GPhC number needed.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });

  assert.equal(detail.status, 'NEEDS_INFO');
  assert.equal(
    (events[0] as { actionType?: string }).actionType,
    'MARKED_NEEDS_INFO',
  );
  assert.equal((events[0] as { newStatus?: string }).newStatus, 'NEEDS_INFO');
});

test('reject changes account-opening status without send/sign/upload side effects', async () => {
  const { repository, events } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase(),
  );

  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'REJECTED',
    note: 'Not suitable.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });

  assert.equal(detail.status, 'REJECTED');
  assert.equal((events[0] as { actionType?: string }).actionType, 'REJECTED');
  assert.equal((events[0] as { newStatus?: string }).newStatus, 'REJECTED');
});

test('buildAccountOpeningCaseListQueryArgs filters by status and clamps the limit', () => {
  assert.deepEqual(buildAccountOpeningCaseListQueryArgs(), {
    where: {},
    take: 100,
  });
  assert.deepEqual(
    buildAccountOpeningCaseListQueryArgs({
      statuses: ['PENDING_REVIEW', 'NEEDS_INFO'],
      limit: 5,
    }),
    { where: { status: { in: ['PENDING_REVIEW', 'NEEDS_INFO'] } }, take: 5 },
  );
  // Over/under-sized limits are clamped to [1, 200].
  assert.equal(buildAccountOpeningCaseListQueryArgs({ limit: 9999 }).take, 200);
  assert.equal(buildAccountOpeningCaseListQueryArgs({ limit: 0 }).take, 1);
  // A search widens the scan window before in-memory filtering.
  assert.equal(
    buildAccountOpeningCaseListQueryArgs({ search: 'ambe', limit: 5 }).take,
    200,
  );
});

test('accountOpeningCaseMatchesSearch matches counterparty, subject and email case-insensitively', () => {
  const accountCase = buildPersistedAccountOpeningCase();
  assert.equal(accountOpeningCaseMatchesSearch(accountCase, 'AMBE'), true);
  assert.equal(
    accountOpeningCaseMatchesSearch(accountCase, 'supplier.co.uk'),
    true,
  );
  assert.equal(accountOpeningCaseMatchesSearch(accountCase, 'opening'), true);
  assert.equal(
    accountOpeningCaseMatchesSearch(accountCase, 'no-match-xyz'),
    false,
  );
  // An empty needle matches everything (no filter applied).
  assert.equal(accountOpeningCaseMatchesSearch(accountCase, '  '), true);
});

test('toAccountOpeningCaseListItem projects a safe read-only summary with derived hints', () => {
  const supplierItem = toAccountOpeningCaseListItem(
    buildPersistedAccountOpeningCase(),
  );
  assert.equal(supplierItem.id, 'account-case-1');
  assert.equal(supplierItem.companyName, 'AMBE LTD');
  assert.equal(supplierItem.counterpartyEmail, 'forms@supplier.co.uk');
  assert.equal(supplierItem.status, 'PENDING_REVIEW');
  assert.equal(supplierItem.recommendedSigner, 'Aman Dhillon');
  assert.equal(supplierItem.riskFlagCount, 3);
  assert.equal(supplierItem.riskFlagLabels.length, 3);
  // messageId present => derived EMAIL channel.
  assert.equal(supplierItem.sourceChannel, 'EMAIL');
  assert.equal(supplierItem.receivedAt, '2026-05-12T09:00:00.000Z');
  // Plain "account opening form" wording yields no supplier/customer hint.
  assert.equal(supplierItem.caseTypeHint, 'UNKNOWN');

  // caseTypeHint derives SUPPLIER / CUSTOMER from form type or subject wording.
  assert.equal(
    toAccountOpeningCaseListItem(
      buildPersistedAccountOpeningCase({
        detectedFormType: 'supplier account application',
      }),
    ).caseTypeHint,
    'SUPPLIER',
  );
  assert.equal(
    toAccountOpeningCaseListItem(
      buildPersistedAccountOpeningCase({
        detectedFormType: null,
        subject: 'Customer account opening',
      }),
    ).caseTypeHint,
    'CUSTOMER',
  );

  // No email message id => derived MANUAL channel.
  assert.equal(
    toAccountOpeningCaseListItem(
      buildPersistedAccountOpeningCase({ messageId: null }),
    ).sourceChannel,
    'MANUAL',
  );
});

test('status transition is blocked for rejected or closed cases (no re-approval, no archive upload)', async () => {
  for (const terminalStatus of ['REJECTED', 'CLOSED'] as const) {
    const { repository, events } = createAccountOpeningRepository(
      buildPersistedAccountOpeningCase({ status: terminalStatus }),
    );

    await assert.rejects(
      () =>
        updateAccountOpeningCaseStatus({
          id: 'account-case-1',
          action: 'APPROVED_FOR_COMPLETION',
          repository,
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /cannot change status/i);
        return true;
      },
    );

    // The guard runs before any write, so no status change, event, or archive
    // upload side effect occurs.
    assert.equal(events.length, 0);
  }
});

test('a non-terminal case can still transition normally', async () => {
  const { repository, events, getCurrent } = createAccountOpeningRepository(
    buildPersistedAccountOpeningCase({ status: 'PENDING_REVIEW' }),
  );

  await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'MARKED_NEEDS_INFO',
    repository,
  });

  assert.equal(getCurrent().status, 'NEEDS_INFO');
  assert.equal((events[0] as { newStatus?: string }).newStatus, 'NEEDS_INFO');
});

test('createManualAccountOpeningCase builds a safe review-first case and records an audit event', async () => {
  const persistInputs: AccountOpeningCasePersistenceInput[] = [];
  const events: AccountOpeningCaseEventInput[] = [];

  const created = await createManualAccountOpeningCase(
    {
      counterpartyName: '  Example Supplier Ltd  ',
      counterpartyEmail: 'forms@supplier.test',
      caseType: 'SUPPLIER_ONBOARDING',
      internalNote:
        'Forwarded via WhatsApp. Account number 12345678 mentioned.',
      actorType: 'OPERATOR',
      actorIdentifier: 'operator-1',
    },
    {
      persist: async (input) => {
        persistInputs.push(input);
        return { id: 'manual-1' };
      },
      recordEvent: async (event) => {
        events.push(event);
      },
      getDetail: async (id) =>
        ({
          id,
          companyName: 'Example Supplier Ltd',
          status: 'PENDING_REVIEW',
        }) as unknown as AccountOpeningCaseDetail,
      generateUniqueSuffix: () => 'uuid-123',
    },
  );

  const persisted = persistInputs[0]!;
  // Authoritative intake metadata is persisted.
  assert.equal(persisted.caseType, 'SUPPLIER_ONBOARDING');
  assert.equal(persisted.sourceChannel, 'MANUAL');
  // Deterministic, prefixed source fingerprint.
  assert.equal(
    persisted.accountCase.sourceFingerprint,
    'manual:example-supplier-ltd:uuid-123',
  );
  // Counterparty name is the display company name; signer defaults to Aman.
  assert.equal(
    persisted.accountCase.structuredFields.companyName,
    'Example Supplier Ltd',
  );
  assert.equal(
    persisted.accountCase.signingNotes.recommendedSigner,
    'Aman Dhillon',
  );
  // No documents, no invented values, no risk flags.
  assert.equal(persisted.accountCase.sourceEvidence.length, 0);
  assert.equal(
    persisted.accountCase.structuredFields.vatNumber,
    'To be confirmed',
  );
  assert.deepEqual(persisted.accountCase.riskFlags, []);
  // Bank account number in the note is redacted before storage.
  assert.doesNotMatch(
    JSON.stringify(persisted.missingInfoResponses),
    /12345678/,
  );

  // Operator-attributed creation event, also redacted.
  assert.equal(events[0]?.actionType, 'MANUAL_CASE_CREATED');
  assert.equal(events[0]?.actorType, 'OPERATOR');
  assert.equal(events[0]?.actorIdentifier, 'operator-1');
  assert.doesNotMatch(JSON.stringify(events[0]), /12345678/);

  // Echo for the web redirect.
  assert.equal(created.id, 'manual-1');
  assert.equal(created.caseType, 'SUPPLIER_ONBOARDING');
  assert.equal(created.sourceChannel, 'MANUAL');
  assert.equal(created.status, 'PENDING_REVIEW');
});

test('createManualAccountOpeningCase rejects a missing counterparty name without persisting', async () => {
  let persisted = false;
  await assert.rejects(
    () =>
      createManualAccountOpeningCase(
        { counterpartyName: '   ', caseType: 'UNKNOWN' },
        {
          persist: async () => {
            persisted = true;
            return { id: 'should-not-happen' };
          },
        },
      ),
    /counterparty name is required/i,
  );
  assert.equal(persisted, false);
});

test('buildManualAccountOpeningSourceFingerprint is deterministic, prefixed, and collision-free per suffix', () => {
  const a = buildManualAccountOpeningSourceFingerprint({
    counterpartyName: 'Example Supplier Ltd',
    uniqueSuffix: 's1',
  });
  const b = buildManualAccountOpeningSourceFingerprint({
    counterpartyName: 'Example Supplier Ltd',
    uniqueSuffix: 's2',
  });
  assert.equal(a, 'manual:example-supplier-ltd:s1');
  // Same counterparty name, different suffix => different fingerprint (no collision).
  assert.notEqual(a, b);
  // Normalization stays stable/prefixed for messy punctuation and casing.
  assert.equal(
    buildManualAccountOpeningSourceFingerprint({
      counterpartyName: '  Example & Co.!  ',
      uniqueSuffix: 's',
    }),
    'manual:example-co:s',
  );
});

test('toAccountOpeningCaseListItem prefers authoritative caseType/sourceChannel columns', () => {
  const item = toAccountOpeningCaseListItem(
    buildPersistedAccountOpeningCase({
      caseType: 'CUSTOMER_ONBOARDING',
      sourceChannel: 'MANUAL',
      messageId: null,
      detectedFormType: null,
      subject: null,
    }),
  );
  assert.equal(item.caseTypeHint, 'CUSTOMER');
  assert.equal(item.sourceChannel, 'MANUAL');

  // Falls back to the derived hint when the columns are absent (messageId set
  // in the fixture => derived EMAIL channel).
  const derived = toAccountOpeningCaseListItem(
    buildPersistedAccountOpeningCase({ caseType: null, sourceChannel: null }),
  );
  assert.equal(derived.sourceChannel, 'EMAIL');
});
