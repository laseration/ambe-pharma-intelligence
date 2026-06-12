export type CustomerListPathOptions = {
  q?: string | null;
  activeOnly?: boolean | null;
  limit?: number | null;
  page?: number | null;
};

export type CustomerContactOpportunityPathOptions = {
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

export function buildCustomerListPath(
  options: CustomerListPathOptions = {},
): string {
  const searchParams = new URLSearchParams();

  appendString(searchParams, 'q', options.q);
  appendBoolean(searchParams, 'activeOnly', options.activeOnly);
  appendNumber(searchParams, 'limit', options.limit);
  appendNumber(searchParams, 'page', options.page);

  return withQuery('/customers', searchParams);
}

export function buildCustomerDetailPath(customerId: string): string {
  return `/customers/${encodeURIComponent(customerId)}`;
}

export function buildCustomerContactOpportunitiesPath(
  options: CustomerContactOpportunityPathOptions = {},
): string {
  const searchParams = new URLSearchParams();

  appendNumber(searchParams, 'limit', options.limit);

  return withQuery('/customers/contact-opportunities', searchParams);
}
