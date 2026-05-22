import type { PrismaClient } from '@prisma/client';

import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';

type HealthLogger = Pick<typeof logger, 'info' | 'warn'>;

type StartupHealthClient = Pick<
  PrismaClient,
  | 'inboundEmail'
  | 'emailDerivedOffer'
  | 'offerWorkflowItem'
  | 'supplier'
  | 'supplierQualification'
  | 'buyDecision'
  | 'buyExecution'
  | 'tradeOpportunity'
  | 'tradeMessageDraft'
  | 'automationReadinessPolicy'
  | 'operatorValidationFeedback'
  | 'offerCorrection'
  | 'sourceReliabilityProfile'
>;

type PrismaKnownRequestErrorLike = Error & {
  code?: string;
  meta?: Record<string, unknown>;
};

function isPrismaKnownRequestErrorLike(
  error: unknown,
): error is PrismaKnownRequestErrorLike {
  return (
    error instanceof Error &&
    typeof (error as PrismaKnownRequestErrorLike).code === 'string'
  );
}

function matchesTableName(value: unknown, tableName: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    value === tableName ||
    value === `public.${tableName}` ||
    value.includes(`public.${tableName}`)
  );
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (isPrismaKnownRequestErrorLike(error) && error.code === 'P2021') {
    return (
      matchesTableName(error.meta?.table, tableName) ||
      matchesTableName(error.meta?.modelName, tableName)
    );
  }

  return (
    error instanceof Error && error.message.includes(`public.${tableName}`)
  );
}

async function verifyTable(
  label: string,
  check: () => Promise<unknown>,
  options: {
    optional?: boolean;
    comment?: string;
    logger: HealthLogger;
  },
): Promise<void> {
  try {
    await check();
  } catch (error) {
    if (options.optional && isMissingTableError(error, label)) {
      options.logger.warn(
        'Optional startup schema check skipped because table is missing',
        {
          tableName: label,
          comment: options.comment ?? null,
        },
      );
      return;
    }

    throw new Error(
      `Database readiness check failed for ${label}.${error instanceof Error ? ` ${error.message}` : ''}`.trim(),
    );
  }
}

export async function verifyDatabaseReadiness(
  client: StartupHealthClient = db as unknown as StartupHealthClient,
  healthLogger: HealthLogger = logger,
): Promise<void> {
  if (
    env.nodeEnv === 'production' &&
    !env.internalApiKey &&
    !env.internalAdminApiKey
  ) {
    throw new Error(
      'INTERNAL_API_KEY or INTERNAL_ADMIN_API_KEY must be configured in production.',
    );
  }

  await verifyTable(
    'InboundEmail',
    () => client.inboundEmail.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'EmailDerivedOffer',
    () => client.emailDerivedOffer.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'OfferWorkflowItem',
    () => client.offerWorkflowItem.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'Supplier',
    () => client.supplier.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'SupplierQualification',
    () => client.supplierQualification.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'BuyDecision',
    () => client.buyDecision.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'BuyExecution',
    () => client.buyExecution.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'TradeOpportunity',
    () => client.tradeOpportunity.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'TradeMessageDraft',
    () => client.tradeMessageDraft.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'AutomationReadinessPolicy',
    () => client.automationReadinessPolicy.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );
  await verifyTable(
    'OperatorValidationFeedback',
    () => client.operatorValidationFeedback.findFirst({ select: { id: true } }),
    { logger: healthLogger },
  );

  // These tables are intentionally backward-compatible. Corrections and source-learning
  // should degrade loudly but not block the core controlled-buying workflow if a rollout
  // is temporarily ahead of the database migration state.
  await verifyTable(
    'OfferCorrection',
    () => client.offerCorrection.findFirst({ select: { id: true } }),
    {
      optional: true,
      comment:
        'Correction history is optional for startup; core workflow remains available.',
      logger: healthLogger,
    },
  );
  await verifyTable(
    'SourceReliabilityProfile',
    () => client.sourceReliabilityProfile.findFirst({ select: { id: true } }),
    {
      optional: true,
      comment:
        'Source-learning hints are optional for startup; core workflow remains available.',
      logger: healthLogger,
    },
  );

  healthLogger.info('Database readiness checks passed');
}
