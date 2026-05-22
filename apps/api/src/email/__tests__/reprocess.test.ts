import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reprocessEmailMessages,
  type EmailReprocessDependencies,
  type ReprocessGraphMessage,
} from '../reprocess';
import type { EmailInboundMessage, EmailInboundResult } from '../inbound/types';

function createLogger() {
  return {
    errorCalls: [] as Array<{
      message: string;
      meta?: Record<string, unknown>;
    }>,
    infoCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    warnCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    error(message: string, meta?: Record<string, unknown>) {
      this.errorCalls.push({ message, meta });
    },
    info(message: string, meta?: Record<string, unknown>) {
      this.infoCalls.push({ message, meta });
    },
    warn(message: string, meta?: Record<string, unknown>) {
      this.warnCalls.push({ message, meta });
    },
  };
}

function graphMessage(
  overrides: Partial<ReprocessGraphMessage> = {},
): ReprocessGraphMessage {
  return {
    id: 'graph-1',
    isRead: true,
    internetMessageId: '<internet-1>',
    conversationId: 'conversation-1',
    receivedDateTime: '2026-05-19T10:00:00.000Z',
    from: {
      emailAddress: {
        address: 'forms@supplier.co.uk',
        name: 'Supplier Forms',
      },
    },
    subject: 'Account opening form',
    body: {
      contentType: 'text',
      content: 'Please complete the attached account opening form.',
    },
    hasAttachments: true,
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<EmailReprocessDependencies> = {},
): EmailReprocessDependencies {
  const logger = createLogger();

  return {
    listMessages: async () => [graphMessage()],
    listAttachments: async () => [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'blank-account-opening-form.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('fake-pdf').toString('base64'),
      },
    ],
    lookupExistingInboundEmail: async () => null,
    ingestAccountOpeningMessage: async () => ({
      ignored: false,
      items: [
        {
          processingStatus: 'REVIEW_REQUIRED',
          inferredImportType: null,
          confidence: 'HIGH',
          reason: 'Account opening form detected.',
          fileType: 'PDF',
          attachment: {
            fileName: 'blank-account-opening-form.pdf',
            mimeType: 'application/pdf',
            size: null,
            contentId: null,
            disposition: 'attachment',
          },
          email: {
            messageId: '<internet-1>',
            from: 'forms@supplier.co.uk',
            subject: 'Account opening form',
            bodyText: 'Please complete the attached account opening form.',
          },
          accountOpeningCase: {
            sourceFingerprint: 'fingerprint-1',
            senderEmail: 'forms@supplier.co.uk',
            senderDomain: 'supplier.co.uk',
            subject: 'Account opening form',
            receivedDate: '2026-05-19T10:00:00.000Z',
            detectedCompanyOrSupplierName: null,
            originalAttachmentNames: ['blank-account-opening-form.pdf'],
            status: 'pending_review',
            riskFlags: [],
            missingFields: [],
            structuredFields: {
              companyName: 'To be confirmed',
              tradingName: 'To be confirmed',
              companyNumber: 'To be confirmed',
              vatNumber: 'To be confirmed',
              registeredAddress: 'To be confirmed',
              tradingAddress: 'To be confirmed',
              contactName: 'To be confirmed',
              contactEmail: 'To be confirmed',
              contactPhone: 'To be confirmed',
              accountsContact: 'To be confirmed',
              paymentMethodRequested: 'To be confirmed',
              directDebitRequested: false,
              guaranteeDetected: false,
              regulatoryDeclarationDetected: false,
              riskyTerms: [],
              missingOrUnclear: [],
              recommendedSigner: 'Aman Dhillon',
            },
            signingSummary: {
              defaultSigner: 'Aman Dhillon',
              detectedNames: [],
              detectedSignatureRoles: [],
              canAmanSign: true,
              signingExplanation:
                'Aman Dhillon can sign this account-opening form by default.',
              escalationNotes: [],
            },
            signingNotes: {
              title: 'Account opening signing notes',
              recommendedSigner: 'Aman Dhillon',
              defaultSigningStatement:
                'Aman Dhillon can sign this account-opening form by default.',
              detectedNames: [],
              detectedRolesOrSections: [],
              reviewerChecks: [],
              riskFlags: [],
              missingOrUnclear: [],
              signatureInstruction:
                'Do not sign automatically. Human approval is required.',
              summary:
                'Recommended signer: Aman Dhillon. Human approval is required before signing.',
            },
            sourceEvidence: [],
            extractedTextSummary: 'Account-opening review case.',
          },
        },
      ],
    }),
    extractAttachmentText: async () => null,
    logger,
    ...overrides,
  };
}

