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

const CALLER_NAME = 'web-setup-readiness';

export async function getSystemReadinessReport(): Promise<SystemReadinessReport> {
  const payload = await requestInternalJson<{ item: SystemReadinessReport }>(
    '/system/readiness',
    {
      callerName: CALLER_NAME,
    },
  );

  return payload.item;
}
