import { db } from '../lib/db';
import {
  importAccountOpeningEmlFile,
  MANUAL_ACCOUNT_OPENING_EML_SOURCE_SYSTEM,
} from '../email/manualAccountOpeningImport';
import {
  ACCOUNT_OPENING_IMPORT_EXAMPLE_COMMAND,
  AccountOpeningEmlPathError,
  resolveExistingAccountOpeningEmlPath,
} from './importAccountOpeningEmlPath';

function parseArgs(argv: string[]) {
  const args = {
    filePath: '',
    sourceSystem: MANUAL_ACCOUNT_OPENING_EML_SOURCE_SYSTEM,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    const nextValue = argv[index + 1];

    if ((arg === '--file' || arg === '--eml') && nextValue) {
      args.filePath = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--source-system' && nextValue) {
      args.sourceSystem = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return null;
    }
  }

  return args;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      `  ${ACCOUNT_OPENING_IMPORT_EXAMPLE_COMMAND}`,
      '  pnpm --filter @ambe/api account-opening:import-eml -- --file "D:\\\\Pilot Emails\\\\message.eml"',
      '',
      'Safety:',
      '  Parses one local .eml file and queues an account-opening case for internal review.',
      '  Does not start workers, poll Graph/mailboxes, send email, sign, submit, archive, or file to SharePoint/OneDrive.',
    ].join('\n'),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args?.filePath) {
    printUsage();
    process.exitCode = args ? 1 : 0;
    return;
  }

  const filePath = await resolveExistingAccountOpeningEmlPath({
    providedPath: args.filePath,
  });
  const result = await importAccountOpeningEmlFile({
    filePath: filePath.resolvedPath,
    sourceSystem: args.sourceSystem,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof AccountOpeningEmlPathError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Manual account-opening .eml import failed.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
