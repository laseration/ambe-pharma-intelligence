import type { LocalSmokeDatabaseSafety } from '../startup/localSmokeSafety';

import { PILOT_DEMO_MARKER } from '../fixtures/demo/pilotDemo';
import { db } from '../lib/db';
import {
  assertSafePilotDemoDatabase,
  seedPilotDemo,
} from './seedPilotDemo';
import { env } from '../config/env';

export type PilotDemoSmokeVerification = {
  pendingWorkflowId: string;
  completedWorkflowId: string;
  buyDecisionId: string;
  buyExecutionId: string;
  tradeOpportunityId: string;
  routes: {
    pendingReview: string;
    completedReview: string;
    deals: string;
    setup: string;
  };
};

async function requireRecord<T>(
  label: string,
  record: Promise<T | null>,
): Promise<T> {
  const resolved = await record;

  if (!resolved) {
    throw new Error(`Pilot demo smoke could not find ${label}.`);
  }

  return resolved;
}

export async function verifyPilotDemoSmokeRecords(input: {
  pendingWorkflowId: string;
  completedWorkflowId: string;
  buyDecisionId: string;
  buyExecutionId: string;
  tradeOpportunityId: string;
}): Promise<PilotDemoSmokeVerification> {
  await Promise.all([
    requireRecord(
      'pending review workflow',
      db.offerWorkflowItem.findUnique({
        where: { id: input.pendingWorkflowId },
      }),
    ),
    requireRecord(
      'completed review workflow',
      db.offerWorkflowItem.findUnique({
        where: { id: input.completedWorkflowId },
      }),
    ),
    requireRecord(
      'buy decision',
      db.buyDecision.findUnique({
        where: { id: input.buyDecisionId },
      }),
    ),
    requireRecord(
      'buy execution',
      db.buyExecution.findUnique({
        where: { id: input.buyExecutionId },
      }),
    ),
    requireRecord(
      'trade opportunity',
      db.tradeOpportunity.findUnique({
        where: { id: input.tradeOpportunityId },
      }),
    ),
  ]);

  return {
    ...input,
    routes: {
      pendingReview: `/dashboard/review/${input.pendingWorkflowId}`,
      completedReview: `/dashboard/review/${input.completedWorkflowId}`,
      deals: '/dashboard/deals',
      setup: '/dashboard/setup',
    },
  };
}

export function buildPilotDemoSmokeSummary(input: {
  database: LocalSmokeDatabaseSafety;
  verification: PilotDemoSmokeVerification;
}): string[] {
  return [
    'AMBE pilot demo smoke summary',
    `Marker: ${PILOT_DEMO_MARKER}`,
    `Database host: ${input.database.host ?? 'unknown'}`,
    `Database name: ${input.database.databaseName ?? 'unknown'}`,
    `Database classification: ${input.database.classification}`,
    `Pending review workflow: ${input.verification.pendingWorkflowId}`,
    `Completed review workflow: ${input.verification.completedWorkflowId}`,
    `Buy decision: ${input.verification.buyDecisionId}`,
    `Buy execution: ${input.verification.buyExecutionId}`,
    `Trade opportunity: ${input.verification.tradeOpportunityId}`,
    `Open pending review: ${input.verification.routes.pendingReview}`,
    `Open completed review: ${input.verification.routes.completedReview}`,
    `Open deals: ${input.verification.routes.deals}`,
    'External services called: false',
  ];
}

export async function runPilotDemoSmoke(): Promise<void> {
  const database = assertSafePilotDemoDatabase(env.databaseUrl);
  const seedResult = await seedPilotDemo();
  const verification = await verifyPilotDemoSmokeRecords(seedResult);

  for (const line of buildPilotDemoSmokeSummary({ database, verification })) {
    console.log(line);
  }
}

if (require.main === module) {
  runPilotDemoSmoke().catch(async (error) => {
    console.error(
      `FAIL: ${error instanceof Error ? error.message : 'Pilot demo smoke failed.'}`,
    );
    await db.$disconnect();
    process.exit(1);
  });
}
