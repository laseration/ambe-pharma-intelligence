import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { BuyerTradeEnquiry, Prisma } from '@prisma/client';

import { db } from '../../lib/db';
import {
  buildSupplierDraftOpportunityInput,
  createBuyerTradeEnquiry,
  detectPublicTradeEnquirySpam,
  isBuyerTradeEnquiryStatusTransitionAllowed,
  listBuyerTradeEnquiries,
  updateBuyerTradeEnquiryStatus,
} from '../service';

function createBuyerTradeEnquiryRecord(
  overrides: Partial<BuyerTradeEnquiry> = {},
): BuyerTradeEnquiry {
  return {
    id: 'trade-enquiry-1',
    status: 'NEW',
    priority: 'NORMAL',
    companyName: 'Buyer Pharmacy Ltd',
    contactName: 'Procurement Manager',
    contactEmail: 'buyer@example.test',
    contactPhone: null,
    businessType: 'Pharmacy',
    country: 'United Kingdom',
    productName: 'Comparator requirement',
    strength: '10mg',
    packSize: '30 tablets',
    quantityRequired: '100 packs',
    targetMarket: 'UK',
    requiredBy: null,
    documentationNotes: null,
    additionalNotes: null,
    source: 'PUBLIC_TRADE_ACCESS',
    reviewNotes: null,
    statusUpdatedAt: null,
    statusUpdatedBy: null,
    createdAt: new Date('2026-06-07T09:00:00.000Z'),
    updatedAt: new Date('2026-06-07T09:00:00.000Z'),
    ...overrides,
  };
}

