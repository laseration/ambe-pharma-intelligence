import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTradeOpportunityService,
  syncTradeOpportunityCommercialState,
} from '../service';

function createRepositoryHarness() {
  const tradeOpportunities: Array<Record<string, any>> = [];
  const tradeOpportunityEvents: Array<Record<string, any>> = [];
  const messagingPolicies: Array<Record<string, any>> = [];
  const drafts: Array<Record<string, any>> = [];
  const feedbacks: Array<Record<string, any>> = [];
  const offers: Array<Record<string, any>> = [];
  const workflows: Array<Record<string, any>> = [];
  const buyDecisions: Array<Record<string, any>> = [];
  const buyExecutions: Array<Record<string, any>> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const cloneArray = (items: Array<Record<string, any>>) =>
    items.map((item) => ({
      ...item,
      resolutionCandidates: Array.isArray(item.resolutionCandidates)
        ? item.resolutionCandidates.map((candidate: Record<string, any>) => ({
            ...candidate,
          }))
        : item.resolutionCandidates,
      workflowItem: item.workflowItem
        ? { ...item.workflowItem }
        : item.workflowItem,
      inboundEmail: item.inboundEmail
        ? { ...item.inboundEmail }
        : item.inboundEmail,
      execution: item.execution ? { ...item.execution } : item.execution,
      supplier: item.supplier ? { ...item.supplier } : item.supplier,
      drafts: Array.isArray(item.drafts)
        ? item.drafts.map((draft: Record<string, any>) => ({ ...draft }))
        : item.drafts,
      events: Array.isArray(item.events)
        ? item.events.map((event: Record<string, any>) => ({ ...event }))
        : item.events,
    }));

  const cloneState = () => ({
    tradeOpportunities: cloneArray(tradeOpportunities),
    tradeOpportunityEvents: cloneArray(tradeOpportunityEvents),
    messagingPolicies: cloneArray(messagingPolicies),
    drafts: cloneArray(drafts),
    feedbacks: cloneArray(feedbacks),
    offers: cloneArray(offers),
    workflows: cloneArray(workflows),
    buyDecisions: cloneArray(buyDecisions),
    buyExecutions: cloneArray(buyExecutions),
  });

  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    tradeOpportunities.splice(
      0,
      tradeOpportunities.length,
      ...snapshot.tradeOpportunities,
    );
    tradeOpportunityEvents.splice(
      0,
      tradeOpportunityEvents.length,
      ...snapshot.tradeOpportunityEvents,
    );
    messagingPolicies.splice(
      0,
      messagingPolicies.length,
      ...snapshot.messagingPolicies,
    );
    drafts.splice(0, drafts.length, ...snapshot.drafts);
    feedbacks.splice(0, feedbacks.length, ...snapshot.feedbacks);
    offers.splice(0, offers.length, ...snapshot.offers);
    workflows.splice(0, workflows.length, ...snapshot.workflows);
    buyDecisions.splice(0, buyDecisions.length, ...snapshot.buyDecisions);
    buyExecutions.splice(0, buyExecutions.length, ...snapshot.buyExecutions);
  };

  const attachRelations = (tradeOpportunity: Record<string, any>) => ({
    ...tradeOpportunity,
    messagingPolicy:
      messagingPolicies.find(
        (item) => item.tradeOpportunityId === tradeOpportunity.id,
      ) ?? null,
    drafts: drafts
      .filter((item) => item.tradeOpportunityId === tradeOpportunity.id)
      .sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      ),
    events: tradeOpportunityEvents
      .filter((item) => item.tradeOpportunityId === tradeOpportunity.id)
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      ),
    supplier: tradeOpportunity.supplierId
      ? {
          id: tradeOpportunity.supplierId,
          name: tradeOpportunity.sourceSupplierNameSnapshot ?? 'Supplier',
        }
      : null,
    product: tradeOpportunity.productId
      ? {
          id: tradeOpportunity.productId,
          name:
            tradeOpportunity.normalizedProductNameCandidate ??
            tradeOpportunity.rawProductText ??
            'Product',
        }
      : null,
    buyDecision: tradeOpportunity.buyDecisionId
      ? buyDecisions.find((item) => item.id === tradeOpportunity.buyDecisionId)
        ? {
            id: buyDecisions.find(
              (item) => item.id === tradeOpportunity.buyDecisionId,
            )!.id,
            approvalStatus: buyDecisions.find(
              (item) => item.id === tradeOpportunity.buyDecisionId,
            )!.approvalStatus,
            orderStatus: buyDecisions.find(
              (item) => item.id === tradeOpportunity.buyDecisionId,
            )!.orderStatus,
            supplierQualificationStatus: buyDecisions.find(
              (item) => item.id === tradeOpportunity.buyDecisionId,
            )!.supplierQualificationStatus,
            hasQualificationRisk: buyDecisions.find(
              (item) => item.id === tradeOpportunity.buyDecisionId,
            )!.hasQualificationRisk,
          }
        : null
      : null,
    buyExecution: tradeOpportunity.buyExecutionId
      ? buyExecutions.find(
          (item) => item.id === tradeOpportunity.buyExecutionId,
        )
        ? {
            id: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.id,
            fulfillmentStatus: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.fulfillmentStatus,
            reconciliationStatus: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.reconciliationStatus,
            hasPriceDrift: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.hasPriceDrift,
            hasQuantityDrift: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.hasQuantityDrift,
            hasCurrencyMismatch: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.hasCurrencyMismatch,
            hasAvailabilityDrift: buyExecutions.find(
              (item) => item.id === tradeOpportunity.buyExecutionId,
            )!.hasAvailabilityDrift,
          }
        : null
      : null,
  });

  return {
    tradeOpportunities,
    tradeOpportunityEvents,
    messagingPolicies,
    drafts,
    feedbacks,
    offers,
    workflows,
    buyDecisions,
    buyExecutions,
    repository: {
      async transaction(callback: (repository: unknown) => Promise<unknown>) {
        const snapshot = cloneState();
        try {
          return await callback(this as never);
        } catch (error) {
          restoreState(snapshot);
          throw error;
        }
      },
      async findById(tradeOpportunityId: string) {
        const item = tradeOpportunities.find(
          (tradeOpportunity) => tradeOpportunity.id === tradeOpportunityId,
        );
        return item ? (attachRelations(item) as never) : null;
      },
      async list(filters: Record<string, any>) {
        return tradeOpportunities
          .filter((item) => {
            if (filters.status && item.status !== filters.status) {
              return false;
            }
            if (filters.stage && item.stage !== filters.stage) {
              return false;
            }
            if (
              filters.emailDerivedOfferId &&
              item.emailDerivedOfferId !== filters.emailDerivedOfferId
            ) {
              return false;
            }
            if (
              typeof filters.hasMessagingPolicyViolations === 'boolean' &&
              item.hasMessagingPolicyViolations !==
                filters.hasMessagingPolicyViolations
            ) {
              return false;
            }
            return true;
          })
          .map((item) => attachRelations(item)) as never;
      },
      async create(data: Record<string, unknown>) {
        const created: Record<string, any> = {
          id: nextId('trade'),
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
          closeReason: null,
          ownerUserId: null,
          ownerLabel: null,
          rationale: null,
          quantityTarget: null,
          targetBuyerNameSnapshot: null,
          targetBuyerCompanySnapshot: null,
          targetSellUnitPrice: null,
          targetSellCurrencyCode: null,
          minimumMarginAmount: null,
          minimumMarginPct: null,
          estimatedMarginAmount: null,
          estimatedMarginPct: null,
          riskFlags: [],
          hasQualificationBlock: false,
          isMarginFloorMet: true,
          isActionable: false,
          hasMessagingPolicyViolations: false,
          messagingPolicyViolationCount: 0,
          metadata: null,
          ...data,
        };
        tradeOpportunities.push(created);
        return attachRelations(created) as never;
      },
      async update(tradeOpportunityId: string, data: Record<string, unknown>) {
        const existing = tradeOpportunities.find(
          (tradeOpportunity) => tradeOpportunity.id === tradeOpportunityId,
        );
        if (!existing) {
          throw new Error('Trade opportunity not found.');
        }

        Object.assign(existing, data, { updatedAt: new Date() });
        return attachRelations(existing) as never;
      },
      async createTradeOpportunityEvent(data: Record<string, unknown>) {
        const created = {
          id: nextId('trade-event'),
          createdAt: new Date(),
          ...data,
        };
        tradeOpportunityEvents.push(created);
        return created as never;
      },
      async listEvents(tradeOpportunityId: string) {
        return tradeOpportunityEvents.filter(
          (item) => item.tradeOpportunityId === tradeOpportunityId,
        ) as never;
      },
      async findPolicyByTradeOpportunityId(tradeOpportunityId: string) {
        return (messagingPolicies.find(
          (item) => item.tradeOpportunityId === tradeOpportunityId,
        ) ?? null) as never;
      },
      async createPolicy(data: Record<string, unknown>) {
        const created = {
          id: nextId('policy'),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        messagingPolicies.push(created);
        return created as never;
      },
      async updatePolicy(
        tradeOpportunityId: string,
        data: Record<string, unknown>,
      ) {
        const existing = messagingPolicies.find(
          (item) => item.tradeOpportunityId === tradeOpportunityId,
        );
        if (!existing) {
          throw new Error('Trade opportunity messaging policy not found.');
        }

        Object.assign(existing, data, { updatedAt: new Date() });
        return existing as never;
      },
      async listDrafts(tradeOpportunityId: string) {
        return drafts
          .filter((item) => item.tradeOpportunityId === tradeOpportunityId)
          .sort(
            (left, right) =>
              right.updatedAt.getTime() - left.updatedAt.getTime(),
          ) as never;
      },
      async findDraftById(draftId: string) {
        return (drafts.find((item) => item.id === draftId) ?? null) as never;
      },
      async findMatchingDraft(
        tradeOpportunityId: string,
        contentHash: string,
        direction: string,
        messagePurpose: string,
      ) {
        return (drafts.find(
          (item) =>
            item.tradeOpportunityId === tradeOpportunityId &&
            item.contentHash === contentHash &&
            item.direction === direction &&
            item.messagePurpose === messagePurpose &&
            !['REJECTED', 'CANCELLED'].includes(item.status),
        ) ?? null) as never;
      },
      async createDraft(data: Record<string, unknown>) {
        const created = {
          id: nextId('draft'),
          createdAt: new Date(),
          updatedAt: new Date(),
          approvedAt: null,
          approvedByType: null,
          approvedByIdentifier: null,
          sentAt: null,
          metadata: null,
          ...data,
        };
        drafts.push(created);
        return created as never;
      },
      async updateDraft(draftId: string, data: Record<string, unknown>) {
        const existing = drafts.find((item) => item.id === draftId);
        if (!existing) {
          throw new Error('Trade draft not found.');
        }

        Object.assign(existing, data, { updatedAt: new Date() });
        return existing as never;
      },
      async findRecentMatchingFeedback(input: Record<string, any>) {
        return (feedbacks
          .filter(
            (item) => item.createdAt.getTime() >= input.createdAfter.getTime(),
          )
          .find(
            (item) =>
              item.emailDerivedOfferId === input.emailDerivedOfferId &&
              item.offerWorkflowItemId === input.offerWorkflowItemId &&
              item.tradeOpportunityId === input.tradeOpportunityId &&
              item.tradeMessageDraftId === input.tradeMessageDraftId &&
              item.feedbackType === input.feedbackType &&
              item.verdict === input.verdict &&
              item.actorType === input.actorType &&
              item.actorIdentifier === input.actorIdentifier,
          ) ?? null) as never;
      },
      async createFeedback(data: Record<string, unknown>) {
        const created = {
          id: nextId('feedback'),
          createdAt: new Date(),
          ...data,
        };
        feedbacks.push(created);
        return created as never;
      },
      async findTradeMessageDraftById(draftId: string) {
        const draft = drafts.find((item) => item.id === draftId);
        return draft
          ? ({
              id: draft.id,
              tradeOpportunityId: draft.tradeOpportunityId,
            } as never)
          : null;
      },
      async findOfferById(emailDerivedOfferId: string) {
        return (offers.find((offer) => offer.id === emailDerivedOfferId) ??
          null) as never;
      },
      async findWorkflowById(workflowItemId: string) {
        return (workflows.find((workflow) => workflow.id === workflowItemId) ??
          null) as never;
      },
      async findBuyDecisionById(buyDecisionId: string) {
        return (buyDecisions.find((item) => item.id === buyDecisionId) ??
          null) as never;
      },
      async findBuyExecutionById(buyExecutionId: string) {
        return (buyExecutions.find((item) => item.id === buyExecutionId) ??
          null) as never;
      },
      async listActiveByOfferIds(emailDerivedOfferIds: string[]) {
        return tradeOpportunities
          .filter(
            (item) =>
              item.emailDerivedOfferId &&
              emailDerivedOfferIds.includes(item.emailDerivedOfferId) &&
              ['OPEN', 'ON_HOLD'].includes(item.status),
          )
          .map((item) => attachRelations(item)) as never;
      },
      async listRecentSalesByProductId() {
        return [] as never;
      },
      async listActiveByOfferId(emailDerivedOfferId: string) {
        return tradeOpportunities
          .filter(
            (item) =>
              item.emailDerivedOfferId === emailDerivedOfferId &&
              ['OPEN', 'ON_HOLD'].includes(item.status),
          )
          .map((item) => attachRelations(item)) as never;
      },
      async updateTradeOpportunity(
        tradeOpportunityId: string,
        data: Record<string, unknown>,
      ) {
        return this.update(tradeOpportunityId, data);
      },
    },
  };
}

