import type { Organization } from '@prisma/client';

import { env } from '../config/env';
import { getDefaultOrganization } from './organizationService';

/**
 * In-memory snapshot of the active organisation's configuration, loaded once at
 * startup. Every getter falls back to environment configuration when the cache
 * is empty (before the organisation is seeded, in tests, or if the load failed),
 * so behaviour is identical to the pre-tenancy system until an organisation row
 * exists and diverges from env.
 *
 * The cache is intentionally a single active organisation: today the deployment
 * serves one company. Per-request (multi-org) resolution is a later step; this
 * module is the seam that work will extend.
 */
export type ActiveOrganizationConfig = {
  organizationId: string;
  internalEmailDomains: string[];
  internalCompanyNames: string[];
  alertEmailRecipients: string[];
  reviewEmailRecipients: string[];
  accountOpeningProfileValues: Record<string, string>;
};

type ActiveOrganizationSource = Pick<
  Organization,
  | 'id'
  | 'internalEmailDomains'
  | 'internalCompanyNames'
  | 'alertEmailRecipients'
  | 'reviewEmailRecipients'
  | 'accountOpeningProfile'
>;

let cache: ActiveOrganizationConfig | null = null;

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}

/**
 * Pure mapping from an organisation row to the cached config, applying env
 * fallbacks for any list that is missing or malformed in the database.
 */
export function buildActiveOrganizationConfig(
  org: ActiveOrganizationSource,
): ActiveOrganizationConfig {
  return {
    organizationId: org.id,
    internalEmailDomains:
      toStringArray(org.internalEmailDomains) ??
      env.emailInboundInternalDomains,
    internalCompanyNames:
      toStringArray(org.internalCompanyNames) ??
      env.emailInboundInternalCompanyNames,
    alertEmailRecipients:
      toStringArray(org.alertEmailRecipients) ??
      env.internalAlertEmailRecipients,
    reviewEmailRecipients:
      toStringArray(org.reviewEmailRecipients) ??
      env.accountOpeningReviewEmailRecipients,
    accountOpeningProfileValues: toStringRecord(org.accountOpeningProfile),
  };
}

/**
 * Load the active (default) organisation into the cache. Pass an organisation
 * explicitly (e.g. in tests) to avoid a database read; pass nothing to resolve
 * the default organisation from the database. A missing organisation clears the
 * cache so callers fall back to env.
 */
export async function loadActiveOrganizationConfig(
  organization?: ActiveOrganizationSource | null,
): Promise<ActiveOrganizationConfig | null> {
  const org =
    organization !== undefined ? organization : await getDefaultOrganization();
  cache = org ? buildActiveOrganizationConfig(org) : null;
  return cache;
}

/** Reset the cache (primarily for tests). */
export function clearActiveOrganizationConfigCache(): void {
  cache = null;
}

export function getActiveInternalEmailDomains(): string[] {
  return cache?.internalEmailDomains ?? env.emailInboundInternalDomains;
}

export function getActiveInternalCompanyNames(): string[] {
  return cache?.internalCompanyNames ?? env.emailInboundInternalCompanyNames;
}

export function getActiveAlertEmailRecipients(): string[] {
  return cache?.alertEmailRecipients ?? env.internalAlertEmailRecipients;
}

export function getActiveReviewEmailRecipients(): string[] {
  return (
    cache?.reviewEmailRecipients ?? env.accountOpeningReviewEmailRecipients
  );
}

/**
 * The active org's account-opening profile values, or null if no organisation is
 * loaded — letting the master-profile builder fall back to env per field.
 */
export function getActiveAccountOpeningProfileValues(): Record<
  string,
  string
> | null {
  if (!cache) {
    return null;
  }
  return Object.keys(cache.accountOpeningProfileValues).length > 0
    ? cache.accountOpeningProfileValues
    : null;
}
