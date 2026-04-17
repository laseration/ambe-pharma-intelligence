# Ambe Pharma Intelligence

Production-minded pnpm monorepo with:

- `apps/api` - Node.js, TypeScript, Express
- `apps/web` - Next.js, TypeScript
- `packages/shared` - shared types and utilities

## Requirements

- Node.js 20+
- pnpm 9+

## Local Setup

```bash
pnpm install
pnpm dev
```

This starts:

- API on `http://localhost:4000`
- Web on `http://localhost:3000`

## Environment

Copy the example files if needed and fill in real values locally:

- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`

Do not commit real secrets.

## Useful Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
```

## Database

The API uses PostgreSQL with Prisma. Prisma lives in `apps/api/prisma`.

### Start PostgreSQL locally

1. Create a local `.env` from the root `.env.example` and fill in your PostgreSQL values.
2. Create a local `apps/api/.env` from `apps/api/.env.example` and point `DATABASE_URL` at your database.
3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

### Run Prisma

```bash
pnpm --filter @ambe/api db:generate
pnpm --filter @ambe/api db:migrate
pnpm --filter @ambe/api db:seed
```

`db:migrate` creates and applies the local development migration. `db:seed` loads a very small fake dataset for local development.