test('email reprocess dry run lists read account-opening candidates without ingesting', async () => {
  let ingestCalls = 0;
  const dependencies = createDependencies({
    lookupExistingInboundEmail: async () => ({
      id: 'inbound-1',
      processingStatus: 'REVIEW_REQUIRED',
    }),
    ingestAccountOpeningMessage: async () => {
      ingestCalls += 1;
      throw new Error('dry run should not ingest');
    },
  });

  const results = await reprocessEmailMessages(
    {
      subjectContains: 'account opening',
      limit: 10,
      includeRead: true,
      unreadOnly: false,
      dryRun: true,
      forceAccountOpening: true,
    },
    dependencies,
  );

  assert.equal(ingestCalls, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.action, 'DRY_RUN_REFRESH');
  assert.equal(results[0]?.existingInboundEmailId, 'inbound-1');
  assert.equal(results[0]?.correlationId, 'MICROSOFT_GRAPH:graph-1');
  assert.equal(results[0]?.sideEffectOperation, null);
  assert.equal(results[0]?.accountOpeningCandidate, true);
  assert.deepEqual(results[0]?.attachmentFileNames, [
    'blank-account-opening-form.pdf',
  ]);
});

test('email reprocess skips already-ingested account-opening messages unless force is set', async () => {
  let ingestCalls = 0;
  const dependencies = createDependencies({
    lookupExistingInboundEmail: async () => ({
      id: 'inbound-1',
      processingStatus: 'REVIEW_REQUIRED',
    }),
    ingestAccountOpeningMessage: async () => {
      ingestCalls += 1;
      throw new Error('already-ingested message should be skipped');
    },
  });

  const results = await reprocessEmailMessages(
    {
      subjectContains: 'account opening',
      limit: 10,
      includeRead: true,
      unreadOnly: false,
      dryRun: false,
      forceAccountOpening: false,
    },
    dependencies,
  );

  assert.equal(ingestCalls, 0);
  assert.equal(results[0]?.action, 'SKIPPED');
  assert.match(results[0]?.note ?? '', /force-account-opening/);
});

test('email reprocess force refreshes existing account-opening messages safely', async () => {
  const ingestedMessages: EmailInboundMessage[] = [];
  const dependencies = createDependencies({
    lookupExistingInboundEmail: async () => ({
      id: 'inbound-1',
      processingStatus: 'REVIEW_REQUIRED',
    }),
    ingestAccountOpeningMessage: async (message) => {
      ingestedMessages.push(message);
      return {
        ignored: false,
        items: [
          {
            processingStatus: 'REVIEW_REQUIRED',
            inferredImportType: null,
            confidence: 'HIGH',
            reason: 'Account opening form detected.',
            fileType: 'PDF',
            attachment: {
              fileName: 'blank-account-opening-form.pdf',
              mimeType: 'application/pdf',
              size: null,
              contentId: null,
              disposition: 'attachment',
            },
            email: {
              messageId: message.messageId ?? null,
              from: message.from,
              subject: message.subject ?? '',
              bodyText: message.bodyText ?? '',
            },
            accountOpeningCase:
              {} as EmailInboundResult['items'][number]['accountOpeningCase'],
          },
        ],
      };
    },
  });

  const results = await reprocessEmailMessages(
    {
      subjectContains: 'account opening',
      limit: 10,
      includeRead: true,
      unreadOnly: false,
      dryRun: false,
      forceAccountOpening: true,
    },
    dependencies,
  );

  assert.equal(results[0]?.action, 'UPDATED');
  assert.equal(results[0]?.sideEffectOperation, 'EMAIL_REPROCESS_EXECUTE');
  assert.equal(results[0]?.sideEffectPolicy?.dryRunShouldExist, true);
  assert.equal(
    results[0]?.sideEffectPolicy?.supplierFacingSendOrSubmitForbidden,
    true,
  );
  assert.equal(results[0]?.itemCount, 1);
  assert.equal(ingestedMessages.length, 1);
  assert.equal(ingestedMessages[0]?.externalMessageId, 'graph-1');
  assert.equal(
    ingestedMessages[0]?.attachments?.[0]?.fileName,
    'blank-account-opening-form.pdf',
  );
});

