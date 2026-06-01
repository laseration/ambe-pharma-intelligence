import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOfferWorkflowService,
  determineWorkflowPriority,
  type SyncWorkflowItemInput,
} from '../workflowService';

function createRepositoryHarness() {
  const workflowItems: Array<Record<string, any>> = [];
  const workflowEvents: Array<Record<string, any>> = [];
  const buyDecisions: Array<Record<string, any>> = [];
  const buyDecisionEvents: Array<Record<string, any>> = [];
  const buyExecutions: Array<Record<string, any>> = [];
  const buyExecutionEvents: Array<Record<string, any>> = [];
  const tradeOpportunities: Array<Record<string, any>> = [];
  const tradeOpportunityEvents: Array<Record<string, any>> = [];
  const tradeOpportunityPolicies: Array<Record<string, any>> = [];
  const offerCorrectionEvents: Array<Record<string, any>> = [];
  const feedbacks: Array<Record<string, any>> = [];
  const supplierQualifications: Array<Record<string, any>> = [];
  const customers: Array<Record<string, any>> = [];
  const salesRecords: Array<Record<string, any>> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const makeWorkflowRecord = (overrides?: Record<string, unknown>) => ({
    id: nextId('workflow'),
    emailDerivedOfferId: 'offer-1',
    inboundEmailId: 'email-1',
    status: 'NEW',
    priority: 'MEDIUM',
    priorityReason:
      'commercially relevant offer should be reviewed in the normal operator queue.',
    assigneeUserId: null,
    assigneeLabel: null,
    latestNote: null,
    sourceKind: 'STRICT_BODY_MAIN',
    sourceReviewReason: 'promotion_threshold_not_met',
    aiAssisted: false,
    hasUnresolvedSupplier: false,
    hasConflictingSupplierCues: false,
    hasManufacturerAmbiguity: false,
    supplierQualificationStatus: 'APPROVED',
    hasUnknownSupplierQualification: false,
    hasRestrictedSupplier: false,
    hasBlockedSupplier: false,
    qualificationRiskNote: null,
    createdByType: 'SYSTEM',
    createdByIdentifier: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    inboundEmail: {
      id: 'email-1',
      fromEmail: 'pricing@supplier.co',
      fromName: 'Supplier',
      subject: 'Offer',
      receivedAt: new Date('2026-04-20T09:00:00.000Z'),
    },
    buyDecision: null,
    emailDerivedOffer: {
      id: 'offer-1',
      status: 'REVIEW_REQUIRED',
      reviewReason: 'promotion_threshold_not_met',
      sourceKind: 'STRICT_BODY_MAIN',
      sourceBlockText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
      rawProductText: 'Amlodipine 5mg tabs 28',
      normalizedProductNameCandidate: 'amlodipine 5mg tabs 28',
      manufacturerCandidate: null,
      priceCandidate: { toString: () => '8.40' },
      currencyCandidate: 'GBP',
      minimumOrderQuantityCandidate: null,
      availabilityCandidate: 'available',
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
        {
          entityType: 'PRODUCT',
          candidateId: 'product-1',
          candidateName: 'Amlodipine 5mg tabs 28',
          confidence: 85,
          reason: 'exact_normalized_name_match',
          selected: true,
        },
      ],
      offerCorrections: [] as Array<Record<string, any>>,
      buyDecision: null,
      updatedAt: new Date(),
    },
    ...overrides,
  });

  const attachExecution = (decision: Record<string, any> | null) => {
    if (!decision) {
      return null;
    }

    return (
      buyExecutions.find((item) => item.buyDecisionId === decision.id) ?? null
    );
  };

  const cloneState = () => ({
    workflowItems: workflowItems.map((item) => ({
      ...item,
      inboundEmail: item.inboundEmail
        ? { ...item.inboundEmail }
        : item.inboundEmail,
      buyDecision: item.buyDecision
        ? {
            ...item.buyDecision,
            execution: item.buyDecision.execution
              ? { ...item.buyDecision.execution }
              : null,
          }
        : item.buyDecision,
      emailDerivedOffer: item.emailDerivedOffer
        ? {
            ...item.emailDerivedOffer,
            resolutionCandidates:
              item.emailDerivedOffer.resolutionCandidates.map(
                (candidate: Record<string, any>) => ({
                  ...candidate,
                }),
              ),
            buyDecision: item.emailDerivedOffer.buyDecision
              ? {
                  ...item.emailDerivedOffer.buyDecision,
                  execution: item.emailDerivedOffer.buyDecision.execution
                    ? { ...item.emailDerivedOffer.buyDecision.execution }
                    : null,
                }
              : item.emailDerivedOffer.buyDecision,
          }
        : item.emailDerivedOffer,
    })),
    workflowEvents: workflowEvents.map((item) => ({ ...item })),
    buyDecisions: buyDecisions.map((item) => ({ ...item })),
    buyDecisionEvents: buyDecisionEvents.map((item) => ({ ...item })),
    buyExecutions: buyExecutions.map((item) => ({ ...item })),
    buyExecutionEvents: buyExecutionEvents.map((item) => ({ ...item })),
    tradeOpportunities: tradeOpportunities.map((item) => ({ ...item })),
    tradeOpportunityEvents: tradeOpportunityEvents.map((item) => ({ ...item })),
    tradeOpportunityPolicies: tradeOpportunityPolicies.map((item) => ({
      ...item,
    })),
    offerCorrectionEvents: offerCorrectionEvents.map((item) => ({ ...item })),
    feedbacks: feedbacks.map((item) => ({ ...item })),
    customers: customers.map((item) => ({ ...item })),
    salesRecords: salesRecords.map((item) => ({ ...item })),
  });

  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    workflowItems.splice(0, workflowItems.length, ...snapshot.workflowItems);
    workflowEvents.splice(0, workflowEvents.length, ...snapshot.workflowEvents);
    buyDecisions.splice(0, buyDecisions.length, ...snapshot.buyDecisions);
    buyDecisionEvents.splice(
      0,
      buyDecisionEvents.length,
      ...snapshot.buyDecisionEvents,
    );
    buyExecutions.splice(0, buyExecutions.length, ...snapshot.buyExecutions);
    buyExecutionEvents.splice(
      0,
      buyExecutionEvents.length,
      ...snapshot.buyExecutionEvents,
    );
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
    tradeOpportunityPolicies.splice(
      0,
      tradeOpportunityPolicies.length,
      ...snapshot.tradeOpportunityPolicies,
    );
    offerCorrectionEvents.splice(
      0,
      offerCorrectionEvents.length,
      ...snapshot.offerCorrectionEvents,
    );
    feedbacks.splice(0, feedbacks.length, ...snapshot.feedbacks);
    customers.splice(0, customers.length, ...snapshot.customers);
    salesRecords.splice(0, salesRecords.length, ...snapshot.salesRecords);
  };

  return {
    workflowItems,
    workflowEvents,
    buyDecisions,
    buyDecisionEvents,
    buyExecutions,
    buyExecutionEvents,
    tradeOpportunities,
    tradeOpportunityEvents,
    tradeOpportunityPolicies,
    offerCorrectionEvents,
    feedbacks,
    supplierQualifications,
    customers,
    salesRecords,
    makeWorkflowRecord,
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
      async findWorkflowItemByOfferId(emailDerivedOfferId: string) {
        return (workflowItems.find(
          (item) => item.emailDerivedOfferId === emailDerivedOfferId,
        ) ?? null) as never;
      },
      async findWorkflowItemById(workflowItemId: string) {
        return (workflowItems.find((item) => item.id === workflowItemId) ??
          null) as never;
      },
      async findWorkflowDetailById(workflowItemId: string) {
        return (workflowItems.find((item) => item.id === workflowItemId) ??
          null) as never;
      },
      async createWorkflowItem(data: Record<string, any>) {
        const created = makeWorkflowRecord({
          ...data,
          id: nextId('workflow'),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        workflowItems.push(created);
        return created as never;
      },
      async updateWorkflowItem(
        workflowItemId: string,
        data: Record<string, any>,
      ) {
        const existing = workflowItems.find(
          (item) => item.id === workflowItemId,
        );
        if (!existing) {
          throw new Error('Offer workflow item not found.');
        }

        Object.assign(existing, data, { updatedAt: new Date() });
        if (existing.emailDerivedOffer) {
          const decision =
            buyDecisions.find(
              (item) =>
                item.emailDerivedOfferId === existing.emailDerivedOfferId,
            ) ?? null;
          existing.emailDerivedOffer.buyDecision = decision
            ? { ...decision, execution: attachExecution(decision) }
            : null;
        }
        const decision =
          buyDecisions.find(
            (item) => item.offerWorkflowItemId === existing.id,
          ) ?? null;
        existing.buyDecision = decision
          ? { ...decision, execution: attachExecution(decision) }
          : null;
        return existing as never;
      },
      async createWorkflowEvent(data: Record<string, any>) {
        const created = {
          ...data,
          id: nextId('workflow-event'),
          createdAt: new Date(),
        };
        workflowEvents.push(created);
        return created as never;
      },
      async listWorkflowItems(filters: Record<string, any>) {
        return workflowItems
          .filter((item) => {
            if (filters.status && item.status !== filters.status) {
              return false;
            }
            if (
              filters.onlyOpen === true &&
              ['REJECTED', 'CLOSED'].includes(item.status)
            ) {
              return false;
            }
            if (
              filters.blockedSupplier === true &&
              item.hasBlockedSupplier !== true
            ) {
              return false;
            }
            if (
              filters.restrictedSupplier === true &&
              item.hasRestrictedSupplier !== true
            ) {
              return false;
            }
            if (
              filters.unknownQualification === true &&
              item.hasUnknownSupplierQualification !== true
            ) {
              return false;
            }
            if (
              typeof filters.hasBuyDecision === 'boolean' &&
              Boolean(item.buyDecision) !== filters.hasBuyDecision
            ) {
              return false;
            }
            return true;
          })
          .sort((left, right) =>
            filters.staleFirst === true
              ? left.createdAt.getTime() - right.createdAt.getTime()
              : right.updatedAt.getTime() - left.updatedAt.getTime(),
          ) as never;
      },
      async listWorkflowEvents(workflowItemId: string) {
        return workflowEvents.filter(
          (item) => item.workflowItemId === workflowItemId,
        ) as never;
      },
      async listBuyDecisionEvents(buyDecisionId: string) {
        return buyDecisionEvents.filter(
          (item) => item.buyDecisionId === buyDecisionId,
        ) as never;
      },
      async listBuyExecutionEvents(buyExecutionId: string) {
        return buyExecutionEvents.filter(
          (item) => item.buyExecutionId === buyExecutionId,
        ) as never;
      },
      async listOfferCorrectionEventsForWorkflow(workflowItemId: string) {
        const correctionIds = workflowItems
          .filter((item) => item.id === workflowItemId)
          .flatMap((item) => item.emailDerivedOffer?.offerCorrections ?? [])
          .map((correction) => correction.id);

        return offerCorrectionEvents.filter((event) =>
          correctionIds.includes(event.offerCorrectionId),
        ) as never;
      },
      async listTradeOpportunityEventsForWorkflow(input: {
        workflowItemId: string;
        emailDerivedOfferId: string;
        buyDecisionId?: string | null;
        buyExecutionId?: string | null;
      }) {
        const matchingTradeIds = tradeOpportunities
          .filter(
            (item) =>
              item.offerWorkflowItemId === input.workflowItemId ||
              item.emailDerivedOfferId === input.emailDerivedOfferId ||
              (input.buyDecisionId &&
                item.buyDecisionId === input.buyDecisionId) ||
              (input.buyExecutionId &&
                item.buyExecutionId === input.buyExecutionId),
          )
          .map((item) => item.id);

        return tradeOpportunityEvents.filter((event) =>
          matchingTradeIds.includes(event.tradeOpportunityId),
        ) as never;
      },
      async findSupplierQualificationBySupplierId(supplierId: string) {
        return (supplierQualifications.find(
          (item) => item.supplierId === supplierId,
        ) ?? null) as never;
      },
      async findBuyDecisionByOfferId(emailDerivedOfferId: string) {
        return (buyDecisions.find(
          (item) => item.emailDerivedOfferId === emailDerivedOfferId,
        ) ?? null) as never;
      },
      async createBuyDecision(data: Record<string, any>) {
        const created = {
          id: nextId('buy-decision'),
          emailDerivedOfferId: data.emailDerivedOfferId,
          offerWorkflowItemId: data.offerWorkflowItemId ?? null,
          supplierId: data.supplierId ?? null,
          productId: data.productId ?? null,
          rawProductText: data.rawProductText ?? null,
          normalizedProductNameCandidate:
            data.normalizedProductNameCandidate ?? null,
          manufacturerCandidate: data.manufacturerCandidate ?? null,
          quotedUnitPrice: data.quotedUnitPrice ?? null,
          quotedCurrencyCode: data.quotedCurrencyCode ?? null,
          quotedMinimumOrderQuantity: data.quotedMinimumOrderQuantity ?? null,
          quotedAvailability: data.quotedAvailability ?? null,
          approvalStatus: data.approvalStatus,
          orderStatus: data.orderStatus,
          approvalNote: data.approvalNote ?? null,
          approvedAt: data.approvedAt ?? null,
          externalOrderReference: null,
          orderedAt: null,
          supplierQualificationStatus: data.supplierQualificationStatus,
          hasQualificationRisk: data.hasQualificationRisk,
          qualificationRiskNote: data.qualificationRiskNote ?? null,
          metadata: data.metadata ?? null,
          execution: null,
        };
        buyDecisions.push(created);
        const workflow = workflowItems.find(
          (item) => item.id === created.offerWorkflowItemId,
        );
        if (workflow) {
          workflow.buyDecision = created;
          if (workflow.emailDerivedOffer) {
            workflow.emailDerivedOffer.buyDecision = created;
          }
        }
        return created as never;
      },
      async updateBuyDecision(
        buyDecisionId: string,
        data: Record<string, any>,
      ) {
        const existingIndex = buyDecisions.findIndex(
          (item) => item.id === buyDecisionId,
        );
        const existing =
          existingIndex >= 0 ? buyDecisions[existingIndex] : null;
        if (!existing) {
          throw new Error('Buy decision not found.');
        }
        const updated = { ...existing, ...data };
        updated.execution = attachExecution(updated);
        buyDecisions[existingIndex] = updated;
        const workflow = workflowItems.find(
          (item) => item.id === updated.offerWorkflowItemId,
        );
        if (workflow) {
          workflow.buyDecision = updated;
          if (workflow.emailDerivedOffer) {
            workflow.emailDerivedOffer.buyDecision = updated;
          }
        }
        return updated as never;
      },
      async createBuyDecisionEvent(data: Record<string, any>) {
        buyDecisionEvents.push({
          ...data,
          id: nextId('buy-decision-event'),
          createdAt: new Date(),
        });
      },
      async findBuyExecutionByDecisionId(buyDecisionId: string) {
        return (buyExecutions.find(
          (item) => item.buyDecisionId === buyDecisionId,
        ) ?? null) as never;
      },
      async createBuyExecution(data: Record<string, any>) {
        const created: Record<string, any> = {
          id: nextId('buy-execution'),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        buyExecutions.push(created);
        const decision = buyDecisions.find(
          (item) => item.id === created.buyDecisionId,
        );
        if (decision) {
          decision.execution = created;
        }
        workflowItems.forEach((item) => {
          if (item.buyDecision?.id === created.buyDecisionId) {
            item.buyDecision.execution = created;
          }
          if (
            item.emailDerivedOffer?.buyDecision?.id === created.buyDecisionId
          ) {
            item.emailDerivedOffer.buyDecision.execution = created;
          }
        });
        return created as never;
      },
      async updateBuyExecution(
        buyExecutionId: string,
        data: Record<string, any>,
      ) {
        const index = buyExecutions.findIndex(
          (item) => item.id === buyExecutionId,
        );
        const existing = index >= 0 ? buyExecutions[index] : null;
        if (!existing) {
          throw new Error('Buy execution not found.');
        }
        const updated: Record<string, any> = {
          ...existing,
          ...data,
          updatedAt: new Date(),
        };
        buyExecutions[index] = updated;
        const decision = buyDecisions.find(
          (item) => item.id === updated.buyDecisionId,
        );
        if (decision) {
          decision.execution = updated;
        }
        workflowItems.forEach((item) => {
          if (item.buyDecision?.id === updated.buyDecisionId) {
            item.buyDecision.execution = updated;
          }
          if (
            item.emailDerivedOffer?.buyDecision?.id === updated.buyDecisionId
          ) {
            item.emailDerivedOffer.buyDecision.execution = updated;
          }
        });
        return updated as never;
      },
      async createBuyExecutionEvent(data: Record<string, any>) {
        const created = {
          ...data,
          id: nextId('buy-execution-event'),
          createdAt: new Date(),
        };
        buyExecutionEvents.push(created);
        return created as never;
      },
      async findRecentMatchingFeedback(input: Record<string, any>) {
        return (feedbacks.find(
          (item) =>
            item.createdAt >= input.createdAfter &&
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
      async createFeedback(data: Record<string, any>) {
        const created = {
          id: nextId('feedback'),
          createdAt: new Date(),
          ...data,
        };
        feedbacks.push(created);
        return created as never;
      },
      async listActiveTradeOpportunitiesByOfferId(emailDerivedOfferId: string) {
        return tradeOpportunities.filter(
          (item) =>
            item.emailDerivedOfferId === emailDerivedOfferId &&
            ['OPEN', 'ON_HOLD'].includes(item.status),
        ) as never;
      },
      async createTradeOpportunity(data: Record<string, any>) {
        const created = {
          id: nextId('trade'),
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
          ...data,
        };
        tradeOpportunities.push(created);
        return created as never;
      },
      async createTradeOpportunityPolicy(data: Record<string, any>) {
        const created = {
          id: nextId('trade-policy'),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        tradeOpportunityPolicies.push(created);
        return created as never;
      },
      async updateTradeOpportunity(
        tradeOpportunityId: string,
        data: Record<string, any>,
      ) {
        const existing = tradeOpportunities.find(
          (item) => item.id === tradeOpportunityId,
        );
        if (!existing) {
          throw new Error('Trade opportunity not found.');
        }

        Object.assign(existing, data, { updatedAt: new Date() });
        return existing as never;
      },
      async createTradeOpportunityEvent(data: Record<string, any>) {
        const created = {
          ...data,
          id: nextId('trade-opportunity-event'),
          createdAt: new Date(),
        };
        tradeOpportunityEvents.push(created);
        return created as never;
      },
      async listRecentSalesByProductId(input: {
        productId: string;
        windowStart: Date;
        currencyCode: string;
      }) {
        return salesRecords
          .filter(
            (item) =>
              item.productId === input.productId &&
              item.currencyCode === input.currencyCode &&
              item.saleDate >= input.windowStart,
          )
          .sort(
            (left, right) => right.saleDate.getTime() - left.saleDate.getTime(),
          )
          .map((item) => ({
            customerId: item.customerId,
            customerName:
              customers.find((customer) => customer.id === item.customerId)
                ?.name ?? 'Customer',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalRevenue: item.totalRevenue,
            saleDate: item.saleDate,
            currencyCode: item.currencyCode,
          })) as never;
      },
    },
  };
}

test('workflow detail derives supplier contact from forwarded external email details', async () => {
  const harness = createRepositoryHarness();
  harness.workflowItems.push(
    harness.makeWorkflowRecord({
      id: 'workflow-contact-1',
      hasUnresolvedSupplier: true,
      sourceReviewReason: 'unresolved_supplier',
      inboundEmail: {
        id: 'email-contact-1',
        fromEmail: 'sandeep@ambemedical.com',
        fromName: 'Sandeep Patel',
        subject: 'Fw: NOVO NORDISK - NOVOFINE NEEDLES',
        receivedAt: new Date('2026-04-23T22:30:18.000Z'),
        rawHtml: null,
        rawText: 'Forwarded supplier email',
        triageStatus: 'AUTO_PROCESSED',
        processingStatus: 'REVIEW_REQUIRED',
        reviewReason: 'unresolved_supplier',
        documents: [
          {
            id: 'doc-main',
            kind: 'BODY_MAIN',
            documentIndex: 1,
            label: 'body-main',
            textContent:
              'Ambe Medical Group\nPlease review this supplier email.',
            metadata: null,
          },
          {
            id: 'doc-forwarded',
            kind: 'BODY_FORWARDED',
            documentIndex: 2,
            label: 'body-forwarded',
            textContent: [
              'From: carl.junius@delta-pharma.eu <carl.junius@delta-pharma.eu>',
              'Subject: NOVO NORDISK - NOVOFINE NEEDLES',
              '',
              'Kind regards,',
              'Carl Junius',
              'Delta BE bv',
              'm: +32 11 49 57 77',
            ].join('\n'),
            metadata: null,
          },
        ],
      },
      emailDerivedOffer: {
        id: 'offer-contact-1',
        status: 'REVIEW_REQUIRED',
        reviewReason: 'unresolved_supplier',
        sourceKind: 'STRICT_BODY_MAIN',
        sourceBlockText: 'NOVOFINE NEEDLES INJ TŰ 31G 6MM 100X',
        rawProductText: 'NOVOFINE NEEDLES INJ TŰ 31G 6MM 100X',
        normalizedProductNameCandidate: 'novofine needles',
        manufacturerCandidate: null,
        priceCandidate: { toString: () => '7' },
        currencyCandidate: 'EUR',
        minimumOrderQuantityCandidate: null,
        availabilityCandidate: null,
        metadata: {
          sender: 'sandeep@ambemedical.com',
          subject: 'Fw: NOVO NORDISK - NOVOFINE NEEDLES',
        },
        resolutionCandidates: [
          {
            entityType: 'SUPPLIER',
            candidateId: null,
            candidateName: 'Delta Pharma',
            confidence: 72,
            reason: 'forwarded_sender_domain',
            selected: false,
          },
          {
            entityType: 'SUPPLIER',
            candidateId: null,
            candidateName: 'Delta BE bv',
            confidence: 70,
            reason: 'body_company_cue',
            selected: false,
          },
        ],
        buyDecision: null,
        updatedAt: new Date(),
      },
    }),
  );

  const service = createOfferWorkflowService(harness.repository as never);
  const detail = await service.getWorkflowItem('workflow-contact-1');

  assert.equal(
    detail?.supplierContact?.companyName,
    'Delta Pharma / Delta BE bv',
  );
  assert.equal(detail?.supplierContact?.contactName, 'Carl Junius');
  assert.equal(detail?.supplierContact?.email, 'carl.junius@delta-pharma.eu');
  assert.equal(detail?.supplierContact?.phone, '+32 11 49 57 77');
  assert.equal(detail?.supplierContact?.source, 'Forwarded email');
});

function createSyncInput(
  overrides?: Partial<SyncWorkflowItemInput>,
): SyncWorkflowItemInput {
  return {
    emailDerivedOfferId: 'offer-1',
    inboundEmailId: 'email-1',
    offerStatus: 'REVIEW_REQUIRED',
    sourceKind: 'STRICT_BODY_MAIN',
    reviewReason: 'promotion_threshold_not_met',
    aiAssisted: false,
    sourceTrustScore: 72,
    promotionConfidence: 74,
    pricePresent: true,
    supplierCandidate: 'Supplier One',
    manufacturerCandidate: null,
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
    supplierQualificationStatus: 'APPROVED',
    ...overrides,
  };
}

test('review-required offer creates one workflow item and does not duplicate on sync', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);

  const first = await service.syncWorkflowItemForOfferReview(createSyncInput());
  const second =
    await service.syncWorkflowItemForOfferReview(createSyncInput());

  assert.equal(harness.workflowItems.length, 1);
  assert.equal(first?.id, second?.id);
  assert.equal(harness.workflowEvents.length, 1);
  assert.equal(harness.workflowEvents[0]?.actionType, 'CREATED');
});

test('approving a workflow item creates exactly one buy decision and reapproval does not duplicate it', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());
  harness.tradeOpportunities.push({
    id: 'trade-1',
    emailDerivedOfferId: 'offer-1',
    status: 'OPEN',
    stage: 'REVIEW',
    sourceType: 'WORKFLOW_ITEM',
    supplierId: 'supplier-1',
    productId: 'product-1',
    sourceSupplierNameSnapshot: 'Supplier One',
    supplierQualificationStatusSnapshot: 'APPROVED',
    quotedBuyUnitPrice: { toString: () => '8.40' },
    quotedBuyCurrencyCode: 'GBP',
    quotedBuyMinimumOrderQuantity: null,
    quotedAvailability: 'available',
    targetSellUnitPrice: { toString: () => '10.10' },
    minimumMarginAmount: null,
    minimumMarginPct: null,
    estimatedMarginAmount: 1.7,
    estimatedMarginPct: 0.1683,
    buyDecisionId: null,
    buyExecutionId: null,
    riskFlags: ['no_buy_approval', 'no_execution'],
    hasMessagingPolicyViolations: false,
    messagingPolicyViolationCount: 0,
    hasQualificationBlock: false,
    isMarginFloorMet: true,
    isActionable: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Approved for purchase.',
  });
  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Approved for purchase.',
  });

  assert.equal(harness.workflowItems[0]?.status, 'APPROVED_TO_BUY');
  assert.equal(harness.buyDecisions.length, 1);
  assert.equal(harness.buyDecisions[0]?.approvalStatus, 'APPROVED');
  assert.equal(
    harness.workflowEvents.find(
      (event) => event.actionType === 'APPROVED_TO_BUY',
    )?.metadata?.sideEffectOperation,
    'REVIEW_QUEUE_APPROVE_TO_BUY',
  );
  assert.equal(
    harness.workflowEvents.find(
      (event) => event.actionType === 'APPROVED_TO_BUY',
    )?.metadata?.commercialAudit?.entityType,
    'OFFER_WORKFLOW_ITEM',
  );
  assert.equal(
    harness.workflowEvents.find(
      (event) => event.actionType === 'APPROVED_TO_BUY',
    )?.metadata?.commercialAudit?.source?.inboundEmailId,
    'email-1',
  );
  assert.equal(
    harness.buyDecisionEvents.find((event) => event.actionType === 'CREATED')
      ?.metadata?.sideEffectPolicy?.mayCreateOrUpdateBuyDecisions,
    true,
  );
  assert.equal(
    harness.buyDecisionEvents.find((event) => event.actionType === 'CREATED')
      ?.metadata?.commercialAudit?.approvalStatus?.next,
    'APPROVED',
  );
  assert.equal(
    harness.tradeOpportunities[0]?.buyDecisionId,
    harness.buyDecisions[0]?.id,
  );
  assert.equal(harness.tradeOpportunities[0]?.stage, 'BUY_APPROVED');
  assert.equal(
    harness.buyDecisionEvents.filter((event) => event.actionType === 'CREATED')
      .length,
    1,
  );
});

