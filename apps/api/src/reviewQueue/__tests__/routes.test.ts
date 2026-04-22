import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { offerWorkflowService } from '../workflowService';

function overrideEnv(
  context: TestContext,
  overrides: Partial<typeof env>,
) {
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
>(context: TestContext, object: TObject, key: TKey, replacement: TObject[TKey]) {
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
            textContent: 'productName: Amlodipine 5mg tabs 28 | unitPrice: 8.40',
            metadata: {
              fileName: 'price-list.xlsx',
            },
          },
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
        buyDecision: null,
      }) as any) as typeof offerWorkflowService.getWorkflowItem,
  );

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/review-queue/workflows/workflow-1`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.id, 'workflow-1');
  assert.equal(payload.item.emailDerivedOffer.rawProductText, 'Amlodipine 5mg tabs 28');
  assert.equal(payload.item.inboundEmail.documents[0].kind, 'BODY_MAIN');
});

test('workflow detail route returns 404 when workflow is missing', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });
  stubMethod(t, offerWorkflowService, 'getWorkflowItem', async () => null);

  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/review-queue/workflows/missing-workflow`, {
    headers: {
      'x-internal-api-key': 'test-secret',
    },
  });

  assert.equal(response.status, 404);
});

test('workflow list route accepts inboundEmailId filter', async (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalApiKey: 'test-secret',
    internalAdminApiKey: 'admin-secret',
  });

  let capturedFilters: Record<string, unknown> | null = null;
  stubMethod(
    t,
    offerWorkflowService,
    'listWorkflowItems',
    (async (filters) => {
      capturedFilters = filters as Record<string, unknown>;
      return [];
    }) as typeof offerWorkflowService.listWorkflowItems,
  );

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