function installBuyerTradeEnquiryDbMock(
  t: TestContext,
  records: BuyerTradeEnquiry[],
) {
  const originalCreate = db.buyerTradeEnquiry.create;
  const originalFindFirst = db.buyerTradeEnquiry.findFirst;
  const originalFindMany = db.buyerTradeEnquiry.findMany;
  const originalFindUnique = db.buyerTradeEnquiry.findUnique;
  const originalUpdate = db.buyerTradeEnquiry.update;
  let currentRecords = [...records];

  db.buyerTradeEnquiry.findFirst = (async (
    args?: Prisma.BuyerTradeEnquiryFindFirstArgs,
  ) => {
    const contactEmail = args?.where?.contactEmail;
    const companyName = args?.where?.companyName;
    const productName = args?.where?.productName;

    return (
      currentRecords.find(
        (item) =>
          item.contactEmail === contactEmail &&
          item.companyName === companyName &&
          item.productName === productName,
      ) ?? null
    );
  }) as typeof db.buyerTradeEnquiry.findFirst;

  db.buyerTradeEnquiry.create = (async ({
    data,
  }: Prisma.BuyerTradeEnquiryCreateArgs) => {
    const record = createBuyerTradeEnquiryRecord({
      id: `trade-enquiry-${currentRecords.length + 1}`,
      priority: (data.priority as BuyerTradeEnquiry['priority']) ?? 'NORMAL',
      companyName: data.companyName as string,
      contactName: data.contactName as string,
      contactEmail: data.contactEmail as string,
      contactPhone: (data.contactPhone as string | null | undefined) ?? null,
      businessType: (data.businessType as string | null | undefined) ?? null,
      country: (data.country as string | null | undefined) ?? null,
      productName: data.productName as string,
      strength: (data.strength as string | null | undefined) ?? null,
      packSize: (data.packSize as string | null | undefined) ?? null,
      quantityRequired:
        (data.quantityRequired as string | null | undefined) ?? null,
      targetMarket: (data.targetMarket as string | null | undefined) ?? null,
      requiredBy: (data.requiredBy as Date | null | undefined) ?? null,
      documentationNotes:
        (data.documentationNotes as string | null | undefined) ?? null,
      additionalNotes:
        (data.additionalNotes as string | null | undefined) ?? null,
    });
    currentRecords = [record, ...currentRecords];
    return record;
  }) as unknown as typeof db.buyerTradeEnquiry.create;

  db.buyerTradeEnquiry.findMany = (async (
    args?: Prisma.BuyerTradeEnquiryFindManyArgs,
  ) => {
    let items = [...currentRecords];

    if (args?.where?.status) {
      items = items.filter((item) => item.status === args.where?.status);
    }

    if (args?.where?.priority) {
      items = items.filter((item) => item.priority === args.where?.priority);
    }

    const companyFilter = args?.where?.companyName;
    if (
      companyFilter &&
      typeof companyFilter === 'object' &&
      'contains' in companyFilter &&
      typeof companyFilter.contains === 'string'
    ) {
      const query = companyFilter.contains.toLowerCase();
      items = items.filter((item) =>
        item.companyName.toLowerCase().includes(query),
      );
    }

    const createdAtFilter = args?.where?.createdAt as
      | { gte?: Date; lte?: Date }
      | undefined;
    if (createdAtFilter?.gte) {
      items = items.filter(
        (item) => item.createdAt.getTime() >= createdAtFilter.gte!.getTime(),
      );
    }

    if (createdAtFilter?.lte) {
      items = items.filter(
        (item) => item.createdAt.getTime() <= createdAtFilter.lte!.getTime(),
      );
    }

    items.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return typeof args?.take === 'number' ? items.slice(0, args.take) : items;
  }) as typeof db.buyerTradeEnquiry.findMany;

  db.buyerTradeEnquiry.findUnique = (async ({
    where,
  }: Prisma.BuyerTradeEnquiryFindUniqueArgs) =>
    currentRecords.find((item) => item.id === where.id) ??
    null) as unknown as typeof db.buyerTradeEnquiry.findUnique;

  db.buyerTradeEnquiry.update = (async ({
    where,
    data,
  }: Prisma.BuyerTradeEnquiryUpdateArgs) => {
    const existing = currentRecords.find((item) => item.id === where.id);
    if (!existing) {
      throw new Error('Trade enquiry not found during update.');
    }

    const updated = {
      ...existing,
      status:
        (data.status as BuyerTradeEnquiry['status'] | undefined) ??
        existing.status,
      reviewNotes:
        (data.reviewNotes as string | null | undefined) ?? existing.reviewNotes,
      statusUpdatedAt:
        (data.statusUpdatedAt as Date | null | undefined) ??
        existing.statusUpdatedAt,
      statusUpdatedBy:
        (data.statusUpdatedBy as string | null | undefined) ??
        existing.statusUpdatedBy,
      updatedAt: new Date('2026-06-07T11:00:00.000Z'),
    };
    currentRecords = currentRecords.map((item) =>
      item.id === updated.id ? updated : item,
    );
    return updated;
  }) as unknown as typeof db.buyerTradeEnquiry.update;

  t.after(() => {
    db.buyerTradeEnquiry.create = originalCreate;
    db.buyerTradeEnquiry.findFirst = originalFindFirst;
    db.buyerTradeEnquiry.findMany = originalFindMany;
    db.buyerTradeEnquiry.findUnique = originalFindUnique;
    db.buyerTradeEnquiry.update = originalUpdate;
  });

  return {
    getRecords: () => [...currentRecords],
  };
}

test('creates public buyer RFQ records as manual-review enquiries', async (t) => {
  installBuyerTradeEnquiryDbMock(t, []);

  const item = await createBuyerTradeEnquiry({
    companyName: ' Buyer Pharmacy Ltd ',
    contactName: ' Procurement Manager ',
    contactEmail: 'BUYER@EXAMPLE.TEST',
    productName: ' Comparator requirement ',
    quantityRequired: '100 packs',
  });

  assert.equal(item.status, 'NEW');
  assert.equal(item.priority, 'NORMAL');
  assert.equal(item.companyName, 'Buyer Pharmacy Ltd');
  assert.equal(item.contactEmail, 'buyer@example.test');
  assert.equal(item.productName, 'Comparator requirement');
  assert.equal(item.source, 'PUBLIC_TRADE_ACCESS');
});

