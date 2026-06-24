import { createHash } from 'node:crypto';

import { db } from '../../lib/db';
import type { ClassificationDecision, EmailInboundMessage } from './types';
import type {
  SupplierContactEvidenceItem,
  SupplierContactExtractionCandidate,
} from './supplierContactExtraction';

export type SupplierContactStatus =
  | 'STAGED'
  | 'AUTO_ACCEPTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type SupplierContactReviewAction =
  | 'APPROVE'
  | 'REJECT'
  | 'SUPERSEDE'
  | 'LINK_SUPPLIER'
  | 'ADD_NOTE';

export type PersistedSupplierContactCandidate = {
  id: string;
  supplierId: string | null;
  supplierNameCandidate: string | null;
  normalizedSupplierName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhoneRaw: string | null;
  contactPhoneCanonical: string | null;
  contactRole: string | null;
  sourceInboundEmailId: string | null;
  sourceDocumentId: string | null;
  sourceFingerprint: string;
  confidence: number;
  status: SupplierContactStatus;
  autoAttached: boolean;
  conflictFlags: unknown;
  evidence: unknown;
  extractionMetadata: unknown;
  lastSeenAt: Date;
  reviewedAt: Date | null;
  reviewedByType: string | null;
  reviewedByIdentifier: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplier?: {
    id: string;
    name: string;
    normalizedName: string;
  } | null;
};

