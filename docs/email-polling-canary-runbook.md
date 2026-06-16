# Email polling Stage 0/1/2 canary runbook

A staged, safety-gated procedure for bringing Microsoft Graph inbound email polling
live on the pilot VPS. Each stage is independently approved and verified. **No stage
enables live polling until Stage 2 is explicitly approved.**

This runbook contains **no secrets, no `.env` values, no mailbox addresses** — only
key names and procedure. All real values are entered at hidden prompts at run time.

## Process roles & where config lives

- Config file: `apps/api/.env` on the VPS (loaded by both `ambe-api` and the
  separate `ambe-worker` process).
- The **worker** runs the email poller. It only starts the poller when
  `isEmailInboundPollingActive()` is true, i.e. **`EMAIL_INBOUND_POLLING_ENABLED=true`
  AND Microsoft Graph is configured**. With polling disabled the worker stays in
  idle keep-alive: no polling loop, no Graph calls, no emails marked read.
- Microsoft mail credentials resolve as: use `MICROSOFT_MAIL_*` if present, **else
  fall back to `MICROSOFT_GRAPH_*`** (`resolveMicrosoftMailGraphCredentials`). The
  sender mailbox is read from `MICROSOFT_GRAPH_SENDER_MAILBOX`.

## Do-not-run list (applies to all stages until explicitly approved)

- Do not set `EMAIL_INBOUND_POLLING_ENABLED=true` until Stage 2.
- Do not run the Graph preflight/dry-run until Stage 1 is approved.
- No live Graph calls, no marking messages read, no mailbox reprocessing, no
  outbound email outside the approved canary.
- No `pm2 restart all`, no `pm2 save` (process list does not change), no deploy,
  no migrations, no direct SQL writes.
- Never touch `trading-bot-demo` or `mt5-bridge-demo`.
- Never print secrets, `.env` contents, DB URLs, tokens, mailbox addresses, or API keys.

## Env key reference (names only)

| Key | Purpose | Stage |
|---|---|---|
| `MICROSOFT_MAIL_TENANT_ID` / `MICROSOFT_MAIL_CLIENT_ID` / `MICROSOFT_MAIL_CLIENT_SECRET` | Graph app credentials (explicit; else `MICROSOFT_GRAPH_*` fallback) | 0 |
| `MICROSOFT_GRAPH_REFRESH_TOKEN` | delegated-auth alternative to client secret | 0 (optional) |
| `MICROSOFT_GRAPH_SENDER_MAILBOX` | mailbox to poll | 0 |
| `EMAIL_INBOUND_ALLOWED_SENDERS` | comma-separated allowlist (exact address or domain) | 0 |
| `EMAIL_INBOUND_SUPPLIER_MAPPINGS` | comma-separated `pattern=Supplier Name` | 0 |
| `EMAIL_INBOUND_POLLING_ENABLED` | master poll switch — stays `false` until Stage 2 | 0/2 |

Allowlist & mapping matching (`isAllowedEmailSenderForList` / `resolveSupplierNameFromSender`):
an entry containing `@` and not starting with `@` is matched as an **exact address**;
an entry that is a bare domain or `@domain` is matched against the **sender domain**.

## Stage 0 — provision Graph/mailbox config with polling OFF

Goal: set the Graph credentials + mailbox + a single canary allowlist/supplier
mapping, keeping `EMAIL_INBOUND_POLLING_ENABLED=false`. Verify the worker reports
the mailbox configured but polling disabled/inactive. No Graph calls happen.

Run the hybrid provisioning script **locally in bash (git bash / WSL), not PowerShell**.
It reuses any existing `MICROSOFT_GRAPH_*` values found in `.env`, otherwise prompts
hidden; values travel to the VPS base64-encoded over SSH stdin (never in chat/argv/ps),
and are never echoed.

