import { Prisma } from '@prisma/client';

import { db } from '../lib/db';
import { logger } from '../lib/logger';

const LATEST_LIMIT = 8;
const TOP_LIMIT = 6;
const AGGREGATE_SAMPLE_LIMIT = 500;
const OPEN_WORKFLOW_STATUSES = ['NEW', 'IN_REVIEW', 'NEEDS_INFO'] as const;
const MISSING_FIELD_REASONS = new Set([
  'missing_supplier',
  'unresolved_supplier',
  'missing_product',
  'weak_product_match',
  'product_creation_requires_review',
  'missing_price',
  'missing_currency',
  'promotion_threshold_missing_or_weak_fields',
]);

type WindowKey = 'last24h' | 'last7d';

type CountByName = {
  name: string;
  count: number;
};

type LatestInboundEmail = {
  id: string;
  fromEmail: string;
  subject: string | null;
  processingStatus: string;
  triageStatus: string | null;
  reviewReason: string | null;
  receivedAt: Date | null;
  createdAt: Date;
};

type LatestSupplierPriceItem = {
  id: string;
  rawProductName: string;
  unitPrice: unknown;
  currencyCode: string;
  createdAt: Date;
  supplier: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
};

type LatestCommercialIntelItem = {
  id: string;
  itemType: string;
  status: string;
  confidence: string;
  productText: string | null;
  supplierName: string | null;
  customerName: string | null;
  evidenceText: string;
  createdAt: Date;
};

type LatestOpportunity = {
  id: string;
  type: string;
  status: string;
  title: string;
  score: number;
  createdAt: Date;
  updatedAt: Date;
  product: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
};

type LatestAiAssistedItem = {
  id: string;
  kind: 'EMAIL_DERIVED_OFFER' | 'COMMERCIAL_INTEL';
  label: string;
  status: string;
  confidence: string | null;
  createdAt: Date;
};

type PipelineWindowSummary = {
  label: string;
  since: Date;
  emailIntake: {
    inboundEmailsReceived: number;
    inboundEmailsIgnored: number;
    inboundEmailsRejected: number;
    inboundEmailsFailed: number;
    inboundEmailsReviewRequired: number;
    latestInboundEmails: LatestInboundEmail[];
  };
  documentStaging: {
    inboundEmailDocumentsCreated: number;
    extractionRunsCreated: number;
    emailDerivedOffersCreated: number;
    autoPromotedOffers: number;
    reviewRequiredOffers: number;
    rejectedOffers: number;
  };
  reviewWorkflow: {
    openReviewWorkflowItems: number;
    approvedToBuyCount: number;
    rejectedWorkflowCount: number;
    orderedWorkflowCount: number;
    topReviewReasons: CountByName[];
  };
  supplierPriceIntelligence: {
    supplierPriceItemsCreated: number;
    supplierPriceItemsFromEmailApprovedOffersBestEffort: number;
    latestSupplierPriceItems: LatestSupplierPriceItem[];
  };
  commercialIntel: {
    commercialIntelItemsCreated: number;
    approvedCommercialIntelItems: number;
    commercialIntelNew: number;
    commercialIntelApproved: number;
    commercialIntelRejected: number;
    commercialIntelExpired: number;
    commercialIntelByType: CountByName[];
    commercialIntelByConfidence: CountByName[];
    latestCommercialIntelItems: LatestCommercialIntelItem[];
  };
  aiParserVisibility: {
    aiFallbackAttemptedBestEffort: number;
    aiFallbackUsedBestEffort: number;
    aiAssistedOfferCount: number;
    aiAssistedCommercialIntelCount: number;
    latestAiAssistedItems: LatestAiAssistedItem[];
  };
  opportunities: {
    openOpportunities: number;
    opportunitiesCreated: number;
    opportunitiesWithCommercialIntelContext: number;
    opportunitiesByType: CountByName[];
    latestOpportunities: LatestOpportunity[];
  };
  problems: {
    topReviewReasons: CountByName[];
    topMissingFieldReasons: CountByName[];
    latestFailedEmails: LatestInboundEmail[];
    latestEmailsWithNoDerivedOffers: LatestInboundEmail[];
    latestReviewRequiredButNoSupplierPriceItem: Array<{
      id: string;
      inboundEmailId: string | null;
      sourceReviewReason: string | null;
      latestNote: string | null;
      createdAt: Date;
      emailDerivedOffer: {
        id: string;
        rawProductText: string | null;
        supplierCandidate: string | null;
        priceCandidate: unknown;
        currencyCandidate: string | null;
        reviewReason: string | null;
      } | null;
    }>;
  };
};

