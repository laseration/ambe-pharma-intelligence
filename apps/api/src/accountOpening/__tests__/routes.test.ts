import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import express from 'express';

import { env } from '../../config/env';
import { errorHandler } from '../../http/errors';
import { createAccountOpeningRouter } from '../routes';
import {
  buildAccountOpeningFillPreviewPack,
  getAccountOpeningFillPreviewFile,
} from '../fillPreview';
import {
  buildAccountOpeningReviewExportPack,
  getAccountOpeningReviewExportFile,
} from '../reviewExport';
import { evaluateAccountOpeningAutofillPolicy } from '../policy';
import type {
  AccountOpeningCaseDetail,
  AccountOpeningCaseListItem,
  AccountOpeningMissingInfoResponses,
  AccountOpeningReadinessReport,
} from '../service';

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

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function buildCaseDetail(
  overrides: Partial<AccountOpeningCaseDetail> = {},
): AccountOpeningCaseDetail {
  return {
    id: 'case-1',
    diagnosticCorrelationId: 'MESSAGE:<message-1>',
    sourceFingerprint: 'fingerprint-1',
    messageId: '<message-1>',
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    receivedAt: '2026-05-12T09:00:00.000Z',
    companyName: 'AMBE LTD',
    detectedFormType: 'account opening form',
    status: 'PENDING_REVIEW',
    recommendedSigner: 'Aman Dhillon',
    signingStatement:
      'Aman Dhillon can sign this account-opening form by default.',
    signingExplanation:
      'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: [],
    detectedRoles: [],
    escalationNotes: [],
    riskFlags: ['Direct Debit mandate'],
    policyRiskFlags: [],
    policySigningNotes: [],
    missingFields: ['companyNumber'],
    reviewerChecks: [
      'Leave all signature fields blank unless approved by a human reviewer.',
    ],
    signingNotes: {
      title: 'Account opening signing notes',
      recommendedSigner: 'Aman Dhillon',
      defaultSigningStatement:
        'Aman Dhillon can sign this account-opening form by default.',
      detectedNames: [],
      detectedRolesOrSections: [],
      reviewerChecks: [
        'Leave all signature fields blank unless approved by a human reviewer.',
      ],
      riskFlags: ['Direct Debit mandate'],
      missingOrUnclear: ['companyNumber'],
      signatureInstruction:
        'Leave signature fields blank until approved by a human reviewer.',
      summary:
        'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default.',
    },
    missingInfoResponses: {},
    extractedTextSummary:
      'Extracted account-opening text from attachments (120 chars).',
    storageStatus: null,
    storageNote: null,
    storageSkippedReason: null,
    storageLastAttemptAt: null,
    storageFolderUrl: null,
    sourceAttachmentNames: ['account-opening-form.pdf'],
    sourceProvenance: {
      sourceFingerprint: 'fingerprint-1',
      messageId: '<message-1>',
      subject: 'Account opening form',
      senderEmail: 'forms@supplier.co.uk',
      senderDomain: 'supplier.co.uk',
      receivedAt: '2026-05-12T09:00:00.000Z',
      attachmentCount: 0,
      attachments: [],
      safety: {
        rawEmailBodyIncluded: false,
        rawExtractedTextIncluded: false,
        attachmentBytesIncluded: false,
        replayUsesStoredSafeEvidence: true,
      },
    },
    processingRuns: [],
    draftStatus: null,
    draftVersion: null,
    draftGeneratedAt: null,
    sourceEvidence: [],
    originalForms: [],
    completionDraft: {
      status: 'PREVIEW',
      overallConfidence: 'BLOCKED',
      isStored: false,
      profileId: 'ambe-account-opening-profile',
      profileVersion: '2026-06-09',
      generatedAt: '2026-05-15T00:00:00.000Z',
      fields: [],
      summary: {
        totalFields: 0,
        highConfidenceFields: 0,
        reviewRequiredFields: 0,
        blockedFields: 0,
        safeToAutoFill: false,
      },
      safetyNotes: [],
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
      safetyNotes: [],
    },
    lifecycle: {
      legacyStatus: 'PENDING_REVIEW',
      currentStage: 'NEEDS_REVIEW',
      currentLabel: 'Needs review',
      nextAction: 'Review missing information and blocked fields.',
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
    latestFillPreview: null,
    latestBinaryFillPreview: null,
    latestCompletedFormFiling: null,
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-05-12T09:05:00.000Z',
    ...overrides,
  };
}

function buildReadinessReport(
  overrides: Partial<AccountOpeningReadinessReport> = {},
): AccountOpeningReadinessReport {
  return {
    caseId: 'case-1',
    diagnosticCorrelationId: 'MESSAGE:<message-1>',
    status: 'RED',
    readyForEndToEndFillingAndFiling: false,
    nextAction: 'Review supplier fields and save field mappings.',
    documentLifecycle: {
      originalFormCount: 0,
      primaryOriginalFormId: null,
      canAttemptBinaryPreview: false,
      canDownloadBinaryPreview: false,
      canApproveCompletedUnsignedFiling: false,
      canFileCompletedUnsignedForm: false,
      completedUnsignedFilingStatus: null,
      primaryBlocker: 'Reviewed field mappings have not been saved.',
      nextAction: 'Review supplier fields and save field mappings.',
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
        key: 'REVIEWED_FIELD_MAPPINGS_SAVED',
        label: 'Reviewed field mappings saved',
        status: 'RED',
        value: 'PREVIEW',
        blocker: 'Reviewed field mappings have not been saved.',
        nextAction: 'Review supplier fields and save field mappings.',
      },
    ],
    blockerTexts: ['Reviewed field mappings have not been saved.'],
    counts: {
      pdfAcroFormFieldCount: null,
      safeMappedFields: 0,
      blockedFields: 0,
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
    ...overrides,
  };
}

async function startServer(
  context: TestContext,
  dependencies: Partial<Parameters<typeof createAccountOpeningRouter>[0]>,
) {
  const app = express();
  const defaultDetail = buildCaseDetail();
  const routerDependencies: Parameters<typeof createAccountOpeningRouter>[0] = {
    getCaseDetail: async () => defaultDetail,
    generateDraft: async () => defaultDetail,
    reprocessFromStoredSource: async () => defaultDetail,
    getReadiness: async () => buildReadinessReport(),
    getFieldMappings: async () => defaultDetail.fieldMappings,
    saveFieldMappings: async () => defaultDetail.fieldMappings,
    generateFillPreview: async () => ({
      item: defaultDetail,
      preview: buildAccountOpeningFillPreviewPack(defaultDetail),
    }),
    downloadFillPreviewFile: async (input) => {
      const file = getAccountOpeningFillPreviewFile(
        buildAccountOpeningFillPreviewPack(defaultDetail),
        input.fileName,
      );

      if (!file) {
        throw new Error('Account-opening fill preview file not found.');
      }

      return file;
    },
    generateBinaryFillPreview: async () => ({
      item: {
        ...defaultDetail,
        latestBinaryFillPreview: {
          id: 'binary-fill-preview-1',
          originalFormId: 'original-form-1',
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
          brandingPreservationCheck: {
            originalBrandingPreservationRequired: true,
            originalLayoutPreservationRequired: true,
            formFlattened: false,
          },
          safetySummary: {
            internalPreviewOnly: true,
            binaryPreviewGenerated: true,
            signedFormsIncluded: false,
            supplierSubmissionTriggered: false,
          },
          generatedAt: '2026-05-16T11:00:00.000Z',
          createdByType: 'OPERATOR',
          createdByIdentifier: 'route-binary-fill-preview-test',
        },
      },
      preview: {
        id: 'binary-fill-preview-1',
        originalFormId: 'original-form-1',
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
        brandingPreservationCheck: {
          originalBrandingPreservationRequired: true,
          originalLayoutPreservationRequired: true,
          formFlattened: false,
        },
        safetySummary: {
          internalPreviewOnly: true,
          binaryPreviewGenerated: true,
          signedFormsIncluded: false,
          supplierSubmissionTriggered: false,
        },
        generatedAt: '2026-05-16T11:00:00.000Z',
        createdByType: 'OPERATOR',
        createdByIdentifier: 'route-binary-fill-preview-test',
      },
    }),
    downloadBinaryFillPreviewFile: async () => ({
      fileName: 'binary-fill-preview.pdf',
      contentType: 'application/pdf',
      content: new Uint8Array([37, 80, 68, 70, 45]),
    }),
    approveCompletedFormFiling: async () => ({
      item: {
        ...defaultDetail,
        latestCompletedFormFiling: {
          id: 'completed-form-filing-1',
          binaryFillPreviewId: 'binary-fill-preview-1',
          status: 'APPROVED_FOR_FILING',
          fileName: 'binary-fill-preview.pdf',
          contentType: 'application/pdf',
          fileHash: 'binary-preview-hash-1',
          fileSizeBytes: 5,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
          approvedByType: 'OPERATOR',
          approvedByIdentifier: 'route-completed-form-filing-test',
          approvedAt: '2026-05-17T10:00:00.000Z',
          approvalNote: 'Reviewed for internal SharePoint filing only.',
          filedByType: null,
          filedByIdentifier: null,
          filedAt: null,
          filingNote: null,
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
          createdAt: '2026-05-17T10:00:00.000Z',
          updatedAt: '2026-05-17T10:00:00.000Z',
        },
      },
      filing: {
        id: 'completed-form-filing-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        status: 'APPROVED_FOR_FILING',
        fileName: 'binary-fill-preview.pdf',
        contentType: 'application/pdf',
        fileHash: 'binary-preview-hash-1',
        fileSizeBytes: 5,
        storageProvider: null,
        storageFolderUrl: null,
        storageFileUrl: null,
        storageDriveItemId: null,
        approvedByType: 'OPERATOR',
        approvedByIdentifier: 'route-completed-form-filing-test',
        approvedAt: '2026-05-17T10:00:00.000Z',
        approvalNote: 'Reviewed for internal SharePoint filing only.',
        filedByType: null,
        filedByIdentifier: null,
        filedAt: null,
        filingNote: null,
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
        createdAt: '2026-05-17T10:00:00.000Z',
        updatedAt: '2026-05-17T10:00:00.000Z',
      },
    }),
    fileCompletedFormToSharePoint: async () => ({
      item: {
        ...defaultDetail,
        latestCompletedFormFiling: {
          id: 'completed-form-filing-1',
          binaryFillPreviewId: 'binary-fill-preview-1',
          status: 'FILED',
          fileName:
            'supplier-account-opening-form-completed-unsigned-20260517T100000Z-binary-previ.pdf',
          contentType: 'application/pdf',
          fileHash: 'binary-preview-hash-1',
          fileSizeBytes: 5,
          storageProvider: 'SHAREPOINT',
          storageFolderUrl: 'https://sharepoint.example/folder',
          storageFileUrl: 'https://sharepoint.example/file.pdf',
          storageDriveItemId: 'drive-item-1',
          approvedByType: 'OPERATOR',
          approvedByIdentifier: 'route-completed-form-filing-test',
          approvedAt: '2026-05-17T10:00:00.000Z',
          approvalNote: 'Reviewed for internal SharePoint filing only.',
          filedByType: 'OPERATOR',
          filedByIdentifier: 'route-completed-form-filing-test',
          filedAt: '2026-05-17T10:01:00.000Z',
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
          createdAt: '2026-05-17T10:00:00.000Z',
          updatedAt: '2026-05-17T10:01:00.000Z',
        },
      },
      filing: {
        id: 'completed-form-filing-1',
        binaryFillPreviewId: 'binary-fill-preview-1',
        status: 'FILED',
        fileName:
          'supplier-account-opening-form-completed-unsigned-20260517T100000Z-binary-previ.pdf',
        contentType: 'application/pdf',
        fileHash: 'binary-preview-hash-1',
        fileSizeBytes: 5,
        storageProvider: 'SHAREPOINT',
        storageFolderUrl: 'https://sharepoint.example/folder',
        storageFileUrl: 'https://sharepoint.example/file.pdf',
        storageDriveItemId: 'drive-item-1',
        approvedByType: 'OPERATOR',
        approvedByIdentifier: 'route-completed-form-filing-test',
        approvedAt: '2026-05-17T10:00:00.000Z',
        approvalNote: 'Reviewed for internal SharePoint filing only.',
        filedByType: 'OPERATOR',
        filedByIdentifier: 'route-completed-form-filing-test',
        filedAt: '2026-05-17T10:01:00.000Z',
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
        createdAt: '2026-05-17T10:00:00.000Z',
        updatedAt: '2026-05-17T10:01:00.000Z',
      },
    }),
    exportPack: async () => buildAccountOpeningReviewExportPack(defaultDetail),
    downloadExportFile: async (input) => {
      const file = getAccountOpeningReviewExportFile(
        buildAccountOpeningReviewExportPack(defaultDetail),
        input.fileName,
      );

      if (!file) {
        throw new Error('Account-opening review export file not found.');
      }

      return file;
    },
    saveMissingInfo: async () => defaultDetail,
    updateStatus: async () => defaultDetail,
    listCases: async () => [],
    createManualCase: async () => ({
      id: 'manual-case-1',
      companyName: 'Example Supplier Ltd',
      caseType: 'SUPPLIER_ONBOARDING',
      sourceChannel: 'MANUAL',
      status: 'PENDING_REVIEW',
    }),
    ...dependencies,
  };
  app.use(express.json());
  app.use('/account-opening', createAccountOpeningRouter(routerDependencies));
  app.use(errorHandler);
  const server = app.listen(0);

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test('account-opening routes read a case without exposing raw form text fields', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    generateDraft: async () => buildCaseDetail(),
    saveMissingInfo: async () => buildCaseDetail(),
    updateStatus: async () => buildCaseDetail(),
  });

  const response = await fetch(`${baseUrl}/account-opening/case-1`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });
  const payload = (await response.json()) as { item: AccountOpeningCaseDetail };

  assert.equal(response.status, 200);
  assert.equal(payload.item.id, 'case-1');
  assert.equal(
    payload.item.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.equal('rawExtractedText' in payload.item, false);
});

