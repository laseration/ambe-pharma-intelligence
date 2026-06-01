# Product Readiness Audit

This document describes the current product shape of Ambe Pharma Intelligence, based only on what is visible in this repository. It is intended to keep future implementation work focused on a credible internal commercial pilot rather than disconnected feature expansion.

## Product Thesis

Ambe Pharma Intelligence should be an internal trading desk for a UK pharmaceutical wholesale operator. Its first useful job is not broad CRM, ERP, or autonomous AI selling. Its job is to turn messy supplier, stock, sales, email, and regulatory inputs into reviewable, explainable work:

- what to buy today;
- what to sell or push today;
- what stock or product records are risky;
- which supplier or customer-side action needs operator review.

The product direction already visible in the repo is review-first automation: deterministic import/parsing/scoring, source preservation, human approval before external action, and bounded use of AI as fallback rather than the primary decision-maker.

## Ideal First User/Operator

The ideal first operator is an internal commercial operations user who already handles supplier price lists, inbound supplier emails, stock files, sales history, and buying follow-up.

They need a single work surface to:

- ingest supplier offers from CSV, XLSX, email body text, PDF/image attachments, and Telegram-submitted files;
- review staged supplier offers before canonical records are changed;
- see BUY, PUSH, RESTOCK, DEAD_STOCK, PRICE_ALERT, and LOW_MARGIN opportunities;
- approve promising offers into buy decisions;
- record order, receipt, invoice, and reconciliation status;
- open brokered trade opportunities and draft controlled outreach;
- keep product, supplier, and source records clean enough to trust.

## Ideal Buyer

The ideal buyer is the internal business owner or commercial lead who wants a practical pilot that improves buying and selling discipline without creating regulatory, customer-facing, or supplier-facing risk.

The repo supports an internal-buyer story better than an external SaaS story today. A credible paid pilot should therefore be positioned as an internal operating system for a specific wholesale workflow, not as a general product offered to many unrelated pharmacies or suppliers.

## Core Workflow

The commercially coherent workflow is:

1. Ingest source data.
   Supplier price lists, inventory snapshots, sales records, inbound emails, Telegram files, and regulatory updates enter the system.
2. Preserve provenance.
   Raw rows, raw product names, inbound email metadata, extracted documents, source evidence, attachment summaries, and review events are stored before promotion.
3. Normalize and stage.
   Products, suppliers, prices, email-derived offers, contacts, account-opening cases, and regulatory matches are normalized conservatively.
4. Review internally.
   Operators use the dashboard, inbox, review queue, product records, opportunities, and deal screens to confirm what is useful, safe, and correct.
5. Approve bounded action.
   Approved supplier offers become durable buy decisions. Downstream buy execution tracks order placement, confirmation, receipt, invoice, and reconciliation.
6. Generate internal signals.
   Opportunity scoring and automation readiness summarize what is worth acting on and why.
7. Draft controlled external communication.
   Telegram and email signals are internal-only. Trade message drafts and account-opening drafts remain review-first and must not become autonomous customer-facing communication without explicit future work.

## Current Modules

The repo is a pnpm monorepo with:

- API: [`apps/api`](../apps/api)
- Web app: [`apps/web`](../apps/web)
- Shared package: [`packages/shared`](../packages/shared)
- Prisma schema: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)
- Main API router: [`apps/api/src/routes/index.ts`](../apps/api/src/routes/index.ts)
- Web shell and navigation: [`apps/web/app/layout.tsx`](../apps/web/app/layout.tsx)
- Placeholder login page: [`apps/web/app/page.tsx`](../apps/web/app/page.tsx)
- Dashboard overview: [`apps/web/app/dashboard/page.tsx`](../apps/web/app/dashboard/page.tsx)

Visible product modules include:

- Imports: CSV/XLSX supplier price lists, inventory snapshots, and sales history.
- Product normalization: rule-based medicine name normalization with cautious aliasing.
- Opportunity scoring: deterministic BUY, PUSH, DEAD_STOCK, PRICE_ALERT, LOW_MARGIN, and RESTOCK signals.
- Email intake: Microsoft Graph polling/configuration, inbound parsing, document decomposition, deterministic extraction, staging, triage, review, and AI fallback controls.
- Review queue: offer workflow items and events for internal review, needs-info, approval, rejection, ordered, and closed states.
- Buy decisions and buy executions: approved quote snapshots, execution status, reconciliation, and event history.
- Supplier qualification and scorecards: qualification status, risk burden, drift metrics, fulfilment metrics, and deterministic supplier tiering.
- Trade opportunities: internal brokered deal records and controlled blind message drafts.
- Automation readiness: shadow-mode evidence, operator feedback, readiness thresholds, and blocked automation decisions.
- Corrections and source learning: operator-corrected values, source reliability profiles, and bounded future hints.
- Telegram and email alerts: internal-only previews/sends with dry-run and safe failure behavior.
- Telegram inbound intake: allowlisted internal file intake.
- Account opening: review-first account-opening cases, field mapping, safe draft/autofill controls, and Microsoft Drive/SharePoint storage checks.
- Regulatory: MHRA-oriented regulatory update parsing, product matching, alerts, review items, and action logs.
- Web dashboard: operator cockpit, inbox, imports, opportunities, deals, review, product records, setup checklist, and account-opening case pages.

Placeholder or incomplete surfaces include:

- Login UI: [`apps/web/app/page.tsx`](../apps/web/app/page.tsx) explicitly says it is ready for authentication wiring.
- API auth: [`apps/api/src/http/auth.ts`](../apps/api/src/http/auth.ts) provides internal API-key roles, but not user sessions, browser login, or per-user web authorization.
- Inventory route: [`apps/api/src/routes/index.ts`](../apps/api/src/routes/index.ts) mounts `/inventory` through `createPlaceholderRouter`.
- Customers route: [`apps/api/src/routes/index.ts`](../apps/api/src/routes/index.ts) mounts `/customers` through `createPlaceholderRouter`.
- Web onboarding: no visible guided first-run setup, data checklist, source readiness page, or pilot operator onboarding flow.

## Current Strengths

- The repo is already strongly aligned with deterministic business rules. Most commercial decisions are represented as services, routes, schema records, and tests rather than as opaque AI prompts.
- Source preservation is a clear architectural theme. Imports keep raw rows and raw names; inbound email stores source metadata and extracted documents; account-opening stores source evidence and original documents; workflow/event tables preserve review history.
- Safety boundaries are explicit. AI fallback is disabled by default, constrained by env flags, and staged for review. Telegram/email publishing is internal-only and dry-run capable. Trade message drafts block blind identity leakage by policy.
- The data model is richer than a demo. It includes canonical products, suppliers, customers, imports, opportunities, staged offers, workflows, decisions, executions, regulatory items, corrections, feedback, and source reliability.
- Backend tests are present across core logic including imports, normalization, opportunities, email, review queue, automation, account opening, supplier qualification, deals, regulatory, safety, env handling, and runtime smoke.
- The web dashboard now orients the operator around next actions: supplier offers needing review, best buying signals, supplier emails awaiting decision, recent decisions, data-quality issues, setup, and automation readiness.
- Local setup and smoke documentation exist in [`README.md`](../README.md), [`docs/local-runtime-smoke-runbook.md`](./local-runtime-smoke-runbook.md), and [`docs/product-normalization.md`](./product-normalization.md).

## Current Blockers

