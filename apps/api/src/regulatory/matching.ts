import type { Product, ProductAlias } from '@prisma/client';

import { buildProductCandidates } from '../imports/normalization';
import { determineProductMatchDecision } from '../imports/productMatching';
import type { ProductCandidates, ProductMatchDecision } from '../imports/types';

export type RegulatoryProductMatchRepository = {
  findProductByStoredCanonicalField: (
    storedCanonicalField: string,
  ) => Promise<Product | null>;
  findAliasByRawName: (
    rawProductName: string,
  ) => Promise<(ProductAlias & { product: Product }) | null>;
  listAliasesForCanonicalComparison: () => Promise<
    Array<ProductAlias & { product: Product }>
  >;
  listProductsByBaseName: (baseName: string) => Promise<Product[]>;
};

export type RegulatoryMatchOutcome = {
  status: 'CONFIDENT' | 'UNCLEAR';
  productId: string | null;
  confidence: number;
  reason: string;
  candidates: ProductCandidates;
  productDecision: ProductMatchDecision;
  matchedFields: {
    normalizedKey: string;
    normalizedName: string;
    strength: string | null;
    formulation: string | null;
    packSize: string | null;
  };
  evidence: {
    rawProductText: string;
    productMatchOutcome: ProductMatchDecision['outcome'];
    productMatchReasonCode: ProductMatchDecision['reasonCode'];
    aliasMatchType?: ProductMatchDecision['aliasMatchType'];
    structuredCompatibility?: ProductMatchDecision['structuredCompatibility'];
    candidateCount?: number;
  };
};

function hasStructuredSignal(candidates: ProductCandidates): boolean {
  return Boolean(
    candidates.strength || candidates.formulation || candidates.packSize,
  );
}

function confidenceForDecision(
  decision: ProductMatchDecision,
  candidates: ProductCandidates,
): number {
  if (decision.reasonCode === 'EXACT_NORMALIZED_KEY_MATCH') {
    return candidates.confidence === 'HIGH' ? 95 : 85;
  }

  if (
    decision.reasonCode === 'EXISTING_ALIAS_MATCH' &&
    decision.aliasMatchType === 'EXACT_RAW_ALIAS'
  ) {
    return 90;
  }

  if (decision.reasonCode === 'STRUCTURED_BASE_NAME_MATCH') {
    return 82;
  }

  if (
    decision.reasonCode === 'EXACT_NORMALIZED_NAME_MATCH' &&
    hasStructuredSignal(candidates)
  ) {
    return 78;
  }

  return 55;
}

function isConfidentDecision(
  decision: ProductMatchDecision,
  candidates: ProductCandidates,
): boolean {
  if (!decision.matchedProductId) {
    return false;
  }

  if (decision.reasonCode === 'EXACT_NORMALIZED_KEY_MATCH') {
    return true;
  }

  if (
    decision.reasonCode === 'EXISTING_ALIAS_MATCH' &&
    decision.aliasMatchType === 'EXACT_RAW_ALIAS'
  ) {
    return true;
  }

  if (
    decision.reasonCode === 'EXACT_NORMALIZED_NAME_MATCH' &&
    hasStructuredSignal(candidates) &&
    decision.structuredCompatibility?.compatible !== false
  ) {
    return true;
  }

  return false;
}

function buildReason(
  decision: ProductMatchDecision,
  baseNameCandidateCount: number,
): string {
  if (!decision.matchedProductId) {
    return 'No safe existing product match was found. Requires compliance review.';
  }

  if (baseNameCandidateCount > 1) {
    return 'Multiple existing products share the same base product signal. Requires compliance review.';
  }

  switch (decision.reasonCode) {
    case 'EXACT_NORMALIZED_KEY_MATCH':
      return 'Exact normalized product key match.';
    case 'EXISTING_ALIAS_MATCH':
      return decision.aliasMatchType === 'EXACT_RAW_ALIAS'
        ? 'Exact existing product alias match.'
        : 'Canonicalized alias match. Requires compliance review before action.';
    case 'EXACT_NORMALIZED_NAME_MATCH':
      return 'Existing product name match with compatible structured fields.';
    default:
      return 'Product match is not strong enough for automatic alerting. Requires compliance review.';
  }
}

export async function matchRegulatoryProductText(
  repository: RegulatoryProductMatchRepository,
  rawProductText: string,
): Promise<RegulatoryMatchOutcome> {
  const candidates = buildProductCandidates(rawProductText);
  const decision = await determineProductMatchDecision(repository, {
    rawProductName: rawProductText,
    candidates,
  });
  const baseNameMatches = candidates.baseName
    ? await repository.listProductsByBaseName(candidates.baseName)
    : [];
  const baseNameCandidateCount = new Set(
    baseNameMatches.map((product) => product.id),
  ).size;
  const confident =
    isConfidentDecision(decision, candidates) &&
    baseNameCandidateCount <= 1 &&
    candidates.confidence !== 'LOW';
  const confidence = confidenceForDecision(decision, candidates);

  return {
    status: confident ? 'CONFIDENT' : 'UNCLEAR',
    // The candidate product is surfaced for reviewer context regardless of
    // confidence; auto-alerting is separately gated on CONFIDENT downstream.
    productId: decision.matchedProductId,
    confidence: confident ? confidence : Math.min(confidence, 65),
    reason: buildReason(decision, baseNameCandidateCount),
    candidates,
    productDecision: decision,
    matchedFields: {
      normalizedKey: candidates.normalizedKey,
      normalizedName: candidates.normalizedName,
      strength: candidates.strength,
      formulation: candidates.formulation,
      packSize: candidates.packSize,
    },
    evidence: {
      rawProductText,
      productMatchOutcome: decision.outcome,
      productMatchReasonCode: decision.reasonCode,
      aliasMatchType: decision.aliasMatchType,
      structuredCompatibility: decision.structuredCompatibility,
      candidateCount: baseNameCandidateCount || undefined,
    },
  };
}
