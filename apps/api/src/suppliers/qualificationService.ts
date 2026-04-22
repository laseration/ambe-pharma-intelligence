import { db } from '../lib/db';

export type SupplierQualificationStatus =
  | 'UNKNOWN'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'RESTRICTED'
  | 'BLOCKED';

export type SupplierTrustTier = 'HIGH' | 'MEDIUM' | 'LOW';

export type SupplierQualificationActionType =
  | 'CREATED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'RESTRICTED'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'NOTE_ADDED';

export type SupplierQualificationActor = {
  actorType?: string | null;
  actorIdentifier?: string | null;
};

export type SupplierQualificationRecord = {
  id: string;
  supplierId: string;
  qualificationStatus: SupplierQualificationStatus;
  trustTier: SupplierTrustTier;
  qualificationNote: string | null;
  lastReviewedAt: Date | null;
  reviewedByType: string | null;
  reviewedByIdentifier: string | null;
  expiresAt: Date | null;
  requiresManualApproval: boolean;
  canAutoApproveBuyDecisions: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  supplier?: {
    id: string;
    name: string;
    normalizedName: string;
  } | null;
};

export type SupplierQualificationEventRecord = {
  id: string;
  supplierQualificationId: string;
  actionType: SupplierQualificationActionType;
  previousStatus: SupplierQualificationStatus | null;
  newStatus: SupplierQualificationStatus | null;
  actorType: string;
  actorIdentifier: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type UpsertSupplierQualificationInput = SupplierQualificationActor & {
  supplierId: string;
  qualificationStatus?: SupplierQualificationStatus;
  trustTier?: SupplierTrustTier;
  qualificationNote?: string | null;
  expiresAt?: Date | null;
  requiresManualApproval?: boolean;
  canAutoApproveBuyDecisions?: boolean;
  metadata?: unknown;
};

export type SupplierQualificationListFilters = {
  qualificationStatus?: SupplierQualificationStatus | null;
  trustTier?: SupplierTrustTier | null;
  requiresManualApproval?: boolean;
  take?: number;
};

export type SupplierQualificationRepository = {
  findBySupplierId: (supplierId: string) => Promise<SupplierQualificationRecord | null>;
  create: (data: Partial<SupplierQualificationRecord> & Pick<SupplierQualificationRecord, 'supplierId' | 'qualificationStatus' | 'trustTier' | 'requiresManualApproval' | 'canAutoApproveBuyDecisions'>) => Promise<SupplierQualificationRecord>;
  update: (supplierQualificationId: string, data: Partial<SupplierQualificationRecord>) => Promise<SupplierQualificationRecord>;
  createEvent: (data: Omit<SupplierQualificationEventRecord, 'id' | 'createdAt'>) => Promise<SupplierQualificationEventRecord>;
  list: (filters: SupplierQualificationListFilters) => Promise<SupplierQualificationRecord[]>;
  listEvents: (supplierQualificationId: string) => Promise<SupplierQualificationEventRecord[]>;
};

function normalizeActor(actor?: SupplierQualificationActor): { actorType: string; actorIdentifier: string | null } {
  return {
    actorType: actor?.actorType?.trim() || 'SYSTEM',
    actorIdentifier: actor?.actorIdentifier?.trim() || null,
  };
}

function buildDefaultQualification(
  supplierId: string | null,
): SupplierQualificationRecord | null {
  if (!supplierId) {
    return null;
  }

  return {
    id: `unknown-${supplierId}`,
    supplierId,
    qualificationStatus: 'UNKNOWN',
    trustTier: 'LOW',
    qualificationNote: null,
    lastReviewedAt: null,
    reviewedByType: null,
    reviewedByIdentifier: null,
    expiresAt: null,
    requiresManualApproval: true,
    canAutoApproveBuyDecisions: false,
    metadata: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    supplier: null,
  };
}

export function createSupplierQualificationRepository(client: typeof db = db): SupplierQualificationRepository {
  return {
    findBySupplierId: async (supplierId) =>
      client.supplierQualification.findUnique({
        where: { supplierId },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              normalizedName: true,
            },
          },
        },
      }) as Promise<SupplierQualificationRecord | null>,
    create: async (data) =>
      client.supplierQualification.create({
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              normalizedName: true,
            },
          },
        },
      }) as Promise<SupplierQualificationRecord>,
    update: async (supplierQualificationId, data) =>
      client.supplierQualification.update({
        where: { id: supplierQualificationId },
        data: data as never,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              normalizedName: true,
            },
          },
        },
      }) as Promise<SupplierQualificationRecord>,
    createEvent: async (data) =>
      client.supplierQualificationEvent.create({
        data: data as never,
      }) as Promise<SupplierQualificationEventRecord>,
    list: async (filters) => {
      const where: Record<string, unknown> = {};

      if (filters.qualificationStatus) {
        where.qualificationStatus = filters.qualificationStatus;
      }
      if (filters.trustTier) {
        where.trustTier = filters.trustTier;
      }
      if (typeof filters.requiresManualApproval === 'boolean') {
        where.requiresManualApproval = filters.requiresManualApproval;
      }

      return (await client.supplierQualification.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              normalizedName: true,
            },
          },
        },
        orderBy: [{ qualificationStatus: 'asc' }, { updatedAt: 'desc' }] as never,
        take: filters.take ?? 100,
      })) as SupplierQualificationRecord[];
    },
    listEvents: async (supplierQualificationId) =>
      (await client.supplierQualificationEvent.findMany({
        where: { supplierQualificationId },
        orderBy: { createdAt: 'asc' },
      })) as SupplierQualificationEventRecord[],
  };
}

