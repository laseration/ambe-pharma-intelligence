import assert from 'node:assert/strict';
import test from 'node:test';

import type { AccountOpeningCasePersistenceInput } from '../../../accountOpening/service';
import { createEmailInboundService } from '../service';

test('inbound email service queues account-opening forms for review before import handling', async () => {
  let importCalled = false;
  const persistedCases = new Map<string, unknown>();
  const service = createEmailInboundService({
    allowedSenders: ['supplier.co.uk'],
    isTrustedSender: () => true,
    importSupplierPriceList: async () => {
      importCalled = true;
      throw new Error('import should not be called');
    },
    importInventory: async () => {
      importCalled = true;
      throw new Error('import should not be called');
    },
    importSales: async () => {
      importCalled = true;
      throw new Error('import should not be called');
    },
    parseUploadedFile: () => ({ rows: [], warnings: [] }),
    parseTextMessage: async () => ({
      totalLines: 0,
      candidateLines: 0,
      parsedRows: [],
      skippedLines: [],
      overallConfidence: 'LOW',
      reviewRecommended: true,
      reviewRequired: true,
      aiFallbackAttempted: false,
      aiFallbackUsed: false,
      aiFallbackDecision: 'not_needed',
      rawBodyText: '',
      rawBody: '',
    }),
    extractAttachmentText: async () => ({
      method: 'PDF_TEXT',
      text: 'Credit account application. Direct Debit mandate. Director signature.',
      warnings: [],
    }),
    persistAccountOpeningCase: async (input) => {
      persistedCases.set(input.accountCase.sourceFingerprint, input);
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });

  const result = await service.ingestMessage({
    from: 'forms@supplier.co.uk',
    subject: 'Account opening form',
    bodyText: 'Please complete the attached onboarding questionnaire.',
    attachments: [
      {
        fileName: 'new-account-form.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('fake').toString('base64'),
      },
    ],
  });

  assert.equal(importCalled, false);
  assert.equal(result.ignored, false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(result.items[0]?.accountOpeningCase?.status, 'pending_review');
  assert.equal(persistedCases.size, 1);
  assert.equal(
    result.items[0]?.accountOpeningCase?.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.equal(result.items[0]?.accountOpeningCase?.signingSummary.defaultSigner, 'Aman Dhillon');
  assert.match(
    result.items[0]?.accountOpeningCase?.signingSummary.signingExplanation ?? '',
    /Aman Dhillon can sign this account-opening form by default/,
  );
});

test('duplicate account-opening inbound message upserts one durable case and creates no buying action', async () => {
  const persistedCases = new Map<string, unknown>();
  const service = createEmailInboundService({
    allowedSenders: ['supplier.co.uk'],
    isTrustedSender: () => true,
    importSupplierPriceList: async () => {
      throw new Error('supplier price list import should not run for account-opening forms');
    },
    importInventory: async () => {
      throw new Error('inventory import should not run for account-opening forms');
    },
    importSales: async () => {
      throw new Error('sales import should not run for account-opening forms');
    },
    parseUploadedFile: () => ({ rows: [], warnings: [] }),
    parseTextMessage: async () => ({
      totalLines: 0,
      candidateLines: 0,
      parsedRows: [],
      skippedLines: [],
      overallConfidence: 'LOW',
      reviewRecommended: true,
      reviewRequired: true,
      aiFallbackAttempted: false,
      aiFallbackUsed: false,
      aiFallbackDecision: 'not_needed',
      rawBodyText: '',
      rawBody: '',
    }),
    extractAttachmentText: async () => ({
      method: 'PDF_TEXT',
      text: 'Director signature. Responsible Person RP GDP WDA. Direct Debit mandate bank authority guarantee.',
      warnings: [],
    }),
    persistAccountOpeningCase: async (input) => {
      persistedCases.set(input.accountCase.sourceFingerprint, input);
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });
  const message = {
    messageId: '<duplicate-account-opening>',
    from: 'forms@supplier.co.uk',
    subject: 'Credit account application',
    bodyText: 'Please complete the account opening form.',
    attachments: [
      {
        fileName: 'credit-account-application.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('fake').toString('base64'),
      },
    ],
  };

  const first = await service.ingestMessage(message);
  const second = await service.ingestMessage(message);
  const persistedInput = Array.from(persistedCases.values())[0] as AccountOpeningCasePersistenceInput;

  assert.equal(first.items[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(second.items[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(persistedCases.size, 1);
  assert.equal(persistedInput.accountCase.signingSummary.defaultSigner, 'Aman Dhillon');
  assert.ok(
    persistedInput.accountCase.signingNotes.reviewerChecks.some((check) =>
      check.includes('director-only signature'),
    ),
  );
  assert.ok(
    persistedInput.accountCase.signingNotes.reviewerChecks.some((check) =>
      check.includes('regulatory/RP wording'),
    ),
  );
  assert.ok(persistedInput.accountCase.riskFlags.includes('Direct Debit mandate'));
  assert.ok(persistedInput.accountCase.riskFlags.includes('bank authority signature'));
  assert.ok(persistedInput.accountCase.riskFlags.includes('Guarantee'));
  assert.equal(first.items[0]?.importBatchId, undefined);
  assert.equal(second.items[0]?.importBatchId, undefined);
});
