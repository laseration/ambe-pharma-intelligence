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

function nowIso(): string {
  return new Date().toISOString();
}

export function sanitizePollingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /\b(token|secret|password|api[_-]?key|authorization)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
      '$1=[redacted]',
    )
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[redacted]')
    .replace(/bot[A-Za-z0-9:_-]{20,}/g, 'bot[redacted]');

  return redacted.trim().slice(0, 500) || 'Unknown polling worker error.';
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

export function configurePollingWorkerStatus(
  name: PollingWorkerName,
  update: PollingWorkerUpdate,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  Object.assign(status, update);
  return { ...status };
}

export function markPollingWorkerStarted(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.running = true;
  status.startedAt = nowIso();
  status.stoppedAt = null;
  return { ...status };
}

export function markPollingWorkerStopped(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.running = false;
  status.inFlight = false;
  status.stoppedAt = nowIso();
  return { ...status };
}

export function markPollingRunStarted(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.inFlight = true;
  status.lastRunStartedAt = nowIso();
  return { ...status };
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
  } else {
    status.consecutiveFailures = 0;
    status.lastSuccessAt = status.lastRunFinishedAt;
  }

  return { ...status };
}

export function recordPollingWorkerError(
  name: PollingWorkerName,
  error: unknown,
): PollingWorkerSnapshot {
  const status = getMutableStatus(name);
  status.lastErrorAt = nowIso();
  status.lastError = sanitizePollingErrorMessage(error);
  return { ...status };
}

export function getPollingWorkerStatus(
  name: PollingWorkerName,
): PollingWorkerSnapshot {
  return { ...getMutableStatus(name) };
}

export function listPollingWorkerStatuses(): PollingWorkerSnapshot[] {
  return WORKER_NAMES.map(getPollingWorkerStatus);
}

export function resetPollingWorkerStatusesForTests(): void {
  statuses.clear();
}
