import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { db } from '../../../lib/db';
import { env } from '../../../config/env';
import { mergeResolvedOffers, persistPromotion, stageInboundEmail } from '../pipeline';
import type { EmailInboundResult } from '../types';

function createInboundResult(overrides?: Partial<EmailInboundResult['items'][number]>): EmailInboundResult {
  return {
    ignored: false,
    items: [
      {
        processingStatus: 'IMPORTED',
        inferredImportType: null,
        confidence: 'HIGH',
        reason: 'deterministic test result',
        fileType: 'UNKNOWN',
        attachment: {
          fileName: null,
          mimeType: null,
          size: null,
          contentId: null,
          disposition: null,
        },
        email: {
          messageId: 'msg-1',
          from: 'pricing@supplier.co',
          subject: 'Offer',
          bodyText: '',
        },
        triageStatus: 'AUTO_PROCESSED',
        triageReasons: [],
        triageScores: {
          supplierLikelihoodScore: 85,
          structureScore: 90,
          businessWorthinessScore: 90,
        },
        parserConfidence: 'HIGH',
        aiEligible: false,
        ...overrides,
      },
    ],
  };
}

function installDbMocks(t: TestContext) {
  const state = {
    inboundEmails: [] as Array<Record<string, any>>,
    documents: [] as Array<Record<string, any>>,
    runs: [] as Array<Record<string, any>>,
    offers: [] as Array<Record<string, any>>,
    evidences: [] as Array<Record<string, any>>,
    resolutionCandidates: [] as Array<Record<string, any>>,
    promotionDecisions: [] as Array<Record<string, any>>,
    workflowItems: [] as Array<Record<string, any>>,
    workflowEvents: [] as Array<Record<string, any>>,
    supplierQualifications: [] as Array<Record<string, any>>,
    buyDecisions: [] as Array<Record<string, any>>,
    buyDecisionEvents: [] as Array<Record<string, any>>,
    suppliers: [] as Array<Record<string, any>>,
    products: [] as Array<Record<string, any>>,
    priceLists: [] as Array<Record<string, any>>,
    priceItems: [] as Array<Record<string, any>>,
  };

  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;
  const stubMethod = (target: object, methodName: string, implementation: (...args: any[]) => any) => {
    const original = (target as Record<string, unknown>)[methodName];
    (target as Record<string, unknown>)[methodName] = implementation;
    t.after(() => {
      (target as Record<string, unknown>)[methodName] = original;
    });
  };

  const tx = db as unknown as typeof db;
  const originalTransaction = (db as any).$transaction;
  (db as any).$transaction = async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(tx);
    }

    return Promise.all(arg);
  };
  t.after(() => {
    (db as any).$transaction = originalTransaction;
  });

  stubMethod(db.inboundEmail, 'upsert', async ({ where, update, create }: any) => {
    const existing = state.inboundEmails.find(
      (item) =>
        item.sourceSystem === where.sourceSystem_externalMessageId.sourceSystem &&
        item.externalMessageId === where.sourceSystem_externalMessageId.externalMessageId,
    );

    if (existing) {
      Object.assign(existing, update);
      return existing;
    }

    const created = { id: nextId('email'), ...create };
    state.inboundEmails.push(created);
    return created;
  });

  stubMethod(db.inboundEmail, 'create', async ({ data }: any) => {
    const created = { id: nextId('email'), ...data };
    state.inboundEmails.push(created);
    return created;
  });

  stubMethod(db.inboundEmail, 'update', async ({ where, data }: any) => {
    const existing = state.inboundEmails.find((item) => item.id === where.id);
    Object.assign(existing ?? {}, data);
    return existing;
  });

  stubMethod(db.inboundEmailDocument, 'deleteMany', async ({ where }: any) => {
    state.documents = state.documents.filter((item) => item.inboundEmailId !== where.inboundEmailId);
    return { count: 0 };
  });

  stubMethod(db.inboundEmailDocument, 'upsert', async ({ where, update, create }: any) => {
    const existing = state.documents.find(
      (item) =>
        item.inboundEmailId === where.inboundEmailId_kind_documentIndex.inboundEmailId &&
        item.kind === where.inboundEmailId_kind_documentIndex.kind &&
        item.documentIndex === where.inboundEmailId_kind_documentIndex.documentIndex,
    );

    if (existing) {
      Object.assign(existing, update);
      return existing;
    }

    const createdRecord = { id: nextId('doc'), ...create };
    state.documents.push(createdRecord);
    return createdRecord;
  });

  stubMethod(db.emailExtractionRun, 'deleteMany', async ({ where }: any) => {
    state.runs = state.runs.filter((item) => item.inboundEmailId !== where.inboundEmailId);
    return { count: 0 };
  });

  stubMethod(db.emailExtractionRun, 'create', async ({ data }: any) => {
    const created = { id: nextId('run'), ...data };
    state.runs.push(created);
    return created;
  });

  stubMethod(db.emailDerivedOfferEvidence, 'deleteMany', async () => {
    state.evidences = [];
    return { count: 0 };
  });

  stubMethod(db.emailDerivedOfferEvidence, 'createMany', async ({ data }: any) => {
    state.evidences.push(...data);
    return { count: data.length };
  });

  stubMethod(db.entityResolutionCandidate, 'deleteMany', async () => {
    state.resolutionCandidates = [];
    return { count: 0 };
  });

  stubMethod(db.entityResolutionCandidate, 'createMany', async ({ data }: any) => {
    state.resolutionCandidates.push(...data);
    return { count: data.length };
  });

  stubMethod(db.promotionDecision, 'deleteMany', async ({ where }: any) => {
    state.promotionDecisions = state.promotionDecisions.filter(
      (item) => item.inboundEmailId !== where.inboundEmailId,
    );
    return { count: 0 };
  });

  stubMethod(db.promotionDecision, 'create', async ({ data }: any) => {
    const created = { id: nextId('decision'), ...data };
    state.promotionDecisions.push(created);
    return created;
  });

  stubMethod(db.offerWorkflowItem, 'findUnique', async ({ where }: any) => {
    const withRelations = (item: Record<string, any> | null) =>
      item
        ? {
            ...item,
            inboundEmail: state.inboundEmails.find((entry) => entry.id === item.inboundEmailId) ?? null,
            buyDecision: state.buyDecisions.find((entry) => entry.offerWorkflowItemId === item.id) ?? null,
            emailDerivedOffer: (() => {
              const offer = state.offers.find((entry) => entry.id === item.emailDerivedOfferId) ?? null;
              if (!offer) {
                return null;
              }
              return {
                ...offer,
                resolutionCandidates: state.resolutionCandidates.filter(
                  (entry) => entry.emailDerivedOfferId === offer.id,
                ),
                buyDecision: state.buyDecisions.find((entry) => entry.emailDerivedOfferId === offer.id) ?? null,
              };
            })(),
          }
        : null;

    if (where.emailDerivedOfferId) {
      return withRelations(
        state.workflowItems.find((item) => item.emailDerivedOfferId === where.emailDerivedOfferId) ?? null,
      );
    }

    if (where.id) {
      return withRelations(state.workflowItems.find((item) => item.id === where.id) ?? null);
    }

    return null;
  });

  stubMethod(db.offerWorkflowItem, 'create', async ({ data }: any) => {
    const created = {
      id: nextId('workflow'),
      assigneeUserId: null,
      assigneeLabel: null,
      latestNote: null,
      supplierQualificationStatus: 'UNKNOWN',
      hasUnknownSupplierQualification: true,
      hasRestrictedSupplier: false,
      hasBlockedSupplier: false,
      qualificationRiskNote: null,
      inboundEmail: null,
      buyDecision: null,
      emailDerivedOffer: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    state.workflowItems.push(created);
    return created;
  });

  stubMethod(db.offerWorkflowItem, 'update', async ({ where, data }: any) => {
    const existing = state.workflowItems.find((item) => item.id === where.id);
    Object.assign(existing ?? {}, data, { updatedAt: new Date() });
    if (existing) {
      existing.buyDecision = state.buyDecisions.find((entry) => entry.offerWorkflowItemId === existing.id) ?? null;
      const offer = state.offers.find((entry) => entry.id === existing.emailDerivedOfferId) ?? null;
      existing.emailDerivedOffer = offer
        ? {
            ...offer,
            resolutionCandidates: state.resolutionCandidates.filter(
              (entry) => entry.emailDerivedOfferId === offer.id,
            ),
            buyDecision: state.buyDecisions.find((entry) => entry.emailDerivedOfferId === offer.id) ?? null,
          }
        : null;
    }
    return existing;
  });

  stubMethod(db.offerWorkflowItem, 'findMany', async ({ where, orderBy, take }: any = {}) => {
    let items = [...state.workflowItems];

    if (where?.status?.in) {
      items = items.filter((item) => where.status.in.includes(item.status));
    } else if (where?.status) {
      items = items.filter((item) => item.status === where.status);
    }

    if (where?.hasUnresolvedSupplier === true) {
      items = items.filter((item) => item.hasUnresolvedSupplier === true);
    }

    if (where?.hasConflictingSupplierCues === true) {
      items = items.filter((item) => item.hasConflictingSupplierCues === true);
    }

    if (where?.hasBlockedSupplier === true) {
      items = items.filter((item) => item.hasBlockedSupplier === true);
    }

    if (where?.hasRestrictedSupplier === true) {
      items = items.filter((item) => item.hasRestrictedSupplier === true);
    }

    if (where?.hasUnknownSupplierQualification === true) {
      items = items.filter((item) => item.hasUnknownSupplierQualification === true);
    }

    if (where?.buyDecision?.isNot === null) {
      items = items.filter((item) =>
        state.buyDecisions.some((entry) => entry.offerWorkflowItemId === item.id),
      );
    }

    if (where?.buyDecision?.is === null) {
      items = items.filter((item) =>
        !state.buyDecisions.some((entry) => entry.offerWorkflowItemId === item.id),
      );
    }

    if (Array.isArray(orderBy) && orderBy[1]?.createdAt === 'asc') {
      items.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    } else {
      items.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    }

    const mapped = items.map((item) => ({
      ...item,
      inboundEmail: state.inboundEmails.find((entry) => entry.id === item.inboundEmailId) ?? null,
      buyDecision: state.buyDecisions.find((entry) => entry.offerWorkflowItemId === item.id) ?? null,
      emailDerivedOffer: (() => {
        const offer = state.offers.find((entry) => entry.id === item.emailDerivedOfferId) ?? null;
        if (!offer) {
          return null;
        }
        return {
          ...offer,
          resolutionCandidates: state.resolutionCandidates.filter(
            (entry) => entry.emailDerivedOfferId === offer.id,
          ),
          buyDecision: state.buyDecisions.find((entry) => entry.emailDerivedOfferId === offer.id) ?? null,
        };
      })(),
    }));

    return typeof take === 'number' ? mapped.slice(0, take) : mapped;
  });

  stubMethod(db.offerWorkflowEvent, 'create', async ({ data }: any) => {
    const created = {
      id: nextId('workflow-event'),
      createdAt: new Date(),
      ...data,
    };
    state.workflowEvents.push(created);
    return created;
  });

  stubMethod(db.offerWorkflowEvent, 'findMany', async ({ where }: any) => {
    return state.workflowEvents.filter((item) => item.workflowItemId === where.workflowItemId);
  });

  stubMethod(db.supplierQualification, 'findUnique', async ({ where }: any) => {
    return state.supplierQualifications.find((item) => item.supplierId === where.supplierId) ?? null;
  });

  stubMethod(db.buyDecision, 'findUnique', async ({ where }: any) => {
    if (where.emailDerivedOfferId) {
      return state.buyDecisions.find((item) => item.emailDerivedOfferId === where.emailDerivedOfferId) ?? null;
    }
    if (where.id) {
      return state.buyDecisions.find((item) => item.id === where.id) ?? null;
    }
    return null;
  });

  stubMethod(db.buyDecision, 'create', async ({ data }: any) => {
    const created = {
      id: nextId('buy-decision'),
      approvalNote: null,
      externalOrderReference: null,
      orderedAt: null,
      ...data,
    };
    state.buyDecisions.push(created);
    return created;
  });

  stubMethod(db.buyDecision, 'update', async ({ where, data }: any) => {
    const existing = state.buyDecisions.find((item) => item.id === where.id);
    Object.assign(existing ?? {}, data);
    return existing;
  });

  stubMethod(db.buyDecision, 'findMany', async () => state.buyDecisions);

  stubMethod(db.buyDecisionEvent, 'create', async ({ data }: any) => {
    const created = {
      id: nextId('buy-decision-event'),
      createdAt: new Date(),
      ...data,
    };
    state.buyDecisionEvents.push(created);
    return created;
  });

  stubMethod(db.emailDerivedOffer, 'upsert', async ({ where, update, create }: any) => {
    const existing = state.offers.find(
      (item) =>
        item.inboundEmailId === where.inboundEmailId_offerFingerprint.inboundEmailId &&
        item.offerFingerprint === where.inboundEmailId_offerFingerprint.offerFingerprint,
    );

    if (existing) {
      Object.assign(existing, update);
      return existing;
    }

    const created = { id: nextId('offer'), ...create };
    state.offers.push(created);
    return created;
  });

  stubMethod(db.emailDerivedOffer, 'update', async ({ where, data }: any) => {
    const existing = state.offers.find((item) => item.id === where.id);
    Object.assign(existing ?? {}, data);
    return existing;
  });

  stubMethod(db.emailDerivedOffer, 'deleteMany', async ({ where }: any) => {
    const removedOfferIds: string[] = [];
    state.offers = state.offers.filter((item) => {
      if (item.inboundEmailId !== where.inboundEmailId) {
        return true;
      }

      if (where.offerFingerprint?.notIn) {
        const keep = where.offerFingerprint.notIn.includes(item.offerFingerprint);
        if (!keep) {
          removedOfferIds.push(item.id);
        }
        return keep;
      }

      removedOfferIds.push(item.id);
      return false;
    });
    if (removedOfferIds.length > 0) {
      state.workflowItems = state.workflowItems.filter(
        (item) => !removedOfferIds.includes(item.emailDerivedOfferId),
      );
      state.buyDecisions = state.buyDecisions.filter(
        (item) => !removedOfferIds.includes(item.emailDerivedOfferId),
      );
      state.workflowEvents = state.workflowEvents.filter((event) =>
        state.workflowItems.some((item) => item.id === event.workflowItemId),
      );
      state.buyDecisionEvents = state.buyDecisionEvents.filter((event) =>
        state.buyDecisions.some((item) => item.id === event.buyDecisionId),
      );
    }
    return { count: 0 };
  });

  stubMethod(db.supplier, 'findFirst', async ({ where }: any) => {
    return state.suppliers.find((item) => item.normalizedName === where.normalizedName) ?? null;
  });

  stubMethod(db.supplier, 'findUnique', async ({ where }: any) => {
    return state.suppliers.find((item) => item.normalizedName === where.normalizedName) ?? null;
  });

  stubMethod(db.supplier, 'create', async ({ data }: any) => {
    const created = { id: nextId('supplier'), ...data };
    state.suppliers.push(created);
    return created;
  });

  stubMethod(db.product, 'findFirst', async ({ where }: any) => {
    return state.products.find((item) => item.normalizedName === where.normalizedName) ?? null;
  });

  stubMethod(db.product, 'findUnique', async ({ where }: any) => {
    return state.products.find((item) => item.id === where.id) ?? null;
  });

  stubMethod(db.product, 'update', async ({ where, data }: any) => {
    const existing = state.products.find((item) => item.id === where.id);
    Object.assign(existing ?? {}, data);
    return existing;
  });

  stubMethod(db.product, 'create', async ({ data }: any) => {
    const created = { id: nextId('product'), ...data };
    state.products.push(created);
    return created;
  });

  stubMethod(db.productAlias, 'findFirst', async () => null);
  stubMethod(db.productAlias, 'findMany', async () => []);
  stubMethod(db.productAlias, 'create', async ({ data }: any) => ({ id: nextId('alias'), ...data }));

  stubMethod(db.supplierPriceList, 'upsert', async ({ where, update, create }: any) => {
    const existing = state.priceLists.find(
      (item) =>
        item.supplierId === where.supplierId_sourceInboundEmailId.supplierId &&
        item.sourceInboundEmailId === where.supplierId_sourceInboundEmailId.sourceInboundEmailId,
    );

    if (existing) {
      Object.assign(existing, update);
      return existing;
    }

    const created = { id: nextId('price-list'), ...create };
    state.priceLists.push(created);
    return created;
  });

  stubMethod(db.supplierPriceItem, 'upsert', async ({ where, update, create }: any) => {
    const existing = state.priceItems.find(
      (item) =>
        item.supplierPriceListId === where.supplierPriceListId_promotionFingerprint.supplierPriceListId &&
        item.promotionFingerprint === where.supplierPriceListId_promotionFingerprint.promotionFingerprint,
    );

    if (existing) {
      Object.assign(existing, update);
      return existing;
    }

    const created = { id: nextId('price-item'), ...create };
    state.priceItems.push(created);
    return created;
  });

  return state;
}