test('account-opening readiness route requires operator access and returns safe diagnostics', async (t) => {
  overrideEnv(t, {
    internalApiKey: 'test-internal-key',
  });
  const baseUrl = await startServer(t, {
    getReadiness: async () =>
      buildReadinessReport({
        status: 'RED',
        nextAction: 'Capture the supplier original form reference.',
        blockerTexts: ['No original form reference is present.'],
      }),
  });

  const unauthorizedResponse = await fetch(
    `${baseUrl}/account-opening/case-1/readiness`,
  );
  const response = await fetch(`${baseUrl}/account-opening/case-1/readiness`, {
    headers: {
      'x-internal-api-key': 'test-internal-key',
      'x-internal-caller-name': 'route-readiness-test',
    },
  });
  const payload = (await response.json()) as {
    item: AccountOpeningReadinessReport;
  };
  const responseText = JSON.stringify(payload);

  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(response.status, 200);
  assert.equal(payload.item.status, 'RED');
  assert.equal(payload.item.safety.binaryBytesIncluded, false);
  assert.equal(payload.item.safety.rawExtractedTextIncluded, false);
  assert.doesNotMatch(responseText, /12345678/);
  assert.doesNotMatch(responseText, /12-34-56/);
});

test('account-opening missing-info route saves sanitized review fields with audit actor', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const savedInputs: Array<{
    id: string;
    missingInfoResponses: AccountOpeningMissingInfoResponses;
    actorType?: string | null;
    actorIdentifier?: string | null;
  }> = [];
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    generateDraft: async () => buildCaseDetail(),
    saveMissingInfo: async (input) => {
      savedInputs.push(input);
      return buildCaseDetail({
        missingInfoResponses: input.missingInfoResponses,
      });
    },
    updateStatus: async () => buildCaseDetail(),
  });

  const response = await fetch(
    `${baseUrl}/account-opening/case-1/missing-info`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
      },
      body: JSON.stringify({
        website: 'https://supplier.example',
        reviewerNotes:
          'Account number 12345678 should be redacted by the service.',
        actorType: 'OPERATOR',
        actorIdentifier: 'route-test',
      }),
    },
  );
  const payload = (await response.json()) as { item: AccountOpeningCaseDetail };

  assert.equal(response.status, 200);
  const savedInput = savedInputs[0];
  assert.equal(savedInput?.id, 'case-1');
  assert.equal(savedInput?.actorType, 'OPERATOR');
  assert.equal(savedInput?.actorIdentifier, 'route-test');
  assert.equal(
    savedInput?.missingInfoResponses.website,
    'https://supplier.example',
  );
  assert.match(
    payload.item.missingInfoResponses.reviewerNotes ?? '',
    /Account number/,
  );
});

