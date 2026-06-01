import {
  createGraphMailDryRunService,
  getGraphMailPreflightStatus,
} from '../email/graphPreflight';

function printPreflightStatus(): ReturnType<
  typeof getGraphMailPreflightStatus
> {
  const status = getGraphMailPreflightStatus();

  console.log('Microsoft Graph inbox preflight');
  console.log('================================');
  console.log(`Mailbox configured: ${status.mailboxConfigured ? 'yes' : 'no'}`);
  console.log(`Mailbox: ${status.mailbox ?? 'n/a'}`);
  console.log(`Credential source: ${status.credentialSource}`);
  console.log(`Credential mode: ${status.credentialMode}`);
  console.log(`Graph configured: ${status.graphConfigured ? 'yes' : 'no'}`);
  console.log(`Polling enabled: ${status.pollingEnabled ? 'yes' : 'no'}`);
  console.log(`Allowed sender count: ${status.allowedSenderCount}`);
  console.log(`Supplier mapping count: ${status.supplierMappingCount}`);
  console.log(`Dry-run safe: ${status.dryRunSafe ? 'yes' : 'no'}`);

  if (status.warnings.length > 0) {
    console.log('');
    console.log('Warnings');
    console.log('--------');
    for (const warning of status.warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log('');
  console.log(`Next action: ${status.nextAction}`);

  return status;
}

async function run() {
  const status = printPreflightStatus();

  if (!status.graphConfigured || !status.mailboxConfigured) {
    console.error('');
    console.error(
      'FAIL: Microsoft Graph mail is not fully configured. No Graph request was made.',
    );
    process.exitCode = 1;
    return;
  }

  if (status.pollingEnabled) {
    console.error('');
    console.error(
      'FAIL: EMAIL_INBOUND_POLLING_ENABLED is true. Disable polling before running read-only dry-run.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(
    'LIVE READ-ONLY Microsoft Graph call: listing unread inbox message summaries only.',
  );
  console.log(
    'This command does not mark messages read, ingest messages, save email content, download attachment content, call OpenAI, call Telegram, or send email.',
  );

  const result = await createGraphMailDryRunService().runDryRun();

  console.log('');
  console.log('Dry-run result');
  console.log('--------------');
  console.log(`Generated at: ${result.generatedAt}`);
  console.log(`Unread message summaries: ${result.messageCount}`);

  if (result.messages.length === 0) {
    console.log('No unread candidate messages were returned.');
    return;
  }

  for (const message of result.messages) {
    console.log(
      [
        `#${message.messageIndex}`,
        `received=${message.receivedDateTime ?? 'n/a'}`,
        `sender=${message.senderPreview}`,
        `domain=${message.senderDomain ?? 'n/a'}`,
        `attachments=${message.attachmentCount}`,
        `subject="${message.subjectPreview}"`,
      ].join(' | '),
    );
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(
      `FAIL: ${error instanceof Error ? error.message : 'Graph inbox preflight failed.'}`,
    );
    process.exit(1);
  });
}