- Login is a placeholder. The web entry point has a "Continue to dashboard" button and no real sign-in, session handling, user identity, or role-aware navigation.
- API auth is internal-key based, not operator-account based. This is useful for internal service hardening but is not enough for a paid pilot where actions should be attributable to named users in the web UI.
- Onboarding is missing. There is no first-run checklist for database setup, Microsoft Graph mail/storage, allowed senders, Telegram allowlists, import sample validation, OpenAI disabled/enabled policy, or pilot mode.
- Review queue usability needs pilot hardening. The backend workflow is substantial, but the pilot must prove that operators can quickly understand source evidence, staged values, confidence, supplier qualification, corrections, and next actions without reading raw JSON or backend docs.
- Trust and provenance need to be more visible in the UI. The data model preserves evidence, but the commercial pilot depends on operators seeing "why this is safe to act on" at the point of decision.
- Inventory and customer APIs are placeholders even though the schema has `InventorySnapshot`, `Customer`, and `SalesRecord`. This weakens the end-to-end answer to "what stock is at risk?" and "which customers should we contact?"
- Customer-contact workflow is not yet a first-class product path. The repo has sales records, opportunities, and blind broker draft concepts, but no mature customer queue, account ownership, contact cadence, or customer-facing approval flow.
- Observability is not pilot-ready. There is logger/correlation code and tests, but no documented production monitoring, alerting, dashboards, background worker visibility, integration health page, or audit review runbook.
- Deployment is not documented as a production path. The repo has `build`, `start`, Prisma, Neon, and env setup notes, but no deployment architecture, migration process, rollback process, secret management approach, scheduled worker plan, or production checklist.
- End-to-end browser tests are not visible. Backend tests are broad, and web library tests exist, but the main operator flows need UI-level regression coverage before a credible paid pilot.

## Commercial Pilot Scope

The first credible paid pilot should be narrow:

- one internal Ambe operator group;
- one configured database;
- a controlled set of supplier data sources;
- internal-only notifications;
- review-first buying decisions;
- no autonomous external sending;
- no claim that the system replaces ERP, accounting, compliance, or formal procurement controls.

Pilot success should be measured by:

- number of supplier offers ingested and staged;
- percentage reviewed without engineering help;
- number of useful BUY/PUSH/restock/dead-stock signals;
- review-to-approved-buy conversion;
- source/supplier resolution precision from operator feedback;
- number of corrections captured and reused as hints;
- reduction in missed or stale supplier offers;
- operator confidence in evidence and review history.

The pilot should not sell broad automation. It should sell controlled commercial visibility: better capture, better triage, clearer evidence, and safer internal follow-up.

## Non-Goals

- Do not build an external marketplace.
- Do not create autonomous customer-facing or supplier-facing communication.
- Do not replace ERP, accounting, procurement, warehouse, or compliance systems.
- Do not build generic CRM before proving customer-contact workflow from real sales/opportunity data.
- Do not make AI the primary parser, scorer, approver, or sender.
- Do not optimize for multi-tenant SaaS until one internal pilot workflow is credible.
- Do not add new workflow modules until login, onboarding, review usability, provenance visibility, testing, observability, and deployment are credible.

## Safety Principles

- Preserve source data before mutating canonical records.
- Keep every score explainable and deterministic where possible.
- Treat AI output as reviewable evidence, not ground truth.
- Require human approval before customer-facing or supplier-facing communication.
- Keep internal alerts separate from customer-facing offers.
- Maintain event history for review, approval, rejection, correction, order, reconciliation, and policy decisions.
- Make license/legal-entity settings configurable before any workflow depends on them.
- Fail safely when integrations are not configured.
- Keep dry-run and shadow-mode paths available for proving reliability.
- Prefer sparse extraction over guessed extraction.

## Technical Readiness Checklist

