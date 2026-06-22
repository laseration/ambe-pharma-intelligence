/**
 * Validation and normalisation for creating a NEW client organisation (i.e. not
 * the environment-seeded default). Pure and dependency-free so it can be unit
 * tested and reused by the provisioning script and any future admin API.
 */

export type NewOrganizationInput = {
  slug: string;
  name: string;
  internalEmailDomains: string[];
  internalCompanyNames: string[];
  alertEmailRecipients: string[];
  reviewEmailRecipients: string[];
  senderMailbox: string | null;
  telegramInternalChatId: string | null;
  accountOpeningProfile: Record<string, string>;
};

// Lowercase, numbers, single hyphens (URL/subdomain-safe).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Organisation config must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Organisation config field "${key}" is required.`);
  }
  return value.trim();
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`Organisation config field "${key}" must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function stringList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new Error(
      `Organisation config field "${key}" must be an array of strings.`,
    );
  }
  return value.map((entry) => (entry as string).trim()).filter(Boolean);
}

function stringRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, string> {
  const value = record[key];
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Organisation config field "${key}" must be an object.`);
  }
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof entryValue !== 'string') {
      throw new Error(
        `Organisation config "${key}.${entryKey}" must be a string.`,
      );
    }
    result[entryKey] = entryValue;
  }
  return result;
}

export function normalizeNewOrganizationInput(
  raw: unknown,
): NewOrganizationInput {
  const record = asRecord(raw);
  const slug = requireString(record, 'slug').toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Organisation slug "${slug}" is invalid: use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return {
    slug,
    name: requireString(record, 'name'),
    internalEmailDomains: stringList(record, 'internalEmailDomains'),
    internalCompanyNames: stringList(record, 'internalCompanyNames'),
    alertEmailRecipients: stringList(record, 'alertEmailRecipients'),
    reviewEmailRecipients: stringList(record, 'reviewEmailRecipients'),
    senderMailbox: optionalString(record, 'senderMailbox'),
    telegramInternalChatId: optionalString(record, 'telegramInternalChatId'),
    accountOpeningProfile: stringRecord(record, 'accountOpeningProfile'),
  };
}
