import 'server-only';

export type ImportBatchListItem = {
  id: string;
  kind: 'SUPPLIER_PRICE_LIST' | 'INVENTORY' | 'SALES';
  status: string;
  fileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  errorCount: number;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatchErrorItem = {
  id: string;
  rowNumber: number | null;
  fieldName: string | null;
  message: string;
  rawRow: unknown;
  createdAt: string;
};

export type ImportBatchDetail = ImportBatchListItem & {
  warnings: string[];
  errors: ImportBatchErrorItem[];
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
    headers['x-internal-caller-name'] = 'web-imports';
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

export async function listRecentImportBatches(take = 20): Promise<ImportBatchListItem[]> {
  const payload = await requestJson<{ items: ImportBatchListItem[] }>(
    `/imports/batches?take=${encodeURIComponent(String(take))}`,
  );
  return payload.items;
}

export async function getImportBatchDetail(importBatchId: string): Promise<ImportBatchDetail> {
  const payload = await requestJson<{ item: ImportBatchDetail }>(
    `/imports/batches/${encodeURIComponent(importBatchId)}`,
  );
  return payload.item;
}
