# Tenancy Foundation

**Status:** Implemented (config-level multi-tenancy). Last updated 2026-06-22.
Companion to [`saas-productisation-roadmap.md`](./saas-productisation-roadmap.md).

This describes the per-company configuration layer that decouples the platform
from hardcoded "Ambe", so it can run as any client company. It is the first part
of the roadmap's Tier 0.

## What is multi-tenant-ready now

- **Company identity & config** live in the `Organization` table, not env.
- All company-identity reads flow through an **active-organisation config**
  (`apps/api/src/organization/activeOrganizationConfig.ts`), loaded once at API
  and worker startup, with an **environment fallback** so behaviour is identical
  to the pre-tenancy system until an organisation row diverges from env.
- Wired consumers: account-opening **company profile** (the fields forms are
  filled with), internal **email-domain / company-name** detection, and alert /
  review **email recipients**.

## What is NOT yet multi-tenant

- **Data isolation:** domain tables (products, suppliers, cases, etc.) have no
  `organizationId`; all rows share one namespace. A single deployment therefore
  serves **one** company's data. Running many companies in one database
  (shared-DB row-scoping) is a later, larger step.
- **Per-user accounts:** login is still a single shared env credential, not named
  per-user accounts. (Flagged as a pilot blocker in the product-readiness audit.)
- **Per-client integrations:** Microsoft Graph credentials + sender mailbox and
  the Telegram bot token + chat are still single/env. The `Organization` stores a
  `senderMailbox` and `telegramInternalChatId` for later, but they are **not**
  consumed yet — these are integration _credentials_, handled as a unit in a
  future per-client-integrations effort.

## Architecture

| Piece                                                | File                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `Organization` model                                 | `apps/api/prisma/schema.prisma`                         |
| Default-org mapping (env → org)                      | `apps/api/src/organization/defaultOrganization.ts`      |
| Active-org config cache + getters                    | `apps/api/src/organization/activeOrganizationConfig.ts` |
| Org service (ensure / get / resolve / create / list) | `apps/api/src/organization/organizationService.ts`      |
| New-org validation                                   | `apps/api/src/organization/newOrganization.ts`          |

`resolveActiveOrganizationId()` always returns the single default organisation
today; it is the seam future request-scoped (multi-org) resolution will replace.

## Deploying the foundation (single company / Ambe)

Run on the target environment, under the shared-VPS advisory lock:

1. `pnpm --filter @ambe/api exec prisma migrate deploy` — applies the additive
   `Organization` table (no existing table changed).
2. `pnpm --filter @ambe/api exec tsx src/scripts/seedDefaultOrganization.ts` —
   creates the default organisation from current env (idempotent; never clobbers
   an existing row).
3. Restart the app processes (`pm2 restart ambe-api ambe-worker --update-env`)
   and confirm App B's uptime is unchanged.

Until the seed runs, every getter falls back to env, so the migration alone is a
no-op behaviour change.

## Onboarding a second client (instance-per-tenant)

The pragmatic near-term model: each client gets its own deployment + database.

1. Stand up a separate deployment + database for the client.
2. Apply migrations (`prisma migrate deploy`).
3. Author a config JSON for the client, e.g.:
   ```json
   {
     "slug": "acme-pharma",
     "name": "Acme Pharma Ltd",
     "internalEmailDomains": ["acmepharma.example"],
     "internalCompanyNames": ["Acme Pharma", "Acme Pharma Ltd"],
     "alertEmailRecipients": ["ops@acmepharma.example"],
     "reviewEmailRecipients": ["review@acmepharma.example"],
     "accountOpeningProfile": { "legalCompanyName": "Acme Pharma Ltd" }
   }
   ```
4. Provision the organisation:
   `pnpm --filter @ambe/api exec tsx src/scripts/createOrganization.ts acme.json`
   (mark it default for that deployment by editing the row, or seed it as the
   default — instance-per-tenant runs one organisation per deployment).
5. Configure that client's own integrations (Graph mailbox, Telegram) via env.
6. `listOrganizations.ts` confirms what exists.

## The open decision (before true multi-tenancy)

To serve many clients from **one** deployment, choose:

- **Shared database, row-scoping** — add `organizationId` to every table and
  enforce it on every query. True SaaS, most efficient at scale, but a large,
  high-risk migration touching the whole codebase.
- **Instance-per-tenant** — what this foundation already enables. Fastest and
  lowest-risk for the first few clients; operationally heavier past a handful.

Recommendation: validate with a real second client on instance-per-tenant before
investing in shared-DB row-scoping.
