-- AlterTable
-- Additive, nullable columns for manual Account Opening case creation.
-- No backfill, no default, no index — existing rows keep NULL and existing
-- intake behaviour is unchanged.
ALTER TABLE "AccountOpeningCase" ADD COLUMN "caseType" TEXT;
ALTER TABLE "AccountOpeningCase" ADD COLUMN "sourceChannel" TEXT;
