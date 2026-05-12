import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAccountOpeningCase,
  buildAccountOpeningCasePersistenceData,
  buildAccountOpeningCaseDetail,
  buildAccountOpeningSigningNotes,
  buildAccountOpeningSigningSummary,
  buildAccountOpeningSourceFingerprint,
  detectAccountOpeningEmail,
  prepareAccountOpeningSharePointStorage,
  sanitizeAccountOpeningMissingInfoResponses,
  saveAccountOpeningMissingInfo,
  updateAccountOpeningCaseStatus,
  type AccountOpeningCaseRepository,
  type PersistedAccountOpeningReviewCase,
} from '../service';
import type { AccountOpeningSharePointArchiveConfig } from '../sharePointArchive';

test('detectAccountOpeningEmail detects account-opening body and attachment names', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Please complete new account form',
    bodyText: 'Can you return the trade account application?',
    attachmentFileNames: ['AMBE account opening form.pdf'],
  });

  assert.equal(result.detected, true);
  assert.ok(result.matchedTerms.includes('new account form'));
  assert.ok(result.matchedAttachmentNames.includes('AMBE account opening form.pdf'));
});

test('detectAccountOpeningEmail does not classify normal supplier price lists', () => {
  const result = detectAccountOpeningEmail({
    subject: 'May supplier price list',
    bodyText: 'Please find our wholesale price list attached. Amlodipine 5mg tablets GBP 1.20.',
    attachmentFileNames: ['supplier-price-list-may.xlsx'],
  });

  assert.equal(result.detected, false);
});

test('detectAccountOpeningEmail does not classify invoices or account statements', () => {
  const invoiceResult = detectAccountOpeningEmail({
    subject: 'Invoice and statement',
    bodyText: 'Attached invoice, delivery note and wholesale account statement for your records.',
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
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Credit account application',
    bodyText: 'Please complete the Direct Debit mandate and personal guarantee section.',
    receivedAt: new Date('2026-05-12T10:00:00.000Z'),
    attachments: [],
    sharePoint,
  });

  assert.equal(accountCase.structuredFields.directDebitRequested, true);
  assert.equal(accountCase.structuredFields.guaranteeDetected, true);
  assert.ok(accountCase.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.riskFlags.includes('Personal guarantee'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('Personal guarantee'));
});

test('signer recommendation keeps Aman as default and explains director/regulatory/high-risk escalation', () => {
  const summary = buildAccountOpeningSigningSummary(
    'Director signature required. Sandeep Patel. Responsible Person RP GDP WDA Dilshad Moulana. Direct Debit guarantee indemnity.',
  );

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.ok(summary.detectedNames.includes('Sandeep Patel'));
  assert.ok(summary.detectedNames.includes('Dilshad Moulana'));
  assert.ok(summary.detectedSignatureRoles.includes('Director'));
  assert.ok(summary.signingExplanation.includes('Aman Dhillon can sign this account-opening form by default.'));
  assert.ok(summary.escalationNotes.some((note) => note.includes('director-only signature')));
  assert.ok(summary.escalationNotes.some((note) => note.includes('regulatory/RP wording')));
  assert.ok(summary.escalationNotes.some((note) => note.includes('High-risk section detected')));
});

test('Director wording keeps Aman as default signer with director-only escalation note', () => {
  const summary = buildAccountOpeningSigningSummary('Director signature box for the account opening form.');
  const notes = buildAccountOpeningSigningNotes({
    signingSummary: summary,
    riskFlags: ['Guarantee'],
    missingOrUnclear: [],
  });

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.match(summary.signingExplanation, /Aman Dhillon can sign this account-opening form by default/);
  assert.ok(summary.escalationNotes.some((note) => note.includes('director-only signature')));
  assert.equal(notes.recommendedSigner, 'Aman Dhillon');
  assert.ok(notes.reviewerChecks.some((check) => check.includes('director-only signature')));
});

test('RP GDP WDA wording keeps Aman as default signer with regulatory check note', () => {
  const summary = buildAccountOpeningSigningSummary('Responsible Person RP GDP WDA declaration.');
  const notes = buildAccountOpeningSigningNotes({
    signingSummary: summary,
    riskFlags: ['RP/GDP/WDA regulatory declaration'],
    missingOrUnclear: [],
  });

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.match(summary.signingExplanation, /Aman Dhillon can sign this account-opening form by default/);
  assert.ok(summary.escalationNotes.some((note) => note.includes('regulatory/RP wording')));
  assert.ok(notes.reviewerChecks.some((check) => check.includes('regulatory/RP wording')));
});

test('unknown account-opening fields remain To be confirmed', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Supplier onboarding questionnaire',
    bodyText: 'Please complete this supplier onboarding questionnaire.',
    attachments: [],
    sharePoint,
  });

  assert.equal(accountCase.structuredFields.companyName, 'AMBE LTD');
  assert.equal(accountCase.structuredFields.tradingName, 'AMBE MEDICAL GROUP');
  assert.equal(accountCase.structuredFields.companyNumber, 'To be confirmed');
  assert.equal(accountCase.structuredFields.vatNumber, 'To be confirmed');
  assert.ok(accountCase.missingFields.includes('companyNumber'));
  assert.ok(accountCase.missingFields.includes('registeredAddress'));
  assert.ok(accountCase.signingNotes.missingOrUnclear.includes('companyNumber'));
});

