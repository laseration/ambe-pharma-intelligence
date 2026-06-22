-- CreateTable
-- Additive: introduces the Organization tenancy/config table. No existing table
-- is changed and no data is backfilled here. The default ("Ambe") organisation
-- is created idempotently by the seed script
-- (apps/api/src/scripts/seedDefaultOrganization.ts), so deploying this migration
-- on its own leaves current single-tenant behaviour unchanged.
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "internalEmailDomains" JSONB,
    "internalCompanyNames" JSONB,
    "alertEmailRecipients" JSONB,
    "reviewEmailRecipients" JSONB,
    "senderMailbox" TEXT,
    "telegramInternalChatId" TEXT,
    "accountOpeningProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
