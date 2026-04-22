import { db } from '../lib/db';
import {
  summarizeBuyExecution,
  upsertExecutionForBuyDecision,
  type BuyDecisionExecutionSnapshot,
  type BuyExecutionRecord,
  type BuyExecutionUpdateInput,
} from '../buyExecutions/service';
import { syncTradeOpportunityCommercialState } from '../deals/service';
import { supplierScorecardService } from '../suppliers/scorecardService';

export type BuyDecisionApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type BuyDecisionOrderStatus =
  | 'NOT_ORDERED'
  | 'ORDERED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

export type BuyDecisionActionType =
  | 'CREATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'MARKED_ORDERED'
  | 'MARKED_PARTIALLY_FULFILLED'
  | 'MARKED_FULFILLED'
  | 'CANCELLED'
  | 'NOTE_ADDED'
  | 'UPDATED_REFERENCE';

export type BuyDecisionActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type BuyDecisionRecord = BuyDecisionExecutionSnapshot & {
  emailDerivedOfferId: string;
  offerWorkflowItemId: string | null;
  inboundEmailId: string | null;
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  sourceKind: string | null;
  sourceBlockText: string | null;
  qualificationRiskNote: string | null;
  approvalNote: string | null;
  approvedByType: string | null;
  approvedByIdentifier: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  supplier?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
  } | null;
  execution?: BuyExecutionRecord | null;
  events?: BuyDecisionEventRecord[];
};