- [x] pnpm monorepo with API, web, and shared packages.
- [x] TypeScript in API and web.
- [x] Express API with separated route modules.
- [x] Prisma/PostgreSQL schema covering current workflow entities.
- [x] Import pipeline for supplier, inventory, and sales files.
- [x] Deterministic opportunity scoring.
- [x] Internal API-key enforcement for live-looking or production-like configurations.
- [x] Local runtime smoke runbook and guarded smoke command.
- [x] Broad backend unit/service coverage for core logic.
- [ ] Real browser login, session handling, and user identity.
- [ ] Role-aware web UI authorization tied to named operators.
- [ ] Pilot onboarding checklist and setup validation screen.
- [ ] Production deployment guide covering hosting, migrations, secrets, workers, and rollback.
- [ ] Observability plan covering logs, correlation IDs, integration health, failed jobs, polling status, and operator-facing error states.
- [ ] End-to-end tests for the main operator workflows.
- [ ] Inventory and customer route implementations beyond placeholders.
- [ ] Documented backup/restore and data retention approach.
- [ ] Production seed/configuration process for legal entity, license, users, allowed senders, suppliers, and notification channels.

## UX Readiness Checklist

- [x] Dashboard overview summarizes open opportunities, review load, duplicate product groups, and pilot readiness when data is available.
- [x] Navigation exposes core operator surfaces.
- [x] Login page exists as a placeholder.
- [x] Dashboard handles unavailable API data with error messaging in key places.
- [ ] Replace placeholder login with a real sign-in and signed-in operator state.
- [ ] Add onboarding or setup status so a pilot user knows which integrations and data sources are ready.
- [x] Make provenance visible on review and approval screens: source email/file, row-level raw text, extracted fields, confidence, correction history, and why promotion is blocked or allowed.
- [x] Make review queue actions faster for operators: clear priority, supplier qualification, confidence, next action, and decision consequences.
- [x] Show commercial audit history on the review detail screen for workflow, buy decision, and execution events.
- [ ] Add customer-contact workflow only after customer data and opportunity provenance are strong enough.
- [ ] Add empty states that explain what source data is missing without requiring README knowledge.
- [ ] Add operational health states for inbox polling, Telegram intake, Microsoft Graph mail/storage, OpenAI disabled/enabled state, and database freshness.
- [ ] Add UI regression coverage for login, dashboard, inbox, review, opportunity triage, buy approval, and deal drafting.

## Ordered Implementation Roadmap

### Phase 0: Freeze Product Direction

Goal: stop random feature-building and align the repo around the trading-desk pilot.

Tasks:

- Treat this document as the commercial scope baseline.
- Keep new work tied to one of the four operator questions in [`README.md`](../README.md): buy, sell/push, stock risk, or customer contact.
- Avoid adding new modules until existing review, trust, auth, and deployment gaps are handled.

Exit criteria:

- Future tasks can point to a roadmap phase and explain which pilot blocker they remove.

### Phase 1: Auth, Operator Identity, and Safe Access

Goal: make the web app credible for real internal operators.

Tasks:

- Replace the placeholder login page in [`apps/web/app/page.tsx`](../apps/web/app/page.tsx) with real authentication.
- Tie browser sessions to named users and roles rather than relying only on internal API keys.
- Keep the API's internal key support for server-to-server calls, but ensure user-facing actions carry an operator identity into audit fields.
- Add a clear unauthorized/forbidden UI state.

Exit criteria:

- A pilot operator can sign in, navigate only allowed pages, and create review/approval events with attributable identity.

### Phase 2: Pilot Onboarding and Configuration Readiness

Goal: make setup inspectable without engineering hand-holding.

Tasks:

- Add an internal setup/status page covering database, API key, mail credentials, storage credentials, Telegram allowlists, allowed senders, OpenAI flags, and dry-run modes.
- Document the exact pilot environment variables from [`apps/api/src/config/env.ts`](../apps/api/src/config/env.ts) and [`apps/api/.env.example`](../apps/api/.env.example).
- Add a pilot fixture checklist: import supplier price list, import inventory, import sales, ingest one inbound email, review one staged offer, approve one buy decision, and regenerate opportunities.

Exit criteria:

- A new pilot environment can be checked from the UI and README without reading source code.

### Phase 3: Trust and Provenance at Point of Review

