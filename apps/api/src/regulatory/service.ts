import crypto from 'node:crypto';

import type {
  Prisma,
  RegulatoryAlertStatus,
  RegulatoryProductMatch,
  RegulatoryReviewStatus,
  RegulatorySeverity,
} from '@prisma/client';

import { db } from '../lib/db';
import { requireFound } from '../http/errors';
import { parseRegulatoryUpdate, REGULATORY_PARSER_VERSION } from './parser';
import { matchRegulatoryProductText, type RegulatoryMatchOutcome } from './matching';
import {
  buildRegulatoryAlertMessage,
  buildRegulatoryAlertTitle,
  buildRegulatorySuggestedAction,
} from './templates';

type DbClient = typeof db | Prisma.TransactionClient;

export type RegulatoryActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type RegulatoryUpdateInput = {
  sourceUrl: string;
  title: string;
  publishedAt?: Date | null;
  rawText: string;
  regulator?: string | null;
  category?: string | null;
  evidence?: unknown;
};

export type RegulatoryReviewQueueItem = Awaited<
  ReturnType<typeof listOpenRegulatoryReviewQueueItems>
>[number];

const OPEN_REGULATORY_REVIEW_STATUSES: RegulatoryReviewStatus[] = ['NEW', 'REVIEWING'];

function normalizeActor(actor?: RegulatoryActor): { actorType: string; actorIdentifier: string | null } {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function hashContent(input: RegulatoryUpdateInput): string {
  return crypto
    .createHash('sha256')
    .update([input.sourceUrl, input.title, input.publishedAt?.toISOString() ?? '', input.rawText].join('\n'))
    .digest('hex');
}

function asInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function getEvidenceSnippets(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return [];
  }

  const snippets = (evidence as { evidenceSnippets?: unknown }).evidenceSnippets;
  return Array.isArray(snippets)
    ? snippets.filter((snippet): snippet is string => typeof snippet === 'string' && snippet.trim().length > 0)
    : [];
}

function priorityFromSeverity(severity: RegulatorySeverity): RegulatorySeverity {
  return severity;
}

async function createActionLog(
  client: DbClient,
  input: {
    actionType:
      | 'CREATED'
      | 'MATCHED'
      | 'QUEUED_FOR_REVIEW'
      | 'STATUS_CHANGED'
      | 'NOTE_ADDED'
      | 'ACTIONED'
      | 'IGNORED'
      | 'FALSE_MATCH';
    regulatoryUpdateId?: string | null;
    regulatorySignalId?: string | null;
    regulatoryProductMatchId?: string | null;
    regulatoryAlertId?: string | null;
    regulatoryReviewItemId?: string | null;
    previousStatus?: string | null;
    newStatus?: string | null;
    actor?: RegulatoryActor;
    note?: string | null;
    metadata?: unknown;
  },
) {
  const actor = normalizeActor(input.actor);

  await client.regulatoryActionLog.create({
    data: {
      regulatoryUpdateId: input.regulatoryUpdateId ?? null,
      regulatorySignalId: input.regulatorySignalId ?? null,
      regulatoryProductMatchId: input.regulatoryProductMatchId ?? null,
      regulatoryAlertId: input.regulatoryAlertId ?? null,
      regulatoryReviewItemId: input.regulatoryReviewItemId ?? null,
      actionType: input.actionType,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      actorType: actor.actorType,
      actorIdentifier: actor.actorIdentifier,
      note: input.note?.trim() || null,
      metadata: asInputJson(input.metadata),
    },
  });
}

function buildProductMatchRepository(client: DbClient) {
  return {
    findProductByStoredCanonicalField: async (storedCanonicalField: string) =>
      client.product.findFirst({
        where: { normalizedName: storedCanonicalField },
      }),
    findAliasByRawName: async (aliasName: string) =>
      client.productAlias.findFirst({
        where: { aliasName },
        include: {
          product: true,
        },
      }),
    listAliasesForCanonicalComparison: async () =>
      client.productAlias.findMany({
        include: {
          product: true,
        },
      }),
    listProductsByBaseName: async (baseName: string) =>
      client.product.findMany({
        where: {
          OR: [{ baseName }, { normalizedName: baseName }],
        },
      }),
  };
}