async function logQualificationEvent(
  repository: SupplierQualificationRepository,
  supplierQualificationId: string,
  actionType: SupplierQualificationActionType,
  previousStatus: SupplierQualificationStatus | null,
  newStatus: SupplierQualificationStatus | null,
  actor: { actorType: string; actorIdentifier: string | null },
  note?: string | null,
  metadata?: unknown,
): Promise<void> {
  await repository.createEvent({
    supplierQualificationId,
    actionType,
    previousStatus,
    newStatus,
    actorType: actor.actorType,
    actorIdentifier: actor.actorIdentifier,
    note: note?.trim() || null,
    metadata: metadata ?? null,
  });
}

export function createSupplierQualificationService(overrides?: Partial<SupplierQualificationRepository>) {
  const repository: SupplierQualificationRepository = {
    ...createSupplierQualificationRepository(),
    ...overrides,
  };

  return {
    async getQualificationForSupplier(supplierId: string | null): Promise<SupplierQualificationRecord | null> {
      if (!supplierId) {
        return null;
      }

      return (await repository.findBySupplierId(supplierId)) ?? buildDefaultQualification(supplierId);
    },

    async listQualifications(
      filters: SupplierQualificationListFilters = {},
    ): Promise<SupplierQualificationRecord[]> {
      return repository.list(filters);
    },

    async listQualificationEvents(supplierQualificationId: string): Promise<SupplierQualificationEventRecord[]> {
      return repository.listEvents(supplierQualificationId);
    },

    async upsertQualification(input: UpsertSupplierQualificationInput): Promise<SupplierQualificationRecord> {
      const actor = normalizeActor(input);
      const existing = await repository.findBySupplierId(input.supplierId);

      if (!existing) {
        const created = await repository.create({
          supplierId: input.supplierId,
          qualificationStatus: input.qualificationStatus ?? 'PENDING_REVIEW',
          trustTier: input.trustTier ?? 'LOW',
          qualificationNote: input.qualificationNote?.trim() || null,
          lastReviewedAt: new Date(),
          reviewedByType: actor.actorType,
          reviewedByIdentifier: actor.actorIdentifier,
          expiresAt: input.expiresAt ?? null,
          requiresManualApproval: input.requiresManualApproval ?? true,
          canAutoApproveBuyDecisions: input.canAutoApproveBuyDecisions ?? false,
          metadata: input.metadata ?? null,
        });

        await logQualificationEvent(
          repository,
          created.id,
          'CREATED',
          null,
          created.qualificationStatus,
          actor,
          created.qualificationNote,
        );

        return created;
      }

      const nextStatus = input.qualificationStatus ?? existing.qualificationStatus;
      const updated = await repository.update(existing.id, {
        qualificationStatus: nextStatus,
        trustTier: input.trustTier ?? existing.trustTier,
        qualificationNote:
          input.qualificationNote === undefined
            ? existing.qualificationNote
            : input.qualificationNote?.trim() || null,
        lastReviewedAt: new Date(),
        reviewedByType: actor.actorType,
        reviewedByIdentifier: actor.actorIdentifier,
        expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
        requiresManualApproval:
          typeof input.requiresManualApproval === 'boolean'
            ? input.requiresManualApproval
            : existing.requiresManualApproval,
        canAutoApproveBuyDecisions:
          typeof input.canAutoApproveBuyDecisions === 'boolean'
            ? input.canAutoApproveBuyDecisions
            : existing.canAutoApproveBuyDecisions,
        metadata: input.metadata === undefined ? existing.metadata : input.metadata,
      });

      const actionType: SupplierQualificationActionType =
        nextStatus === 'APPROVED'
          ? 'APPROVED'
          : nextStatus === 'RESTRICTED'
            ? 'RESTRICTED'
            : nextStatus === 'BLOCKED'
              ? 'BLOCKED'
              : 'REVIEWED';

      await logQualificationEvent(
        repository,
        existing.id,
        actionType,
        existing.qualificationStatus,
        updated.qualificationStatus,
        actor,
        updated.qualificationNote,
      );

      return updated;
    },

    async addQualificationNote(
      input: SupplierQualificationActor & { supplierId: string; note: string },
    ): Promise<SupplierQualificationRecord> {
      const existing = await repository.findBySupplierId(input.supplierId);
      if (!existing) {
        throw new Error('Supplier qualification record not found.');
      }

      const actor = normalizeActor(input);
      const updated = await repository.update(existing.id, {
        qualificationNote: input.note.trim(),
        lastReviewedAt: new Date(),
        reviewedByType: actor.actorType,
        reviewedByIdentifier: actor.actorIdentifier,
      });

      await logQualificationEvent(
        repository,
        existing.id,
        'NOTE_ADDED',
        existing.qualificationStatus,
        existing.qualificationStatus,
        actor,
        input.note,
      );

      return updated;
    },
  };
}

export const supplierQualificationService = createSupplierQualificationService();
