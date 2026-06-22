# PharmPulse — SaaS Productisation Roadmap

**Status:** Strategy / exploration — not yet scheduled for build. This is a shortlist to decide from, not a
commitment. Last reviewed 2026-06-22.

## Context

PharmPulse (this "Ambe Pharma Intelligence" platform) is today a **mature, single-tenant internal
trading-desk system built for one company — Ambe Medical Group**. This document compares it to the
relevant SaaS market and lays out a **prioritised list of features worth building** to make it usable by
other pharma businesses ("future clients"), leading with what is most appealing / highest-impact for
winning and keeping clients.

Effort tags: **S** = days, **M** = 1–3 weeks, **L** = 1–2 months.

## Where PharmPulse stands today (the honest read)

**Surprisingly strong already** — deeper on _intelligence/automation_ than most off-the-shelf tools:

- Inbound **email / Telegram / file ingestion → OCR/extraction → review queue** (review-first,
  deterministic-first, AI-fallback). `apps/api/src/email/`, `apps/api/src/imports/`
- **Opportunity scoring** (BUY / PUSH / DEAD_STOCK / PRICE_ALERT / LOW_MARGIN / RESTOCK) with explainable
  metadata. `apps/api/src/opportunities/`
- Full **buy decision → execution → reconciliation** chain and a **brokered deal pipeline** with
  identity-blind drafts. `apps/api/src/buyDecisions/`, `apps/api/src/deals/`
- **Account-opening automation** (document upload, field mapping, safe auto-fill, PDF fill, SharePoint
  filing, activity timeline). `apps/api/src/accountOpening/`
- **Supplier qualification + scorecards**, **regulatory alerts**, **operator cockpit**, **commercial audit
  history** on domain events.

**The gaps are all "commercial SaaS plumbing," not core capability:**

| Missing                    | Today                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-tenancy              | No `organizationId` on any of the ~80 tables — one global namespace (`apps/api/prisma/schema.prisma`)                                   |
| Real user accounts         | Single shared `WEB_AUTH_USERNAME/PASSWORD` from env; 3 global API keys (`apps/web/lib/internalWebAuth.ts`, `apps/api/src/http/auth.ts`) |
| Per-client config          | Hardcoded Ambe values: company names, signer "Aman Dhillon", domains, SharePoint folders, alert channels (`apps/api/src/config/env.ts`) |
| Billing / metering         | None                                                                                                                                    |
| Self-serve onboarding      | Setup checklist exists, but new clients need engineering to stand up                                                                    |
| ERP / ordering integration | None (only Microsoft Graph mail + SharePoint)                                                                                           |
| Reporting / exports        | Dashboards only; no scheduled reports, CSV/Excel/Power BI export, or ROI reporting                                                      |
| Compliance posture         | Domain-event audit only; no SSO, no full access audit, no data-residency/GDPR tooling                                                   |

### How it compares to the market

| Dimension                             | PharmPulse              | Pharma procurement SaaS (SureCost, McKesson SupplyManager+, JAGGAER, Zycus) | AI doc/AP automation (Rossum, Stampli, Tipalti) | B2B pharma marketplace (Cloudfy, Virto) |
| ------------------------------------- | ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| AI price-list/email extraction        | ✅ strong, review-first | ⚠️ limited                                                                  | ✅ strong (invoices)                            | ❌                                      |
| Buy/sell **opportunity intelligence** | ✅ unique               | ⚠️ spend analytics                                                          | ❌                                              | ❌                                      |
| Account-opening automation            | ✅ unique               | ❌                                                                          | ❌                                              | ❌                                      |
| Multi-tenant / accounts / billing     | ❌                      | ✅                                                                          | ✅                                              | ✅                                      |
| ERP integrations                      | ❌                      | ✅ (SAP/NetSuite/Dynamics)                                                  | ✅ (14–70 ERPs)                                 | ✅                                      |
| E-commerce ordering / payments        | ❌                      | ✅ (McKesson)                                                               | ⚠️ payments only                                | ✅                                      |
| Compliance certs / SSO                | ❌                      | ✅                                                                          | ✅                                              | ✅                                      |