test('rejects obvious spam before persistence', async (t) => {
  installBuyerTradeEnquiryDbMock(t, []);

  assert.deepEqual(
    detectPublicTradeEnquirySpam({
      companyName: 'Buyer Pharmacy Ltd',
      contactName: 'Procurement Manager',
      contactEmail: 'buyer@example.test',
      productName: 'Comparator requirement',
      honeypot: 'bot-filled-field',
    }),
    ['honeypot field was populated'],
  );

  await assert.rejects(
    () =>
      createBuyerTradeEnquiry({
        companyName: 'Buyer Pharmacy Ltd',
        contactName: 'Procurement Manager',
        contactEmail: 'buyer@example.test',
        productName:
          'Casino backlinks http://one.test http://two.test http://three.test',
      }),
    /rejected by validation checks/i,
  );
});

test('rejects duplicate buyer RFQs without creating another record', async (t) => {
  const dbMock = installBuyerTradeEnquiryDbMock(t, [
    createBuyerTradeEnquiryRecord(),
  ]);

  await assert.rejects(
    () =>
      createBuyerTradeEnquiry({
        companyName: 'Buyer Pharmacy Ltd',
        contactName: 'Procurement Manager',
        contactEmail: 'buyer@example.test',
        productName: 'Comparator requirement',
      }),
    /already submitted recently/i,
  );
  assert.equal(dbMock.getRecords().length, 1);
});

test('lists buyer RFQs by status, priority, company, and created date', async (t) => {
  installBuyerTradeEnquiryDbMock(t, [
    createBuyerTradeEnquiryRecord({
      id: 'closed-enquiry',
      status: 'CLOSED',
      priority: 'LOW',
      companyName: 'Older Buyer Ltd',
      createdAt: new Date('2026-06-07T08:00:00.000Z'),
    }),
    createBuyerTradeEnquiryRecord({
      id: 'new-enquiry',
      status: 'NEW',
      priority: 'URGENT',
      companyName: 'QA Trade Buyer Ltd',
      createdAt: new Date('2026-06-07T10:00:00.000Z'),
    }),
  ]);

  const items = await listBuyerTradeEnquiries({
    status: 'NEW',
    priority: 'URGENT',
    company: 'qa trade',
    createdFrom: new Date('2026-06-07T09:00:00.000Z'),
    createdTo: new Date('2026-06-07T23:59:59.999Z'),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'new-enquiry');
  assert.equal(items[0]?.status, 'NEW');
  assert.equal(items[0]?.priority, 'URGENT');
  assert.equal(items[0]?.companyName, 'QA Trade Buyer Ltd');
});

test('updates buyer RFQ status through the manual-review workflow', async (t) => {
  installBuyerTradeEnquiryDbMock(t, [createBuyerTradeEnquiryRecord()]);

  const reviewing = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'trade-enquiry-1',
    status: 'REVIEWING',
    reviewNotes: 'Checking company and requirement context.',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
    now: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(reviewing?.status, 'REVIEWING');
  assert.equal(
    reviewing?.reviewNotes,
    'Checking company and requirement context.',
  );
  assert.equal(reviewing?.statusUpdatedBy, 'web-dashboard');
  assert.equal(reviewing?.statusUpdatedAt, '2026-06-07T12:00:00.000Z');

  const matched = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'trade-enquiry-1',
    status: 'MATCHED',
    reviewNotes: 'Matched to internal sourcing workflow.',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
    now: new Date('2026-06-07T12:10:00.000Z'),
  });
  assert.equal(matched?.status, 'MATCHED');

  const quoted = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'trade-enquiry-1',
    status: 'QUOTED',
    reviewNotes: 'Quote prepared after manual review.',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
    now: new Date('2026-06-07T12:20:00.000Z'),
  });
  assert.equal(quoted?.status, 'QUOTED');

  const closed = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'trade-enquiry-1',
    status: 'CLOSED',
    reviewNotes: 'Closed after operator action.',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
    now: new Date('2026-06-07T12:30:00.000Z'),
  });
  assert.equal(closed?.status, 'CLOSED');
  assert.equal(closed?.reviewNotes, 'Closed after operator action.');
});

