import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateAiParsedOfferResponse } from '../aiParsing/schema';
import type { AiOfferParsingAttemptResult } from '../aiParsing/service';
import {
  parseStructuredPriceText,
  type ParsedEmailBodyResult,
} from '../email/parsing';
import {
  classifyInboundDocument,
  type ClassificationDecision,
} from '../email/inbound/documentClassifier';

export type ExtractionEvalExpectedOffer = {
  productIncludes: string;
  price?: number | null;
  currencyCode?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  packSize?: string | null;
  minimumOrderQuantity?: number | null;
  availabilityIncludes?: string | null;
};

export type ExtractionEvalDocument = {
  label: string;
  kind: 'ATTACHMENT_TEXT' | 'ATTACHMENT_TABLE';
  textContent: string;
};

export type ExtractionEvalCase = {
  id: string;
  title: string;
  description?: string;
  fromEmail?: string;
  subject?: string;
  bodyText?: string;
  documents?: ExtractionEvalDocument[];
  mockAiResult?: unknown;
  expected: {
    commerciallyRelevant: boolean;
    offerCount: number;
    reviewRequired: boolean;
    parsingSource?: 'DETERMINISTIC' | 'OPENAI_FALLBACK';
    documentClass?: string;
    offers: ExtractionEvalExpectedOffer[];
  };
};

export type ExtractedEvalOffer = {
  sourceLabel: string;
  productText: string;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
  price: number;
  currencyCode: string | null;
  minimumOrderQuantity: number | null;
  availability: string | null;
  confidence: string;
  parsingSource: string;
};

export type ExtractionEvalCaseResult = {
  id: string;
  title: string;
  passed: boolean;
  expectedOfferCount: number;
  extractedOfferCount: number;
  falsePositives: number;
  falseNegatives: number;
  reviewRequired: boolean;
  autoPromotionEligible: boolean;
  parsingSources: string[];
  documentClass: string | null;
  mismatches: string[];
  mismatchFields: string[];
  extractedOffers: ExtractedEvalOffer[];
};

export type ExtractionEvalSummary = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  extractedOffersCount: number;
  falsePositives: number;
  falseNegatives: number;
  reviewRequiredCount: number;
  autoPromotionCount: number;
  aiUsedCount: number;
  keyMismatches: Array<{
    caseId: string;
    title: string;
    mismatches: string[];
    fields: string[];
  }>;
  fieldMismatchCounts: Array<{
    fieldName: string;
    count: number;
  }>;
  caseResults: ExtractionEvalCaseResult[];
};

type SourceEvaluation = {
  sourceLabel: string;
  result: ParsedEmailBodyResult;
};

export type ExtractionEvalOptions = {
  fixturePath?: string;
  allowLiveAi?: boolean;
};

const DEFAULT_FIXTURE_PATH = path.resolve(
  process.cwd(),
  'fixtures/extraction-evals/cases.json',
);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function currencyEquals(
  actual: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  return (actual ?? '').toUpperCase() === (expected ?? '').toUpperCase();
}

function priceEquals(actual: number, expected: number | null | undefined) {
  if (expected === null || expected === undefined) {
    return true;
  }

  return Math.abs(actual - expected) < 0.01;
}

function productMatchesExpected(
  row: ExtractedEvalOffer,
  expected: ExtractionEvalExpectedOffer,
): boolean {
  return normalize(row.productText).includes(normalize(expected.productIncludes));
}

function normalizedNullableStringEquals(
  actual: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (expected === undefined) {
    return true;
  }

  return normalize(actual ?? '') === normalize(expected ?? '');
}

function numberEquals(
  actual: number | null | undefined,
  expected: number | null | undefined,
): boolean {
  if (expected === undefined) {
    return true;
  }

  if (expected === null) {
    return actual === null || actual === undefined;
  }

  return typeof actual === 'number' && Math.abs(actual - expected) < 0.01;
}

function availabilityMatches(
  actual: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (expected === undefined) {
    return true;
  }

  if (expected === null) {
    return actual === null || actual === undefined;
  }

  return normalize(actual ?? '').includes(normalize(expected));
}