test('approved offer with recent profitable sales creates one review-first trade opportunity', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());
  harness.customers.push(
    { id: 'customer-1', name: 'Buyer One' },
    { id: 'customer-2', name: 'Buyer Two' },
  );
  harness.salesRecords.push(
    {
      id: 'sale-1',
      customerId: 'customer-1',
      productId: 'product-1',
      quantity: 12,
      unitPrice: { toString: () => '11.20' },
      totalRevenue: { toString: () => '134.40' },
      currencyCode: 'GBP',
      saleDate: new Date('2026-04-18T10:00:00.000Z'),
    },
    {
      id: 'sale-2',
      customerId: 'customer-2',
      productId: 'product-1',
      quantity: 6,
      unitPrice: { toString: () => '10.80' },
      totalRevenue: { toString: () => '64.80' },
      currencyCode: 'GBP',
      saleDate: new Date('2026-04-10T10:00:00.000Z'),
    },
  );

  const approvalResult = await service.approveToBuyWithOutcome({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(approvalResult.outcome.buyDecisionCreated, true);
  assert.equal(approvalResult.outcome.tradeOpportunityOutcome, 'CREATED');
  assert.equal(
    approvalResult.outcome.tradeOpportunityId,
    harness.tradeOpportunities[0]?.id,
  );
  assert.equal(harness.tradeOpportunities.length, 1);
  assert.equal(harness.tradeOpportunities[0]?.sourceType, 'BUY_DECISION');
  assert.equal(harness.tradeOpportunities[0]?.status, 'OPEN');
  assert.equal(harness.tradeOpportunities[0]?.stage, 'REVIEW');
  assert.equal(
    harness.tradeOpportunities[0]?.buyDecisionId,
    harness.buyDecisions[0]?.id,
  );
  assert.equal(harness.tradeOpportunities[0]?.productId, 'product-1');
  assert.equal(harness.tradeOpportunities[0]?.targetSellCurrencyCode, 'GBP');
  assert.equal(
    harness.tradeOpportunities[0]?.metadata?.createdFrom,
    'approved_buy_decision_demand_match',
  );
  assert.equal(harness.tradeOpportunities[0]?.metadata?.recentUnitsSold, 18);
  assert.equal(
    harness.tradeOpportunities[0]?.metadata?.likelyBuyers?.length,
    2,
  );
  assert.equal(harness.tradeOpportunityPolicies.length, 1);
  assert.equal(
    harness.tradeOpportunityEvents.filter(
      (event) => event.actionType === 'CREATED',
    ).length,
    1,
  );
  assert.equal(
    harness.tradeOpportunityEvents.some((event) =>
      ['SUPPLIER_OUTREACH_DRAFTED', 'BUYER_OUTREACH_DRAFTED'].includes(
        event.actionType,
      ),
    ),
    false,
  );
});