test('account-opening status route allows only safe review status actions', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const actions: string[] = [];
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    generateDraft: async () => buildCaseDetail(),
    saveMissingInfo: async () => buildCaseDetail(),
    updateStatus: async (input) => {
      actions.push(input.action);
      return buildCaseDetail({
        status:
          input.action === 'APPROVED_FOR_COMPLETION'
            ? 'APPROVED_FOR_COMPLETION'
            : input.action === 'REJECTED'
              ? 'REJECTED'
              : 'NEEDS_INFO',
      });
    },
  });

  const approveResponse = await fetch(
    `${baseUrl}/account-opening/case-1/status`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
      },
      body: JSON.stringify({
        action: 'APPROVED_FOR_COMPLETION',
        note: 'Approved for completion only. This does not sign or send.',
      }),
    },
  );
  const rejectResponse = await fetch(
    `${baseUrl}/account-opening/case-1/status`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
      },
      body: JSON.stringify({
        action: 'REJECTED',
        note: 'No form will be completed, signed, uploaded, or sent.',
      }),
    },
  );
  const unsafeResponse = await fetch(
    `${baseUrl}/account-opening/case-1/status`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
      },
      body: JSON.stringify({
        action: 'GENERATE_DRAFT',
      }),
    },
  );

  assert.equal(approveResponse.status, 200);
  assert.equal(rejectResponse.status, 200);
  assert.equal(unsafeResponse.status, 422);
  assert.deepEqual(actions, ['APPROVED_FOR_COMPLETION', 'REJECTED']);
});

