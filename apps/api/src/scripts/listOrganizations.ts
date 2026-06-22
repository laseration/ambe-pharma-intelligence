import { listOrganizations } from '../organization/organizationService';

/**
 * List all organisations (default marked with `*`). Read-only.
 *
 * Usage: tsx src/scripts/listOrganizations.ts
 */
async function main(): Promise<void> {
  const organizations = await listOrganizations();

  if (organizations.length === 0) {
    console.log(
      'No organisations found. Run seedDefaultOrganization.ts to create the default.',
    );
    return;
  }

  for (const organization of organizations) {
    const marker = organization.isDefault ? '*' : ' ';
    console.log(
      `${marker} ${organization.slug.padEnd(20)} ${organization.status.padEnd(
        10,
      )} ${organization.name}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      'Failed to list organisations:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
