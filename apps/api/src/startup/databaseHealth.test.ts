import assert from 'node:assert/strict';
import test from 'node:test';

import { env } from '../config/env';
import { verifyDatabaseReadiness } from './databaseHealth';

function createHealthyClient() {
  const findFirst = async () => null;

  return {
    inboundEmail: { findFirst },
    emailDerivedOffer: { findFirst },
    offerWorkflowItem: { findFirst },
    supplier: { findFirst },
    supplierQualification: { findFirst },
    buyDecision: { findFirst },
    buyExecution: { findFirst },
    tradeOpportunity: { findFirst },
    tradeMessageDraft: { findFirst },
    automationReadinessPolicy: { findFirst },
    operatorValidationFeedback: { findFirst },
    offerCorrection: { findFirst },
    sourceReliabilityProfile: { findFirst },
  };
}

function createMissingTableError(tableName: string) {
  const error = new Error(
    `The table \`public.${tableName}\` does not exist in the current database.`,
  ) as Error & {
    code?: string;
    meta?: Record<string, unknown>;
  };

  error.code = 'P2021';
  error.meta = {
    modelName: tableName,
    table: `public.${tableName}`,
  };

  return error;
}

test('database readiness fails fast when production internal API auth is missing', async (t) => {
  const previousNodeEnv = env.nodeEnv;
  const previousInternalApiKey = env.internalApiKey;
  const previousInternalAdminApiKey = env.internalAdminApiKey;
  env.nodeEnv = 'production';
  env.internalApiKey = '';
  env.internalAdminApiKey = '';

  t.after(() => {
    env.nodeEnv = previousNodeEnv;
    env.internalApiKey = previousInternalApiKey;
    env.internalAdminApiKey = previousInternalAdminApiKey;
  });

  await assert.rejects(
    verifyDatabaseReadiness(createHealthyClient() as never),
    /INTERNAL_API_KEY or INTERNAL_ADMIN_API_KEY must be configured in production/i,
  );
});

test('database readiness fails on missing required tables and tolerates optional learning tables', async () => {
  const warnings: Array<Record<string, unknown> | undefined> = [];
  const client = createHealthyClient();
  client.sourceReliabilityProfile.findFirst = async () => {
    throw createMissingTableError('SourceReliabilityProfile');
  };

  await verifyDatabaseReadiness(client as never, {
    info: () => undefined,
    warn: (_message, meta) => {
      warnings.push(meta);
    },
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.tableName, 'SourceReliabilityProfile');

  client.buyExecution.findFirst = async () => {
    throw createMissingTableError('BuyExecution');
  };

  await assert.rejects(
    verifyDatabaseReadiness(client as never, {
      info: () => undefined,
      warn: () => undefined,
    }),
    /Database readiness check failed for BuyExecution/i,
  );
});

test('database readiness still falls back to message matching for optional missing tables', async () => {
  const warnings: Array<Record<string, unknown> | undefined> = [];
  const client = createHealthyClient();
  client.offerCorrection.findFirst = async () => {
    throw new Error(
      'The table `public.OfferCorrection` does not exist in the current database.',
    );
  };

  await verifyDatabaseReadiness(client as never, {
    info: () => undefined,
    warn: (_message, meta) => {
      warnings.push(meta);
    },
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.tableName, 'OfferCorrection');
});