function createService(harness: ReturnType<typeof createRepositoryHarness>) {
  return createTradeOpportunityService(harness.repository as never, {
    getOfferFeedbackSummariesForOfferIds: async () => ({
      'offer-1': {
        hasFeedback: false,
        extractionVerdict: null,
        supplierResolutionVerdict: null,
        signalVerdict: null,
        feedbackCount: 0,
      },
    }),
    getOfferLearningSummariesForOfferIds: async () => ({
      'offer-1': {
        hasCorrection: true,
        latestCorrectionStatus: 'APPLIED',
        latestCorrectionId: 'correction-1',
        sourceReliabilityTier: 'WATCH',
        sourceReliabilityScore: 58,
        sourceProfileId: 'source-profile-1',
        hasLearnedSupplierSuggestion: true,
        learnedSupplierId: 'supplier-1',
        learnedSupplierName: 'Supplier One',
        hasLearnedProductSuggestion: false,
        learnedProductId: null,
        learnedProductName: null,
        hasLearnedManufacturerSuggestion: true,
        learnedManufacturer: 'Manufacturer A',
        recommendedNextAction: 'trust but verify',
      },
    }),
    getTradeFeedbackSummariesForTradeOpportunityIds: async () => ({}),
    getAutomationReadinessOverview: async () =>
      ({
        policy: {
          globalMode: 'INTERNAL_SIGNALS_ONLY',
        },
        evaluation: {},
        decisions: {
          internalSignals: {
            eligible: false,
            blockedReasons: [
              'minimum sample size not met for extraction feedback',
            ],
          },
          supplierDrafts: {
            eligible: false,
            blockedReasons: [
              'policy mode is below drafts-only for supplier outreach drafts',
            ],
          },
          buyerDrafts: {
            eligible: false,
            blockedReasons: [
              'policy mode is below drafts-only for buyer outreach drafts',
            ],
          },
          assistedOutreach: { eligible: false, blockedReasons: [] },
          actualSend: {
            eligible: false,
            blockedReasons: [
              'live autonomous sending remains blocked in this implementation pass',
            ],
          },
        },
        recommendedAction: 'review more samples',
      }) as never,
  });
}

