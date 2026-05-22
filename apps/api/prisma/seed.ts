import { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';

async function resetSeedData() {
  await db.alert.deleteMany();
  await db.telegramPost.deleteMany();
  await db.opportunity.deleteMany();
  await db.salesRecord.deleteMany();
  await db.inventorySnapshot.deleteMany();
  await db.supplierPriceItem.deleteMany();
  await db.supplierPriceList.deleteMany();
  await db.importError.deleteMany();
  await db.importBatch.deleteMany();
  await db.productAlias.deleteMany();
  await db.product.deleteMany();
  await db.customer.deleteMany();
  await db.supplier.deleteMany();
  await db.appSetting.deleteMany();
  await db.user.deleteMany();
}

async function main() {
  await resetSeedData();

  const adminUser = await db.user.upsert({
    where: { email: 'admin@example.local' },
    update: {
      fullName: 'Admin User',
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email: 'admin@example.local',
      fullName: 'Admin User',
      role: 'ADMIN',
    },
  });

  const supplier = await db.supplier.upsert({
    where: { normalizedName: 'ambe pharma sourcing' },
    update: {
      name: 'Ambe Pharma Sourcing',
      country: 'India',
      contactEmail: 'sourcing@example.local',
      isActive: true,
    },
    create: {
      name: 'Ambe Pharma Sourcing',
      normalizedName: 'ambe pharma sourcing',
      country: 'India',
      contactEmail: 'sourcing@example.local',
    },
  });

  const customer = await db.customer.upsert({
    where: { normalizedName: 'city care pharmacy' },
    update: {
      name: 'City Care Pharmacy',
      legalEntityName: 'City Care Pharmacy Ltd',
      country: 'UK',
      city: 'London',
      primaryContactEmail: 'buyer@example.local',
      isActive: true,
    },
    create: {
      name: 'City Care Pharmacy',
      normalizedName: 'city care pharmacy',
      legalEntityName: 'City Care Pharmacy Ltd',
      country: 'UK',
      city: 'London',
      primaryContactEmail: 'buyer@example.local',
    },
  });

  const product = await db.product.upsert({
    where: { sku: 'AMBE-PARA-500' },
    update: {
      name: 'Paracetamol 500mg Tablets',
      normalizedName: 'paracetamol 500mg tablets',
      manufacturer: 'Acme Labs',
      strength: '500mg',
      dosageForm: 'Tablet',
      packSize: '100 tablets',
      isActive: true,
    },
    create: {
      sku: 'AMBE-PARA-500',
      name: 'Paracetamol 500mg Tablets',
      normalizedName: 'paracetamol 500mg tablets',
      manufacturer: 'Acme Labs',
      strength: '500mg',
      dosageForm: 'Tablet',
      packSize: '100 tablets',
    },
  });

  await db.productAlias.upsert({
    where: { id: 'seed-product-alias-paracetamol-500' },
    update: {
      productId: product.id,
      aliasName: 'Paracetamol 500',
      sourceSystem: 'seed',
    },
    create: {
      id: 'seed-product-alias-paracetamol-500',
      productId: product.id,
      aliasName: 'Paracetamol 500',
      sourceSystem: 'seed',
    },
  });

  const priceList = await db.supplierPriceList.create({
    data: {
      supplierId: supplier.id,
      fileName: 'supplier-price-list-april.csv',
      sourceDate: new Date('2026-04-01T00:00:00.000Z'),
      currencyCode: 'USD',
    },
  });

  await db.supplierPriceItem.create({
    data: {
      supplierPriceListId: priceList.id,
      supplierId: supplier.id,
      productId: product.id,
      rawProductName: 'Paracetamol 500mg Tablets',
      normalizedProductName: 'paracetamol 500mg tablets',
      candidateStrength: '500mg',
      candidateFormulation: 'Tablet',
      candidatePackSize: '100 tablets',
      packDescription: '100 tablets',
      unitPrice: new Prisma.Decimal('2.35'),
      minimumOrderQuantity: 50,
      rawRow: {
        productName: 'Paracetamol 500mg Tablets',
        packDescription: '100 tablets',
        unitPrice: '2.35',
        minimumOrderQuantity: '50',
      },
    },
  });

  await db.inventorySnapshot.create({
    data: {
      productId: product.id,
      supplierId: supplier.id,
      rawProductName: 'Paracetamol 500mg Tablets',
      rawSupplierName: supplier.name,
      normalizedProductName: 'paracetamol 500mg tablets',
      candidateStrength: '500mg',
      candidateFormulation: 'Tablet',
      candidatePackSize: '100 tablets',
      warehouseCode: 'MAIN',
      snapshotDate: new Date('2026-04-15T00:00:00.000Z'),
      quantityOnHand: 1200,
      quantityReserved: 200,
      quantityAvailable: 1000,
      unitCost: new Prisma.Decimal('1.90'),
      totalValue: new Prisma.Decimal('2280.00'),
      rawRow: {
        productName: 'Paracetamol 500mg Tablets',
        supplierName: supplier.name,
        warehouseCode: 'MAIN',
        snapshotDate: '2026-04-15',
        quantityOnHand: '1200',
        quantityReserved: '200',
        quantityAvailable: '1000',
        unitCost: '1.90',
        totalValue: '2280.00',
      },
    },
  });

  await db.salesRecord.create({
    data: {
      saleDate: new Date('2026-04-10T00:00:00.000Z'),
      customerId: customer.id,
      productId: product.id,
      supplierId: supplier.id,
      rawProductName: 'Paracetamol 500mg Tablets',
      rawCustomerName: customer.name,
      rawSupplierName: supplier.name,
      normalizedProductName: 'paracetamol 500mg tablets',
      candidateStrength: '500mg',
      candidateFormulation: 'Tablet',
      candidatePackSize: '100 tablets',
      quantity: 300,
      unitPrice: new Prisma.Decimal('3.20'),
      totalRevenue: new Prisma.Decimal('960.00'),
      rawRow: {
        saleDate: '2026-04-10',
        customerName: customer.name,
        productName: 'Paracetamol 500mg Tablets',
        supplierName: supplier.name,
        quantity: '300',
        unitPrice: '3.20',
        totalRevenue: '960.00',
      },
    },
  });

  const opportunity = await db.opportunity.create({
    data: {
      type: 'PUSH',
      status: 'OPEN',
      title: 'Push Paracetamol 500mg into City Care Pharmacy',
      description:
        'Healthy stock, active customer, and margin support a sales push.',
      score: 82,
      customerId: customer.id,
      productId: product.id,
      supplierId: supplier.id,
      ownerUserId: adminUser.id,
      dueDate: new Date('2026-04-30T00:00:00.000Z'),
    },
  });

  await db.alert.create({
    data: {
      type: 'OPPORTUNITY',
      status: 'OPEN',
      title: 'New push opportunity ready for review',
      message:
        'Paracetamol 500mg has available stock and a qualified customer target.',
      userId: adminUser.id,
      opportunityId: opportunity.id,
    },
  });

  await db.telegramPost.create({
    data: {
      channelKey: 'sales-alerts',
      status: 'PENDING',
      messageText: 'Review new PUSH opportunity for Paracetamol 500mg.',
    },
  });

  await db.appSetting.upsert({
    where: { key: 'default_legal_entity_name' },
    update: {},
    create: {
      key: 'default_legal_entity_name',
      value: 'Ambe Pharma Intelligence Ltd',
      type: 'STRING',
      description: 'Default legal entity name used in generated documents.',
    },
  });

  console.log('Seed completed successfully.');
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error('Seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void run();
