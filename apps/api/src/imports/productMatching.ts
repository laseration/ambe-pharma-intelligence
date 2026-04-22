import type { Product, ProductAlias } from '@prisma/client';

import type { ProductCandidates, ProductMatchDecision } from './types';

type ProductMatchingSemantics = {
  normalizedBaseName: string;
  normalizedKey: string;
  rawProductName: string;
  storedCanonicalField: string;
  strength: string | null;
  formulation: string | null;
  packSize: string | null;
  confidence: ProductCandidates['confidence'];
};

type ProductMatchRepository = {
  findProductByStoredCanonicalField: (storedCanonicalField: string) => Promise<Product | null>;
  findAliasByRawName: (rawProductName: string) => Promise<(ProductAlias & { product: Product }) | null>;
  listAliasesForCanonicalComparison: () => Promise<Array<ProductAlias & { product: Product }>>;
};

function buildProductMatchingSemantics(input: {
  rawProductName: string;
  candidates: ProductCandidates;
}): ProductMatchingSemantics {
  return {
    // The normalizer emits a base-name-style normalizedName and a richer normalizedKey.
    // Today Product.normalizedName persists the normalizedKey, so matching code must treat
    // that database field as the current stored canonical match field, not as a guaranteed
    // pure base normalized name. This abstraction keeps those semantics explicit until the
    // persistence model is cleaned up.
    normalizedBaseName: input.candidates.normalizedName,
    normalizedKey: input.candidates.normalizedKey,
    rawProductName: input.rawProductName,
    storedCanonicalField: input.candidates.normalizedKey,
    strength: input.candidates.strength,
    formulation: input.candidates.formulation,
    packSize: input.candidates.packSize,
    confidence: input.candidates.confidence,
  };
}

