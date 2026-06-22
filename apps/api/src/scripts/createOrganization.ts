import { readFileSync } from 'node:fs';

import { normalizeNewOrganizationInput } from '../organization/newOrganization';
import { createOrganization } from '../organization/organizationService';

/**
 * Provision a new client organisation from a JSON config file.
 *
 * Usage: tsx src/scripts/createOrganization.ts <config.json>
 *
 * The config is the per-company settings (slug, name, internal domains/company
 * names, alert/review recipients, optional sender mailbox / Telegram chat, and
 * the account-opening profile). See docs/saas-productisation-roadmap.md.
 */
async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: tsx src/scripts/createOrganization.ts <config.json>');
    process.exit(1);
  }

  const raw: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const input = normalizeNewOrganizationInput(raw);
  const organization = await createOrganization(input);

  console.log(
    `Created organisation: ${organization.name} ` +
      `(slug=${organization.slug}, id=${organization.id})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      'Failed to create organisation:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
