import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product, ProductAlias } from '@prisma/client';

import { createProductDuplicateReportService } from '../service';

type ProductWithAliases = Product & {
  aliases: ProductAlias[];
};

function createProduct(
  id: string,
  input: {
    name: string;
    normalizedName: string;
    baseName?: string | null;
    strength?: string | null;
    dosageForm?: string | null;
    packSize?: string | null;
    aliases?: Array<{ id: string; aliasName: string }>;
  },
): ProductWithAliases {
  return {
    id,
    name: input.name,
    normalizedName: input.normalizedName,
    baseName: input.baseName ?? null,
    sku: null,
    manufacturer: null,
    strength: input.strength ?? null,
    dosageForm: input.dosageForm ?? null,
    packSize: input.packSize ?? null,
    isActive: true,
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    updatedAt: new Date('2026-04-19T00:00:00.000Z'),
    aliases: (input.aliases ?? []).map((alias) => ({
      id: alias.id,
      productId: id,
      aliasName: alias.aliasName,
      sourceSystem: 'import:test',
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
      updatedAt: new Date('2026-04-19T00:00:00.000Z'),
    })),
  };
}

test('groups obvious structured duplicates conservatively', async () => {
  const service = createProductDuplicateReportService({
    listProducts: async () => [
      createProduct('p1', {
        name: 'Amlodipine 5mg tabs 28',
        normalizedName: 'amlodipine',
        strength: '5mg',
        dosageForm: 'tablet',
        packSize: '28',
      }),
      createProduct('p2', {
        name: 'Amlodipine 5mg tablets 28',
        normalizedName: 'amlodipine',
        strength: '5mg',
        dosageForm: 'tablet',
        packSize: '28',
      }),
    ],
  });

  const groups = await service.listLikelyDuplicateGroups();

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.confidence, 'HIGH');
  assert.deepEqual(groups[0]?.reasonCodes, ['STRUCTURED_BASE_NAME_MATCH']);
});

test('does not group similar base name when strength conflicts', async () => {
  const service = createProductDuplicateReportService({
    listProducts: async () => [
      createProduct('p1', {
        name: 'Amlodipine 5mg tabs 28',
        normalizedName: 'amlodipine',
        strength: '5mg',
        dosageForm: 'tablet',
        packSize: '28',
      }),
      createProduct('p2', {
        name: 'Amlodipine 10mg tabs 28',
        normalizedName: 'amlodipine',
        strength: '10mg',
        dosageForm: 'tablet',
        packSize: '28',
      }),
    ],
  });

  const groups = await service.listLikelyDuplicateGroups();

  assert.equal(groups.length, 0);
});

test('does not group similar base name when formulation conflicts', async () => {
  const service = createProductDuplicateReportService({
    listProducts: async () => [
      createProduct('p1', {
        name: 'Amlodipine 5mg tablet 28',
        normalizedName: 'amlodipine',
        strength: '5mg',
        dosageForm: 'tablet',
        packSize: '28',
      }),
      createProduct('p2', {
        name: 'Amlodipine 5mg capsule 28',
        normalizedName: 'amlodipine',
        strength: '5mg',
        dosageForm: 'capsule',
        packSize: '28',
      }),
    ],
  });

  const groups = await service.listLikelyDuplicateGroups();

  assert.equal(groups.length, 0);
});

test('groups alias-collision duplicates only when structured fields are safe', async () => {
  const service = createProductDuplicateReportService({
    listProducts: async () => [
      createProduct('p1', {
        name: 'Amlodipine import one',
        normalizedName: 'amlodipine|5mg|tablet|28',
        strength: '5mg',
        dosageForm: 'tablet',
        packSize: '28',
        aliases: [{ id: 'a1', aliasName: 'Amlodipine 5MG Tablets 28' }],
      }),
      createProduct('p2', {
        name: 'Amlodipine import two',
        normalizedName: 'amlodipine-other',
        strength: '5mg',
        dosageForm: 'tablet',
        packSize: '28',
        aliases: [{ id: 'a2', aliasName: '  amlodipine   5mg tablets 28 ' }],
      }),
    ],
  });

  const groups = await service.listLikelyDuplicateGroups();

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.reasonCodes, ['CANONICAL_ALIAS_COLLISION']);
});