async function createRegulatoryAlertForMatch(
  client: DbClient,
  match: RegulatoryProductMatch,
  matchOutcome: RegulatoryMatchOutcome,
) {
  const signal = await client.regulatorySignal.findUnique({
    where: { id: match.regulatorySignalId },
    include: {
      regulatoryUpdate: true,
      productMatches: {
        include: {
          product: true,
        },
      },
    },
  });
  const product = match.productId
    ? await client.product.findUnique({ where: { id: match.productId } })
    : null;

  if (!signal) {
    throw new Error('Regulatory signal not found.');
  }

  const suggestedAction = buildRegulatorySuggestedAction(signal.severity);
  const title = buildRegulatoryAlertTitle({
    eventType: signal.eventType,
    severity: signal.severity,
    productName: product?.name ?? matchOutcome.candidates.normalizedName,
  });
  const message = buildRegulatoryAlertMessage({
    title,
    sourceUrl: signal.regulatoryUpdate.sourceUrl,
    eventType: signal.eventType,
    severity: signal.severity,
    possibleAffectedProduct: product?.name ?? signal.affectedProductText,
    summary: signal.summary,
    suggestedAction,
    evidenceSnippets: getEvidenceSnippets(signal.evidence),
  });

  return client.regulatoryAlert.create({
    data: {
      regulatorySignalId: signal.id,
      regulatoryProductMatchId: match.id,
      productId: match.productId,
      status: 'NEW',
      title,
      message,
      suggestedAction,
      evidence: {
        matchReason: match.reason,
        matchConfidence: match.confidence,
        signalEvidence: signal.evidence as Prisma.InputJsonValue,
      },
    },
  });
}

async function createReviewItemForMatch(
  client: DbClient,
  input: {
    signalId: string;
    matchId?: string | null;
    productId?: string | null;
    severity: RegulatorySeverity;
    reason: string;
  },
) {
  return client.regulatoryReviewItem.create({
    data: {
      regulatorySignalId: input.signalId,
      regulatoryProductMatchId: input.matchId ?? null,
      productId: input.productId ?? null,
      status: 'NEW',
      priority: priorityFromSeverity(input.severity),
      reason: input.reason,
    },
  });
}

export function previewRegulatoryIngest(input: RegulatoryUpdateInput) {
  const parsed = parseRegulatoryUpdate(input);

  return {
    contentHash: hashContent(input),
    parserVersion: REGULATORY_PARSER_VERSION,
    parsed,
  };
}

export async function ingestRegulatoryUpdate(input: RegulatoryUpdateInput, actor?: RegulatoryActor) {
  const contentHash = hashContent(input);
  const update = await db.regulatoryUpdate.upsert({
    where: {
      sourceUrl: input.sourceUrl,
    },
    update: {
      title: input.title,
      publishedAt: input.publishedAt ?? null,
      rawText: input.rawText,
      regulator: input.regulator?.trim() || 'MHRA',
      category: input.category?.trim() || null,
      evidence: asInputJson(input.evidence),
      contentHash,
    },
    create: {
      sourceUrl: input.sourceUrl,
      title: input.title,
      publishedAt: input.publishedAt ?? null,
      rawText: input.rawText,
      regulator: input.regulator?.trim() || 'MHRA',
      category: input.category?.trim() || null,
      evidence: asInputJson(input.evidence),
      contentHash,
    },
  });

  await createActionLog(db, {
    regulatoryUpdateId: update.id,
    actionType: 'CREATED',
    newStatus: 'STORED',
    actor,
    metadata: {
      contentHash,
      sourceUrl: update.sourceUrl,
    },
  });

  return update;
}

export async function parseStoredRegulatoryUpdate(updateId: string, actor?: RegulatoryActor) {
  const update = requireFound(
    await db.regulatoryUpdate.findUnique({ where: { id: updateId } }),
    'Regulatory update not found.',
  );
  const parsed = parseRegulatoryUpdate(update);

  const signal = await db.regulatorySignal.create({
    data: {
      regulatoryUpdateId: update.id,
      eventType: parsed.eventType,
      severity: parsed.severity,
      summary: parsed.summary,
      affectedProductText: parsed.affectedProductText,
      activeSubstance: parsed.activeSubstance,
      manufacturer: parsed.manufacturer,
      licenceNumber: parsed.licenceNumber,
      batchNumber: parsed.batchNumber,
      parserVersion: REGULATORY_PARSER_VERSION,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
    },
  });

  await createActionLog(db, {
    regulatoryUpdateId: update.id,
    regulatorySignalId: signal.id,
    actionType: 'CREATED',
    newStatus: 'PARSED',
    actor,
    metadata: {
      parserVersion: REGULATORY_PARSER_VERSION,
      eventType: signal.eventType,
      severity: signal.severity,
    },
  });

  return signal;
}