test('blocks invalid buyer RFQ status transitions', async (t) => {
  const dbMock = installBuyerTradeEnquiryDbMock(t, [
    createBuyerTradeEnquiryRecord({
      status: 'CLOSED',
      reviewNotes: 'Original closing note.',
    }),
  ]);

  assert.equal(
    isBuyerTradeEnquiryStatusTransitionAllowed('CLOSED', 'ARCHIVED'),
    true,
  );
  assert.equal(
    isBuyerTradeEnquiryStatusTransitionAllowed('CLOSED', 'NEW'),
    false,
  );

  await assert.rejects(
    () =>
      updateBuyerTradeEnquiryStatus({
        enquiryId: 'trade-enquiry-1',
        status: 'NEW',
        actorType: 'OPERATOR',
        actorIdentifier: 'web-dashboard',
      }),
    /cannot move from CLOSED to NEW/i,
  );
  assert.equal(dbMock.getRecords()[0]?.status, 'CLOSED');
  assert.equal(dbMock.getRecords()[0]?.reviewNotes, 'Original closing note.');
});

test('allows spam duplicate rejected and archived statuses only through supported transitions', async (t) => {
  installBuyerTradeEnquiryDbMock(t, [
    createBuyerTradeEnquiryRecord({
      id: 'duplicate-enquiry',
      status: 'NEW',
    }),
    createBuyerTradeEnquiryRecord({
      id: 'spam-enquiry',
      status: 'REVIEWING',
    }),
    createBuyerTradeEnquiryRecord({
      id: 'rejected-enquiry',
      status: 'MATCHED',
    }),
    createBuyerTradeEnquiryRecord({
      id: 'archived-enquiry',
      status: 'REJECTED',
    }),
  ]);

  const duplicate = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'duplicate-enquiry',
    status: 'DUPLICATE',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
  });
  assert.equal(duplicate?.status, 'DUPLICATE');

  const spam = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'spam-enquiry',
    status: 'SPAM',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
  });
  assert.equal(spam?.status, 'SPAM');

  const rejected = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'rejected-enquiry',
    status: 'REJECTED',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
  });
  assert.equal(rejected?.status, 'REJECTED');

  const archived = await updateBuyerTradeEnquiryStatus({
    enquiryId: 'archived-enquiry',
    status: 'ARCHIVED',
    actorType: 'OPERATOR',
    actorIdentifier: 'web-dashboard',
  });
  assert.equal(archived?.status, 'ARCHIVED');

  assert.equal(
    isBuyerTradeEnquiryStatusTransitionAllowed('MATCHED', 'SPAM'),
    false,
  );
  assert.equal(
    isBuyerTradeEnquiryStatusTransitionAllowed('ARCHIVED', 'REJECTED'),
    false,
  );
});

test('supplier list rows become internal draft opportunities with review warnings', () => {
  const input = buildSupplierDraftOpportunityInput({
    productName: '  Supplier product  ',
    strength: '20mg',
    packSize: '28 tabs',
    quantity: '240 packs',
    expiry: '2027-03-31',
    storage: 'Supplier stated ambient',
    country: 'DE',
    supplierPrice: '12.40',
    currencyCode: 'eur',
    confidence: 0.82,
    warnings: ['Pack size needs confirmation.'],
    rawRow: {
      row: 4,
    },
  });

  assert.equal(input.productName, 'Supplier product');
  assert.equal(input.strength, '20mg');
  assert.equal(input.packSize, '28 tabs');
  assert.equal(input.quantity, '240 packs');
  assert.equal(input.country, 'DE');
  assert.equal(input.currencyCode, 'EUR');
  assert.equal(input.confidence, 0.82);
  assert.equal(
    input.reviewWarning,
    'Internal draft only. Human review is required before any buyer-facing use.',
  );
  assert.deepEqual(input.warnings, [
    'Pack size needs confirmation.',
    'Internal draft only. Human review is required before any buyer-facing use.',
  ]);
});
