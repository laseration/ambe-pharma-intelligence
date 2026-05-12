import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmailInboundService } from '../service';

test('inbound email service queues account-opening forms for review before import handling', async () => {
  let importCalled = false;
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
  assert.equal(result.items[0]?.accountOpeningCase?.signingSummary.defaultSigner, 'Aman Dhillon');
  assert.match(
    result.items[0]?.accountOpeningCase?.signingSummary.signingExplanation ?? '',
    /Aman Dhillon can sign this account-opening form by default/,
  );
});