test('account-opening draft routes return safe draft and protect generation', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const generatedInputs: Array<{
    id: string;
    actorType?: string | null;
    actorIdentifier?: string | null;
  }> = [];
  const generatedDetail = buildCaseDetail({
    draftStatus: 'BLOCKED',
    draftGeneratedAt: '2026-05-15T10:00:00.000Z',
    completionDraft: {
      ...buildCaseDetail().completionDraft,
      status: 'BLOCKED',
      isStored: true,
      generatedAt: '2026-05-15T10:00:00.000Z',
    },
  });
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    generateDraft: async (input) => {
      generatedInputs.push(input);
      return generatedDetail;
    },
    saveMissingInfo: async () => buildCaseDetail(),
    updateStatus: async () => buildCaseDetail(),
  });

  const readResponse = await fetch(`${baseUrl}/account-opening/case-1/draft`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });
  const generateResponse = await fetch(
    `${baseUrl}/account-opening/case-1/generate-draft`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
      },
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'route-draft-test',
      }),
    },
  );
  const readPayload = (await readResponse.json()) as {
    item: AccountOpeningCaseDetail['completionDraft'];
  };
  const generatePayload = (await generateResponse.json()) as {
    item: AccountOpeningCaseDetail;
    draft: AccountOpeningCaseDetail['completionDraft'];
  };

  assert.equal(readResponse.status, 200);
  assert.equal(readPayload.item.status, 'PREVIEW');
  assert.equal(generateResponse.status, 200);
  assert.equal(generatePayload.draft.isStored, true);
  assert.equal(generatedInputs[0]?.id, 'case-1');
  assert.equal(generatedInputs[0]?.actorIdentifier, 'route-draft-test');
});

test('account-opening stored-source replay route requires operator access and returns provenance', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const replayInputs: Array<{
    id: string;
    actorType?: string | null;
    actorIdentifier?: string | null;
  }> = [];
  const replayDetail = buildCaseDetail({
    sourceProvenance: {
      ...buildCaseDetail().sourceProvenance,
      attachmentCount: 1,
      attachments: [
        {
          sourceEvidenceId: 'evidence-1',
          originalFormId: 'original-form-1',
          fileName: 'account-opening-form.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12000,
          checksumSha256: 'text-hash-1',
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
    },
    processingRuns: [
      {
        id: 'processing-run-1',
        triggerType: 'MANUAL_REPROCESS',
        status: 'COMPLETED',
        startedAt: '2026-05-12T13:00:00.000Z',
        finishedAt: '2026-05-12T13:00:01.000Z',
        warningSummary: null,
        errorSummary: null,
        diagnostics: {
          replaySource: 'STORED_SOURCE_EVIDENCE',
          sourceEvidenceCount: 1,
          attachmentEvidenceCount: 1,
          outboundActionsTriggered: false,
          approvalStatusChanged: false,
        },
        actorType: 'OPERATOR',
        actorIdentifier: 'route-replay-test',
      },
    ],
  });
  const baseUrl = await startServer(t, {
    reprocessFromStoredSource: async (input) => {
      replayInputs.push(input);
      return replayDetail;
    },
  });

  const unauthorizedResponse = await fetch(
    `${baseUrl}/account-opening/case-1/reprocess-stored-source`,
    { method: 'POST' },
  );
  const response = await fetch(
    `${baseUrl}/account-opening/case-1/reprocess-stored-source`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
      },
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'route-replay-test',
      }),
    },
  );
  const payload = (await response.json()) as { item: AccountOpeningCaseDetail };

  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(response.status, 200);
  assert.equal(replayInputs[0]?.id, 'case-1');
  assert.equal(replayInputs[0]?.actorIdentifier, 'route-replay-test');
  assert.equal(payload.item.sourceProvenance.attachmentCount, 1);
  assert.equal(
    payload.item.sourceProvenance.attachments[0]?.replayPointer
      .canReplayFromStoredSource,
    true,
  );
  assert.equal(payload.item.processingRuns[0]?.triggerType, 'MANUAL_REPROCESS');
  assert.equal(payload.item.processingRuns[0]?.status, 'COMPLETED');
  assert.equal(payload.item.lifecycle.safety.noAutoSign, true);
  assert.equal(payload.item.lifecycle.safety.noAutoSubmit, true);
  assert.equal(payload.item.lifecycle.safety.noOutboundSend, true);
});

