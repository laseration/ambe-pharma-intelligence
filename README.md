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
