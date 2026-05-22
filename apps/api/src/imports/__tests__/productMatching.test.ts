import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product, ProductAlias } from '@prisma/client';

import {
  determineProductMatchDecision,
  evaluateNewProductAutoCreationEligibility,
  findMatchingAliasVariant,
} from '../productMatching';
import type { ProductCandidates } from '../types';

function createProduct(
  id: string,
  storedCanonicalField: string,
  overrides?: Partial<Product>,
): Product {
  return {
    id,
    name: storedCanonicalField,
    normalizedName: storedCanonicalField,
    baseName: null,
    sku: null,
    manufacturer: null,
    strength: null,
    dosageForm: null,
    packSize: null,
    isActive: true,
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    updatedAt: new Date('2026-04-19T00:00:00.000Z'),
    ...overrides,
  };
}

function createAlias(
  id: string,
  productId: string,
  aliasName: string,
  product: Product,
): ProductAlias & {
  product: Product;
} {
  return {
    id,
    productId,
    aliasName,
    sourceSystem: 'import:test',
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    updatedAt: new Date('2026-04-19T00:00:00.000Z'),
    product,
  };
}

function createCandidates(
  overrides?: Partial<ProductCandidates>,
): ProductCandidates {
  const candidates: ProductCandidates = {
    baseName: 'amlodipine',
    normalizedName: 'amlodipine',
    strength: '5mg',
    formulation: 'tablet',
    packSize: '28',
    normalizedKey: 'amlodipine|5mg|tablet|28',
    confidence: 'HIGH',
    explanation: {
      cleanedInput: 'Amlodipine 5mg tabs 28',
      tokens: ['amlodipine', '5', 'mg', 'tablet', '28'],
      rulesApplied: ['test'],
      extracted: {
        strength: '5mg',
        formulation: 'tablet',
        packSize: '28',
      },
    },
  };

  return {
    ...candidates,
    ...overrides,
    baseName: overrides?.baseName ?? candidates.baseName,
  };
}

test('returns normalized key match decision', async () => {
  const product = createProduct('product-key', 'amlodipine|5mg|tablet|28');
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async (storedCanonicalField) =>
        storedCanonicalField === 'amlodipine|5mg|tablet|28' ? product : null,
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [],
    },
    {
      rawProductName: 'Amlodipine 5mg tabs 28',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'EXISTING_PRODUCT');
  assert.equal(decision.reasonCode, 'EXACT_NORMALIZED_KEY_MATCH');
  assert.equal(decision.matchedProductId, 'product-key');
});

test('fallback match succeeds when base name matches and structured fields do not conflict', async () => {
  const product = createProduct('product-name', 'amlodipine', {
    strength: '5mg',
    dosageForm: 'tablet',
    packSize: '28',
  });
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async (storedCanonicalField) => {
        if (storedCanonicalField === 'amlodipine') {
          return product;
        }

        return null;
      },
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [],
    },
    {
      rawProductName: 'Amlodipine',
      candidates: createCandidates({
        normalizedKey: 'amlodipine|5mg|tablet|30',
      }),
    },
  );

  assert.equal(decision.outcome, 'EXISTING_PRODUCT');
  assert.equal(decision.reasonCode, 'EXACT_NORMALIZED_NAME_MATCH');
  assert.equal(decision.matchedProductId, 'product-name');
  assert.equal(decision.structuredCompatibility?.checked, true);
  assert.equal(decision.structuredCompatibility?.compatible, true);
});

test('fallback match fails on strength conflict', async () => {
  const product = createProduct('product-strength-conflict', 'amlodipine', {
    strength: '10mg',
  });
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async (storedCanonicalField) => {
        if (storedCanonicalField === 'amlodipine') {
          return product;
        }

        return null;
      },
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [],
    },
    {
      rawProductName: 'Amlodipine 5mg tablets 28',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'NEW_PRODUCT');
  assert.equal(decision.reasonCode, 'NO_SAFE_MATCH_CREATED_NEW_PRODUCT');
  assert.deepEqual(decision.structuredCompatibility?.conflictFields, [
    'strength',
  ]);
});

