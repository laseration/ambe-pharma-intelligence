import assert from 'node:assert/strict';
import test from 'node:test';

import { formatEntityLabel } from './index';
import type {
  AccountOpeningCaseDetail,
  AccountOpeningCompletionDraft,
  AccountOpeningReadinessReport,
} from './accountOpening';

const completionDraftFixture = {
  status: 'BLOCKED',
  overallConfidence: 'BLOCKED',
  isStored: true,
  profileId: 'ambe-account-opening-profile',
  profileVersion: '2026-06-09',
  generatedAt: '2026-05-22T10:00:00.000Z',
  fields: [
    {
      key: 'directDebitOrBankAuthority',
      supplierLabel: 'Direct Debit mandate',
      proposedValue: null,
      valueSource: 'NOT_PROVIDED',
      confidence: 'BLOCKED',
      riskLevel: 'BLOCKED',
      fieldClass: 'DIRECT_DEBIT',
      policyDecision: 'MUST_STAY_BLANK',
      riskCategory: 'DIRECT_DEBIT',
      policyReason: 'Direct Debit mandate fields must stay blank.',
      signatoryRoutingNote:
        'Route to Sandeep Patel only if a Director signature, guarantee, bank mandate, or formal director authority is required.',
      signingNote:
        'Direct Debit mandates require separate human review and must not be completed by draft automation.',
      requiresReview: true,
      reviewReason: 'Bank authority fields must remain blank.',
      evidence: [
        {
          sourceType: 'SYSTEM_RULE',
          sourceLabel: 'account-opening safety policy',
          snippet: null,
        },
      ],
    },
  ],
  summary: {
    totalFields: 1,
    highConfidenceFields: 0,
    reviewRequiredFields: 1,
    blockedFields: 1,
    safeToAutoFill: false,
  },
  safetyNotes: ['Sensitive banking and signing fields are blocked.'],
  riskFlags: [
    {
      fieldKey: 'directDebitOrBankAuthority',
      supplierLabel: 'Direct Debit mandate',
      fieldClass: 'DIRECT_DEBIT',
      policyDecision: 'MUST_STAY_BLANK',
      riskCategory: 'DIRECT_DEBIT',
      reason: 'Bank authority fields must remain blank.',
      signatoryRoutingNote:
        'Route to Sandeep Patel only if a Director signature, guarantee, bank mandate, or formal director authority is required.',
      signingNote:
        'Direct Debit mandates require separate human review and must not be completed by draft automation.',
    },
  ],
  signingNotes: [
    'Route to Sandeep Patel only if a Director signature, guarantee, bank mandate, or formal director authority is required.',
  ],
} satisfies AccountOpeningCompletionDraft;

const readinessReportFixture = {
  caseId: 'case-1',
  diagnosticCorrelationId: 'correlation-1',
  status: 'RED',
  readyForEndToEndFillingAndFiling: false,
  nextAction: 'Review blocked fields.',
  documentLifecycle: {
    originalFormCount: 0,
    primaryOriginalFormId: null,
    canAttemptBinaryPreview: false,
    canDownloadBinaryPreview: false,
    canApproveCompletedUnsignedFiling: false,
    canFileCompletedUnsignedForm: false,
    completedUnsignedFilingStatus: null,
    primaryBlocker: 'No original form available.',
    nextAction: 'Attach a safe original form.',
    forms: [],
    safety: {
      metadataOnly: true,
      rawExtractedTextIncluded: false,
      binaryBytesIncluded: false,
      bankDetailsIncluded: false,
      directDebitMandateValuesIncluded: false,
      signaturesIncluded: false,
      guaranteesIncluded: false,
    },
  },
  checks: [
    {
      key: 'BLOCKED_FIELDS_COUNT',
      label: 'Blocked sensitive fields',
      status: 'RED',
      value: '1',
      blocker: 'Sensitive fields are blocked.',
      nextAction: 'Leave blocked fields blank.',
    },
  ],
  blockerTexts: ['Sensitive fields are blocked.'],
  counts: {
    pdfAcroFormFieldCount: null,
    safeMappedFields: 0,
    blockedFields: 1,
  },
  safety: {
    diagnosticOnly: true,
    internalSharePointFilingOnly: true,
    notSigned: true,
    notSent: true,
    notSubmitted: true,
    directDebitBankAuthorityNotCompleted: true,
    guaranteeIndemnityDirectorOnlyNotCompleted: true,
    purchaseWorkflowTriggered: false,
    rawExtractedTextIncluded: false,
    binaryBytesIncluded: false,
    bankDetailsIncluded: false,
    sortCodesIncluded: false,
  },
} satisfies AccountOpeningReadinessReport;

