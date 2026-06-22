import type { Organization } from '@prisma/client';

import { db } from '../lib/db';
import {
  DEFAULT_ORGANIZATION_SLUG,
  buildDefaultOrganizationInputFromEnv,
} from './defaultOrganization';
import type { NewOrganizationInput } from './newOrganization';

/**
 * Create the default ("Ambe") organisation from environment config if it does
 * not already exist. Idempotent and non-destructive: an existing row is returned
 * untouched, so operator edits made in the database are never clobbered by a
 * re-run of the seed.
 */
export async function ensureDefaultOrganization(): Promise<Organization> {
  const existing = await db.organization.findUnique({
    where: { slug: DEFAULT_ORGANIZATION_SLUG },
  });
  if (existing) {
    return existing;
  }

  return db.organization.create({
    data: buildDefaultOrganizationInputFromEnv(),
  });
}

/** Return the default organisation, or null if it has not been seeded yet. */
export async function getDefaultOrganization(): Promise<Organization | null> {
  return db.organization.findFirst({
    where: { isDefault: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Resolve the organisation id the current process should operate as. Today this
 * always resolves to the single default organisation; it is the single seam that
 * future request-scoped tenant resolution will replace, so callers can start
 * depending on it now without changing behaviour.
 */
export async function resolveActiveOrganizationId(): Promise<string> {
  const organization =
    (await getDefaultOrganization()) ?? (await ensureDefaultOrganization());
  return organization.id;
}

/**
 * Create a new (non-default) client organisation. Throws if the slug is already
 * taken so provisioning fails loudly rather than silently duplicating a client.
 */
export async function createOrganization(
  input: NewOrganizationInput,
): Promise<Organization> {
  const existing = await db.organization.findUnique({
    where: { slug: input.slug },
  });
  if (existing) {
    throw new Error(
      `An organisation with slug "${input.slug}" already exists.`,
    );
  }

  return db.organization.create({
    data: {
      slug: input.slug,
      name: input.name,
      status: 'ACTIVE',
      isDefault: false,
      internalEmailDomains: input.internalEmailDomains,
      internalCompanyNames: input.internalCompanyNames,
      alertEmailRecipients: input.alertEmailRecipients,
      reviewEmailRecipients: input.reviewEmailRecipients,
      senderMailbox: input.senderMailbox,
      telegramInternalChatId: input.telegramInternalChatId,
      accountOpeningProfile: input.accountOpeningProfile,
    },
  });
}

/** List all organisations, default first then alphabetical by name. */
export async function listOrganizations(): Promise<Organization[]> {
  return db.organization.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}