test('email reprocess skips non-account-opening messages before ingestion', async () => {
  let ingestCalls = 0;
  const dependencies = createDependencies({
    listMessages: async () => [
      graphMessage({
        subject: 'Supplier price list',
        body: {
          contentType: 'text',
          content: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
        },
        hasAttachments: false,
      }),
    ],
    listAttachments: async () => {
      throw new Error('attachments should not be fetched');
    },
    ingestAccountOpeningMessage: async () => {
      ingestCalls += 1;
      throw new Error('non-account-opening message should not ingest');
    },
  });

  const results = await reprocessEmailMessages(
    {
      subjectContains: 'supplier price',
      limit: 10,
      includeRead: true,
      unreadOnly: false,
      dryRun: false,
      forceAccountOpening: true,
    },
    dependencies,
  );

  assert.equal(ingestCalls, 0);
  assert.equal(results[0]?.action, 'SKIPPED');
  assert.equal(results[0]?.accountOpeningCandidate, false);
});

test('email reprocess detects already-seen account-opening messages from extracted attachment text', async () => {
  const ingestedMessages: EmailInboundMessage[] = [];
  const dependencies = createDependencies({
    listMessages: async () => [
      graphMessage({
        subject: 'Documents attached',
        body: {
          contentType: 'text',
          content: 'Please review the attached form.',
        },
        hasAttachments: true,
      }),
    ],
    listAttachments: async () => [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'form.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('fake-pdf').toString('base64'),
      },
    ],
    lookupExistingInboundEmail: async () => ({
      id: 'inbound-1',
      processingStatus: 'REVIEW_REQUIRED',
    }),
    extractAttachmentText: async () => ({
      method: 'PDF_TEXT',
      text: 'New account application. Company details, VAT number, WDA number.',
      warnings: [],
    }),
    ingestAccountOpeningMessage: async (message) => {
      ingestedMessages.push(message);
      return {
        ignored: false,
        items: [
          {
            processingStatus: 'REVIEW_REQUIRED',
            inferredImportType: null,
            confidence: 'HIGH',
            reason: 'Account opening form detected.',
            fileType: 'PDF',
            attachment: {
              fileName: 'form.pdf',
              mimeType: 'application/pdf',
              size: null,
              contentId: null,
              disposition: 'attachment',
            },
            email: {
              messageId: message.messageId ?? null,
              from: message.from,
              subject: message.subject ?? '',
              bodyText: message.bodyText ?? '',
            },
            accountOpeningCase:
              {} as EmailInboundResult['items'][number]['accountOpeningCase'],
          },
        ],
      };
    },
  });

  const results = await reprocessEmailMessages(
    {
      subjectContains: 'documents',
      limit: 10,
      includeRead: true,
      unreadOnly: false,
      dryRun: false,
      forceAccountOpening: true,
    },
    dependencies,
  );

  assert.equal(results[0]?.action, 'UPDATED');
  assert.equal(results[0]?.accountOpeningCandidate, true);
  assert.match(results[0]?.classificationReason ?? '', /attachment text/);
  assert.equal(ingestedMessages.length, 1);
});
