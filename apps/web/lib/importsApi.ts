import 'server-only';

import { requestInternalJson } from './internalApiRequest';

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

const CALLER_NAME = 'web-imports';

async function requestJson<T>(path: string): Promise<T> {
  return requestInternalJson<T>(path, {
    callerName: CALLER_NAME,
  });
}

export async function listRecentImportBatches(
  take = 20,
): Promise<ImportBatchListItem[]> {
  const payload = await requestJson<{ items: ImportBatchListItem[] }>(
    `/imports/batches?take=${encodeURIComponent(String(take))}`,
  );
  return payload.items;
}

export async function getImportBatchDetail(
  importBatchId: string,
): Promise<ImportBatchDetail> {
  const payload = await requestJson<{ item: ImportBatchDetail }>(
    `/imports/batches/${encodeURIComponent(importBatchId)}`,
  );
  return payload.item;
}