test('account-opening field mapping routes require operator access and save mappings', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const savedInputs: Array<{
    id: string;
    mappings: Array<{ supplierFieldLabel: string; status?: string | null }>;
    actorIdentifier?: string | null;
  }> = [];
  const detail = buildCaseDetail({
    fieldMappings: {
      ...buildCaseDetail().fieldMappings,
      mappings: [
        {
          id: 'mapping-1',
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
          ...accountOpeningPolicyFields({
            key: 'legalCompanyName',
            supplierLabel: 'Company Name',
          }),
          operatorNote: null,
        },
      ],
    },
  });
  const baseUrl = await startServer(t, {
    getFieldMappings: async () => detail.fieldMappings,
    saveFieldMappings: async (input) => {
      savedInputs.push(input);
      return detail.fieldMappings;
    },
  });

  const unauthorizedResponse = await fetch(
    `${baseUrl}/account-opening/case-1/field-mappings`,
  );
  const readResponse = await fetch(
    `${baseUrl}/account-opening/case-1/field-mappings`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-field-mapping-test',
      },
    },
  );
  const saveResponse = await fetch(
    `${baseUrl}/account-opening/case-1/field-mappings`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-field-mapping-test',
      },
      body: JSON.stringify({
        mappings: [
          {
            supplierFieldLabel: 'Company Name',
            sourceType: 'SOURCE_EVIDENCE',
            sourceEvidenceId: 'evidence-1',
            mappedDraftFieldKey: 'legalCompanyName',
            status: 'MAPPED_SAFE',
          },
        ],
      }),
    },
  );

  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(readResponse.status, 200);
  assert.equal(saveResponse.status, 200);
  assert.equal(savedInputs[0]?.id, 'case-1');
  assert.equal(savedInputs[0]?.mappings[0]?.supplierFieldLabel, 'Company Name');
  assert.equal(
    savedInputs[0]?.actorIdentifier,
    'internal-operator:route-field-mapping-test',
  );
});

test('account-opening fill preview routes require operator access and allowlisted downloads', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const generatedInputs: Array<{
    id: string;
    actorIdentifier?: string | null;
  }> = [];
  const downloadedInputs: Array<{
    id: string;
    fileName: string;
    actorIdentifier?: string | null;
  }> = [];
  const detail = buildCaseDetail({
    originalForms: [
      {
        id: 'original-form-1',
        sourceEvidenceId: 'evidence-1',
        fileName: 'supplier-account-opening-form.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
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
        createdAt: '2026-05-16T10:00:00.000Z',
        updatedAt: '2026-05-16T10:00:00.000Z',
      },
    ],
    fieldMappings: {
      ...buildCaseDetail().fieldMappings,
      status: 'SAVED',
      mappings: [
        {
          id: 'mapping-1',
          supplierFieldLabel: 'Company Name',
          supplierSectionLabel: null,
          normalizedLabel: 'company name',
          sourceType: 'OPERATOR_CREATED',
          sourceEvidenceId: null,
          evidenceSnippet: null,
          suggestedDraftFieldKey: null,
          mappedDraftFieldKey: 'legalCompanyName',
          proposedValue: 'AMBE LTD',
          valueSource: 'AMBE_MASTER_PROFILE',
          confidence: 'HIGH',
          riskLevel: 'LOW',
          status: 'MAPPED_SAFE',
          requiresReview: false,
          blockedReason: null,
          reviewReason: null,
          ...accountOpeningPolicyFields({
            key: 'legalCompanyName',
            supplierLabel: 'Company Name',
          }),
          operatorNote: null,
        },
      ],
      summary: {
        totalMappings: 1,
        mappedSafe: 1,
        reviewRequired: 0,
        blocked: 0,
        ignored: 0,
        unmapped: 0,
        needsOperatorInput: 0,
        safeToFillSupplierForms: false,
      },
    },
  });
  const pack = buildAccountOpeningFillPreviewPack(
    detail,
    new Date('2026-05-16T10:30:00.000Z'),
  );
  const baseUrl = await startServer(t, {
    generateFillPreview: async (input) => {
      generatedInputs.push(input);
      return {
        item: {
          ...detail,
          latestFillPreview: {
            id: 'fill-preview-1',
            originalFormId: 'original-form-1',
            status: 'GENERATED_FOR_REVIEW',
            previewVersion: 'fill-preview-v1',
            fileNames: pack.metadata.fileNames,
            summary: pack.payload.summary,
            safetySummary: pack.payload.safety,
            generatedAt: '2026-05-16T10:30:00.000Z',
            createdByType: 'OPERATOR',
            createdByIdentifier: 'route-fill-preview-test',
          },
        },
        preview: pack,
      };
    },
    downloadFillPreviewFile: async (input) => {
      downloadedInputs.push(input);
      const file = getAccountOpeningFillPreviewFile(pack, input.fileName);

      if (!file) {
        throw new Error('Account-opening fill preview file not found.');
      }

      return file;
    },
  });

  const unauthorizedGenerateResponse = await fetch(
    `${baseUrl}/account-opening/case-1/fill-preview`,
    { method: 'POST' },
  );
  const generateResponse = await fetch(
    `${baseUrl}/account-opening/case-1/fill-preview`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-fill-preview-test',
      },
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'route-fill-preview-test',
      }),
    },
  );
  const fileResponse = await fetch(
    `${baseUrl}/account-opening/case-1/fill-preview/fill-preview.md`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-fill-preview-test',
      },
    },
  );
  const unknownResponse = await fetch(
    `${baseUrl}/account-opening/case-1/fill-preview/unknown.json`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-fill-preview-test',
      },
    },
  );
  const traversalResponse = await fetch(
    `${baseUrl}/account-opening/case-1/fill-preview/${encodeURIComponent('../secret.json')}`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-fill-preview-test',
      },
    },
  );
  const fileText = await fileResponse.text();

  assert.equal(unauthorizedGenerateResponse.status, 401);
  assert.equal(generateResponse.status, 200);
  assert.equal(fileResponse.status, 200);
  assert.match(
    fileResponse.headers.get('content-type') ?? '',
    /text\/markdown/,
  );
  assert.match(
    fileResponse.headers.get('content-disposition') ?? '',
    /fill-preview\.md/,
  );
  assert.match(fileText, /Internal preview only/);
  assert.match(fileText, /This does not submit the form\./);
  assert.doesNotMatch(fileText, /12345678/);
  assert.equal(unknownResponse.status, 404);
  assert.equal(traversalResponse.status, 404);
  assert.equal(generatedInputs[0]?.id, 'case-1');
  assert.equal(generatedInputs[0]?.actorIdentifier, 'route-fill-preview-test');
  assert.equal(downloadedInputs.length, 1);
  assert.equal(downloadedInputs[0]?.fileName, 'fill-preview.md');
});