test('approval uses the latest applied offer correction for buy decision values', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  const workflow = harness.makeWorkflowRecord();
  workflow.emailDerivedOffer.offerCorrections = [
    {
      id: 'correction-1',
      correctionStatus: 'APPLIED',
      correctedSupplierId: null,
      correctedSupplierName: 'Corrected Supplier',
      correctedProductId: null,
      correctedRawProductText: 'Corrected Amlodipine 5mg tablets 28',
      correctedNormalizedProductName: 'corrected amlodipine 5mg tablets 28',
      correctedStrength: null,
      correctedDosageForm: null,
      correctedPackSize: null,
      correctedManufacturer: 'Corrected Manufacturer',
      correctedUnitPrice: 7.95,
      correctedCurrencyCode: 'GBP',
      correctedMinimumOrderQuantity: 50,
      correctedAvailability: 'Available now',
      actorType: 'OPERATOR',
      actorIdentifier: 'buyer-1',
      note: 'Corrected before approval.',
      createdAt: new Date('2026-04-21T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    },
  ];
  harness.workflowItems.push(workflow);

  await service.approveToBuy({
    workflowItemId: workflow.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    allowQualificationRisk: true,
  });

  assert.equal(
    harness.buyDecisions[0]?.rawProductText,
    'Corrected Amlodipine 5mg tablets 28',
  );
  assert.equal(
    harness.buyDecisions[0]?.manufacturerCandidate,
    'Corrected Manufacturer',
  );
  assert.equal(
    harness.buyDecisions[0]?.quotedUnitPrice,
    7.95,
  );
  assert.equal(harness.buyDecisions[0]?.quotedMinimumOrderQuantity, 50);
  assert.equal(harness.buyDecisions[0]?.quotedAvailability, 'Available now');
  assert.equal(
    harness.buyDecisions[0]?.metadata?.appliedOfferCorrectionId,
    'correction-1',
  );
  assert.equal(
    harness.buyDecisions[0]?.metadata?.originalExtractedValues.rawProductText,
    'Amlodipine 5mg tabs 28',
  );
});

test('approved offer with no recent sales creates no trade opportunity', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());

  const approvalResult = await service.approveToBuyWithOutcome({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(approvalResult.outcome.buyDecisionCreated, true);
  assert.equal(
    approvalResult.outcome.tradeOpportunityOutcome,
    'SKIPPED_NO_RECENT_DEMAND',
  );
  assert.equal(approvalResult.outcome.tradeOpportunityId, null);
  assert.equal(harness.tradeOpportunities.length, 0);
  assert.equal(harness.tradeOpportunityPolicies.length, 0);
});

test('approved offer with non-profitable recent sales creates no trade opportunity', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());
  harness.customers.push({ id: 'customer-1', name: 'Buyer One' });
  harness.salesRecords.push({
    id: 'sale-1',
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 10,
    unitPrice: { toString: () => '8.00' },
    totalRevenue: { toString: () => '80.00' },
    currencyCode: 'GBP',
    saleDate: new Date('2026-04-18T10:00:00.000Z'),
  });

  const approvalResult = await service.approveToBuyWithOutcome({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(
    approvalResult.outcome.tradeOpportunityOutcome,
    'SKIPPED_NON_POSITIVE_MARGIN',
  );
  assert.equal(approvalResult.outcome.tradeOpportunityId, null);
  assert.equal(harness.tradeOpportunities.length, 0);
});

test('re-approving the same profitable offer does not create duplicate trade opportunities', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());
  harness.customers.push({ id: 'customer-1', name: 'Buyer One' });
  harness.salesRecords.push({
    id: 'sale-1',
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 10,
    unitPrice: { toString: () => '10.90' },
    totalRevenue: { toString: () => '109.00' },
    currencyCode: 'GBP',
    saleDate: new Date('2026-04-18T10:00:00.000Z'),
  });

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  assert.equal(harness.tradeOpportunities.length, 1);
  assert.equal(harness.tradeOpportunityPolicies.length, 1);
  assert.equal(
    harness.tradeOpportunityEvents.filter(
      (event) => event.actionType === 'CREATED',
    ).length,
    1,
  );
});

