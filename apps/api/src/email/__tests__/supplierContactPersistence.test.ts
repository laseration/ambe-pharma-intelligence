import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSupplierContactPersistenceData,
  buildSupplierContactSourceFingerprint,
  persistSupplierContactCandidate,
  reviewSupplierContactCandidate,
  type PersistedSupplierContactCandidate,
  type SupplierContactEventRecord,
  type SupplierContactPersistenceRepository,
} from '../inbound/supplierContactPersistence';
import type { SupplierContactExtractionCandidate } from '../inbound/supplierContactExtraction';

function candidate(
  overrides: Partial<SupplierContactExtractionCandidate> = {},
): SupplierContactExtractionCandidate {
  return {
    supplierNameCandidate: 'Delta Pharma Ltd',
    normalizedSupplierName: 'delta pharma ltd',
    contactName: 'Jane Buyer',
    contactEmail: 'jane@delta-pharma.example',
    contactPhoneRaw: '020 7000 1111',
    contactPhoneCanonical: '+442070001111',
    contactRole: 'sales manager',
    confidence: 86,
    status: 'STAGED',
    autoAttached: false,
    conflicts: [],
    reason:
      'Supplier contact candidate staged with deterministic provenance; operator approval is still required.',
    evidence: [
      {
        sourceType: 'ATTACHMENT_ROW',
        fieldName: 'supplierNameCandidate',
        rawValue: 'Delta Pharma Ltd',
        normalizedValue: 'delta pharma ltd',
        confidenceContribution: 30,
        sourceDocumentId: 'doc-1',
      },
      {
        sourceType: 'ATTACHMENT_ROW',
        fieldName: 'contactEmail',
        rawValue: 'jane@delta-pharma.example',
        normalizedValue: 'jane@delta-pharma.example',
        confidenceContribution: 14,
        sourceDocumentId: 'doc-1',
      },
    ],
    ...overrides,
  };
}

function createHarness() {
  const contacts: PersistedSupplierContactCandidate[] = [];
  const events: SupplierContactEventRecord[] = [];
  const evidence = new Map<string, unknown[]>();
  const suppliers = new Map<
    string,
    {
      id: string;
      name: string;
      normalizedName: string;
      contactEmail?: string | null;
      contactName?: string | null;
      contactPhone?: string | null;
    }
  >([
    [
      'supplier-1',
      {
        id: 'supplier-1',
        name: 'Delta Pharma Ltd',
        normalizedName: 'delta pharma ltd',
      },
    ],
  ]);
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const repository: SupplierContactPersistenceRepository = {
    async findBySourceFingerprint(sourceFingerprint) {
      return (
        contacts.find((item) => item.sourceFingerprint === sourceFingerprint) ??
        null
      );
    },
    async findById(id) {
      return contacts.find((item) => item.id === id) ?? null;
    },
    async createCandidate(data) {
      const created = {
        id: nextId('contact'),
        createdAt: new Date('2026-05-23T10:00:00.000Z'),
        updatedAt: new Date('2026-05-23T10:00:00.000Z'),
        ...data,
      };
      contacts.push(created);
      return created;
    },
    async updateCandidate(id, data) {
      const existing = contacts.find((item) => item.id === id);
      if (!existing) {
        throw new Error('Supplier contact candidate not found.');
      }
      Object.assign(existing, data, {
        updatedAt: new Date('2026-05-23T10:01:00.000Z'),
      });
      return existing;
    },
    async replaceEvidence(supplierContactId, items) {
      evidence.set(supplierContactId, items);
    },
    async createEvent(data) {
      const created = {
        id: nextId('event'),
        createdAt: new Date('2026-05-23T10:00:00.000Z'),
        ...data,
      };
      events.push(created);
      return created;
    },
    async listCandidates() {
      return contacts;
    },
    async listEvents(supplierContactId) {
      return events.filter(
        (item) => item.supplierContactId === supplierContactId,
      );
    },
    async findSupplierById(id) {
      return suppliers.get(id) ?? null;
    },
    async updateSupplierContactDetails(id, data) {
      const existing = suppliers.get(id);
      if (!existing) {
        return;
      }
      suppliers.set(id, {
        ...existing,
        ...(data.contactEmail ? { contactEmail: data.contactEmail } : {}),
        ...(data.contactName ? { contactName: data.contactName } : {}),
        ...(data.contactPhone ? { contactPhone: data.contactPhone } : {}),
      });
    },
  };

  return {
    contacts,
    events,
    evidence,
    suppliers,
    repository,
  };
}

test('supplier contact source fingerprint is deterministic across replay', () => {
  const input = {
    inboundEmailId: 'email-1',
    message: {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'immutable-message-1',
      from: 'forms@delta-pharma.example',
    },
    sourceDocumentId: 'doc-1',
    candidate: candidate(),
  };

  assert.equal(
    buildSupplierContactSourceFingerprint(input),
    buildSupplierContactSourceFingerprint(input),
  );
});

