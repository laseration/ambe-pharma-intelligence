import { ensureDefaultOrganization } from '../organization/organizationService';

/**
 * Seed (or confirm) the default organisation from environment config. Safe to
 * run repeatedly — an existing organisation is left untouched. Intended to run
 * once after the Organization migration is deployed.
 */
async function main(): Promise<void> {
  const organization = await ensureDefaultOrganization();
  console.log(
    `Default organisation ready: ${organization.name} ` +
      `(slug=${organization.slug}, id=${organization.id})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to seed default organisation:', error);
    process.exit(1);
  });