**Positioning takeaway:** PharmPulse's differentiator is the **intelligence + automation layer** that sits
_on top of_ a wholesaler's existing ordering/ERP — not a replacement marketplace. Lead with that; close the
commercial-plumbing gaps so it's sellable.

## The feature list (prioritised — most appealing first)

### Tier 0 — Foundation (without these you cannot onboard a 2nd client) — do first

1. **Multi-tenant data isolation** _(L)_ — add `organizationId` to every table + enforce org scoping on
   every query (app-layer scoping or Postgres RLS). The single biggest unlock; everything else depends on
   it. _Files: `apps/api/prisma/schema.prisma`, all `apps/api/src/**/service.ts`._
2. **Real user accounts + per-org roles** _(M)_ — replace the shared env login with a `User`/`Membership`
   model, per-user identity on audit trails, invite flow. Reuse the existing capability map in
   `apps/web/lib/authorisation.ts`.
3. **Per-company configuration** _(M)_ — move all hardcoded Ambe values (company profile, signer, domains,
   storage folders, alert channels) into an `Organization` settings record. _Files:
   `apps/api/src/config/env.ts`, `apps/api/src/accountOpening/`._

### Tier 1 — Most appealing to a prospective client (demo-winning, ROI-visible)

4. **Self-serve onboarding wizard + light white-label** _(M)_ — guided "connect mailbox → import price list
   → approve first offer" flow, plus the client's name/logo/colours. Makes a sales demo land and shortens
   time-to-value.
5. **Reporting, analytics & ROI dashboards + exports** _(M)_ — "savings captured," supplier performance,
   margin-at-risk, processing-time metrics; scheduled email reports + CSV/Excel/Power BI export. This is the
   **"here's the money we made/saved you"** story that renews contracts.
6. **ERP / ordering-system integration + export API** _(L)_ — push approved buy decisions / validated data
   into SAP, NetSuite, Microsoft Dynamics, or McKesson SupplyManager+; per-client webhooks. AP tools
   advertise 14–70 ERP connectors — buyers expect at least a clean API + a couple of native connectors.
7. **Supplier & buyer portals** _(L)_ — let suppliers submit price lists/onboarding forms and buyers track
   RFQ/quote status via a portal instead of email. Reduces inbox chaos and is highly visible to the client's
   counterparties. (Builds on existing `trade-access` + account-opening.)