function compareExpectedFields(
  row: ExtractedEvalOffer,
  expected: ExtractionEvalExpectedOffer,
): string[] {
  const fields: string[] = [];

  if (!priceEquals(row.price, expected.price)) {
    fields.push('price');
  }

  if (
    expected.currencyCode !== undefined &&
    !currencyEquals(row.currencyCode, expected.currencyCode)
  ) {
    fields.push('currencyCode');
  }

  if (!normalizedNullableStringEquals(row.strength, expected.strength)) {
    fields.push('strength');
  }

  if (!normalizedNullableStringEquals(row.dosageForm, expected.dosageForm)) {
    fields.push('dosageForm');
  }

  if (!normalizedNullableStringEquals(row.packSize, expected.packSize)) {
    fields.push('packSize');
  }

  if (
    !numberEquals(
      row.minimumOrderQuantity,
      expected.minimumOrderQuantity,
    )
  ) {
    fields.push('minimumOrderQuantity');
  }

  if (!availabilityMatches(row.availability, expected.availabilityIncludes)) {
    fields.push('availability');
  }

  return fields;
}

function flattenSourceEvaluations(
  evaluations: SourceEvaluation[],
): ExtractedEvalOffer[] {
  return evaluations.flatMap((evaluation) =>
    evaluation.result.parsedRows.map((row) => ({
      sourceLabel: evaluation.sourceLabel,
      productText: row.rawProductText,
      strength: row.strength,
      dosageForm: row.formulation,
      packSize: row.packSize,
      price: row.price,
      currencyCode: row.currencyCode,
      minimumOrderQuantity: row.minimumOrderQuantity ?? null,
      availability: row.availability ?? null,
      confidence: row.confidence,
      parsingSource: evaluation.result.parsingSource ?? 'DETERMINISTIC',
    })),
  );
}

function sourceRequiresReview(
  evaluation: SourceEvaluation,
  commerciallyRelevant: boolean,
): boolean {
  if (!commerciallyRelevant) {
    return false;
  }

  if (evaluation.result.parsedRows.length === 0) {
    return false;
  }

  return (
    evaluation.result.reviewRequired ||
    evaluation.result.parsedRows.some((row) => row.confidence !== 'HIGH')
  );
}

function buildMockAiParser(
  fixture: ExtractionEvalCase,
): { parseText: () => Promise<AiOfferParsingAttemptResult> } | undefined {
  if (!fixture.mockAiResult) {
    return undefined;
  }

  const validation = validateAiParsedOfferResponse(fixture.mockAiResult);

  return {
    parseText: async () => {
      if (!validation.valid || !validation.data) {
        return {
          status: 'unusable',
          reason:
            'Extraction eval fixture supplied schema-invalid mocked AI output.',
          decision: 'response_unusable',
          issues: validation.issues,
          requestId: `eval-${fixture.id}`,
          promptVersion: 'eval-fixture',
          reducedText: fixture.bodyText ?? '',
        };
      }

      return {
        status: 'success',
        reason:
          'Deterministic extraction eval fixture supplied a mocked AI result.',
        decision: 'accepted',
        requestId: `eval-${fixture.id}`,
        promptVersion: 'eval-fixture',
        reducedText: fixture.bodyText ?? '',
        result: validation.data,
      };
    },
  };
}

const disabledEvalAiParser = {
  parseText: async (): Promise<AiOfferParsingAttemptResult> => ({
    status: 'disabled',
    reason:
      'Live AI parsing is disabled for the default extraction evaluation harness.',
    decision: 'disabled',
  }),
};