test('workflow approval can record linked operator feedback in the same transaction', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    feedback: {
      feedbackType: 'EXTRACTION',
      verdict: 'CORRECT',
      productTextCorrect: true,
      priceCorrect: true,
      note: 'Looks accurate.',
    },
  });

  assert.equal(harness.feedbacks.length, 1);
  assert.equal(
    harness.feedbacks[0]?.offerWorkflowItemId,
    harness.workflowItems[0]?.id,
  );
  assert.equal(harness.feedbacks[0]?.emailDerivedOfferId, 'offer-1');
  assert.equal(harness.feedbacks[0]?.feedbackType, 'EXTRACTION');
});

test('marking ordered updates the linked buy decision and does not duplicate order events', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());
  harness.tradeOpportunities.push({
    id: 'trade-1',
    emailDerivedOfferId: 'offer-1',
    status: 'OPEN',
    stage: 'REVIEW',
    sourceType: 'WORKFLOW_ITEM',
    supplierId: 'supplier-1',
    productId: 'product-1',
    sourceSupplierNameSnapshot: 'Supplier One',
    supplierQualificationStatusSnapshot: 'APPROVED',
    quotedBuyUnitPrice: { toString: () => '8.40' },
    quotedBuyCurrencyCode: 'GBP',
    quotedBuyMinimumOrderQuantity: null,
    quotedAvailability: 'available',
    targetSellUnitPrice: { toString: () => '10.10' },
    minimumMarginAmount: null,
    minimumMarginPct: null,
    estimatedMarginAmount: 1.7,
    estimatedMarginPct: 0.1683,
    buyDecisionId: null,
    buyExecutionId: null,
    riskFlags: ['no_buy_approval', 'no_execution'],
    hasMessagingPolicyViolations: false,
    messagingPolicyViolationCount: 0,
    hasQualificationBlock: false,
    isMarginFloorMet: true,
    isActionable: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.markOrdered({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    externalOrderReference: 'PO-001',
  });
  await service.markOrdered({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    externalOrderReference: 'PO-001',
  });

  assert.equal(harness.workflowItems[0]?.status, 'ORDERED');
  assert.equal(harness.buyDecisions[0]?.orderStatus, 'ORDERED');
  assert.equal(harness.buyDecisions[0]?.externalOrderReference, 'PO-001');
  assert.equal(
    harness.workflowEvents.find(
      (event) => event.actionType === 'MARKED_ORDERED',
    )?.metadata?.sideEffectOperation,
    'REVIEW_QUEUE_MARK_ORDERED',
  );
  assert.equal(
    harness.buyDecisionEvents.find(
      (event) => event.actionType === 'MARKED_ORDERED',
    )?.metadata?.sideEffectPolicy?.mayMarkOrderPlaced,
    true,
  );
  assert.equal(harness.buyExecutions.length, 1);
  assert.equal(harness.buyExecutions[0]?.externalOrderReference, 'PO-001');
  assert.equal(harness.buyExecutions[0]?.fulfillmentStatus, 'ORDER_PLACED');
  assert.equal(
    harness.tradeOpportunities[0]?.buyExecutionId,
    harness.buyExecutions[0]?.id,
  );
  assert.equal(harness.tradeOpportunities[0]?.stage, 'BUY_ORDERED');
  assert.equal(
    harness.buyDecisionEvents.filter(
      (event) => event.actionType === 'MARKED_ORDERED',
    ).length,
    1,
  );
  assert.equal(
    harness.buyExecutionEvents.filter(
      (event) => event.actionType === 'ORDER_PLACED',
    ).length,
    1,
  );
  assert.equal(
    harness.buyExecutionEvents.find(
      (event) => event.actionType === 'ORDER_PLACED',
    )?.metadata?.commercialAudit?.entityType,
    'BUY_EXECUTION',
  );
});

