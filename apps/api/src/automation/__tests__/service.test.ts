import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutomationService } from '../service';

function createRepositoryHarness() {
  const policies: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  const offers: Array<Record<string, any>> = [];
  const workflows: Array<Record<string, any>> = [];
  const buyDecisions: Array<Record<string, any>> = [];
  const drafts: Array<Record<string, any>> = [];
  const feedbacks: Array<Record<string, any>> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const clone = (items: Array<Record<string, any>>) =>
    items.map((item) => ({
      ...item,
      emailDerivedOffer: item.emailDerivedOffer ? { ...item.emailDerivedOffer } : item.emailDerivedOffer,
      tradeMessageDraft: item.tradeMessageDraft ? { ...item.tradeMessageDraft } : item.tradeMessageDraft,
    }));

  const cloneState = () => ({
    policies: clone(policies),
    events: clone(events),
    offers: clone(offers),
    workflows: clone(workflows),
    buyDecisions: clone(buyDecisions),
    drafts: clone(drafts),
    feedbacks: clone(feedbacks),
  });

  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    policies.splice(0, policies.length, ...snapshot.policies);
    events.splice(0, events.length, ...snapshot.events);
    offers.splice(0, offers.length, ...snapshot.offers);
    workflows.splice(0, workflows.length, ...snapshot.workflows);
    buyDecisions.splice(0, buyDecisions.length, ...snapshot.buyDecisions);
    drafts.splice(0, drafts.length, ...snapshot.drafts);
    feedbacks.splice(0, feedbacks.length, ...snapshot.feedbacks);
  };

  return {
    policies,
    events,
    offers,
    workflows,
    buyDecisions,
    drafts,
    feedbacks,
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
      async findPolicyByScopeName(scopeName: string) {
        return (policies.find((item) => item.scopeName === scopeName) ?? null) as never;
      },
      async createPolicy(data: Record<string, unknown>) {
        const created = {
          id: nextId('policy'),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        policies.push(created);
        return created as never;
      },
      async updatePolicy(policyId: string, data: Record<string, unknown>) {
        const existing = policies.find((item) => item.id === policyId);
        if (!existing) {
          throw new Error('Policy not found.');
        }

        Object.assign(existing, data, { updatedAt: new Date() });
        return existing as never;
      },
      async createReadinessEvent(data: Record<string, unknown>) {
        const created = {
          id: nextId('event'),
          createdAt: new Date(),
          ...data,
        };
        events.push(created);
        return created as never;
      },
      async listReadinessEvents(scopeName: string) {
        const policy = policies.find((item) => item.scopeName === scopeName);
        return events.filter((item) => item.automationReadinessPolicyId === policy?.id) as never;
      },
      async listOffersInWindow(windowStart: Date, windowEnd: Date) {
        return offers.filter(
          (item) => item.createdAt >= windowStart && item.createdAt <= windowEnd,
        ) as never;
      },
      async listWorkflowItemsInWindow(windowStart: Date, windowEnd: Date) {
        return workflows.filter(
          (item) => item.createdAt >= windowStart && item.createdAt <= windowEnd,
        ) as never;
      },
      async listBuyDecisionsInWindow(windowStart: Date, windowEnd: Date) {
        return buyDecisions.filter(
          (item) => item.createdAt >= windowStart && item.createdAt <= windowEnd,
        ) as never;
      },
      async listTradeDraftsInWindow(windowStart: Date, windowEnd: Date) {
        return drafts.filter(
          (item) => item.createdAt >= windowStart && item.createdAt <= windowEnd,
        ) as never;
      },
      async listFeedbackInWindow(windowStart: Date, windowEnd: Date) {
        return feedbacks
          .filter((item) => item.createdAt >= windowStart && item.createdAt <= windowEnd)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()) as never;
      },
      async listFeedbackByOfferIds(emailDerivedOfferIds: string[]) {
        return feedbacks
          .filter((item) => item.emailDerivedOfferId && emailDerivedOfferIds.includes(item.emailDerivedOfferId))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()) as never;
      },
      async listFeedbackByTradeOpportunityIds(tradeOpportunityIds: string[]) {
        return feedbacks
          .filter((item) => item.tradeOpportunityId && tradeOpportunityIds.includes(item.tradeOpportunityId))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()) as never;
      },
      async findRecentMatchingFeedback(input: Record<string, any>) {
        return (
          feedbacks.find(
            (item) =>
              item.emailDerivedOfferId === input.emailDerivedOfferId &&
              item.offerWorkflowItemId === input.offerWorkflowItemId &&
              item.tradeOpportunityId === input.tradeOpportunityId &&
              item.tradeMessageDraftId === input.tradeMessageDraftId &&
              item.feedbackType === input.feedbackType &&
              item.verdict === input.verdict &&
              item.actorType === input.actorType &&
              item.actorIdentifier === input.actorIdentifier,
          ) ?? null
        ) as never;
      },
      async createFeedback(data: Record<string, unknown>) {
        const offer =
          typeof data.emailDerivedOfferId === 'string'
            ? offers.find((item) => item.id === data.emailDerivedOfferId) ?? null
            : null;
        const draft =
          typeof data.tradeMessageDraftId === 'string'
            ? drafts.find((item) => item.id === data.tradeMessageDraftId) ?? null
            : null;
        const created = {
          id: nextId('feedback'),
          createdAt: new Date('2026-04-21T10:00:00.000Z'),
          ...data,
          emailDerivedOffer: offer
            ? {
                id: offer.id,
                fieldConfidence: offer.fieldConfidence ?? null,
                entityResolutionConfidence: offer.entityResolutionConfidence ?? null,
              }
            : null,
          tradeMessageDraft: draft
            ? {
                id: draft.id,
                tradeOpportunityId: draft.tradeOpportunityId,
                status: draft.status,
                direction: draft.direction,
                policyViolations: draft.policyViolations,
              }
            : null,
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
    },
  };
}

