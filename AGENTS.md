# AGENTS.md

## Project

Ambe Pharma Intelligence is a production-minded internal tool for a UK pharmaceutical wholesale business.

## Goals

Build a maintainable MVP that helps operators answer:

1. What should we buy today?
2. What should we sell or push today?
3. What stock is at risk?
4. Which customers should we contact?

## Engineering principles

- Prefer simple, readable solutions
- Use TypeScript everywhere
- Preserve existing behavior unless asked to change it
- Make the smallest clean implementation that works
- Do not add unnecessary abstractions
- Do not commit secrets
- Use `.env.example` placeholders only
- Add tests for core logic where practical
- Add README updates when introducing new setup steps
- Inspect existing code before changing it

## Backend preferences

- Node.js + TypeScript
- Express
- Prisma + PostgreSQL
- Clear service / route / schema separation
- Deterministic business rules first, no AI-first logic

## Frontend preferences

- Next.js + TypeScript
- Clean internal admin UI
- Functional over flashy
- Good loading and error states

## Business rules

- Human approval required before customer-facing publishing
- Preserve source data from imports
- Keep scoring explainable
- Keep legal entity and license-related settings configurable
- Separate internal alerts from customer-facing offers

## Delivery expectations

When implementing:

1. Inspect existing code first
2. Make the smallest viable change
3. Explain files changed
4. Include run/test steps
5. Note assumptions

## Shared VPS — protection rules (read before ANY VPS action)

The host `ambe-vps` (77.68.101.61) runs **two independent apps** under one global PM2:

- **App A — this repo** (`/var/www/ambe-pharma-intelligence`): PM2 `ambe-api`,
  `ambe-web`, `ambe-worker`; config `apps/api/.env`. Hosts BOTH the
  account-opening bot AND the offer/price email pipeline — they share that
  `.env`, the inbox poller, and these processes.
- **App B — MT5 trading bot** (`/root/bot`, separate repo, own `.env`): PM2
  `trading-bot-demo`, `mt5-bridge-demo`. Do **not** touch from this repo.

Rules:

- **Never use global PM2** (`pm2 restart/reload/stop/delete all`, `pm2 kill`,
  `pm2 save`+`resurrect`, `pm2 update`). Always name App A processes, e.g.
  `pm2 restart ambe-api ambe-worker --update-env`.
- **`apps/api/.env` is shared** by account-opening and the offer pipeline (e.g.
  `EMAIL_INBOUND_POLLING_ENABLED` affects both). Back it up before editing and
  change only your keys.
- **Take the advisory lock** before any App A deploy / `.env` edit / restart:
  `bash /root/ambe-app-A.lock.sh acquire "<who>"` … then `release`.
- **Verify isolation** after a restart: `pm2 list` — App B's uptime must be
  unchanged (it was not restarted).
- Account-opening stays dormant (`ACCOUNT_OPENING_AUTO_REPLY_ENABLED=false`) until
  an explicit, watched canary. Full plan: `/root/VPS-PROTECTION.md`.
