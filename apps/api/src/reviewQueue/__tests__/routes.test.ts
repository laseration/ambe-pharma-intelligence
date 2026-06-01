import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { automationService } from '../../automation/service';
import { env } from '../../config/env';
import { offerCorrectionService } from '../../corrections/service';
import { offerWorkflowService } from '../workflowService';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function stubMethod<
  TObject extends Record<string, any>,
  TKey extends keyof TObject,
>(
  context: TestContext,
  object: TObject,
  key: TKey,
  replacement: TObject[TKey],
) {
  const original = object[key];
  object[key] = replacement;
  context.after(() => {
    object[key] = original;
  });
}

async function startServer(context: TestContext) {
  const app = createApp();
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

test('workflow detail route returns inbound email context and staged offer data', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(
    t,
    offerWorkflowService,
    'getWorkflowItem',
    (async () =>
      ({
        id: 'workflow-1',
        emailDerivedOfferId: 'offer-1',
        inboundEmailId: 'email-1',
        status: 'NEW',
        priority: 'HIGH',
        priorityReason: 'conflicting supplier cues',
        assigneeUserId: null,
        assigneeLabel: null,
        latestNote: null,
        sourceKind: 'STRICT_ATTACHMENT_TABLE',
        sourceReviewReason: 'promotion_threshold_not_met',
        aiAssisted: false,
        hasUnresolvedSupplier: false,
        hasConflictingSupplierCues: false,
        hasManufacturerAmbiguity: false,
        supplierQualificationStatus: 'UNKNOWN',
        hasUnknownSupplierQualification: true,
        hasRestrictedSupplier: false,
        hasBlockedSupplier: false,
        qualificationRiskNote: null,
        createdByType: 'SYSTEM',
        createdByIdentifier: null,
        completedAt: null,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:05:00.000Z'),
        emailDerivedOffer: {
          id: 'offer-1',
          status: 'REVIEW_REQUIRED',
          reviewReason: 'promotion_threshold_not_met',
          sourceKind: 'STRICT_ATTACHMENT_TABLE',
          sourceBlockText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
          rawProductText: 'Amlodipine 5mg tabs 28',
          normalizedProductNameCandidate: 'amlodipine|5mg|tablet|28',
          strengthCandidate: '5mg',
          dosageFormCandidate: 'tablet',
          packSizeCandidate: '28',
          manufacturerCandidate: 'Teva',
          supplierCandidate: 'Shortline',
          priceCandidate: '8.40',
          currencyCandidate: 'GBP',
          minimumOrderQuantityCandidate: 20,
          availabilityCandidate: 'In stock',
          sourceTrustScore: 55,
          structureConfidence: 75,
          fieldConfidence: 72,
          entityResolutionConfidence: 0,
          promotionConfidence: 54,
          metadata: {
            sender: 'pricing@supplier.co',
            subject: 'Offer',
          },
          resolutionCandidates: [
            {
              entityType: 'SUPPLIER',
              candidateId: 'supplier-1',
              candidateName: 'Shortline',
              confidence: 60,
              reason: 'trusted supplier mapping',
              selected: true,
            },
          ],
          sourceDocument: {
            id: 'doc-2',
            kind: 'ATTACHMENT_TABLE',
            documentIndex: 2,
            label: 'price-list.xlsx',
            textContent:
              'productName: Amlodipine 5mg tabs 28 | unitPrice: 8.40',
            metadata: {
              fileName: 'price-list.xlsx',
            },
          },
          offerCorrections: [
            {
              id: 'correction-1',
              correctionStatus: 'APPLIED',
              correctedSupplierId: 'supplier-1',
              correctedSupplierName: 'Shortline Pharma',
              correctedProductId: null,
              correctedRawProductText: null,
              correctedNormalizedProductName: null,
              correctedStrength: null,
              correctedDosageForm: null,
              correctedPackSize: null,
              correctedManufacturer: null,
              correctedUnitPrice: null,
              correctedCurrencyCode: null,
              correctedMinimumOrderQuantity: null,
              correctedAvailability: null,
              actorType: 'OPERATOR',
              actorIdentifier: 'ops@example.com',
              note: 'Confirmed supplier from previous email.',
              createdAt: new Date('2026-04-22T09:03:00.000Z'),
              updatedAt: new Date('2026-04-22T09:03:00.000Z'),
            },
          ],
          buyDecision: null,
          updatedAt: new Date('2026-04-22T09:05:00.000Z'),
        },
        inboundEmail: {
          id: 'email-1',
          fromEmail: 'pricing@supplier.co',
          fromName: 'Supplier Pricing',
          subject: 'Offer',
          receivedAt: new Date('2026-04-22T09:00:00.000Z'),
          rawHtml: '<p>Offer</p>',
          rawText: 'Please see attached.',
          triageStatus: 'AUTO_PROCESSED',
          processingStatus: 'REVIEW_REQUIRED',
          reviewReason: 'promotion_threshold_not_met',
          documents: [
            {
              id: 'doc-1',
              kind: 'BODY_MAIN',
              documentIndex: 1,
              label: 'body-main',
              textContent: 'Please see attached.',
              metadata: null,
            },
          ],
        },
        supplierContact: {
          companyName: 'Shortline',
          contactName: 'Carl Junius',
          email: 'carl.junius@shortline.co',
          phone: '+32 11 49 57 77',
          domain: 'shortline.co',
          source: 'Forwarded email',
        },
        buyDecision: null,
      }) as any) as typeof offerWorkflowService.getWorkflowItem,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/review-queue/workflows/workflow-1`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.id, 'workflow-1');
  assert.equal(
    payload.item.emailDerivedOffer.rawProductText,
    'Amlodipine 5mg tabs 28',
  );
  assert.equal(payload.item.aiAssisted, false);
  assert.equal(
    payload.item.emailDerivedOffer.sourceBlockText,
    'Amlodipine 5mg tabs 28 - GBP 8.40',
  );
  assert.equal(
    payload.item.emailDerivedOffer.offerCorrections[0].correctedSupplierName,
    'Shortline Pharma',
  );
  assert.equal(payload.item.inboundEmail.documents[0].kind, 'BODY_MAIN');
  assert.equal(payload.item.supplierContact.companyName, 'Shortline');
});

test('AI fallback workflow detail remains review-required until explicit approval', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(
    t,
    offerWorkflowService,
    'getWorkflowItem',
    (async () =>
      ({
        id: 'workflow-ai',
        emailDerivedOfferId: 'offer-ai',
        inboundEmailId: 'email-ai',
        status: 'NEW',
        priority: 'HIGH',
        priorityReason: 'ai candidate kept review-only',
        assigneeUserId: null,
        assigneeLabel: null,
        latestNote: null,
        sourceKind: 'AI_FALLBACK',
        sourceReviewReason: 'ai_candidate_review_only',
        aiAssisted: true,
        hasUnresolvedSupplier: true,
        hasConflictingSupplierCues: false,
        hasManufacturerAmbiguity: false,
        supplierQualificationStatus: 'UNKNOWN',
        hasUnknownSupplierQualification: true,
        hasRestrictedSupplier: false,
        hasBlockedSupplier: false,
        qualificationRiskNote: null,
        createdByType: 'SYSTEM',
        createdByIdentifier: null,
        completedAt: null,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:05:00.000Z'),
        emailDerivedOffer: {
          id: 'offer-ai',
          status: 'REVIEW_REQUIRED',
          reviewReason: 'ai_candidate_review_only',
          sourceKind: 'AI_FALLBACK',
          sourceBlockText: 'Possible offer: insulin pens available',
          rawProductText: 'insulin pens',
          normalizedProductNameCandidate: null,
          strengthCandidate: null,
          dosageFormCandidate: null,
          packSizeCandidate: null,
          manufacturerCandidate: null,
          supplierCandidate: null,
          priceCandidate: null,
          currencyCandidate: null,
          minimumOrderQuantityCandidate: null,
          availabilityCandidate: 'available',
          sourceTrustScore: 30,
          structureConfidence: 35,
          fieldConfidence: 30,
          entityResolutionConfidence: 0,
          promotionConfidence: 20,
          metadata: null,
          resolutionCandidates: [],
          sourceDocument: null,
          offerCorrections: [],
          buyDecision: null,
          updatedAt: new Date('2026-04-22T09:05:00.000Z'),
        },
        inboundEmail: null,
        supplierContact: null,
        buyDecision: null,
      }) as any) as typeof offerWorkflowService.getWorkflowItem,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/review-queue/workflows/workflow-ai`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.aiAssisted, true);
  assert.equal(payload.item.status, 'NEW');
  assert.equal(payload.item.emailDerivedOffer.status, 'REVIEW_REQUIRED');
  assert.notEqual(payload.item.emailDerivedOffer.status, 'AUTO_PROMOTED');
});

