import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiagnosticsService, type PipelineDiagnosticsSummary } from '../service';

function buildEmptyWindow(label: string, since: Date): PipelineDiagnosticsSummary['windows']['last24h'] {
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

test('pipeline diagnostics summary returns bounded empty-shape windows from repository fixtures', async () => {
  const calls: Array<{ label: string; since: Date }> = [];
  const fixedNow = new Date('2026-05-05T12:00:00.000Z');
  const service = createDiagnosticsService({
    now: () => fixedNow,
    repository: {
      async buildWindowSummary(input) {
        calls.push(input);
        return buildEmptyWindow(input.label, input.since);
      },
    },
  });

  const summary = await service.getPipelineSummary();

  assert.equal(summary.generatedAt.toISOString(), '2026-05-05T12:00:00.000Z');
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.label, 'Last 24 hours');
  assert.equal(calls[0]?.since.toISOString(), '2026-05-04T12:00:00.000Z');
  assert.equal(calls[1]?.label, 'Last 7 days');
  assert.equal(calls[1]?.since.toISOString(), '2026-04-28T12:00:00.000Z');
  assert.equal(summary.windows.last24h.emailIntake.inboundEmailsReceived, 0);
  assert.equal(summary.windows.last24h.documentStaging.emailDerivedOffersCreated, 0);
  assert.equal(summary.windows.last24h.supplierPriceIntelligence.supplierPriceItemsCreated, 0);
  assert.equal(summary.windows.last24h.commercialIntel.commercialIntelItemsCreated, 0);
  assert.equal(summary.windows.last24h.aiParserVisibility.aiAssistedOfferCount, 0);
  assert.equal(summary.windows.last24h.opportunities.openOpportunities, 0);
  assert.deepEqual(summary.windows.last24h.problems.latestFailedEmails, []);
});

test('acceptance/demo: diagnostics summary can show a clean offer found and promoted', async () => {
  const fixedNow = new Date('2026-05-05T12:00:00.000Z');
  const service = createDiagnosticsService({
    now: () => fixedNow,
    repository: {
      async buildWindowSummary(input) {
        return {
          ...buildEmptyWindow(input.label, input.since),
          emailIntake: {
            ...buildEmptyWindow(input.label, input.since).emailIntake,
            inboundEmailsReceived: 1,
          },
          documentStaging: {
            ...buildEmptyWindow(input.label, input.since).documentStaging,
            emailDerivedOffersCreated: 1,
            autoPromotedOffers: 1,
          },
          supplierPriceIntelligence: {
            ...buildEmptyWindow(input.label, input.since).supplierPriceIntelligence,
            supplierPriceItemsCreated: 1,
          },
        };
      },
    },
  });

  const summary = await service.getPipelineSummary();

  assert.equal(summary.windows.last24h.emailIntake.inboundEmailsReceived, 1);
  assert.equal(summary.windows.last24h.documentStaging.emailDerivedOffersCreated, 1);
  assert.equal(summary.windows.last24h.documentStaging.autoPromotedOffers, 1);
  assert.equal(summary.windows.last24h.supplierPriceIntelligence.supplierPriceItemsCreated, 1);
});
