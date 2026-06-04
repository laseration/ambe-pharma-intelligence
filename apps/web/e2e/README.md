# Browser E2E Smoke

This directory contains the minimal Playwright smoke test for the pilot operator
walkthrough. Playwright is scoped to `@ambe/web` so the browser dependency does
not affect API or shared packages.

The smoke test starts:

- a local mock internal API with sanitized fixture data only
- `next dev` with live integrations disabled and web auth set to local fixture
  credentials

It does not use Microsoft Graph, OpenAI, Telegram, outbound email, SharePoint,
OneDrive, supplier/customer systems, production credentials, or managed/live
databases.

Run it with:

```bash
pnpm --filter @ambe/web test:e2e
```

Install the Chromium browser used by Playwright if the local machine or CI image
does not already have it:

```bash
pnpm --filter @ambe/web exec playwright install chromium
```

## Disposable DB-Backed Smoke

The local-runtime smoke uses the real Express API, the real Next dashboard, and
a disposable local PostgreSQL database. It applies migrations and seeds only the
fake `AMBE_FAKE_PILOT_DEMO` records.

Run it only after setting `DATABASE_URL` in the current shell to a local,
disposable PostgreSQL database:

```bash
pnpm --filter @ambe/web test:e2e:local-runtime
```

The command refuses any `DATABASE_URL` that is missing, invalid, managed, or not
clearly disposable. Accepted hosts are `localhost`, `127.0.0.1`, `[::1]`, and
the Docker service name `postgres`. The database name must include `local`,
`dev`, `test`, `demo`, `smoke`, or `ci`.

Safe examples:

```bash
DATABASE_URL="postgresql://ambe:ambe@localhost:5432/ambe_local_browser_smoke?schema=public"
DATABASE_URL="postgresql://ambe:ambe@postgres:5432/ambe_ci?schema=public"
```

The smoke output may print only safe database metadata: host, database name,
classification, and whether the database was accepted or refused. It must never
print the full `DATABASE_URL`, tokens, raw email bodies, attachment contents,
Graph payloads, Telegram payloads, or production credentials.

This browser smoke force-disables OpenAI, Microsoft Graph mail, Telegram
polling/outbound, outbound email, SharePoint, and OneDrive in the spawned API
and web processes. It does not touch supplier/customer systems.
