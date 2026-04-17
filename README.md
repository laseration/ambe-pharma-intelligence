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

For the API and Prisma commands, environment loading works in this order:

1. `apps/api/.env`
2. repo root `.env`

`apps/api/.env` is the primary location. The root `.env` is only a fallback when `DATABASE_URL` is missing in `apps/api/.env`.
Prisma loads these files through [apps/api/prisma.config.ts](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/prisma.config.ts:1) before it reads the schema.
Prisma resolves those env files relative to `process.cwd()`, so when you run `pnpm --filter @ambe/api ...`, the expected primary file is `apps/api/.env`.

## Useful Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
```

## Database

The API uses Neon PostgreSQL with Prisma. Prisma lives in `apps/api/prisma`.

### Configure Neon

1. Create `apps/api/.env` from `apps/api/.env.example`.
2. Set `DATABASE_URL` to your Neon connection string.
3. Optionally create a root `.env` from `.env.example` if you want the fallback behavior.

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
```

Use the pooled or direct Neon PostgreSQL connection string that Neon provides for your project. Keep `sslmode=require` in the URL.

The API connects to Neon on startup through Prisma. If the database is not reachable, startup fails with a clear log message that includes only safe connection details such as the database host.

### Run Prisma

```bash
pnpm --filter @ambe/api db:generate
pnpm --filter @ambe/api db:migrate
pnpm --filter @ambe/api db:seed
```

`db:migrate` creates and applies the development migration against your Neon database. `db:seed` loads a very small fake dataset for development.
These commands are plain Prisma commands. Environment loading is handled centrally in `apps/api/prisma.config.ts`, not by shell wrappers.

## Import API

The API supports CSV and XLSX uploads for supplier price lists, inventory snapshots, and sales history.

### Endpoints

- `POST /api/imports/supplier-price-list`
- `POST /api/imports/inventory`
- `POST /api/imports/sales`

All upload endpoints expect `multipart/form-data` with a `file` field.

Supplier price list imports also accept:

- `supplierName`
- `sourceDate`
- `currencyCode`

### Usage Examples

From `apps/api`:

```bash
curl -X POST http://localhost:4000/api/imports/supplier-price-list ^
  -F "file=@fixtures/imports/supplier-price-list.csv" ^
  -F "supplierName=Ambe Pharma Sourcing" ^
  -F "sourceDate=2026-04-01" ^
  -F "currencyCode=USD"
```

```bash
curl -X POST http://localhost:4000/api/imports/inventory ^
  -F "file=@fixtures/imports/inventory.csv"
```

```bash
curl -X POST http://localhost:4000/api/imports/sales ^
  -F "file=@fixtures/imports/sales.csv"
```

Each import returns:

- `importBatchId`
- `summary.totalRows`
- `summary.validRows`
- `summary.invalidRows`
- `summary.warnings`
- `errors`

### Import Behavior

- CSV and XLSX are both supported.
- Row validation is per-row, so bad rows are collected and reported without crashing the whole import.
- Original file metadata is stored on the import batch and supplier price list records.
- Raw product text is preserved exactly as uploaded.
- Candidate product fields are generated for `normalizedName`, `strength`, `formulation`, and `packSize`.
- The importer does not attempt advanced product matching yet. It creates or reuses products on simple normalized name matching and stores raw names as `ProductAlias`.

### Fixture Files

Sample files for local testing live in:

- `apps/api/fixtures/imports/supplier-price-list.csv`
- `apps/api/fixtures/imports/supplier-price-list.xlsx`
- `apps/api/fixtures/imports/inventory.csv`
- `apps/api/fixtures/imports/sales.csv`

### Debugging Env Detection

Run the API and check:

```bash
GET /api/debug/env
```

Example response:

```json
{
  "databaseUrlDetected": true
}
```

### Troubleshooting

If Prisma says `Environment variable not found: DATABASE_URL`:

- Ensure `apps/api/.env` exists. This is the first file Prisma config checks.
- If `apps/api/.env` does not define `DATABASE_URL`, ensure the repo root `.env` exists.
- Ensure the file is named exactly `.env`, not `.env.txt`.
- Ensure the connection string looks like `postgresql://user:password@host.neon.tech/dbname?sslmode=require`.
- Run Prisma through the workspace script, for example `pnpm --filter @ambe/api db:generate`.
- If you run commands manually inside `apps/api`, make sure the current directory is `apps/api`.
- Prisma config resolves env paths from `process.cwd()`, so the working directory matters for where it looks first.
- Prisma logs the database host from `prisma.config.ts` on startup, which helps confirm the correct env file was loaded without exposing secrets.

## Product Normalization

Medicine names are normalized with a rule-based service in [apps/api/src/imports/normalization.ts](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/src/imports/normalization.ts:1). It preserves raw source text and produces:

- canonical `normalizedKey`
- extracted `strength`
- extracted `formulation`
- extracted `packSize`
- confidence label
- structured explanation of the rules applied

Normalization is cautious. It helps group obvious variants like `tabs` and `tablets`, but it does not aggressively auto-merge unlike products.

Detailed rules and limitations are documented in [docs/product-normalization.md](/d:/Users/User/Desktop/ambe-pharma-intelligence/docs/product-normalization.md:1).

### Normalization Preview

Use the debug endpoint to preview normalization without importing data:

```bash
curl "http://localhost:4000/api/debug/normalize?input=Amlodipine%205mg%20tabs%2028"
```

You can also pass multiple `input` query values:

```bash
curl "http://localhost:4000/api/debug/normalize?input=Amlodipine%205mg%20tabs%2028&input=Amlodipine%205%20mg%20tablets%20x%2028"
```

## Opportunity Scoring

The API includes an internal, deterministic opportunity scoring engine for imported supplier, inventory, and sales data.

### Opportunity Types

- `BUY`
- `PUSH`
- `DEAD_STOCK`
- `PRICE_ALERT`
- `LOW_MARGIN`
- `RESTOCK`

### How It Works

The scorer evaluates current product state using:

- latest supplier buy price
- previous supplier buy price when available
- current available stock
- recency of the latest inventory snapshot
- recent 30-day sales velocity
- average recent sale price
- estimated margin percentage

Thresholds and base scores live in [apps/api/src/opportunities/config.ts](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/src/opportunities/config.ts:1).

Each generated opportunity stores:

- `type`
- `score`
- explanation text in `description`
- structured score breakdown and metrics in `metadata`

### Opportunity Endpoints

- `GET /api/opportunities`
- `POST /api/opportunities/regenerate`

Optional filters for listing:

- `type`
- `status`

### Usage Examples

Regenerate opportunities:

```bash
curl -X POST http://localhost:4000/api/opportunities/regenerate
```

List all opportunities:

```bash
curl http://localhost:4000/api/opportunities
```

Filter by type and status:

```bash
curl "http://localhost:4000/api/opportunities?type=RESTOCK&status=OPEN"
```

### Explanation Examples

- `Low stock with positive recent sales velocity over last 30 days.`
- `High stock with no recent sales; potential dead stock risk.`
- `Supplier price lower than recent benchmark with acceptable demand.`

### Optional Legacy Local Postgres

`docker-compose.yml` is still in the repo as an optional legacy local Postgres setup, but Neon is now the default and recommended database workflow.
