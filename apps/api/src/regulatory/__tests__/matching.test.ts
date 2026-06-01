import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Product, ProductAlias } from '@prisma/client';

import {
  matchRegulatoryProductText,
  type RegulatoryProductMatchRepository,
} from '../matching';
import { buildProductCandidates } from '../../imports/normalization';

function product(overrides: Partial<Product>): Product {
  const candidates = buildProductCandidates(
    overrides.name ?? 'Amlodipine 5mg tablets 28',
  );

  return {
    id: overrides.id ?? 'product-1',
    sku: null,
    name: overrides.name ?? 'Amlodipine 5mg tablets 28',
    normalizedName: overrides.normalizedName ?? candidates.normalizedKey,
    baseName: overrides.baseName ?? candidates.baseName,
    manufacturer: null,
    strength: overrides.strength ?? candidates.strength,
    dosageForm: overrides.dosageForm ?? candidates.formulation,
    packSize: overrides.packSize ?? candidates.packSize,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function repository(
  products: Product[],
  aliases: Array<ProductAlias & { product: Product }> = [],
): RegulatoryProductMatchRepository {
  return {
    findProductByStoredCanonicalField: async (storedCanonicalField) =>
      products.find((item) => item.normalizedName === storedCanonicalField) ??
      null,
    findAliasByRawName: async (aliasName) =>
      aliases.find((alias) => alias.aliasName === aliasName) ?? null,
    listAliasesForCanonicalComparison: async () => aliases,
    listProductsByBaseName: async (baseName) =>
      products.filter(
        (item) =>
          item.baseName === baseName || item.normalizedName === baseName,
      ),
  };
}

test('returns confident match for exact normalized product key', async () => {
  const existing = product({});
  const result = await matchRegulatoryProductText(
    repository([existing]),
    'Amlodipine 5mg tablets 28',
  );

  assert.equal(result.status, 'CONFIDENT');
  assert.equal(result.productId, existing.id);
  assert.equal(
    result.evidence.productMatchReasonCode,
    'EXACT_NORMALIZED_KEY_MATCH',
  );
});

test('keeps broad product text unclear when multiple products share a base name', async () => {
  const tablet = product({ id: 'tablet', name: 'Amlodipine 5mg tablets 28' });
  const capsule = product({
    id: 'capsule',
    name: 'Amlodipine 10mg tablets 28',
  });
  const result = await matchRegulatoryProductText(
    repository([tablet, capsule]),
    'Amlodipine tablets',
  );

  assert.equal(result.status, 'UNCLEAR');
  assert.equal(result.productId, null);
  assert.match(
    result.reason,
    /No safe existing product match|Requires compliance review/,
  );
});

test('returns confident match for exact raw alias', async () => {
  const existing = product({});
  const alias = {
    id: 'alias-1',
    productId: existing.id,
    aliasName: 'Norvasc 5mg tabs 28',
    sourceSystem: 'test',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: existing,
  };
  const result = await matchRegulatoryProductText(
    repository([existing], [alias]),
    'Norvasc 5mg tabs 28',
  );

  assert.equal(result.status, 'CONFIDENT');
  assert.equal(result.productId, existing.id);
  assert.equal(result.evidence.productMatchReasonCode, 'EXISTING_ALIAS_MATCH');
});