test('workflow audit history combines workflow buy decision and execution events chronologically', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(harness.makeWorkflowRecord());

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });
  await service.markOrdered({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    externalOrderReference: 'PO-001',
  });
  const correctionId = 'correction-audit-1';
  harness.workflowItems[0]!.emailDerivedOffer.offerCorrections.push({
    id: correctionId,
    correctionStatus: 'APPLIED',
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
  });
  harness.offerCorrectionEvents.push({
    id: 'correction-event-audit-1',
    offerCorrectionId: correctionId,
    actionType: 'APPLIED',
    previousStatus: null,
    newStatus: 'APPLIED',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Corrected supplier and price.',
    metadata: null,
    createdAt: new Date('2026-05-01T10:01:00.000Z'),
  });
  const tradeOpportunityId = 'trade-audit-1';
  harness.tradeOpportunities.push({
    id: tradeOpportunityId,
    emailDerivedOfferId: harness.workflowItems[0]!.emailDerivedOfferId,
    offerWorkflowItemId: harness.workflowItems[0]!.id,
    buyDecisionId: harness.buyDecisions[0]!.id,
    buyExecutionId: harness.buyExecutions[0]!.id,
    status: 'OPEN',
    stage: 'BUY_ORDERED',
  });
  harness.tradeOpportunityEvents.push({
    id: 'trade-event-audit-1',
    tradeOpportunityId,
    actionType: 'STAGE_CHANGED',
    previousStatus: 'OPEN',
    newStatus: 'OPEN',
    previousStage: 'BUY_APPROVED',
    newStage: 'BUY_ORDERED',
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    note: 'Order moved the deal forward.',
    metadata: null,
    createdAt: new Date('2026-05-01T10:02:00.000Z'),
  });

  const history = await service.getWorkflowAuditHistory(
    harness.workflowItems[0]!.id,
  );

  assert.ok(history);
  assert.equal(
    history.some((event) => event.entityType === 'OFFER_WORKFLOW_ITEM'),
    true,
  );
  assert.equal(
    history.some((event) => event.entityType === 'BUY_DECISION'),
    true,
  );
  assert.equal(
    history.some((event) => event.entityType === 'BUY_EXECUTION'),
    true,
  );
  assert.equal(
    history.some((event) => event.entityType === 'OFFER_CORRECTION'),
    true,
  );
  assert.equal(
    history.some((event) => event.entityType === 'TRADE_OPPORTUNITY'),
    true,
  );
  assert.deepEqual(
    history.map((event) => event.createdAt.getTime()),
    history.map((event) => event.createdAt.getTime()).sort((a, b) => a - b),
  );
});

