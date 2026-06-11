# Authz regression matrix

The web layer and API layer use separate enforcement points:

- Web sessions use `viewer`, `operator`, and `admin` roles with explicit capabilities in `apps/web/lib/authorisation.ts`.
- API callers use internal API keys. `INTERNAL_VIEWER_API_KEY` is read-only, `INTERNAL_API_KEY` is operator, and `INTERNAL_ADMIN_API_KEY` is admin.
- The web-to-API bridge chooses the least privileged configured API key for the declared web capability, falling back to existing operator/admin keys where no viewer key is configured.

Current least-privilege assumptions covered by tests:

- `viewer` can reach the dashboard shell and intended read-only status surfaces.
- `viewer` cannot read source-data or operator-sensitive API surfaces such as imports, review queue, buy decisions, buy executions, account opening, or regulatory alerts.
- `operator` can reach operational workflows but cannot call admin-only system dry-run routes.
- `admin` can reach both operational workflows and admin-only routes.

The matrix is intentionally route-level for API auth and guard-level for web auth. Denied cases assert `403`; allowed mutation cases often assert validation errors after auth, which proves the request reached the route handler without invoking persistence or external integrations.