function tableHeadersFromText(text: string): string[] {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine
    ? firstLine
        .split(/,|\t|;|\|/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function classifyFixtureDocuments(
  fixture: ExtractionEvalCase,
): ClassificationDecision | null {
  if (!fixture.documents?.length) {
    return null;
  }

  return classifyInboundDocument({
    fromEmail: fixture.fromEmail ?? 'pricing@supplier-example.test',
    subject: fixture.subject ?? fixture.title,
    bodyText: fixture.bodyText ?? null,
    attachments: fixture.documents.map((document, index) => ({
      attachmentId: document.label || `document-${index + 1}`,
      fileName: document.label,
      fileType: document.kind === 'ATTACHMENT_TABLE' ? 'XLSX' : 'PDF',
      mimeType:
        document.kind === 'ATTACHMENT_TABLE'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
    })),
    attachmentTexts: fixture.documents
      .filter((document) => document.kind === 'ATTACHMENT_TEXT')
      .map((document) => ({
        attachmentId: document.label,
        fileName: document.label,
        text: document.textContent,
        method: 'PDF_TEXT',
      })),
    tables: fixture.documents
      .filter((document) => document.kind === 'ATTACHMENT_TABLE')
      .map((document) => ({
        attachmentId: document.label,
        fileName: document.label,
        headers: tableHeadersFromText(document.textContent),
        rows: [],
      })),
    trustedSender: true,
  });
}

async function evaluateFixtureSources(
  fixture: ExtractionEvalCase,
  options: Pick<ExtractionEvalOptions, 'allowLiveAi'> = {},
): Promise<SourceEvaluation[]> {
  const sources: Array<{ label: string; text: string }> = [];

  if (fixture.bodyText?.trim()) {
    sources.push({
      label: 'email body',
      text: fixture.bodyText,
    });
  }

  for (const document of fixture.documents ?? []) {
    sources.push({
      label: document.label,
      text: document.textContent,
    });
  }

  const aiOfferParser = buildMockAiParser(fixture);
  const evaluations: SourceEvaluation[] = [];

  for (const source of sources) {
    const result = await parseStructuredPriceText(
      source.text,
      aiOfferParser
        ? {
            aiOfferParser,
            source: 'EMAIL_BODY',
          }
        : options.allowLiveAi
          ? {
              source: 'EMAIL_BODY',
            }
          : {
              aiOfferParser: disabledEvalAiParser,
              source: 'EMAIL_BODY',
            },
    );
    evaluations.push({
      sourceLabel: source.label,
      result,
    });
  }

  return evaluations;
}

export async function loadExtractionEvalCases(
  fixturePath = DEFAULT_FIXTURE_PATH,
): Promise<ExtractionEvalCase[]> {
  const raw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as ExtractionEvalCase[];

  return parsed.map((fixture) => ({
    ...fixture,
    documents: fixture.documents ?? [],
  }));
}

export function evaluateCaseMetrics(input: {
  fixture: ExtractionEvalCase;
  evaluations: SourceEvaluation[];
  documentClassification?: ClassificationDecision | null;
}): ExtractionEvalCaseResult {
  const extractedOffers = flattenSourceEvaluations(input.evaluations);
  const unmatchedActual = new Set(extractedOffers.map((_, index) => index));
  let matchedExpected = 0;
  const mismatches: string[] = [];
  const mismatchFields = new Set<string>();

  input.fixture.expected.offers.forEach((expectedOffer, expectedIndex) => {
    const matchedIndex = Array.from(unmatchedActual).find((index) =>
      productMatchesExpected(extractedOffers[index]!, expectedOffer),
    );

    if (matchedIndex === undefined) {
      mismatches.push(`Expected offer ${expectedIndex + 1} was not extracted.`);
      mismatchFields.add('productText');
      return;
    }

    matchedExpected += 1;
    unmatchedActual.delete(matchedIndex);
    const fieldMismatches = compareExpectedFields(
      extractedOffers[matchedIndex]!,
      expectedOffer,
    );

    for (const field of fieldMismatches) {
      mismatchFields.add(field);
    }

    if (fieldMismatches.length > 0) {
      mismatches.push(
        `Expected offer ${expectedIndex + 1} had field mismatch(es): ${fieldMismatches.join(', ')}.`,
      );
    }
  });

  const falseNegatives = input.fixture.expected.offers.length - matchedExpected;
  const falsePositives = unmatchedActual.size;
  const reviewRequired =
    input.evaluations.some((evaluation) =>
      sourceRequiresReview(
        evaluation,
        input.fixture.expected.commerciallyRelevant,
      ),
    ) ||
    (input.fixture.expected.commerciallyRelevant &&
      extractedOffers.length === 0);
  const parsingSources = Array.from(
    new Set(
      input.evaluations.map(
        (evaluation) => evaluation.result.parsingSource ?? 'DETERMINISTIC',
      ),
    ),
  );
  const documentClass = input.documentClassification?.primaryClass ?? null;

  if (extractedOffers.length !== input.fixture.expected.offerCount) {
    mismatches.push(
      `Expected ${input.fixture.expected.offerCount} extracted offer(s), got ${extractedOffers.length}.`,
    );
    mismatchFields.add('offerCount');
  }

  if (reviewRequired !== input.fixture.expected.reviewRequired) {
    mismatches.push(
      `Expected reviewRequired=${input.fixture.expected.reviewRequired}, got ${reviewRequired}.`,
    );
    mismatchFields.add('reviewRequired');
  }

  if (
    input.fixture.expected.parsingSource &&
    !parsingSources.includes(input.fixture.expected.parsingSource)
  ) {
    mismatches.push(
      `Expected parsing source ${input.fixture.expected.parsingSource}, got ${parsingSources.join(', ') || 'none'}.`,
    );
    mismatchFields.add('parsingSource');
  }

  if (
    input.fixture.expected.documentClass &&
    documentClass !== input.fixture.expected.documentClass
  ) {
    mismatches.push(
      `Expected document class ${input.fixture.expected.documentClass}, got ${documentClass ?? 'none'}.`,
    );
    mismatchFields.add('documentClass');
  }

  if (unmatchedActual.size > 0) {
    mismatches.push(
      `${unmatchedActual.size} unexpected extracted offer(s) were present.`,
    );
    mismatchFields.add('unexpectedOffer');
  }

  const autoPromotionEligible =
    extractedOffers.length > 0 &&
    !reviewRequired &&
    parsingSources.every((source) => source === 'DETERMINISTIC');

  return {
    id: input.fixture.id,
    title: input.fixture.title,
    passed:
      mismatches.length === 0 && falsePositives === 0 && falseNegatives === 0,
    expectedOfferCount: input.fixture.expected.offerCount,
    extractedOfferCount: extractedOffers.length,
    falsePositives,
    falseNegatives,
    reviewRequired,
    autoPromotionEligible,
    parsingSources,
    documentClass,
    mismatches,
    mismatchFields: Array.from(mismatchFields).sort(),
    extractedOffers,
  };
}

export function summarizeExtractionEvalResults(
  caseResults: ExtractionEvalCaseResult[],
): ExtractionEvalSummary {
  const fieldMismatchCounter = new Map<string, number>();

  for (const result of caseResults) {
    for (const field of result.mismatchFields) {
      fieldMismatchCounter.set(field, (fieldMismatchCounter.get(field) ?? 0) + 1);
    }
  }

  return {
    totalCases: caseResults.length,
    passedCases: caseResults.filter((result) => result.passed).length,
    failedCases: caseResults.filter((result) => !result.passed).length,
    extractedOffersCount: caseResults.reduce(
      (total, result) => total + result.extractedOfferCount,
      0,
    ),
    falsePositives: caseResults.reduce(
      (total, result) => total + result.falsePositives,
      0,
    ),
    falseNegatives: caseResults.reduce(
      (total, result) => total + result.falseNegatives,
      0,
    ),
    reviewRequiredCount: caseResults.filter((result) => result.reviewRequired)
      .length,
    autoPromotionCount: caseResults.filter(
      (result) => result.autoPromotionEligible,
    ).length,
    aiUsedCount: caseResults.filter((result) =>
      result.parsingSources.includes('OPENAI_FALLBACK'),
    ).length,
    keyMismatches: caseResults
      .filter((result) => result.mismatches.length > 0)
      .map((result) => ({
        caseId: result.id,
        title: result.title,
        mismatches: result.mismatches,
        fields: result.mismatchFields,
      })),
    fieldMismatchCounts: Array.from(fieldMismatchCounter.entries())
      .map(([fieldName, count]) => ({ fieldName, count }))
      .sort((left, right) =>
        left.fieldName.localeCompare(right.fieldName),
      ),
    caseResults,
  };
}

export async function runExtractionEval(
  fixturePathOrOptions: string | ExtractionEvalOptions = DEFAULT_FIXTURE_PATH,
): Promise<ExtractionEvalSummary> {
  const options =
    typeof fixturePathOrOptions === 'string'
      ? { fixturePath: fixturePathOrOptions, allowLiveAi: false }
      : fixturePathOrOptions;
  const fixturePath = options.fixturePath ?? DEFAULT_FIXTURE_PATH;
  const fixtures = await loadExtractionEvalCases(fixturePath);
  const caseResults: ExtractionEvalCaseResult[] = [];

  for (const fixture of fixtures) {
    const evaluations = await evaluateFixtureSources(fixture, {
      allowLiveAi: options.allowLiveAi === true,
    });
    const documentClassification = classifyFixtureDocuments(fixture);
    caseResults.push(
      evaluateCaseMetrics({
        fixture,
        evaluations,
        documentClassification,
      }),
    );
  }

  return summarizeExtractionEvalResults(caseResults);
}
