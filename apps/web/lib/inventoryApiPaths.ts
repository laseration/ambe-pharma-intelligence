export type InventoryListPathOptions = {
  q?: string | null;
  productId?: string | null;
  supplierId?: string | null;
  lowStockOnly?: boolean | null;
  staleOnly?: boolean | null;
  limit?: number | null;
  page?: number | null;
};

export type StockRiskPathOptions = {
  limit?: number | null;
};

function appendString(
  searchParams: URLSearchParams,
  key: string,
  value: string | null | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    searchParams.set(key, trimmed);
  }
}

function appendBoolean(
  searchParams: URLSearchParams,
  key: string,
  value: boolean | null | undefined,
) {
  if (value !== null && value !== undefined) {
    searchParams.set(key, String(value));
  }
}

function appendNumber(
  searchParams: URLSearchParams,
  key: string,
  value: number | null | undefined,
) {
  if (value !== null && value !== undefined) {
    searchParams.set(key, String(value));
  }
}

function withQuery(path: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function buildInventoryListPath(
  options: InventoryListPathOptions = {},
): string {
  const searchParams = new URLSearchParams();

  appendString(searchParams, 'q', options.q);
  appendString(searchParams, 'productId', options.productId);
  appendString(searchParams, 'supplierId', options.supplierId);
  appendBoolean(searchParams, 'lowStockOnly', options.lowStockOnly);
  appendBoolean(searchParams, 'staleOnly', options.staleOnly);
  appendNumber(searchParams, 'limit', options.limit);
  appendNumber(searchParams, 'page', options.page);

  return withQuery('/inventory', searchParams);
}

export function buildStockRiskPath(options: StockRiskPathOptions = {}): string {
  const searchParams = new URLSearchParams();

  appendNumber(searchParams, 'limit', options.limit);

  return withQuery('/inventory/stock-risk', searchParams);
}
