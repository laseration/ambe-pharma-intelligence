# Prisma Migration Drift — Read-Only Diagnosis & Safe Remediation

This runbook covers the case where `prisma migrate status` reports **drift**
between the committed migrations and the live (Neon) database. It was written
after a real incident on the pilot DB (2026-06-15) and generalises to any future
drift.

> Read-only by default. Every mutating step is **REQUIRES APPROVAL** and must be
> preceded by a database backup. Never print `DATABASE_URL` or any secret.

## What drift looks like

`prisma migrate status` can report two independent problems:

1. **Applied in DB, file missing locally** — a migration row exists in the DB's
   `_prisma_migrations` table with no matching folder in
   `apps/api/prisma/migrations`. This means the database was changed **outside the
   committed migration history** — most commonly an accidental
   `prisma migrate dev` run against the pilot/prod database (forbidden by
   [`deployment.md`](../deployment.md)). The applied SQL is **not recoverable from
   git** if the migration was never committed; only the live schema or a Neon
   backup/PITR snapshot can reveal what was applied. A tell-tale sign is a
   migration **name that looks like a mistyped shell command** (Prisma turns the
   `--name` argument into the folder name, normalising spaces/dashes to
   underscores).

2. **In git, not applied to DB** — a committed migration that was never run
   against the database. On this project the deploy workflow does **not** run
   `prisma migrate deploy` (see [`vps-deployment.md`](../vps-deployment.md)), so a
   merged migration stays unapplied until someone applies it deliberately.

Both can be present at once (two-way drift). If the unapplied migration creates a
table or column that the **running code already queries**, the live API will throw
Prisma `P2021`/`P2022` on those code paths — so two-way drift can mean a feature
is silently broken in production even though the process is "online".

## Phase 1 — read-only diagnosis

```bash
APP=/var/www/ambe-pharma-intelligence

# 1) Fresh, read-only status (connection + drift). Secrets filtered out.
( cd "$APP" && pnpm --filter @ambe/api exec prisma migrate status 2>&1 ) \
  | grep -viE '://|password|DATABASE_URL'
```

A reusable version is [`scripts/ops/ambe-migration-drift-check.sh`](../../scripts/ops/ambe-migration-drift-check.sh).

For an **applied-but-missing** migration, establish provenance from the repo
(read-only) — confirm it was never committed before assuming it is an out-of-band
change:

```bash
NAME=<migration_folder_name>
git -C "$APP" log --all --oneline --full-history -- "apps/api/prisma/migrations/$NAME/*"
git -C "$APP" log -S "$NAME" --all --oneline
git -C "$APP" rev-list --all --objects | grep -i "$NAME" || echo "never in any reachable object"
git -C "$APP" fsck --unreachable --no-reflogs >/dev/null   # then grep dangling objects if needed
```

For an **unapplied** committed migration, read its SQL and judge blast radius:

```bash
git -C "$APP" show "origin/main:apps/api/prisma/migrations/<name>/migration.sql"
# Additive (CREATE TABLE/INDEX, ADD COLUMN nullable) = low risk.
# Destructive (DROP, NOT-NULL backfill, ALTER ... TYPE, TRUNCATE) = needs a plan.
```

Check whether the **running code depends** on the unapplied object:

```bash
git -C "$APP" grep -n -iE '<modelOrTable>' <vps_commit> -- apps/api/src
```

To learn what an **out-of-band** migration actually did (its SQL is not in git),
inspect the live schema read-only. Prefer a guarded approach that does not print
the connection string — e.g. a read-only `_prisma_migrations` query for
names/checksums/timestamps, or a temporary `prisma db pull` into a **throwaway**
location compared against `apps/api/prisma/schema.prisma`. Treat any such DB
access as **REQUIRES APPROVAL** and confirm it is strictly read-only.

## Phase 2 — safe remediation sequence (REQUIRES APPROVAL)

Do not start any of this without operator approval and a backup.

1. **Backup first.** Neon snapshot/branch/PITR point. Record id, timestamp, and
   restore owner off-repo. Do not paste `DATABASE_URL`.
2. **Characterise the out-of-band migration.** Read `_prisma_migrations` for the
   orphan row; diff the live schema against `schema.prisma` to reconstruct the DDL
   it applied. Decide, as a human call, whether its effects are benign,
   already-superseded, or need to be kept.
3. **Reconcile the history.** Choose one, deliberately:
   - If the orphan's effects are absent/benign:
     `prisma migrate resolve --rolled-back <orphan_name>` to drop the record.
   - If its effects must be kept: recreate a matching migration file so history
     and DB agree.
     (Both are mutations — approval + backup required. Do not guess.)
4. **Apply the pending migration.** `prisma migrate deploy` (applies committed,
   unapplied migrations) + `prisma migrate status` to confirm clean.
5. **Regenerate the client / deploy code** as needed; restart only the affected
   services by name.
6. **Verify.** `prisma migrate status` clean; `/api/system/readiness` green;
   exercise the previously-broken feature path.

## Do-not-run while drifted

- `prisma migrate deploy` **before** the out-of-band migration is reconciled and a
  backup exists — it may fail or apply onto an inconsistent schema.
- `prisma migrate dev` against pilot/prod (this is what causes the drift).
- `prisma migrate resolve` / `prisma db push` / ad-hoc SQL without approval + backup.
- Deploying `main` expecting it to fix drift — the deploy never runs migrations.
- Starting the worker or enabling polling while a code-required table is missing —
  inbound processing for that feature will throw and, combined with any
  mark-read-before-persist gap, can lose messages.