test('persisting a supplier contact candidate is idempotent and stages evidence', async () => {
  const harness = createHarness();
  const first = await persistSupplierContactCandidate({
    inboundEmailId: 'email-1',
    sourceDocumentId: 'doc-1',
    message: {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'immutable-message-1',
      from: 'forms@delta-pharma.example',
    },
    candidate: candidate(),
    repository: harness.repository,
  });
  const replay = await persistSupplierContactCandidate({
    inboundEmailId: 'email-1',
    sourceDocumentId: 'doc-1',
    message: {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'immutable-message-1',
      from: 'forms@delta-pharma.example',
    },
    candidate: candidate({ contactName: 'Jane Updated' }),
    repository: harness.repository,
  });

  assert.equal(first?.id, replay?.id);
  assert.equal(harness.contacts.length, 1);
  assert.equal(harness.events.length, 1);
  assert.equal(
    harness.events[0]?.actionType,
    'SUPPLIER_CONTACT_CANDIDATE_STAGED',
  );
  assert.equal(harness.evidence.get(first!.id)?.length, 2);
  assert.equal(replay?.contactName, 'Jane Updated');
});

test('approved supplier contact candidates are not overwritten by replay', async () => {
  const harness = createHarness();
  const created = await persistSupplierContactCandidate({
    inboundEmailId: 'email-1',
    sourceDocumentId: 'doc-1',
    message: {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'immutable-message-1',
      from: 'forms@delta-pharma.example',
    },
    candidate: candidate(),
    repository: harness.repository,
  });

  await reviewSupplierContactCandidate({
    id: created!.id,
    action: 'APPROVE',
    supplierId: 'supplier-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'ops-1',
    repository: harness.repository,
  });

  const replay = await persistSupplierContactCandidate({
    inboundEmailId: 'email-1',
    sourceDocumentId: 'doc-1',
    message: {
      sourceSystem: 'MICROSOFT_GRAPH',
      externalMessageId: 'immutable-message-1',
      from: 'forms@delta-pharma.example',
    },
    candidate: candidate({
      contactEmail: 'different@delta-pharma.example',
      contactName: 'Different Person',
    }),
    repository: harness.repository,
  });

  assert.equal(replay?.status, 'APPROVED');
  assert.equal(replay?.contactEmail, 'jane@delta-pharma.example');
  assert.equal(replay?.supplierId, 'supplier-1');
});

test('linking to a supplier writes the captured contact details onto the supplier record', async () => {
  const harness = createHarness();
  const created = await persistSupplierContactCandidate({
    inboundEmailId: 'email-1',
    sourceDocumentId: 'doc-1',
    candidate: candidate(),
    repository: harness.repository,
  });

  await assert.rejects(
    () =>
      reviewSupplierContactCandidate({
        id: created!.id,
        action: 'LINK_SUPPLIER',
        supplierId: 'missing-supplier',
        repository: harness.repository,
      }),
    /Supplier not found/,
  );

  const linked = await reviewSupplierContactCandidate({
    id: created!.id,
    action: 'LINK_SUPPLIER',
    supplierId: 'supplier-1',
    actorType: 'OPERATOR',
    actorIdentifier: 'ops-2',
    repository: harness.repository,
  });

  assert.equal(linked.status, 'STAGED');
  assert.equal(linked.supplierId, 'supplier-1');
  // The captured contact details are written back to the canonical supplier so
  // operators have correct, up-to-date contact info in place.
  const supplier = harness.suppliers.get('supplier-1');
  assert.equal(supplier?.name, 'Delta Pharma Ltd'); // name untouched
  assert.equal(supplier?.contactEmail, 'jane@delta-pharma.example');
  assert.equal(supplier?.contactName, 'Jane Buyer');
  assert.equal(supplier?.contactPhone, '+442070001111'); // canonical preferred
  assert.equal(
    harness.events.at(-1)?.actionType,
    'SUPPLIER_CONTACT_LINKED_TO_SUPPLIER',
  );
  assert.equal(
    (harness.events.at(-1)?.metadata as { supplierRecordUpdated?: boolean })
      ?.supplierRecordUpdated,
    true,
  );
});

test('persistence data keeps conflicting contacts staged for review', () => {
  const data = buildSupplierContactPersistenceData({
    inboundEmailId: 'email-1',
    candidate: candidate({
      supplierNameCandidate: null,
      normalizedSupplierName: null,
      confidence: 48,
      conflicts: ['conflicting supplier name evidence'],
    }),
  });

  assert.equal(data.status, 'STAGED');
  assert.deepEqual(data.conflictFlags, ['conflicting supplier name evidence']);
  assert.equal(data.autoAttached, false);
  assert.equal(data.supplierId, null);
});
