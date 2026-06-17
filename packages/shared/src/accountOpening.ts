export type AccountOpeningSigningNotes = {
  title: string;
  recommendedSigner: string;
  defaultSigningStatement: string;
  detectedNames: string[];
  detectedRolesOrSections: string[];
  reviewerChecks: string[];
  riskFlags: string[];
  missingOrUnclear: string[];
  signatureInstruction: string;
  summary: string;
};

export type AccountOpeningFieldClass =
  | 'SAFE_AUTOFILL'
  | 'REVIEW_REQUIRED'
  | 'MUST_STAY_BLANK'
  | 'SIGNATURE'
  | 'BANKING'
  | 'DIRECT_DEBIT'
  | 'CREDIT_RISK'
  | 'LEGAL_RISK'
  | 'REGULATORY_DECLARATION'
  | 'STOCKHOLDING'
  | 'UNKNOWN';

export type AccountOpeningPolicyDecisionKind =
  | 'AUTOFILL_ALLOWED'
  | 'REVIEW_REQUIRED'
  | 'MUST_STAY_BLANK';

export type AccountOpeningPolicyRiskCategory =
  | 'LOW_RISK_COMPANY_PROFILE'
  | 'SIGNING'
  | 'BANKING'
  | 'DIRECT_DEBIT'
  | 'CREDIT_RISK'
  | 'LEGAL_RISK'
  | 'REGULATORY'
  | 'STOCKHOLDING'
  | 'UNKNOWN';

export type AccountOpeningPolicyRiskFlag = {
  fieldKey: string;
  supplierLabel: string;
  fieldClass: AccountOpeningFieldClass;
  policyDecision: AccountOpeningPolicyDecisionKind;
  riskCategory: AccountOpeningPolicyRiskCategory;
  reason: string;
  signatoryRoutingNote: string | null;
  signingNote: string | null;
};

export type AccountOpeningMissingInfoResponses = {
  website?: string | null;
  numberOfEmployees?: string | null;
  businessHours?: string | null;
  estimatedMonthlyPurchases?: string | null;
  webOrdering?: string | null;
  directDebitRequested?: string | null;
  cdLicenceApplies?: string | null;
  gphcPremisesNumber?: string | null;
  cqcRegistration?: string | null;
  reviewerNotes?: string | null;
};

export type AccountOpeningDraftField = {
  key: string;
  supplierLabel: string;
  proposedValue: string | null;
  valueSource:
    | 'AMBE_MASTER_PROFILE'
    | 'REVIEWER_RESPONSE'
    | 'EXTRACTED_TEXT'
    | 'SYSTEM_PLACEHOLDER'
    | 'NOT_PROVIDED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
  fieldClass: AccountOpeningFieldClass;
  policyDecision: AccountOpeningPolicyDecisionKind;
  riskCategory: AccountOpeningPolicyRiskCategory;
  policyReason: string;
  signatoryRoutingNote: string | null;
  signingNote: string | null;
  requiresReview: boolean;
  reviewReason: string | null;
  evidence: Array<{
    sourceType:
      | 'MASTER_PROFILE'
      | 'EMAIL_BODY'
      | 'ATTACHMENT_TEXT'
      | 'REVIEWER_INPUT'
      | 'SYSTEM_RULE';
    sourceLabel: string | null;
    snippet: string | null;
  }>;
};

export type AccountOpeningCompletionDraft = {
  status: 'PREVIEW' | 'READY_FOR_REVIEW' | 'REVIEW_REQUIRED' | 'BLOCKED';
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  isStored: boolean;
  profileId: string;
  profileVersion: string;
  generatedAt: string;
  fields: AccountOpeningDraftField[];
  summary: {
    totalFields: number;
    highConfidenceFields: number;
    reviewRequiredFields: number;
    blockedFields: number;
    safeToAutoFill: boolean;
  };
  safetyNotes: string[];
  riskFlags: AccountOpeningPolicyRiskFlag[];
  signingNotes: string[];
};