function seedOffer(
  harness: ReturnType<typeof createRepositoryHarness>,
  overrides?: Record<string, unknown>,
) {
  const workflow = {
    id: 'workflow-1',
    emailDerivedOfferId: 'offer-1',
    inboundEmailId: 'email-1',
    status: 'NEW',
    assigneeUserId: null,
    assigneeLabel: 'buyer-desk',
    supplierQualificationStatus: 'APPROVED',
    qualificationRiskNote: null,
  };
  const offer = {
    id: 'offer-1',
    inboundEmailId: 'email-1',
    status: 'REVIEW_REQUIRED',
    rawProductText: 'Amlodipine 5mg tabs 28',
    normalizedProductNameCandidate: 'amlodipine 5mg tabs 28',
    manufacturerCandidate: 'Manufacturer A',
    supplierCandidate: 'Supplier One',
    priceCandidate: { toString: () => '8.40' },
    currencyCandidate: 'GBP',
    minimumOrderQuantityCandidate: 100,
    availabilityCandidate: 'available',
    aiAssisted: false,
    fieldConfidence: 88,
    metadata: {
      sender: 'pricing@supplier-one.test',
      subject: 'Offer',
      fieldConfidence: 88,
      aiAssisted: false,
    },
    resolutionCandidates: [
      {
        entityType: 'SUPPLIER',
        candidateId: 'supplier-1',
        candidateName: 'Supplier One',
        selected: true,
      },
      {
        entityType: 'PRODUCT',
        candidateId: 'product-1',
        candidateName: 'Amlodipine 5mg tabs 28',
        selected: true,
      },
    ],
    workflowItem: workflow,
    inboundEmail: {
      id: 'email-1',
      subject: 'Offer',
      fromEmail: 'pricing@supplier-one.test',
    },
    ...overrides,
  };

  harness.workflows.push(workflow);
  harness.offers.push(offer);
}