test('account-opening binary fill preview routes require operator access and allowlisted downloads', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const generatedInputs: Array<{
    id: string;
    actorIdentifier?: string | null;
  }> = [];
  const downloadedInputs: Array<{
    id: string;
    fileName: string;
    actorIdentifier?: string | null;
  }> = [];
  const detail = buildCaseDetail({
    latestBinaryFillPreview: {
      id: 'binary-fill-preview-1',
      originalFormId: 'original-form-1',
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
      generatedAt: '2026-05-16T11:00:00.000Z',
      createdByType: 'OPERATOR',
      createdByIdentifier: 'route-binary-fill-preview-test',
    },
  });
  const baseUrl = await startServer(t, {
    generateBinaryFillPreview: async (input) => {
      generatedInputs.push(input);
      return {
        item: detail,
        preview: detail.latestBinaryFillPreview!,
      };
    },
    downloadBinaryFillPreviewFile: async (input) => {
      downloadedInputs.push(input);
      return {
        fileName: 'binary-fill-preview.pdf',
        contentType: 'application/pdf',
        content: new Uint8Array([37, 80, 68, 70, 45]),
      };
    },
  });

  const unauthorizedGenerateResponse = await fetch(
    `${baseUrl}/account-opening/case-1/binary-fill-preview`,
    { method: 'POST' },
  );
  const generateResponse = await fetch(
    `${baseUrl}/account-opening/case-1/binary-fill-preview`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-binary-fill-preview-test',
      },
      body: JSON.stringify({
        actorType: 'OPERATOR',
        actorIdentifier: 'route-binary-fill-preview-test',
      }),
    },
  );
  const fileResponse = await fetch(
    `${baseUrl}/account-opening/case-1/binary-fill-preview/binary-fill-preview.pdf`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-binary-fill-preview-test',
      },
    },
  );
  const unknownResponse = await fetch(
    `${baseUrl}/account-opening/case-1/binary-fill-preview/unknown.pdf`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-binary-fill-preview-test',
      },
    },
  );
  const traversalResponse = await fetch(
    `${baseUrl}/account-opening/case-1/binary-fill-preview/${encodeURIComponent('../secret.pdf')}`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-binary-fill-preview-test',
      },
    },
  );
  const fileBytes = new Uint8Array(await fileResponse.arrayBuffer());

  assert.equal(unauthorizedGenerateResponse.status, 401);
  assert.equal(generateResponse.status, 200);
  assert.equal(fileResponse.status, 200);
  assert.match(
    fileResponse.headers.get('content-type') ?? '',
    /application\/pdf/,
  );
  assert.match(
    fileResponse.headers.get('content-disposition') ?? '',
    /binary-fill-preview\.pdf/,
  );
  assert.deepEqual(Array.from(fileBytes), [37, 80, 68, 70, 45]);
  assert.equal(unknownResponse.status, 404);
  assert.equal(traversalResponse.status, 404);
  assert.equal(generatedInputs[0]?.id, 'case-1');
  assert.equal(
    generatedInputs[0]?.actorIdentifier,
    'route-binary-fill-preview-test',
  );
  assert.equal(downloadedInputs.length, 1);
  assert.equal(downloadedInputs[0]?.fileName, 'binary-fill-preview.pdf');
});

