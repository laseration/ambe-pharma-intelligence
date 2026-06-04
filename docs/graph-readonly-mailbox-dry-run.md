# Microsoft Graph Read-Only Mailbox Dry-Run

This runbook prepares the first controlled real-mailbox check after the
fake-data and disposable-database pilot smokes. It is a readiness exercise only:
it must not enable live ingestion, mark messages read, download attachment
contents, call OpenAI, send Telegram or email, upload to SharePoint or OneDrive,
or run database migrations.

Use this only with a dedicated pilot mailbox. Do not use a production shared
mailbox, personal mailbox, supplier mailbox, customer mailbox, or mailbox that is
already part of an operational workflow.

## Safety Boundary

- Read-only Microsoft Graph request for unread inbox message summaries only.
- No `EMAIL_INBOUND_POLLING_ENABLED=true`.
- No `Mail.ReadWrite`, `Mail.Send`, Files, Sites, SharePoint, or OneDrive
  permission for this dry-run app.
- No raw email bodies, attachment contents, tokens, Graph payloads, customer or
  supplier records, or full connection strings in notes, tickets, screenshots,
  logs, or chat.
- No managed or live database migrations.
- No OpenAI parser or review fallback.
- No Telegram polling or publishing.
- No outbound email.
- No SharePoint or OneDrive filing.

## Dedicated Pilot Mailbox Setup

1. Create a mailbox used only for the Ambe pilot dry-run, for example a neutral
   internal address owned by the business operations team.
2. Keep automatic forwarding, inbox rules, and shared mailbox delegates disabled
   unless the operator sign-off explicitly lists them.
3. Add only a small number of non-sensitive test messages or explicitly approved
   supplier pilot messages.
4. Keep all messages unread before the dry-run so the before/after unread count
   is easy to compare.
5. Record only the mailbox domain and an internal mailbox label in the runbook
   notes. Do not record the full mailbox address if it identifies a person,
   supplier, or customer.

## Microsoft Graph Permissions

Recommended least-privilege setup:

- Create a separate Microsoft Entra app for the read-only mailbox dry-run.
- Grant Microsoft Graph application permission `Mail.Read` only.
- Restrict the app to the dedicated pilot mailbox with an Exchange application
  access policy or equivalent Application RBAC policy.
- Grant admin consent only after the access restriction is in place.
- Do not grant `Mail.ReadWrite`, `Mail.Send`, `Files.ReadWrite.All`,
  `Sites.ReadWrite.All`, or broad storage permissions.
- Keep this mail app separate from any Microsoft storage app.

Compatibility notes:

- The current preflight command can use the mail-specific Microsoft Graph
  tenant, client ID, client secret, and sender mailbox env vars.
- Avoid the delegated device-code helper for this dry-run unless the permission
  scope has been reviewed separately. The safest path is the dedicated app-only
  `Mail.Read` setup above.
- If the tenant cannot restrict an application permission to one mailbox, do not
  proceed to a real-mailbox dry-run.

## Dry-Run Env Vars

Set these only in the local operator shell or CI environment approved for the
dry-run. Use placeholders in docs and tickets; never paste real secrets.

```bash
NODE_ENV=production
EMAIL_INBOUND_POLLING_ENABLED=false
EMAIL_ALERTS_ENABLED=false
OPENAI_PARSER_ENABLED=false
OPENAI_EMAIL_REVIEW_ENABLED=false
TELEGRAM_POLLING_ENABLED=false
TELEGRAM_DRY_RUN=true
SHAREPOINT_ACCOUNT_OPENING_ENABLED=false
ONEDRIVE_ACCOUNT_OPENING_ENABLED=false

MICROSOFT_MAIL_TENANT_ID=<pilot-tenant-id>
MICROSOFT_MAIL_CLIENT_ID=<pilot-readonly-app-client-id>
MICROSOFT_MAIL_CLIENT_SECRET=<pilot-readonly-app-client-secret>
MICROSOFT_GRAPH_SENDER_MAILBOX=<dedicated-pilot-mailbox>

EMAIL_INBOUND_ALLOWED_SENDERS=<approved-pilot-sender-list>
EMAIL_INBOUND_SUPPLIER_MAPPINGS=<approved-pilot-mapping-list>
GRAPH_USE_IMMUTABLE_IDS=true
GRAPH_USE_MESSAGE_DELTA=true
```

Do not set storage, outbound-send, Telegram publish, OpenAI, or production
database credentials for this run.

## Exact Preflight Command

Run from the repository root after installing dependencies:

```bash
pnpm --filter @ambe/api email:graph-preflight
```

Expected command behavior:

1. Prints mailbox configuration status with the mailbox redacted.
2. Prints credential source and mode, not secret values.
3. Fails before any Graph request if Graph mail is incomplete.
4. Fails before any Graph request if `EMAIL_INBOUND_POLLING_ENABLED=true`.
5. Announces the live read-only Graph call before listing unread summaries.
6. Lists unread message summaries only.

