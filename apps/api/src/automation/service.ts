import { db } from '../lib/db';

export type AutomationGlobalMode =
  | 'OBSERVE_ONLY'
  | 'INTERNAL_SIGNALS_ONLY'
  | 'DRAFTS_ONLY'
  | 'ASSISTED_OUTREACH'
  | 'FULLY_BLOCKED';

export type AutomationReadinessActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'MODE_CHANGED'
  | 'SEND_BLOCKED'
  | 'SEND_ELIGIBILITY_CHANGED'
  | 'NOTE_ADDED';

export type OperatorFeedbackType =
  | 'EXTRACTION'
  | 'SUPPLIER_RESOLUTION'
  | 'SIGNAL'
  | 'DEAL'
  | 'DRAFT';

export type OperatorFeedbackVerdict =
  | 'CORRECT'
  | 'PARTIALLY_CORRECT'
  | 'INCORRECT'
  | 'USEFUL'
  | 'NOT_USEFUL'
  | 'SAFE'
  | 'POLICY_ISSUE';

export type AutomationReadinessPolicyRecord = {
  id: string;
  scopeName: string;
  globalMode: AutomationGlobalMode;
  allowInternalSignals: boolean;
  allowDraftGeneration: boolean;
  allowSupplierDraftApprovalFlow: boolean;
  allowBuyerDraftApprovalFlow: boolean;
  allowActualSend: boolean;
  requireHumanApprovalBeforeSend: boolean;
  minimumExtractionPrecisionPct: unknown;
  minimumSupplierResolutionPrecisionPct: unknown;
  minimumSignalAcceptancePct: unknown;
  minimumDraftPolicyPassPct: unknown;
  minimumSampleSize: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AutomationReadinessEventRecord = {
  id: string;
  automationReadinessPolicyId: string;
  actionType: AutomationReadinessActionType;
  previousGlobalMode: AutomationGlobalMode | null;
  newGlobalMode: AutomationGlobalMode | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type OperatorValidationFeedbackRecord = {
  id: string;
  emailDerivedOfferId: string | null;
  offerWorkflowItemId: string | null;
  tradeOpportunityId: string | null;
  tradeMessageDraftId: string | null;
  feedbackType: OperatorFeedbackType;
  verdict: OperatorFeedbackVerdict;
  productTextCorrect: boolean | null;
  priceCorrect: boolean | null;
  currencyCorrect: boolean | null;
  supplierCorrect: boolean | null;
  manufacturerCorrect: boolean | null;
  availabilityCorrect: boolean | null;
  moqCorrect: boolean | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  flags: unknown;
  metadata: unknown;
  createdAt: Date;
  emailDerivedOffer?: {
    id: string;
    fieldConfidence: number | null;
    entityResolutionConfidence: number | null;
  } | null;
  tradeMessageDraft?: {
    id: string;
    tradeOpportunityId: string;
    status: string;
    direction: string;
    policyViolations: unknown;
  } | null;
};

type OfferEvaluationSource = {
  id: string;
  status: string;
  aiAssisted: boolean;
  fieldConfidence: number | null;
  entityResolutionConfidence: number | null;
  createdAt: Date;
};

type WorkflowEvaluationSource = {
  id: string;
  emailDerivedOfferId: string;
  status: string;
  aiAssisted: boolean;
  hasUnresolvedSupplier: boolean;
  createdAt: Date;
};

type BuyDecisionEvaluationSource = {
  id: string;
  emailDerivedOfferId: string;
  approvalStatus: string;
  createdAt: Date;
};

type DraftEvaluationSource = {
  id: string;
  tradeOpportunityId: string;
  direction: 'TO_SUPPLIER' | 'TO_BUYER' | 'INTERNAL';
  status: string;
  policyViolations: unknown;
  createdAt: Date;
};

type TradeDraftLookup = {
  id: string;
  tradeOpportunityId: string;
};

export type OperatorFeedbackActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type OperatorValidationFeedbackCreateInput = OperatorFeedbackActor & {
  emailDerivedOfferId?: string | null;
  offerWorkflowItemId?: string | null;
  tradeOpportunityId?: string | null;
  tradeMessageDraftId?: string | null;
  feedbackType: OperatorFeedbackType;
  verdict: OperatorFeedbackVerdict;
  productTextCorrect?: boolean | null;
  priceCorrect?: boolean | null;
  currencyCorrect?: boolean | null;
  supplierCorrect?: boolean | null;
  manufacturerCorrect?: boolean | null;
  availabilityCorrect?: boolean | null;
  moqCorrect?: boolean | null;
  note?: string | null;
  flags?: unknown;
  metadata?: unknown;
};

export type AutomationReadinessPolicyUpdateInput = OperatorFeedbackActor & {
  scopeName?: string | null;
  globalMode?: AutomationGlobalMode;
  allowInternalSignals?: boolean;
  allowDraftGeneration?: boolean;
  allowSupplierDraftApprovalFlow?: boolean;
  allowBuyerDraftApprovalFlow?: boolean;
  allowActualSend?: boolean;
  requireHumanApprovalBeforeSend?: boolean;
  minimumExtractionPrecisionPct?: unknown;
  minimumSupplierResolutionPrecisionPct?: unknown;
  minimumSignalAcceptancePct?: unknown;
  minimumDraftPolicyPassPct?: unknown;
  minimumSampleSize?: number | null;
  notes?: string | null;
};

export type AutomationEvaluationMetrics = {
  windowStart: Date;
  windowEnd: Date;
  totalStagedOffers: number;
  totalReviewedOffers: number;
  extractionFeedbackCount: number;
  extractionPrecisionPct: number | null;
  supplierResolutionFeedbackCount: number;
  supplierResolutionPrecisionPct: number | null;
  signalFeedbackCount: number;
  signalAcceptancePct: number | null;
  draftFeedbackCount: number;
  draftPolicyPassPct: number | null;
  draftHumanAcceptancePct: number | null;
  workflowToBuyApprovalConversionPct: number | null;
  dealDraftRejectionRatePct: number | null;
  aiAssistedReviewBurdenRatePct: number | null;
  unresolvedSupplierRatePct: number | null;
  falsePositiveCount: number;
  falseConfidenceCount: number;
  confidenceBucketPerformance: Record<
    'HIGH' | 'MEDIUM' | 'LOW',
    {
      sampleCount: number;
      scorePct: number | null;
    }
  >;
  readinessRecommendation:
    | 'review more samples'
    | 'fix supplier mapping'
    | 'improve draft policy cleanliness'
    | 'remain drafts-only'
    | 'internal signals only'
    | 'monitor';
};

export type AutomationGateDecision = {
  eligible: boolean;
  blockedReasons: string[];
  currentMetricsSummary: {
    extractionPrecisionPct: number | null;
    supplierResolutionPrecisionPct: number | null;
    signalAcceptancePct: number | null;
    draftPolicyPassPct: number | null;
    minimumSampleSize: number | null;
  };
  thresholdComparisons: Record<
    string,
    {
      current: number | null;
      minimum: number | null;
      met: boolean;
    }
  >;
};

export type AutomationReadinessOverview = {
  policy: AutomationReadinessPolicyRecord;
  evaluation: AutomationEvaluationMetrics;
  decisions: {
    internalSignals: AutomationGateDecision;
    supplierDrafts: AutomationGateDecision;
    buyerDrafts: AutomationGateDecision;
    assistedOutreach: AutomationGateDecision;
    actualSend: AutomationGateDecision;
  };
  recommendedAction: AutomationEvaluationMetrics['readinessRecommendation'];
};

export type OfferFeedbackSummary = {
  hasFeedback: boolean;
  extractionVerdict: OperatorFeedbackVerdict | null;
  supplierResolutionVerdict: OperatorFeedbackVerdict | null;
  signalVerdict: OperatorFeedbackVerdict | null;
  feedbackCount: number;
};

export type TradeFeedbackSummary = {
  hasFeedback: boolean;
  dealVerdict: OperatorFeedbackVerdict | null;
  latestDraftVerdict: OperatorFeedbackVerdict | null;
  draftPolicyIssueCount: number;
  draftSafetyPassCount: number;
  feedbackCount: number;
};

type AutomationDependencies = {
  now: () => Date;
};

export type AutomationFeedbackWriteRepository = {
  findRecentMatchingFeedback: (input: {
    emailDerivedOfferId: string | null;
    offerWorkflowItemId: string | null;
    tradeOpportunityId: string | null;
    tradeMessageDraftId: string | null;
    feedbackType: OperatorFeedbackType;
    verdict: OperatorFeedbackVerdict;
    actorType: string;
    actorIdentifier: string | null;
    createdAfter: Date;
  }) => Promise<OperatorValidationFeedbackRecord | null>;
  createFeedback: (
    data: Record<string, unknown>,
  ) => Promise<OperatorValidationFeedbackRecord>;
  findTradeMessageDraftById?: (
    draftId: string,
  ) => Promise<TradeDraftLookup | null>;
};

export type AutomationRepository = AutomationFeedbackWriteRepository & {
  transaction: <T>(
    callback: (repository: AutomationRepository) => Promise<T>,
  ) => Promise<T>;
  findPolicyByScopeName: (
    scopeName: string,
  ) => Promise<AutomationReadinessPolicyRecord | null>;
  createPolicy: (
    data: Record<string, unknown>,
  ) => Promise<AutomationReadinessPolicyRecord>;
  updatePolicy: (
    automationReadinessPolicyId: string,
    data: Record<string, unknown>,
  ) => Promise<AutomationReadinessPolicyRecord>;
  createReadinessEvent: (
    data: Omit<AutomationReadinessEventRecord, 'id' | 'createdAt'>,
  ) => Promise<AutomationReadinessEventRecord>;
  listReadinessEvents: (
    scopeName: string,
  ) => Promise<AutomationReadinessEventRecord[]>;
  listOffersInWindow: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<OfferEvaluationSource[]>;
  listWorkflowItemsInWindow: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<WorkflowEvaluationSource[]>;
  listBuyDecisionsInWindow: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<BuyDecisionEvaluationSource[]>;
  listTradeDraftsInWindow: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<DraftEvaluationSource[]>;
  listFeedbackInWindow: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<OperatorValidationFeedbackRecord[]>;
  listFeedbackByOfferIds: (
    emailDerivedOfferIds: string[],
  ) => Promise<OperatorValidationFeedbackRecord[]>;
  listFeedbackByTradeOpportunityIds: (
    tradeOpportunityIds: string[],
  ) => Promise<OperatorValidationFeedbackRecord[]>;
};

const DEFAULT_SCOPE_NAME = 'GLOBAL';

function normalizeActor(actor?: OperatorFeedbackActor) {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null;
  return normalized || null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    typeof value === 'object' &&
    value &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function round(value: number | null, precision = 4): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function feedbackScore(
  feedbackType: OperatorFeedbackType,
  verdict: OperatorFeedbackVerdict,
): number | null {
  if (feedbackType === 'EXTRACTION' || feedbackType === 'SUPPLIER_RESOLUTION') {
    return verdict === 'CORRECT'
      ? 1
      : verdict === 'PARTIALLY_CORRECT'
        ? 0.5
        : verdict === 'INCORRECT'
          ? 0
          : null;
  }

  if (feedbackType === 'SIGNAL' || feedbackType === 'DEAL') {
    return verdict === 'USEFUL' || verdict === 'CORRECT'
      ? 1
      : verdict === 'PARTIALLY_CORRECT'
        ? 0.5
        : verdict === 'NOT_USEFUL' || verdict === 'INCORRECT'
          ? 0
          : null;
  }

  if (feedbackType === 'DRAFT') {
    return verdict === 'SAFE' || verdict === 'USEFUL'
      ? 1
      : verdict === 'POLICY_ISSUE' ||
          verdict === 'NOT_USEFUL' ||
          verdict === 'INCORRECT'
        ? 0
        : null;
  }

  return null;
}

function scoreAverage(
  feedbacks: OperatorValidationFeedbackRecord[],
): number | null {
  const scores = feedbacks
    .map((feedback) => feedbackScore(feedback.feedbackType, feedback.verdict))
    .filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
    6,
  );
}

function confidenceBucket(
  value: number | null | undefined,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if ((value ?? 0) >= 80) {
    return 'HIGH';
  }
  if ((value ?? 0) >= 60) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function defaultPolicyData(
  scopeName = DEFAULT_SCOPE_NAME,
): Record<string, unknown> {
  return {
    scopeName,
    globalMode: 'INTERNAL_SIGNALS_ONLY',
    allowInternalSignals: true,
    allowDraftGeneration: true,
    allowSupplierDraftApprovalFlow: true,
    allowBuyerDraftApprovalFlow: true,
    allowActualSend: false,
    requireHumanApprovalBeforeSend: true,
    minimumExtractionPrecisionPct: 0.8,
    minimumSupplierResolutionPrecisionPct: 0.85,
    minimumSignalAcceptancePct: 0.7,
    minimumDraftPolicyPassPct: 0.95,
    minimumSampleSize: 20,
    notes:
      'Conservative default policy. Live autonomous sending remains blocked in this pass.',
  };
}

function compareThreshold(
  current: number | null,
  minimum: number | null,
): { current: number | null; minimum: number | null; met: boolean } {
  return {
    current,
    minimum,
    met: minimum === null || (current !== null && current >= minimum),
  };
}

function latestVerdict(
  feedbacks: OperatorValidationFeedbackRecord[],
  feedbackType: OperatorFeedbackType,
): OperatorFeedbackVerdict | null {
  const latest = feedbacks
    .filter((feedback) => feedback.feedbackType === feedbackType)
    .sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0];

  return latest?.verdict ?? null;
}

function deriveRecommendation(
  decisions: AutomationReadinessOverview['decisions'],
): AutomationEvaluationMetrics['readinessRecommendation'] {
  if (
    decisions.internalSignals.blockedReasons.some((reason) =>
      reason.includes('minimum sample size'),
    ) ||
    decisions.supplierDrafts.blockedReasons.some((reason) =>
      reason.includes('minimum sample size'),
    ) ||
    decisions.buyerDrafts.blockedReasons.some((reason) =>
      reason.includes('minimum sample size'),
    )
  ) {
    return 'review more samples';
  }

  if (
    decisions.internalSignals.blockedReasons.some((reason) =>
      reason.includes('supplier resolution'),
    ) ||
    decisions.supplierDrafts.blockedReasons.some((reason) =>
      reason.includes('supplier resolution'),
    ) ||
    decisions.buyerDrafts.blockedReasons.some((reason) =>
      reason.includes('supplier resolution'),
    )
  ) {
    return 'fix supplier mapping';
  }

  if (
    decisions.supplierDrafts.blockedReasons.some((reason) =>
      reason.includes('draft policy'),
    ) ||
    decisions.buyerDrafts.blockedReasons.some((reason) =>
      reason.includes('draft policy'),
    )
  ) {
    return 'improve draft policy cleanliness';
  }

  if (!decisions.supplierDrafts.eligible || !decisions.buyerDrafts.eligible) {
    return 'remain drafts-only';
  }

  if (!decisions.internalSignals.eligible) {
    return 'internal signals only';
  }

  return 'monitor';
}

export async function recordOperatorValidationFeedbackWithRepository(
  repository: AutomationFeedbackWriteRepository,
  input: OperatorValidationFeedbackCreateInput,
) {
  const actor = normalizeActor(input);
  const note = normalizeString(input.note);
  let tradeOpportunityId = input.tradeOpportunityId ?? null;

  if (
    !tradeOpportunityId &&
    input.tradeMessageDraftId &&
    repository.findTradeMessageDraftById
  ) {
    const draft = await repository.findTradeMessageDraftById(
      input.tradeMessageDraftId,
    );
    tradeOpportunityId = draft?.tradeOpportunityId ?? null;
  }

  const existing = await repository.findRecentMatchingFeedback({
    emailDerivedOfferId: input.emailDerivedOfferId ?? null,
    offerWorkflowItemId: input.offerWorkflowItemId ?? null,
    tradeOpportunityId,
    tradeMessageDraftId: input.tradeMessageDraftId ?? null,
    feedbackType: input.feedbackType,
    verdict: input.verdict,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    createdAfter: new Date(Date.now() - 5 * 60 * 1000),
  });

  if (
    existing &&
    existing.productTextCorrect === (input.productTextCorrect ?? null) &&
    existing.priceCorrect === (input.priceCorrect ?? null) &&
    existing.currencyCorrect === (input.currencyCorrect ?? null) &&
    existing.supplierCorrect === (input.supplierCorrect ?? null) &&
    existing.manufacturerCorrect === (input.manufacturerCorrect ?? null) &&
    existing.availabilityCorrect === (input.availabilityCorrect ?? null) &&
    existing.moqCorrect === (input.moqCorrect ?? null) &&
    existing.note === note &&
    jsonEqual(existing.flags, input.flags) &&
    jsonEqual(existing.metadata, input.metadata)
  ) {
    return existing;
  }

  return repository.createFeedback({
    emailDerivedOfferId: input.emailDerivedOfferId ?? null,
    offerWorkflowItemId: input.offerWorkflowItemId ?? null,
    tradeOpportunityId,
    tradeMessageDraftId: input.tradeMessageDraftId ?? null,
    feedbackType: input.feedbackType,
    verdict: input.verdict,
    productTextCorrect: input.productTextCorrect ?? null,
    priceCorrect: input.priceCorrect ?? null,
    currencyCorrect: input.currencyCorrect ?? null,
    supplierCorrect: input.supplierCorrect ?? null,
    manufacturerCorrect: input.manufacturerCorrect ?? null,
    availabilityCorrect: input.availabilityCorrect ?? null,
    moqCorrect: input.moqCorrect ?? null,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note,
    flags: input.flags ?? null,
    metadata: input.metadata ?? null,
  });
}

export function createAutomationRepository(
  client: typeof db = db,
  inTransaction = false,
): AutomationRepository {
  return {
    transaction: async (callback) => {
      if (inTransaction) {
        return callback(createAutomationRepository(client, true));
      }

      return db.$transaction(async (tx) =>
        callback(createAutomationRepository(tx as never, true)),
      );
    },
    findPolicyByScopeName: async (scopeName) =>
      client.automationReadinessPolicy.findUnique({
        where: { scopeName },
      }) as Promise<AutomationReadinessPolicyRecord | null>,
    createPolicy: async (data) =>
      client.automationReadinessPolicy.create({
        data: data as never,
      }) as Promise<AutomationReadinessPolicyRecord>,
    updatePolicy: async (automationReadinessPolicyId, data) =>
      client.automationReadinessPolicy.update({
        where: { id: automationReadinessPolicyId },
        data: data as never,
      }) as Promise<AutomationReadinessPolicyRecord>,
    createReadinessEvent: async (data) =>
      client.automationReadinessEvent.create({
        data: data as never,
      }) as Promise<AutomationReadinessEventRecord>,
    listReadinessEvents: async (scopeName) =>
      client.automationReadinessEvent.findMany({
        where: {
          automationReadinessPolicy: {
            scopeName,
          },
        },
        orderBy: { createdAt: 'asc' },
      }) as Promise<AutomationReadinessEventRecord[]>,
    listOffersInWindow: async (windowStart, windowEnd) =>
      client.emailDerivedOffer.findMany({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          id: true,
          status: true,
          aiAssisted: true,
          fieldConfidence: true,
          entityResolutionConfidence: true,
          createdAt: true,
        },
      }) as Promise<OfferEvaluationSource[]>,
    listWorkflowItemsInWindow: async (windowStart, windowEnd) =>
      client.offerWorkflowItem.findMany({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          id: true,
          emailDerivedOfferId: true,
          status: true,
          aiAssisted: true,
          hasUnresolvedSupplier: true,
          createdAt: true,
        },
      }) as Promise<WorkflowEvaluationSource[]>,
    listBuyDecisionsInWindow: async (windowStart, windowEnd) =>
      client.buyDecision.findMany({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          id: true,
          emailDerivedOfferId: true,
          approvalStatus: true,
          createdAt: true,
        },
      }) as Promise<BuyDecisionEvaluationSource[]>,
    listTradeDraftsInWindow: async (windowStart, windowEnd) =>
      client.tradeMessageDraft.findMany({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          id: true,
          tradeOpportunityId: true,
          direction: true,
          status: true,
          policyViolations: true,
          createdAt: true,
        },
      }) as Promise<DraftEvaluationSource[]>,
    listFeedbackInWindow: async (windowStart, windowEnd) =>
      client.operatorValidationFeedback.findMany({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        include: {
          emailDerivedOffer: {
            select: {
              id: true,
              fieldConfidence: true,
              entityResolutionConfidence: true,
            },
          },
          tradeMessageDraft: {
            select: {
              id: true,
              tradeOpportunityId: true,
              status: true,
              direction: true,
              policyViolations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }) as Promise<OperatorValidationFeedbackRecord[]>,
    listFeedbackByOfferIds: async (emailDerivedOfferIds) =>
      client.operatorValidationFeedback.findMany({
        where: {
          emailDerivedOfferId: {
            in: emailDerivedOfferIds,
          },
        },
        include: {
          emailDerivedOffer: {
            select: {
              id: true,
              fieldConfidence: true,
              entityResolutionConfidence: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }) as Promise<OperatorValidationFeedbackRecord[]>,
    listFeedbackByTradeOpportunityIds: async (tradeOpportunityIds) =>
      client.operatorValidationFeedback.findMany({
        where: {
          tradeOpportunityId: {
            in: tradeOpportunityIds,
          },
        },
        include: {
          tradeMessageDraft: {
            select: {
              id: true,
              tradeOpportunityId: true,
              status: true,
              direction: true,
              policyViolations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }) as Promise<OperatorValidationFeedbackRecord[]>,
    findRecentMatchingFeedback: async (input) =>
      client.operatorValidationFeedback.findFirst({
        where: {
          emailDerivedOfferId: input.emailDerivedOfferId,
          offerWorkflowItemId: input.offerWorkflowItemId,
          tradeOpportunityId: input.tradeOpportunityId,
          tradeMessageDraftId: input.tradeMessageDraftId,
          feedbackType: input.feedbackType,
          verdict: input.verdict,
          actorType: input.actorType,
          actorIdentifier: input.actorIdentifier,
          createdAt: {
            gte: input.createdAfter,
          },
        },
        include: {
          emailDerivedOffer: {
            select: {
              id: true,
              fieldConfidence: true,
              entityResolutionConfidence: true,
            },
          },
          tradeMessageDraft: {
            select: {
              id: true,
              tradeOpportunityId: true,
              status: true,
              direction: true,
              policyViolations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }) as Promise<OperatorValidationFeedbackRecord | null>,
    createFeedback: async (data) =>
      client.operatorValidationFeedback.create({
        data: data as never,
        include: {
          emailDerivedOffer: {
            select: {
              id: true,
              fieldConfidence: true,
              entityResolutionConfidence: true,
            },
          },
          tradeMessageDraft: {
            select: {
              id: true,
              tradeOpportunityId: true,
              status: true,
              direction: true,
              policyViolations: true,
            },
          },
        },
      }) as Promise<OperatorValidationFeedbackRecord>,
    findTradeMessageDraftById: async (draftId) =>
      client.tradeMessageDraft.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          tradeOpportunityId: true,
        },
      }) as Promise<TradeDraftLookup | null>,
  };
}

function computeDraftPassRate(
  drafts: DraftEvaluationSource[],
  feedbacks: OperatorValidationFeedbackRecord[],
): {
  draftPolicyPassPct: number | null;
  draftHumanAcceptancePct: number | null;
  dealDraftRejectionRatePct: number | null;
} {
  const outwardDrafts = drafts.filter(
    (draft) => draft.direction !== 'INTERNAL',
  );
  if (outwardDrafts.length === 0) {
    return {
      draftPolicyPassPct: null,
      draftHumanAcceptancePct: null,
      dealDraftRejectionRatePct: null,
    };
  }

  const latestFeedbackByDraftId = new Map<
    string,
    OperatorValidationFeedbackRecord
  >();
  for (const feedback of feedbacks.filter(
    (item) => item.feedbackType === 'DRAFT' && item.tradeMessageDraftId,
  )) {
    if (!latestFeedbackByDraftId.has(feedback.tradeMessageDraftId!)) {
      latestFeedbackByDraftId.set(feedback.tradeMessageDraftId!, feedback);
    }
  }

  let passCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const draft of outwardDrafts) {
    const latestFeedback = latestFeedbackByDraftId.get(draft.id);
    const policyViolationCount = Array.isArray(draft.policyViolations)
      ? draft.policyViolations.length
      : 0;
    const passesPolicy =
      latestFeedback?.verdict === 'POLICY_ISSUE'
        ? false
        : latestFeedback?.verdict === 'SAFE'
          ? true
          : policyViolationCount === 0;

    if (passesPolicy) {
      passCount += 1;
    }

    if (draft.status === 'APPROVED' || latestFeedback?.verdict === 'SAFE') {
      acceptedCount += 1;
    }
    if (
      draft.status === 'REJECTED' ||
      latestFeedback?.verdict === 'POLICY_ISSUE' ||
      latestFeedback?.verdict === 'NOT_USEFUL'
    ) {
      rejectedCount += 1;
    }
  }

  return {
    draftPolicyPassPct: round(passCount / outwardDrafts.length, 6),
    draftHumanAcceptancePct: round(acceptedCount / outwardDrafts.length, 6),
    dealDraftRejectionRatePct: round(rejectedCount / outwardDrafts.length, 6),
  };
}

function buildGateDecision(input: {
  policy: AutomationReadinessPolicyRecord;
  evaluation: AutomationEvaluationMetrics;
  modeAllowed: boolean;
  featureAllowed: boolean;
  requiresSignalRate: boolean;
  requiresDraftRate: boolean;
  blockModeReason: string;
  additionalBlocks?: string[];
  minimumSampleSize: number | null;
}) {
  const extractionMinimum = toNumber(
    input.policy.minimumExtractionPrecisionPct,
  );
  const supplierMinimum = toNumber(
    input.policy.minimumSupplierResolutionPrecisionPct,
  );
  const signalMinimum = toNumber(input.policy.minimumSignalAcceptancePct);
  const draftMinimum = toNumber(input.policy.minimumDraftPolicyPassPct);
  const minimumSampleSize = input.minimumSampleSize;
  const blockedReasons = [
    !input.modeAllowed ? input.blockModeReason : null,
    !input.featureAllowed ? 'feature is disabled by readiness policy' : null,
    minimumSampleSize !== null &&
    input.evaluation.extractionFeedbackCount < minimumSampleSize
      ? 'minimum sample size not met for extraction feedback'
      : null,
    minimumSampleSize !== null &&
    input.evaluation.supplierResolutionFeedbackCount < minimumSampleSize
      ? 'minimum sample size not met for supplier resolution feedback'
      : null,
    input.requiresSignalRate &&
    minimumSampleSize !== null &&
    input.evaluation.signalFeedbackCount < minimumSampleSize
      ? 'minimum sample size not met for signal usefulness feedback'
      : null,
    input.requiresDraftRate &&
    minimumSampleSize !== null &&
    input.evaluation.draftFeedbackCount < minimumSampleSize
      ? 'minimum sample size not met for draft feedback'
      : null,
    extractionMinimum !== null &&
    (input.evaluation.extractionPrecisionPct === null ||
      input.evaluation.extractionPrecisionPct < extractionMinimum)
      ? 'extraction precision is below policy minimum'
      : null,
    supplierMinimum !== null &&
    (input.evaluation.supplierResolutionPrecisionPct === null ||
      input.evaluation.supplierResolutionPrecisionPct < supplierMinimum)
      ? 'supplier resolution precision is below policy minimum'
      : null,
    input.requiresSignalRate &&
    signalMinimum !== null &&
    (input.evaluation.signalAcceptancePct === null ||
      input.evaluation.signalAcceptancePct < signalMinimum)
      ? 'signal acceptance is below policy minimum'
      : null,
    input.requiresDraftRate &&
    draftMinimum !== null &&
    (input.evaluation.draftPolicyPassPct === null ||
      input.evaluation.draftPolicyPassPct < draftMinimum)
      ? 'draft policy pass rate is below policy minimum'
      : null,
    ...(input.additionalBlocks ?? []),
  ].filter((reason): reason is string => Boolean(reason));

  return {
    eligible: blockedReasons.length === 0,
    blockedReasons,
    currentMetricsSummary: {
      extractionPrecisionPct: input.evaluation.extractionPrecisionPct,
      supplierResolutionPrecisionPct:
        input.evaluation.supplierResolutionPrecisionPct,
      signalAcceptancePct: input.evaluation.signalAcceptancePct,
      draftPolicyPassPct: input.evaluation.draftPolicyPassPct,
      minimumSampleSize,
    },
    thresholdComparisons: {
      extractionPrecisionPct: compareThreshold(
        input.evaluation.extractionPrecisionPct,
        extractionMinimum,
      ),
      supplierResolutionPrecisionPct: compareThreshold(
        input.evaluation.supplierResolutionPrecisionPct,
        supplierMinimum,
      ),
      signalAcceptancePct: compareThreshold(
        input.requiresSignalRate ? input.evaluation.signalAcceptancePct : null,
        input.requiresSignalRate ? signalMinimum : null,
      ),
      draftPolicyPassPct: compareThreshold(
        input.requiresDraftRate ? input.evaluation.draftPolicyPassPct : null,
        input.requiresDraftRate ? draftMinimum : null,
      ),
    },
  } satisfies AutomationGateDecision;
}

export function createAutomationService(
  overrides?: Partial<AutomationRepository>,
  dependencyOverrides?: Partial<AutomationDependencies>,
) {
  const repository: AutomationRepository = {
    ...createAutomationRepository(),
    ...overrides,
  };
  const dependencies: AutomationDependencies = {
    now: () => new Date(),
    ...dependencyOverrides,
  };

  return {
    async getReadinessPolicy(
      scopeName = DEFAULT_SCOPE_NAME,
    ): Promise<AutomationReadinessPolicyRecord> {
      const existing = await repository.findPolicyByScopeName(scopeName);
      if (existing) {
        return existing;
      }

      return repository.createPolicy(defaultPolicyData(scopeName));
    },

    async updateReadinessPolicy(
      input: AutomationReadinessPolicyUpdateInput,
    ): Promise<AutomationReadinessOverview> {
      const actor = normalizeActor(input);
      const scopeName = normalizeString(input.scopeName) ?? DEFAULT_SCOPE_NAME;

      return repository.transaction(async (txRepository) => {
        const existing =
          (await txRepository.findPolicyByScopeName(scopeName)) ??
          (await txRepository.createPolicy(defaultPolicyData(scopeName)));
        const previousOverview = await this.getReadinessOverview({ scopeName });
        const attemptedActualSend = input.allowActualSend === true;
        const nextData = {
          globalMode: input.globalMode ?? existing.globalMode,
          allowInternalSignals:
            typeof input.allowInternalSignals === 'boolean'
              ? input.allowInternalSignals
              : existing.allowInternalSignals,
          allowDraftGeneration:
            typeof input.allowDraftGeneration === 'boolean'
              ? input.allowDraftGeneration
              : existing.allowDraftGeneration,
          allowSupplierDraftApprovalFlow:
            typeof input.allowSupplierDraftApprovalFlow === 'boolean'
              ? input.allowSupplierDraftApprovalFlow
              : existing.allowSupplierDraftApprovalFlow,
          allowBuyerDraftApprovalFlow:
            typeof input.allowBuyerDraftApprovalFlow === 'boolean'
              ? input.allowBuyerDraftApprovalFlow
              : existing.allowBuyerDraftApprovalFlow,
          allowActualSend: false,
          requireHumanApprovalBeforeSend:
            typeof input.requireHumanApprovalBeforeSend === 'boolean'
              ? input.requireHumanApprovalBeforeSend
              : existing.requireHumanApprovalBeforeSend,
          minimumExtractionPrecisionPct:
            input.minimumExtractionPrecisionPct === undefined
              ? existing.minimumExtractionPrecisionPct
              : input.minimumExtractionPrecisionPct,
          minimumSupplierResolutionPrecisionPct:
            input.minimumSupplierResolutionPrecisionPct === undefined
              ? existing.minimumSupplierResolutionPrecisionPct
              : input.minimumSupplierResolutionPrecisionPct,
          minimumSignalAcceptancePct:
            input.minimumSignalAcceptancePct === undefined
              ? existing.minimumSignalAcceptancePct
              : input.minimumSignalAcceptancePct,
          minimumDraftPolicyPassPct:
            input.minimumDraftPolicyPassPct === undefined
              ? existing.minimumDraftPolicyPassPct
              : input.minimumDraftPolicyPassPct,
          minimumSampleSize:
            input.minimumSampleSize === undefined
              ? existing.minimumSampleSize
              : input.minimumSampleSize,
          notes:
            input.notes === undefined
              ? existing.notes
              : normalizeString(input.notes),
        };

        const hasMaterialChange =
          existing.globalMode !== nextData.globalMode ||
          existing.allowInternalSignals !== nextData.allowInternalSignals ||
          existing.allowDraftGeneration !== nextData.allowDraftGeneration ||
          existing.allowSupplierDraftApprovalFlow !==
            nextData.allowSupplierDraftApprovalFlow ||
          existing.allowBuyerDraftApprovalFlow !==
            nextData.allowBuyerDraftApprovalFlow ||
          existing.allowActualSend !== nextData.allowActualSend ||
          existing.requireHumanApprovalBeforeSend !==
            nextData.requireHumanApprovalBeforeSend ||
          toNumber(existing.minimumExtractionPrecisionPct) !==
            toNumber(nextData.minimumExtractionPrecisionPct) ||
          toNumber(existing.minimumSupplierResolutionPrecisionPct) !==
            toNumber(nextData.minimumSupplierResolutionPrecisionPct) ||
          toNumber(existing.minimumSignalAcceptancePct) !==
            toNumber(nextData.minimumSignalAcceptancePct) ||
          toNumber(existing.minimumDraftPolicyPassPct) !==
            toNumber(nextData.minimumDraftPolicyPassPct) ||
          existing.minimumSampleSize !== nextData.minimumSampleSize ||
          existing.notes !== nextData.notes;

        const updated = hasMaterialChange
          ? await txRepository.updatePolicy(existing.id, nextData)
          : existing;

        if (
          !existing.createdAt ||
          (existing.id === updated.id &&
            existing.createdAt.getTime() === updated.createdAt.getTime())
        ) {
          if (!existing.createdAt) {
            await txRepository.createReadinessEvent({
              automationReadinessPolicyId: updated.id,
              actionType: 'CREATED',
              previousGlobalMode: null,
              newGlobalMode: updated.globalMode,
              actorType: actor.actorType,
              actorIdentifier: actor.actorIdentifier,
              note: updated.notes,
              metadata: null,
            });
          }
        }

        if (hasMaterialChange) {
          await txRepository.createReadinessEvent({
            automationReadinessPolicyId: updated.id,
            actionType:
              existing.globalMode !== updated.globalMode
                ? 'MODE_CHANGED'
                : 'UPDATED',
            previousGlobalMode: existing.globalMode,
            newGlobalMode: updated.globalMode,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            note: normalizeString(input.notes),
            metadata: {
              attemptedActualSend,
            },
          });
        } else if (normalizeString(input.notes)) {
          await txRepository.createReadinessEvent({
            automationReadinessPolicyId: updated.id,
            actionType: 'NOTE_ADDED',
            previousGlobalMode: updated.globalMode,
            newGlobalMode: updated.globalMode,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            note: normalizeString(input.notes),
            metadata: null,
          });
        }

        if (attemptedActualSend) {
          await txRepository.createReadinessEvent({
            automationReadinessPolicyId: updated.id,
            actionType: 'SEND_BLOCKED',
            previousGlobalMode: updated.globalMode,
            newGlobalMode: updated.globalMode,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            note: 'Live autonomous sending remains blocked in this pass.',
            metadata: {
              attemptedAllowActualSend: true,
            },
          });
        }

        const nextOverview = await this.getReadinessOverview({ scopeName });
        const previousEligibility = JSON.stringify({
          internalSignals: previousOverview.decisions.internalSignals.eligible,
          supplierDrafts: previousOverview.decisions.supplierDrafts.eligible,
          buyerDrafts: previousOverview.decisions.buyerDrafts.eligible,
          assistedOutreach:
            previousOverview.decisions.assistedOutreach.eligible,
        });
        const nextEligibility = JSON.stringify({
          internalSignals: nextOverview.decisions.internalSignals.eligible,
          supplierDrafts: nextOverview.decisions.supplierDrafts.eligible,
          buyerDrafts: nextOverview.decisions.buyerDrafts.eligible,
          assistedOutreach: nextOverview.decisions.assistedOutreach.eligible,
        });

        if (previousEligibility !== nextEligibility) {
          await txRepository.createReadinessEvent({
            automationReadinessPolicyId: updated.id,
            actionType: 'SEND_ELIGIBILITY_CHANGED',
            previousGlobalMode: updated.globalMode,
            newGlobalMode: updated.globalMode,
            actorType: actor.actorType,
            actorIdentifier: actor.actorIdentifier,
            note: 'Automation eligibility changed under the current readiness thresholds.',
            metadata: {
              previousEligibility: JSON.parse(previousEligibility),
              nextEligibility: JSON.parse(nextEligibility),
            },
          });
        }

        return nextOverview;
      });
    },

    async recordFeedback(
      input: OperatorValidationFeedbackCreateInput,
    ): Promise<OperatorValidationFeedbackRecord> {
      return repository.transaction((txRepository) =>
        recordOperatorValidationFeedbackWithRepository(txRepository, input),
      );
    },

    async listReadinessEvents(scopeName = DEFAULT_SCOPE_NAME) {
      await this.getReadinessPolicy(scopeName);
      return repository.listReadinessEvents(scopeName);
    },

    async getEvaluationMetrics(input?: {
      scopeName?: string;
      days?: number;
    }): Promise<AutomationEvaluationMetrics> {
      const windowEnd = dependencies.now();
      const days = input?.days ?? 30;
      const windowStart = new Date(
        windowEnd.getTime() - days * 24 * 60 * 60 * 1000,
      );

      const [offers, workflowItems, buyDecisions, drafts, feedbacks] =
        await Promise.all([
          repository.listOffersInWindow(windowStart, windowEnd),
          repository.listWorkflowItemsInWindow(windowStart, windowEnd),
          repository.listBuyDecisionsInWindow(windowStart, windowEnd),
          repository.listTradeDraftsInWindow(windowStart, windowEnd),
          repository.listFeedbackInWindow(windowStart, windowEnd),
        ]);

      const extractionFeedbacks = feedbacks.filter(
        (feedback) => feedback.feedbackType === 'EXTRACTION',
      );
      const supplierFeedbacks = feedbacks.filter(
        (feedback) => feedback.feedbackType === 'SUPPLIER_RESOLUTION',
      );
      const signalFeedbacks = feedbacks.filter(
        (feedback) =>
          feedback.feedbackType === 'SIGNAL' ||
          feedback.feedbackType === 'DEAL',
      );
      const draftFeedbacks = feedbacks.filter(
        (feedback) => feedback.feedbackType === 'DRAFT',
      );
      const draftMetrics = computeDraftPassRate(drafts, feedbacks);
      const falsePositiveCount = feedbacks.filter((feedback) =>
        ['INCORRECT', 'NOT_USEFUL', 'POLICY_ISSUE'].includes(feedback.verdict),
      ).length;
      const falseConfidenceCount = feedbacks.filter((feedback) => {
        const score = feedbackScore(feedback.feedbackType, feedback.verdict);
        if (score !== 0) {
          return false;
        }

        const confidence =
          feedback.feedbackType === 'SUPPLIER_RESOLUTION'
            ? (feedback.emailDerivedOffer?.entityResolutionConfidence ?? null)
            : (feedback.emailDerivedOffer?.fieldConfidence ?? null);

        return confidenceBucket(confidence) === 'HIGH';
      }).length;

      const confidenceBucketPerformance: AutomationEvaluationMetrics['confidenceBucketPerformance'] =
        {
          HIGH: { sampleCount: 0, scorePct: null },
          MEDIUM: { sampleCount: 0, scorePct: null },
          LOW: { sampleCount: 0, scorePct: null },
        };
      for (const bucket of ['HIGH', 'MEDIUM', 'LOW'] as const) {
        const bucketFeedbacks = feedbacks.filter((feedback) => {
          const confidence =
            feedback.feedbackType === 'SUPPLIER_RESOLUTION'
              ? (feedback.emailDerivedOffer?.entityResolutionConfidence ?? null)
              : (feedback.emailDerivedOffer?.fieldConfidence ?? null);
          return confidenceBucket(confidence) === bucket;
        });
        confidenceBucketPerformance[bucket] = {
          sampleCount: bucketFeedbacks.length,
          scorePct: scoreAverage(bucketFeedbacks),
        };
      }

      const metrics: AutomationEvaluationMetrics = {
        windowStart,
        windowEnd,
        totalStagedOffers: offers.length,
        totalReviewedOffers: workflowItems.length,
        extractionFeedbackCount: extractionFeedbacks.length,
        extractionPrecisionPct: scoreAverage(extractionFeedbacks),
        supplierResolutionFeedbackCount: supplierFeedbacks.length,
        supplierResolutionPrecisionPct: scoreAverage(supplierFeedbacks),
        signalFeedbackCount: signalFeedbacks.length,
        signalAcceptancePct: scoreAverage(signalFeedbacks),
        draftFeedbackCount: draftFeedbacks.length,
        draftPolicyPassPct: draftMetrics.draftPolicyPassPct,
        draftHumanAcceptancePct: draftMetrics.draftHumanAcceptancePct,
        workflowToBuyApprovalConversionPct:
          workflowItems.length > 0
            ? round(
                buyDecisions.filter(
                  (decision) => decision.approvalStatus === 'APPROVED',
                ).length / workflowItems.length,
                6,
              )
            : null,
        dealDraftRejectionRatePct: draftMetrics.dealDraftRejectionRatePct,
        aiAssistedReviewBurdenRatePct:
          workflowItems.length > 0
            ? round(
                workflowItems.filter((item) => item.aiAssisted).length /
                  workflowItems.length,
                6,
              )
            : null,
        unresolvedSupplierRatePct:
          workflowItems.length > 0
            ? round(
                workflowItems.filter((item) => item.hasUnresolvedSupplier)
                  .length / workflowItems.length,
                6,
              )
            : null,
        falsePositiveCount,
        falseConfidenceCount,
        confidenceBucketPerformance,
        readinessRecommendation: 'monitor',
      };

      return metrics;
    },

    async getReadinessOverview(input?: {
      scopeName?: string;
      days?: number;
    }): Promise<AutomationReadinessOverview> {
      const scopeName = normalizeString(input?.scopeName) ?? DEFAULT_SCOPE_NAME;
      const [policy, evaluation] = await Promise.all([
        this.getReadinessPolicy(scopeName),
        this.getEvaluationMetrics(input),
      ]);

      const minimumSampleSize = policy.minimumSampleSize ?? null;
      const decisions: AutomationReadinessOverview['decisions'] = {
        internalSignals: buildGateDecision({
          policy,
          evaluation,
          modeAllowed:
            policy.globalMode !== 'FULLY_BLOCKED' &&
            policy.globalMode !== 'OBSERVE_ONLY',
          featureAllowed: policy.allowInternalSignals,
          requiresSignalRate: true,
          requiresDraftRate: false,
          blockModeReason:
            'policy mode is observe-only or fully blocked for internal signals',
          minimumSampleSize,
        }),
        supplierDrafts: buildGateDecision({
          policy,
          evaluation,
          modeAllowed:
            policy.globalMode === 'DRAFTS_ONLY' ||
            policy.globalMode === 'ASSISTED_OUTREACH',
          featureAllowed:
            policy.allowDraftGeneration &&
            policy.allowSupplierDraftApprovalFlow,
          requiresSignalRate: true,
          requiresDraftRate: true,
          blockModeReason:
            'policy mode is below drafts-only for supplier outreach drafts',
          minimumSampleSize,
        }),
        buyerDrafts: buildGateDecision({
          policy,
          evaluation,
          modeAllowed:
            policy.globalMode === 'DRAFTS_ONLY' ||
            policy.globalMode === 'ASSISTED_OUTREACH',
          featureAllowed:
            policy.allowDraftGeneration && policy.allowBuyerDraftApprovalFlow,
          requiresSignalRate: true,
          requiresDraftRate: true,
          blockModeReason:
            'policy mode is below drafts-only for buyer outreach drafts',
          minimumSampleSize,
        }),
        assistedOutreach: buildGateDecision({
          policy,
          evaluation,
          modeAllowed: policy.globalMode === 'ASSISTED_OUTREACH',
          featureAllowed:
            policy.allowDraftGeneration &&
            policy.allowSupplierDraftApprovalFlow &&
            policy.allowBuyerDraftApprovalFlow,
          requiresSignalRate: true,
          requiresDraftRate: true,
          blockModeReason: 'policy mode is below assisted outreach',
          additionalBlocks: policy.requireHumanApprovalBeforeSend
            ? [
                'human approval remains required before any outreach progression',
              ]
            : [],
          minimumSampleSize,
        }),
        actualSend: buildGateDecision({
          policy,
          evaluation,
          modeAllowed: false,
          featureAllowed: false,
          requiresSignalRate: true,
          requiresDraftRate: true,
          blockModeReason:
            'live autonomous sending remains blocked in this implementation pass',
          additionalBlocks: [
            policy.allowActualSend
              ? 'allowActualSend is force-blocked until a future implementation pass'
              : 'allowActualSend is disabled by readiness policy',
          ],
          minimumSampleSize,
        }),
      };

      const recommendedAction = deriveRecommendation(decisions);
      evaluation.readinessRecommendation = recommendedAction;

      return {
        policy,
        evaluation,
        decisions,
        recommendedAction,
      };
    },

    async getOfferFeedbackSummariesForOfferIds(
      emailDerivedOfferIds: string[],
    ): Promise<Record<string, OfferFeedbackSummary>> {
      if (emailDerivedOfferIds.length === 0) {
        return {};
      }

      const feedbacks = await repository.listFeedbackByOfferIds(
        Array.from(new Set(emailDerivedOfferIds)),
      );
      const result: Record<string, OfferFeedbackSummary> = {};

      for (const offerId of emailDerivedOfferIds) {
        const offerFeedbacks = feedbacks.filter(
          (feedback) => feedback.emailDerivedOfferId === offerId,
        );
        result[offerId] = {
          hasFeedback: offerFeedbacks.length > 0,
          extractionVerdict: latestVerdict(offerFeedbacks, 'EXTRACTION'),
          supplierResolutionVerdict: latestVerdict(
            offerFeedbacks,
            'SUPPLIER_RESOLUTION',
          ),
          signalVerdict: latestVerdict(offerFeedbacks, 'SIGNAL'),
          feedbackCount: offerFeedbacks.length,
        };
      }

      return result;
    },

    async getTradeFeedbackSummariesForTradeOpportunityIds(
      tradeOpportunityIds: string[],
    ): Promise<Record<string, TradeFeedbackSummary>> {
      if (tradeOpportunityIds.length === 0) {
        return {};
      }

      const feedbacks = await repository.listFeedbackByTradeOpportunityIds(
        Array.from(new Set(tradeOpportunityIds)),
      );
      const result: Record<string, TradeFeedbackSummary> = {};

      for (const tradeOpportunityId of tradeOpportunityIds) {
        const tradeFeedbacks = feedbacks.filter(
          (feedback) => feedback.tradeOpportunityId === tradeOpportunityId,
        );
        result[tradeOpportunityId] = {
          hasFeedback: tradeFeedbacks.length > 0,
          dealVerdict: latestVerdict(tradeFeedbacks, 'DEAL'),
          latestDraftVerdict: latestVerdict(tradeFeedbacks, 'DRAFT'),
          draftPolicyIssueCount: tradeFeedbacks.filter(
            (feedback) =>
              feedback.feedbackType === 'DRAFT' &&
              feedback.verdict === 'POLICY_ISSUE',
          ).length,
          draftSafetyPassCount: tradeFeedbacks.filter(
            (feedback) =>
              feedback.feedbackType === 'DRAFT' && feedback.verdict === 'SAFE',
          ).length,
          feedbackCount: tradeFeedbacks.length,
        };
      }

      return result;
    },
  };
}

export const automationService = createAutomationService();