test('creating a deal from the same staged offer reuses one active deal', async () => {
  const harness = createRepositoryHarness();
  const service = createService(harness);
  seedOffer(harness);

  const first = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    targetSellUnitPrice: 10.25,
    targetSellCurrencyCode: 'GBP',
    minimumMarginPct: 0.1,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  const second = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    targetSellUnitPrice: 10.25,
    targetSellCurrencyCode: 'GBP',
    minimumMarginPct: 0.1,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(harness.tradeOpportunities.length, 1);
  assert.equal(first.id, second.id);
  assert.equal(first.stage, 'READY_FOR_BUY');
  assert.equal(first.status, 'OPEN');
  assert.equal(first.summary.estimatedMarginAmount, 1.85);
  assert.equal(first.summary.estimatedMarginPct, 0.180488);
  assert.equal(first.summary.hasOfferCorrection, true);
  assert.equal(first.summary.sourceReliabilityTier, 'WATCH');
  assert.equal(first.summary.hasLearnedSupplierSuggestion, true);
  assert.equal(first.summary.learnedSupplierName, 'Supplier One');
  assert.equal(first.summary.hasLearnedManufacturerSuggestion, true);
  assert.equal(first.summary.learningRecommendedAction, 'trust but verify');
  assert.equal(first.summary.automationMode, 'INTERNAL_SIGNALS_ONLY');
  assert.equal(
    first.summary.automationRecommendedAction,
    'review more samples',
  );
});

