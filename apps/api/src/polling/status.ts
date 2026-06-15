import { sanitizeSafeErrorMessage } from '../safety/redaction';

export type PollingWorkerName = 'email-inbound' | 'telegram';

export type PollingWorkerSnapshot = {
  name: PollingWorkerName;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  running: boolean;
  inFlight: boolean;
  intervalMs: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  totalRuns: number;
  totalItemsSeen: number;
  totalItemsProcessed: number;
  totalItemsSkipped: number;
  totalItemsFailed: number;
  duplicateItemsSkipped: number;
};

export type PollingWorkerStatusStore = {
  upsertStatus: (snapshot: PollingWorkerSnapshot) => Promise<void>;
  listStatuses: () => Promise<PollingWorkerSnapshot[]>;
};

type PollingWorkerUpdate = Partial<
  Pick<
    PollingWorkerSnapshot,
    'enabled' | 'configured' | 'active' | 'intervalMs'
  >
>;

type PollingRunResult = {
  itemsSeen?: number;
  itemsProcessed?: number;
  itemsSkipped?: number;
  itemsFailed?: number;
  duplicateItemsSkipped?: number;
};

const WORKER_NAMES: PollingWorkerName[] = ['email-inbound', 'telegram'];

const statuses = new Map<PollingWorkerName, PollingWorkerSnapshot>();
let statusStore: PollingWorkerStatusStore | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

export function sanitizePollingErrorMessage(error: unknown): string {
  return sanitizeSafeErrorMessage(error);
}

function createInitialStatus(name: PollingWorkerName): PollingWorkerSnapshot {
  return {
    name,
    enabled: false,
    configured: false,
    active: false,
    running: false,
    inFlight: false,
    intervalMs: null,
    startedAt: null,
    stoppedAt: null,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorAt: null,
    lastError: null,
    consecutiveFailures: 0,
    totalRuns: 0,
    totalItemsSeen: 0,
    totalItemsProcessed: 0,
    totalItemsSkipped: 0,
    totalItemsFailed: 0,
    duplicateItemsSkipped: 0,
  };
}

function getMutableStatus(name: PollingWorkerName): PollingWorkerSnapshot {
  const existing = statuses.get(name);
  if (existing) {
    return existing;
  }

  const created = createInitialStatus(name);
  statuses.set(name, created);
  return created;
}

function snapshotStatus(status: PollingWorkerSnapshot): PollingWorkerSnapshot {
  return { ...status };
}

function persistStatus(snapshot: PollingWorkerSnapshot): void {
  if (!statusStore) {
    return;
  }

  void statusStore.upsertStatus(snapshot).catch(() => {
    // Worker status must never make polling fail. Operational logs still carry
    // the live failure, and the next status update can repair the durable row.
  });
}

function snapshotAndPersist(
  status: PollingWorkerSnapshot,
): PollingWorkerSnapshot {
  const snapshot = snapshotStatus(status);
  persistStatus(snapshot);
  return snapshot;
}

function pickLatestTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function mergePersistedStatus(
  memoryStatus: PollingWorkerSnapshot,
  persistedStatus: PollingWorkerSnapshot | undefined,
): PollingWorkerSnapshot {
  if (!persistedStatus) {
    return snapshotStatus(memoryStatus);
  }

  // The process that actually runs the poller owns its runtime truth. In a
  // split deployment the API process never starts the email poller, so its
  // in-memory snapshot is the initial all-false/zero default and must NOT
  // clobber the persisted row the worker wrote. We therefore take the
  // process/runtime fields (enabled, configured, active, running, inFlight,
  // consecutiveFailures) straight from the persisted row, pick the freshest
  // timestamp for each lifecycle moment, and take the max of the monotonic
  // counters so neither a stale reader nor a stale row loses progress.
  // lastError keeps its existing precedence: a live in-process error wins,
  // otherwise the persisted one. Every value is sanitized at its source.
  return {
    ...persistedStatus,
    intervalMs: persistedStatus.intervalMs ?? memoryStatus.intervalMs,
    startedAt: pickLatestTimestamp(
      memoryStatus.startedAt,
      persistedStatus.startedAt,
    ),
    stoppedAt: pickLatestTimestamp(
      memoryStatus.stoppedAt,
      persistedStatus.stoppedAt,
    ),
    lastRunStartedAt: pickLatestTimestamp(
      memoryStatus.lastRunStartedAt,
      persistedStatus.lastRunStartedAt,
    ),
    lastRunFinishedAt: pickLatestTimestamp(
      memoryStatus.lastRunFinishedAt,
      persistedStatus.lastRunFinishedAt,
    ),
    lastSuccessAt: pickLatestTimestamp(
      memoryStatus.lastSuccessAt,
      persistedStatus.lastSuccessAt,
    ),
    lastFailureAt: pickLatestTimestamp(
      memoryStatus.lastFailureAt,
      persistedStatus.lastFailureAt,
    ),
    lastErrorAt: pickLatestTimestamp(
      memoryStatus.lastErrorAt,
      persistedStatus.lastErrorAt,
    ),
    lastError: memoryStatus.lastError ?? persistedStatus.lastError,
    totalRuns: Math.max(memoryStatus.totalRuns, persistedStatus.totalRuns),
    totalItemsSeen: Math.max(
      memoryStatus.totalItemsSeen,
      persistedStatus.totalItemsSeen,
    ),
    totalItemsProcessed: Math.max(
      memoryStatus.totalItemsProcessed,
      persistedStatus.totalItemsProcessed,
    ),
    totalItemsSkipped: Math.max(
      memoryStatus.totalItemsSkipped,
      persistedStatus.totalItemsSkipped,
    ),
    totalItemsFailed: Math.max(
      memoryStatus.totalItemsFailed,
      persistedStatus.totalItemsFailed,
    ),
    duplicateItemsSkipped: Math.max(
      memoryStatus.duplicateItemsSkipped,
      persistedStatus.duplicateItemsSkipped,
    ),
  };
}

export function configurePollingWorkerStatusStore(
  store: PollingWorkerStatusStore | null,
): void {
  statusStore = store;
}

export function configurePollingWorkerStatus(
  name: PollingWorkerName,
  update: PollingWorkerUpdate,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  Object.assign(status, update);
  return snapshotAndPersist(status);
}

export function markPollingWorkerStarted(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.running = true;
  status.startedAt = nowIso();
  status.stoppedAt = null;
  return snapshotAndPersist(status);
}

export function markPollingWorkerStopped(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.running = false;
  status.inFlight = false;
  status.stoppedAt = nowIso();
  return snapshotAndPersist(status);
}

export function markPollingRunStarted(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.inFlight = true;
  status.lastRunStartedAt = nowIso();
  return snapshotAndPersist(status);
}

export function markPollingRunFinished(
  name: PollingWorkerName,
  result: PollingRunResult = {},
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.inFlight = false;
  status.lastRunFinishedAt = nowIso();
  status.totalRuns += 1;
  status.totalItemsSeen += result.itemsSeen ?? 0;
  status.totalItemsProcessed += result.itemsProcessed ?? 0;
  status.totalItemsSkipped += result.itemsSkipped ?? 0;
  status.totalItemsFailed += result.itemsFailed ?? 0;
  status.duplicateItemsSkipped += result.duplicateItemsSkipped ?? 0;

  if ((result.itemsFailed ?? 0) > 0) {
    status.consecutiveFailures += 1;
    status.lastFailureAt = status.lastRunFinishedAt;
  } else {
    status.consecutiveFailures = 0;
    status.lastSuccessAt = status.lastRunFinishedAt;
  }

  return snapshotAndPersist(status);
}

export function recordPollingWorkerError(
  name: PollingWorkerName,
  error: unknown,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.lastErrorAt = nowIso();
  status.lastError = sanitizePollingErrorMessage(error);
  return snapshotAndPersist(status);
}

export function getPollingWorkerStatus(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  return snapshotStatus(getMutableStatus(name));
}

export function listPollingWorkerStatuses(): PollingWorkerSnapshot[] {
  return WORKER_NAMES.map(getPollingWorkerStatus);
}

export async function listPollingWorkerStatusesWithStore(): Promise<
  PollingWorkerSnapshot[]
> {
  if (!statusStore) {
    return listPollingWorkerStatuses();
  }

  try {
    const persistedStatuses = await statusStore.listStatuses();
    const persistedByName = new Map(
      persistedStatuses.map((status) => [status.name, status]),
    );

    return WORKER_NAMES.map((name) =>
      mergePersistedStatus(getMutableStatus(name), persistedByName.get(name)),
    );
  } catch {
    return listPollingWorkerStatuses();
  }
}

export function resetPollingWorkerStatusesForTests(): void {
  statuses.clear();
  statusStore = null;
}
