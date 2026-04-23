import 'server-only';

export type ProductDuplicateGroup = {
  groupKey: string;
  reasonCodes: Array<'STRUCTURED_BASE_NAME_MATCH' | 'CANONICAL_ALIAS_COLLISION'>;
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

function getInternalApiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INTERNAL_API_BASE_URL?.trim() ||
    'http://127.0.0.1:4000/api'
  );
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const apiKey =
    process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_ADMIN_API_KEY?.trim() || '';

  if (apiKey) {
    headers['x-internal-api-key'] = apiKey;
    headers['x-internal-caller-name'] = 'web-products';
  }

  return headers;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
    cache: 'no-store',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the generic status-based message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function listLikelyDuplicateProductGroups(): Promise<ProductDuplicateGroup[]> {
  const payload = await requestJson<{ items: ProductDuplicateGroup[] }>('/products/likely-duplicates');
  return payload.items;
}
