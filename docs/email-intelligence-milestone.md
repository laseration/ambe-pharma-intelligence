# Email Intelligence Milestone

This checkpoint covers the current internal email intelligence workflow.

## What Was Added

- Supplier-offer staging now keeps deterministic parsing first and sends AI-assisted supplier-offer rows to review before canonical promotion.
- Auto-promotion into supplier price intelligence requires a selected existing product resolution.
- Approved reviewed supplier offers can create or reuse `SupplierPriceList` / `SupplierPriceItem` with provenance back to the inbound email, derived offer, and workflow item.
- `CommercialIntelItem` stores review-first commercial notes such as supplier reliability warnings, buyer demand, manual buy triggers, market notes, expiry rules, product notes, and contact notes.
- `CustomerDemandSignal` stores review-first buyer/customer requests for sourcing, quote, availability, and demand emails.
- Commercial intel has internal API routes and a dashboard at `/dashboard/commercial-intel`.
- Pipeline diagnostics are available at `/dashboard/diagnostics` through the read-only `/api/diagnostics/pipeline-summary` endpoint.
- Approved, non-expired commercial intel can appear as read-only opportunity context without changing scores.
- Acceptance/demo tests cover realistic clean, messy, commercial-intel, mixed, and non-actionable email scenarios with mocked parser output.

## Migrations

Migration included:

```text
20260505180000_add_commercial_intel_items
20260505213000_add_customer_demand_signals
```

Local development:

```bash
pnpm --filter @ambe/api db:migrate
```

Production or deployed database:

```bash
pnpm --filter @ambe/api exec prisma migrate deploy
```

Run `pnpm --filter @ambe/api db:generate` after schema changes or after pulling this milestone.

## Local Validation

```bash
pnpm --filter @ambe/api db:generate
pnpm --filter @ambe/api build
pnpm --filter @ambe/api test
pnpm --filter @ambe/web build
pnpm --filter @ambe/web lint
git diff --check
```

The acceptance scenarios and manual replay notes are documented in `docs/email-intelligence-acceptance-demo.md`.

## Safety Guarantees

- AI-assisted supplier offers do not auto-promote before review.
- AI-assisted supplier offers may create canonical supplier price intelligence only after explicit approval and required product, supplier, price, and currency fields are resolved.
- Commercial intel never creates products, suppliers, supplier price records, buy decisions, trade opportunities, or outbound messages.
- Commercial intel affects opportunities only as read-only context.
- Customer demand never creates products, customers, suppliers, supplier price records, trade opportunities, buy decisions, or outbound messages in this pass.
- Diagnostics are read-only and make no external API or OpenAI calls.

## Known Gaps

- Customer-request parsing is backend-only; there is no customer-request dashboard yet.
- Commercial intel does not change scoring values yet.
- Customer demand does not affect opportunity/trade context or scoring yet.
- Commercial intel review is intentionally simple and separate from the offer workflow queue.
- Real Microsoft Graph and OpenAI behavior should be validated manually in a controlled environment; automated tests use mocks/stubs.
- MHRA scraping is still not implemented.

## Recommended Next Features

- Add a customer-request dashboard and review workflow surface.
- Add approved customer-demand read-only context to opportunities/trade workflows.
- Add richer operator review flows for commercial intel once usage patterns are clear.
- Add guarded scoring rules for approved commercial intel after enough examples are reviewed.
- Add production runbooks for Graph mailbox monitoring and failed-email replay.
