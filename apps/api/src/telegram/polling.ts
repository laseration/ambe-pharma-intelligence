import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  configurePollingWorkerStatus,
  markPollingRunFinished,
  markPollingRunStarted,
  markPollingWorkerStarted,
  markPollingWorkerStopped,
  recordPollingWorkerError,
  sanitizePollingErrorMessage,
} from '../polling/status';
import { handleTelegramUpdate } from './inbound/service';
import type { TelegramUpdate } from './inbound/types';

type TelegramGetUpdatesResponse = {
  ok?: boolean;
  description?: string;
  result?: TelegramUpdate[];
};

type TelegramPollingDependencies = {
  fetchUpdates: (offset?: number) => Promise<TelegramUpdate[]>;
  handleTelegramUpdate: typeof handleTelegramUpdate;
  logger: Pick<typeof logger, 'error' | 'info'>;
};

export class TelegramPollingState {
  private nextUpdateId: number | null = null;

  getOffset(): number | undefined {
    return this.nextUpdateId ?? undefined;
  }

  markProcessed(update: TelegramUpdate): void {
    if (typeof update.update_id !== 'number') {
      return;
    }

    this.nextUpdateId = Math.max(this.nextUpdateId ?? 0, update.update_id + 1);
  }
}

export function isTelegramPollingActive(): boolean {
  return env.telegramPollingEnabled && Boolean(env.telegramBotToken);
}

async function fetchUpdates(offset?: number): Promise<TelegramUpdate[]> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.telegramBotToken}/getUpdates`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(typeof offset === 'number' ? { offset } : {}),
        timeout: 0,
        allowed_updates: ['message'],
      }),
    },
  );

  const payload = (await response.json()) as TelegramGetUpdatesResponse;

  if (!response.ok || !payload.ok || !Array.isArray(payload.result)) {
    throw new Error(
      payload.description || 'Telegram getUpdates request failed.',
    );
  }

  return payload.result;
}

export function createTelegramPollingWorker(
  overrides?: Partial<TelegramPollingDependencies>,
) {
  const state = new TelegramPollingState();
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let inFlight = false;
  const dependencies: TelegramPollingDependencies = {
    fetchUpdates,
    handleTelegramUpdate,
    logger,
    ...overrides,
  };
  configurePollingWorkerStatus('telegram', {
    enabled: env.telegramPollingEnabled,
    configured: Boolean(env.telegramBotToken),
    active: isTelegramPollingActive(),
    intervalMs: env.telegramPollingIntervalMs,
  });

  async function pollOnce(scheduleNext = true) {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    markPollingRunStarted('telegram');
    let itemsSeen = 0;
    let itemsProcessed = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;

    try {
      const updates = await dependencies.fetchUpdates(state.getOffset());
      itemsSeen = updates.length;

      for (const update of updates) {
        try {
          dependencies.logger.info('Telegram polling received update', {
            updateId: update.update_id ?? null,
          });

          const result = await dependencies.handleTelegramUpdate(update);
          state.markProcessed(update);

          if (result.ignored) {
            itemsSkipped += 1;
          } else {
            itemsProcessed += 1;
          }

          dependencies.logger.info('Telegram polling handled update', {
            updateId: update.update_id ?? null,
            ignored: result.ignored,
            processingStatus:
              'processingStatus' in result
                ? (result.processingStatus ?? null)
                : null,
          });
        } catch (error) {
          itemsFailed += 1;
          recordPollingWorkerError('telegram', error);
          state.markProcessed(update);

          dependencies.logger.error(
            'Telegram polling failed for one update and continued',
            {
              error:
                error instanceof Error
                  ? sanitizePollingErrorMessage(error)
                  : 'Unknown Telegram polling update error.',
              updateId: update.update_id ?? null,
              offsetAdvancedAfterFailure: true,
            },
          );
        }
      }
    } catch (error) {
      itemsFailed = Math.max(itemsFailed, 1);
      recordPollingWorkerError('telegram', error);
      dependencies.logger.error('Telegram polling failed', {
        error:
          error instanceof Error
            ? sanitizePollingErrorMessage(error)
            : 'Unknown Telegram polling error.',
      });
    } finally {
      inFlight = false;
      markPollingRunFinished('telegram', {
        itemsSeen,
        itemsProcessed,
        itemsSkipped,
        itemsFailed,
      });

      if (scheduleNext && !stopped) {
        timer = setTimeout(() => {
          void pollOnce();
        }, env.telegramPollingIntervalMs);
      }
    }
  }

  return {
    start() {
      if (stopped === false && timer) {
        return;
      }

      stopped = false;
      configurePollingWorkerStatus('telegram', {
        enabled: env.telegramPollingEnabled,
        configured: Boolean(env.telegramBotToken),
        active: isTelegramPollingActive(),
        intervalMs: env.telegramPollingIntervalMs,
      });
      markPollingWorkerStarted('telegram');

      dependencies.logger.info('Telegram polling started', {
        intervalMs: env.telegramPollingIntervalMs,
      });

      void pollOnce();
    },
    runOnce() {
      return pollOnce(false);
    },
    stop() {
      stopped = true;
      markPollingWorkerStopped('telegram');

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
