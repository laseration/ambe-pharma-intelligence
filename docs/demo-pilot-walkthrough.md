# Pilot Demo Walkthrough

This walkthrough seeds a fake, repeatable commercial pilot dataset that shows the supplier-email-offer workflow from ingestion through review, buy decision, execution tracking, and deal visibility.

All records created by this demo are fake and labelled with `AMBE_FAKE_PILOT_DEMO`. The default command does not call Microsoft Graph, Telegram, OpenAI, email delivery, or any other external service.

## Seed The Demo

Run this against a local or disposable pilot-demo database:

```bash
pnpm --filter @ambe/api demo:seed-pilot
```

The command is intentionally non-destructive. It upserts deterministic demo records instead of resetting the database, so it can be run more than once without duplicating the demo path.

The command refuses to run unless `DATABASE_URL` points at a clearly local disposable database. Allowed hosts are `localhost`, `127.0.0.1`, `[::1]`, or the Docker service name `postgres`. The database name must contain `local`, `dev`, `test`, `demo`, or `smoke`.

Do not run this command against a real pilot database. It is designed for fake local demo data only.

## Smoke The Demo

After applying migrations to a disposable local database, run:

```bash
pnpm --filter @ambe/api demo:smoke-pilot
```

The smoke command uses the same safety guard, runs the idempotent demo seed, then verifies that the review workflow, buy decision, buy execution, and trade opportunity records exist. It does not run migrations or call external services.

## What Gets Created

The seed creates:

- a fake pilot operator
- a fake supplier and supplier qualification
- a fake customer
- two fake products
- a fake inbound supplier email with preserved source text
- deterministic extraction run and source evidence
- one staged offer that still needs review
- one offer already approved and ordered
- a buy decision, buy execution, sales row, inventory snapshot, and trade opportunity for the completed path

## Guided Walkthrough

1. Start the API and web app with the same database used by the seed.
2. Sign in to the dashboard with the configured internal web credentials.
3. Open `/dashboard` and look for the fake demo review and commercial signals.
4. Open `/dashboard/review`.
5. Select the `FAKE DEMO` Amlodipine review item.
6. Inspect the source snippet, extracted fields, supplier/product resolution, confidence, and audit history.
7. Approve the staged offer, or apply a correction first if testing the correction workflow.
8. Return to `/dashboard/review` and open the fake Cetirizine item to see the already approved and ordered path.
9. Open `/dashboard/deals` and find the fake Cetirizine trade opportunity linked to the approved buy decision and order status.
10. Use the setup and diagnostics pages if API connectivity or worker status needs checking.

## Safety Boundaries

- Demo data uses `.example.test` addresses and fake supplier, customer, product, purchase order, and invoice names.
- No outbound email or Telegram message is sent.
- No Microsoft Graph, SharePoint, OneDrive, or OpenAI call is made.
- Human approval boundaries remain in place; the demo does not make customer-facing publishing autonomous.
- The script does not delete, truncate, migrate, or reset data.
- The seed and smoke commands refuse managed/live-looking database URLs by default.

## Expected Demo Story

The demo proves the narrow pilot workflow:

1. A supplier offer email is captured with provenance.
2. Extracted offers are staged for review.
3. An operator can inspect source evidence and confidence before approval.
4. Approved offers can become buy decisions.
5. Ordered buys can be tracked through execution.
6. Commercial value appears as a trade opportunity with buyer context and margin rationale.

## Adding New Demo Cases

Keep future demo fixtures sanitized and deterministic:

- use fake names and `.example.test` domains
- include `AMBE_FAKE_PILOT_DEMO` in metadata or visible labels
- prefer fixed IDs for idempotent upserts
- do not depend on live external credentials
- do not reuse real supplier, customer, patient, invoice, or purchase-order data