export async function matchRegulatorySignal(signalId: string, actor?: RegulatoryActor) {
  const signal = requireFound(
    await db.regulatorySignal.findUnique({
      where: { id: signalId },
      include: {
        regulatoryUpdate: true,
      },
    }),
    'Regulatory signal not found.',
  );
  const productText = signal.affectedProductText?.trim();

  if (!productText) {
    const reviewItem = await createReviewItemForMatch(db, {
      signalId: signal.id,
      severity: signal.severity,
      reason: 'No affected product text was parsed. Requires compliance review.',
    });

    await createActionLog(db, {
      regulatorySignalId: signal.id,
      regulatoryReviewItemId: reviewItem.id,
      actionType: 'QUEUED_FOR_REVIEW',
      newStatus: reviewItem.status,
      actor,
      note: reviewItem.reason,
    });

    return {
      outcome: 'REVIEW_REQUIRED' as const,
      match: null,
      alert: null,
      reviewItem,
    };
  }

  const matchOutcome = await matchRegulatoryProductText(buildProductMatchRepository(db), productText);
  const match = await db.regulatoryProductMatch.create({
    data: {
      regulatorySignalId: signal.id,
      productId: matchOutcome.productId,
      status: matchOutcome.status,
      confidence: matchOutcome.confidence,
      reason: matchOutcome.reason,
      matchedFields: matchOutcome.matchedFields,
      evidence: matchOutcome.evidence,
    },
  });

  await createActionLog(db, {
    regulatorySignalId: signal.id,
    regulatoryProductMatchId: match.id,
    actionType: 'MATCHED',
    newStatus: match.status,
    actor,
    note: match.reason,
    metadata: matchOutcome.evidence,
  });

  if (matchOutcome.status === 'CONFIDENT' && match.productId && signal.confidence >= 70) {
    const alert = await createRegulatoryAlertForMatch(db, match, matchOutcome);

    await createActionLog(db, {
      regulatorySignalId: signal.id,
      regulatoryProductMatchId: match.id,
      regulatoryAlertId: alert.id,
      actionType: 'CREATED',
      newStatus: alert.status,
      actor,
      note: alert.suggestedAction,
    });

    return {
      outcome: 'ALERT_CREATED' as const,
      match,
      alert,
      reviewItem: null,
    };
  }

  const reviewItem = await createReviewItemForMatch(db, {
    signalId: signal.id,
    matchId: match.id,
    productId: match.productId,
    severity: signal.severity,
    reason:
      matchOutcome.status === 'CONFIDENT'
        ? 'Parser confidence is not strong enough for automatic alerting. Requires compliance review.'
        : matchOutcome.reason,
  });

  await createActionLog(db, {
    regulatorySignalId: signal.id,
    regulatoryProductMatchId: match.id,
    regulatoryReviewItemId: reviewItem.id,
    actionType: 'QUEUED_FOR_REVIEW',
    newStatus: reviewItem.status,
    actor,
    note: reviewItem.reason,
  });

  return {
    outcome: 'REVIEW_REQUIRED' as const,
    match,
    alert: null,
    reviewItem,
  };
}

export async function listRegulatoryUpdates() {
  return db.regulatoryUpdate.findMany({
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      _count: {
        select: {
          signals: true,
        },
      },
    },
  });
}