test('ordinary account-opening form generates signing notes', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText: 'Please complete the account opening form.',
    attachments: [],
    sharePoint,
  });

  assert.equal(accountCase.signingNotes.title, 'Account opening signing notes');
  assert.equal(accountCase.signingNotes.recommendedSigner, 'Aman Dhillon');
  assert.equal(
    accountCase.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.match(accountCase.signingNotes.summary, /Leave signature fields blank/);
});

test('Direct Debit bank authority and guarantee wording appear in signing note risk flags', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText: 'Direct Debit mandate, bank authority signature, guarantee and indemnity sections apply.',
    attachments: [],
    sharePoint,
  });

  assert.ok(accountCase.signingNotes.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('bank authority signature'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('Guarantee'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('indemnity'));
});

test('dashboard-facing signing notes do not include bank account numbers', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText:
      'Please complete the Direct Debit mandate. Account number 12345678 sort code 12-34-56 bank authority required.',
    attachments: [],
    sharePoint,
  });
  const dashboardFacingNotes = JSON.stringify(accountCase.signingNotes);

  assert.doesNotMatch(dashboardFacingNotes, /12345678/);
  assert.doesNotMatch(dashboardFacingNotes, /12-34-56/);
  assert.match(dashboardFacingNotes, /Direct Debit mandate/);
  assert.match(dashboardFacingNotes, /bank authority signature/);
});

test('SharePoint disabled path does not fail and records skipped upload note', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({
    enabled: false,
    siteId: '',
    driveId: '',
    folder: '',
  });

  assert.equal(sharePoint.enabled, false);
  assert.equal(sharePoint.folderUrl, null);
  assert.equal(sharePoint.status, 'SKIPPED_DISABLED');
  assert.match(sharePoint.note, /upload skipped/i);
  assert.match(sharePoint.skippedReason ?? '', /disabled|configured/i);
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
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText:
      'Please complete the Direct Debit mandate. Account number 12345678 sort code 12-34-56 bank authority required.',
    attachments: [{ fileName: 'direct-debit-form.pdf', extractedText: null }],
    sharePoint,
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
  assert.match(String(payload.create.sharePointNote), /upload skipped/i);
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
    status: 'PENDING_REVIEW',
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
    reviewerChecks: [
      'Check whether the supplier specifically requires a director-only signature.',
      'Leave all signature fields blank unless a human reviewer approves signing.',
    ],
    signingNotes: {
      title: 'Account opening signing notes',
      recommendedSigner: 'Aman Dhillon',
      defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
      detectedNames: ['Sandeep Patel'],
      detectedRolesOrSections: ['Director', 'Direct Debit', 'bank authority'],
      reviewerChecks: [
        'Check whether the supplier specifically requires a director-only signature.',
        'Leave all signature fields blank unless a human reviewer approves signing.',
      ],
      riskFlags: ['Direct Debit mandate', 'bank authority signature', 'Guarantee'],
      missingOrUnclear: ['companyNumber', 'vatNumber'],
      signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
      summary:
        'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default. Leave signature fields blank until approved by a human reviewer.',
    },
    missingInfoResponses: {},
    extractedTextSummary: 'Extracted account-opening text from email body (40 chars).',
    sharePointStatus: 'SKIPPED_DISABLED',
    sharePointNote: 'SharePoint upload skipped; review item was still created.',
    sharePointSkippedReason: 'SharePoint account-opening upload is disabled.',
    sharePointLastAttemptAt: null,
    sharePointFolderUrl: null,
    sourceAttachmentNames: ['account-opening-form.pdf'],
    createdAt: new Date('2026-05-12T09:00:00.000Z'),
    updatedAt: new Date('2026-05-12T09:00:00.000Z'),
    ...overrides,
  };
}

function createAccountOpeningRepository(initial: PersistedAccountOpeningReviewCase) {
  let current = initial;
  const events: unknown[] = [];
  const repository: AccountOpeningCaseRepository = {
    findUnique: async () => current,
    update: async (args: unknown) => {
      const data = (args as { data?: Partial<PersistedAccountOpeningReviewCase> }).data ?? {};
      current = {
        ...current,
        ...data,
        updatedAt: new Date('2026-05-12T10:00:00.000Z'),
      };
      return current;
    },
    createEvent: async (args) => {
      events.push(args.data);
      return args.data;
    },
  };

  return {
    repository,
    events,
    getCurrent: () => current,
  };
}

