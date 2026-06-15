# Email Polling Hardening Plan

A prioritised, review-first plan to make Microsoft Graph inbox polling
"bulletproof" before it is enabled in production. Derived from a read-only audit
of the inbound/polling subsystem (2026-06-15). Polling is currently **disabled**
(`EMAIL_INBOUND_POLLING_ENABLED=false`), so none of these risks are live yet —
but they must be addressed before enabling.

> This is a plan, not a change. Do not enable polling, run live Graph calls, or
> mark mailbox messages read while working through it.

## Verdict

**Not production-ready to enable.** One **critical data-loss** defect and several
reliability/idempotency gaps must land first. The single highest-value fix is the
**mark-read durability guard** (PR 1 below).

## Findings (audit answers)

1. **Can emails be lost if staging fails but the Graph message is still marked
   read? — YES (critical).** `processMessage` marks the message read
   unconditionally after `ingestInboundEmail` (`apps/api/src/email/polling.ts`
   ~327-341). The only durable persistence is inside `stageInboundEmail`, which is
   called via `stageInboundEmailSafely` (`apps/api/src/email/inbound/pipeline.ts`
   ~2558-2574) — a `try/catch` that **logs and swallows** all errors and returns
   `void`. `ingestInboundEmail` (`apps/api/src/email/inbound/service.ts`
   ~1140-1146) returns the success-shaped result regardless. So a DB error during
   staging → message marked read → never re-fetched (`$filter=isRead eq false`) →
   **permanent loss**. (The in-memory review store is explicitly not durable.)
2. **Does `stageInboundEmailSafely` swallow failures so polling thinks ingest
   succeeded? — YES.** Same root cause as (1).
3. **Does `processMessage` mark read only after durable persistence? — NO.**
4. **Are duplicate protections strong enough? — Partial.** The body/offer staging
   path is strongly idempotent (composite unique keys + fingerprints + upserts;
   covered by `staging-idempotency.test.ts`). **Gap:** the CSV/XLSX attachment
   auto-import path (`importSupplierPriceList`) creates a fresh `ImportBatch` +
   `SupplierPriceList` each run with a null `promotionFingerprint` and no
   `sourceInboundEmailId`, so it is **not idempotent** — the same price list can
   import twice for non-poller callers (reprocess/manual). Dedup identity also
   relies on the mutable Graph message id unless immutable IDs are enabled; stored
   `internetMessageId`/`bodyHash`/attachment checksums exist but are unused for
   dedup.
5. **Are Graph rate limits handled? — Weak.** No retry/backoff anywhere;
   `Retry-After` is read into an error message but ignored; the access token is
   **not cached** (a fresh token per request amplifies 429s). Resilience relies on
   the fixed poll interval + leaving failed messages unread.
6. **Are attachment failures visible/retryable? — Mixed.** Network/HTTP failures
   throw before mark-read (retryable, good). But there is **no pagination**
   (`$top=10` inbox / `$top=20` attachments, no `@odata.nextLink`), so extra
   messages/attachments are silently dropped then marked read; unparseable
   CSV/XLSX are swallowed (`pipeline.ts` ~822-824); attachment bytes are not
   persisted, so a dropped attachment is unrecoverable after mark-read.
7. **Inline images filtered safely? — Yes, conditionally.** Inline images are
   dropped only when a non-inline spreadsheet is present; otherwise retained and
   OCR'd (down-weighted ×0.75, HIGH-confidence gated). An unconditional
   inline-disposition filter is a reasonable hardening.
8. **Account-opening review-first? — Yes.** Routed to `ACCOUNT_OPENING_REVIEW` /
   `PENDING_REVIEW` / `REVIEW_REQUIRED`; no auto-sign/submit/file; manual `.eml`
   import hardcodes all side-effect flags off.
9. **AI fallback review-first? — Yes.** Deterministic-first; AI candidates tagged
   `aiAssisted` with zeroed confidences and gated out of canonical promotion →
   `REVIEW_REQUIRED`. Prompt-injection note: untrusted text is embedded without
   fencing, but blast radius is limited (`store:false`, strict json_schema,
   server-side re-validation, gated from canonical writes) → worst case is
   review-queue noise. Fencing is a low-cost hardening.
