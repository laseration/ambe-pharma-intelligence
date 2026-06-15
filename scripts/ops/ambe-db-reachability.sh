#!/usr/bin/env bash
#
# ambe-db-reachability.sh — READ-ONLY database reachability diagnosis.
#
# Distinguishes: transient/cold-start, DNS failure, outbound TCP 5432 block,
# wrong/stale host, endpoint suspended/unavailable, or app-pool-OK-but-fresh-
# connect-failing. Makes NO changes and runs NO migrations.
#
# Prints NO secrets: it never reads .env and never prints a connection string.
# You provide ONLY the DB hostname (not a credential). INTERNAL_API_KEY, if you
# choose to enter it, is read hidden and cleared; it is never echoed.
#
# Usage:  bash scripts/ops/ambe-db-reachability.sh
# Env:    DB_HOST (optional; otherwise prompted), API_PORT (default 4000).

set -u
API_PORT="${API_PORT:-4000}"
hr() { printf '\n===== %s =====\n' "$1"; }

DB_HOST="${DB_HOST:-}"
if [ -z "$DB_HOST" ]; then
  read -rp "DB host (HOSTNAME ONLY, e.g. from a Prisma P1001 message; no user/pass): " DB_HOST
fi
[ -n "$DB_HOST" ] || { echo "No host given; aborting."; exit 1; }
echo "Diagnosing host: $DB_HOST"

hr "APP-LEVEL DB PROBE (real query via the app; the safe 'SELECT 1')"
curl -fsS -m 5 "http://127.0.0.1:$API_PORT/health" 2>/dev/null && echo || echo "(no 200 from /health)"
read -rs -p "INTERNAL_API_KEY (hidden; Enter to skip): " K; echo
if [ -n "$K" ]; then
  curl -fsS -m 10 -H "x-internal-api-key: $K" "http://127.0.0.1:$API_PORT/api/system/readiness" 2>/dev/null && echo || echo "(readiness call failed)"
else
  echo "(skipped — no key)"
fi
unset K

hr "DNS RESOLUTION"
getent hosts "$DB_HOST" || echo "getent: NO RESULT (NXDOMAIN or resolver failure)"
command -v dig >/dev/null 2>&1 && { echo "-- dig +short --"; dig +short "$DB_HOST"; } || true

hr "OUTBOUND TCP 5432 (3 attempts — transient vs persistent)"
for i in 1 2 3; do
  if command -v nc >/dev/null 2>&1; then
    nc -vz -w 5 "$DB_HOST" 5432 && echo "attempt $i: OPEN" || echo "attempt $i: FAILED"
  else
    timeout 5 bash -c ">/dev/tcp/$DB_HOST/5432" 2>/dev/null && echo "attempt $i: OPEN" || echo "attempt $i: FAILED"
  fi
  sleep 2
done

hr "TLS/SNI HANDSHAKE (advisory; managed Postgres needs SNI)"
if command -v openssl >/dev/null 2>&1; then
  timeout 8 openssl s_client -connect "$DB_HOST:5432" -servername "$DB_HOST" -starttls postgres </dev/null 2>/dev/null \
    | grep -iE 'CONNECTED|verify return|subject=' | head -4 \
    || echo "(no handshake / -starttls postgres unsupported — not conclusive)"
else
  echo "(openssl not installed — skip)"
fi

hr "DONE — read-only. No changes made."
