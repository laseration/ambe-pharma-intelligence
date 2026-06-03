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