function seedBaseWindow(harness: ReturnType<typeof createRepositoryHarness>) {
  harness.offers.push(
    {
      id: 'offer-1',
      status: 'REVIEW_REQUIRED',
      aiAssisted: false,
      fieldConfidence: 92,
      entityResolutionConfidence: 90,
      createdAt: new Date('2026-04-20T09:00:00.000Z'),
    },
    {
      id: 'offer-2',
      status: 'REVIEW_REQUIRED',
      aiAssisted: true,
      fieldConfidence: 85,
      entityResolutionConfidence: 82,
      createdAt: new Date('2026-04-20T09:30:00.000Z'),
    },
  );
  harness.workflows.push(
    {
      id: 'workflow-1',
      emailDerivedOfferId: 'offer-1',
      status: 'APPROVED_TO_BUY',
      aiAssisted: false,
      hasUnresolvedSupplier: false,
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
    },
    {
      id: 'workflow-2',
      emailDerivedOfferId: 'offer-2',
      status: 'NEW',
      aiAssisted: true,
      hasUnresolvedSupplier: true,
      createdAt: new Date('2026-04-20T11:00:00.000Z'),
    },
  );
  harness.buyDecisions.push({
    id: 'buy-1',
    emailDerivedOfferId: 'offer-1',
    approvalStatus: 'APPROVED',
    createdAt: new Date('2026-04-20T12:00:00.000Z'),
  });
  harness.drafts.push(
    {
      id: 'draft-1',
      tradeOpportunityId: 'trade-1',
      direction: 'TO_BUYER',
      status: 'APPROVED',
      policyViolations: [],
      createdAt: new Date('2026-04-20T13:00:00.000Z'),
    },
    {
      id: 'draft-2',
      tradeOpportunityId: 'trade-2',
      direction: 'TO_SUPPLIER',
      status: 'REJECTED',
      policyViolations: ['external_contact_details_detected'],
      createdAt: new Date('2026-04-20T14:00:00.000Z'),
    },
  );
}

test('feedback records are created, linked, and deduplicated in a short operator burst', async () => {
  const harness = createRepositoryHarness();
  seedBaseWindow(harness);
  const service = createAutomationService(harness.repository as never, {
    now: () => new Date('2026-04-21T12:00:00.000Z'),
  });

  const first = await service.recordFeedback({
    emailDerivedOfferId: 'offer-1',
    offerWorkflowItemId: 'workflow-1',
    feedbackType: 'EXTRACTION',
    verdict: 'CORRECT',
    productTextCorrect: true,
    priceCorrect: true,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Looks correct.',
  });
  const second = await service.recordFeedback({
    emailDerivedOfferId: 'offer-1',
    offerWorkflowItemId: 'workflow-1',
    feedbackType: 'EXTRACTION',
    verdict: 'CORRECT',
    productTextCorrect: true,
    priceCorrect: true,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Looks correct.',
  });

  assert.equal(first.id, second.id);
  assert.equal(harness.feedbacks.length, 1);
  assert.equal(harness.feedbacks[0]?.emailDerivedOfferId, 'offer-1');
  assert.equal(harness.feedbacks[0]?.offerWorkflowItemId, 'workflow-1');
});