test('same inbound email processed twice does not duplicate staged offers', async (t) => {
  const state = installDbMocks(t);
  const originalMappings = env.emailInboundSupplierMappings;
  const originalAllowedSenders = env.emailInboundAllowedSenders;

  env.emailInboundSupplierMappings = [{ pattern: 'pricing@supplier.co', supplierName: 'Supplier Co' }];
  env.emailInboundAllowedSenders = ['pricing@supplier.co'];

  t.after(() => {
    env.emailInboundSupplierMappings = originalMappings;
    env.emailInboundAllowedSenders = originalAllowedSenders;
  });

  const message = {
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: 'graph-1',
    messageId: 'internet-1',
    from: 'pricing@supplier.co',
    subject: 'Offer',
    bodyText: [
      'Amlodipine 5mg tabs 28 - GBP 8.40',
      'Paracetamol 500mg caplets 16 - GBP 1.25',
    ].join('\n'),
  };
  const result = createInboundResult();

  await stageInboundEmail(message, result);
  await stageInboundEmail(message, result);

  assert.equal(state.offers.length, 2);
  assert.equal(state.workflowItems.length, 2);
  assert.equal(state.workflowEvents.filter((event) => event.actionType === 'CREATED').length, 2);
});

test('persistPromotion is idempotent and reuses one supplier price list per inbound email batch', async (t) => {
  const state = installDbMocks(t);

  const baseOffer = {
    sourceKind: 'STRICT_BODY_MAIN',
    sourceBlockText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
    rawProductText: 'Amlodipine 5mg tabs 28',
    normalizedProductNameCandidate: 'amlodipine 5mg tabs 28',
    strengthCandidate: '5mg',
    dosageFormCandidate: 'tabs',
    packSizeCandidate: '28',
    manufacturerCandidate: null,
    supplierCandidate: 'Supplier Co',
    priceCandidate: { toString: () => '8.40' } as never,
    currencyCandidate: 'GBP',
    minimumOrderQuantityCandidate: null,
    availabilityCandidate: 'available',
    sourceTrustScore: 85,
    structureConfidence: 90,
    fieldConfidence: 90,
    entityResolutionConfidence: 88,
    promotionConfidence: 88,
    reviewReason: null,
    aiAssisted: false,
    evidences: [],
    sourceDocumentIndex: 0,
    resolutionCandidates: [
      {
        entityType: 'SUPPLIER' as const,
        candidateId: null,
        candidateName: 'Supplier Co',
        confidence: 88,
        reason: 'sender_mapping',
        selected: true,
      },
    ],
  };

  await persistPromotion('email-1', 'offer-1', baseOffer);
  await persistPromotion('email-1', 'offer-1', baseOffer);
  await persistPromotion('email-1', 'offer-2', {
    ...baseOffer,
    sourceBlockText: 'Paracetamol 500mg caplets 16 - GBP 1.25',
    rawProductText: 'Paracetamol 500mg caplets 16',
    normalizedProductNameCandidate: 'paracetamol 500mg caplets 16',
    strengthCandidate: '500mg',
    dosageFormCandidate: 'caplets',
    packSizeCandidate: '16',
    priceCandidate: { toString: () => '1.25' } as never,
  });

  assert.equal(state.priceLists.length, 1);
  assert.equal(state.priceItems.length, 2);
  assert.equal(
    state.priceItems.filter((item) => item.rawProductName === 'Amlodipine 5mg tabs 28').length,
    1,
  );
});

