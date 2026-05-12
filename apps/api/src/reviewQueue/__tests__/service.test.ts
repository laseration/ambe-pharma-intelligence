import assert from 'node:assert/strict';
import test from 'node:test';

import { createReviewQueueService } from '../service';

test('review queue includes Telegram review items', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () =>
      [
        {
          id: 'tg-1',
          telegramMessageId: '1',
          telegramUserId: 'user-1',
          telegramChatId: 'chat-1',
          senderDisplayName: 'Jane Doe',
          fileType: 'PDF',
          fileName: 'quote.pdf',
          mimeType: 'application/pdf',
          telegramFileId: 'file-1',
          telegramFileUniqueId: 'unique-1',
          caption: 'supplier quote',
          processingStatus: 'REVIEW_REQUIRED',
          linkedImportBatchId: 'batch-1',
          errorMessage: null,
          metadata: { reason: 'File type requires manual review.' },
          createdAt: new Date('2026-04-19T12:00:00.000Z'),
          updatedAt: new Date('2026-04-19T12:00:00.000Z'),
          linkedImportBatch: {
            id: 'batch-1',
            kind: 'SUPPLIER_PRICE_LIST',
            status: 'COMPLETED',
            totalRows: 10,
            validRows: 8,
            invalidRows: 2,
          },
        },
      ] as never,
    listEmailReviewItems: () => [],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items.length, 1);
  assert.match(items[0]?.id ?? '', /^telegram-review-/);
  assert.equal(items[0]?.sourceType, 'TELEGRAM_INBOUND');
  assert.equal(items[0]?.sender, 'Jane Doe');
  assert.equal(items[0]?.fileName, 'quote.pdf');
  assert.equal(items[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(items[0]?.reason, 'File type requires manual review.');
  assert.equal(items[0]?.reviewSummary?.reviewReason, 'PDF file received and needs manual review');
  assert.match(items[0]?.reviewSummary?.missingOrUnclear ?? '', /cannot be routed/i);
  assert.equal(items[0]?.linkedImportBatch?.id, 'batch-1');
});

test('review queue includes regulatory review items with safe wording', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () => [],
    listEmailReviewItems: () => [],
    listEmailDerivedOfferItems: async () => [],
    listRegulatoryReviewItems: async () =>
      [
        {
          id: 'reg-review-1',
          regulatorySignalId: 'signal-1',
          regulatoryProductMatchId: null,
          productId: null,
          status: 'NEW',
          priority: 'HIGH',
          reason: 'No safe existing product match was found. Requires compliance review.',
          latestNote: null,
          assigneeLabel: null,
          completedAt: null,
          createdAt: new Date('2026-05-01T10:00:00.000Z'),
          updatedAt: new Date('2026-05-01T10:00:00.000Z'),
          product: null,
          regulatoryProductMatch: null,
          regulatorySignal: {
            id: 'signal-1',
            regulatoryUpdateId: 'update-1',
            eventType: 'RECALL',
            severity: 'HIGH',
            summary: 'Potentially relevant update: Drug alert.',
            affectedProductText: 'Amlodipine 5mg tablets 28',
            activeSubstance: null,
            manufacturer: null,
            licenceNumber: null,
            batchNumber: null,
            parserVersion: 'test',
            confidence: 80,
            evidence: null,
            createdAt: new Date('2026-05-01T10:00:00.000Z'),
            updatedAt: new Date('2026-05-01T10:00:00.000Z'),
            regulatoryUpdate: {
              id: 'update-1',
              sourceUrl: 'https://www.gov.uk/drug-device-alerts/example',
              title: 'Drug Alert: Amlodipine 5mg tablets',
              publishedAt: new Date('2026-05-01T09:00:00.000Z'),
              rawText: 'Product: Amlodipine 5mg tablets 28',
              regulator: 'MHRA',
              category: 'Drug alert',
              evidence: null,
              contentHash: 'hash',
              createdAt: new Date('2026-05-01T10:00:00.000Z'),
              updatedAt: new Date('2026-05-01T10:00:00.000Z'),
            },
          },
        },
      ] as never,
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items.length, 1);
  assert.equal(items[0]?.sourceType, 'REGULATORY_REVIEW');
  assert.equal(items[0]?.workflowPriority, 'HIGH');
  assert.equal(items[0]?.regulatoryEventType, 'RECALL');
  assert.equal(items[0]?.reviewSummary?.reviewReason, 'Regulatory update needs review');
  assert.match(items[0]?.reviewSummary?.recognizedContent ?? '', /Potentially relevant MHRA update/);
  assert.match(items[0]?.reviewSummary?.suggestedAction ?? '', /confirm affected stock/i);
});

