import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateCaseMetrics,
  loadExtractionEvalCases,
  summarizeExtractionEvalResults,
  type ExtractionEvalCase,
} from '../harness';
import type {
  ParsedEmailBodyResult,
  ParsedEmailBodyRow,
} from '../../email/parsing';

function row(overrides: Partial<ParsedEmailBodyRow> = {}): ParsedEmailBodyRow {
  return {
    lineNumber: 1,
    rawLine: 'Amlodipine 5mg tabs 28 - GBP 8.40',
    rawProductName: 'Amlodipine 5mg tabs 28',
    rawProductText: 'Amlodipine 5mg tabs 28',
    strength: '5mg',
    formulation: 'tablet',
    packSize: '28',
    price: 8.4,
    currencyCode: 'GBP',
    productCandidates: {
      baseName: 'amlodipine',
      normalizedName: 'amlodipine',
      strength: '5mg',
      formulation: 'tablet',
      packSize: '28',
      normalizedKey: 'amlodipine|5mg|tablet|28',
      confidence: 'HIGH',
      explanation: {
        cleanedInput: 'amlodipine 5mg tabs 28',
        tokens: ['amlodipine', '5', 'mg', 'tablet', '28'],
        rulesApplied: [],
        extracted: {
          strength: '5mg',
          formulation: 'tablet',
          packSize: '28',
        },
      },
    },
    confidence: 'HIGH',
    explanation: 'Structured fixture row.',
    ...overrides,
  };
}

function result(
  rows: ParsedEmailBodyRow[],
  overrides: Partial<ParsedEmailBodyResult> = {},
): ParsedEmailBodyResult {
  return {
    totalLines: rows.length,
    candidateLines: rows.length,
    parsedRows: rows,
    skippedLines: [],
    overallConfidence: 'HIGH',
    reviewRecommended: false,
    reviewRequired: false,
    rawBodyText: '',
    rawBody: '',
    parsingSource: 'DETERMINISTIC',
    aiFallbackAttempted: false,
    aiFallbackUsed: false,
    aiPromptVersion: null,
    ...overrides,
  };
}

function fixture(
  overrides: Partial<ExtractionEvalCase> = {},
): ExtractionEvalCase {
  return {
    id: 'case-1',
    title: 'Case 1',
    bodyText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
    documents: [],
    expected: {
      commerciallyRelevant: true,
      offerCount: 1,
      reviewRequired: false,
      parsingSource: 'DETERMINISTIC',
      offers: [
        {
          productIncludes: 'Amlodipine 5mg tabs 28',
          price: 8.4,
          currencyCode: 'GBP',
        },
      ],
    },
    ...overrides,
  };
}

test('loads sanitized extraction eval fixtures from JSON', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambe-extraction-eval-'));
  const fixturePath = path.join(directory, 'cases.json');
  await writeFile(
    fixturePath,
    JSON.stringify([
      {
        id: 'loader-case',
        title: 'Loader Case',
        bodyText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
        expected: {
          commerciallyRelevant: true,
          offerCount: 1,
          reviewRequired: false,
          offers: [
            {
              productIncludes: 'Amlodipine',
              price: 8.4,
              currencyCode: 'GBP',
            },
          ],
        },
      },
    ]),
  );

  const cases = await loadExtractionEvalCases(fixturePath);

  assert.equal(cases.length, 1);
  assert.equal(cases[0]?.id, 'loader-case');
  assert.deepEqual(cases[0]?.documents, []);
});

test('metrics count passes, false positives, and false negatives', () => {
  const pass = evaluateCaseMetrics({
    fixture: fixture(),
    evaluations: [{ sourceLabel: 'email body', result: result([row()]) }],
  });
  assert.equal(pass.passed, true);
  assert.equal(pass.falsePositives, 0);
  assert.equal(pass.falseNegatives, 0);

  const fail = evaluateCaseMetrics({
    fixture: fixture(),
    evaluations: [
      {
        sourceLabel: 'email body',
        result: result([
          row({
            rawProductText: 'Unexpected Product 10mg 10',
            rawProductName: 'Unexpected Product 10mg 10',
          }),
        ]),
      },
    ],
  });

  assert.equal(fail.passed, false);
  assert.equal(fail.falsePositives, 1);
  assert.equal(fail.falseNegatives, 1);
  assert.match(fail.mismatches.join(' '), /Missing expected offer/);
});

test('summary aggregates extraction quality metrics', () => {
  const passing = evaluateCaseMetrics({
    fixture: fixture(),
    evaluations: [{ sourceLabel: 'email body', result: result([row()]) }],
  });
  const failing = evaluateCaseMetrics({
    fixture: fixture({ id: 'case-2', title: 'Case 2' }),
    evaluations: [{ sourceLabel: 'email body', result: result([]) }],
  });

  const summary = summarizeExtractionEvalResults([passing, failing]);

  assert.equal(summary.totalCases, 2);
  assert.equal(summary.passedCases, 1);
  assert.equal(summary.failedCases, 1);
  assert.equal(summary.extractedOffersCount, 1);
  assert.equal(summary.falseNegatives, 1);
  assert.equal(summary.aiUsedCount, 0);
  assert.equal(summary.keyMismatches[0]?.caseId, 'case-2');
});

test('summary counts AI fallback cases separately', () => {
  const aiCase = evaluateCaseMetrics({
    fixture: fixture({
      id: 'ai-case',
      title: 'AI Case',
      expected: {
        commerciallyRelevant: true,
        offerCount: 1,
        reviewRequired: true,
        parsingSource: 'OPENAI_FALLBACK',
        offers: [
          {
            productIncludes: 'Amlodipine',
            price: 8.4,
            currencyCode: 'GBP',
          },
        ],
      },
    }),
    evaluations: [
      {
        sourceLabel: 'email body',
        result: result([row()], {
          reviewRecommended: true,
          reviewRequired: true,
          parsingSource: 'OPENAI_FALLBACK',
        }),
      },
    ],
  });

  const summary = summarizeExtractionEvalResults([aiCase]);

  assert.equal(summary.aiUsedCount, 1);
  assert.equal(summary.reviewRequiredCount, 1);
});