test('supplier qualification risk and margin floor drive conservative deal flags', async () => {
  const harness = createRepositoryHarness();
  const service = createService(harness);
  seedOffer(harness, {
    workflowItem: {
      id: 'workflow-1',
      emailDerivedOfferId: 'offer-1',
      inboundEmailId: 'email-1',
      status: 'NEW',
      assigneeUserId: null,
      assigneeLabel: 'buyer-desk',
      supplierQualificationStatus: 'RESTRICTED',
      qualificationRiskNote: 'Supplier is restricted.',
    },
  });

  const tradeOpportunity = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    targetSellUnitPrice: 8.7,
    targetSellCurrencyCode: 'GBP',
    minimumMarginPct: 0.1,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(tradeOpportunity.status, 'ON_HOLD');
  assert.equal(tradeOpportunity.isMarginFloorMet, false);
  assert.match(
    JSON.stringify(tradeOpportunity.riskFlags),
    /restricted_supplier/,
  );
  assert.match(
    JSON.stringify(tradeOpportunity.riskFlags),
    /margin_below_floor/,
  );
  assert.equal(
    tradeOpportunity.summary.recommendedNextStep,
    'qualify supplier',
  );
});

test('buyer-facing and supplier-facing drafts are blocked when identity leakage is detected', async () => {
  const harness = createRepositoryHarness();
  const service = createService(harness);
  seedOffer(harness);

  const tradeOpportunity = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    sourceSupplierNameSnapshot: 'Supplier One',
    targetBuyerNameSnapshot: 'Alice Buyer',
    targetBuyerCompanySnapshot: 'Buyer Ltd',
    targetSellUnitPrice: 10.25,
    targetSellCurrencyCode: 'GBP',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  const buyerDraft = await service.generateTradeMessageDraft(
    tradeOpportunity.id,
    {
      direction: 'TO_BUYER',
      messagePurpose: 'INITIAL_BUYER_OFFER',
      body: 'Indicative stock is available from Supplier One at current terms.',
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
    },
  );
  const supplierDraft = await service.generateTradeMessageDraft(
    tradeOpportunity.id,
    {
      direction: 'TO_SUPPLIER',
      messagePurpose: 'INITIAL_SUPPLIER_ENQUIRY',
      body: 'Buyer Ltd would like confirmation for this line.',
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
    },
  );

  assert.equal(buyerDraft.status, 'DRAFT');
  assert.equal(buyerDraft.containsSupplierIdentity, true);
  assert.match(
    JSON.stringify(buyerDraft.policyViolations),
    /supplier_identity_leak_detected/,
  );
  assert.equal(supplierDraft.status, 'DRAFT');
  assert.equal(supplierDraft.containsBuyerIdentity, true);
  assert.match(
    JSON.stringify(supplierDraft.policyViolations),
    /buyer_identity_leak_detected/,
  );
});