test('review queue includes email inbound review and failure items', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () => [],
    listEmailReviewItems: () => [
      {
        id: 'email-review-1',
        createdAt: new Date('2026-04-19T13:00:00.000Z'),
        updatedAt: new Date('2026-04-19T13:00:00.000Z'),
        processingStatus: 'NEEDS_REVIEW',
        inferredImportType: null,
        confidence: 'LOW',
        reason: 'Import type is unclear from the subject and attachment filename.',
        fileType: 'CSV',
        attachment: {
          fileName: 'data.csv',
          mimeType: 'text/csv',
          size: 100,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'email-1',
          from: 'ops@ambe.test',
          subject: 'Data file',
          bodyText: 'Please review.',
        },
      },
      {
        id: 'email-review-2',
        createdAt: new Date('2026-04-19T14:00:00.000Z'),
        updatedAt: new Date('2026-04-19T14:00:00.000Z'),
        processingStatus: 'FAILED',
        inferredImportType: 'inventory',
        confidence: 'HIGH',
        reason: 'Import type was inferred confidently.',
        fileType: 'XLSX',
        attachment: {
          fileName: 'weekly-inventory.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 200,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'email-2',
          from: 'ops@ambe.test',
          subject: 'Weekly inventory export',
          bodyText: 'Attached.',
        },
        error: 'Import failed.',
        importBatchId: 'batch-email-1',
        importSummary: {
          totalRows: 5,
          validRows: 3,
          invalidRows: 2,
          warnings: [],
        },
      },
    ],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, 'email-review-2');
  assert.equal(items[0]?.sourceType, 'EMAIL_INBOUND');
  assert.equal(items[0]?.processingStatus, 'FAILED');
  assert.equal(items[0]?.sender, 'ops@ambe.test');
  assert.equal(items[0]?.subject, 'Weekly inventory export');
  assert.equal(items[0]?.reviewSummary?.reviewReason, 'Automatic processing failed');
  assert.equal(items[0]?.linkedImportBatch?.id, 'batch-email-1');
  assert.equal(items[1]?.processingStatus, 'NEEDS_REVIEW');
  assert.equal(items[1]?.reviewSummary?.reviewReason, 'Import type is unclear');
  assert.match(
    items[1]?.reviewSummary?.missingOrUnclear ?? '',
    /supplier price list, inventory file, or sales file/i,
  );
  assert.match(items[1]?.reviewSummary?.suggestedAction ?? '', /choose the correct import type manually/i);
});