test('extraction and supplier-resolution feedback change evaluation metrics deterministically', async () => {
  const harness = createRepositoryHarness();
  seedBaseWindow(harness);
  const service = createAutomationService(harness.repository as never, {
    now: () => new Date('2026-04-21T12:00:00.000Z'),
  });

  await service.recordFeedback({
    emailDerivedOfferId: 'offer-1',
    feedbackType: 'EXTRACTION',
    verdict: 'CORRECT',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.recordFeedback({
    emailDerivedOfferId: 'offer-2',
    feedbackType: 'EXTRACTION',
    verdict: 'INCORRECT',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.recordFeedback({
    emailDerivedOfferId: 'offer-1',
    feedbackType: 'SUPPLIER_RESOLUTION',
    verdict: 'CORRECT',
    supplierCorrect: true,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.recordFeedback({
    emailDerivedOfferId: 'offer-2',
    feedbackType: 'SUPPLIER_RESOLUTION',
    verdict: 'PARTIALLY_CORRECT',
    supplierCorrect: false,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  const metrics = await service.getEvaluationMetrics();

  assert.equal(metrics.extractionFeedbackCount, 2);
  assert.equal(metrics.extractionPrecisionPct, 0.5);
  assert.equal(metrics.supplierResolutionFeedbackCount, 2);
  assert.equal(metrics.supplierResolutionPrecisionPct, 0.75);
});

test('draft policy issue feedback affects draft-quality metrics correctly', async () => {
  const harness = createRepositoryHarness();
  seedBaseWindow(harness);
  const service = createAutomationService(harness.repository as never, {
    now: () => new Date('2026-04-21T12:00:00.000Z'),
  });

  await service.recordFeedback({
    tradeMessageDraftId: 'draft-1',
    tradeOpportunityId: 'trade-1',
    feedbackType: 'DRAFT',
    verdict: 'SAFE',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.recordFeedback({
    tradeMessageDraftId: 'draft-2',
    tradeOpportunityId: 'trade-2',
    feedbackType: 'DRAFT',
    verdict: 'POLICY_ISSUE',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  const metrics = await service.getEvaluationMetrics();

  assert.equal(metrics.draftFeedbackCount, 2);
  assert.equal(metrics.draftPolicyPassPct, 0.5);
  assert.equal(metrics.dealDraftRejectionRatePct, 0.5);
});

test('readiness gate blocks higher automation when sample size is too low or thresholds are missed', async () => {
  const harness = createRepositoryHarness();
  seedBaseWindow(harness);
  const service = createAutomationService(harness.repository as never, {
    now: () => new Date('2026-04-21T12:00:00.000Z'),
  });

  const overview = await service.getReadinessOverview();

  assert.equal(overview.policy.globalMode, 'INTERNAL_SIGNALS_ONLY');
  assert.equal(overview.decisions.internalSignals.eligible, false);
  assert.match(JSON.stringify(overview.decisions.internalSignals.blockedReasons), /minimum sample size/i);
  assert.equal(overview.decisions.supplierDrafts.eligible, false);
});

test('readiness gate reports eligible for internal signals and drafts when metrics clear thresholds', async () => {
  const harness = createRepositoryHarness();
  seedBaseWindow(harness);
  const service = createAutomationService(harness.repository as never, {
    now: () => new Date('2026-04-21T12:00:00.000Z'),
  });

  for (let index = 0; index < 20; index += 1) {
    const offerId = index % 2 === 0 ? 'offer-1' : 'offer-2';
    await service.recordFeedback({
      emailDerivedOfferId: offerId,
      feedbackType: 'EXTRACTION',
      verdict: 'CORRECT',
      actorType: 'USER',
      actorIdentifier: `buyer-${index}`,
    });
    await service.recordFeedback({
      emailDerivedOfferId: offerId,
      feedbackType: 'SUPPLIER_RESOLUTION',
      verdict: 'CORRECT',
      actorType: 'USER',
      actorIdentifier: `buyer-${index}`,
    });
    await service.recordFeedback({
      emailDerivedOfferId: offerId,
      feedbackType: 'SIGNAL',
      verdict: 'USEFUL',
      actorType: 'USER',
      actorIdentifier: `buyer-${index}`,
    });
  }
  for (let index = 0; index < 20; index += 1) {
    await service.recordFeedback({
      tradeMessageDraftId: index % 2 === 0 ? 'draft-1' : 'draft-2',
      tradeOpportunityId: index % 2 === 0 ? 'trade-1' : 'trade-2',
      feedbackType: 'DRAFT',
      verdict: 'SAFE',
      actorType: 'USER',
      actorIdentifier: `buyer-draft-${index}`,
    });
  }

  const overview = await service.updateReadinessPolicy({
    globalMode: 'DRAFTS_ONLY',
    minimumSampleSize: 20,
    actorType: 'USER',
    actorIdentifier: 'admin-1',
  });

  assert.equal(overview.decisions.internalSignals.eligible, true);
  assert.equal(overview.decisions.supplierDrafts.eligible, true);
  assert.equal(overview.decisions.buyerDrafts.eligible, true);
});

test('actual send remains blocked by policy default in this pass', async () => {
  const harness = createRepositoryHarness();
  seedBaseWindow(harness);
  const service = createAutomationService(harness.repository as never, {
    now: () => new Date('2026-04-21T12:00:00.000Z'),
  });

  const overview = await service.updateReadinessPolicy({
    globalMode: 'ASSISTED_OUTREACH',
    allowActualSend: true,
    actorType: 'USER',
    actorIdentifier: 'admin-1',
  });

  assert.equal(overview.policy.allowActualSend, false);
  assert.equal(overview.decisions.actualSend.eligible, false);
  assert.match(JSON.stringify(overview.decisions.actualSend.blockedReasons), /blocked/i);
  assert.equal(harness.events.some((event) => event.actionType === 'SEND_BLOCKED'), true);
});
