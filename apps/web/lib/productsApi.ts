import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type ProductDuplicateGroup = {
  groupKey: string;
  reasonCodes: Array<
    'STRUCTURED_BASE_NAME_MATCH' | 'CANONICAL_ALIAS_COLLISION'
  >;
  confidence: 'HIGH' | 'MEDIUM';
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

const CALLER_NAME = 'web-products';

async function requestJson<T>(path: string): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
    requiredCapability: 'products:view',
  });
}

export async function listLikelyDuplicateProductGroups(): Promise<
  ProductDuplicateGroup[]
> {
  const payload = await requestJson<{ items: ProductDuplicateGroup[] }>(
    '/products/likely-duplicates',
  );
  return payload.items;
}
