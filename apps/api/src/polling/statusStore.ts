import { SettingType, type PrismaClient } from '@prisma/client';

import type {
  PollingWorkerName,
  PollingWorkerSnapshot,
  PollingWorkerStatusStore,
} from './status';

const WORKER_NAMES: PollingWorkerName[] = ['email-inbound', 'telegram'];
const SETTING_KEY_PREFIX = 'polling.workerStatus.';

function settingKey(name: PollingWorkerName): string {
  return `${SETTING_KEY_PREFIX}${name}`;
}

function isWorkerName(value: unknown): value is PollingWorkerName {
  return value === 'email-inbound' || value === 'telegram';
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function coercePollingWorkerSnapshot(
  value: unknown,
): PollingWorkerSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  if (!isWorkerName(raw.name)) {
    return null;
  }

  return {
    name: raw.name,
    enabled: asBoolean(raw.enabled),
    configured: asBoolean(raw.configured),
    active: asBoolean(raw.active),
    running: asBoolean(raw.running),
    inFlight: asBoolean(raw.inFlight),
    intervalMs: asNullableNumber(raw.intervalMs),
    startedAt: asNullableString(raw.startedAt),
    stoppedAt: asNullableString(raw.stoppedAt),
    lastRunStartedAt: asNullableString(raw.lastRunStartedAt),
    lastRunFinishedAt: asNullableString(raw.lastRunFinishedAt),
    lastSuccessAt: asNullableString(raw.lastSuccessAt),
    lastFailureAt: asNullableString(raw.lastFailureAt),
    lastErrorAt: asNullableString(raw.lastErrorAt),
    lastError: asNullableString(raw.lastError),
    consecutiveFailures: asNumber(raw.consecutiveFailures),
    totalRuns: asNumber(raw.totalRuns),
    totalItemsSeen: asNumber(raw.totalItemsSeen),
    totalItemsProcessed: asNumber(raw.totalItemsProcessed),
    totalItemsSkipped: asNumber(raw.totalItemsSkipped),
    totalItemsFailed: asNumber(raw.totalItemsFailed),
    duplicateItemsSkipped: asNumber(raw.duplicateItemsSkipped),
  };
}

function parseSnapshot(value: string): PollingWorkerSnapshot | null {
  try {
    return coercePollingWorkerSnapshot(JSON.parse(value));
  } catch {
    return null;
  }
}

export function createAppSettingPollingWorkerStatusStore(
  prisma: PrismaClient,
): PollingWorkerStatusStore {
  return {
    async upsertStatus(snapshot) {
      await prisma.appSetting.upsert({
        where: {
          key: settingKey(snapshot.name),
        },
        update: {
          value: JSON.stringify(snapshot),
          type: SettingType.JSON,
          description:
            'Safe runtime status snapshot for an ingestion polling worker.',
        },
        create: {
          key: settingKey(snapshot.name),
          value: JSON.stringify(snapshot),
          type: SettingType.JSON,
          description:
            'Safe runtime status snapshot for an ingestion polling worker.',
        },
      });
    },
    async listStatuses() {
      const settings = await prisma.appSetting.findMany({
        where: {
          key: {
            in: WORKER_NAMES.map(settingKey),
          },
        },
        select: {
          value: true,
        },
      });

      return settings
        .map((setting) => parseSnapshot(setting.value))
        .filter(
          (snapshot): snapshot is PollingWorkerSnapshot => snapshot !== null,
        );
    },
  };
}
