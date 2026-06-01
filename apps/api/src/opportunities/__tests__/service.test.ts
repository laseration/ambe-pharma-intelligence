import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Opportunity, Prisma } from '@prisma/client';

import { db } from '../../lib/db';
import { listOpportunities, updateOpportunityStatus } from '../service';

type OpportunityRecord = Opportunity & {
  product: { id: string; name: string; normalizedName: string } | null;
  supplier: { id: string; name: string } | null;
};

function createOpportunity(
  overrides?: Partial<OpportunityRecord>,
): OpportunityRecord {
  return {
    id: 'opportunity-1',
    type: 'BUY',
    status: 'OPEN',
    title: 'Buy opportunity',
    description: 'Supplier price is attractive.',
    score: 82,
    metadata: {
      metrics: {
        latestSupplierBuyPrice: 8.4,
      },
    } satisfies Prisma.JsonObject,
    customerId: null,
    productId: 'product-1',
    supplierId: 'supplier-1',
    ownerUserId: null,
    dueDate: null,
    createdAt: new Date('2026-04-23T00:00:00.000Z'),
    updatedAt: new Date('2026-04-23T00:00:00.000Z'),
    product: {
      id: 'product-1',
      name: 'Amlodipine 5mg tabs 28',
      normalizedName: 'amlodipine|5mg|tablet|28',
    },
    supplier: {
      id: 'supplier-1',
      name: 'Supplier Co',
    },
    ...overrides,
  };
}

function installOpportunityDbMocks(
  t: TestContext,
  opportunity: OpportunityRecord | null,
) {
  let currentOpportunity = opportunity;

  const originalFindUnique = db.opportunity.findUnique;
  const originalUpdate = db.opportunity.update;

  db.opportunity.findUnique = (async ({ where }) => {
    if (!currentOpportunity || where.id !== currentOpportunity.id) {
      return null;
    }

    return currentOpportunity;
  }) as typeof db.opportunity.findUnique;

  db.opportunity.update = (async ({
    where,
    data,
  }: Prisma.OpportunityUpdateArgs) => {
    if (!currentOpportunity || where.id !== currentOpportunity.id) {
      throw new Error('Opportunity not found during update.');
    }

    const nextStatus: Opportunity['status'] | undefined =
      data.status && typeof data.status === 'object' && 'set' in data.status
        ? (data.status.set as Opportunity['status'] | undefined)
        : (data.status as Opportunity['status'] | undefined);

    currentOpportunity = {
      ...currentOpportunity,
      status: nextStatus ?? currentOpportunity.status,
      metadata:
        (data.metadata as Prisma.JsonValue) ?? currentOpportunity.metadata,
      updatedAt: new Date('2026-04-24T00:00:00.000Z'),
    };

    return currentOpportunity;
  }) as unknown as typeof db.opportunity.update;

  t.after(() => {
    db.opportunity.findUnique = originalFindUnique;
    db.opportunity.update = originalUpdate;
  });
}

function installOpportunityListDbMock(
  t: TestContext,
  opportunities: OpportunityRecord[],
) {
  const originalFindMany = db.opportunity.findMany;

  db.opportunity.findMany = (async (args?: Prisma.OpportunityFindManyArgs) => {
    let items = [...opportunities];
    const where = args?.where;
    const orderBy = args?.orderBy;
    const take = args?.take;

    if (where && 'status' in where && where.status) {
      items = items.filter((item) => item.status === where.status);
    }

    if (Array.isArray(orderBy) && orderBy[0] && 'updatedAt' in orderBy[0]) {
      items.sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      );
    } else {
      items.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
      });
    }

    return typeof take === 'number' ? items.slice(0, take) : items;
  }) as typeof db.opportunity.findMany;

  t.after(() => {
    db.opportunity.findMany = originalFindMany;
  });
}

test('updates opportunity status and appends triage metadata', async (t) => {
  installOpportunityDbMocks(t, createOpportunity());

  const updated = await updateOpportunityStatus({
    opportunityId: 'opportunity-1',
    status: 'REVIEWED',
    actorType: 'OPERATOR',
    actorIdentifier: 'internal-operator:web-dashboard',
    note: 'Reviewed from dashboard.',
  });

  assert.ok(updated);
  assert.equal(updated.status, 'REVIEWED');
  assert.equal(
    (updated.metadata as { metrics?: { latestSupplierBuyPrice?: number } })
      .metrics?.latestSupplierBuyPrice,
    8.4,
  );
  const triage = (
    updated.metadata as {
      triage?: {
        latest?: {
          previousStatus?: string;
          newStatus?: string;
          actorIdentifier?: string | null;
          note?: string | null;
        };
        history?: Array<{ newStatus?: string }>;
      };
    }
  ).triage;
  assert.equal(triage?.latest?.previousStatus, 'OPEN');
  assert.equal(triage?.latest?.newStatus, 'REVIEWED');
  assert.equal(
    triage?.latest?.actorIdentifier,
    'internal-operator:web-dashboard',
  );
  assert.equal(triage?.latest?.note, 'Reviewed from dashboard.');
  assert.equal(triage?.history?.length, 1);
});

test('allows reviewed opportunities to be marked actioned', async (t) => {
  installOpportunityDbMocks(t, createOpportunity({ status: 'REVIEWED' }));

  const updated = await updateOpportunityStatus({
    opportunityId: 'opportunity-1',
    status: 'ACTIONED',
    actorType: 'OPERATOR',
    actorIdentifier: 'internal-operator:web-dashboard',
  });

  assert.ok(updated);
  assert.equal(updated.status, 'ACTIONED');
});

test('blocks invalid transitions from terminal states', async (t) => {
  installOpportunityDbMocks(t, createOpportunity({ status: 'ACTIONED' }));

  await assert.rejects(
    () =>
      updateOpportunityStatus({
        opportunityId: 'opportunity-1',
        status: 'REVIEWED',
        actorType: 'OPERATOR',
        actorIdentifier: 'internal-operator:web-dashboard',
      }),
    /cannot move from ACTIONED to REVIEWED/i,
  );
});

test('lists recently triaged opportunities by updatedAt and respects take', async (t) => {
  installOpportunityListDbMock(t, [
    createOpportunity({
      id: 'opportunity-1',
      status: 'REVIEWED',
      updatedAt: new Date('2026-04-24T10:00:00.000Z'),
    }),
    createOpportunity({
      id: 'opportunity-2',
      status: 'REVIEWED',
      updatedAt: new Date('2026-04-24T12:00:00.000Z'),
    }),
    createOpportunity({
      id: 'opportunity-3',
      status: 'OPEN',
      updatedAt: new Date('2026-04-24T13:00:00.000Z'),
    }),
  ]);

  const items = await listOpportunities({
    status: 'REVIEWED',
    sortBy: 'updatedAt',
    take: 1,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'opportunity-2');
});