test('account-opening completed form filing routes require operator access and return safe status', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const approvedInputs: Array<{
    id: string;
    binaryFillPreviewId?: string | null;
    approvalNote?: string | null;
    actorIdentifier?: string | null;
  }> = [];
  const filedInputs: Array<{
    id: string;
    binaryFillPreviewId?: string | null;
    filingNote?: string | null;
    actorIdentifier?: string | null;
  }> = [];
  const baseUrl = await startServer(t, {
    approveCompletedFormFiling: async (input) => {
      approvedInputs.push(input);
      const detail = buildCaseDetail({
        latestCompletedFormFiling: {
          id: 'completed-form-filing-1',
          binaryFillPreviewId: input.binaryFillPreviewId ?? '',
          status: 'APPROVED_FOR_FILING',
          fileName: 'binary-fill-preview.pdf',
          contentType: 'application/pdf',
          fileHash: 'binary-preview-hash-1',
          fileSizeBytes: 5,
          storageProvider: null,
          storageFolderUrl: null,
          storageFileUrl: null,
          storageDriveItemId: null,
          approvedByType: 'OPERATOR',
          approvedByIdentifier: input.actorIdentifier ?? null,
          approvedAt: '2026-05-17T10:00:00.000Z',
          approvalNote: input.approvalNote ?? null,
          filedByType: null,
          filedByIdentifier: null,
          filedAt: null,
          filingNote: null,
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
            purchaseWorkflowTriggered: false,
          },
          createdAt: '2026-05-17T10:00:00.000Z',
          updatedAt: '2026-05-17T10:00:00.000Z',
        },
      });
      return {
        item: detail,
        filing: detail.latestCompletedFormFiling!,
      };
    },
    fileCompletedFormToSharePoint: async (input) => {
      filedInputs.push(input);
      const detail = buildCaseDetail({
        latestCompletedFormFiling: {
          id: 'completed-form-filing-1',
          binaryFillPreviewId: input.binaryFillPreviewId ?? '',
          status: 'FILED',
          fileName: 'completed-unsigned-form.pdf',
          contentType: 'application/pdf',
          fileHash: 'binary-preview-hash-1',
          fileSizeBytes: 5,
          storageProvider: 'SHAREPOINT',
          storageFolderUrl: 'https://sharepoint.example/folder',
          storageFileUrl: 'https://sharepoint.example/file.pdf',
          storageDriveItemId: 'drive-item-1',
          approvedByType: 'OPERATOR',
          approvedByIdentifier: 'route-completed-form-filing-test',
          approvedAt: '2026-05-17T10:00:00.000Z',
          approvalNote: 'Approved after manual review.',
          filedByType: 'OPERATOR',
          filedByIdentifier: input.actorIdentifier ?? null,
          filedAt: '2026-05-17T10:01:00.000Z',
          filingNote: input.filingNote ?? null,
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
            purchaseWorkflowTriggered: false,
          },
          createdAt: '2026-05-17T10:00:00.000Z',
          updatedAt: '2026-05-17T10:01:00.000Z',
        },
      });
      return {
        item: detail,
        filing: detail.latestCompletedFormFiling!,
      };
    },
  });

  const unauthorizedResponse = await fetch(
    `${baseUrl}/account-opening/case-1/completed-form-filing/approve`,
    { method: 'POST' },
  );
  const approveResponse = await fetch(
    `${baseUrl}/account-opening/case-1/completed-form-filing/approve`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-completed-form-filing-test',
      },
      body: JSON.stringify({
        binaryFillPreviewId: 'binary-fill-preview-1',
        approvalNote:
          'Reviewed completed unsigned form for internal SharePoint filing only.',
      }),
    },
  );
  const fileResponse = await fetch(
    `${baseUrl}/account-opening/case-1/completed-form-filing/file`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-completed-form-filing-test',
      },
      body: JSON.stringify({
        binaryFillPreviewId: 'binary-fill-preview-1',
        filingNote: 'Internal SharePoint filing only.',
      }),
    },
  );
  const approvePayload = (await approveResponse.json()) as {
    filing: { status: string; metadata: Record<string, unknown> };
  };
  const filePayload = (await fileResponse.json()) as {
    filing: { status: string; storageFileUrl: string | null };
  };

  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(approveResponse.status, 200);
  assert.equal(fileResponse.status, 200);
  assert.equal(approvePayload.filing.status, 'APPROVED_FOR_FILING');
  assert.equal(
    approvePayload.filing.metadata.supplierSubmissionTriggered,
    false,
  );
  assert.equal(filePayload.filing.status, 'FILED');
  assert.equal(
    filePayload.filing.storageFileUrl,
    'https://sharepoint.example/file.pdf',
  );
  assert.equal(approvedInputs[0]?.binaryFillPreviewId, 'binary-fill-preview-1');
  assert.equal(filedInputs[0]?.binaryFillPreviewId, 'binary-fill-preview-1');
  assert.equal(
    approvedInputs[0]?.actorIdentifier,
    'internal-operator:route-completed-form-filing-test',
  );
});

test('account-opening review export routes return safe pack and downloadable files', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const exportedInputs: Array<{ id: string; actorIdentifier?: string | null }> =
    [];
  const downloadedInputs: Array<{
    id: string;
    fileName: string;
    actorIdentifier?: string | null;
  }> = [];
  const detail = buildCaseDetail({
    sourceAttachmentNames: ['mandate-account-12345678-sort-12-34-56.pdf'],
    sourceEvidence: [
      {
        id: 'evidence-1',
        sourceType: 'ATTACHMENT',
        sourceLabel: 'mandate-account-12345678-sort-12-34-56.pdf',
        fileName: 'mandate-account-12345678-sort-12-34-56.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1200,
        contentId: null,
        disposition: 'attachment',
        extractionMethod: 'PDF_TEXT',
        extractedTextHash: 'hash-1',
        extractedTextChars: 180,
        safeSnippet:
          'Direct Debit mandate with account number 12345678 and sort code 12-34-56.',
        rawFileAvailable: false,
        storageProvider: null,
        storageFolderUrl: null,
        storageFileUrl: null,
        storageDriveItemId: null,
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
      },
    ],
    completionDraft: {
      ...buildCaseDetail().completionDraft,
      status: 'BLOCKED',
      isStored: true,
      fields: [
        {
          key: 'directDebit',
          supplierLabel: 'Direct Debit',
          proposedValue: null,
          valueSource: 'NOT_PROVIDED',
          confidence: 'BLOCKED',
          riskLevel: 'BLOCKED',
          ...accountOpeningPolicyFields({
            key: 'directDebit',
            supplierLabel: 'Direct Debit',
          }),
          requiresReview: true,
          reviewReason: 'Direct Debit cannot be auto-filled.',
          evidence: [
            {
              sourceType: 'SYSTEM_RULE',
              sourceLabel: 'safety',
              snippet: 'Direct Debit requires review.',
            },
          ],
        },
      ],
    },
  });
  const baseUrl = await startServer(t, {
    exportPack: async (input) => {
      exportedInputs.push(input);
      return buildAccountOpeningReviewExportPack(
        detail,
        new Date('2026-05-16T10:00:00.000Z'),
      );
    },
    downloadExportFile: async (input) => {
      downloadedInputs.push(input);
      const file = getAccountOpeningReviewExportFile(
        buildAccountOpeningReviewExportPack(
          detail,
          new Date('2026-05-16T10:00:00.000Z'),
        ),
        input.fileName,
      );

      if (!file) {
        throw new Error('Account-opening review export file not found.');
      }

      return file;
    },
  });

  const packResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );
  const fileResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack/review-pack.md`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );
  const packText = await packResponse.text();
  const fileText = await fileResponse.text();

  assert.equal(packResponse.status, 200);
  assert.match(packText, /review-pack\.json/);
  assert.match(packText, /source-evidence\.json/);
  assert.doesNotMatch(packText, /12345678/);
  assert.doesNotMatch(packText, /12-34-56/);
  assert.equal(fileResponse.status, 200);
  assert.match(
    fileResponse.headers.get('content-disposition') ?? '',
    /review-pack\.md/,
  );
  assert.match(fileText, /This does not sign the form\./);
  assert.match(fileText, /This does not fill PDF\/Word supplier forms\./);
  assert.doesNotMatch(fileText, /12345678/);
  assert.doesNotMatch(fileText, /12-34-56/);
  assert.equal(exportedInputs[0]?.id, 'case-1');
  assert.equal(downloadedInputs[0]?.fileName, 'review-pack.md');
});

test('account-opening review export routes reject unknown and traversal filenames safely', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const downloadedInputs: Array<{ fileName: string }> = [];
  const baseUrl = await startServer(t, {
    downloadExportFile: async (input) => {
      downloadedInputs.push(input);
      return getAccountOpeningReviewExportFile(
        buildAccountOpeningReviewExportPack(buildCaseDetail()),
        input.fileName,
      ) as never;
    },
  });

  const unknownResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack/unknown.json`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );
  const traversalResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack/${encodeURIComponent('../secret.json')}`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );

  assert.equal(unknownResponse.status, 404);
  assert.equal(traversalResponse.status, 404);
  assert.equal(downloadedInputs.length, 0);
});

test('account-opening review export routes require internal operator access', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const exportedInputs: Array<{ actorIdentifier?: string | null }> = [];
  const baseUrl = await startServer(t, {
    exportPack: async (input) => {
      exportedInputs.push(input);
      return buildAccountOpeningReviewExportPack(buildCaseDetail());
    },
  });

  const missingAuthResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack`,
  );
  const validAuthResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'route-export-test',
      },
    },
  );

  assert.equal(missingAuthResponse.status, 401);
  assert.equal(validAuthResponse.status, 200);
  assert.equal(
    exportedInputs[0]?.actorIdentifier,
    'internal-operator:route-export-test',
  );
});

