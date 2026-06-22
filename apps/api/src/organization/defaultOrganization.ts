import { getAccountOpeningMasterProfile } from '../accountOpening/masterProfile';
import { env } from '../config/env';

/**
 * Slug of the single default organisation the system runs as today. Kept stable
 * so the seed is idempotent and downstream code can resolve "the current org"
 * before per-request tenant resolution exists.
 */
export const DEFAULT_ORGANIZATION_SLUG = 'ambe';

/**
 * The raw inputs that describe the default organisation. Kept as an explicit
 * shape (rather than reading `env` inline) so the mapping is unit-testable
 * without environment or database access.
 */
export type DefaultOrganizationSource = {
  legalCompanyName: string;
  internalEmailDomains: string[];
  internalCompanyNames: string[];
  alertEmailRecipients: string[];
  reviewEmailRecipients: string[];
  senderMailbox: string;
  telegramInternalChatId: string;
  accountOpeningProfile: Record<string, string>;
};

export type DefaultOrganizationInput = {
  slug: string;
  name: string;
  status: string;
  isDefault: boolean;
  internalEmailDomains: string[];
  internalCompanyNames: string[];
  alertEmailRecipients: string[];
  reviewEmailRecipients: string[];
  senderMailbox: string | null;
  telegramInternalChatId: string | null;
  accountOpeningProfile: Record<string, string>;
};

/**
 * Pure mapping from raw config to the default organisation record. The display
 * name prefers the legal company name, then the first internal company-name
 * variant, then a safe constant — so a misconfigured deployment still seeds a
 * sensibly-named org rather than an empty string.
 */
export function buildDefaultOrganizationInput(
  source: DefaultOrganizationSource,
): DefaultOrganizationInput {
  const name =
    source.legalCompanyName.trim() ||
    source.internalCompanyNames[0]?.trim() ||
    'Ambe Medical Group';

  return {
    slug: DEFAULT_ORGANIZATION_SLUG,
    name,
    status: 'ACTIVE',
    isDefault: true,
    internalEmailDomains: source.internalEmailDomains,
    internalCompanyNames: source.internalCompanyNames,
    alertEmailRecipients: source.alertEmailRecipients,
    reviewEmailRecipients: source.reviewEmailRecipients,
    senderMailbox: source.senderMailbox.trim() || null,
    telegramInternalChatId: source.telegramInternalChatId.trim() || null,
    accountOpeningProfile: source.accountOpeningProfile,
  };
}

/** Collect the default-organisation source from the current environment. */
export function defaultOrganizationSourceFromEnv(): DefaultOrganizationSource {
  return {
    legalCompanyName: env.accountOpeningProfileLegalCompanyName,
    internalEmailDomains: env.emailInboundInternalDomains,
    internalCompanyNames: env.emailInboundInternalCompanyNames,
    alertEmailRecipients: env.internalAlertEmailRecipients,
    reviewEmailRecipients: env.accountOpeningReviewEmailRecipients,
    senderMailbox: env.microsoftGraphSenderMailbox,
    telegramInternalChatId: env.telegramInternalChatId,
    accountOpeningProfile: getAccountOpeningMasterProfile().values,
  };
}

export function buildDefaultOrganizationInputFromEnv(): DefaultOrganizationInput {
  return buildDefaultOrganizationInput(defaultOrganizationSourceFromEnv());
}
