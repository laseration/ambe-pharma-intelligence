ALTER TABLE "Product"
ADD COLUMN "baseName" TEXT;

ALTER TABLE "Supplier"
ADD COLUMN "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

ALTER TABLE "SupplierPriceItem"
ADD COLUMN "marketPriceEstimate" DECIMAL(12, 2),
ADD COLUMN "marketPriceConfidence" DOUBLE PRECISION,
ADD COLUMN "priceDeltaFromMarketPct" DOUBLE PRECISION;