test('mark ordered rolls back workflow and decision changes when execution write fails', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService({
    ...(harness.repository as any),
    async createBuyExecution() {
      throw new Error('execution failure');
    },
  });
  harness.workflowItems.push(harness.makeWorkflowRecord());

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
  });

  await assert.rejects(
    service.markOrdered({
      workflowItemId: harness.workflowItems[0]!.id,
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
      externalOrderReference: 'PO-001',
    }),
    /execution failure/i,
  );

  assert.equal(harness.workflowItems[0]?.status, 'APPROVED_TO_BUY');
  assert.equal(harness.buyDecisions[0]?.orderStatus, 'NOT_ORDERED');
  assert.equal(harness.buyExecutions.length, 0);
});

test('workflow and buy-decision writes rollback together when buy-decision creation fails', async () => {
  const harness = createRepositoryHarness();
  harness.workflowItems.push(harness.makeWorkflowRecord());
  const service = createOfferWorkflowService({
    ...(harness.repository as any),
    async createBuyDecision() {
      throw new Error('simulated failure');
    },
  });

  await assert.rejects(
    service.approveToBuy({
      workflowItemId: harness.workflowItems[0]!.id,
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
    }),
    /simulated failure/i,
  );

  assert.equal(harness.workflowItems[0]?.status, 'NEW');
  assert.equal(harness.workflowEvents.length, 0);
  assert.equal(harness.buyDecisions.length, 0);
});

