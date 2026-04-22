import { env } from '../config/env';
import { logger } from '../lib/logger';
import { handleTelegramUpdate } from './inbound/service';
import type { TelegramUpdate } from './inbound/types';

type TelegramGetUpdatesResponse = {
  ok?: boolean;
  description?: string;
  result?: TelegramUpdate[];
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
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getUpdates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(typeof offset === 'number' ? { offset } : {}),
      timeout: 0,
      allowed_updates: ['message'],
    }),
  });

  const payload = (await response.json()) as TelegramGetUpdatesResponse;

  if (!response.ok || !payload.ok || !Array.isArray(payload.result)) {
    throw new Error(payload.description || 'Telegram getUpdates request failed.');
  }

  return payload.result;
}

export function createTelegramPollingWorker() {
  const state = new TelegramPollingState();
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let inFlight = false;

  async function pollOnce() {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;

    try {
      const updates = await fetchUpdates(state.getOffset());

      for (const update of updates) {
        logger.info('Telegram polling received update', {
          updateId: update.update_id ?? null,
        });

        const result = await handleTelegramUpdate(update);
        state.markProcessed(update);

        logger.info('Telegram polling handled update', {
          updateId: update.update_id ?? null,
          ignored: result.ignored,
          processingStatus:
            'processingStatus' in result ? result.processingStatus ?? null : null,
        });
      }
    } catch (error) {
      logger.error('Telegram polling failed', {
        error: error instanceof Error ? error.message : 'Unknown Telegram polling error.',
      });
    } finally {
      inFlight = false;

      if (!stopped) {
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

      logger.info('Telegram polling started', {
        intervalMs: env.telegramPollingIntervalMs,
      });

      void pollOnce();
    },
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