The command must not be followed by any ingestion, polling, reprocess, outbound,
storage, migration, or OpenAI command during this dry-run.

## Safe Output To Record

Record these only after reviewing that they contain no real customer, supplier,
product, price, token, URL credential, or attachment content:

- command exit status;
- generated timestamp;
- unread message count;
- redacted mailbox value, such as `***@example.test`;
- sender domain or redacted sender preview;
- received timestamp;
- attachment count;
- whether the command reported `Dry-run safe: yes`;
- operator initials and sign-off time.

If a subject preview contains real supplier, customer, product, price, or deal
information, replace it in notes with a neutral category such as
`supplier price-list candidate` or `non-pilot message`.

## Output That Must Never Be Recorded

Never record:

- raw email body text;
- attachment file contents or extracted attachment text;
- full attachment payloads or Graph JSON payloads;
- access tokens, refresh tokens, client secrets, session secrets, API keys, or
  authorization headers;
- full `DATABASE_URL` or other connection strings;
- full mailbox addresses that identify a real person, supplier, or customer;
- raw product lists, prices, account numbers, bank details, licenses, or
  customer/supplier-specific commercial terms;
- screenshots that reveal any of the above.

## Confirm No Messages Were Marked Read

Before the dry-run:

1. In Outlook or Microsoft 365 admin tooling, record the unread count for the
   dedicated pilot mailbox.
2. Pick one known unread pilot message and record only a redacted identifier such
   as received time plus sender domain. Do not record the Graph message ID if it
   is treated as sensitive in the tenant.

After the dry-run:

1. Refresh the mailbox view and confirm the unread count is unchanged.
2. Confirm the known unread pilot message is still unread.
3. If using an audit log, confirm there were read/list operations only and no
   update, patch, send, delete, or attachment-content download operation.
4. If any message was marked read, stop immediately, disable the dry-run app
   credential, preserve only safe metadata, and open an incident note.

## Confirm No Live Side Effects Happened

After the dry-run, confirm all of these:

- `EMAIL_INBOUND_POLLING_ENABLED` remained `false`.
- No worker was started for inbound email polling.
- No new inbound email rows or workflow items were created from the pilot
  mailbox.
- No email was sent.
- No Telegram message was sent or polled.
- No OpenAI request was made.
- No SharePoint or OneDrive file was created.
- No customer, supplier, or outbound system was called.
- No managed/live database migration was run.

Use only safe counts and timestamps in the sign-off record.

## Operator Sign-Off Checklist

- Dedicated pilot mailbox created and approved.
- Mailbox contains only approved pilot messages or non-sensitive test messages.
- Microsoft Graph app is separate from storage and outbound-send apps.
- App has `Mail.Read` only.
- App access is restricted to the dedicated pilot mailbox.
- Admin consent is complete.
- Polling is disabled.
- Sender allowlist and supplier mappings are reviewed.
- OpenAI, Telegram, outbound email, SharePoint, and OneDrive are disabled.
- Before-run unread count is recorded safely.
- `pnpm --filter @ambe/api email:graph-preflight` completed.
- After-run unread count matched the before-run count.
- Known unread pilot message stayed unread.
- No live side effects were observed.
- Go/no-go decision was recorded with operator initials and date.

## Rollback And Disable Steps

If the command fails, output looks unsafe, or any side effect is suspected:

1. Keep `EMAIL_INBOUND_POLLING_ENABLED=false`.
2. Remove or rotate `MICROSOFT_MAIL_CLIENT_SECRET`.
3. Disable the dedicated dry-run app registration or remove admin consent.
4. Remove the Exchange application access policy if it was created only for this
   dry-run.
5. Clear local shell history or secure it according to company policy if secrets
   were typed interactively.
6. Delete any unsafe local log files or screenshots after preserving only safe
   incident metadata.
7. Do not retry until the cause is reviewed and signed off.

## Go/No-Go Criteria Before Real Inbound Pilot

Go only when all are true:

- The dry-run command passed using the dedicated pilot mailbox.
- The mailbox unread count was unchanged.
- The known unread pilot message stayed unread.
- The output contained only safe redacted summaries.
- The operator sign-off checklist is complete.
- At least one operator and one technical owner agree the sender allowlist and
  supplier mappings are correct.
- The next pilot step has a separate written plan for enabling ingestion.

No-go if any are true:

- Graph app access cannot be restricted to the dedicated pilot mailbox.
- Any message was marked read.
- Any raw body, attachment content, token, Graph payload, full mailbox address,
  or full connection string appeared in recorded output.
- Polling was enabled during the dry-run.
- Any OpenAI, Telegram, outbound email, SharePoint, OneDrive, customer, supplier,
  or managed database side effect occurred.
- Operators cannot explain how to disable the app and keep polling off.