test('review queue includes account-opening items with signer explanation', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () => [],
    listEmailReviewItems: () => [
      {
        id: 'account-opening-review-1',
        createdAt: new Date('2026-05-12T09:00:00.000Z'),
        updatedAt: new Date('2026-05-12T09:00:00.000Z'),
        processingStatus: 'REVIEW_REQUIRED',
        inferredImportType: null,
        confidence: 'HIGH',
        reason: 'Account opening form detected - review required before completion/signing.',
        fileType: 'PDF',
        attachment: {
          fileName: 'account-opening-form.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'account-email-1',
          from: 'forms@supplier.co.uk',
          subject: 'Account opening form',
          bodyText: 'Please complete.',
        },
        accountOpeningCase: {
          status: 'pending_review',
          senderEmail: 'forms@supplier.co.uk',
          senderDomain: 'supplier.co.uk',
          subject: 'Account opening form',
          receivedDate: '2026-05-12T09:00:00.000Z',
          detectedCompanyOrSupplierName: null,
          originalAttachmentNames: ['account-opening-form.pdf'],
          extractedTextSummary: 'Extracted account-opening text from email body (16 chars).',
          riskFlags: ['Director guarantee'],
          missingFields: ['companyNumber', 'vatNumber'],
          sharePointFolderUrl: null,
          sharePointNote: 'SharePoint upload skipped; review item was still created.',
          structuredFields: {
            companyName: 'AMBE LTD',
            tradingName: 'AMBE MEDICAL GROUP',
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
            guaranteeDetected: true,
            regulatoryDeclarationDetected: false,
            riskyTerms: ['Director guarantee'],
            missingOrUnclear: ['companyNumber', 'vatNumber'],
            recommendedSigner: 'Aman Dhillon',
          },
          signingSummary: {
            defaultSigner: 'Aman Dhillon',
            detectedNames: [],
            detectedSignatureRoles: ['Director', 'guarantee'],
            canAmanSign: true,
            signingExplanation:
              'Aman Dhillon can sign this account-opening form by default. The form mentions Director/Sandeep Patel. Reviewer should confirm the supplier does not specifically require a director-only signature.',
            escalationNotes: [
              'The form mentions Director/Sandeep Patel. Reviewer should confirm the supplier does not specifically require a director-only signature.',
            ],
          },
          signingNotes: {
            title: 'Account opening signing notes',
            recommendedSigner: 'Aman Dhillon',
            defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
            detectedNames: [],
            detectedRolesOrSections: ['Director', 'guarantee'],
            reviewerChecks: [
              'Confirm the form is an account-opening or onboarding document for AMBE LTD t/a AMBE MEDICAL GROUP.',
              'Check whether the supplier specifically requires a director-only signature.',
              'Leave all signature fields blank unless a human reviewer approves signing.',
            ],
            riskFlags: ['Director guarantee'],
            missingOrUnclear: ['companyNumber', 'vatNumber'],
            signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
            summary:
              'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default. Detected roles/sections: Director, guarantee. Signature fields must remain blank until approved by a human reviewer.',
          },
        },
      },
    ],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items.length, 1);
  assert.equal(items[0]?.sourceType, 'ACCOUNT_OPENING');
  assert.equal(items[0]?.reviewSummary?.reviewReason, 'Account opening form detected');
  assert.match(items[0]?.reviewSummary?.suggestedAction ?? '', /Recommended signer: Aman Dhillon/);
  assert.match(items[0]?.reviewSummary?.suggestedAction ?? '', /Aman Dhillon can sign this account-opening form by default/);
  assert.match(items[0]?.reviewSummary?.suggestedAction ?? '', /Detected roles\/sections: Director, guarantee/);
  assert.match(items[0]?.reviewSummary?.suggestedAction ?? '', /director-only signature/);
  assert.match(items[0]?.reviewSummary?.recognizedContent ?? '', /SharePoint upload skipped/);
  assert.equal(items[0]?.accountOpeningSigningNotes?.recommendedSigner, 'Aman Dhillon');
  assert.match(items[0]?.accountOpeningSigningNotes?.signatureInstruction ?? '', /Leave signature fields blank/);
});

