# Read-only ops scripts

Safe, **read-only** diagnostics for the Ambe pilot VPS. They make no changes:
no restart/deploy/migrate, no enabling polling, no marking emails read, no
firewall edits. They are designed not to print secrets — no `.env` dumps, no
`pm2 env` / `pm2 jlist`, no connection strings.

| Script                          | Purpose                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `ambe-vps-health.sh`            | Process-manager + app-dir detection, git state, build artifacts, listeners, `/health`. |
| `ambe-db-reachability.sh`       | DNS / TCP 5432 / TLS reachability to the DB host + API DB readiness.                   |
| `ambe-migration-drift-check.sh` | Read-only `prisma migrate status` (secrets filtered) + worker presence.                |

Run from any shell on the VPS, e.g.:

```bash
bash scripts/ops/ambe-vps-health.sh
```

Optional environment overrides (all read-only):

- `APP_DIR` — repo checkout path (default `/var/www/ambe-pharma-intelligence`).
- `API_PORT` / `WEB_PORT` — defaults `4000` / `3000`.
- `INTERNAL_API_KEY` — if already exported, the authenticated readiness/workers
  checks run; otherwise they are skipped. The scripts never print it.

These pair with the runbooks in [`docs/runbooks/`](../../docs/runbooks/).