```bash
#!/usr/bin/env bash
# Stage 0 canary env provisioning. Run LOCALLY in bash. Polling stays DISABLED.
set -uo pipefail
read_hidden() { local v; printf '%s: ' "$1" >/dev/tty; IFS= read -rs v </dev/tty; printf '\n' >/dev/tty; printf '%s' "$v"; }
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }

# Always prompt for the canary intake config:
ALLOWED=$(read_hidden "  EMAIL_INBOUND_ALLOWED_SENDERS (canary sender; exact address or domain)")
MAPPING=$(read_hidden "  EMAIL_INBOUND_SUPPLIER_MAPPINGS (pattern=Supplier Name)")
# Prompt for credentials ONLY if not already present as MICROSOFT_GRAPH_* on the VPS.
# (Leave blank to skip a value and let the script reuse the legacy one if present.)
TENANT=$(read_hidden "  MICROSOFT_MAIL_TENANT_ID (blank = reuse MICROSOFT_GRAPH_TENANT_ID if set)")
CLIENT_ID=$(read_hidden "  MICROSOFT_MAIL_CLIENT_ID (blank = reuse legacy)")
CLIENT_SECRET=$(read_hidden "  MICROSOFT_MAIL_CLIENT_SECRET (blank = reuse legacy)")
MAILBOX=$(read_hidden "  MICROSOFT_GRAPH_SENDER_MAILBOX (blank = reuse if set)")

{
  printf 'AL_B64=%s\n' "$(b64 "$ALLOWED")"; printf 'MP_B64=%s\n' "$(b64 "$MAPPING")"
  printf 'T_B64=%s\n'  "$(b64 "$TENANT")";  printf 'CI_B64=%s\n' "$(b64 "$CLIENT_ID")"
  printf 'CS_B64=%s\n' "$(b64 "$CLIENT_SECRET")"; printf 'MB_B64=%s\n' "$(b64 "$MAILBOX")"
  cat <<'REMOTE'
set -uo pipefail
ENVFILE=/var/www/ambe-pharma-intelligence/apps/api/.env
cd /var/www/ambe-pharma-intelligence || { echo "ABORT: app dir"; exit 1; }
dec() { printf '%s' "$1" | base64 -d; }
AL=$(dec "$AL_B64"); MP=$(dec "$MP_B64"); T=$(dec "$T_B64"); CI=$(dec "$CI_B64"); CS=$(dec "$CS_B64"); MB=$(dec "$MB_B64")
getval() { grep -E "^[[:space:]]*$1=" "$ENVFILE" | tail -1 | sed -E "s/^[[:space:]]*$1=//"; }
# Reuse legacy MICROSOFT_GRAPH_* if a prompt was left blank
[ -z "$T"  ] && T=$(getval MICROSOFT_GRAPH_TENANT_ID)
[ -z "$CI" ] && CI=$(getval MICROSOFT_GRAPH_CLIENT_ID)
[ -z "$CS" ] && CS=$(getval MICROSOFT_GRAPH_CLIENT_SECRET)
[ -z "$MB" ] && MB=$(getval MICROSOFT_GRAPH_SENDER_MAILBOX)

TS=$(date -u +%Y%m%d%H%M%S)
cp -p "$ENVFILE" "$ENVFILE.backup.stage0-canary.$TS" || { echo "ABORT: backup"; exit 1; }
echo "BACKUP: apps/api/.env.backup.stage0-canary.$TS"

set_key() { k=$1; v=$2; t=$(mktemp); grep -vE "^[[:space:]]*${k}=" "$ENVFILE" > "$t" || true; printf '%s=%s\n' "$k" "$v" >> "$t"; cat "$t" > "$ENVFILE"; rm -f "$t"; }
set_key MICROSOFT_MAIL_TENANT_ID "$T"; set_key MICROSOFT_MAIL_CLIENT_ID "$CI"; set_key MICROSOFT_MAIL_CLIENT_SECRET "$CS"
set_key MICROSOFT_GRAPH_SENDER_MAILBOX "$MB"; set_key EMAIL_INBOUND_ALLOWED_SENDERS "$AL"; set_key EMAIL_INBOUND_SUPPLIER_MAPPINGS "$MP"
set_key EMAIL_INBOUND_POLLING_ENABLED false   # polling stays OFF
unset T CI CS MB AL MP T_B64 CI_B64 CS_B64 MB_B64 AL_B64 MP_B64

echo "### ENV KEY PRESENCE (booleans only)"; MISSING=0
for k in MICROSOFT_MAIL_TENANT_ID MICROSOFT_MAIL_CLIENT_ID MICROSOFT_MAIL_CLIENT_SECRET MICROSOFT_GRAPH_SENDER_MAILBOX EMAIL_INBOUND_ALLOWED_SENDERS EMAIL_INBOUND_SUPPLIER_MAPPINGS EMAIL_INBOUND_POLLING_ENABLED; do
  if grep -qE "^[[:space:]]*${k}=.+" "$ENVFILE"; then echo "  $k=present"; else echo "  $k=MISSING/empty"; MISSING=1; fi; done
grep -qE '^[[:space:]]*EMAIL_INBOUND_POLLING_ENABLED=false$' "$ENVFILE" && echo "  polling_flag_is_false=yes" || echo "  polling_flag_is_false=NO"
[ "$MISSING" = 1 ] && { echo "ABORT: required key missing; NOT restarting"; exit 1; }

MT5=$(pm2 pid mt5-bridge-demo 2>/dev/null | head -1); TB=$(pm2 pid trading-bot-demo 2>/dev/null | head -1)
pm2 restart ambe-worker --update-env >/tmp/r 2>&1 || { echo "ABORT: worker restart"; exit 1; }; rm -f /tmp/r; sleep 3
echo "### WORKER (expect enabled:false, active:false, mailboxConfigured:true)"
pm2 logs ambe-worker --nostream --lines 40 2>/dev/null | grep -E "Polling worker runtime configuration|no active pollers" | tail -2
echo "### ACTIVITY SCAN (expect EMPTY)"; pm2 logs ambe-worker --nostream --lines 80 2>/dev/null | grep -iE "graph\.microsoft\.com|Microsoft Graph request|polling started|markMessageRead|pollOnce" | tail -5 || true
echo "### API HEALTH=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health || echo 000)  WEB=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000 || echo 000)"
[ "$MT5" = "$(pm2 pid mt5-bridge-demo 2>/dev/null | head -1)" ] && echo "mt5-bridge-demo=untouched" || echo "mt5-bridge-demo=CHANGED"
[ "$TB" = "$(pm2 pid trading-bot-demo 2>/dev/null | head -1)" ] && echo "trading-bot-demo=untouched" || echo "trading-bot-demo=CHANGED"
echo "### STAGE0_DONE"
REMOTE
} | ssh ambe-vps bash -s
unset TENANT CLIENT_ID CLIENT_SECRET MAILBOX ALLOWED MAPPING
```