Goal: make operators comfortable acting on system recommendations.

Tasks:

- Review screens now show source file/email context, row-level source snippets, extracted values, confidence, supplier resolution, qualification status, recent correction history, and promotion-blocking reason.
- Review screens now show whether a candidate came from deterministic extraction or AI fallback. Operator correction history is visible when stored.
- Review screens now show audit history for review, buy decision, and execution events when those records exist.
- Make blocked states explicit: missing supplier qualification, weak entity resolution, AI-derived offer, policy issue, or unsafe draft.
- Keep field-level corrections easy to enter after approval/rejection; the current page supports approve, reject, needs-info, and audit note actions but still needs a dedicated inline correction form.

Exit criteria:

- An operator can approve, reject, correct, or request info without leaving the review screen or trusting hidden logic.

### Phase 4: Review Queue Usability and Buying Flow

Goal: make the review-to-buy path fast enough for daily use.

Tasks:

- Prioritize review queue items by commercial value, confidence, source trust, and age.
- Add filters for status, supplier, confidence, source type, qualification risk, and assigned operator.
- Make approval consequences clear: staged offer -> workflow item -> buy decision -> buy execution.
- Improve buy execution UI for order placed, order confirmed, partial receipt, receipt, invoice, and reconciliation drift.
- Keep internal notes and event history visible.

Exit criteria:

- A pilot operator can process a day's supplier-offer queue and record resulting buy activity from the web UI.

### Phase 5: Inventory, Customer, and Opportunity Completeness

Goal: fully answer the four business questions using the data already modeled.

Tasks:

- Replace the `/inventory` placeholder with real inventory snapshot listing, stock-risk views, and freshness warnings.
- Replace the `/customers` placeholder with customer records and sales-history-backed contact candidates.
- Connect opportunity cards to inventory, recent sales, supplier price, and customer evidence.
- Keep customer-facing communication as draft/review only.

Exit criteria:

- The system can show "what stock is at risk" and "which customers should we contact" with the same evidence quality as the buy/review flow.

### Phase 6: Observability, Deployment, and Operational Runbooks

Goal: make the pilot operable outside a developer terminal.

Tasks:

- Add a production deployment guide for API, web, Prisma migrations, Neon/PostgreSQL, secrets, and background workers.
- Define how email polling, Telegram polling, Microsoft Graph storage checks, and any scheduled jobs are hosted and monitored.
- Add integration health endpoints or UI status for mail, Telegram, storage, OpenAI disabled/enabled state, database connectivity, and last successful poll/import.
- Add structured log guidance and correlation ID usage to operator-facing support workflows.
- Add backup/restore and rollback steps.

Exit criteria:

- A failed integration, stale worker, broken migration, or bad deploy has a documented detection and recovery path.

### Phase 7: Pilot Test Coverage and Release Gate

Goal: prove the paid pilot workflow repeatedly.

Tasks:

- Add end-to-end tests for login, setup status, import, inbox, review, correction, buy approval, opportunity refresh, and internal notification preview.
- Add regression tests for role failures and missing integration credentials.
- Keep backend unit coverage for deterministic scoring, parsing, safety policies, and promotion gates.
- Define a release checklist that runs `pnpm lint`, `pnpm build`, `pnpm test`, and the guarded smoke run where a disposable local database is available.

Exit criteria:

- The team has a repeatable release gate for the internal paid pilot.

## Assumptions

- "Paid pilot" means a controlled internal Ambe deployment or closely supervised internal commercial pilot, not a public multi-tenant SaaS launch.
- The first pilot should prioritize supplier-offer intake, review, buying decisions, opportunities, and internal signals before external customer communication.
- The current README accurately reflects intended behavior for modules not fully inspected in this audit.
- Existing uncommitted code changes in the workspace may represent in-progress work; this audit describes the visible repo state at the time of review rather than a released version.
- No external pharmaceutical, legal, compliance, customer, or supplier facts were used.
