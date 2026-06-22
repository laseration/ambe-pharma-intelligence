import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { loadActiveOrganizationConfig } from '../organization/activeOrganizationConfig';
import { configurePollingWorkerStatusStore } from '../polling/status';
import { createAppSettingPollingWorkerStatusStore } from '../polling/statusStore';
import { verifyDatabaseReadiness } from '../startup/databaseHealth';
import {
  createPollingWorkerRuntime,
  stopPollingRuntimeAndDisconnect,
  type PollingWorkerRuntime,
} from './pollingWorkers';

/**
 * Holds the Node event loop open while the worker is idle. `stop()` releases it
 * so the process can shut down cleanly.
 */
export type WorkerIdleKeepAlive = { stop: () => void };

export type WorkerProcessDependencies = {
  config: Pick<
    typeof env,
    | 'databaseUrl'
    | 'databaseHost'
    | 'nodeEnv'
    | 'logLevel'
    | 'telegramPollingEnabled'
    | 'emailInboundPollingEnabled'
  >;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  verifyReadiness: () => Promise<void>;
  configureStatusStore: () => void;
  createRuntime: () => PollingWorkerRuntime;
  startIdleKeepAlive: () => WorkerIdleKeepAlive;
  logger: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

export type WorkerProcessHandle = {
  /** Names of pollers that were started (empty when all polling is disabled). */
  startedWorkers: string[];
  /** True when no pollers are active and the process is held alive in idle mode. */
  idle: boolean;
  /** Stops the idle keepalive (if any), stops the runtime, then disconnects. */
  shutdown: (signal: string) => Promise<void>;
};

/** Interval for the no-op idle keepalive. The callback does nothing; the timer
 * only exists to keep the event loop alive. */
export const IDLE_KEEPALIVE_INTERVAL_MS = 60_000;

export function startDefaultIdleKeepAlive(
  intervalMs: number = IDLE_KEEPALIVE_INTERVAL_MS,
): WorkerIdleKeepAlive {
  // A bare interval keeps the event loop open without doing any work, so a
  // worker with no active pollers stays online instead of exiting cleanly and
  // being treated by PM2 as a crash/restart loop. It is deliberately NOT
  // unref'd (unref would let the process exit), starts no poller, makes no
  // Graph calls, and is cleared on shutdown.
  const timer = setInterval(() => {}, intervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

/**
 * Boots the polling worker process: connects to the database, verifies
 * readiness, and starts whichever pollers are active. When no poller is active
 * (e.g. email polling disabled), the process stays online in a safe idle state
 * instead of exiting — it starts no polling loop, makes no Graph calls, and
 * marks no emails read. Real startup/config failures reject so the caller can
 * exit non-zero.
 */
export async function startWorkerProcess(
  overrides: Partial<WorkerProcessDependencies> = {},
): Promise<WorkerProcessHandle> {
  const dependencies: WorkerProcessDependencies = {
    config: env,
    connect: () => db.$connect(),
    disconnect: () => db.$disconnect(),
    verifyReadiness: () => verifyDatabaseReadiness(),
    configureStatusStore: () =>
      configurePollingWorkerStatusStore(
        createAppSettingPollingWorkerStatusStore(db),
      ),
    createRuntime: createPollingWorkerRuntime,
    startIdleKeepAlive: startDefaultIdleKeepAlive,
    logger,
    ...overrides,
  };

  if (!dependencies.config.databaseUrl) {
    throw new Error(
      'Polling worker process requires DATABASE_URL. Set it in apps/api/.env (the worker also checks the repo root .env).',
    );
  }

  await dependencies.connect();
  await dependencies.verifyReadiness();
  try {
    const activeOrganization = await loadActiveOrganizationConfig();
    dependencies.logger.info('Active organisation config loaded', {
      organizationId: activeOrganization?.organizationId ?? null,
      seeded: Boolean(activeOrganization),
    });
  } catch (error: unknown) {
    dependencies.logger.warn(
      'Active organisation config not loaded; using environment fallback',
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
  }
  dependencies.configureStatusStore();

  const runtime = dependencies.createRuntime();

  dependencies.logger.info('Polling worker process started', {
    databaseHost: dependencies.config.databaseHost,
    nodeEnv: dependencies.config.nodeEnv,
    logLevel: dependencies.config.logLevel,
  });
  runtime.logConfiguration('worker');

  const startedWorkers = runtime.startConfiguredWorkers();
  const idle = startedWorkers.length === 0;
  let keepAlive: WorkerIdleKeepAlive | null = null;

  if (idle) {
    dependencies.logger.info(
      'Polling worker process has no active pollers; staying alive in idle mode (polling disabled — no polling loop, no Graph calls, no emails marked read)',
      {
        telegramPollingEnabled: dependencies.config.telegramPollingEnabled,
        emailInboundPollingEnabled:
          dependencies.config.emailInboundPollingEnabled,
      },
    );
    keepAlive = dependencies.startIdleKeepAlive();
  }

  return {
    startedWorkers,
    idle,
    async shutdown(signal: string) {
      keepAlive?.stop();
      await stopPollingRuntimeAndDisconnect({
        disconnect: dependencies.disconnect,
        logger: dependencies.logger,
        processRole: 'worker',
        runtime,
        signal,
      });
    },
  };
}