10. **Does worker status expose enough? — Mostly.** Rich counters/timestamps,
    sanitized `lastError`, `consecutiveFailures`. **Gap:** no heartbeat /
    run-age / staleness, and readiness email-polling status is **config-only**
    (`active && allowedSenders>0`) — it never degrades on `consecutiveFailures`,
    `lastErrorAt`, or a hung run, so a stuck/erroring poller still reports
    `ready`.
11. **Tests for failed staging / duplicate / mark-read ordering / worker-disabled?
    — Present** for the happy/per-message-failure/duplicate/disabled cases.
    **Missing:** a test that a **swallowed staging failure leaves the message
    unread** (the actual loss path), stuck-poller staleness, readiness degradation
    on runtime failure, outer-catch (list throwing), `markMessageRead` failure,
    `consecutiveFailures` reset, and ordering via an interleave assertion.
12. **First safest hardening PR? — The mark-read durability guard (PR 1).**

## Top risks (ranked)

1. **Permanent email loss** on any staging DB error (finding 1–3). Critical.
2. **Duplicate commercial import** via the CSV/XLSX attachment path (finding 4).
3. **Silent truncation** from missing Graph pagination (finding 6).
4. **429 amplification** from no token caching / no `Retry-After` (finding 5).
5. **Blind spot**: a stuck/erroring poller still reports `ready` (finding 10).

## Pre-live-polling checklist (all green before enabling)

- Mark-read durability guard merged + deployed (PR 1).
- Migration drift resolved and `AccountOpeningProcessingRun` applied (otherwise
  inbound account-opening persistence throws and, before PR 1, would be lost) —
  see [`migration-drift-remediation.md`](migration-drift-remediation.md).
- Graph creds present, mailbox configured, allowed-sender list non-empty
  (readiness booleans only).
- `email:graph-preflight` dry-run reviewed with an operator (it is read-only:
  no mark-read/ingest/persist/attachment-download/OpenAI/Telegram/send).
- Exactly one `ambe-worker`; `/api/system/workers` reachable.

## Staged hardening roadmap

- **PR 1 — mark-read durability guard (critical; no schema change).** Make a
  staging failure surface so the poller leaves the message **unread** for retry:
  have `stageInboundEmailSafely` signal failure (return result/throw) instead of
  silently swallowing; have `ingestInboundEmail` propagate it; and in
  `processMessage` only `markMessageRead` after durable persistence is confirmed.
  Persist the `InboundEmail` row up front. **Edge case (design decision):**
  intentionally ignored/rejected emails already get a durable row and **should**
  still be marked read — do not turn those into a re-poll loop. Add a test using
  the `createEmailInboundPollingWorker` DI seam: inject a failing ingest/staging
  and assert `markMessageRead` is **not** called and `itemsFailed` increments.
- **PR 2 — attachment-import idempotency.** Key the CSV/XLSX import to the
  `InboundEmail` (set `sourceInboundEmailId`, populate `promotionFingerprint`) or
  route it through the idempotent staging machinery; add duplicate-import tests
  incl. reprocess/manual callers.
- **PR 3 — Graph reliability.** Cache the access token to expiry; honor
  `Retry-After` with bounded exponential backoff on 429/5xx; follow
  `@odata.nextLink` for inbox + attachments; tests for 429, transient, and
  multi-page.
- **PR 4 — observability.** Add a heartbeat / run-age staleness signal; make
  readiness email-polling status degrade on `consecutiveFailures` / `lastErrorAt`
  / hung run; tests.
- **PR 5 — extraction evals + parser hardening.** Expand `extraction-evals`
  fixtures (messy forwards, mixed currency, MOQ/price breaks, noisy footers,
  adversarial text); unconditional inline-image filter; fence untrusted text in
  the AI prompt.
- **PR 6 — controlled live rollout.** Read-only dry-run → canary with a single
  allowed sender → full enable, each behind operator sign-off, only after PRs 1–5
  and drift resolution.

## Do-not-enable-until

`EMAIL_INBOUND_POLLING_ENABLED=true` must wait until at least PR 1 has landed and
the migration drift is resolved. Enabling before PR 1 risks losing any email
whose staging hits a transient DB error; enabling before drift resolution makes
inbound account-opening persistence throw.
