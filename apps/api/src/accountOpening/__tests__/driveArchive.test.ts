import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAccountOpeningArchivePack,
  buildAccountOpeningArchiveFolderPath,
  buildAccountOpeningCompletedFormFilingPack,
  buildAccountOpeningCompletedFormFileName,
  buildAccountOpeningCompletedFormFolderPath,
  createGraphDriveArchiveUploader,
  createGraphCompletedFormFilingUploader,
  getDriveArchiveSkippedReason,
  uploadAccountOpeningCompletedFormFiling,
  uploadAccountOpeningArchivePack,
  type AccountOpeningDriveArchiveConfig,
} from '../driveArchive';
import type { AccountOpeningCaseDetail } from '../service';
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

const enabledConfig: AccountOpeningDriveArchiveConfig = {
  provider: 'SHAREPOINT',
  enabled: true,
  siteId: 'site-1',
  driveId: 'drive-1',
  baseFolder: 'Account Opening',
  graphAuthConfigured: true,
};

const disabledConfig: AccountOpeningDriveArchiveConfig = {
  ...enabledConfig,
  enabled: false,
  graphAuthConfigured: false,
};

function buildDetail(
  overrides: Partial<AccountOpeningCaseDetail> = {},
): AccountOpeningCaseDetail {
  const { diagnosticCorrelationId, ...remainingOverrides } = overrides;

  return {
    id: 'account-case-abcdefghi',
    diagnosticCorrelationId: diagnosticCorrelationId ?? null,
    sourceFingerprint: 'fingerprint-1',
    messageId: 'message-1',
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    receivedAt: '2026-05-12T09:00:00.000Z',
    companyName: 'Supplier Ltd',
    detectedFormType: 'account opening form',
    status: 'APPROVED_FOR_COMPLETION',
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
    policyRiskFlags: [],
    policySigningNotes: [],
    missingFields: ['companyNumber', 'vatNumber'],
    reviewerChecks: [
      'Check whether the supplier specifically requires a director-only signature.',
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
        'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default.',
    },
    missingInfoResponses: {
      website: 'https://supplier.example',
      reviewerNotes:
        'Account number 12345678 and sort code 12-34-56 were seen on the mandate.',
    },
    extractedTextSummary:
      'Raw form text said account number 12345678 sort code 12-34-56.',
    storageStatus: null,
    storageNote: null,
    storageSkippedReason: null,
    storageLastAttemptAt: null,
    storageFolderUrl: null,
    sourceAttachmentNames: ['mandate-account-12345678-sort-12-34-56.pdf'],
    sourceProvenance: {
      sourceFingerprint: 'fingerprint-1',
      messageId: 'message-1',
      subject: 'Account opening form',
      senderEmail: 'forms@supplier.co.uk',
      senderDomain: 'supplier.co.uk',
      receivedAt: '2026-05-12T09:00:00.000Z',
      attachmentCount: 1,
      attachments: [
        {
          sourceEvidenceId: 'evidence-1',
          originalFormId: null,
          fileName: 'mandate-account-12345678-sort-12-34-56.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1234,
          checksumSha256: 'hash-1',
          extractedTextHash: 'hash-1',
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
          warnings: [
            'This document type contains review-required or blocked fields and cannot be automatically completed.',
          ],
        },
      ],
      safety: {
        rawEmailBodyIncluded: false,
        rawExtractedTextIncluded: false,
        attachmentBytesIncluded: false,
        replayUsesStoredSafeEvidence: true,
      },
    },
    processingRuns: [],
    lifecycle: {
      legacyStatus: 'APPROVED_FOR_COMPLETION',
      currentStage: 'APPROVED_FOR_COMPLETION',
      currentLabel: 'Approved for completion',
      nextAction: 'Generate a fill preview or binary preview.',
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
    documentClassifications: [
      {
        sourceEvidenceId: 'evidence-1',
        fileName: 'mandate-account-12345678-sort-12-34-56.pdf',
        classification: 'DIRECT_DEBIT_MANDATE',
        confidence: 'HIGH',
        score: 45,
        matchedEvidence: ['Direct Debit mandate wording'],
        missingEvidence: [],
        warnings: [
          'This document type contains review-required or blocked fields and cannot be automatically completed.',
        ],
        safeForAutomaticCompletion: false,
      },
    ],
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
    draftStatus: 'BLOCKED',
    draftVersion: '2026-05-15',
    draftGeneratedAt: '2026-05-15T00:00:00.000Z',
    sourceEvidence: [
      {
        id: 'evidence-1',
        sourceType: 'ATTACHMENT',
        sourceLabel: 'mandate.pdf',
        fileName: 'mandate-account-12345678-sort-12-34-56.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
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
        createdAt: '2026-05-12T09:00:00.000Z',
        updatedAt: '2026-05-12T09:00:00.000Z',
      },
    ],
    originalForms: [],
    completionDraft: {
      status: 'BLOCKED',
      overallConfidence: 'BLOCKED',
      isStored: true,
      profileId: 'ambe-account-opening-profile',
      profileVersion: '2026-06-09',
      generatedAt: '2026-05-15T00:00:00.000Z',
      fields: [
        {
          key: 'bankDetails',
          supplierLabel: 'Bank details',
          proposedValue: null,
          valueSource: 'NOT_PROVIDED',
          confidence: 'BLOCKED',
          riskLevel: 'BLOCKED',
          ...accountOpeningPolicyFields({
            key: 'bankDetails',
            supplierLabel: 'Bank details',
          }),
          requiresReview: true,
          reviewReason: 'Bank details are blocked.',
          evidence: [
            {
              sourceType: 'SYSTEM_RULE',
              sourceLabel: 'Account-opening safety rule',
              snippet: 'Sensitive bank fields stay blocked.',
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
      safetyNotes: [
        'Do not sign, send, submit, or complete blocked sections from this draft.',
      ],
      riskFlags: [],
      signingNotes: [],
    },
    fieldMappings: {
      status: 'PREVIEW',
      generatedAt: '2026-05-15T00:00:00.000Z',
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
      safetyNotes: ['Field mappings are internal review controls only.'],
    },
    latestFillPreview: null,
    latestBinaryFillPreview: null,
    latestCompletedFormFiling: null,
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-05-12T09:00:00.000Z',
    ...remainingOverrides,
  };
}

test('archive folder path uses configured account-opening folder and approved status', () => {
  const folderPath = buildAccountOpeningArchiveFolderPath(
    buildDetail(),
    enabledConfig,
    new Date('2026-05-12T10:00:00.000Z'),
  );

  assert.equal(
    folderPath,
    'Account Opening/Approved/Supplier Ltd - 2026-05-12 - account-',
  );
});

test('archive pack includes safe review JSON files without raw extracted text or bank values', () => {
  const pack = buildAccountOpeningArchivePack(
    buildDetail(),
    enabledConfig,
    new Date('2026-05-12T10:00:00.000Z'),
  );
  const packText = JSON.stringify(pack);

  assert.deepEqual(pack.metadata.fileNames, [
    'signing-notes.json',
    'risk-summary.json',
    'missing-info.json',
    'account-opening-case-summary.json',
    'completion-draft.json',
    'source-evidence.json',
    'original-attachments.json',
  ]);
  assert.equal(pack.metadata.rawExtractedTextIncluded, false);
  assert.equal(pack.metadata.signedFormsIncluded, false);
  assert.equal(pack.metadata.completedSupplierFormsIncluded, false);
  assert.equal(pack.metadata.pdfWordFormsFilled, false);
  assert.equal(pack.metadata.supplierMessageIncluded, false);
  assert.match(packText, /Direct Debit mandate/);
  assert.match(packText, /https:\/\/supplier\.example/);
  assert.doesNotMatch(packText, /Raw form text said/);
  assert.doesNotMatch(packText, /12345678/);
  assert.doesNotMatch(packText, /12-34-56/);
});

test('disabled Microsoft Drive archive path skips without calling adapter', async () => {
  let called = false;
  const result = await uploadAccountOpeningArchivePack({
    item: buildDetail(),
    config: disabledConfig,
    uploader: {
      uploadArchivePack: async () => {
        called = true;
        return {
          folderUrl: 'https://sharepoint.example/folder',
          uploadedFileNames: [],
        };
      },
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(called, false);
  assert.equal(result.status, 'SKIPPED_DISABLED');
  assert.match(result.note, /upload skipped/i);
  assert.match(result.skippedReason ?? '', /disabled/i);
});

test('enabled storage upload reports clear missing storage credentials message', () => {
  const skippedReason = getDriveArchiveSkippedReason({
    ...enabledConfig,
    graphAuthConfigured: false,
  });

  assert.equal(
    skippedReason,
    'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.',
  );
});

test('SharePoint provider requires site ID, drive ID, and folder', () => {
  const skippedReason = getDriveArchiveSkippedReason({
    ...enabledConfig,
    siteId: '',
    driveId: '',
    baseFolder: '',
    graphAuthConfigured: true,
  });

  assert.equal(
    skippedReason,
    'SharePoint account-opening upload is enabled but site, drive, or folder configuration is missing.',
  );
});

test('OneDrive provider supports user or drive ID with folder config', () => {
  const skippedReason = getDriveArchiveSkippedReason({
    provider: 'ONEDRIVE',
    enabled: true,
    siteId: '',
    driveId: '',
    userId: 'sandeep@example.com',
    baseFolder: 'AI BOT FOLDER/Account Opening',
    graphAuthConfigured: true,
  });

  assert.equal(skippedReason, null);
});

test('enabled Microsoft Drive archive path calls adapter with safe payload', async () => {
  let uploadedPackText = '';
  const result = await uploadAccountOpeningArchivePack({
    item: buildDetail(),
    config: enabledConfig,
    uploader: {
      uploadArchivePack: async (pack) => {
        uploadedPackText = JSON.stringify(pack);
        return {
          folderUrl: 'https://sharepoint.example/sites/archive',
          uploadedFileNames: pack.files.map((file) => file.fileName),
        };
      },
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(result.status, 'UPLOADED');
  assert.equal(result.folderUrl, 'https://sharepoint.example/sites/archive');
  assert.match(uploadedPackText, /signing-notes\.json/);
  assert.match(uploadedPackText, /risk-summary\.json/);
  assert.match(uploadedPackText, /missing-info\.json/);
  assert.match(uploadedPackText, /completion-draft\.json/);
  assert.match(uploadedPackText, /source-evidence\.json/);
  assert.doesNotMatch(uploadedPackText, /Raw form text said/);
  assert.doesNotMatch(uploadedPackText, /12345678/);
  assert.doesNotMatch(uploadedPackText, /12-34-56/);
});

test('completed unsigned form filing path and filename are deterministic and safe', () => {
  const detail = buildDetail({
    originalForms: [
      {
        id: 'original-form-1',
        sourceEvidenceId: 'evidence-1',
        fileName: 'Supplier Account Form 12345678.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1200,
        fileHash: 'form-hash-1',
        storageProvider: 'MICROSOFT_DRIVE',
        storageFolderUrl: 'https://sharepoint.example/source',
        storageFileUrl: 'https://sharepoint.example/source/form.pdf',
        storageDriveItemId: 'source-drive-item-1',
        localBlobAvailable: false,
        formType: 'PDF',
        fillSupportStatus: 'PREVIEW_SUPPORTED',
        detectedFieldCount: 4,
        detectionSummary: {},
        createdAt: '2026-05-12T09:00:00.000Z',
        updatedAt: '2026-05-12T09:00:00.000Z',
      },
    ],
  });
  const folderPath = buildAccountOpeningCompletedFormFolderPath(
    detail,
    enabledConfig,
    new Date('2026-05-17T10:00:00.000Z'),
  );
  const fileName = buildAccountOpeningCompletedFormFileName({
    originalFileName: 'Supplier Account Form 12345678.pdf',
    fileHash: 'abcdef1234567890',
    now: new Date('2026-05-17T10:00:00.000Z'),
  });

  assert.equal(
    folderPath,
    'Account Opening/Completed unsigned forms/Supplier Ltd - 2026-05-12 - account-',
  );
  assert.match(fileName, /completed-unsigned-20260517T100000Z-abcdef123456/);
  assert.doesNotMatch(fileName, /12345678/);
});

test('completed unsigned form filing pack includes one PDF and safe metadata only', () => {
  const detail = buildDetail({
    latestBinaryFillPreview: {
      id: 'binary-fill-preview-1',
      originalFormId: null,
      status: 'GENERATED_FOR_REVIEW',
      previewVersion: 'binary-fill-preview-v1',
      binaryPreviewFileName: 'binary-fill-preview.pdf',
      binaryPreviewContentType: 'application/pdf',
      binaryPreviewHash: 'binary-preview-hash-1',
      binaryPreviewBytesAvailable: true,
      filledFieldCount: 1,
      blankFieldCount: 3,
      unsupportedReason: null,
      warnings: [],
      brandingPreservationCheck: {},
      safetySummary: {
        signedFormsIncluded: false,
        supplierSubmissionTriggered: false,
      },
      generatedAt: '2026-05-17T09:00:00.000Z',
      createdByType: 'OPERATOR',
      createdByIdentifier: 'test-reviewer',
    },
  });
  const pack = buildAccountOpeningCompletedFormFilingPack({
    item: detail,
    preview: detail.latestBinaryFillPreview!,
    content: new Uint8Array([37, 80, 68, 70, 45]),
    fileHash: 'binary-preview-hash-1',
    config: enabledConfig,
    now: new Date('2026-05-17T10:00:00.000Z'),
  });
  const packText = JSON.stringify(pack.metadata);

  assert.equal(pack.file.contentType, 'application/pdf');
  assert.equal(pack.metadata.completedUnsignedForm, true);
  assert.equal(pack.metadata.internalSharePointFilingOnly, true);
  assert.equal(pack.metadata.notSigned, true);
  assert.equal(pack.metadata.notSent, true);
  assert.equal(pack.metadata.notSubmitted, true);
  assert.equal(pack.metadata.supplierSubmissionTriggered, false);
  assert.equal(pack.metadata.purchaseWorkflowTriggered, false);
  assert.doesNotMatch(packText, /12345678/);
  assert.doesNotMatch(packText, /12-34-56/);
});

test('completed unsigned form filing skips disabled storage without uploading', async () => {
  let called = false;
  const detail = buildDetail({
    latestBinaryFillPreview: {
      id: 'binary-fill-preview-1',
      originalFormId: null,
      status: 'GENERATED_FOR_REVIEW',
      previewVersion: 'binary-fill-preview-v1',
      binaryPreviewFileName: 'binary-fill-preview.pdf',
      binaryPreviewContentType: 'application/pdf',
      binaryPreviewHash: 'binary-preview-hash-1',
      binaryPreviewBytesAvailable: true,
      filledFieldCount: 1,
      blankFieldCount: 3,
      unsupportedReason: null,
      warnings: [],
      brandingPreservationCheck: {},
      safetySummary: {},
      generatedAt: '2026-05-17T09:00:00.000Z',
      createdByType: 'OPERATOR',
      createdByIdentifier: 'test-reviewer',
    },
  });
  const result = await uploadAccountOpeningCompletedFormFiling({
    item: detail,
    preview: detail.latestBinaryFillPreview!,
    content: new Uint8Array([37, 80, 68, 70, 45]),
    fileHash: 'binary-preview-hash-1',
    config: disabledConfig,
    uploader: {
      uploadCompletedForm: async () => {
        called = true;
        return {
          folderUrl: 'https://sharepoint.example/folder',
          fileUrl: 'https://sharepoint.example/file.pdf',
          driveItemId: 'drive-item-1',
        };
      },
    },
    now: new Date('2026-05-17T10:00:00.000Z'),
  });

  assert.equal(called, false);
  assert.equal(result.status, 'SKIPPED_DISABLED');
  assert.match(result.skippedReason ?? '', /disabled/i);
  assert.equal(result.fileSizeBytes, 5);
});

test('completed unsigned form Graph uploader writes a unique PDF path', async () => {
  const requestedUrls: string[] = [];
  const uploader = createGraphCompletedFormFilingUploader(enabledConfig, {
    accessTokenProvider: async () => 'token',
    fetchImpl: async (url, init) => {
      requestedUrls.push(String(url));
      if (init?.method === 'PUT') {
        return new Response(
          JSON.stringify({
            id: 'completed-drive-item-1',
            webUrl: 'https://sharepoint.example/completed-form.pdf',
          }),
        );
      }

      return new Response(
        JSON.stringify({
          id: 'folder-1',
          webUrl: 'https://sharepoint.example/folder',
        }),
      );
    },
  });
  const result = await uploader.uploadCompletedForm({
    folderPath: 'Account Opening/Completed unsigned forms/Test',
    file: {
      fileName:
        'supplier-form-completed-unsigned-20260517T100000Z-abcdef123456.pdf',
      contentType: 'application/pdf',
      content: new Uint8Array([37, 80, 68, 70, 45]),
    },
    metadata: {
      caseId: 'case-1',
      binaryFillPreviewId: 'binary-fill-preview-1',
      sourceFingerprint: 'fingerprint-1',
      fileName:
        'supplier-form-completed-unsigned-20260517T100000Z-abcdef123456.pdf',
      contentType: 'application/pdf',
      fileHash: 'abcdef1234567890',
      fileSizeBytes: 5,
      completedUnsignedForm: true,
      approvedForFilingRequired: true,
      internalSharePointFilingOnly: true,
      notSigned: true,
      notSent: true,
      notSubmitted: true,
      blockedReviewRequiredFieldsRemainBlank: true,
      rawExtractedTextIncluded: false,
      rawBankDetailsIncluded: false,
      signedFormsIncluded: false,
      paymentAuthorityCompleted: false,
      directDebitMandateCompleted: false,
      guaranteeIndemnityCompleted: false,
      supplierMessageIncluded: false,
      supplierSubmissionTriggered: false,
      purchaseWorkflowTriggered: false,
    },
  });

  assert.equal(result.driveItemId, 'completed-drive-item-1');
  assert.equal(result.fileUrl, 'https://sharepoint.example/completed-form.pdf');
  assert.equal(
    requestedUrls.some((url) =>
      url.includes(
        'supplier-form-completed-unsigned-20260517T100000Z-abcdef123456.pdf',
      ),
    ),
    true,
  );
});

test('OneDrive archive uploader uses configured drive ID directly', async () => {
  const requestedUrls: string[] = [];
  const uploader = createGraphDriveArchiveUploader(
    {
      provider: 'ONEDRIVE',
      enabled: true,
      siteId: '',
      driveId: 'onedrive-drive-1',
      userId: '',
      rootFolder: 'AI BOT FOLDER',
      baseFolder: 'AI BOT FOLDER/Account Opening',
      graphAuthConfigured: true,
    },
    {
      accessTokenProvider: async () => 'token',
      fetchImpl: async (url, init) => {
        requestedUrls.push(String(url));
        if (init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              id: 'file-1',
              webUrl: 'https://onedrive.example/file',
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 'folder-1',
            webUrl: 'https://onedrive.example/folder',
          }),
        );
      },
    },
  );

  await uploader.uploadArchivePack({
    folderPath: 'AI BOT FOLDER/Account Opening/Approved/Test',
    files: [
      { fileName: 'safe.json', contentType: 'application/json', content: '{}' },
    ],
    metadata: {
      caseId: 'case-1',
      sourceFingerprint: 'fingerprint-1',
      fileNames: ['safe.json'],
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
      completedSupplierFormsIncluded: false,
      pdfWordFormsFilled: false,
      supplierMessageIncluded: false,
    },
  });

  assert.equal(
    requestedUrls.some((url) => url.includes('/users/')),
    false,
  );
  assert.equal(
    requestedUrls.some((url) => url.includes('/drives/onedrive-drive-1/')),
    true,
  );
});

test('OneDrive archive uploader resolves drive from user ID when drive ID is missing', async () => {
  const requestedUrls: string[] = [];
  const uploader = createGraphDriveArchiveUploader(
    {
      provider: 'ONEDRIVE',
      enabled: true,
      siteId: '',
      driveId: '',
      userId: 'sandeep@example.com',
      rootFolder: 'AI BOT FOLDER',
      baseFolder: 'AI BOT FOLDER/Account Opening',
      graphAuthConfigured: true,
    },
    {
      accessTokenProvider: async () => 'token',
      fetchImpl: async (url, init) => {
        const requestUrl = String(url);
        requestedUrls.push(requestUrl);

        if (requestUrl.includes('/users/sandeep%40example.com/drive')) {
          return new Response(
            JSON.stringify({
              id: 'resolved-drive-1',
              name: 'Sandeep OneDrive',
            }),
          );
        }

        if (init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              id: 'file-1',
              webUrl: 'https://onedrive.example/file',
            }),
          );
        }

        return new Response(
          JSON.stringify({
            id: 'folder-1',
            webUrl: 'https://onedrive.example/folder',
          }),
        );
      },
    },
  );

  await uploader.uploadArchivePack({
    folderPath: 'AI BOT FOLDER/Account Opening/Approved/Test',
    files: [
      { fileName: 'safe.json', contentType: 'application/json', content: '{}' },
    ],
    metadata: {
      caseId: 'case-1',
      sourceFingerprint: 'fingerprint-1',
      fileNames: ['safe.json'],
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
      completedSupplierFormsIncluded: false,
      pdfWordFormsFilled: false,
      supplierMessageIncluded: false,
    },
  });

  assert.equal(
    requestedUrls.some((url) =>
      url.includes('/users/sandeep%40example.com/drive'),
    ),
    true,
  );
  assert.equal(
    requestedUrls.some((url) => url.includes('/drives/resolved-drive-1/')),
    true,
  );
});

test('SharePoint archive uploader keeps site and drive path behavior', async () => {
  const requestedUrls: string[] = [];
  const uploader = createGraphDriveArchiveUploader(enabledConfig, {
    accessTokenProvider: async () => 'token',
    fetchImpl: async (url, init) => {
      requestedUrls.push(String(url));
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ id: 'file-1' }));
      }

      return new Response(JSON.stringify({ id: 'folder-1' }));
    },
  });

  await uploader.uploadArchivePack({
    folderPath: 'Account Opening/Approved/Test',
    files: [
      { fileName: 'safe.json', contentType: 'application/json', content: '{}' },
    ],
    metadata: {
      caseId: 'case-1',
      sourceFingerprint: 'fingerprint-1',
      fileNames: ['safe.json'],
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
      completedSupplierFormsIncluded: false,
      pdfWordFormsFilled: false,
      supplierMessageIncluded: false,
    },
  });

  assert.equal(
    requestedUrls.every((url) => url.includes('/sites/site-1/drives/drive-1/')),
    true,
  );
});
