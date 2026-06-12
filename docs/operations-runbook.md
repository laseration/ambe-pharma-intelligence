# Operations Runbook

This runbook covers pilot operation for ingestion workers. It is intentionally
limited to safe checks and recovery steps that do not send messages, mutate
canonical records, or expose raw supplier email content.

For VPS process layout, deployment smoke checks, rollback, and broader incident
response, use [deployment.md](deployment.md).

## Worker Status

Authenticated internal callers can inspect polling status with:

```text
GET /api/system/workers
```

The dashboard setup page also shows this status at:

```text
/dashboard/setup
```

The API stores safe worker snapshots in `AppSetting` keys named
`polling.workerStatus.email-inbound` and `polling.workerStatus.telegram`.
Snapshots include:

- enabled/configured/running/in-flight flags
- last start, stop, run, success, and error timestamps
- last redacted error message
- total runs
- processed, skipped, failed, and duplicate-skip counters

The snapshots must not include raw email bodies, attachment bytes, Telegram
payloads, tokens, Graph response bodies, database URLs, or API keys.

## Email Inbox Polling

The email worker reads unread Microsoft Graph inbox messages oldest-first.

Successful handling:

- imports or stages the message through the inbound email pipeline
- marks the Graph message read only after successful handling
- increments processed counters

Safe skips:

- malformed messages without a usable sender can be marked read so they do not
  block the inbox loop
- duplicate already-processed Graph message IDs are marked read and counted as
  duplicate skips

Failures:

- a valid message that fails during handling is left unread for retry
- the worker logs a redacted error, increments failed counters, and continues to
  the next message
- Microsoft Graph rate limits report status `429`, optional retry-after seconds,
  Graph error code, and request ID without storing the raw response body

If failures repeat, check:

1. Microsoft Graph app permissions and admin consent.
2. `MICROSOFT_GRAPH_SENDER_MAILBOX`.
3. sender allowlists and supplier mappings.
4. recent `lastError` and `consecutiveFailures` in `/api/system/workers`.

## Telegram Polling

Telegram polling uses `getUpdates` with a monotonically increasing offset.

Successful handling:

- each update is processed independently
- imported or review-required items are persisted through existing Telegram
  inbound tables
- the offset advances after each handled update

Failures:

- one failed update is logged with a redacted error and counted as failed
- the offset advances after the failed update so a bad update cannot poison the
  loop
- durable idempotency still comes from the existing
  `telegramChatId` + `telegramMessageId` unique key

Because Telegram does not replay old updates once the offset advances, treat
failed Telegram items as operational dead letters: inspect logs, confirm whether
the underlying file or message was persisted, and ask the operator to resend the
file if needed.

## Retry And Dead-Letter Guidance

Email retries are inbox-backed: leave valid failed messages unread until the next
poll. Do not manually mark a failed supplier email read unless an operator has
confirmed it should be skipped.

Telegram retries are resend-backed: failed updates are skipped after logging to
protect the worker. Ask the sender to resend the file or message after the
underlying issue is fixed.

For both workers, use the counters and timestamps to decide whether ingestion is
alive:

- `running=true` means the worker was started in the current API process.
- `inFlight=true` means a poll is currently executing.
- `lastSuccessAt` shows the last poll with no item failures.
- `lastError` is a redacted summary for operator triage.
- `duplicateItemsSkipped` indicates replay or idempotency protection.