test('missing-info responses are sanitized before dashboard display', () => {
  const responses = sanitizeAccountOpeningMissingInfoResponses({
    website: 'https://supplier.example',
    reviewerNotes: 'Account number 12345678 and sort code 12-34-56 were on the mandate.',
  });

  assert.equal(responses.website, 'https://supplier.example');
  assert.match(responses.reviewerNotes ?? '', /\[redacted bank account number\]/);
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
      sourceAttachmentNames: ['bank-mandate-account-12345678-sort-12-34-56.pdf'],
    }),
  );
  const dashboardText = JSON.stringify(detail);

  assert.equal(detail.signingNotes.defaultSigningStatement, 'Aman Dhillon can sign this account-opening form by default.');
  assert.ok(detail.detectedNames.includes('Sandeep Patel'));
  assert.ok(detail.detectedRoles.includes('Director'));
  assert.ok(detail.riskFlags.includes('Direct Debit mandate'));
  assert.match(detail.sharePointNote ?? '', /upload skipped/i);
  assert.doesNotMatch(dashboardText, /12345678/);
  assert.doesNotMatch(dashboardText, /12-34-56/);
});

test('saving missing info persists responses and records an audit event', async () => {
  const { repository, events, getCurrent } = createAccountOpeningRepository(buildPersistedAccountOpeningCase());

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
  assert.equal((events[0] as { actionType?: string }).actionType, 'MISSING_INFO_SAVED');
  assert.equal((events[0] as { previousStatus?: string }).previousStatus, 'PENDING_REVIEW');
  assert.equal(getCurrent().status, 'PENDING_REVIEW');
});

test('approve for completion changes account-opening status without send/sign/upload side effects', async () => {
  const { repository, events } = createAccountOpeningRepository(buildPersistedAccountOpeningCase());

  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'APPROVED_FOR_COMPLETION',
    note: 'Ready for human completion only.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
    sharePointConfig: {
      enabled: false,
      siteId: '',
      driveId: '',
      baseFolder: 'Account Opening',
      graphAuthConfigured: false,
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(detail.status, 'APPROVED_FOR_COMPLETION');
  assert.equal(detail.sharePointStatus, 'SKIPPED_DISABLED');
  assert.match(detail.sharePointNote ?? '', /upload skipped/i);
  assert.equal(detail.sharePointLastAttemptAt, '2026-05-12T10:00:00.000Z');
  assert.equal((events[0] as { actionType?: string }).actionType, 'APPROVED_FOR_COMPLETION');
  assert.equal((events[0] as { newStatus?: string }).newStatus, 'APPROVED_FOR_COMPLETION');
  assert.equal((events[1] as { actionType?: string }).actionType, 'SHAREPOINT_ARCHIVE_SKIPPED');
});

test('enabled SharePoint archive adapter is called only for approve for completion', async () => {
  const enabledConfig: AccountOpeningSharePointArchiveConfig = {
    enabled: true,
    siteId: 'site-1',
    driveId: 'drive-1',
    baseFolder: 'Account Opening',
    graphAuthConfigured: true,
  };
  const needsInfo = createAccountOpeningRepository(buildPersistedAccountOpeningCase());
  let uploadCalls = 0;

  await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'MARKED_NEEDS_INFO',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository: needsInfo.repository,
    sharePointConfig: enabledConfig,
    sharePointUploader: {
      uploadArchivePack: async () => {
        uploadCalls += 1;
        return { folderUrl: 'https://sharepoint.example/folder', uploadedFileNames: [] };
      },
    },
  });

  const approved = createAccountOpeningRepository(buildPersistedAccountOpeningCase());
  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'APPROVED_FOR_COMPLETION',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository: approved.repository,
    sharePointConfig: enabledConfig,
    sharePointUploader: {
      uploadArchivePack: async (pack) => {
        uploadCalls += 1;
        const packText = JSON.stringify(pack);
        assert.match(packText, /signing-notes\.json/);
        assert.match(packText, /risk-summary\.json/);
        assert.match(packText, /missing-info\.json/);
        assert.doesNotMatch(packText, /12345678/);
        assert.doesNotMatch(packText, /12-34-56/);
        return {
          folderUrl: 'https://sharepoint.example/folder',
          uploadedFileNames: pack.files.map((file) => file.fileName),
        };
      },
    },
    now: new Date('2026-05-12T10:00:00.000Z'),
  });

  assert.equal(uploadCalls, 1);
  assert.equal(detail.sharePointStatus, 'UPLOADED');
  assert.equal(detail.sharePointFolderUrl, 'https://sharepoint.example/folder');
});

test('mark needs info changes account-opening status and records review event', async () => {
  const { repository, events } = createAccountOpeningRepository(buildPersistedAccountOpeningCase());

  const detail = await updateAccountOpeningCaseStatus({
    id: 'account-case-1',
    action: 'MARKED_NEEDS_INFO',
    note: 'Website and GPhC number needed.',
    actorType: 'OPERATOR',
    actorIdentifier: 'test-reviewer',
    repository,
  });

  assert.equal(detail.status, 'NEEDS_INFO');
  assert.equal((events[0] as { actionType?: string }).actionType, 'MARKED_NEEDS_INFO');
  assert.equal((events[0] as { newStatus?: string }).newStatus, 'NEEDS_INFO');
});

test('reject changes account-opening status without send/sign/upload side effects', async () => {
  const { repository, events } = createAccountOpeningRepository(buildPersistedAccountOpeningCase());

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