8. **Per-client notifications & alerting** _(S–M)_ — route alerts to each client's own
   email/Telegram/Slack/webhook channels (today hardcoded to Ambe's), plus proactive poller/SLA alerts.
   _Files: `apps/api/src/email/service.ts`, `apps/api/src/telegram/`._

### Tier 2 — Trust & compliance (the things that unblock B2B pharma sales)

9. **SSO (Microsoft / Google) + optional SCIM** _(M)_ — pharma IT departments expect it.
10. **Full access audit log** _(M)_ — extend the strong domain-event audit to cover logins, API calls, file
    access, config changes, exports.
11. **GDPR / data controls** _(M)_ — per-org data export & delete ("right to be forgotten"), retention
    policies, and a path to data-residency choice.
12. **Security posture for procurement reviews** _(M–L)_ — encryption-at-rest for credentials/secrets vault,
    documented controls; groundwork for SOC 2 / Cyber Essentials, which buyers' security questionnaires
    demand.

### Tier 3 — AI & automation depth (lean into the differentiator)

13. **Format-agnostic extraction** _(M)_ — handle any supplier layout (scanned PDFs, images, odd Excel)
    without per-supplier templates — modern multimodal-LLM approach, still staged review-first.
14. **Predictive analytics** _(L)_ — demand/price forecasting, "best time to buy," reorder prediction from
    sales velocity + price history (data already captured in `SalesRecord` / `InventorySnapshot`).
15. **Assisted → autonomous (approved) outreach** _(L)_ — graduate the existing `AutomationGlobalMode`
    ladder so high-confidence supplier/buyer messages can send with light approval. The framework already
    exists in `apps/api/src/automation/`.
16. **Mobile approvals** _(M)_ — approve buys / review opportunities from a phone (push to PWA or Telegram
    quick-actions).

### Tier 4 — Monetisation & nice-to-haves

17. **Billing / subscriptions / usage metering** _(M)_ — Stripe + plan tiers + quotas (e.g. offers
    processed, mailboxes, seats). Needed before charging.
18. **Admin console** _(M)_ — create/suspend client orgs, reset users, see usage — for the operator of the
    SaaS.
19. **Payments / credit terms / BNPL** _(L)_ — only if the product moves toward facilitating transactions,
    not just intelligence (a big scope jump).

## Recommended sequence

- **Phase A (sellable to a 2nd client):** Tier 0 (1–3) + onboarding wizard (4) + per-client notifications (8).
- **Phase B (wins deals / renews):** reporting+exports (5), ERP/export API (6), SSO + full audit (9, 10).
- **Phase C (differentiate & monetise):** portals (7), AI depth (13–15), billing (17).

Start with **one friendly design-partner** (a second pharma wholesaler) rather than building all of
multi-tenancy speculatively — let their needs drive Tier 1/2 ordering.

## Validation / how to test this direction

- **Commercial validation:** before heavy build, confirm the roadmap with 1–2 prospective pharma
  wholesalers (design partners); confirm which Tier-1 items they'd pay for.
- **Onboarding metric:** success = a brand-new client org can be stood up **without engineering** and
  process its first approved offer (today this needs a full separate deployment).
- **Per-feature (once building):** isolation tested with a cross-tenant access test (org A cannot read org
  B); reuse existing test patterns (`apps/api/**/__tests__`, `pnpm --filter @ambe/api test`); add E2E
  coverage for the onboarding→import→review flow (a known gap — no browser E2E today).
- **No-regression guard:** Ambe's live instance must keep working throughout — treat it as "design partner
  #1," migrate it onto the multi-tenant model first.

## Sources

- Pharma B2B / procurement: [Cloudfy](https://cloudfy.com/solutions/sector/pharmaceuticals/),
  [Virto Commerce](https://virtocommerce.com/industry/pharmaceutical), [SureCost](https://www.surecost.com/),
  [JAGGAER Pharma/Life Sciences](https://www.jaggaer.com/vertical/pharma-life-sciences),
  [Zycus Healthcare/Pharma](https://www.zycus.com/industry/healthcare-pharmaceuticals),
  [Icertis Pharma](https://www.icertis.com/solutions/industry-solutions/pharmaceutical/),
  [Pharma B2B eCommerce market forecast](https://finance.yahoo.com/sectors/healthcare/articles/pharma-b2b-ecommerce-global-market-080200870.html).
- AI document / AP automation: [Rossum](https://rossum.ai/),
  [Stampli](https://www.stampli.com/blog/invoice-processing/invoice-processing-software/),
  [V7 invoice automation comparison](https://www.v7labs.com/blog/best-platforms-invoice-automation),
  [Parseur](https://parseur.com/use-case/ai-invoice-processing).
- Multi-tenant SaaS fundamentals: [Auth0 — multi-tenancy in B2B SaaS](https://auth0.com/blog/demystifying-multi-tenancy-in-b2b-saas/),
  [WorkOS — RBAC providers 2025](https://workos.com/blog/top-rbac-providers-for-multi-tenant-saas-2025),
  [LoginRadius — access control for multi-tenant](https://www.loginradius.com/blog/engineering/rbac-saas-multi-tenant-b2b-platforms),
  [Descope — auth for multi-tenant B2B](https://www.descope.com/blog/post/auth-multi-tenant-b2b-saas).