export type AccountOpeningLifecycleStage =
  | 'RECEIVED'
  | 'CLASSIFYING'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED_FOR_COMPLETION'
  | 'COMPLETION_PREVIEW_GENERATED'
  | 'COMPLETED_UNSIGNED_FILED'
  | 'SENT_MANUALLY'
  | 'REJECTED'
  | 'BLOCKED'
  | 'ARCHIVED';

export type AccountOpeningLifecycleStep = {
  stage: AccountOpeningLifecycleStage;
  label: string;
  status: 'COMPLETE' | 'CURRENT' | 'PENDING' | 'BLOCKED';
};

export type AccountOpeningLifecycleSummary = {
  legacyStatus: string;
  currentStage: AccountOpeningLifecycleStage;
  currentLabel: string;
  nextAction: string;
  steps: AccountOpeningLifecycleStep[];
  compatibilityNotes: string[];
  safety: {
    backwardsCompatibleStatusMapping: true;
    noAutoSign: true;
    noAutoSubmit: true;
    noOutboundSend: true;
  };
};

export type AccountOpeningDocumentClassification = {
  sourceEvidenceId: string | null;
  fileName: string | null;
  classification:
    | 'ACCOUNT_OPENING_FORM'
    | 'GDP_QUESTIONNAIRE'
    | 'TERMS_AND_CONDITIONS'
    | 'CREDIT_APPLICATION'
    | 'DIRECT_DEBIT_MANDATE'
    | 'BANK_MANDATE'
    | 'DIRECTOR_GUARANTEE'
    | 'TRADE_REFERENCES'
    | 'REGULATORY_DECLARATION'
    | 'UNKNOWN_OTHER';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  matchedEvidence: string[];
  missingEvidence: string[];
  warnings: string[];
  safeForAutomaticCompletion: false;
};

export type AccountOpeningCompanyProfileSummary = {
  profileId: string;
  profileVersion: string;
  safeConfiguredFieldCount: number;
  missingProfileFields: string[];
  reviewRequiredFields: string[];
  blockedFields: string[];
  warnings: string[];
  safety: {
    valuesInvented: false;
    bankDetailsIncluded: false;
    directorDetailsIncluded: false;
    regulatoryIdentifiersRequireReview: true;
  };
};

export type AccountOpeningFieldMappingStatus =
  | 'UNMAPPED'
  | 'MAPPED_SAFE'
  | 'MAPPED_REVIEW_REQUIRED'
  | 'BLOCKED'
  | 'IGNORED'
  | 'NEEDS_OPERATOR_INPUT';

export type AccountOpeningFieldMapping = {
  id: string;
  supplierFieldLabel: string;
  supplierSectionLabel: string | null;
  normalizedLabel: string;
  sourceType:
    | 'DRAFT_FIELD'
    | 'SOURCE_EVIDENCE'
    | 'SYSTEM_RULE'
    | 'OPERATOR_CREATED';
  sourceEvidenceId: string | null;
  evidenceSnippet: string | null;
  suggestedDraftFieldKey: string | null;
  mappedDraftFieldKey: string | null;
  proposedValue: string | null;
  valueSource: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
  status: AccountOpeningFieldMappingStatus;
  requiresReview: boolean;
  blockedReason: string | null;
  reviewReason: string | null;
  fieldClass: AccountOpeningFieldClass;
  policyDecision: AccountOpeningPolicyDecisionKind;
  riskCategory: AccountOpeningPolicyRiskCategory;
  policyReason: string;
  signatoryRoutingNote: string | null;
  signingNote: string | null;
  operatorNote: string | null;
};

export type AccountOpeningFieldMappingReview = {
  status: 'PREVIEW' | 'SAVED';
  generatedAt: string;
  mappings: AccountOpeningFieldMapping[];
  summary: {
    totalMappings: number;
    mappedSafe: number;
    reviewRequired: number;
    blocked: number;
    ignored: number;
    unmapped: number;
    needsOperatorInput: number;
    safeToFillSupplierForms: false;
  };
  safetyNotes: string[];
};

export type AccountOpeningFieldMappingSaveInput = {
  id?: string | null;
  supplierFieldLabel: string;
  supplierSectionLabel?: string | null;
  sourceType: AccountOpeningFieldMapping['sourceType'];
  sourceEvidenceId?: string | null;
  evidenceSnippet?: string | null;
  suggestedDraftFieldKey?: string | null;
  mappedDraftFieldKey?: string | null;
  status?: AccountOpeningFieldMappingStatus | null;
  operatorNote?: string | null;
};