export async function getRegulatoryUpdate(updateId: string) {
  return db.regulatoryUpdate.findUnique({
    where: { id: updateId },
    include: {
      signals: {
        include: {
          productMatches: {
            include: {
              product: true,
            },
          },
          alerts: true,
          reviewItems: true,
        },
      },
      actionLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function listRegulatorySignals() {
  return db.regulatorySignal.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      regulatoryUpdate: true,
      productMatches: {
        include: {
          product: true,
        },
      },
      alerts: true,
      reviewItems: true,
    },
  });
}

export async function getRegulatorySignal(signalId: string) {
  return db.regulatorySignal.findUnique({
    where: { id: signalId },
    include: {
      regulatoryUpdate: true,
      productMatches: {
        include: {
          product: true,
        },
      },
      alerts: true,
      reviewItems: true,
      actionLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function listRegulatoryAlerts(filters?: { status?: RegulatoryAlertStatus }) {
  return db.regulatoryAlert.findMany({
    where: filters?.status ? { status: filters.status } : undefined,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      product: true,
      regulatorySignal: {
        include: {
          regulatoryUpdate: true,
        },
      },
    },
  });
}

export async function getRegulatoryAlert(alertId: string) {
  return db.regulatoryAlert.findUnique({
    where: { id: alertId },
    include: {
      product: true,
      regulatoryProductMatch: true,
      regulatorySignal: {
        include: {
          regulatoryUpdate: true,
        },
      },
      actionLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function previewRegulatoryAlertMessage(alertId: string) {
  const alert = requireFound(await getRegulatoryAlert(alertId), 'Regulatory alert not found.');

  return {
    alertId: alert.id,
    messageText: alert.message,
    suggestedAction: alert.suggestedAction,
    internalOnly: true,
  };
}

export async function updateRegulatoryAlertStatus(
  input: RegulatoryActor & {
    alertId: string;
    status: RegulatoryAlertStatus;
    note?: string | null;
  },
) {
  const existing = requireFound(await db.regulatoryAlert.findUnique({ where: { id: input.alertId } }), 'Regulatory alert not found.');
  const updated = await db.regulatoryAlert.update({
    where: { id: input.alertId },
    data: {
      status: input.status,
    },
  });
  const actionType =
    input.status === 'ACTIONED'
      ? 'ACTIONED'
      : input.status === 'IGNORED'
        ? 'IGNORED'
        : input.status === 'FALSE_MATCH'
          ? 'FALSE_MATCH'
          : 'STATUS_CHANGED';

  await createActionLog(db, {
    regulatorySignalId: updated.regulatorySignalId,
    regulatoryAlertId: updated.id,
    actionType,
    previousStatus: existing.status,
    newStatus: updated.status,
    actor: input,
    note: input.note,
  });

  return updated;
}

export async function listRegulatoryReviewItems(filters?: { status?: RegulatoryReviewStatus }) {
  return db.regulatoryReviewItem.findMany({
    where: filters?.status
      ? { status: filters.status }
      : {
          status: {
            in: OPEN_REGULATORY_REVIEW_STATUSES,
          },
        },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    include: {
      product: true,
      regulatoryProductMatch: true,
      regulatorySignal: {
        include: {
          regulatoryUpdate: true,
        },
      },
    },
  });
}

export async function getRegulatoryReviewItem(reviewItemId: string) {
  return db.regulatoryReviewItem.findUnique({
    where: { id: reviewItemId },
    include: {
      product: true,
      regulatoryProductMatch: true,
      regulatorySignal: {
        include: {
          regulatoryUpdate: true,
        },
      },
      actionLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function updateRegulatoryReviewItem(
  input: RegulatoryActor & {
    reviewItemId: string;
    status?: RegulatoryReviewStatus;
    note?: string | null;
    assigneeLabel?: string | null;
  },
) {
  const existing = requireFound(
    await db.regulatoryReviewItem.findUnique({ where: { id: input.reviewItemId } }),
    'Regulatory review item not found.',
  );
  const nextStatus = input.status ?? existing.status;
  const updated = await db.regulatoryReviewItem.update({
    where: { id: input.reviewItemId },
    data: {
      status: nextStatus,
      latestNote: input.note?.trim() || existing.latestNote,
      assigneeLabel: input.assigneeLabel === undefined ? existing.assigneeLabel : input.assigneeLabel,
      completedAt: ['ACTIONED', 'IGNORED', 'FALSE_MATCH'].includes(nextStatus) ? new Date() : null,
    },
  });
  const actionType =
    input.note && nextStatus === existing.status
      ? 'NOTE_ADDED'
      : nextStatus === 'ACTIONED'
        ? 'ACTIONED'
        : nextStatus === 'IGNORED'
          ? 'IGNORED'
          : nextStatus === 'FALSE_MATCH'
            ? 'FALSE_MATCH'
            : 'STATUS_CHANGED';

  await createActionLog(db, {
    regulatorySignalId: updated.regulatorySignalId,
    regulatoryProductMatchId: updated.regulatoryProductMatchId,
    regulatoryReviewItemId: updated.id,
    actionType,
    previousStatus: existing.status,
    newStatus: updated.status,
    actor: input,
    note: input.note,
    metadata: {
      assigneeLabel: updated.assigneeLabel,
    },
  });

  return updated;
}

export async function listOpenRegulatoryReviewQueueItems() {
  return db.regulatoryReviewItem.findMany({
    where: {
      status: {
        in: OPEN_REGULATORY_REVIEW_STATUSES,
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    include: {
      product: true,
      regulatoryProductMatch: true,
      regulatorySignal: {
        include: {
          regulatoryUpdate: true,
        },
      },
    },
  });
}
