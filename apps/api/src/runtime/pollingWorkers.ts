import { env } from '../config/env';
import {
  createEmailInboundPollingWorker,
  isEmailInboundPollingActive,
} from '../email/polling';
import { logger } from '../lib/logger';
import {
  createTelegramPollingWorker,
  isTelegramPollingActive,
} from '../telegram/polling';

export type PollingWorkerHandle = {
  start: () => void;
  stop: () => void;
};

type PollingWorkerRuntimeConfig = Pick<
  typeof env,
  | 'startWorkersWithApi'
  | 'telegramPollingEnabled'
  | 'telegramBotToken'
  | 'telegramPollingIntervalMs'
  | 'emailInboundPollingEnabled'
  | 'emailInboundPollingIntervalMs'
  | 'microsoftGraphSenderMailbox'
>;

type RuntimeLogger = Pick<typeof logger, 'info' | 'warn'>;

type PollingWorkerRuntimeDependencies = {
  config: PollingWorkerRuntimeConfig;
  createEmailWorker: () => PollingWorkerHandle;
  createTelegramWorker: () => PollingWorkerHandle;
  isEmailActive: () => boolean;
  isTelegramActive: () => boolean;
  logger: RuntimeLogger;
};

export type PollingWorkerRuntime = {
  logConfiguration: (processRole: 'api' | 'worker') => void;
  startConfiguredWorkers: () => string[];
  stop: () => void;
};

function warnForIncompleteConfiguration(
  dependencies: PollingWorkerRuntimeDependencies,
): void {
  if (
    dependencies.config.telegramPollingEnabled &&
    !dependencies.config.telegramBotToken
  ) {
    dependencies.logger.warn(
      'Telegram polling is enabled but TELEGRAM_BOT_TOKEN is missing',
    );
  }

  if (
    dependencies.config.emailInboundPollingEnabled &&
    !dependencies.isEmailActive()
  ) {
    dependencies.logger.warn(
      'Email inbox polling is enabled but Microsoft Graph mail configuration is incomplete',
      {
        mailboxConfigured: Boolean(
          dependencies.config.microsoftGraphSenderMailbox,
        ),
      },
    );
  }
}

export function createPollingWorkerRuntime(
  overrides: Partial<PollingWorkerRuntimeDependencies> = {},
): PollingWorkerRuntime {
  const dependencies: PollingWorkerRuntimeDependencies = {
    config: env,
    createEmailWorker: createEmailInboundPollingWorker,
    createTelegramWorker: createTelegramPollingWorker,
    isEmailActive: isEmailInboundPollingActive,
    isTelegramActive: isTelegramPollingActive,
    logger,
    ...overrides,
  };
  const telegramPollingWorker = dependencies.createTelegramWorker();
  const emailInboundPollingWorker = dependencies.createEmailWorker();

  return {
    logConfiguration(processRole) {
      dependencies.logger.info('Polling worker runtime configuration', {
        processRole,
        startWorkersWithApi: dependencies.config.startWorkersWithApi,
        telegram: {
          enabled: dependencies.config.telegramPollingEnabled,
          active: dependencies.isTelegramActive(),
          tokenConfigured: Boolean(dependencies.config.telegramBotToken),
          intervalMs: dependencies.config.telegramPollingIntervalMs,
        },
        emailInbound: {
          enabled: dependencies.config.emailInboundPollingEnabled,
          active: dependencies.isEmailActive(),
          mailboxConfigured: Boolean(
            dependencies.config.microsoftGraphSenderMailbox,
          ),
          intervalMs: dependencies.config.emailInboundPollingIntervalMs,
        },
      });

      warnForIncompleteConfiguration(dependencies);
    },

    startConfiguredWorkers() {
      const startedWorkers: string[] = [];

      if (dependencies.isTelegramActive()) {
        telegramPollingWorker.start();
        startedWorkers.push('telegram');
      }

      if (dependencies.isEmailActive()) {
        emailInboundPollingWorker.start();
        startedWorkers.push('email-inbound');
      }

      return startedWorkers;
    },

    stop() {
      telegramPollingWorker.stop();
      emailInboundPollingWorker.stop();
    },
  };
}

export function startApiPollingWorkersIfEnabled(
  runtime: PollingWorkerRuntime,
  config: Pick<typeof env, 'startWorkersWithApi'> = env,
  runtimeLogger: RuntimeLogger = logger,
): string[] {
  if (!config.startWorkersWithApi) {
    runtimeLogger.info('Polling workers are disabled in the API process', {
      startWorkersWithApi: false,
      workerProcessExpected: true,
    });
    return [];
  }

  runtimeLogger.warn(
    'Polling workers are starting inside the API process because START_WORKERS_WITH_API is enabled',
  );
  return runtime.startConfiguredWorkers();
}

export async function stopPollingRuntimeAndDisconnect(
  options: {
    disconnect: () => Promise<void>;
    logger: RuntimeLogger;
    processRole: 'api' | 'worker';
    runtime: PollingWorkerRuntime;
    signal: string;
  },
): Promise<void> {
  options.logger.info('Polling worker runtime stopping', {
    processRole: options.processRole,
    signal: options.signal,
  });
  options.runtime.stop();
  await options.disconnect();
}