test('blocked supplier prevents the normal approval-to-buy path', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.supplierQualifications.push({
    id: 'qual-1',
    supplierId: 'supplier-1',
    qualificationStatus: 'BLOCKED',
    trustTier: 'LOW',
    qualificationNote: 'Blocked',
    requiresManualApproval: true,
    canAutoApproveBuyDecisions: false,
    expiresAt: null,
  });
  harness.workflowItems.push(
    harness.makeWorkflowRecord({
      supplierQualificationStatus: 'BLOCKED',
      hasBlockedSupplier: true,
    }),
  );

  await assert.rejects(
    service.approveToBuy({
      workflowItemId: harness.workflowItems[0]!.id,
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
    }),
    /blocked supplier/i,
  );

  assert.equal(harness.workflowItems[0]?.status, 'NEW');
  assert.equal(harness.buyDecisions.length, 0);
});

test('unknown qualification requires explicit operator confirmation to approve', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(
    harness.makeWorkflowRecord({
      supplierQualificationStatus: 'UNKNOWN',
      hasUnknownSupplierQualification: true,
      qualificationRiskNote:
        'Supplier qualification is unknown and should be reviewed before purchase.',
    }),
  );

  await assert.rejects(
    service.approveToBuy({
      workflowItemId: harness.workflowItems[0]!.id,
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
    }),
    /qualification risk requires explicit operator confirmation/i,
  );

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    allowQualificationRisk: true,
    note: 'Approved despite unknown qualification.',
  });

  assert.equal(harness.buyDecisions.length, 1);
  assert.equal(harness.buyDecisions[0]?.hasQualificationRisk, true);
  assert.equal(harness.workflowItems[0]?.status, 'APPROVED_TO_BUY');
});