test('workflow detail route returns 404 when workflow is missing', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(t, offerWorkflowService, 'getWorkflowItem', async () => null);

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/review-queue/workflows/missing-workflow`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );

  assert.equal(response.status, 404);
});

test('workflow audit history route returns combined commercial audit entries', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(t, offerWorkflowService, 'getWorkflowAuditHistory', (async () => [
    {
      id: 'workflow-event-1',
      entityType: 'OFFER_WORKFLOW_ITEM',
      entityId: 'workflow-1',
      actionType: 'APPROVED_TO_BUY',
      previousStatus: 'NEW',
      newStatus: 'APPROVED_TO_BUY',
      actorType: 'OPERATOR',
      actorIdentifier: 'internal-operator:web-review-console',
      note: 'Approved.',
      metadata: {
        commercialAudit: {
          entityType: 'OFFER_WORKFLOW_ITEM',
          entityId: 'workflow-1',
          action: 'APPROVED_TO_BUY',
          source: {
            inboundEmailId: 'email-1',
            emailDerivedOfferId: 'offer-1',
          },
        },
      },
      createdAt: new Date('2026-04-22T09:05:00.000Z'),
    },
    {
      id: 'buy-event-1',
      entityType: 'BUY_DECISION',
      entityId: 'decision-1',
      actionType: 'CREATED',
      previousStatus: null,
      newStatus: 'APPROVED / NOT_ORDERED',
      actorType: 'OPERATOR',
      actorIdentifier: 'internal-operator:web-review-console',
      note: 'Approved.',
      metadata: {
        commercialAudit: {
          entityType: 'BUY_DECISION',
          entityId: 'decision-1',
          action: 'CREATED',
        },
      },
      createdAt: new Date('2026-04-22T09:06:00.000Z'),
    },
  ]) as any);

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/review-queue/workflows/workflow-1/audit-history`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].entityType, 'OFFER_WORKFLOW_ITEM');
  assert.equal(
    payload.items[0].metadata.commercialAudit.source.inboundEmailId,
    'email-1',
  );
  assert.equal(payload.items[1].entityType, 'BUY_DECISION');
});

