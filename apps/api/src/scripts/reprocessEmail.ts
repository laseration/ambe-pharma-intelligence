import {
  reprocessEmailMessages,
  type EmailReprocessOptions,
} from '../email/reprocess';

function printUsage(): void {
  console.log(`Usage:
pnpm --filter @ambe/api email:reprocess -- --subject-contains "account opening" --include-read --limit 10
pnpm --filter @ambe/api email:reprocess -- --subject-contains "account opening" --from sender@example.com --include-read --force-account-opening --execute

Options:
  --subject-contains <text>     Filter by subject substring.
  --from <email-or-domain>      Filter by exact sender email or sender domain.
  --since <date>                Filter by received date, for example 2026-05-19.
  --limit <number>              Maximum matched messages to report or process. Default 10, max 50.
  --include-read                Include read/already-seen inbox messages.
  --unread-only                 Only include unread messages. This is the default.
  --force-account-opening       Refresh an already-ingested account-opening message.
  --execute                     Perform reprocessing. Without this, the command is dry-run/list only.
  --dry-run, --list             Explicit dry-run/list mode.
  --help                        Show this help.
`);
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

export function parseEmailReprocessArgs(args: string[]): EmailReprocessOptions {
  const options: EmailReprocessOptions = {
    limit: 10,
    includeRead: false,
    unreadOnly: true,
    dryRun: true,
    forceAccountOpening: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--subject-contains') {
      options.subjectContains = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--from') {
      options.from = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--since') {
      const value = readValue(args, index, arg);
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('--since must be a valid date.');
      }
      options.since = parsed;
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const parsed = Number(readValue(args, index, arg));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive integer.');
      }
      options.limit = parsed;
      index += 1;
      continue;
    }

    if (arg === '--include-read') {
      options.includeRead = true;
      options.unreadOnly = false;
      continue;
    }

    if (arg === '--unread-only') {
      options.unreadOnly = true;
      options.includeRead = false;
      continue;
    }

    if (arg === '--force-account-opening') {
      options.forceAccountOpening = true;
      continue;
    }

    if (arg === '--execute') {
      options.dryRun = false;
      continue;
    }

    if (arg === '--dry-run' || arg === '--list') {
      options.dryRun = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseEmailReprocessArgs(process.argv.slice(2));
  const results = await reprocessEmailMessages(options);

  for (const result of results) {
    console.log(
      JSON.stringify(
        {
          action: result.action,
          externalMessageId: result.externalMessageId,
          from: result.from,
          subject: result.subject,
          receivedAt: result.receivedAt,
          isRead: result.isRead,
          existingInboundEmailId: result.existingInboundEmailId,
          correlationId: result.correlationId,
          sideEffectOperation: result.sideEffectOperation,
          sideEffectPolicy: result.sideEffectPolicy,
          accountOpeningCandidate: result.accountOpeningCandidate,
          matchedTerms: result.matchedTerms,
          classificationReason: result.classificationReason,
          attachmentFileNames: result.attachmentFileNames,
          note: result.note,
          itemCount: result.itemCount,
          error: result.error,
        },
        null,
        2,
      ),
    );
  }

  if (results.length === 0) {
    console.log('No matching messages found.');
  }

  const failed = results.some((result) => result.action === 'FAILED');
  if (failed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Email reprocess failed.',
    );
    process.exit(1);
  });
}
