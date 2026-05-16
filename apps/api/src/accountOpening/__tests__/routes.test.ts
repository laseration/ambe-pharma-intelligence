import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import express from 'express';

import { env } from '../../config/env';
import { errorHandler } from '../../http/errors';
import { createAccountOpeningRouter } from '../routes';
import {
  buildAccountOpeningReviewExportPack,
  getAccountOpeningReviewExportFile,
} from '../reviewExport';
import type {
  AccountOpeningCaseDetail,
  AccountOpeningMissingInfoResponses,
} from '../service';

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
    draftStatus: null,
    draftVersion: null,
    draftGeneratedAt: null,
    sourceEvidence: [],
    completionDraft: {
      status: 'PREVIEW',
      overallConfidence: 'BLOCKED',
      isStored: false,
      profileId: 'ambe-master-profile',
      profileVersion: '2026-05-15',
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
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-05-12T09:05:00.000Z',
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
    getFieldMappings: async () => defaultDetail.fieldMappings,
    saveFieldMappings: async () => defaultDetail.fieldMappings,
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
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    generateDraft: async () => buildCaseDetail(),
    saveMissingInfo: async () => buildCaseDetail(),
    updateStatus: async () => buildCaseDetail(),
  });

  const response = await fetch(`${baseUrl}/account-opening/case-1`);
  const payload = (await response.json()) as { item: AccountOpeningCaseDetail };

  assert.equal(response.status, 200);
  assert.equal(payload.item.id, 'case-1');
  assert.equal(
    payload.item.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.equal('rawExtractedText' in payload.item, false);
});

test('account-opening missing-info route saves sanitized review fields with audit actor', async (t) => {
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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

  const readResponse = await fetch(`${baseUrl}/account-opening/case-1/draft`);
  const generateResponse = await fetch(
    `${baseUrl}/account-opening/case-1/generate-draft`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

test('account-opening review export routes return safe pack and downloadable files', async (t) => {
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
          proposedValue: 'To be confirmed in secure review',
          valueSource: 'SYSTEM_PLACEHOLDER',
          confidence: 'BLOCKED',
          riskLevel: 'BLOCKED',
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
  );
  const fileResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack/review-pack.md`,
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
  );
  const traversalResponse = await fetch(
    `${baseUrl}/account-opening/case-1/export-pack/${encodeURIComponent('../secret.json')}`,
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