export type SupplierContactEventRecord = {
  id: string;
  supplierContactId: string;
  actionType: string;
  previousStatus: SupplierContactStatus | null;
  newStatus: SupplierContactStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type SupplierContactPersistenceDocument = {
  id: string;
  kind: string;
  label: string | null;
  textContent: string;
};

export type PersistSupplierContactCandidateInput = {
  inboundEmailId: string;
  sourceDocumentId?: string | null;
  candidate: SupplierContactExtractionCandidate;
  classification?: ClassificationDecision | null;
  actorType?: string;
  actorIdentifier?: string | null;
  now?: Date;
  message?: EmailInboundMessage;
};

export type SupplierContactListFilters = {
  status?: SupplierContactStatus | null;
  inboundEmailId?: string | null;
  supplierId?: string | null;
  take?: number;
};

type SupplierContactCreateData = Omit<
  PersistedSupplierContactCandidate,
  'id' | 'createdAt' | 'updatedAt' | 'supplier'
>;

type SupplierContactUpdateData = Partial<
  Omit<PersistedSupplierContactCandidate, 'id' | 'createdAt' | 'updatedAt'>
>;

export type SupplierContactPersistenceRepository = {
  findBySourceFingerprint: (
    sourceFingerprint: string,
  ) => Promise<PersistedSupplierContactCandidate | null>;
  findById: (id: string) => Promise<PersistedSupplierContactCandidate | null>;
  createCandidate: (
    data: SupplierContactCreateData,
  ) => Promise<PersistedSupplierContactCandidate>;
  updateCandidate: (
    id: string,
    data: SupplierContactUpdateData,
  ) => Promise<PersistedSupplierContactCandidate>;
  replaceEvidence: (
    supplierContactId: string,
    evidence: SupplierContactEvidenceItem[],
  ) => Promise<void>;
  createEvent: (
    data: Omit<SupplierContactEventRecord, 'id' | 'createdAt'>,
  ) => Promise<SupplierContactEventRecord>;
  listCandidates: (
    filters: SupplierContactListFilters,
  ) => Promise<PersistedSupplierContactCandidate[]>;
  listEvents: (
    supplierContactId: string,
  ) => Promise<SupplierContactEventRecord[]>;
  findSupplierById: (
    supplierId: string,
  ) => Promise<{ id: string; name: string; normalizedName: string } | null>;
  updateSupplierContactDetails: (
    supplierId: string,
    data: {
      contactEmail: string | null;
      contactName: string | null;
      contactPhone: string | null;
    },
  ) => Promise<void>;
};

type SupplierContactDbClient = {
  supplierContact: {
    findUnique: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  supplierContactEvidence: {
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
  supplierContactEvent: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown>;
  };
  supplier: {
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter(
    (value): value is T => value !== null && value !== undefined,
  );
}

function normalizeActor(input?: {
  actorType?: string | null;
  actorIdentifier?: string | null;
}): { actorType: string; actorIdentifier: string | null } {
  return {
    actorType: input?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: input?.actorIdentifier?.trim() || null,
  };
}

function firstSourceDocumentId(
  candidate: SupplierContactExtractionCandidate,
  fallback?: string | null,
): string | null {
  return (
    candidate.evidence.find((item) => item.sourceDocumentId)
      ?.sourceDocumentId ??
    fallback ??
    null
  );
}

export function buildSupplierContactSourceFingerprint(input: {
  inboundEmailId?: string | null;
  message?: EmailInboundMessage | null;
  sourceDocumentId?: string | null;
  candidate: SupplierContactExtractionCandidate;
}): string {
  const message = input.message;
  const messageIdentity =
    normalize(message?.sourceSystem) +
    '|' +
    normalize(
      message?.externalMessageId ??
        message?.messageId ??
        message?.conversationId ??
        input.inboundEmailId ??
        null,
    );
  return hash(
    ['supplier-contact-v1', messageIdentity, input.sourceDocumentId ?? ''].join(
      '|',
    ),
  );
}

export function shouldPersistSupplierContactCandidate(
  candidate: SupplierContactExtractionCandidate,
): boolean {
  return Boolean(
    candidate.evidence.length > 0 &&
    (candidate.supplierNameCandidate ||
      candidate.contactEmail ||
      candidate.contactPhoneRaw ||
      candidate.contactRole),
  );
}

function buildExtractionMetadata(input: {
  candidate: SupplierContactExtractionCandidate;
  classification?: ClassificationDecision | null;
}) {
  return {
    extractorVersion: 'supplier-contact-extraction-v1',
    reason: input.candidate.reason,
    classification: input.classification
      ? {
          runnerVersion: input.classification.runnerVersion,
          primaryClass: input.classification.primaryClass,
          routing: input.classification.routing,
          confidence: input.classification.confidence,
          score: input.classification.score,
          safeToAutoRoute: input.classification.safeToAutoRoute,
          conflicts: input.classification.conflicts,
        }
      : null,
  };
}

export function buildSupplierContactPersistenceData(
  input: PersistSupplierContactCandidateInput,
): SupplierContactCreateData {
  const now = input.now ?? new Date();
  const sourceDocumentId = firstSourceDocumentId(
    input.candidate,
    input.sourceDocumentId,
  );
  const sourceFingerprint = buildSupplierContactSourceFingerprint({
    inboundEmailId: input.inboundEmailId,
    message: input.message,
    sourceDocumentId,
    candidate: input.candidate,
  });

  return {
    supplierId: null,
    supplierNameCandidate: input.candidate.supplierNameCandidate,
    normalizedSupplierName: input.candidate.normalizedSupplierName,
    contactName: input.candidate.contactName,
    contactEmail: input.candidate.contactEmail,
    contactPhone: input.candidate.contactPhoneRaw,
    contactPhoneRaw: input.candidate.contactPhoneRaw,
    contactPhoneCanonical: input.candidate.contactPhoneCanonical,
    contactRole: input.candidate.contactRole,
    sourceInboundEmailId: input.inboundEmailId,
    sourceDocumentId,
    sourceFingerprint,
    confidence: input.candidate.confidence,
    status: 'STAGED',
    autoAttached: false,
    conflictFlags: input.candidate.conflicts,
    evidence: input.candidate.evidence,
    extractionMetadata: buildExtractionMetadata(input),
    lastSeenAt: now,
    reviewedAt: null,
    reviewedByType: null,
    reviewedByIdentifier: null,
    reviewNote: null,
  };
}

export function createSupplierContactPersistenceRepository(
  client: SupplierContactDbClient = db as unknown as SupplierContactDbClient,
): SupplierContactPersistenceRepository {
  const candidateInclude = {
    supplier: {
      select: {
        id: true,
        name: true,
        normalizedName: true,
      },
    },
  };

  return {
    findBySourceFingerprint: async (sourceFingerprint) =>
      (await client.supplierContact.findUnique({
        where: { sourceFingerprint },
        include: candidateInclude,
      })) as PersistedSupplierContactCandidate | null,
    findById: async (id) =>
      (await client.supplierContact.findUnique({
        where: { id },
        include: candidateInclude,
      })) as PersistedSupplierContactCandidate | null,
    createCandidate: async (data) =>
      (await client.supplierContact.create({
        data: data as never,
        include: candidateInclude,
      })) as PersistedSupplierContactCandidate,
    updateCandidate: async (id, data) =>
      (await client.supplierContact.update({
        where: { id },
        data: data as never,
        include: candidateInclude,
      })) as PersistedSupplierContactCandidate,
    replaceEvidence: async (supplierContactId, evidence) => {
      await client.supplierContactEvidence.deleteMany({
        where: { supplierContactId },
      });
      if (evidence.length === 0) {
        return;
      }
      await client.supplierContactEvidence.createMany({
        data: evidence.map((item) => ({
          supplierContactId,
          sourceDocumentId: item.sourceDocumentId ?? null,
          sourceType: item.sourceType,
          fieldName: item.fieldName,
          rawValue: item.rawValue,
          normalizedValue: item.normalizedValue ?? null,
          confidenceContribution: item.confidenceContribution,
          snippet: item.snippet ?? null,
          pageNumber: item.pageNumber ?? null,
          boundingBox: null,
        })),
      });
    },
    createEvent: async (data) =>
      (await client.supplierContactEvent.create({
        data: data as never,
      })) as SupplierContactEventRecord,
    listCandidates: async (filters) => {
      const where: Record<string, unknown> = {};
      if (filters.status) {
        where.status = filters.status;
      }
      if (filters.inboundEmailId) {
        where.sourceInboundEmailId = filters.inboundEmailId;
      }
      if (filters.supplierId) {
        where.supplierId = filters.supplierId;
      }

      return (await client.supplierContact.findMany({
        where,
        include: candidateInclude,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: filters.take ?? 100,
      })) as PersistedSupplierContactCandidate[];
    },
    listEvents: async (supplierContactId) =>
      (await client.supplierContactEvent.findMany({
        where: { supplierContactId },
        orderBy: { createdAt: 'asc' },
      })) as SupplierContactEventRecord[],
    findSupplierById: async (supplierId) =>
      (await client.supplier.findUnique({
        where: { id: supplierId },
        select: {
          id: true,
          name: true,
          normalizedName: true,
        },
      })) as { id: string; name: string; normalizedName: string } | null,
    updateSupplierContactDetails: async (supplierId, data) => {
      // Only overwrite a field when the approved contact actually has a value,
      // so an approval never blanks existing supplier contact details.
      await client.supplier.update({
        where: { id: supplierId },
        data: {
          ...(data.contactEmail ? { contactEmail: data.contactEmail } : {}),
          ...(data.contactName ? { contactName: data.contactName } : {}),
          ...(data.contactPhone ? { contactPhone: data.contactPhone } : {}),
        },
      });
    },
  };
}

async function writeCandidateEvidence(
  repository: SupplierContactPersistenceRepository,
  supplierContactId: string,
  candidate: SupplierContactExtractionCandidate,
): Promise<void> {
  await repository.replaceEvidence(supplierContactId, candidate.evidence);
}

export async function persistSupplierContactCandidate(
  input: PersistSupplierContactCandidateInput & {
    repository?: SupplierContactPersistenceRepository;
  },
): Promise<PersistedSupplierContactCandidate | null> {
  if (!shouldPersistSupplierContactCandidate(input.candidate)) {
    return null;
  }

  const repository =
    input.repository ?? createSupplierContactPersistenceRepository();
  const data = buildSupplierContactPersistenceData(input);
  const actor = normalizeActor(input);
  const existing = await repository.findBySourceFingerprint(
    data.sourceFingerprint,
  );

  if (!existing) {
    const created = await repository.createCandidate(data);
    await writeCandidateEvidence(repository, created.id, input.candidate);
    await repository.createEvent({
      supplierContactId: created.id,
      actionType: 'SUPPLIER_CONTACT_CANDIDATE_STAGED',
      previousStatus: null,
      newStatus: 'STAGED',
      actorType: actor.actorType,
      actorIdentifier: actor.actorIdentifier,
      note: input.candidate.reason,
      metadata: {
        confidence: input.candidate.confidence,
        conflictCount: input.candidate.conflicts.length,
        evidenceCount: input.candidate.evidence.length,
      },
    });
    return created;
  }

  if (existing.status !== 'STAGED') {
    return repository.updateCandidate(existing.id, {
      lastSeenAt: data.lastSeenAt,
      extractionMetadata: data.extractionMetadata,
    });
  }

  const updated = await repository.updateCandidate(existing.id, {
    supplierNameCandidate: data.supplierNameCandidate,
    normalizedSupplierName: data.normalizedSupplierName,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    contactPhoneRaw: data.contactPhoneRaw,
    contactPhoneCanonical: data.contactPhoneCanonical,
    contactRole: data.contactRole,
    sourceInboundEmailId: data.sourceInboundEmailId,
    sourceDocumentId: data.sourceDocumentId,
    confidence: data.confidence,
    conflictFlags: data.conflictFlags,
    evidence: data.evidence,
    extractionMetadata: data.extractionMetadata,
    lastSeenAt: data.lastSeenAt,
  });
  await writeCandidateEvidence(repository, updated.id, input.candidate);
  return updated;
}

function sourceDocumentIdForCandidate(
  candidate: SupplierContactExtractionCandidate,
  documents: SupplierContactPersistenceDocument[],
): string | null {
  const evidenceAttachmentIds = new Set(
    candidate.evidence.map((item) => item.attachmentId).filter(Boolean),
  );

  return (
    candidate.evidence.find((item) => item.sourceDocumentId)
      ?.sourceDocumentId ??
    documents.find(
      (document) => document.label && evidenceAttachmentIds.has(document.label),
    )?.id ??
    documents.find((document) =>
      [
        'ATTACHMENT_TABLE',
        'ATTACHMENT_TEXT',
        'BODY_MAIN',
        'BODY_FORWARDED',
      ].includes(document.kind),
    )?.id ??
    null
  );
}

export async function persistSupplierContactCandidatesForInboundEmail(input: {
  inboundEmailId: string;
  message: EmailInboundMessage;
  documents?: SupplierContactPersistenceDocument[];
  classification?: ClassificationDecision | null;
  candidates: SupplierContactExtractionCandidate[];
  now?: Date;
  repository?: SupplierContactPersistenceRepository;
}): Promise<PersistedSupplierContactCandidate[]> {
  const repository =
    input.repository ?? createSupplierContactPersistenceRepository();
  const persisted = await Promise.all(
    input.candidates.map((candidate) =>
      persistSupplierContactCandidate({
        inboundEmailId: input.inboundEmailId,
        sourceDocumentId: sourceDocumentIdForCandidate(
          candidate,
          input.documents ?? [],
        ),
        candidate,
        classification: input.classification,
        actorType: 'SYSTEM',
        actorIdentifier: 'inbound-email-supplier-contact-extractor',
        now: input.now,
        message: input.message,
        repository,
      }),
    ),
  );

  return compact(persisted);
}

export async function listSupplierContactCandidates(
  filters: SupplierContactListFilters = {},
): Promise<PersistedSupplierContactCandidate[]> {
  return createSupplierContactPersistenceRepository().listCandidates(filters);
}

export async function getSupplierContactCandidate(
  id: string,
): Promise<PersistedSupplierContactCandidate | null> {
  return createSupplierContactPersistenceRepository().findById(id);
}

export async function listSupplierContactEvents(
  supplierContactId: string,
): Promise<SupplierContactEventRecord[]> {
  return createSupplierContactPersistenceRepository().listEvents(
    supplierContactId,
  );
}

export async function reviewSupplierContactCandidate(input: {
  id: string;
  action: SupplierContactReviewAction;
  supplierId?: string | null;
  note?: string | null;
  actorType?: string | null;
  actorIdentifier?: string | null;
  now?: Date;
  repository?: SupplierContactPersistenceRepository;
}): Promise<PersistedSupplierContactCandidate> {
  const repository =
    input.repository ?? createSupplierContactPersistenceRepository();
  const existing = await repository.findById(input.id);
  if (!existing) {
    throw new Error('Supplier contact candidate not found.');
  }

  const actor = normalizeActor(input);
  const note = input.note?.trim() || null;
  const supplierId = input.supplierId?.trim() || null;
  const now = input.now ?? new Date();
  const supplier = supplierId
    ? await repository.findSupplierById(supplierId)
    : null;

  if (supplierId && !supplier) {
    throw new Error('Supplier not found.');
  }

  const statusByAction: Partial<
    Record<SupplierContactReviewAction, SupplierContactStatus>
  > = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    SUPERSEDE: 'SUPERSEDED',
  };
  const nextStatus = statusByAction[input.action] ?? existing.status;
  const update: SupplierContactUpdateData = {
    ...(supplierId ? { supplierId } : {}),
    ...(input.action === 'APPROVE' ||
    input.action === 'REJECT' ||
    input.action === 'SUPERSEDE'
      ? {
          status: nextStatus,
          reviewedAt: now,
          reviewedByType: actor.actorType,
          reviewedByIdentifier: actor.actorIdentifier,
          reviewNote: note,
        }
      : input.action === 'ADD_NOTE'
        ? { reviewNote: note }
        : {}),
  };

  const updated = await repository.updateCandidate(existing.id, update);

  // On approval (or an explicit link) write the captured contact details back to
  // the canonical Supplier so operators have correct, up-to-date contact info in
  // place — not just a staged candidate.
  const resolvedSupplierId = supplierId ?? existing.supplierId;
  const contactPhone =
    existing.contactPhoneCanonical ??
    existing.contactPhoneRaw ??
    existing.contactPhone;
  let supplierRecordUpdated = false;
  if (
    (input.action === 'APPROVE' || input.action === 'LINK_SUPPLIER') &&
    resolvedSupplierId &&
    (existing.contactEmail || existing.contactName || contactPhone)
  ) {
    await repository.updateSupplierContactDetails(resolvedSupplierId, {
      contactEmail: existing.contactEmail,
      contactName: existing.contactName,
      contactPhone,
    });
    supplierRecordUpdated = true;
  }

  await repository.createEvent({
    supplierContactId: existing.id,
    actionType:
      input.action === 'LINK_SUPPLIER'
        ? 'SUPPLIER_CONTACT_LINKED_TO_SUPPLIER'
        : input.action === 'ADD_NOTE'
          ? 'SUPPLIER_CONTACT_NOTE_ADDED'
          : `SUPPLIER_CONTACT_${input.action}`,
    previousStatus: existing.status,
    newStatus: nextStatus,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note,
    metadata: {
      supplierId: resolvedSupplierId,
      supplierName: supplier?.name ?? null,
      supplierRecordUpdated,
    },
  });

  return updated;
}