test('review queue summarizes Ambe purchase order PDF extraction', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () => [],
    listEmailReviewItems: () => [
      {
        id: 'email-po-review',
        createdAt: new Date('2026-04-28T09:00:00.000Z'),
        updatedAt: new Date('2026-04-28T09:00:00.000Z'),
        processingStatus: 'NEEDS_REVIEW',
        inferredImportType: null,
        confidence: 'HIGH',
        reason:
          'Purchase order PDF found. Supplier found: DIXONS PHARMACEUTICALS UK LIMITED. Order no. 5981. 5 product lines found. Review before importing into purchase history.',
        fileType: 'PDF',
        attachment: {
          fileName: 'DIXONS PO5981.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'email-po',
          from: 'ops@ambemedical.com',
          subject: 'DIXONS PO5981',
          bodyText: 'PO attached.',
        },
        purchaseOrderPdf: {
          parserVersion: 'ambe-po-pdf-v1',
          detected: true,
          confidence: 'HIGH',
          supplierName: 'DIXONS PHARMACEUTICALS UK LIMITED',
          supplierAddressText: null,
          poNumber: '5981',
          orderDate: '2026-04-28',
          accountNo: 'DIXONS',
          totalNetAmount: null,
          totalVatAmount: null,
          orderTotal: 10956,
          lines: [
            {
              quantity: 50,
              stockCode: '4006607',
              productDescription: 'BRIVIACT TABS 100MG 56s',
              unitPrice: 76,
              netAmount: 3800,
              vatCode: 'T1',
              rawLine: '50 4006607 BRIVIACT TABS 100MG 56s 76.00 3800.00 T1',
            },
          ],
          evidence: ['PURCHASE ORDER', 'Supplier Name DIXONS PHARMACEUTICALS UK LIMITED'],
        },
      },
    ],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items.length, 1);
  assert.equal(items[0]?.reviewSummary?.reviewReason, 'Purchase order PDF found');
  assert.match(items[0]?.reviewSummary?.recognizedContent ?? '', /Supplier found: DIXONS/i);
  assert.match(items[0]?.reviewSummary?.recognizedContent ?? '', /Order no\. 5981/i);
  assert.match(items[0]?.reviewSummary?.suggestedAction ?? '', /before importing into purchase history/i);
});

test('review queue output shape stays simple and excludes non-review imported items', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () =>
      [
        {
          id: 'tg-imported',
          telegramMessageId: '2',
          telegramUserId: null,
          telegramChatId: 'chat-2',
          senderDisplayName: null,
          fileType: 'CSV',
          fileName: 'supplier-price-list.csv',
          mimeType: 'text/csv',
          telegramFileId: 'file-2',
          telegramFileUniqueId: 'unique-2',
          caption: null,
          processingStatus: 'IMPORTED',
          linkedImportBatchId: 'batch-2',
          errorMessage: null,
          metadata: { reason: 'Matched supplier/price keywords.' },
          createdAt: new Date('2026-04-19T10:00:00.000Z'),
          updatedAt: new Date('2026-04-19T10:00:00.000Z'),
          linkedImportBatch: {
            id: 'batch-2',
            kind: 'SUPPLIER_PRICE_LIST',
            status: 'COMPLETED',
            totalRows: 2,
            validRows: 2,
            invalidRows: 0,
          },
        },
      ] as never,
    listEmailReviewItems: () => [
      {
        id: 'email-review-imported',
        createdAt: new Date('2026-04-19T09:00:00.000Z'),
        updatedAt: new Date('2026-04-19T09:00:00.000Z'),
        processingStatus: 'IMPORTED',
        inferredImportType: 'supplier-price-list',
        confidence: 'HIGH',
        reason: 'Imported.',
        fileType: 'CSV',
        attachment: {
          fileName: 'supplier-price-list.csv',
          mimeType: 'text/csv',
          size: 120,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'email-imported',
          from: 'supplier@example.com',
          subject: 'Supplier price list',
          bodyText: 'Attached.',
        },
      },
    ],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items.length, 0);
});

