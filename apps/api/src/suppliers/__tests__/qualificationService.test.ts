import assert from 'node:assert/strict';
import test from 'node:test';

import { createSupplierQualificationService } from '../qualificationService';

function createHarness() {
  const qualifications: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  return {
    qualifications,
    events,
    service: createSupplierQualificationService({
      async findBySupplierId(supplierId) {
        return (qualifications.find((item) => item.supplierId === supplierId) ??
          null) as never;
      },
      async create(data) {
        const created = {
          id: nextId('qualification'),
          qualificationNote: null,
          lastReviewedAt: null,
          reviewedByType: null,
          reviewedByIdentifier: null,
          expiresAt: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          supplier: {
            id: data.supplierId,
            name: `Supplier ${data.supplierId}`,
            normalizedName: `supplier-${data.supplierId}`,
          },
          ...data,
        };
        qualifications.push(created);
        return created as never;
      },
      async update(id, data) {
        const existing = qualifications.find((item) => item.id === id);
        if (!existing) {
          throw new Error('qualification not found');
        }
        Object.assign(existing, data, { updatedAt: new Date() });
        return existing as never;
      },
      async createEvent(data) {
        const created = {
          id: nextId('qualification-event'),
          createdAt: new Date(),
          ...data,
        };
        events.push(created);
        return created as never;
      },
      async list() {
        return qualifications as never;
      },
      async listEvents(supplierQualificationId) {
        return events.filter(
          (item) => item.supplierQualificationId === supplierQualificationId,
        ) as never;
      },
    }),
  };
}

test('supplier qualification upsert creates and logs events', async () => {
  const harness = createHarness();

  const created = await harness.service.upsertQualification({
    supplierId: 'supplier-1',
    qualificationStatus: 'PENDING_REVIEW',
    trustTier: 'LOW',
    qualificationNote: 'Initial review required.',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });
  const createdStatus = created.qualificationStatus;

  const updated = await harness.service.upsertQualification({
    supplierId: 'supplier-1',
    qualificationStatus: 'APPROVED',
    trustTier: 'MEDIUM',
    qualificationNote: 'Approved for normal buying.',
    actorType: 'USER',
    actorIdentifier: 'ops-2',
  });

  assert.equal(createdStatus, 'PENDING_REVIEW');
  assert.equal(updated.qualificationStatus, 'APPROVED');
  assert.equal(harness.qualifications.length, 1);
  assert.equal(harness.events.length, 2);
  assert.equal(harness.events[0]?.actionType, 'CREATED');
  assert.equal(harness.events[1]?.actionType, 'APPROVED');
});

test('missing qualification defaults to conservative unknown state', async () => {
  const harness = createHarness();

  const item =
    await harness.service.getQualificationForSupplier('supplier-unknown');

  assert.equal(item?.qualificationStatus, 'UNKNOWN');
  assert.equal(item?.requiresManualApproval, true);
  assert.equal(item?.canAutoApproveBuyDecisions, false);
});
