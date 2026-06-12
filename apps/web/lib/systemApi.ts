import 'server-only';

import { requestInternalJson } from './internalApiRequest';

export type SystemReadinessStatus = 'ready' | 'warning' | 'not_configured';

export type SystemReadinessCheck = {
  key: string;
  title: string;
  status: SystemReadinessStatus;
  meaning: string;
  nextAction: string;
  envVars: string[];
  documentationPath?: string;
  details: Record<string, boolean | number | string | string[] | null>;
};

export type SystemReadinessReport = {
  generatedAt: string;
  status: SystemReadinessStatus;
  checks: SystemReadinessCheck[];
};

export type PollingWorkerStatus = {
  name: 'email-inbound' | 'telegram';
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

const CALLER_NAME = 'web-setup-readiness';

export async function getSystemReadinessReport(): Promise<SystemReadinessReport> {
  const payload = await requestInternalJson<{ item: SystemReadinessReport }>(
    '/system/readiness',
    {
      callerName: CALLER_NAME,
      requiredCapability: 'system:admin',
    },
  );

  return payload.item;
}

export async function getPollingWorkerStatuses(): Promise<
  PollingWorkerStatus[]
> {
  const payload = await requestInternalJson<{ items: PollingWorkerStatus[] }>(
    '/system/workers',
    {
      callerName: CALLER_NAME,
      requiredCapability: 'system:admin',
    },
  );

  return payload.items;
}