test('review queue keeps newest items first across sources', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () =>
      [
        {
          id: 'tg-older',
          telegramMessageId: '3',
          telegramUserId: null,
          telegramChatId: 'chat-3',
          senderDisplayName: 'Older Telegram',
          fileType: 'PDF',
          fileName: 'older.pdf',
          mimeType: 'application/pdf',
          telegramFileId: 'file-3',
          telegramFileUniqueId: 'unique-3',
          caption: 'older',
          processingStatus: 'REVIEW_REQUIRED',
          linkedImportBatchId: null,
          errorMessage: null,
          metadata: { reason: 'Older review item.' },
          createdAt: new Date('2026-04-19T09:00:00.000Z'),
          updatedAt: new Date('2026-04-19T09:00:00.000Z'),
          linkedImportBatch: null,
        },
      ] as never,
    listEmailReviewItems: () => [
      {
        id: 'email-review-newest',
        createdAt: new Date('2026-04-19T08:00:00.000Z'),
        updatedAt: new Date('2026-04-19T12:00:00.000Z'),
        processingStatus: 'FAILED',
        inferredImportType: null,
        confidence: 'LOW',
        reason: 'Newest review item.',
        fileType: 'CSV',
        attachment: {
          fileName: 'newest.csv',
          mimeType: 'text/csv',
          size: 100,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'email-newest',
          from: 'ops@ambe.test',
          subject: 'Newest',
          bodyText: 'Newest',
        },
      },
    ],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items[0]?.id, 'email-review-newest');
  assert.equal(items[1]?.id, 'telegram-review-tg-older');
});

test('review queue includes clear summary for image review items', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () =>
      [
        {
          id: 'tg-image',
          telegramMessageId: '4',
          telegramUserId: 'user-2',
          telegramChatId: 'chat-4',
          senderDisplayName: 'Photo Sender',
          fileType: 'IMAGE',
          fileName: 'offer.png',
          mimeType: 'image/png',
          telegramFileId: 'file-4',
          telegramFileUniqueId: 'unique-4',
          caption: 'see image',
          processingStatus: 'REVIEW_REQUIRED',
          linkedImportBatchId: null,
          errorMessage: null,
          metadata: { reason: 'File type requires manual review.' },
          createdAt: new Date('2026-04-19T15:00:00.000Z'),
          updatedAt: new Date('2026-04-19T15:00:00.000Z'),
          linkedImportBatch: null,
        },
      ] as never,
    listEmailReviewItems: () => [],
    listEmailDerivedOfferItems: async () => [],
    getSupplierScorecardsForIds: async () => ({}),
  });

  const items = await service.listItems();

  assert.equal(items[0]?.reviewSummary?.reviewReason, 'Image file received and needs manual review');
  assert.match(items[0]?.reviewSummary?.missingOrUnclear ?? '', /image text cannot be imported automatically/i);
});