export type PipelineDiagnosticsSummary = {
  generatedAt: Date;
  windows: Record<WindowKey, PipelineWindowSummary>;
};

type DiagnosticsRepository = {
  buildWindowSummary: (input: { label: string; since: Date }) => Promise<PipelineWindowSummary>;
};

function emptyWindowSummary(label: string, since: Date): PipelineWindowSummary {
  return {
    label,
    since,
    emailIntake: {
      inboundEmailsReceived: 0,
      inboundEmailsIgnored: 0,
      inboundEmailsRejected: 0,
      inboundEmailsFailed: 0,
      inboundEmailsReviewRequired: 0,
      latestInboundEmails: [],
    },
    documentStaging: {
      inboundEmailDocumentsCreated: 0,
      extractionRunsCreated: 0,
      emailDerivedOffersCreated: 0,
      autoPromotedOffers: 0,
      reviewRequiredOffers: 0,
      rejectedOffers: 0,
    },
    reviewWorkflow: {
      openReviewWorkflowItems: 0,
      approvedToBuyCount: 0,
      rejectedWorkflowCount: 0,
      orderedWorkflowCount: 0,
      topReviewReasons: [],
    },
    supplierPriceIntelligence: {
      supplierPriceItemsCreated: 0,
      supplierPriceItemsFromEmailApprovedOffersBestEffort: 0,
      latestSupplierPriceItems: [],
    },
    commercialIntel: {
      commercialIntelItemsCreated: 0,
      approvedCommercialIntelItems: 0,
      commercialIntelNew: 0,
      commercialIntelApproved: 0,
      commercialIntelRejected: 0,
      commercialIntelExpired: 0,
      commercialIntelByType: [],
      commercialIntelByConfidence: [],
      latestCommercialIntelItems: [],
    },
    aiParserVisibility: {
      aiFallbackAttemptedBestEffort: 0,
      aiFallbackUsedBestEffort: 0,
      aiAssistedOfferCount: 0,
      aiAssistedCommercialIntelCount: 0,
      latestAiAssistedItems: [],
    },
    opportunities: {
      openOpportunities: 0,
      opportunitiesCreated: 0,
      opportunitiesWithCommercialIntelContext: 0,
      opportunitiesByType: [],
      latestOpportunities: [],
    },
    problems: {
      topReviewReasons: [],
      topMissingFieldReasons: [],
      latestFailedEmails: [],
      latestEmailsWithNoDerivedOffers: [],
      latestReviewRequiredButNoSupplierPriceItem: [],
    },
  };
}

