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
  downloadAccountOpeningReviewedExportFile,
  exportAccountOpeningReviewedPack,
  generateAccountOpeningDraft,
  saveAccountOpeningFieldMappings,
  sanitizeAccountOpeningMissingInfoResponses,
  saveAccountOpeningMissingInfo,
  updateAccountOpeningCaseStatus,
  writeDraftAuditEvents,
  type AccountOpeningCaseRepository,
  type AccountOpeningCaseEventInput,
  type PersistedAccountOpeningReviewCase,
} from '../service';
import type { AccountOpeningCompletionDraft } from '../draft';

test('detectAccountOpeningEmail detects account-opening body and attachment names', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Please complete new account form',
    bodyText: 'Can you return the trade account application?',
    attachmentFileNames: ['AMBE account opening form.pdf'],
  });

  assert.equal(result.detected, true);
  assert.ok(result.matchedTerms.includes('new account form'));
  assert.ok(
    result.matchedAttachmentNames.includes('AMBE account opening form.pdf'),
  );
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
    'Director signature required. Sandeep Patel. Responsible Person RP GDP WDA Dilshad Moulana. Direct Debit guarantee indemnity.',
  );

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.ok(summary.detectedNames.includes('Sandeep Patel'));
  assert.ok(summary.detectedNames.includes('Dilshad Moulana'));
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

  assert.equal(accountCase.structuredFields.companyName, 'AMBE LTD');
  assert.equal(accountCase.structuredFields.tradingName, 'AMBE MEDICAL GROUP');
  assert.equal(accountCase.structuredFields.companyNumber, 'To be confirmed');
  assert.equal(accountCase.structuredFields.vatNumber, 'To be confirmed');
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
    status: 'PENDING_REVIEW',
    recommendedSigner: 'Aman Dhillon',
    signingStatement:
      'Aman Dhillon can sign this account-opening form by default.',
    signingExplanation:
      'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: ['Sandeep Patel'],
    detectedRoles: ['Director', 'Direct Debit', 'bank authority'],
    escalationNotes: [
      'The form mentions Director/Sandeep Patel. Reviewer should confirm the supplier does not specifically require a director-only signature.',
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
    createdAt: new Date('2026-05-12T09:00:00.000Z'),
    updatedAt: new Date('2026-05-12T09:00:00.000Z'),
    ...overrides,
  };
}

function createAccountOpeningRepository(
  initial: PersistedAccountOpeningReviewCase,
) {
  let current = initial;
  let fieldMappings = initial.fieldMappings ?? [];
  const events: AccountOpeningCaseEventInput[] = [];
  const repository: AccountOpeningCaseRepository = {
    findUnique: async () => ({
      ...current,
      fieldMappings,
    }),
    update: async (args: unknown) => {
      const data =
        (args as { data?: Partial<PersistedAccountOpeningReviewCase> }).data ??
        {};
      current = {
        ...current,
        ...data,
        fieldMappings,
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
    profileId: 'ambe-master-profile',
    profileVersion: '2026-05-15',
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
        mapping.status === 'MAPPED_REVIEW_REQUIRED',
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
  assert.equal(review.mappings[0]?.status, 'MAPPED_SAFE');
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
  assert.equal(detail.draftVersion, '2026-05-15');
  assert.equal(detail.draftGeneratedAt, '2026-05-15T10:00:00.000Z');
  assert.equal(detail.completionDraft.isStored, true);
  assert.equal(detail.completionDraft.status, 'BLOCKED');
  assert.ok(eventTypes.includes('DRAFT_GENERATED'));
  assert.ok(eventTypes.includes('DRAFT_BLOCKED'));
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

  assert.deepEqual(eventTypes, ['DRAFT_GENERATED', 'DRAFT_BLOCKED']);
});

test('review-required draft records generated plus review-required routing only', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'REVIEW_REQUIRED' }),
  });

  assert.deepEqual(eventTypes, ['DRAFT_GENERATED', 'DRAFT_REVIEW_REQUIRED']);
});

test('ready draft records generated plus ready-for-review routing only', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'READY_FOR_REVIEW' }),
  });

  assert.deepEqual(eventTypes, ['DRAFT_GENERATED', 'DRAFT_READY_FOR_REVIEW']);
});

test('regenerated draft records regenerated plus exactly one routing event', async () => {
  const eventTypes = await recordDraftAuditEventTypes({
    draft: buildDraftFixture({ status: 'BLOCKED' }),
    generatedActionType: 'DRAFT_REGENERATED',
  });

  assert.deepEqual(eventTypes, ['DRAFT_REGENERATED', 'DRAFT_BLOCKED']);
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