test('fallback match fails on formulation conflict', async () => {
  const product = createProduct('product-formulation-conflict', 'amlodipine', {
    dosageForm: 'capsule',
  });
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async (storedCanonicalField) => {
        if (storedCanonicalField === 'amlodipine') {
          return product;
        }

        return null;
      },
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [],
    },
    {
      rawProductName: 'Amlodipine 5mg tablets 28',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'NEW_PRODUCT');
  assert.equal(decision.reasonCode, 'NO_SAFE_MATCH_CREATED_NEW_PRODUCT');
  assert.deepEqual(decision.structuredCompatibility?.conflictFields, [
    'formulation',
  ]);
});

test('fallback match fails on pack-size conflict when both sides have pack size', async () => {
  const product = createProduct('product-pack-conflict', 'amlodipine', {
    packSize: '30',
  });
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async (storedCanonicalField) => {
        if (storedCanonicalField === 'amlodipine') {
          return product;
        }

        return null;
      },
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [],
    },
    {
      rawProductName: 'Amlodipine 5mg tablets 28',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'NEW_PRODUCT');
  assert.equal(decision.reasonCode, 'NO_SAFE_MATCH_CREATED_NEW_PRODUCT');
  assert.deepEqual(decision.structuredCompatibility?.conflictFields, [
    'packSize',
  ]);
});

test('returns alias match decision when raw product name already exists as alias', async () => {
  const product = createProduct('product-alias', 'amlodipine|5mg|tablet|28');
  const alias = createAlias(
    'alias-1',
    'product-alias',
    'Amlodipine 5 mg tablets x 28',
    product,
  );
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async () => null,
      findAliasByRawName: async (rawProductName) =>
        rawProductName === 'Amlodipine 5 mg tablets x 28' ? alias : null,
      listAliasesForCanonicalComparison: async () => [alias],
    },
    {
      rawProductName: 'Amlodipine 5 mg tablets x 28',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'EXISTING_ALIAS');
  assert.equal(decision.reasonCode, 'EXISTING_ALIAS_MATCH');
  assert.equal(decision.matchedProductId, 'product-alias');
  assert.equal(decision.aliasMatchType, 'EXACT_RAW_ALIAS');
});

test('returns canonicalized alias match decision for whitespace and case variant', async () => {
  const product = createProduct(
    'product-canonical-alias',
    'amlodipine|5mg|tablet|28',
  );
  const alias = createAlias(
    'alias-2',
    'product-canonical-alias',
    'Amlodipine 5MG Tablets 28',
    product,
  );
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async () => null,
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [alias],
    },
    {
      rawProductName: '  amlodipine   5mg   tablets 28  ',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'EXISTING_ALIAS');
  assert.equal(decision.reasonCode, 'EXISTING_ALIAS_MATCH');
  assert.equal(decision.aliasMatchType, 'CANONICALIZED_ALIAS');
});

test('returns canonicalized alias match decision for deterministic structured variant', async () => {
  const product = createProduct(
    'product-structured-alias',
    'amlodipine|5mg|tablet|28',
  );
  const alias = createAlias(
    'alias-structured-1',
    'product-structured-alias',
    'Amlodipine (5 mg) tab. x28',
    product,
  );
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async () => null,
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [alias],
    },
    {
      rawProductName: 'Amlodipine 5mg tablets 28s',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'EXISTING_ALIAS');
  assert.equal(decision.reasonCode, 'EXISTING_ALIAS_MATCH');
  assert.equal(decision.matchedProductId, 'product-structured-alias');
  assert.equal(decision.aliasMatchType, 'CANONICALIZED_ALIAS');
});

test('canonicalized alias does not match when medically meaningful text differs', async () => {
  const product = createProduct(
    'product-medical-difference',
    'amlodipine|5mg|tablet|28',
  );
  const alias = createAlias(
    'alias-3',
    'product-medical-difference',
    'Amlodipine 10mg tablets 28',
    product,
  );
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async () => null,
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [alias],
    },
    {
      rawProductName: 'Amlodipine 5mg tablets 28',
      candidates: createCandidates(),
    },
  );

  assert.equal(decision.outcome, 'NEW_PRODUCT');
  assert.equal(decision.matchedProductId, null);
});

