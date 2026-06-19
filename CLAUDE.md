# CLAUDE.md

This repo's working agreement is in [AGENTS.md](AGENTS.md) — read it first.

## Shared VPS — read before touching `ambe-vps`

The box runs **two independent apps under one PM2**: this repo (App A —
`ambe-api`/`ambe-web`/`ambe-worker`, also hosts the offer/price pipeline) and the
MT5 trading bot (App B — `/root/bot`, `trading-bot-demo`/`mt5-bridge-demo`).

- **Never** use global PM2 (`pm2 restart/stop/reload all`, `pm2 kill`, `pm2 save`
  - `resurrect`, `pm2 update`). Name only App A processes:
    `pm2 restart ambe-api ambe-worker --update-env`.
- **Never** touch `/root/bot` (App B) from this repo.
- `apps/api/.env` is shared by account-opening and the offer pipeline — back up
  before editing; `EMAIL_INBOUND_POLLING_ENABLED` affects both.
- Take the advisory lock before any deploy / `.env` edit / restart:
  `bash /root/ambe-app-A.lock.sh acquire "<who>"` … `release`.
- After any restart, `pm2 list` and confirm App B's uptime is unchanged.

Full plan: `/root/VPS-PROTECTION.md` (and the "Shared VPS" section of AGENTS.md).