const accountOpeningCaseFixture = {
  id: 'case-1',
  diagnosticCorrelationId: 'correlation-1',
  sourceFingerprint: 'source-fingerprint',
  messageId: 'message-1',
  senderEmail: 'supplier@example.test',
  senderDomain: 'example.test',
  subject: 'Account opening form',
  receivedAt: '2026-05-22T09:00:00.000Z',
  companyName: 'Example Supplier',
  detectedFormType: 'SUPPLIER_ACCOUNT_OPENING',
  status: 'NEEDS_INFO',
  recommendedSigner: 'Aman',
  signingStatement: 'Default signing statement',
  signingExplanation: null,
  detectedNames: [],
  detectedRoles: [],
  escalationNotes: [],
  riskFlags: ['Direct Debit mandate present'],
  policyRiskFlags: completionDraftFixture.riskFlags,
  policySigningNotes: completionDraftFixture.signingNotes,
  missingFields: [],
  reviewerChecks: ['Leave bank fields blank.'],
  signingNotes: {
    title: 'Signing notes',
    recommendedSigner: 'Aman',
    defaultSigningStatement: 'Default signing statement',
    detectedNames: [],
    detectedRolesOrSections: [],
    reviewerChecks: ['Leave bank fields blank.'],
    riskFlags: ['Direct Debit mandate present'],
    missingOrUnclear: [],
    signatureInstruction: 'Do not sign automatically.',
    summary: 'Human review required.',
  },
  missingInfoResponses: {
    website: null,
    numberOfEmployees: null,
    businessHours: null,
    estimatedMonthlyPurchases: null,
    webOrdering: null,
    directDebitRequested: null,
    cdLicenceApplies: null,
    gphcPremisesNumber: null,
    cqcRegistration: null,
    reviewerNotes: null,
  },
  extractedTextSummary: null,
  storageStatus: null,
  storageNote: null,
  storageSkippedReason: null,
  storageLastAttemptAt: null,
  storageFolderUrl: null,
  sourceAttachmentNames: ['account-opening.pdf'],
  sourceProvenance: {
    sourceFingerprint: 'source-fingerprint-1',
    messageId: '<message-1>',
    subject: 'Account opening form',
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    receivedAt: '2026-05-22T09:00:00.000Z',
    attachmentCount: 1,
    attachments: [
      {
        sourceEvidenceId: 'evidence-1',
        originalFormId: 'original-form-1',
        fileName: 'account-opening.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12000,
        checksumSha256: 'sha256-account-opening',
        extractedTextHash: 'text-hash-1',
        extractionMethod: 'PDF_TEXT',
        rawFileAvailable: false,
        classification: 'DIRECT_DEBIT_MANDATE',
        classificationConfidence: 'HIGH',
        replayPointer: {
          type: 'STORED_SOURCE_EVIDENCE',
          label: 'Stored source evidence metadata and safe snippet',
          storageProvider: null,
          storageDriveItemId: null,
          storageFileUrl: null,
          canReplayFromStoredSource: true,
          rawBytesStored: false,
        },
        warnings: [],
      },
    ],
    safety: {
      rawEmailBodyIncluded: false,
      rawExtractedTextIncluded: false,
      attachmentBytesIncluded: false,
      replayUsesStoredSafeEvidence: true,
    },
  },
  processingRuns: [
    {
      id: 'processing-run-1',
      triggerType: 'INITIAL_INGEST',
      status: 'COMPLETED',
      startedAt: '2026-05-22T09:00:00.000Z',
      finishedAt: '2026-05-22T09:00:01.000Z',
      warningSummary: null,
      errorSummary: null,
      diagnostics: {
        sourceEvidenceCount: 1,
        attachmentEvidenceCount: 1,
        replaySource: 'STORED_SOURCE_EVIDENCE',
      },
      actorType: 'SYSTEM',
      actorIdentifier: 'email-account-opening-ingestion',
    },
  ],
  draftStatus: 'BLOCKED',
  draftVersion: '2026-05',
  draftGeneratedAt: '2026-05-22T10:00:00.000Z',
  sourceEvidence: [],
  originalForms: [],
  completionDraft: completionDraftFixture,
  fieldMappings: {
    status: 'PREVIEW',
    generatedAt: '2026-05-22T10:00:00.000Z',
    mappings: [],
    summary: {
      totalMappings: 0,
      mappedSafe: 0,
      reviewRequired: 0,
      blocked: 0,
      ignored: 0,
      unmapped: 0,
      needsOperatorInput: 0,
      safeToFillSupplierForms: false,
    },
    safetyNotes: [],
  },
  latestFillPreview: null,
  latestBinaryFillPreview: null,
  latestCompletedFormFiling: null,
  lifecycle: {
    legacyStatus: 'NEEDS_INFO',
    currentStage: 'NEEDS_REVIEW',
    currentLabel: 'Needs review',
    nextAction: 'Review blocked fields.',
    steps: [],
    compatibilityNotes: [
      'Persisted AccountOpeningStatus values are preserved.',
    ],
    safety: {
      backwardsCompatibleStatusMapping: true,
      noAutoSign: true,
      noAutoSubmit: true,
      noOutboundSend: true,
    },
  },
  documentClassifications: [],
  companyProfile: {
    profileId: 'ambe-account-opening-profile',
    profileVersion: '2026-06-09',
    safeConfiguredFieldCount: 0,
    missingProfileFields: ['Legal company name'],
    reviewRequiredFields: ['Legal company name'],
    blockedFields: ['Bank details'],
    warnings: ['Some profile fields are missing and remain To be confirmed.'],
    safety: {
      valuesInvented: false,
      bankDetailsIncluded: false,
      directorDetailsIncluded: false,
      regulatoryIdentifiersRequireReview: true,
    },
  },
  createdAt: '2026-05-22T09:00:00.000Z',
  updatedAt: '2026-05-22T10:00:00.000Z',
} satisfies AccountOpeningCaseDetail;

test('shared utility formats entity labels', () => {
  assert.equal(
    formatEntityLabel('supplier-1', 'Example Supplier'),
    'Example Supplier (supplier-1)',
  );
});

test('account-opening shared DTO fixtures preserve blocked-field safety contract', () => {
  assert.equal(completionDraftFixture.summary.safeToAutoFill, false);
  assert.equal(completionDraftFixture.fields[0]?.confidence, 'BLOCKED');
  assert.equal(completionDraftFixture.fields[0]?.riskLevel, 'BLOCKED');
  assert.equal(completionDraftFixture.fields[0]?.proposedValue, null);
  assert.equal(completionDraftFixture.fields[0]?.fieldClass, 'DIRECT_DEBIT');
  assert.equal(
    readinessReportFixture.safety.directDebitBankAuthorityNotCompleted,
    true,
  );
  assert.equal(readinessReportFixture.safety.notSigned, true);
  assert.equal(readinessReportFixture.safety.notSubmitted, true);
  assert.equal(accountOpeningCaseFixture.completionDraft.status, 'BLOCKED');
  assert.equal(accountOpeningCaseFixture.policyRiskFlags.length, 1);
});
