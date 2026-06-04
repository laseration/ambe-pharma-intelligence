# Full Safe Dry-Run Report - 2026-06-04

Issue: [#41](https://github.com/laseration/ambe-pharma-intelligence/issues/41)
Branch: `codex/full-safe-dry-run-report-2026-06-04`
Base commit: `b38ffeecf374cb3dd13db25474bb3c04a292d042`

## Executive Verdict

The fake-data and fixture-only pilot path is ready for the next controlled
read-only Microsoft Graph mailbox dry-run, but not for live ingestion or
customer/supplier-facing operation.

All local baseline checks completed successfully on latest `main`, including
safe verification, lint, tests, builds, extraction evaluation, and the existing
mock-backed browser smoke. The local workstation did not have a disposable
PostgreSQL runtime available, so the disposable DB-backed browser smoke was not
rerun locally in this session. The merged GitHub Actions workflow now contains a
PostgreSQL service-backed browser smoke job for `pnpm --filter @ambe/web
test:e2e:local-runtime`.

The Microsoft Graph read-only mailbox preflight was intentionally skipped. This
session did not have an explicitly approved dedicated pilot mailbox environment,
and running the preflight against any unverified mailbox would violate the
dry-run safety boundary.

Recommendation: proceed only to the documented read-only dedicated pilot mailbox
dry-run. Do not enable inbound polling, live ingestion, outbound email,
Telegram, SharePoint, OneDrive, OpenAI, customer/supplier actions, or managed
database migrations yet.

## Environment Summary

| Item                                   | Value                                       |
| -------------------------------------- | ------------------------------------------- |
| Date                                   | 2026-06-04                                  |
| OS                                     | Microsoft Windows NT 10.0.26200.0           |
| Node.js                                | `v24.14.1`                                  |
| pnpm                                   | `9.15.4`                                    |
| Repository                             | `laseration/ambe-pharma-intelligence`       |
| Base branch                            | `main`                                      |
| Base commit                            | `b38ffeecf374cb3dd13db25474bb3c04a292d042`  |
| Working branch                         | `codex/full-safe-dry-run-report-2026-06-04` |
| Docker daemon                          | Unavailable in this session                 |
| Local PostgreSQL on loopback port 5432 | Not listening                               |

No production credentials were used. No full connection strings, tokens, raw
email bodies, attachment contents, Microsoft Graph payloads, Telegram payloads,
or customer/supplier data were recorded in this report.

## Command Results

| Command                                                                            | Result          | Notes                                                             |
| ---------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| `git checkout main`                                                                | Pass            | Switched to `main`.                                               |
| `git pull origin main`                                                             | Pass            | Already up to date at `b38ffeecf374cb3dd13db25474bb3c04a292d042`. |
| `git status --short`                                                               | Pass            | Clean before creating the report branch.                          |
| `node --version`                                                                   | Pass            | `v24.14.1`.                                                       |
| `pnpm --version`                                                                   | Pass            | `9.15.4`.                                                         |
| `pnpm install --frozen-lockfile`                                                   | Pass            | Dependencies installed without lockfile changes.                  |
| `pnpm verify:safe`                                                                 | Pass            | Completed successfully.                                           |
| `pnpm lint`                                                                        | Pass            | Completed successfully.                                           |
| `pnpm test`                                                                        | Pass            | Completed successfully.                                           |
| `pnpm build`                                                                       | Pass            | Completed successfully.                                           |
| `pnpm --filter @ambe/api test`                                                     | Pass            | 500 tests passed.                                                 |
| `pnpm --filter @ambe/api lint`                                                     | Pass            | Completed successfully.                                           |
| `pnpm --filter @ambe/api build`                                                    | Pass            | Completed successfully.                                           |
| `pnpm --filter @ambe/api eval:extraction`                                          | Pass            | 12/12 sanitized extraction evaluation cases passed.               |
| `pnpm --filter @ambe/web test`                                                     | Pass            | 35 tests passed.                                                  |
| `pnpm --filter @ambe/web lint`                                                     | Pass            | Completed successfully.                                           |
| `pnpm --filter @ambe/web build`                                                    | Pass            | Completed successfully.                                           |
| `pnpm --filter @ambe/web test:e2e`                                                 | Pass            | 1 Chromium pilot operator walkthrough smoke passed.               |
| `pnpm --filter @ambe/shared test`                                                  | Pass            | 2 tests passed.                                                   |
| `pnpm --filter @ambe/shared lint`                                                  | Pass            | Completed successfully.                                           |
| `pnpm --filter @ambe/shared build`                                                 | Pass            | Completed successfully.                                           |
| `git diff --check`                                                                 | Pass            | No whitespace errors before adding this report.                   |
| `git status --short`                                                               | Pass            | Clean before adding this report.                                  |
| `docker info --format '{{.ServerVersion}}'`                                        | Fail            | Docker daemon was unavailable locally.                            |
| `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`    | Pass            | Returned `False`; no local PostgreSQL listener found.             |
| `pnpm --filter @ambe/web test:e2e:local-runtime`                                   | Skipped locally | No disposable local PostgreSQL runtime was available.             |
| `pnpm --filter @ambe/api email:graph-preflight`                                    | Skipped         | No explicitly approved dedicated pilot mailbox env was available. |
| `pnpm format` after report write                                                   | Fail then pass  | Initial failure was limited to this report's Markdown formatting. |
| `pnpm exec prettier --write docs/test-runs/full-safe-dry-run-report-2026-06-04.md` | Pass            | Applied Prettier to the new report only.                          |
| `pnpm lint` after report write                                                     | Pass            | Completed successfully.                                           |
| `pnpm test` after report write                                                     | Pass            | Completed successfully.                                           |
| `pnpm build` after report write                                                    | Pass            | Completed successfully.                                           |
| `git diff --check` after report write                                              | Pass            | No whitespace errors.                                             |
| `git status --short` after report write                                            | Pass            | Only the new report file was untracked before commit.             |

## Disposable DB-Backed Smoke Status

Local execution of `pnpm --filter @ambe/web test:e2e:local-runtime` was not
possible in this session because both safe local runtime options were absent:

- Docker daemon unavailable.
- `127.0.0.1:5432` had no listening PostgreSQL server.

No local database migrations were run in this session.

The merged workflow `.github/workflows/local-runtime-smoke.yml` includes a
`Disposable PostgreSQL browser smoke` job that provisions a PostgreSQL 16 service
container and runs:

```bash
pnpm install --frozen-lockfile
pnpm --filter @ambe/web exec playwright install chromium
pnpm --filter @ambe/web test:e2e:local-runtime
```

The workflow classifies only safe database metadata before the smoke:

| Field          | Safe CI value                        |
| -------------- | ------------------------------------ |
| Host           | `127.0.0.1`                          |
| Database name  | `ambe_local_browser_smoke`           |
| Classification | Local/disposable                     |
| Decision       | Safe if the guard accepts the target |

The workflow disables Microsoft Graph, OpenAI, Telegram polling/outbound,
outbound email, SharePoint, and OneDrive with dummy CI-only settings. It uses no
secrets and does not print the full database URL.

Because the GitHub Actions run listing was not available from this local session,
this report treats the DB-backed browser smoke as CI-configured and locally
skipped, not as freshly rerun locally.

## Graph Read-Only Mailbox Dry-Run Status

The command `pnpm --filter @ambe/api email:graph-preflight` was not run. The
preflight is allowed only after operators provide and approve a dedicated pilot
mailbox configuration under the runbook in
`docs/graph-readonly-mailbox-dry-run.md`.

Required prerequisites before running that command:

- Dedicated pilot mailbox created and approved.
- Microsoft Graph access restricted to that mailbox.
- `Mail.Read` only; no `Mail.ReadWrite`, `Mail.Send`, SharePoint, OneDrive, or
  storage permissions for this dry-run.
- Inbound polling explicitly disabled.
- Operators record only safe summary output, never raw message bodies,
  attachment contents, Graph payloads, tokens, or full connection strings.
- Operators confirm unread counts and message state before and after the
  preflight to verify no messages were marked read.

## Capability Matrix

| Capability                         | Evidence                                  | Status  | Notes                                                                                 |
| ---------------------------------- | ----------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Safe verification                  | `pnpm verify:safe`                        | Pass    | Includes formatting and safe checks.                                                  |
| Root lint/test/build               | `pnpm lint`, `pnpm test`, `pnpm build`    | Pass    | Completed locally.                                                                    |
| API package                        | API test/lint/build                       | Pass    | 500 API tests passed.                                                                 |
| Extraction quality gates           | `pnpm --filter @ambe/api eval:extraction` | Pass    | 12/12 sanitized cases passed.                                                         |
| Web package                        | Web test/lint/build                       | Pass    | Completed locally.                                                                    |
| Mock-backed browser walkthrough    | `pnpm --filter @ambe/web test:e2e`        | Pass    | Sanitized Chromium smoke passed.                                                      |
| Shared package                     | Shared test/lint/build                    | Pass    | Completed locally.                                                                    |
| Disposable DB-backed browser smoke | CI workflow present; local runtime absent | Partial | Workflow is configured; local rerun skipped.                                          |
| Graph read-only preflight          | Runbook present; env not approved         | Skipped | Must be run only against a dedicated pilot mailbox.                                   |
| Live ingestion                     | Not run                                   | Blocked | Must remain disabled until dry-run sign-off.                                          |
| Outbound channels                  | Not run                                   | Blocked | Email, Telegram, SharePoint, OneDrive, and customer/supplier systems remain disabled. |

## Safety Findings

- No live Microsoft Graph calls were made.
- No live OpenAI calls were made.
- No Telegram polling or outbound Telegram sends were made.
- No outbound email was sent.
- No SharePoint or OneDrive actions were run.
- No supplier/customer systems were touched.
- No managed or live database migrations were run.
- No production credentials were used or recorded.
- No raw email bodies, attachment contents, tokens, full connection strings,
  Graph payloads, or Telegram payloads are included in this report.
- The local `verify:safe` run completed without requiring live integrations.
- The DB-backed smoke guard and workflow are designed to print only host,
  database name, classification, and safe/refused decision.

## Gaps

- The disposable DB-backed browser smoke was not rerun locally because this
  machine had no disposable PostgreSQL runtime available.
- This session could not retrieve a completed GitHub Actions run listing for the
  local-runtime workflow, so workflow execution is not independently re-attested
  here.
- No real read-only Microsoft Graph mailbox preflight has been executed yet.
- No manual operator browser walkthrough against a real dedicated pilot mailbox
  has been performed.
- No sender allowlist, supplier mapping, or mailbox access policy has been
  signed off for real data.
- No go-live plan exists yet for enabling inbound polling after the read-only
  preflight.

## Go / No-Go

| Stage                                                              | Decision         | Reason                                                                  |
| ------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------- |
| Continue fake-data development                                     | Go               | Local baseline and fixture browser checks passed.                       |
| Run disposable DB-backed smoke where local PostgreSQL is available | Go               | Workflow and guard are present; use only disposable DB targets.         |
| Run read-only dedicated Graph mailbox dry-run                      | Go with controls | Follow `docs/graph-readonly-mailbox-dry-run.md`; keep polling disabled. |
| Enable live ingestion/polling                                      | No-go            | Dedicated mailbox dry-run and operator sign-off are still missing.      |
| Enable outbound customer/supplier actions                          | No-go            | Requires separate approval, runbook, and verified safeguards.           |
| Use managed/live database for pilot migrations                     | No-go            | Not approved by this dry-run.                                           |

## Next 5 Actions

1. Run `pnpm --filter @ambe/web test:e2e:local-runtime` in CI or on a workstation
   with an approved disposable local PostgreSQL instance, and record only safe DB
   classification output.
2. Create or confirm the dedicated pilot mailbox and Microsoft Entra app with
   mailbox-restricted `Mail.Read` access.
3. Run `pnpm --filter @ambe/api email:graph-preflight` under
   `docs/graph-readonly-mailbox-dry-run.md`, with inbound polling disabled.
4. Have operators verify unread counts, no marked-read changes, no outbound
   side effects, and safe-only recorded output.
5. Hold a go/no-go review before any real inbound polling, live ingestion,
   outbound messaging, or managed database migration.
