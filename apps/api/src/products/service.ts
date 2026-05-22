import type { Product, ProductAlias } from '@prisma/client';

import { db } from '../lib/db';
import { canonicalizeProductAliasName } from '../imports/productMatching';

export type ProductDuplicateGroupConfidence = 'HIGH' | 'MEDIUM';

export type ProductDuplicateGroupReasonCode =
  | 'STRUCTURED_BASE_NAME_MATCH'
  | 'CANONICAL_ALIAS_COLLISION';

export type ProductDuplicateGroup = {
  groupKey: string;
  reasonCodes: ProductDuplicateGroupReasonCode[];
  confidence: ProductDuplicateGroupConfidence;
  products: Array<{
    id: string;
    name: string;
    storedCanonicalField: string;
    derivedNormalizedBaseName: string;
    strength: string | null;
    formulation: string | null;
    packSize: string | null;
    aliasCount: number;
  }>;
};

type ProductWithAliases = Product & {
  aliases: ProductAlias[];
};

type DuplicateReportDependencies = {
  listProducts: () => Promise<ProductWithAliases[]>;
};

function deriveNormalizedBaseName(storedCanonicalField: string): string {
  // Product.normalizedName still stores the current canonical match field, which is
  // often a normalized key from imports. This helper derives the safest available
  // base-name-style signal by taking the leading segment before structured attributes.
  return (
    storedCanonicalField.split('|')[0]?.trim() ?? storedCanonicalField.trim()
  );
}

function hasStructuredConflicts(products: ProductWithAliases[]): boolean {
  const strengths = new Set(
    products.map((product) => product.strength).filter(Boolean),
  );
  const formulations = new Set(
    products.map((product) => product.dosageForm).filter(Boolean),
  );
  const packSizes = new Set(
    products.map((product) => product.packSize).filter(Boolean),
  );

  return strengths.size > 1 || formulations.size > 1 || packSizes.size > 1;
}

function buildStructuredGroupKey(product: ProductWithAliases): string {
  return [
    deriveNormalizedBaseName(product.normalizedName),
    product.strength ?? '',
    product.dosageForm ?? '',
    product.packSize ?? '',
  ].join('|');
}

function buildAliasCollisionMap(
  products: ProductWithAliases[],
): Map<string, Set<string>> {
  const aliasCollisionMap = new Map<string, Set<string>>();

  for (const product of products) {
    for (const alias of product.aliases) {
      const canonicalAlias = canonicalizeProductAliasName(alias.aliasName);

      if (!canonicalAlias) {
        continue;
      }

      const existing =
        aliasCollisionMap.get(canonicalAlias) ?? new Set<string>();
      existing.add(product.id);
      aliasCollisionMap.set(canonicalAlias, existing);
    }
  }

  return aliasCollisionMap;
}

function mapProductsForOutput(products: ProductWithAliases[]) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    storedCanonicalField: product.normalizedName,
    derivedNormalizedBaseName: deriveNormalizedBaseName(product.normalizedName),
    strength: product.strength,
    formulation: product.dosageForm,
    packSize: product.packSize,
    aliasCount: product.aliases.length,
  }));
}

export function createProductDuplicateReportService(
  overrides?: Partial<DuplicateReportDependencies>,
) {
  const dependencies: DuplicateReportDependencies = {
    listProducts: async () =>
      db.product.findMany({
        include: {
          aliases: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ...overrides,
  };

  return {
    async listLikelyDuplicateGroups(): Promise<ProductDuplicateGroup[]> {
      const products = await dependencies.listProducts();
      const groups: ProductDuplicateGroup[] = [];
      const seenGroupKeys = new Set<string>();

      const structuredGroups = new Map<string, ProductWithAliases[]>();

      for (const product of products) {
        const key = buildStructuredGroupKey(product);
        const existing = structuredGroups.get(key) ?? [];
        existing.push(product);
        structuredGroups.set(key, existing);
      }

      for (const [groupKey, groupedProducts] of structuredGroups.entries()) {
        if (
          groupedProducts.length < 2 ||
          hasStructuredConflicts(groupedProducts)
        ) {
          continue;
        }

        groups.push({
          groupKey: `structured:${groupKey}`,
          reasonCodes: ['STRUCTURED_BASE_NAME_MATCH'],
          confidence: groupedProducts.every(
            (product) =>
              product.strength || product.dosageForm || product.packSize,
          )
            ? 'HIGH'
            : 'MEDIUM',
          products: mapProductsForOutput(groupedProducts),
        });
        seenGroupKeys.add(
          groupedProducts
            .map((product) => product.id)
            .sort()
            .join('|'),
        );
      }

      const aliasCollisionMap = buildAliasCollisionMap(products);

      for (const [canonicalAlias, productIds] of aliasCollisionMap.entries()) {
        if (productIds.size < 2) {
          continue;
        }

        const groupedProducts = products.filter((product) =>
          productIds.has(product.id),
        );
        const stableKey = groupedProducts
          .map((product) => product.id)
          .sort()
          .join('|');

        if (
          seenGroupKeys.has(stableKey) ||
          hasStructuredConflicts(groupedProducts)
        ) {
          continue;
        }

        groups.push({
          groupKey: `alias:${canonicalAlias}`,
          reasonCodes: ['CANONICAL_ALIAS_COLLISION'],
          confidence: groupedProducts.every(
            (product) =>
              product.strength || product.dosageForm || product.packSize,
          )
            ? 'HIGH'
            : 'MEDIUM',
          products: mapProductsForOutput(groupedProducts),
        });
      }

      return groups.sort((left, right) => {
        if (left.confidence !== right.confidence) {
          return left.confidence === 'HIGH' ? -1 : 1;
        }

        return left.groupKey.localeCompare(right.groupKey);
      });
    },
  };
}

export async function listLikelyDuplicateProductGroups(): Promise<
  ProductDuplicateGroup[]
> {
  return createProductDuplicateReportService().listLikelyDuplicateGroups();
}