test('review queue includes open email-derived workflow items with priority metadata', async () => {
  const service = createReviewQueueService({
    listTelegramInboundItems: async () => [],
    listEmailReviewItems: () => [],
    listEmailDerivedOfferItems: async () =>
      [
        {
          id: 'workflow-1',
          emailDerivedOfferId: 'offer-1',
          inboundEmailId: 'email-1',
          status: 'NEW',
          priority: 'HIGH',
          priorityReason: 'conflicting supplier cues require operator review before buying.',
          assigneeUserId: null,
          assigneeLabel: 'buyer-desk',
          latestNote: null,
          sourceKind: 'STRICT_BODY_MAIN',
          sourceReviewReason: 'conflicting_supplier_cues',
          aiAssisted: false,
          hasUnresolvedSupplier: true,
          hasConflictingSupplierCues: true,
          hasManufacturerAmbiguity: false,
          supplierQualificationStatus: 'UNKNOWN',
          hasUnknownSupplierQualification: true,
          hasRestrictedSupplier: false,
          hasBlockedSupplier: false,
          qualificationRiskNote: 'Supplier qualification is unknown and should be reviewed before purchase.',
          createdByType: 'SYSTEM',
          createdByIdentifier: null,
          completedAt: null,
          createdAt: new Date('2026-04-20T09:00:00.000Z'),
          updatedAt: new Date('2026-04-20T09:00:00.000Z'),
          inboundEmail: null,
          buyDecision: {
            id: 'buy-1',
            supplierId: 'supplier-1',
            productId: 'product-1',
            quotedUnitPrice: { toString: () => '8.40' },
            quotedCurrencyCode: 'GBP',
            quotedMinimumOrderQuantity: 100,
            quotedAvailability: 'available',
            approvalStatus: 'APPROVED',
            orderStatus: 'ORDERED',
            supplierQualificationStatus: 'UNKNOWN',
            hasQualificationRisk: true,
            approvalNote: null,
            approvedAt: new Date('2026-04-20T08:00:00.000Z'),
            orderedAt: new Date('2026-04-20T10:00:00.000Z'),
            externalOrderReference: 'PO-001',
            qualificationRiskNote: 'Supplier qualification is unknown and should be reviewed before purchase.',
            execution: {
              id: 'execution-1',
              buyDecisionId: 'buy-1',
              supplierId: 'supplier-1',
              productId: 'product-1',
              orderedQuantity: 100,
              orderedUnitPrice: { toString: () => '8.90' },
              orderedCurrencyCode: 'GBP',
              orderedMinimumOrderQuantity: 100,
              confirmedAvailability: true,
              externalOrderReference: 'PO-001',
              orderPlacedAt: new Date('2026-04-20T10:00:00.000Z'),
              orderConfirmedAt: null,
              expectedDeliveryDate: null,
              receivedQuantity: null,
              receivedAt: null,
              invoicedUnitPrice: null,
              invoicedCurrencyCode: null,
              invoiceReference: null,
              invoicedAt: null,
              fulfillmentStatus: 'ORDER_PLACED',
              reconciliationStatus: 'PRICE_DRIFT',
              hasPriceDrift: true,
              hasQuantityDrift: false,
              hasCurrencyMismatch: false,
              hasAvailabilityDrift: false,
              notes: null,
              metadata: null,
              createdAt: new Date('2026-04-20T10:00:00.000Z'),
              updatedAt: new Date('2026-04-20T10:10:00.000Z'),
            },
          },
          emailDerivedOffer: {
            id: 'offer-1',
            status: 'REVIEW_REQUIRED',
            reviewReason: 'conflicting_supplier_cues',
            sourceKind: 'STRICT_BODY_MAIN',
            metadata: {
              sender: 'pricing@supplier.co',
              subject: 'Offer',
            },
            resolutionCandidates: [
              {
                entityType: 'SUPPLIER',
                candidateId: 'supplier-1',
                candidateName: 'Supplier One',
                confidence: 88,
                reason: 'sender_mapping',
                selected: true,
              },
            ],
            updatedAt: new Date('2026-04-20T09:00:00.000Z'),
          },
        },
      ] as never,
    getSupplierScorecardsForIds: async () => ({
      'supplier-1': {
        supplierId: 'supplier-1',
        supplierName: 'Supplier One',
        supplierNormalizedName: 'supplier-one',
        isActive: true,
        qualificationStatus: 'UNKNOWN',
        trustTier: 'LOW',
        qualificationRiskCount: 1,
        totalApprovedBuyDecisions: 1,
        totalOrderedExecutions: 1,
        totalReceivedExecutions: 0,
        totalCancelledExecutions: 0,
        fulfillmentRate: 0,
        averageQuoteToOrderPriceDriftPct: 0.0595,
        averageQuoteToInvoicePriceDriftPct: null,
        priceDriftIncidentCount: 1,
        quantityDriftIncidentCount: 0,
        lastActivityAt: new Date('2026-04-20T10:10:00.000Z'),
        score: 42,
        tier: 'RISKY',
        scoreBreakdown: {
          qualificationComponent: 0,
          fulfillmentComponent: 0,
          volumeComponent: 0,
          cancellationPenalty: 0,
          driftPenalty: -8,
          reviewBurdenPenalty: -2,
        },
        summary: {
          recommendedAction: 'restrict supplier',
          hasQualificationRisk: true,
          hasRecentDrift: true,
        },
      },
    }),
    getOfferFeedbackSummariesForOfferIds: async () => ({
      'offer-1': {
        hasFeedback: true,
        extractionVerdict: 'CORRECT',
        supplierResolutionVerdict: 'INCORRECT',
        signalVerdict: 'USEFUL',
        feedbackCount: 3,
      },
    }),
    getOfferLearningSummariesForOfferIds: async () => ({
      'offer-1': {
        hasCorrection: true,
        latestCorrectionStatus: 'APPLIED',
        latestCorrectionId: 'correction-1',
        sourceReliabilityTier: 'RISKY',
        sourceReliabilityScore: 38,
        sourceProfileId: 'source-profile-1',
        hasLearnedSupplierSuggestion: true,
        learnedSupplierId: 'supplier-1',
        learnedSupplierName: 'Supplier One',
        hasLearnedProductSuggestion: true,
        learnedProductId: 'product-1',
        learnedProductName: 'Amlodipine 5mg tabs 28',
        hasLearnedManufacturerSuggestion: true,
        learnedManufacturer: 'Manufacturer A',
        recommendedNextAction: 'downgrade source',
      },
    }),
    getAutomationReadinessOverview: async () =>
      ({
        policy: {
          globalMode: 'INTERNAL_SIGNALS_ONLY',
        },
        evaluation: {
          readinessRecommendation: 'fix supplier mapping',
        },
        decisions: {
          internalSignals: {
            eligible: false,
            blockedReasons: ['supplier resolution precision is below policy minimum'],
          },
          supplierDrafts: {
            eligible: false,
            blockedReasons: ['policy mode is below drafts-only for supplier outreach drafts'],
          },
          buyerDrafts: {
            eligible: false,
            blockedReasons: ['policy mode is below drafts-only for buyer outreach drafts'],
          },
          assistedOutreach: {
            eligible: false,
            blockedReasons: [],
          },
          actualSend: {
            eligible: false,
            blockedReasons: ['live autonomous sending remains blocked in this implementation pass'],
          },
        },
        recommendedAction: 'fix supplier mapping',
      } as never),
    getTradeOpportunitiesForOfferIds: async () => ({
      'offer-1': {
        id: 'trade-1',
        emailDerivedOfferId: 'offer-1',
        status: 'ON_HOLD',
        stage: 'BUY_ORDERED',
        buyDecisionId: 'buy-1',
        buyExecutionId: 'execution-1',
        supplierId: 'supplier-1',
        productId: 'product-1',
        sourceType: 'WORKFLOW_ITEM',
        sourceSupplierNameSnapshot: 'Supplier One',
        supplierQualificationStatusSnapshot: 'UNKNOWN',
        quotedBuyUnitPrice: { toString: () => '8.40' },
        quotedBuyCurrencyCode: 'GBP',
        quotedBuyMinimumOrderQuantity: 100,
        quotedAvailability: 'available',
        targetSellUnitPrice: { toString: () => '10.25' },
        targetSellCurrencyCode: 'GBP',
        minimumMarginAmount: null,
        minimumMarginPct: 0.12,
        estimatedMarginAmount: 1.85,
        estimatedMarginPct: 0.1805,
        quantityTarget: 100,
        rationale: 'Promising spread if supply confirms.',
        riskFlags: ['unknown_supplier_qualification', 'price_drift_detected'],
        hasQualificationBlock: false,
        isMarginFloorMet: true,
        isActionable: false,
        hasMessagingPolicyViolations: true,
        messagingPolicyViolationCount: 2,
        ownerUserId: null,
        ownerLabel: 'buyer-desk',
        createdByType: 'SYSTEM',
        createdByIdentifier: null,
        closeReason: null,
        metadata: null,
        closedAt: null,
        createdAt: new Date('2026-04-20T09:00:00.000Z'),
        updatedAt: new Date('2026-04-20T10:10:00.000Z'),
        messagingPolicy: null,
        drafts: [],
        events: [],
        supplier: { id: 'supplier-1', name: 'Supplier One' },
        product: { id: 'product-1', name: 'Amlodipine 5mg tabs 28' },
        buyDecision: {
          id: 'buy-1',
          approvalStatus: 'APPROVED',
          orderStatus: 'ORDERED',
          supplierQualificationStatus: 'UNKNOWN',
          hasQualificationRisk: true,
        },
        buyExecution: {
          id: 'execution-1',
          fulfillmentStatus: 'ORDER_PLACED',
          reconciliationStatus: 'PRICE_DRIFT',
          hasPriceDrift: true,
          hasQuantityDrift: false,
          hasCurrencyMismatch: false,
          hasAvailabilityDrift: false,
        },
        summary: {
          riskFlags: ['unknown_supplier_qualification', 'price_drift_detected'],
          estimatedMarginAmount: 1.85,
          estimatedMarginPct: 0.1805,
          marginSpreadAmount: 1.85,
          hasMessagingPolicyViolations: true,
          hasBuyDecision: true,
          hasBuyExecution: true,
          hasPriceDrift: true,
          recommendedNextStep: 'investigate price drift',
        },
      } as never,
    }),
  });

  const items = await service.listItems();

  assert.equal(items.length, 1);
  assert.equal(items[0]?.sourceType, 'EMAIL_DERIVED_OFFER');
  assert.equal(items[0]?.processingStatus, 'NEW');
  assert.equal(items[0]?.workflowPriority, 'HIGH');
  assert.equal(items[0]?.workflowAssignee, 'buyer-desk');
  assert.equal(items[0]?.reason, 'Conflicting supplier cues');
  assert.equal(items[0]?.reviewSummary?.reviewReason, 'Conflicting supplier cues');
  assert.equal(items[0]?.qualificationStatus, 'UNKNOWN');
  assert.match(items[0]?.qualificationRiskSummary ?? '', /unknown/i);
  assert.equal(items[0]?.hasBuyExecution, true);
  assert.equal(items[0]?.buyDecisionId, 'buy-1');
  assert.equal(items[0]?.buyExecutionId, 'execution-1');
  assert.equal(items[0]?.hasTradeOpportunity, true);
  assert.equal(items[0]?.tradeOpportunityId, 'trade-1');
  assert.equal(items[0]?.tradeOpportunityStatus, 'ON_HOLD');
  assert.equal(items[0]?.tradeOpportunityStage, 'BUY_ORDERED');
  assert.equal(items[0]?.tradeMessagingPolicyViolationCount, 2);
  assert.equal(items[0]?.hasOperatorFeedback, true);
  assert.equal(items[0]?.hasOfferCorrection, true);
  assert.equal(items[0]?.sourceReliabilityTier, 'RISKY');
  assert.equal(items[0]?.hasLearnedSupplierSuggestion, true);
  assert.equal(items[0]?.learnedSupplierName, 'Supplier One');
  assert.equal(items[0]?.hasLearnedProductSuggestion, true);
  assert.equal(items[0]?.learnedProductName, 'Amlodipine 5mg tabs 28');
  assert.equal(items[0]?.hasLearnedManufacturerSuggestion, true);
  assert.equal(items[0]?.learnedManufacturer, 'Manufacturer A');
  assert.equal(items[0]?.learningRecommendedAction, 'downgrade source');
  assert.equal(items[0]?.extractionFeedbackVerdict, 'CORRECT');
  assert.equal(items[0]?.supplierResolutionFeedbackVerdict, 'INCORRECT');
  assert.equal(items[0]?.signalFeedbackVerdict, 'USEFUL');
  assert.equal(items[0]?.automationMode, 'INTERNAL_SIGNALS_ONLY');
  assert.equal(items[0]?.automationEligibleForInternalSignals, false);
  assert.equal(items[0]?.automationEligibleForDrafts, false);
  assert.match(JSON.stringify(items[0]?.automationBlockedReasons ?? []), /drafts-only/i);
  assert.equal(items[0]?.automationRecommendedAction, 'fix supplier mapping');
  assert.equal(items[0]?.executionFulfillmentStatus, 'ORDER_PLACED');
  assert.equal(items[0]?.executionReconciliationStatus, 'PRICE_DRIFT');
  assert.equal(items[0]?.hasCommercialDrift, true);
  assert.equal(items[0]?.supplierPerformanceSummary?.tier, 'RISKY');
  assert.equal(items[0]?.recommendedNextAction, 'investigate price drift');
});