test('unresolved supplier requires explicit operator confirmation to approve', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(
    harness.makeWorkflowRecord({
      supplierQualificationStatus: 'APPROVED',
      hasUnresolvedSupplier: true,
      hasUnknownSupplierQualification: false,
      qualificationRiskNote: null,
    }),
  );

  await assert.rejects(
    service.approveToBuy({
      workflowItemId: harness.workflowItems[0]!.id,
      actorType: 'USER',
      actorIdentifier: 'buyer-1',
    }),
    /qualification risk requires explicit operator confirmation/i,
  );

  await service.approveToBuy({
    workflowItemId: harness.workflowItems[0]!.id,
    actorType: 'USER',
    actorIdentifier: 'buyer-1',
    allowQualificationRisk: true,
    note: 'Approved despite unresolved supplier.',
  });

  assert.equal(harness.buyDecisions.length, 1);
  assert.equal(harness.buyDecisions[0]?.supplierQualificationStatus, 'UNKNOWN');
  assert.equal(harness.buyDecisions[0]?.hasQualificationRisk, true);
  assert.equal(harness.workflowItems[0]?.status, 'APPROVED_TO_BUY');
  assert.equal(harness.workflowItems[0]?.hasUnknownSupplierQualification, true);
});

test('queue listing can return stale open items first', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);
  harness.workflowItems.push(
    harness.makeWorkflowRecord({
      id: 'workflow-older',
      emailDerivedOfferId: 'offer-older',
      createdAt: new Date('2026-04-19T10:00:00.000Z'),
    }),
    harness.makeWorkflowRecord({
      id: 'workflow-newer',
      emailDerivedOfferId: 'offer-newer',
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
    }),
  );

  const items = await service.listWorkflowItems({
    onlyOpen: true,
    staleFirst: true,
  });

  assert.equal(items[0]?.id, 'workflow-older');
  assert.equal(items[1]?.id, 'workflow-newer');
});

test('auto-promoted offers do not create review workflow items', async () => {
  const harness = createRepositoryHarness();
  const service = createOfferWorkflowService(harness.repository as never);

  const item = await service.syncWorkflowItemForOfferReview(
    createSyncInput({
      offerStatus: 'AUTO_PROMOTED',
    }),
  );

  assert.equal(item, null);
  assert.equal(harness.workflowItems.length, 0);
  assert.equal(harness.workflowEvents.length, 0);
});

test('conflicting supplier cues and qualification risk drive explainable priority', () => {
  const conflicting = determineWorkflowPriority(
    createSyncInput({
      reviewReason: 'conflicting_supplier_cues',
      supplierQualificationStatus: 'RESTRICTED',
      resolutionCandidates: [
        {
          entityType: 'SUPPLIER',
          candidateId: null,
          candidateName: 'Supplier One',
          confidence: 80,
          reason: 'sender_mapping',
          selected: false,
        },
        {
          entityType: 'SUPPLIER',
          candidateId: null,
          candidateName: 'Supplier Two',
          confidence: 78,
          reason: 'signature_cue',
          selected: false,
        },
      ],
    }),
  );
  const blocked = determineWorkflowPriority(
    createSyncInput({
      supplierQualificationStatus: 'BLOCKED',
    }),
  );

  assert.equal(conflicting.priority, 'HIGH');
  assert.equal(conflicting.hasConflictingSupplierCues, true);
  assert.equal(conflicting.hasRestrictedSupplier, false);
  assert.equal(conflicting.hasUnknownSupplierQualification, true);
  assert.equal(blocked.priority, 'HIGH');
  assert.equal(blocked.hasBlockedSupplier, true);
});