test('review-required offers do not remain staged when supplier cues conflict', async (t) => {
  const state = installDbMocks(t);
  const originalMappings = env.emailInboundSupplierMappings;
  const originalAllowedSenders = env.emailInboundAllowedSenders;

  env.emailInboundSupplierMappings = [{ pattern: 'pricing@supplier.co', supplierName: 'Supplier One' }];
  env.emailInboundAllowedSenders = ['pricing@supplier.co'];

  t.after(() => {
    env.emailInboundSupplierMappings = originalMappings;
    env.emailInboundAllowedSenders = originalAllowedSenders;
  });

  await stageInboundEmail(
    {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'graph-2',
      messageId: 'internet-2',
      from: 'pricing@supplier.co',
      subject: 'Offer',
      bodyText: [
        'Amlodipine 5mg tabs 28 - GBP 8.40',
        '',
        'Kind regards,',
        'Supplier Two Ltd',
      ].join('\n'),
    },
    createInboundResult(),
  );

  assert.equal(state.offers.length, 1);
  assert.equal(state.offers[0]?.status, 'REVIEW_REQUIRED');
  assert.equal(state.offers[0]?.reviewReason, 'conflicting_supplier_cues');
  assert.equal(state.workflowItems.length, 1);
  assert.equal(state.workflowItems[0]?.status, 'NEW');
  assert.equal(state.workflowItems[0]?.priority, 'HIGH');
  assert.equal(state.workflowItems[0]?.hasConflictingSupplierCues, true);
  assert.equal(state.workflowEvents[0]?.actionType, 'CREATED');
  assert.equal(state.priceLists.length, 0);
  assert.equal(state.inboundEmails[0]?.processingStatus, 'REVIEW_REQUIRED');
});