test('forwarded raw header content is flagged in outward drafts', async () => {
  const harness = createRepositoryHarness();
  const service = createService(harness);
  seedOffer(harness);

  const tradeOpportunity = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    targetSellUnitPrice: 10.25,
    targetSellCurrencyCode: 'GBP',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  const draft = await service.generateTradeMessageDraft(tradeOpportunity.id, {
    direction: 'TO_BUYER',
    messagePurpose: 'INITIAL_BUYER_OFFER',
    body: 'From: pricing@supplier.test\nSent: today\nSubject: raw forwarded quote',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(draft.containsForwardedContent, true);
  assert.match(
    JSON.stringify(draft.policyViolations),
    /forwarded_header_content_detected/,
  );
  assert.equal(draft.status, 'DRAFT');
});

test('rejecting a draft records draft feedback for readiness evaluation', async () => {
  const harness = createRepositoryHarness();
  const service = createService(harness);
  seedOffer(harness);

  const tradeOpportunity = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    targetSellUnitPrice: 10.25,
    targetSellCurrencyCode: 'GBP',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  const draft = await service.generateTradeMessageDraft(tradeOpportunity.id, {
    direction: 'TO_BUYER',
    messagePurpose: 'INITIAL_BUYER_OFFER',
    body: 'Supplier One is offering this line.',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  await service.updateTradeMessageDraft(draft.id, {
    action: 'REJECT',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Leakage risk.',
  });

  assert.equal(harness.feedbacks.length, 1);
  assert.equal(harness.feedbacks[0]?.tradeMessageDraftId, draft.id);
  assert.equal(harness.feedbacks[0]?.tradeOpportunityId, tradeOpportunity.id);
  assert.equal(harness.feedbacks[0]?.feedbackType, 'DRAFT');
  assert.equal(harness.feedbacks[0]?.verdict, 'POLICY_ISSUE');
});

test('execution price drift propagates into deal summary and hold state', async () => {
  const harness = createRepositoryHarness();
  const service = createService(harness);
  seedOffer(harness);

  const tradeOpportunity = await service.createTradeOpportunity({
    emailDerivedOfferId: 'offer-1',
    targetSellUnitPrice: 10.25,
    targetSellCurrencyCode: 'GBP',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  harness.buyDecisions.push({
    id: 'buy-1',
    emailDerivedOfferId: 'offer-1',
    supplierId: 'supplier-1',
    productId: 'product-1',
    quotedUnitPrice: { toString: () => '8.40' },
    quotedCurrencyCode: 'GBP',
    quotedMinimumOrderQuantity: 100,
    quotedAvailability: 'available',
    approvalStatus: 'APPROVED',
    orderStatus: 'ORDERED',
    supplierQualificationStatus: 'APPROVED',
    hasQualificationRisk: false,
  });
  harness.buyExecutions.push({
    id: 'execution-1',
    buyDecisionId: 'buy-1',
    supplierId: 'supplier-1',
    productId: 'product-1',
    fulfillmentStatus: 'ORDER_PLACED',
    reconciliationStatus: 'PRICE_DRIFT',
    hasPriceDrift: true,
    hasQuantityDrift: false,
    hasCurrencyMismatch: false,
    hasAvailabilityDrift: false,
  });

  await syncTradeOpportunityCommercialState(harness.repository as never, {
    emailDerivedOfferId: 'offer-1',
    buyDecision: harness.buyDecisions[0] as never,
    buyExecution: harness.buyExecutions[0] as never,
    actor: {
      actorType: 'SYSTEM',
      actorIdentifier: null,
    },
    note: 'Execution recorded with price drift.',
  });

  const refreshed = await service.getTradeOpportunity(tradeOpportunity.id);

  assert.equal(refreshed?.buyDecisionId, 'buy-1');
  assert.equal(refreshed?.buyExecutionId, 'execution-1');
  assert.equal(refreshed?.status, 'ON_HOLD');
  assert.equal(refreshed?.stage, 'BUY_ORDERED');
  assert.equal(refreshed?.summary.hasPriceDrift, true);
  assert.equal(
    refreshed?.summary.recommendedNextStep,
    'investigate price drift',
  );
});