**Stage 0 pass criteria:** backup created; all 7 keys present; `polling_flag_is_false=yes`;
worker `emailInbound: {enabled:false, active:false, mailboxConfigured:true}`; activity
scan empty; API health 200; web 200; both bots untouched.

**Stage 0 rollback:** restore the timestamped backup
(`cp apps/api/.env.backup.stage0-canary.<TS> apps/api/.env`) and
`pm2 restart ambe-worker --update-env`.

## Stage 1 — read-only Graph preflight (separate approval)

Goal: prove Graph credentials/mailbox work with a **read-only** call that cannot
mark messages read or ingest anything. **Polling stays disabled.**

Preconditions: Stage 0 passed; confirm `EMAIL_INBOUND_POLLING_ENABLED` is still
`false` (the preflight is gated on `!emailInboundPollingEnabled` — `dryRunSafe`).

Run only the existing read-only preflight (no other Graph command):

```bash
ssh ambe-vps 'cd /var/www/ambe-pharma-intelligence && pnpm --filter @ambe/api email:graph-preflight'
```

This prints booleans + redacted previews (`mailbox: ***@domain`, sender previews
`***@domain`). The dry-run service refuses to run unless `graphConfigured &&
mailboxConfigured && !pollingEnabled`, and its `safety` block asserts
`markedRead:false, ingested:false, persistedContent:false,
downloadedAttachmentContent:false, calledOpenAi:false, calledTelegram:false,
sentEmail:false`.

**Pass:** command succeeds, lists unread messages count, `safety.markedRead=false`,
no secrets printed. **Fail/no-op:** if Graph is not fully configured it prints
`FAIL: ... No Graph request was made.` and exits non-zero — nothing happened;
re-check Stage 0. **Rollback:** none needed — preflight is read-only and idempotent.

## Stage 2 — single-email canary (separate approval; enables polling)

Goal: process exactly one controlled email end-to-end.

1. With one allowlisted sender + one supplier mapping in place (Stage 0), send a
   single email from the allowlisted sender to the configured mailbox. First test:
   keep it minimal — a clear subject and either no attachment (body-only) or one
   small valid CSV with a recognizable price-list filename.
2. Enable polling for the canary window: set `EMAIL_INBOUND_POLLING_ENABLED=true`
   and `pm2 restart ambe-worker --update-env`. Watch readiness/worker status.
3. Confirm the message is processed once (idempotent), readiness stays healthy,
   and no duplicate import batch/rows are created.
4. Close the window: set `EMAIL_INBOUND_POLLING_ENABLED=false` and restart the
   worker, or keep enabled per the canary plan.

**Stage 2 rollback:** set `EMAIL_INBOUND_POLLING_ENABLED=false`, restart only the
worker. The mark-read durability guard means a message is only marked read after
durable staging, so a mid-run failure leaves it unread for retry rather than lost.

## Global rollback summary

- Env: restore the most recent `apps/api/.env.backup.stage0-canary.<TS>`, restart
  only `ambe-worker --update-env`.
- Polling: setting `EMAIL_INBOUND_POLLING_ENABLED=false` + worker restart fully
  disables the poller (no loop, no Graph, no mark-read).
- Code/DB: PR2C migration is additive (nullable column + unique index); no rollback
  needed. A Neon safety branch is taken before schema changes.