test('same review-required offer does not create duplicate workflow items', async (t) => {
  const state = installDbMocks(t);
  const originalMappings = env.emailInboundSupplierMappings;
  const originalAllowedSenders = env.emailInboundAllowedSenders;

  env.emailInboundSupplierMappings = [{ pattern: 'pricing@supplier.co', supplierName: 'Supplier One' }];
  env.emailInboundAllowedSenders = ['pricing@supplier.co'];

  t.after(() => {
    env.emailInboundSupplierMappings = originalMappings;
    env.emailInboundAllowedSenders = originalAllowedSenders;
  });

  const message = {
    sourceSystem: 'MICROSOFT_GRAPH',
    externalMessageId: 'graph-3',
    messageId: 'internet-3',
    from: 'pricing@supplier.co',
    subject: 'Offer',
    bodyText: [
      'Amlodipine 5mg tabs 28 - GBP 8.40',
      '',
      'Kind regards,',
      'Supplier Two Ltd',
    ].join('\n'),
  };

  await stageInboundEmail(message, createInboundResult());
  await stageInboundEmail(message, createInboundResult());

  assert.equal(state.workflowItems.length, 1);
  assert.equal(state.workflowEvents.filter((event) => event.actionType === 'CREATED').length, 1);
});

test('parent inbound email review reason falls back to promotion threshold when offers require review', async (t) => {
  const state = installDbMocks(t);

  await stageInboundEmail(
    {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'graph-review-reason',
      messageId: 'internet-review-reason',
      from: 'pricing@supplier.co',
      subject: 'Offer',
      bodyText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
    },
    createInboundResult({
      processingStatus: 'REVIEW_REQUIRED',
      reason: 'Extracted text from the image attachment but found no safe structured commercial rows.',
    }),
  );

  assert.equal(state.offers.length, 1);
  assert.equal(state.offers[0]?.reviewReason, 'promotion_threshold_not_met');
  assert.equal(state.inboundEmails[0]?.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(state.inboundEmails[0]?.reviewReason, 'promotion_threshold_not_met');
});

test('mergeResolvedOffers preserves deterministic and ai extraction run provenance', () => {
  const merged = mergeResolvedOffers(
    [
      {
        sourceKind: 'STRICT_BODY_MAIN',
        sourceBlockText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
        rawProductText: 'Amlodipine 5mg tabs 28',
        normalizedProductNameCandidate: 'amlodipine 5mg tabs 28',
        strengthCandidate: '5mg',
        dosageFormCandidate: 'tabs',
        packSizeCandidate: '28',
        manufacturerCandidate: null,
        supplierCandidate: 'Supplier Co',
        priceCandidate: { toString: () => '8.40' } as never,
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: null,
        availabilityCandidate: null,
        sourceTrustScore: 80,
        structureConfidence: 90,
        fieldConfidence: 90,
        entityResolutionConfidence: 85,
        promotionConfidence: 88,
        reviewReason: null,
        aiAssisted: false,
        evidences: [],
        sourceDocumentIndex: 0,
        extractionRunId: 'det-run',
        resolutionCandidates: [],
      },
    ],
    [
      {
        sourceKind: 'AI_PARAGRAPH_OFFER',
        sourceBlockText: 'We can offer Paracetamol 500mg caplets 16 at GBP 1.25',
        rawProductText: 'Paracetamol 500mg caplets 16',
        normalizedProductNameCandidate: 'paracetamol 500mg caplets 16',
        strengthCandidate: '500mg',
        dosageFormCandidate: 'caplets',
        packSizeCandidate: '16',
        manufacturerCandidate: null,
        supplierCandidate: 'Supplier Co',
        priceCandidate: { toString: () => '1.25' } as never,
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: null,
        availabilityCandidate: null,
        sourceTrustScore: 70,
        structureConfidence: 58,
        fieldConfidence: 55,
        entityResolutionConfidence: 60,
        promotionConfidence: 55,
        reviewReason: 'ai_extracted_candidate_requires_review',
        aiAssisted: true,
        evidences: [],
        sourceDocumentIndex: 0,
        extractionRunId: 'ai-run',
        resolutionCandidates: [],
      },
    ],
  );

  assert.equal(merged[0]?.extractionRunId, 'det-run');
  assert.equal(merged[1]?.extractionRunId, 'ai-run');
});
