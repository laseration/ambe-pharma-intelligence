import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAccountOpeningArchivePack,
  buildAccountOpeningArchiveFolderPath,
  uploadAccountOpeningArchivePack,
  type AccountOpeningSharePointArchiveConfig,
} from '../sharePointArchive';
import type { AccountOpeningCaseDetail } from '../service';

const enabledConfig: AccountOpeningSharePointArchiveConfig = {
  enabled: true,
  siteId: 'site-1',
  driveId: 'drive-1',
  baseFolder: 'Account Opening',
  graphAuthConfigured: true,
};

const disabledConfig: AccountOpeningSharePointArchiveConfig = {
  ...enabledConfig,
  enabled: false,
  graphAuthConfigured: false,
};

function buildDetail(overrides: Partial<AccountOpeningCaseDetail> = {}): AccountOpeningCaseDetail {
  return {
    id: 'account-case-abcdefghi',
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
    signingStatement: 'Aman Dhillon can sign this account-opening form by default.',
    signingExplanation: 'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: ['Sandeep Patel'],
    detectedRoles: ['Director', 'Direct Debit', 'bank authority'],
    escalationNotes: [
      'The form mentions Director/Sandeep Patel. Reviewer should confirm the supplier does not specifically require a director-only signature.',
    ],
    riskFlags: ['Direct Debit mandate', 'bank authority signature', 'Guarantee'],
    missingFields: ['companyNumber', 'vatNumber'],
    reviewerChecks: ['Check whether the supplier specifically requires a director-only signature.'],
    signingNotes: {
      title: 'Account opening signing notes',
      recommendedSigner: 'Aman Dhillon',
      defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
      detectedNames: ['Sandeep Patel'],
      detectedRolesOrSections: ['Director', 'Direct Debit', 'bank authority'],
      reviewerChecks: ['Check whether the supplier specifically requires a director-only signature.'],
      riskFlags: ['Direct Debit mandate', 'bank authority signature', 'Guarantee'],
      missingOrUnclear: ['companyNumber', 'vatNumber'],
      signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
      summary:
        'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default.',
    },
    missingInfoResponses: {
      website: 'https://supplier.example',
      reviewerNotes: 'Account number 12345678 and sort code 12-34-56 were seen on the mandate.',
    },
    extractedTextSummary: 'Raw form text said account number 12345678 sort code 12-34-56.',
    sharePointStatus: 'CONFIGURED',
    sharePointNote: 'Configured.',
    sharePointSkippedReason: null,
    sharePointLastAttemptAt: null,
    sharePointFolderUrl: null,
    sourceAttachmentNames: ['mandate-account-12345678-sort-12-34-56.pdf'],
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-05-12T09:00:00.000Z',
    ...overrides,
  };
}

test('archive folder path uses account-opening approved folder format', () => {
  const folderPath = buildAccountOpeningArchiveFolderPath(
    buildDetail(),
    enabledConfig,
    new Date('2026-05-12T10:00:00.000Z'),
  );

  assert.equal(folderPath, 'Account Opening/Approved/Supplier Ltd - 2026-05-12 - account-');
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
    'original-attachments.json',
  ]);
  assert.equal(pack.metadata.rawExtractedTextIncluded, false);
  assert.equal(pack.metadata.signedFormsIncluded, false);
  assert.match(packText, /Direct Debit mandate/);
  assert.match(packText, /https:\/\/supplier\.example/);
  assert.doesNotMatch(packText, /Raw form text said/);
  assert.doesNotMatch(packText, /12345678/);
  assert.doesNotMatch(packText, /12-34-56/);
});

test('disabled SharePoint archive path skips without calling adapter', async () => {
  let called = false;
  const result = await uploadAccountOpeningArchivePack({
    item: buildDetail(),
    config: disabledConfig,
    uploader: {
      uploadArchivePack: async () => {
        called = true;
        return { folderUrl: 'https://sharepoint.example/folder', uploadedFileNames: [] };
      },
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(called, false);
  assert.equal(result.status, 'SKIPPED_DISABLED');
  assert.match(result.note, /upload skipped/i);
  assert.match(result.skippedReason ?? '', /disabled/i);
});

test('enabled SharePoint archive path calls adapter with safe payload', async () => {
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
  assert.doesNotMatch(uploadedPackText, /Raw form text said/);
  assert.doesNotMatch(uploadedPackText, /12345678/);
  assert.doesNotMatch(uploadedPackText, /12-34-56/);
});