export function canonicalizeProductAliasName(aliasName: string): string {
  return aliasName.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findMatchingAliasVariant<TAlias extends { aliasName: string; productId: string }>(
  aliases: TAlias[],
  rawProductName: string,
): {
  alias: TAlias | null;
  matchType: 'EXACT_RAW_ALIAS' | 'CANONICALIZED_ALIAS' | null;
} {
  const exactRawAliasMatch = aliases.find((alias) => alias.aliasName === rawProductName) ?? null;

  if (exactRawAliasMatch) {
    return {
      alias: exactRawAliasMatch,
      matchType: 'EXACT_RAW_ALIAS',
    };
  }

  const canonicalizedRawAlias = canonicalizeProductAliasName(rawProductName);
  if (!canonicalizedRawAlias) {
    return {
      alias: null,
      matchType: null,
    };
  }

  const canonicalizedAliasMatches = aliases.filter(
    (alias) => canonicalizeProductAliasName(alias.aliasName) === canonicalizedRawAlias,
  );

  if (canonicalizedAliasMatches.length === 1) {
    return {
      alias: canonicalizedAliasMatches[0] ?? null,
      matchType: 'CANONICALIZED_ALIAS',
    };
  }

  return {
    alias: null,
    matchType: null,
  };
}

function determineStructuredCompatibility(
  product: Product,
  semantics: ProductMatchingSemantics,
): {
  compatible: boolean;
  conflictFields: Array<'strength' | 'formulation' | 'packSize'>;
} {
  const conflictFields: Array<'strength' | 'formulation' | 'packSize'> = [];

  if (product.strength && semantics.strength && product.strength !== semantics.strength) {
    conflictFields.push('strength');
  }

  if (product.dosageForm && semantics.formulation && product.dosageForm !== semantics.formulation) {
    conflictFields.push('formulation');
  }

  if (product.packSize && semantics.packSize && product.packSize !== semantics.packSize) {
    conflictFields.push('packSize');
  }

  return {
    compatible: conflictFields.length === 0,
    conflictFields,
  };
}

export async function determineProductMatchDecision(
  repository: ProductMatchRepository,
  input: {
    rawProductName: string;
    candidates: ProductCandidates;
  },
): Promise<ProductMatchDecision> {
  const semantics = buildProductMatchingSemantics(input);
  const storedCanonicalFieldMatch = await repository.findProductByStoredCanonicalField(
    semantics.storedCanonicalField,
  );

  if (storedCanonicalFieldMatch) {
    return {
      outcome: 'EXISTING_PRODUCT',
      matchedProductId: storedCanonicalFieldMatch.id,
      reasonCode: 'EXACT_NORMALIZED_KEY_MATCH',
      normalizedKey: semantics.normalizedKey,
      normalizedName: semantics.normalizedBaseName,
      rawProductName: semantics.rawProductName,
      confidence: semantics.confidence,
      structuredCompatibility: {
        checked: false,
        compatible: true,
        conflictFields: [],
      },
    };
  }

  const normalizedBaseNameMatch = await repository.findProductByStoredCanonicalField(
    semantics.normalizedBaseName,
  );

  if (normalizedBaseNameMatch) {
    const structuredCompatibility = determineStructuredCompatibility(
      normalizedBaseNameMatch,
      semantics,
    );

    if (structuredCompatibility.compatible) {
      return {
        outcome: 'EXISTING_PRODUCT',
        matchedProductId: normalizedBaseNameMatch.id,
        reasonCode: 'EXACT_NORMALIZED_NAME_MATCH',
        normalizedKey: semantics.normalizedKey,
        normalizedName: semantics.normalizedBaseName,
        rawProductName: semantics.rawProductName,
        confidence: semantics.confidence,
        structuredCompatibility: {
          checked: true,
          compatible: true,
          conflictFields: [],
        },
      };
    }
  }

  const aliasMatch = await repository.findAliasByRawName(semantics.rawProductName);

  if (aliasMatch) {
    return {
      outcome: 'EXISTING_ALIAS',
      matchedProductId: aliasMatch.productId,
      reasonCode: 'EXISTING_ALIAS_MATCH',
      normalizedKey: semantics.normalizedKey,
      normalizedName: semantics.normalizedBaseName,
      rawProductName: semantics.rawProductName,
      confidence: semantics.confidence,
      aliasMatchType: 'EXACT_RAW_ALIAS',
      structuredCompatibility: {
        checked: false,
        compatible: true,
        conflictFields: [],
      },
    };
  }

  const canonicalAliasMatch = findMatchingAliasVariant(
    await repository.listAliasesForCanonicalComparison(),
    semantics.rawProductName,
  );

  if (canonicalAliasMatch.alias && canonicalAliasMatch.matchType === 'CANONICALIZED_ALIAS') {
    return {
      outcome: 'EXISTING_ALIAS',
      matchedProductId: canonicalAliasMatch.alias.productId,
      reasonCode: 'EXISTING_ALIAS_MATCH',
      normalizedKey: semantics.normalizedKey,
      normalizedName: semantics.normalizedBaseName,
      rawProductName: semantics.rawProductName,
      confidence: semantics.confidence,
      aliasMatchType: 'CANONICALIZED_ALIAS',
      structuredCompatibility: {
        checked: false,
        compatible: true,
        conflictFields: [],
      },
    };
  }

  const fallbackStructuredCompatibility = normalizedBaseNameMatch
    ? determineStructuredCompatibility(normalizedBaseNameMatch, semantics)
    : {
        compatible: false,
        conflictFields: [] as Array<'strength' | 'formulation' | 'packSize'>,
      };

  return {
    outcome: 'NEW_PRODUCT',
    matchedProductId: null,
    reasonCode: 'NO_SAFE_MATCH_CREATED_NEW_PRODUCT',
    normalizedKey: semantics.normalizedKey,
    normalizedName: semantics.normalizedBaseName,
    rawProductName: semantics.rawProductName,
    confidence: semantics.confidence,
    structuredCompatibility: {
      checked: Boolean(normalizedBaseNameMatch),
      compatible: fallbackStructuredCompatibility.compatible,
      conflictFields: fallbackStructuredCompatibility.conflictFields,
    },
  };
}