export type AccountOpeningSourceEvidence = {
  id: string | null;
  sourceType: string;
  sourceLabel: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  contentId: string | null;
  disposition: string | null;
  extractionMethod: string | null;
  extractedTextHash: string | null;
  extractedTextChars: number | null;
  safeSnippet: string | null;
  rawFileAvailable: boolean;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AccountOpeningSourceEvidenceDetail = AccountOpeningSourceEvidence;

export type AccountOpeningOriginalForm = {
  id: string;
  sourceEvidenceId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  fileHash: string | null;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  localBlobAvailable: boolean;
  formType: string;
  fillSupportStatus: string;
  detectedFieldCount: number | null;
  detectionSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningOriginalFormDetail = AccountOpeningOriginalForm;

export type AccountOpeningFillPreviewDetail = {
  id: string;
  originalFormId: string | null;
  status: string;
  previewVersion: string;
  fileNames: string[];
  summary: Record<string, unknown>;
  safetySummary: Record<string, unknown>;
  generatedAt: string;
  createdByType: string | null;
  createdByIdentifier: string | null;
};

export type AccountOpeningBinaryFillPreviewDetail = {
  id: string;
  originalFormId: string | null;
  status: string;
  previewVersion: string;
  binaryPreviewFileName: string | null;
  binaryPreviewContentType: string | null;
  binaryPreviewHash: string | null;
  binaryPreviewBytesAvailable: boolean;
  filledFieldCount: number;
  blankFieldCount: number;
  unsupportedReason: string | null;
  warnings: string[];
  brandingPreservationCheck: Record<string, unknown>;
  safetySummary: Record<string, unknown>;
  generatedAt: string;
  createdByType: string | null;
  createdByIdentifier: string | null;
};

export type AccountOpeningCompletedFormFilingDetail = {
  id: string;
  binaryFillPreviewId: string;
  status: string;
  fileName: string;
  contentType: string;
  fileHash: string | null;
  fileSizeBytes: number | null;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  approvedByType: string | null;
  approvedByIdentifier: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  filedByType: string | null;
  filedByIdentifier: string | null;
  filedAt: string | null;
  filingNote: string | null;
  skippedReason: string | null;
  safetySummary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningSourceAttachmentReplayPointer = {
  type:
    | 'STORED_SOURCE_EVIDENCE'
    | 'ORIGINAL_FORM_REFERENCE'
    | 'MICROSOFT_DRIVE_ITEM'
    | 'MISSING_REFERENCE';
  label: string;
  storageProvider: string | null;
  storageDriveItemId: string | null;
  storageFileUrl: string | null;
  canReplayFromStoredSource: boolean;
  rawBytesStored: boolean;
};

export type AccountOpeningSourceAttachment = {
  sourceEvidenceId: string | null;
  originalFormId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  extractedTextHash: string | null;
  extractionMethod: string | null;
  rawFileAvailable: boolean;
  classification: AccountOpeningDocumentClassification['classification'] | null;
  classificationConfidence:
    | AccountOpeningDocumentClassification['confidence']
    | null;
  replayPointer: AccountOpeningSourceAttachmentReplayPointer;
  warnings: string[];
};

export type AccountOpeningSourceProvenance = {
  sourceFingerprint: string;
  messageId: string | null;
  subject: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  receivedAt: string | null;
  attachmentCount: number;
  attachments: AccountOpeningSourceAttachment[];
  safety: {
    rawEmailBodyIncluded: false;
    rawExtractedTextIncluded: false;
    attachmentBytesIncluded: false;
    replayUsesStoredSafeEvidence: true;
  };
};

export type AccountOpeningProcessingRun = {
  id: string;
  triggerType: 'INITIAL_INGEST' | 'MANUAL_REPROCESS' | 'RETRY' | string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED' | string;
  startedAt: string;
  finishedAt: string | null;
  warningSummary: string | null;
  errorSummary: string | null;
  diagnostics: Record<string, unknown>;
  actorType: string;
  actorIdentifier: string | null;
};

export type AccountOpeningReadinessStatus = 'GREEN' | 'AMBER' | 'RED';

export type AccountOpeningReadinessCheckKey =
  | 'COMPLETION_DRAFT_STORED'
  | 'REVIEWED_FIELD_MAPPINGS_SAVED'
  | 'ORIGINAL_FORM_REFERENCE_PRESENT'
  | 'ORIGINAL_BYTES_RETRIEVABLE'
  | 'FORM_TYPE_SUPPORTED'
  | 'PDF_ACROFORM_FIELD_COUNT'
  | 'SAFE_MAPPED_FIELDS_COUNT'
  | 'BLOCKED_FIELDS_COUNT'
  | 'BINARY_PREVIEW_GENERATED'
  | 'BINARY_PREVIEW_DOWNLOADED'
  | 'BINARY_PREVIEW_APPROVED'
  | 'SHAREPOINT_DRIVE_CONFIGURED'
  | 'COMPLETED_UNSIGNED_FORM_FILED'
  | 'MISSING_BLOCKERS';

export type AccountOpeningReadinessCheck = {
  key: AccountOpeningReadinessCheckKey;
  label: string;
  status: AccountOpeningReadinessStatus;
  value: string;
  blocker: string | null;
  nextAction: string;
};

export type AccountOpeningOriginalFormLifecycle = {
  originalFormId: string;
  fileName: string;
  sourceEvidenceCaptured: boolean;
  textExtractionStatus:
    | 'TEXT_EXTRACTED'
    | 'NO_TEXT_EXTRACTED'
    | 'METADATA_ONLY';
  extractedTextChars: number | null;
  originalFormReferenceCaptured: true;
  originalBytesRetrievable: boolean;
  originalBytesRetrievalStatus:
    | 'LOCAL_BLOB_AVAILABLE'
    | 'DRIVE_REFERENCE_AVAILABLE'
    | 'DRIVE_REFERENCE_CONFIG_BLOCKED'
    | 'MISSING_BYTES_REFERENCE';
  formType: string;
  binaryFillSupportStatus: string;
  fillablePdfLikely: boolean;
  acroFieldCountKnown: boolean;
  acroFieldCount: number | null;
  binaryPreviewStatus: string | null;
  binaryPreviewDownloadable: boolean;
  completedUnsignedFilingStatus: string | null;
  primaryBlocker: string | null;
  nextAction: string;
};

export type AccountOpeningDocumentLifecycleSummary = {
  originalFormCount: number;
  primaryOriginalFormId: string | null;
  canAttemptBinaryPreview: boolean;
  canDownloadBinaryPreview: boolean;
  canApproveCompletedUnsignedFiling: boolean;
  canFileCompletedUnsignedForm: boolean;
  completedUnsignedFilingStatus: string | null;
  primaryBlocker: string | null;
  nextAction: string;
  forms: AccountOpeningOriginalFormLifecycle[];
  safety: {
    metadataOnly: true;
    rawExtractedTextIncluded: false;
    binaryBytesIncluded: false;
    bankDetailsIncluded: false;
    directDebitMandateValuesIncluded: false;
    signaturesIncluded: false;
    guaranteesIncluded: false;
  };
};

export type AccountOpeningReadinessReport = {
  caseId: string;
  diagnosticCorrelationId: string | null;
  status: AccountOpeningReadinessStatus;
  readyForEndToEndFillingAndFiling: boolean;
  nextAction: string;
  documentLifecycle: AccountOpeningDocumentLifecycleSummary;
  checks: AccountOpeningReadinessCheck[];
  blockerTexts: string[];
  counts: {
    pdfAcroFormFieldCount: number | null;
    safeMappedFields: number;
    blockedFields: number;
  };
  safety: {
    diagnosticOnly: true;
    internalSharePointFilingOnly: true;
    notSigned: true;
    notSent: true;
    notSubmitted: true;
    directDebitBankAuthorityNotCompleted: true;
    guaranteeIndemnityDirectorOnlyNotCompleted: true;
    purchaseWorkflowTriggered: false;
    rawExtractedTextIncluded: false;
    binaryBytesIncluded: false;
    bankDetailsIncluded: false;
    sortCodesIncluded: false;
  };
};

export type AccountOpeningStatusAction =
  | 'MARKED_NEEDS_INFO'
  | 'APPROVED_FOR_COMPLETION'
  | 'REJECTED';

export type AccountOpeningCaseTypeHint = 'SUPPLIER' | 'CUSTOMER' | 'UNKNOWN';

export type AccountOpeningCaseSourceChannel = 'EMAIL' | 'MANUAL';

/**
 * Lightweight read-only projection of an AccountOpeningCase for the dedicated
 * operator list view. This is a summary DTO, NOT a new persistence model.
 * `caseTypeHint` and `sourceChannel` are best-effort derivations from existing
 * fields until the authoritative caseType / sourceChannel columns land in the
 * manual-create PR.
 */
export type AccountOpeningCaseListItem = {
  id: string;
  companyName: string | null;
  counterpartyEmail: string | null;
  counterpartyDomain: string | null;
  subject: string | null;
  detectedFormType: string | null;
  caseTypeHint: AccountOpeningCaseTypeHint;
  status: string;
  recommendedSigner: string;
  riskFlagCount: number;
  riskFlagLabels: string[];
  sourceChannel: AccountOpeningCaseSourceChannel;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningCaseListResponse = {
  items: AccountOpeningCaseListItem[];
  total: number;
  statusFilter: string | null;
};

/** Authoritative onboarding type chosen by an operator on manual case creation. */
export type AccountOpeningCaseType =
  | 'SUPPLIER_ONBOARDING'
  | 'CUSTOMER_ONBOARDING'
  | 'UNKNOWN';

/** Operator-supplied metadata for a manually created account-opening case. */
export type AccountOpeningManualCaseInput = {
  counterpartyName: string;
  counterpartyEmail?: string | null;
  caseType: AccountOpeningCaseType;
  internalNote?: string | null;
};

/** Minimal created-case echo for the web app to redirect to the detail page. */
export type AccountOpeningManualCaseCreated = {
  id: string;
  companyName: string | null;
  caseType: AccountOpeningCaseType;
  sourceChannel: AccountOpeningCaseSourceChannel;
  status: string;
};

export type AccountOpeningCaseDetail = {
  id: string;
  diagnosticCorrelationId: string | null;
  sourceFingerprint: string;
  messageId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  receivedAt: string | null;
  companyName: string | null;
  detectedFormType: string | null;
  status: string;
  recommendedSigner: string;
  signingStatement: string;
  signingExplanation: string | null;
  detectedNames: string[];
  detectedRoles: string[];
  escalationNotes: string[];
  riskFlags: string[];
  policyRiskFlags: AccountOpeningPolicyRiskFlag[];
  policySigningNotes: string[];
  missingFields: string[];
  reviewerChecks: string[];
  signingNotes: AccountOpeningSigningNotes;
  missingInfoResponses: AccountOpeningMissingInfoResponses;
  extractedTextSummary: string | null;
  storageStatus: string | null;
  storageNote: string | null;
  storageSkippedReason: string | null;
  storageLastAttemptAt: string | null;
  storageFolderUrl: string | null;
  sourceAttachmentNames: string[];
  sourceProvenance: AccountOpeningSourceProvenance;
  processingRuns: AccountOpeningProcessingRun[];
  lifecycle: AccountOpeningLifecycleSummary;
  documentClassifications: AccountOpeningDocumentClassification[];
  companyProfile: AccountOpeningCompanyProfileSummary;
  draftStatus: string | null;
  draftVersion: string | null;
  draftGeneratedAt: string | null;
  sourceEvidence: AccountOpeningSourceEvidence[];
  originalForms: AccountOpeningOriginalForm[];
  completionDraft: AccountOpeningCompletionDraft;
  fieldMappings: AccountOpeningFieldMappingReview;
  latestFillPreview: AccountOpeningFillPreviewDetail | null;
  latestBinaryFillPreview: AccountOpeningBinaryFillPreviewDetail | null;
  latestCompletedFormFiling: AccountOpeningCompletedFormFilingDetail | null;
  createdAt: string;
  updatedAt: string;
};