test('returns new product decision when no safe match exists', async () => {
  const decision = await determineProductMatchDecision(
    {
      findProductByStoredCanonicalField: async () => null,
      findAliasByRawName: async () => null,
      listAliasesForCanonicalComparison: async () => [],
    },
    {
      rawProductName: 'Unseen Product 10mg tabs 14',
      candidates: createCandidates({
        normalizedName: 'unseen product',
        normalizedKey: 'unseen product|10mg|tablet|14',
        confidence: 'MEDIUM',
      }),
    },
  );

  assert.equal(decision.outcome, 'NEW_PRODUCT');
  assert.equal(decision.reasonCode, 'NO_SAFE_MATCH_CREATED_NEW_PRODUCT');
  assert.equal(decision.matchedProductId, null);
});

test('allows automatic new product creation when structured identity confidence is high', () => {
  const eligibility = evaluateNewProductAutoCreationEligibility({
    rawProductName: 'Ondansetron 2mg/1ml injection',
    candidates: createCandidates({
      baseName: 'ondansetron',
      normalizedName: 'ondansetron',
      normalizedKey: 'ondansetron|2mg/1ml|injection',
      strength: '2mg/1ml',
      formulation: 'injection',
      packSize: null,
      confidence: 'HIGH',
    }),
  });

  assert.equal(eligibility.allowed, true);
  assert.equal(eligibility.reason, null);
});

test('blocks automatic new product creation when structured identity is underspecified', () => {
  const eligibility = evaluateNewProductAutoCreationEligibility({
    rawProductName: 'Aspirin sachets',
    candidates: createCandidates({
      baseName: 'aspirin',
      normalizedName: 'aspirin',
      normalizedKey: 'aspirin|sachet',
      strength: null,
      formulation: 'sachet',
      packSize: null,
      confidence: 'MEDIUM',
    }),
  });

  assert.equal(eligibility.allowed, false);
  assert.match(
    eligibility.reason ?? '',
    /no safe existing product match was found/i,
  );
  assert.match(
    eligibility.reason ?? '',
    /new canonical product was not created because the product identity is too incomplete or weak/i,
  );
  assert.match(
    eligibility.reason ?? '',
    /missing structured product fields: strength/i,
  );
  assert.match(
    eligibility.reason ?? '',
    /needs product review before catalog creation/i,
  );
});

test('does not create duplicate alias for whitespace or case only variants', () => {
  const product = createProduct(
    'product-duplicate-alias',
    'amlodipine|5mg|tablet|28',
  );
  const alias = createAlias(
    'alias-4',
    'product-duplicate-alias',
    'Amlodipine 5MG Tablets 28',
    product,
  );
  const match = findMatchingAliasVariant(
    [alias],
    '  amlodipine   5mg tablets 28 ',
  );

  assert.equal(match.alias?.id, 'alias-4');
  assert.equal(match.matchType, 'CANONICALIZED_ALIAS');
});

test('canonicalized alias match stays safe when duplicate variants belong to the same product', () => {
  const product = createProduct(
    'product-same-product-aliases',
    'amlodipine|5mg|tablet|28',
  );
  const aliases = [
    createAlias(
      'alias-duplicate-1',
      'product-same-product-aliases',
      'Amlodipine 5MG Tablets 28',
      product,
    ),
    createAlias(
      'alias-duplicate-2',
      'product-same-product-aliases',
      'Amlodipine (5 mg) tab. x28',
      product,
    ),
  ];
  const match = findMatchingAliasVariant(aliases, 'Amlodipine 5mg tablets 28s');

  assert.equal(match.alias?.productId, 'product-same-product-aliases');
  assert.equal(match.matchType, 'CANONICALIZED_ALIAS');
});

test('new alias can still be created for genuinely new raw supplier wording', () => {
  const product = createProduct(
    'product-new-alias',
    'amlodipine|5mg|tablet|28',
  );
  const alias = createAlias(
    'alias-5',
    'product-new-alias',
    'Amlodipine 5mg tablets 28',
    product,
  );
  const match = findMatchingAliasVariant(
    [alias],
    'Amlodipine oral suspension 5mg 28',
  );

  assert.equal(match.alias, null);
  assert.equal(match.matchType, null);
});