async function safeRead<T>(label: string, fallback: T, callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown diagnostics read error.';
    if (/table `public\.[^`]+` does not exist/i.test(message)) {
      return fallback;
    }

    logger.warn('Pipeline diagnostics metric unavailable', {
      metric: label,
      error: message,
    });
    return fallback;
  }
}

function countGroupValues<T extends string | null | undefined>(
  values: T[],
  fallbackName = 'unknown',
): CountByName[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const name = value?.trim() || fallbackName;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, TOP_LIMIT);
}

function isMissingFieldReason(reason: string): boolean {
  return MISSING_FIELD_REASONS.has(reason.trim().toLowerCase());
}

function createDiagnosticsRepository(client: typeof db = db): DiagnosticsRepository {
  async function countInboundEmails(
    since: Date,
    where: Prisma.InboundEmailWhereInput = {},
  ): Promise<number> {
    return client.inboundEmail.count({
      where: {
        createdAt: { gte: since },
        ...where,
      },
    });
  }

  async function countOffers(since: Date, where: Prisma.EmailDerivedOfferWhereInput = {}): Promise<number> {
    return client.emailDerivedOffer.count({
      where: {
        createdAt: { gte: since },
        ...where,
      },
    });
  }

  async function buildTopReviewReasons(since: Date): Promise<CountByName[]> {
    const [offerReasons, workflowReasons] = await Promise.all([
      client.emailDerivedOffer.findMany({
        where: {
          createdAt: { gte: since },
          reviewReason: { not: null },
        },
        select: { reviewReason: true },
        take: AGGREGATE_SAMPLE_LIMIT,
        orderBy: { createdAt: 'desc' },
      }),
      client.offerWorkflowItem.findMany({
        where: {
          createdAt: { gte: since },
          sourceReviewReason: { not: null },
        },
        select: { sourceReviewReason: true },
        take: AGGREGATE_SAMPLE_LIMIT,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return countGroupValues([
      ...offerReasons.map((item) => item.reviewReason),
      ...workflowReasons.map((item) => item.sourceReviewReason),
    ]);
  }

  async function buildWindowSummary({ label, since }: { label: string; since: Date }): Promise<PipelineWindowSummary> {
    const summary = emptyWindowSummary(label, since);

    const [
      inboundEmailsReceived,
      inboundEmailsIgnored,
      inboundEmailsRejected,
      inboundEmailsFailed,
      inboundEmailsReviewRequired,
      latestInboundEmails,
      inboundEmailDocumentsCreated,
      extractionRunsCreated,
      emailDerivedOffersCreated,
      autoPromotedOffers,
      reviewRequiredOffers,
      rejectedOffers,
      openReviewWorkflowItems,
      approvedToBuyCount,
      rejectedWorkflowCount,
      orderedWorkflowCount,
      topReviewReasons,
      supplierPriceItemsCreated,
      supplierPriceItemsFromEmailApprovedOffersBestEffort,
      latestSupplierPriceItems,
      commercialIntelItemsCreated,
      approvedCommercialIntelItems,
      commercialIntelNew,
      commercialIntelApproved,
      commercialIntelRejected,
      commercialIntelExpired,
      commercialIntelByType,
      commercialIntelByConfidence,
      latestCommercialIntelItems,
      aiFallbackAttemptedBestEffort,
      aiAssistedOfferCount,
      aiAssistedCommercialIntelCount,
      latestAiOffers,
      latestAiIntel,
      openOpportunities,
      opportunitiesCreated,
      opportunitiesWithCommercialIntelContext,
      opportunitiesByType,
      latestOpportunities,
      latestFailedEmails,
      latestEmailsWithNoDerivedOffers,
      latestReviewRequiredButNoSupplierPriceItem,
    ] = await Promise.all([
      safeRead('inboundEmailsReceived', 0, () => countInboundEmails(since)),
      safeRead('inboundEmailsIgnored', 0, () =>
        countInboundEmails(since, {
          OR: [
            { triageStatus: { startsWith: 'IGNORED' } },
            { reviewReason: { contains: 'ignored', mode: 'insensitive' } },
          ],
        }),
      ),
      safeRead('inboundEmailsRejected', 0, () =>
        countInboundEmails(since, { processingStatus: 'REJECTED' }),
      ),
      safeRead('inboundEmailsFailed', 0, () =>
        countInboundEmails(since, { processingStatus: 'FAILED' }),
      ),
      safeRead('inboundEmailsReviewRequired', 0, () =>
        countInboundEmails(since, { processingStatus: 'REVIEW_REQUIRED' }),
      ),
      safeRead('latestInboundEmails', [], () =>
        client.inboundEmail.findMany({
          where: { createdAt: { gte: since } },
          select: {
            id: true,
            fromEmail: true,
            subject: true,
            processingStatus: true,
            triageStatus: true,
            reviewReason: true,
            receivedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('inboundEmailDocumentsCreated', 0, () =>
        client.inboundEmailDocument.count({ where: { createdAt: { gte: since } } }),
      ),
      safeRead('extractionRunsCreated', 0, () =>
        client.emailExtractionRun.count({ where: { createdAt: { gte: since } } }),
      ),
      safeRead('emailDerivedOffersCreated', 0, () => countOffers(since)),
      safeRead('autoPromotedOffers', 0, () => countOffers(since, { status: 'AUTO_PROMOTED' })),
      safeRead('reviewRequiredOffers', 0, () => countOffers(since, { status: 'REVIEW_REQUIRED' })),
      safeRead('rejectedOffers', 0, () => countOffers(since, { status: 'REJECTED' })),
      safeRead('openReviewWorkflowItems', 0, () =>
        client.offerWorkflowItem.count({
          where: {
            createdAt: { gte: since },
            status: { in: [...OPEN_WORKFLOW_STATUSES] },
          },
        }),
      ),
      safeRead('approvedToBuyCount', 0, () =>
        client.offerWorkflowItem.count({
          where: { updatedAt: { gte: since }, status: 'APPROVED_TO_BUY' },
        }),
      ),
      safeRead('rejectedWorkflowCount', 0, () =>
        client.offerWorkflowItem.count({
          where: { updatedAt: { gte: since }, status: 'REJECTED' },
        }),
      ),
      safeRead('orderedWorkflowCount', 0, () =>
        client.offerWorkflowItem.count({
          where: { updatedAt: { gte: since }, status: 'ORDERED' },
        }),
      ),
      safeRead('topReviewReasons', [], () => buildTopReviewReasons(since)),
      safeRead('supplierPriceItemsCreated', 0, () =>
        client.supplierPriceItem.count({ where: { createdAt: { gte: since } } }),
      ),
      safeRead('supplierPriceItemsFromEmailApprovedOffersBestEffort', 0, () =>
        client.supplierPriceItem.count({
          where: {
            createdAt: { gte: since },
            supplierPriceList: {
              sourceInboundEmailId: { not: null },
              fileName: { startsWith: 'reviewed-email-offer-' },
            },
          },
        }),
      ),
      safeRead('latestSupplierPriceItems', [], () =>
        client.supplierPriceItem.findMany({
          where: { createdAt: { gte: since } },
          select: {
            id: true,
            rawProductName: true,
            unitPrice: true,
            currencyCode: true,
            createdAt: true,
            supplier: { select: { id: true, name: true } },
            product: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('commercialIntelItemsCreated', 0, () =>
        client.commercialIntelItem.count({ where: { createdAt: { gte: since } } }),
      ),
      safeRead('approvedCommercialIntelItems', 0, () =>
        client.commercialIntelItem.count({
          where: {
            status: 'APPROVED',
            updatedAt: { gte: since },
            OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
          },
        }),
      ),
      safeRead('commercialIntelNew', 0, () =>
        client.commercialIntelItem.count({ where: { createdAt: { gte: since }, status: 'NEW' } }),
      ),
      safeRead('commercialIntelApproved', 0, () =>
        client.commercialIntelItem.count({ where: { updatedAt: { gte: since }, status: 'APPROVED' } }),
      ),
      safeRead('commercialIntelRejected', 0, () =>
        client.commercialIntelItem.count({ where: { updatedAt: { gte: since }, status: 'REJECTED' } }),
      ),
      safeRead('commercialIntelExpired', 0, () =>
        client.commercialIntelItem.count({ where: { updatedAt: { gte: since }, status: 'EXPIRED' } }),
      ),
      safeRead('commercialIntelByType', [], () =>
        client.commercialIntelItem.findMany({
          where: { createdAt: { gte: since } },
          select: { itemType: true },
          orderBy: { createdAt: 'desc' },
          take: AGGREGATE_SAMPLE_LIMIT,
        }).then((items) => countGroupValues(items.map((item) => item.itemType))),
      ),
      safeRead('commercialIntelByConfidence', [], () =>
        client.commercialIntelItem.findMany({
          where: { createdAt: { gte: since } },
          select: { confidence: true },
          orderBy: { createdAt: 'desc' },
          take: AGGREGATE_SAMPLE_LIMIT,
        }).then((items) => countGroupValues(items.map((item) => item.confidence))),
      ),
      safeRead('latestCommercialIntelItems', [], () =>
        client.commercialIntelItem.findMany({
          where: { createdAt: { gte: since } },
          select: {
            id: true,
            itemType: true,
            status: true,
            confidence: true,
            productText: true,
            supplierName: true,
            customerName: true,
            evidenceText: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('aiFallbackAttemptedBestEffort', 0, () =>
        client.emailExtractionRun.count({
          where: { createdAt: { gte: since }, method: 'AI_FALLBACK' },
        }),
      ),
      safeRead('aiAssistedOfferCount', 0, () =>
        client.emailDerivedOffer.count({
          where: { createdAt: { gte: since }, aiAssisted: true },
        }),
      ),
      safeRead('aiAssistedCommercialIntelCount', 0, () =>
        client.commercialIntelItem.count({
          where: { createdAt: { gte: since }, aiAssisted: true },
        }),
      ),
      safeRead('latestAiOffers', [], () =>
        client.emailDerivedOffer.findMany({
          where: { createdAt: { gte: since }, aiAssisted: true },
          select: {
            id: true,
            status: true,
            rawProductText: true,
            supplierCandidate: true,
            reviewReason: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('latestAiIntel', [], () =>
        client.commercialIntelItem.findMany({
          where: { createdAt: { gte: since }, aiAssisted: true },
          select: {
            id: true,
            itemType: true,
            status: true,
            confidence: true,
            productText: true,
            supplierName: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('openOpportunities', 0, () =>
        client.opportunity.count({ where: { status: 'OPEN' } }),
      ),
      safeRead('opportunitiesCreated', 0, () =>
        client.opportunity.count({ where: { createdAt: { gte: since } } }),
      ),
      safeRead('opportunitiesWithCommercialIntelContext', 0, () =>
        client.opportunity.findMany({
          where: { createdAt: { gte: since } },
          select: { metadata: true },
          orderBy: { createdAt: 'desc' },
          take: AGGREGATE_SAMPLE_LIMIT,
        }).then((items) =>
          items.filter((item) => {
            const metadata = item.metadata;
            return Boolean(
              metadata &&
                typeof metadata === 'object' &&
                !Array.isArray(metadata) &&
                'commercialIntelContext' in metadata,
            );
          }).length,
        ),
      ),
      safeRead('opportunitiesByType', [], () =>
        client.opportunity.findMany({
          where: { createdAt: { gte: since } },
          select: { type: true },
          orderBy: { createdAt: 'desc' },
          take: AGGREGATE_SAMPLE_LIMIT,
        }).then((items) => countGroupValues(items.map((item) => item.type))),
      ),
      safeRead('latestOpportunities', [], () =>
        client.opportunity.findMany({
          where: { createdAt: { gte: since } },
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            score: true,
            createdAt: true,
            updatedAt: true,
            product: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('latestFailedEmails', [], () =>
        client.inboundEmail.findMany({
          where: { createdAt: { gte: since }, processingStatus: 'FAILED' },
          select: {
            id: true,
            fromEmail: true,
            subject: true,
            processingStatus: true,
            triageStatus: true,
            reviewReason: true,
            receivedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('latestEmailsWithNoDerivedOffers', [], () =>
        client.inboundEmail.findMany({
          where: {
            createdAt: { gte: since },
            processingStatus: { not: 'REJECTED' },
            derivedOffers: { none: {} },
          },
          select: {
            id: true,
            fromEmail: true,
            subject: true,
            processingStatus: true,
            triageStatus: true,
            reviewReason: true,
            receivedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
      safeRead('latestReviewRequiredButNoSupplierPriceItem', [], () =>
        client.offerWorkflowItem.findMany({
          where: {
            createdAt: { gte: since },
            status: { in: [...OPEN_WORKFLOW_STATUSES] },
            emailDerivedOffer: { status: 'REVIEW_REQUIRED' },
          },
          select: {
            id: true,
            inboundEmailId: true,
            sourceReviewReason: true,
            latestNote: true,
            createdAt: true,
            emailDerivedOffer: {
              select: {
                id: true,
                rawProductText: true,
                supplierCandidate: true,
                priceCandidate: true,
                currencyCandidate: true,
                reviewReason: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: LATEST_LIMIT,
        }),
      ),
    ]);

    const latestAiAssistedItems = [
      ...latestAiOffers.map((item): LatestAiAssistedItem => ({
        id: item.id,
        kind: 'EMAIL_DERIVED_OFFER',
        label: [item.rawProductText, item.supplierCandidate].filter(Boolean).join(' | ') || 'AI-assisted offer',
        status: item.status,
        confidence: item.reviewReason,
        createdAt: item.createdAt,
      })),
      ...latestAiIntel.map((item): LatestAiAssistedItem => ({
        id: item.id,
        kind: 'COMMERCIAL_INTEL',
        label: [item.itemType, item.productText, item.supplierName].filter(Boolean).join(' | '),
        status: item.status,
        confidence: item.confidence,
        createdAt: item.createdAt,
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, LATEST_LIMIT);

    summary.emailIntake = {
      inboundEmailsReceived,
      inboundEmailsIgnored,
      inboundEmailsRejected,
      inboundEmailsFailed,
      inboundEmailsReviewRequired,
      latestInboundEmails,
    };
    summary.documentStaging = {
      inboundEmailDocumentsCreated,
      extractionRunsCreated,
      emailDerivedOffersCreated,
      autoPromotedOffers,
      reviewRequiredOffers,
      rejectedOffers,
    };
    summary.reviewWorkflow = {
      openReviewWorkflowItems,
      approvedToBuyCount,
      rejectedWorkflowCount,
      orderedWorkflowCount,
      topReviewReasons,
    };
    summary.supplierPriceIntelligence = {
      supplierPriceItemsCreated,
      supplierPriceItemsFromEmailApprovedOffersBestEffort,
      latestSupplierPriceItems,
    };
    summary.commercialIntel = {
      commercialIntelItemsCreated,
      approvedCommercialIntelItems,
      commercialIntelNew,
      commercialIntelApproved,
      commercialIntelRejected,
      commercialIntelExpired,
      commercialIntelByType,
      commercialIntelByConfidence,
      latestCommercialIntelItems,
    };
    summary.aiParserVisibility = {
      aiFallbackAttemptedBestEffort,
      aiFallbackUsedBestEffort: aiAssistedOfferCount,
      aiAssistedOfferCount,
      aiAssistedCommercialIntelCount,
      latestAiAssistedItems,
    };
    summary.opportunities = {
      openOpportunities,
      opportunitiesCreated,
      opportunitiesWithCommercialIntelContext,
      opportunitiesByType,
      latestOpportunities,
    };
    summary.problems = {
      topReviewReasons,
      topMissingFieldReasons: topReviewReasons.filter((reason) => isMissingFieldReason(reason.name)),
      latestFailedEmails,
      latestEmailsWithNoDerivedOffers,
      latestReviewRequiredButNoSupplierPriceItem,
    };

    return summary;
  }

  return { buildWindowSummary };
}

export function createDiagnosticsService(overrides?: {
  repository?: DiagnosticsRepository;
  now?: () => Date;
}) {
  const repository = overrides?.repository ?? createDiagnosticsRepository();
  const now = overrides?.now ?? (() => new Date());

  return {
    async getPipelineSummary(): Promise<PipelineDiagnosticsSummary> {
      const generatedAt = now();
      const last24hSince = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);
      const last7dSince = new Date(generatedAt.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [last24h, last7d] = await Promise.all([
        repository.buildWindowSummary({ label: 'Last 24 hours', since: last24hSince }),
        repository.buildWindowSummary({ label: 'Last 7 days', since: last7dSince }),
      ]);

      return {
        generatedAt,
        windows: {
          last24h,
          last7d,
        },
      };
    },
  };
}

export const diagnosticsService = createDiagnosticsService();