export type BuyDecisionEventRecord = {
  id: string;
  buyDecisionId: string;
  actionType: BuyDecisionActionType;
  previousApprovalStatus: BuyDecisionApprovalStatus | null;
  newApprovalStatus: BuyDecisionApprovalStatus | null;
  previousOrderStatus: BuyDecisionOrderStatus | null;
  newOrderStatus: BuyDecisionOrderStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type ApprovedBuyDecisionInput = BuyDecisionActor & {
  emailDerivedOfferId: string;
  offerWorkflowItemId: string | null;
  inboundEmailId: string | null;
  supplierId: string | null;
  productId: string | null;
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  manufacturerCandidate: string | null;
  quotedUnitPrice: unknown;
  quotedCurrencyCode: string | null;
  quotedMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  sourceKind: string | null;
  sourceBlockText: string | null;
  supplierQualificationStatus: 'UNKNOWN' | 'PENDING_REVIEW' | 'APPROVED' | 'RESTRICTED' | 'BLOCKED';
  hasQualificationRisk: boolean;
  qualificationRiskNote: string | null;
  approvalNote?: string | null;
  metadata?: unknown;
};

export type BuyDecisionListFilters = {
  approvalStatus?: BuyDecisionApprovalStatus | null;
  orderStatus?: BuyDecisionOrderStatus | null;
  supplierId?: string | null;
  hasQualificationRisk?: boolean;
  approvedByIdentifier?: string | null;
  approvedFrom?: Date | null;
  approvedTo?: Date | null;
  take?: number;
};

export type EnrichedBuyDecisionRecord = BuyDecisionRecord & {
  executionSummary: ReturnType<typeof summarizeBuyExecution>;
  supplierPerformanceSummary: Awaited<
    ReturnType<typeof supplierScorecardService.getScorecardForSupplier>
  >;
  recommendedNextAction: ReturnType<typeof summarizeBuyExecution>['recommendedNextAction'];
};

export type BuyDecisionRepository = {
  transaction: <T>(callback: (repository: BuyDecisionRepository) => Promise<T>) => Promise<T>;
  findByOfferId: (emailDerivedOfferId: string) => Promise<BuyDecisionRecord | null>;
  findById: (buyDecisionId: string) => Promise<BuyDecisionRecord | null>;
  create: (
    data: Partial<BuyDecisionRecord> &
      Pick<
        BuyDecisionRecord,
        | 'emailDerivedOfferId'
        | 'approvalStatus'
        | 'orderStatus'
        | 'supplierQualificationStatus'
        | 'hasQualificationRisk'
      >,
  ) => Promise<BuyDecisionRecord>;
  update: (buyDecisionId: string, data: Partial<BuyDecisionRecord>) => Promise<BuyDecisionRecord>;
  createEvent: (data: Omit<BuyDecisionEventRecord, 'id' | 'createdAt'>) => Promise<BuyDecisionEventRecord>;
  list: (filters: BuyDecisionListFilters) => Promise<BuyDecisionRecord[]>;
  findExecutionByBuyDecisionId: (buyDecisionId: string) => Promise<BuyExecutionRecord | null>;
  createExecution: Parameters<typeof upsertExecutionForBuyDecision>[0]['create'];
  updateExecution: Parameters<typeof upsertExecutionForBuyDecision>[0]['update'];
  createExecutionEvent: Parameters<typeof upsertExecutionForBuyDecision>[0]['createEvent'];
  listActiveTradeOpportunitiesByOfferId: (emailDerivedOfferId: string) => Promise<any[]>;
  updateTradeOpportunity: (tradeOpportunityId: string, data: Record<string, unknown>) => Promise<any>;
  createTradeOpportunityEvent: (data: Record<string, unknown>) => Promise<any>;
};

function normalizeActor(actor?: BuyDecisionActor): { actorType: string; actorIdentifier: string | null } {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function mapOrderStatusToExecutionInput(
  input: BuyDecisionActor & {
    orderStatus: BuyDecisionOrderStatus;
    note?: string | null;
    externalOrderReference?: string | null;
    orderPlacedAt?: Date | null;
    orderedQuantity?: number | null;
    orderedUnitPrice?: unknown;
    orderedCurrencyCode?: string | null;
    orderedMinimumOrderQuantity?: number | null;
    confirmedAvailability?: boolean | null;
    expectedDeliveryDate?: Date | null;
  },
): BuyExecutionUpdateInput {
  return {
    actorType: input.actorType,
    actorIdentifier: input.actorIdentifier,
    note: input.note,
    externalOrderReference: input.externalOrderReference,
    orderPlacedAt:
      input.orderStatus === 'ORDERED' ||
      input.orderStatus === 'PARTIALLY_FULFILLED' ||
      input.orderStatus === 'FULFILLED'
        ? input.orderPlacedAt ?? new Date()
        : input.orderPlacedAt,
    orderedQuantity: input.orderedQuantity,
    orderedUnitPrice: input.orderedUnitPrice,
    orderedCurrencyCode: input.orderedCurrencyCode,
    orderedMinimumOrderQuantity: input.orderedMinimumOrderQuantity,
    confirmedAvailability: input.confirmedAvailability,
    expectedDeliveryDate: input.expectedDeliveryDate,
    fulfillmentStatus:
      input.orderStatus === 'ORDERED'
        ? 'ORDER_PLACED'
        : input.orderStatus === 'PARTIALLY_FULFILLED'
          ? 'PARTIALLY_RECEIVED'
          : input.orderStatus === 'FULFILLED'
            ? 'RECEIVED'
            : input.orderStatus === 'CANCELLED'
              ? 'CANCELLED'
              : 'NOT_STARTED',
  };
}

function buildDecisionExecutionSnapshot(decision: BuyDecisionRecord): BuyDecisionExecutionSnapshot {
  return {
    id: decision.id,
    emailDerivedOfferId: decision.emailDerivedOfferId,
    supplierId: decision.supplierId,
    productId: decision.productId,
    quotedUnitPrice: decision.quotedUnitPrice,
    quotedCurrencyCode: decision.quotedCurrencyCode,
    quotedMinimumOrderQuantity: decision.quotedMinimumOrderQuantity,
    quotedAvailability: decision.quotedAvailability,
    orderStatus: decision.orderStatus,
    orderedAt: decision.orderedAt,
    externalOrderReference: decision.externalOrderReference,
    supplierQualificationStatus: decision.supplierQualificationStatus,
    hasQualificationRisk: decision.hasQualificationRisk,
    approvalStatus: decision.approvalStatus,
    approvedAt: decision.approvedAt,
  };
}

export function createBuyDecisionRepository(client: typeof db = db, inTransaction = false): BuyDecisionRepository {
  return {
    transaction: async (callback) => {
      if (inTransaction) {
        return callback(createBuyDecisionRepository(client, true));
      }

      return db.$transaction(async (tx) => callback(createBuyDecisionRepository(tx as never, true)));
    },
    findByOfferId: async (emailDerivedOfferId) =>
      client.buyDecision.findUnique({
        where: { emailDerivedOfferId },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          execution: {
            include: {
              events: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyDecisionRecord | null>,
    findById: async (buyDecisionId) =>
      client.buyDecision.findUnique({
        where: { id: buyDecisionId },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          execution: {
            include: {
              events: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyDecisionRecord | null>,
    create: async (data) =>
      client.buyDecision.create({
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          execution: true,
          events: true,
        },
      }) as Promise<BuyDecisionRecord>,
    update: async (buyDecisionId, data) =>
      client.buyDecision.update({
        where: { id: buyDecisionId },
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          execution: {
            include: {
              events: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }) as Promise<BuyDecisionRecord>,
    createEvent: async (data) =>
      client.buyDecisionEvent.create({
        data: data as never,
      }) as Promise<BuyDecisionEventRecord>,
    list: async (filters) => {
      const where: Record<string, unknown> = {};

      if (filters.approvalStatus) {
        where.approvalStatus = filters.approvalStatus;
      }
      if (filters.orderStatus) {
        where.orderStatus = filters.orderStatus;
      }
      if (filters.supplierId) {
        where.supplierId = filters.supplierId;
      }
      if (typeof filters.hasQualificationRisk === 'boolean') {
        where.hasQualificationRisk = filters.hasQualificationRisk;
      }
      if (filters.approvedByIdentifier) {
        where.approvedByIdentifier = filters.approvedByIdentifier;
      }
      if (filters.approvedFrom || filters.approvedTo) {
        where.approvedAt = {
          gte: filters.approvedFrom ?? undefined,
          lte: filters.approvedTo ?? undefined,
        };
      }

      return (await client.buyDecision.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          execution: true,
        },
        orderBy: [{ approvedAt: 'desc' }, { updatedAt: 'desc' }] as never,
        take: filters.take ?? 100,
      })) as BuyDecisionRecord[];
    },
    findExecutionByBuyDecisionId: async (buyDecisionId) =>
      client.buyExecution.findUnique({
        where: { buyDecisionId },
      }) as Promise<BuyExecutionRecord | null>,
    createExecution: async (data) =>
      client.buyExecution.create({
        data: data as never,
      }) as Promise<BuyExecutionRecord>,
    updateExecution: async (buyExecutionId, data) =>
      client.buyExecution.update({
        where: { id: buyExecutionId },
        data: data as never,
      }) as Promise<BuyExecutionRecord>,
    createExecutionEvent: async (data) =>
      client.buyExecutionEvent.create({
        data: data as never,
      }) as Promise<any>,
    listActiveTradeOpportunitiesByOfferId: async (emailDerivedOfferId) =>
      client.tradeOpportunity.findMany({
        where: {
          emailDerivedOfferId,
          status: {
            in: ['OPEN', 'ON_HOLD'],
          },
        },
        include: {
          buyDecision: {
            select: {
              id: true,
              approvalStatus: true,
              orderStatus: true,
              supplierQualificationStatus: true,
              hasQualificationRisk: true,
            },
          },
          buyExecution: {
            select: {
              id: true,
              fulfillmentStatus: true,
              reconciliationStatus: true,
              hasPriceDrift: true,
              hasQuantityDrift: true,
              hasCurrencyMismatch: true,
              hasAvailabilityDrift: true,
            },
          },
        },
      }) as Promise<any[]>,
    updateTradeOpportunity: async (tradeOpportunityId, data) =>
      client.tradeOpportunity.update({
        where: { id: tradeOpportunityId },
        data: data as never,
      }) as Promise<any>,
    createTradeOpportunityEvent: async (data) =>
      client.tradeOpportunityEvent.create({
        data: data as never,
      }) as Promise<any>,
  };
}

async function logBuyDecisionEvent(
  repository: BuyDecisionRepository,
  buyDecisionId: string,
  actionType: BuyDecisionActionType,
  previousApprovalStatus: BuyDecisionApprovalStatus | null,
  newApprovalStatus: BuyDecisionApprovalStatus | null,
  previousOrderStatus: BuyDecisionOrderStatus | null,
  newOrderStatus: BuyDecisionOrderStatus | null,
  actor: { actorType: string; actorIdentifier: string | null },
  note?: string | null,
  metadata?: unknown,
): Promise<void> {
  await repository.createEvent({
    buyDecisionId,
    actionType,
    previousApprovalStatus,
    newApprovalStatus,
    previousOrderStatus,
    newOrderStatus,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note: note?.trim() || null,
    metadata: metadata ?? null,
  });
}

async function enrichBuyDecisions(items: BuyDecisionRecord[]): Promise<EnrichedBuyDecisionRecord[]> {
  const supplierIds = Array.from(new Set(items.flatMap((item) => (item.supplierId ? [item.supplierId] : []))));
  const scorecards = await supplierScorecardService.getScorecardsForSupplierIds(supplierIds);

  return items.map((item) => {
    const executionSummary = summarizeBuyExecution(buildDecisionExecutionSnapshot(item), item.execution ?? null);
    const supplierPerformanceSummary = item.supplierId ? scorecards[item.supplierId] ?? null : null;

    return {
      ...item,
      executionSummary,
      supplierPerformanceSummary,
      recommendedNextAction:
        supplierPerformanceSummary?.summary.recommendedAction === 'restrict supplier'
          ? 'restrict supplier'
          : executionSummary.recommendedNextAction,
    };
  });
}

export function createBuyDecisionService(overrides?: Partial<BuyDecisionRepository>) {
  const repository: BuyDecisionRepository = {
    ...createBuyDecisionRepository(),
    ...overrides,
  };

  return {
    async getBuyDecision(buyDecisionId: string): Promise<EnrichedBuyDecisionRecord | null> {
      const item = await repository.findById(buyDecisionId);
      if (!item) {
        return null;
      }

      return (await enrichBuyDecisions([item]))[0] ?? null;
    },

    async getBuyDecisionByOffer(emailDerivedOfferId: string): Promise<EnrichedBuyDecisionRecord | null> {
      const item = await repository.findByOfferId(emailDerivedOfferId);
      if (!item) {
        return null;
      }

      return (await enrichBuyDecisions([item]))[0] ?? null;
    },

    async listBuyDecisions(filters: BuyDecisionListFilters = {}): Promise<EnrichedBuyDecisionRecord[]> {
      return enrichBuyDecisions(await repository.list(filters));
    },

    async upsertApprovedDecision(input: ApprovedBuyDecisionInput): Promise<EnrichedBuyDecisionRecord> {
      const actor = normalizeActor(input);

      const decision = await repository.transaction(async (txRepository) => {
        const existing = await txRepository.findByOfferId(input.emailDerivedOfferId);

        if (!existing) {
          const created = await txRepository.create({
            emailDerivedOfferId: input.emailDerivedOfferId,
            offerWorkflowItemId: input.offerWorkflowItemId,
            inboundEmailId: input.inboundEmailId,
            supplierId: input.supplierId,
            productId: input.productId,
            rawProductText: input.rawProductText,
            normalizedProductNameCandidate: input.normalizedProductNameCandidate,
            manufacturerCandidate: input.manufacturerCandidate,
            quotedUnitPrice: input.quotedUnitPrice,
            quotedCurrencyCode: input.quotedCurrencyCode,
            quotedMinimumOrderQuantity: input.quotedMinimumOrderQuantity,
            quotedAvailability: input.quotedAvailability,
            sourceKind: input.sourceKind,
            sourceBlockText: input.sourceBlockText,
            supplierQualificationStatus: input.supplierQualificationStatus,
            hasQualificationRisk: input.hasQualificationRisk,
            qualificationRiskNote: input.qualificationRiskNote,
            approvalStatus: 'APPROVED',
            approvalNote: input.approvalNote?.trim() || null,
            approvedByType: actor.actorType,
            approvedByIdentifier: actor.actorIdentifier,
            approvedAt: new Date(),
            orderStatus: 'NOT_ORDERED',
            metadata: input.metadata ?? null,
          });

          await logBuyDecisionEvent(
            txRepository,
            created.id,
            'CREATED',
            null,
            created.approvalStatus,
            null,
            created.orderStatus,
            actor,
            created.approvalNote,
            {
              hasQualificationRisk: created.hasQualificationRisk,
              supplierQualificationStatus: created.supplierQualificationStatus,
            },
          );

          await syncTradeOpportunityCommercialState(
            {
              listActiveByOfferId: txRepository.listActiveTradeOpportunitiesByOfferId,
              updateTradeOpportunity: txRepository.updateTradeOpportunity,
              createTradeOpportunityEvent: txRepository.createTradeOpportunityEvent,
            },
            {
              emailDerivedOfferId: input.emailDerivedOfferId,
              buyDecision: created,
              buyExecution: created.execution ?? null,
              actor,
              note: created.approvalNote,
            },
          );

          return created;
        }

        const approvalNote = input.approvalNote?.trim() || existing.approvalNote;
        const updated = await txRepository.update(existing.id, {
          offerWorkflowItemId: input.offerWorkflowItemId ?? existing.offerWorkflowItemId,
          inboundEmailId: input.inboundEmailId ?? existing.inboundEmailId,
          supplierId: input.supplierId,
          productId: input.productId,
          rawProductText: input.rawProductText,
          normalizedProductNameCandidate: input.normalizedProductNameCandidate,
          manufacturerCandidate: input.manufacturerCandidate,
          quotedUnitPrice: input.quotedUnitPrice,
          quotedCurrencyCode: input.quotedCurrencyCode,
          quotedMinimumOrderQuantity: input.quotedMinimumOrderQuantity,
          quotedAvailability: input.quotedAvailability,
          sourceKind: input.sourceKind,
          sourceBlockText: input.sourceBlockText,
          supplierQualificationStatus: input.supplierQualificationStatus,
          hasQualificationRisk: input.hasQualificationRisk,
          qualificationRiskNote: input.qualificationRiskNote,
          approvalStatus: 'APPROVED',
          approvalNote,
          approvedByType: actor.actorType,
          approvedByIdentifier: actor.actorIdentifier,
          approvedAt: existing.approvedAt ?? new Date(),
          metadata: input.metadata === undefined ? existing.metadata : input.metadata,
        });

        if (existing.approvalStatus !== 'APPROVED') {
          await logBuyDecisionEvent(
            txRepository,
            existing.id,
            'APPROVED',
            existing.approvalStatus,
            'APPROVED',
            existing.orderStatus,
            updated.orderStatus,
            actor,
            approvalNote,
            {
              hasQualificationRisk: updated.hasQualificationRisk,
              supplierQualificationStatus: updated.supplierQualificationStatus,
            },
          );
        }

        await syncTradeOpportunityCommercialState(
          {
            listActiveByOfferId: txRepository.listActiveTradeOpportunitiesByOfferId,
            updateTradeOpportunity: txRepository.updateTradeOpportunity,
            createTradeOpportunityEvent: txRepository.createTradeOpportunityEvent,
          },
          {
            emailDerivedOfferId: input.emailDerivedOfferId,
            buyDecision: updated,
            buyExecution: updated.execution ?? null,
            actor,
            note: approvalNote,
          },
        );

        return updated;
      });

      return (await enrichBuyDecisions([decision]))[0]!;
    },

    async setRejectedForOffer(
      emailDerivedOfferId: string,
      actorInput?: BuyDecisionActor,
      note?: string | null,
    ): Promise<EnrichedBuyDecisionRecord | null> {
      const actor = normalizeActor(actorInput);

      const decision = await repository.transaction(async (txRepository) => {
        const existing = await txRepository.findByOfferId(emailDerivedOfferId);
        if (!existing) {
          return null;
        }

        const nextApprovalStatus: BuyDecisionApprovalStatus =
          existing.orderStatus === 'NOT_ORDERED' ? 'REJECTED' : 'CANCELLED';
        const nextOrderStatus: BuyDecisionOrderStatus =
          existing.orderStatus === 'NOT_ORDERED' ? existing.orderStatus : 'CANCELLED';

        if (
          existing.approvalStatus === nextApprovalStatus &&
          existing.orderStatus === nextOrderStatus &&
          !note?.trim()
        ) {
          return existing;
        }

        const updated = await txRepository.update(existing.id, {
          approvalStatus: nextApprovalStatus,
          approvalNote: note?.trim() || existing.approvalNote,
          orderStatus: nextOrderStatus,
        });

        await logBuyDecisionEvent(
          txRepository,
          existing.id,
          nextApprovalStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
          existing.approvalStatus,
          updated.approvalStatus,
          existing.orderStatus,
          updated.orderStatus,
          actor,
          note,
        );

        const updatedExecution =
          nextOrderStatus === 'CANCELLED'
            ? await upsertExecutionForBuyDecision(
                {
                  findByBuyDecisionId: txRepository.findExecutionByBuyDecisionId,
                  create: txRepository.createExecution,
                  update: txRepository.updateExecution,
                  createEvent: txRepository.createExecutionEvent,
                },
                buildDecisionExecutionSnapshot(updated),
                {
                  actorType: actor.actorType,
                  actorIdentifier: actor.actorIdentifier,
                  note,
                  fulfillmentStatus: 'CANCELLED',
                },
              )
            : updated.execution ?? null;

        await syncTradeOpportunityCommercialState(
          {
            listActiveByOfferId: txRepository.listActiveTradeOpportunitiesByOfferId,
            updateTradeOpportunity: txRepository.updateTradeOpportunity,
            createTradeOpportunityEvent: txRepository.createTradeOpportunityEvent,
          },
          {
            emailDerivedOfferId,
            buyDecision: updated,
            buyExecution: updatedExecution,
            actor,
            note,
          },
        );

        return updated;
      });

      if (!decision) {
        return null;
      }

      return (await enrichBuyDecisions([decision]))[0] ?? null;
    },

    async updateOrderStatus(
      buyDecisionId: string,
      input: BuyDecisionActor & {
        orderStatus: BuyDecisionOrderStatus;
        note?: string | null;
        externalOrderReference?: string | null;
        orderPlacedAt?: Date | null;
        orderedQuantity?: number | null;
        orderedUnitPrice?: unknown;
        orderedCurrencyCode?: string | null;
        orderedMinimumOrderQuantity?: number | null;
        confirmedAvailability?: boolean | null;
        expectedDeliveryDate?: Date | null;
      },
    ): Promise<EnrichedBuyDecisionRecord> {
      const actor = normalizeActor(input);

      const decision = await repository.transaction(async (txRepository) => {
        const existing = await txRepository.findById(buyDecisionId);
        if (!existing) {
          throw new Error('Buy decision not found.');
        }

        const nextReference =
          input.externalOrderReference === undefined
            ? existing.externalOrderReference
            : input.externalOrderReference?.trim() || null;
        const nextOrderedAt =
          input.orderStatus === 'ORDERED' ||
          input.orderStatus === 'PARTIALLY_FULFILLED' ||
          input.orderStatus === 'FULFILLED'
            ? existing.orderedAt ?? input.orderPlacedAt ?? new Date()
            : existing.orderedAt;

        if (
          existing.orderStatus === input.orderStatus &&
          existing.externalOrderReference === nextReference &&
          !input.note?.trim() &&
          input.orderedQuantity === undefined &&
          input.orderedUnitPrice === undefined &&
          input.orderedCurrencyCode === undefined &&
          input.orderedMinimumOrderQuantity === undefined &&
          input.confirmedAvailability === undefined &&
          input.expectedDeliveryDate === undefined
        ) {
          return existing;
        }

        const updated = await txRepository.update(existing.id, {
          orderStatus: input.orderStatus,
          orderedAt: nextOrderedAt,
          externalOrderReference: nextReference,
        });

        const actionType: BuyDecisionActionType =
          input.orderStatus === 'ORDERED'
            ? 'MARKED_ORDERED'
            : input.orderStatus === 'PARTIALLY_FULFILLED'
              ? 'MARKED_PARTIALLY_FULFILLED'
              : input.orderStatus === 'FULFILLED'
                ? 'MARKED_FULFILLED'
                : input.orderStatus === 'CANCELLED'
                  ? 'CANCELLED'
                  : 'UPDATED_REFERENCE';

        await logBuyDecisionEvent(
          txRepository,
          existing.id,
          actionType,
          existing.approvalStatus,
          updated.approvalStatus,
          existing.orderStatus,
          updated.orderStatus,
          actor,
          input.note,
          {
            externalOrderReference: nextReference,
          },
        );

        const updatedExecution = await upsertExecutionForBuyDecision(
          {
            findByBuyDecisionId: txRepository.findExecutionByBuyDecisionId,
            create: txRepository.createExecution,
            update: txRepository.updateExecution,
            createEvent: txRepository.createExecutionEvent,
          },
          buildDecisionExecutionSnapshot(updated),
          mapOrderStatusToExecutionInput({
            ...input,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            externalOrderReference: nextReference,
            orderPlacedAt: nextOrderedAt,
          }),
        );

        await syncTradeOpportunityCommercialState(
          {
            listActiveByOfferId: txRepository.listActiveTradeOpportunitiesByOfferId,
            updateTradeOpportunity: txRepository.updateTradeOpportunity,
            createTradeOpportunityEvent: txRepository.createTradeOpportunityEvent,
          },
          {
            emailDerivedOfferId: existing.emailDerivedOfferId,
            buyDecision: updated,
            buyExecution: updatedExecution,
            actor,
            note: input.note,
          },
        );

        return txRepository.findById(updated.id) as Promise<BuyDecisionRecord>;
      });

      return (await enrichBuyDecisions([decision]))[0]!;
    },

    async updateReference(
      buyDecisionId: string,
      input: BuyDecisionActor & { externalOrderReference: string | null; note?: string | null },
    ): Promise<EnrichedBuyDecisionRecord> {
      const actor = normalizeActor(input);

      const decision = await repository.transaction(async (txRepository) => {
        const existing = await txRepository.findById(buyDecisionId);
        if (!existing) {
          throw new Error('Buy decision not found.');
        }

        const nextReference = input.externalOrderReference?.trim() || null;
        if (existing.externalOrderReference === nextReference && !input.note?.trim()) {
          return existing;
        }

        const updated = await txRepository.update(existing.id, {
          externalOrderReference: nextReference,
        });

        await logBuyDecisionEvent(
          txRepository,
          existing.id,
          'UPDATED_REFERENCE',
          existing.approvalStatus,
          updated.approvalStatus,
          existing.orderStatus,
          updated.orderStatus,
          actor,
          input.note,
          {
            externalOrderReference: nextReference,
          },
        );

        if (updated.orderStatus !== 'NOT_ORDERED') {
          await upsertExecutionForBuyDecision(
            {
              findByBuyDecisionId: txRepository.findExecutionByBuyDecisionId,
              create: txRepository.createExecution,
              update: txRepository.updateExecution,
              createEvent: txRepository.createExecutionEvent,
            },
            buildDecisionExecutionSnapshot(updated),
            {
              actorType: actor.actorType,
              actorIdentifier: actor.actorIdentifier,
              note: input.note,
              externalOrderReference: nextReference,
            },
          );
        }

        return txRepository.findById(updated.id) as Promise<BuyDecisionRecord>;
      });

      return (await enrichBuyDecisions([decision]))[0]!;
    },

    async addNote(
      buyDecisionId: string,
      input: BuyDecisionActor & { note: string },
    ): Promise<EnrichedBuyDecisionRecord> {
      const actor = normalizeActor(input);

      const decision = await repository.transaction(async (txRepository) => {
        const existing = await txRepository.findById(buyDecisionId);
        if (!existing) {
          throw new Error('Buy decision not found.');
        }

        const updated = await txRepository.update(existing.id, {
          approvalNote: input.note.trim(),
        });

        await logBuyDecisionEvent(
          txRepository,
          existing.id,
          'NOTE_ADDED',
          existing.approvalStatus,
          updated.approvalStatus,
          existing.orderStatus,
          updated.orderStatus,
          actor,
          input.note,
        );

        if (updated.execution) {
          await upsertExecutionForBuyDecision(
            {
              findByBuyDecisionId: txRepository.findExecutionByBuyDecisionId,
              create: txRepository.createExecution,
              update: txRepository.updateExecution,
              createEvent: txRepository.createExecutionEvent,
            },
            buildDecisionExecutionSnapshot(updated),
            {
              actorType: actor.actorType,
              actorIdentifier: actor.actorIdentifier,
              note: input.note,
              notes: input.note,
            },
          );
        }

        return txRepository.findById(updated.id) as Promise<BuyDecisionRecord>;
      });

      return (await enrichBuyDecisions([decision]))[0]!;
    },
  };
}

export const buyDecisionService = createBuyDecisionService();