test('account-opening list route requires operator access and forwards status/search filters', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });

  const listInputs: Array<{
    statuses?: readonly string[];
    search?: string | null;
    limit?: number;
  }> = [];

  const listItem: AccountOpeningCaseListItem = {
    id: 'case-1',
    companyName: 'AMBE LTD',
    counterpartyEmail: 'forms@supplier.co.uk',
    counterpartyDomain: 'supplier.co.uk',
    subject: 'Supplier account opening form',
    detectedFormType: 'supplier account application',
    caseTypeHint: 'SUPPLIER',
    status: 'PENDING_REVIEW',
    recommendedSigner: 'Aman Dhillon',
    riskFlagCount: 1,
    riskFlagLabels: ['Direct Debit mandate'],
    sourceChannel: 'EMAIL',
    receivedAt: '2026-05-12T09:00:00.000Z',
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-05-12T09:05:00.000Z',
  };

  const baseUrl = await startServer(t, {
    listCases: async (filter) => {
      listInputs.push(filter ?? {});
      return [listItem];
    },
  });

  const unauthorizedResponse = await fetch(`${baseUrl}/account-opening`);
  const response = await fetch(
    `${baseUrl}/account-opening?status=PENDING_REVIEW&search=ambe&limit=10`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );
  const payload = (await response.json()) as {
    items: AccountOpeningCaseListItem[];
    total: number;
    statusFilter: string | null;
  };

  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.total, 1);
  assert.equal(payload.statusFilter, 'PENDING_REVIEW');
  assert.equal(payload.items[0]?.id, 'case-1');
  assert.equal(payload.items[0]?.caseTypeHint, 'SUPPLIER');
  assert.deepEqual(listInputs[0]?.statuses, ['PENDING_REVIEW']);
  assert.equal(listInputs[0]?.search, 'ambe');
  assert.equal(listInputs[0]?.limit, 10);
  assert.doesNotMatch(JSON.stringify(payload), /12345678/);
});

test('account-opening create route requires operator access, validates input, and creates a manual case', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });

  const createInputs: Array<{
    counterpartyName: string;
    caseType: string;
    counterpartyEmail: string | null;
  }> = [];

  const baseUrl = await startServer(t, {
    createManualCase: async (input) => {
      createInputs.push({
        counterpartyName: input.counterpartyName,
        caseType: input.caseType,
        counterpartyEmail: input.counterpartyEmail ?? null,
      });
      return {
        id: 'manual-9',
        companyName: input.counterpartyName,
        caseType: input.caseType,
        sourceChannel: 'MANUAL',
        status: 'PENDING_REVIEW',
      };
    },
  });

  const unauthorized = await fetch(`${baseUrl}/account-opening`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      counterpartyName: 'X',
      caseType: 'SUPPLIER_ONBOARDING',
    }),
  });

  const invalid = await fetch(`${baseUrl}/account-opening`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': 'test-secret',
    },
    body: JSON.stringify({ caseType: 'SUPPLIER_ONBOARDING' }),
  });

  const response = await fetch(`${baseUrl}/account-opening`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': 'test-secret',
    },
    body: JSON.stringify({
      counterpartyName: 'Example Supplier Ltd',
      counterpartyEmail: 'forms@supplier.test',
      caseType: 'SUPPLIER_ONBOARDING',
      internalNote: 'Arrived via WhatsApp.',
    }),
  });
  const payload = (await response.json()) as {
    item: { id: string; sourceChannel: string; status: string };
  };

  assert.equal(unauthorized.status, 401);
  assert.equal(invalid.status, 422);
  assert.equal(response.status, 201);
  assert.equal(payload.item.id, 'manual-9');
  assert.equal(payload.item.sourceChannel, 'MANUAL');
  assert.equal(payload.item.status, 'PENDING_REVIEW');
  assert.equal(createInputs[0]?.counterpartyName, 'Example Supplier Ltd');
  assert.equal(createInputs[0]?.caseType, 'SUPPLIER_ONBOARDING');
  assert.equal(createInputs[0]?.counterpartyEmail, 'forms@supplier.test');
});
