import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPilotDemoSmokeSummary } from './pilotDemoSmoke';

test('pilot demo smoke summary contains safe routes and no connection string', () => {
  const lines = buildPilotDemoSmokeSummary({
    database: {
      safe: true,
      classification: 'local',
      reason: 'safe local disposable database',
      host: 'localhost',
      databaseName: 'ambe_demo',
    },
    verification: {
      pendingWorkflowId: 'demo-pilot-workflow-amlodipine',
      completedWorkflowId: 'demo-pilot-workflow-cetirizine',
      buyDecisionId: 'demo-pilot-buy-decision-cetirizine',
      buyExecutionId: 'demo-pilot-buy-execution-cetirizine',
      tradeOpportunityId: 'demo-pilot-trade-opportunity-cetirizine',
      routes: {
        pendingReview: '/dashboard/review/demo-pilot-workflow-amlodipine',
        completedReview: '/dashboard/review/demo-pilot-workflow-cetirizine',
        deals: '/dashboard/deals',
        setup: '/dashboard/setup',
      },
    },
  });

  const output = lines.join('\n');

  assert.match(output, /AMBE pilot demo smoke summary/);
  assert.match(output, /Open pending review/);
  assert.match(output, /External services called: false/);
  assert.doesNotMatch(output, /postgresql:\/\//);
  assert.doesNotMatch(output, /secret/i);
});
