# Operator-Safe Troubleshooting

This guide covers pilot support diagnostics for Ambe Pharma Intelligence. It is
for internal operators and engineers. Do not paste raw supplier emails,
attachment contents, access tokens, connection strings, or `.env` values into
issue comments or external tools.

## Error Response Contract

API errors use a standard safe payload:

```json
{
  "error": {
    "message": "Request validation failed.",
    "code": "VALIDATION_ERROR",
    "requestId": "request-abcdef12",
    "nextAction": "Check the submitted fields and try again."
  }
}
```

The same request id is also returned in the `x-request-id` response header. Use
that id to find the matching API log line.

The API response must not include stack traces, secrets, full connection
strings, raw email bodies, or full file contents. Server logs keep technical
details, but the logger redacts likely secret fields and large payload-like
values by default.

## Dashboard Diagnostics

Authenticated operators can open:

```text
/dashboard/setup/diagnostics
```

This page shows:

- setup readiness summary from `GET /api/system/readiness`
- email and Telegram worker status from `GET /api/system/workers`
- safe last-error messages and next checks
- links back to setup, inbox, and imports

Use this page before escalating a pilot issue. It does not send email, call
Telegram, call OpenAI, mutate imports, or write Microsoft Graph data.

## Common Failures

### Dashboard says API request failed

Check:

- API process is running.
- `INTERNAL_API_BASE_URL` points to the API `/api` base URL.
- `INTERNAL_API_KEY` or `INTERNAL_ADMIN_API_KEY` matches the API configuration.
- The error message request id appears in API logs.

### Unauthorized or forbidden

Check:

- Web session has the required internal role.
- Web auth env vars are configured in `apps/web/.env`.
- API internal auth env vars are configured in `apps/api/.env`.
- The web server was restarted after env changes.

Login failures should not reveal whether the username or password was wrong.

### Import failed or produced weak data

Check:

- `/dashboard/imports` and the import detail page.
- detected columns, invalid row samples, warning categories, and suggested fixes.
- file size and file type.
- whether raw row previews are redacted before sharing internally.

Do not attach real supplier files to external support tickets. Use sanitized
fixtures or templates from [import-templates.md](import-templates.md).

### Email polling is not creating review items

Check:

- `pnpm --filter @ambe/api email:graph-preflight` while polling is still
  disabled.
- `/dashboard/setup/diagnostics` worker status.
- `EMAIL_INBOUND_POLLING_ENABLED`.
- Microsoft Graph mail credentials and `MICROSOFT_GRAPH_SENDER_MAILBOX`.
- sender allowlists and supplier mappings.
- worker `lastError` and request id if present.

The email poller should leave valid failed messages unread for retry. It should
not store raw email bodies in worker status or logs.

### Graph inbox preflight fails

Check:

- `MICROSOFT_GRAPH_SENDER_MAILBOX` is set to the dedicated intake mailbox.
- Mail credential source is expected: `MICROSOFT_MAIL_*` values first, or the
  legacy `MICROSOFT_GRAPH_*` fallback.
- Either `MICROSOFT_MAIL_CLIENT_SECRET` or
  `MICROSOFT_GRAPH_REFRESH_TOKEN` is set.
- Microsoft Graph permissions and admin consent are present for read access.
- `EMAIL_INBOUND_POLLING_ENABLED=false` during preflight and dry-run.
- `EMAIL_INBOUND_ALLOWED_SENDERS` contains the owner forwarding address,
  trusted supplier addresses, or trusted supplier domains.

The preflight dry-run should only show message count, redacted sender/domain,
truncated subject, received timestamp, and attachment count. If a diagnostic
output includes a full body, token, full Graph payload, attachment content, or
marks messages read, stop and treat that as a safety issue.

### Telegram polling is not importing files

Check:

- `/dashboard/setup/diagnostics` worker status.
- `TELEGRAM_POLLING_ENABLED`.
- `TELEGRAM_BOT_TOKEN`.
- allowed user and chat ids.
- duplicate message id handling if the same file was sent repeatedly.

Telegram errors shown to operators should avoid raw update payloads and tokens.

### Internal server error

Check:

- request id in the dashboard error message.
- API logs for the same request id.
- database connectivity and Prisma startup logs.
- integration readiness on `/dashboard/setup`.
- worker status if the error is ingestion related.

Never expose server stack traces to operators or customers.

## Redaction Expectations

Logs and operator messages should redact or avoid:

- `Authorization` headers, cookies, API keys, tokens, and passwords
- `DATABASE_URL` and other PostgreSQL connection strings
- Microsoft, Telegram, OpenAI, and web session secrets
- raw email bodies and forwarded message bodies
- attachment contents and file content buffers
- full imported source rows outside the operator/admin import context

Safe diagnostics may include:

- request id
- status code and internal error code
- endpoint path without secret query values
- readiness flags
- worker timestamps and counts
- redacted last-error message
- environment variable names, not values