test('workflow correction route binds corrections to the reviewed offer and actor', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(
    t,
    offerWorkflowService,
    'getWorkflowItem',
    (async () =>
      ({
        id: 'workflow-1',
        emailDerivedOfferId: 'offer-1',
        inboundEmailId: 'email-1',
        status: 'NEW',
        sourceKind: 'STRICT_ATTACHMENT_TABLE',
        sourceReviewReason: 'missing_price',
        emailDerivedOffer: {
          id: 'offer-1',
          reviewReason: 'missing_price',
          sourceKind: 'STRICT_ATTACHMENT_TABLE',
        },
        inboundEmail: {
          id: 'email-1',
        },
      }) as any) as typeof offerWorkflowService.getWorkflowItem,
  );

  let capturedCorrection: any = null;
  const capturedFeedback: Record<string, unknown>[] = [];
  stubMethod(
    t,
    offerCorrectionService,
    'createCorrection',
    (async (input) => {
      capturedCorrection = input;
      return {
        id: 'correction-1',
        emailDerivedOfferId: input.emailDerivedOfferId,
        offerWorkflowItemId: input.offerWorkflowItemId,
        inboundEmailId: input.inboundEmailId,
        correctionStatus: 'APPLIED',
        correctedSupplierId: null,
        correctedSupplierName: input.correctedSupplierName ?? null,
        correctedProductId: null,
        correctedRawProductText: input.correctedRawProductText ?? null,
        correctedNormalizedProductName:
          input.correctedNormalizedProductName ?? null,
        correctedStrength: null,
        correctedDosageForm: null,
        correctedPackSize: null,
        correctedManufacturer: input.correctedManufacturer ?? null,
        correctedUnitPrice: input.correctedUnitPrice ?? null,
        correctedCurrencyCode: input.correctedCurrencyCode ?? null,
        correctedMinimumOrderQuantity:
          input.correctedMinimumOrderQuantity ?? null,
        correctedAvailability: input.correctedAvailability ?? null,
        actorType: input.actorType ?? 'OPERATOR',
        actorIdentifier: input.actorIdentifier ?? null,
        note: input.note ?? null,
        metadata: input.metadata ?? null,
        createdAt: new Date('2026-04-22T09:03:00.000Z'),
        updatedAt: new Date('2026-04-22T09:03:00.000Z'),
      };
    }) as typeof offerCorrectionService.createCorrection,
  );
  stubMethod(
    t,
    automationService,
    'recordFeedback',
    (async (input) => {
      capturedFeedback.push(input as Record<string, unknown>);
      return { id: `feedback-${capturedFeedback.length}` } as any;
    }) as typeof automationService.recordFeedback,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/review-queue/workflows/workflow-1/corrections`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': 'test-secret',
        'x-internal-caller-name': 'web-review-console',
      },
      body: JSON.stringify({
        correctedSupplierName: 'Shortline Pharma',
        correctedNormalizedProductName: 'Amlodipine 5mg tablets 28',
        correctedUnitPrice: '8.40',
        correctedCurrencyCode: 'gbp',
        correctedMinimumOrderQuantity: 20,
        note: 'Confirmed against source row.',
      }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.id, 'correction-1');
  assert.equal(capturedCorrection?.emailDerivedOfferId, 'offer-1');
  assert.equal(capturedCorrection?.offerWorkflowItemId, 'workflow-1');
  assert.equal(capturedCorrection?.inboundEmailId, 'email-1');
  assert.equal(
    capturedCorrection?.actorIdentifier,
    'internal-operator:web-review-console',
  );
  assert.equal(
    (capturedCorrection?.metadata as Record<string, unknown>)?.createdFrom,
    'review_workflow_correction',
  );
  assert.equal(capturedFeedback.length, 2);
  assert.equal(capturedFeedback[0]?.feedbackType, 'EXTRACTION');
  assert.equal(capturedFeedback[1]?.feedbackType, 'SUPPLIER_RESOLUTION');
});

test('workflow list route accepts inboundEmailId filter', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });

  let capturedFilters: Record<string, unknown> | null = null;
  stubMethod(t, offerWorkflowService, 'listWorkflowItems', (async (filters) => {
    capturedFilters = filters as Record<string, unknown>;
    return [];
  }) as typeof offerWorkflowService.listWorkflowItems);

  const baseUrl = await startServer(t);
  const response = await fetch(
    `${baseUrl}/api/review-queue/workflows?onlyOpen=true&inboundEmailId=email-1`,
    {
      headers: {
        'x-internal-api-key': 'test-secret',
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(capturedFilters?.['onlyOpen'], true);
  assert.equal(capturedFilters?.['inboundEmailId'], 'email-1');
});
