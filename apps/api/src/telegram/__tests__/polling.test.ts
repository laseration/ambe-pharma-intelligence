import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPollingWorkerStatus,
  resetPollingWorkerStatusesForTests,
} from '../../polling/status';
import { createTelegramPollingWorker, TelegramPollingState } from '../polling';

function createLogger() {
  return {
    errorCalls: [] as Array<{
      message: string;
      meta?: Record<string, unknown>;
    }>,
    infoCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    error(message: string, meta?: Record<string, unknown>) {
      this.errorCalls.push({ message, meta });
    },
    info(message: string, meta?: Record<string, unknown>) {
      this.infoCalls.push({ message, meta });
    },
  };
}

test('telegram polling state advances offset after processed updates', () => {
  const state = new TelegramPollingState();

  assert.equal(state.getOffset(), undefined);

  state.markProcessed({ update_id: 101 });
  assert.equal(state.getOffset(), 102);

  state.markProcessed({ update_id: 100 });
  assert.equal(state.getOffset(), 102);

  state.markProcessed({ update_id: 104 });
  assert.equal(state.getOffset(), 105);
});

test('telegram polling continues after one failed update and records safe status', async () => {
  resetPollingWorkerStatusesForTests();
  const logger = createLogger();
  const handledUpdateIds: number[] = [];
  const offsets: Array<number | undefined> = [];

  const worker = createTelegramPollingWorker({
    fetchUpdates: async (offset) => {
      offsets.push(offset);
      return [
        {
          update_id: 201,
          message: { message_id: 1, chat: { id: 10, type: 'private' } },
        },
        {
          update_id: 202,
          message: { message_id: 2, chat: { id: 10, type: 'private' } },
        },
      ];
    },
    handleTelegramUpdate: async (update) => {
      if (typeof update.update_id === 'number') {
        handledUpdateIds.push(update.update_id);
      }
      if (update.update_id === 201) {
        throw new Error('handler failed');
      }

      return {
        ignored: false,
        inboundId: 'telegram-inbound-1',
        processingStatus: 'NEEDS_REVIEW',
      };
    },
    logger,
  });

  await worker.runOnce();

  assert.deepEqual(offsets, [undefined]);
  assert.deepEqual(handledUpdateIds, [201, 202]);
  assert.equal(logger.errorCalls.length, 1);
  assert.equal(
    logger.errorCalls[0]?.message,
    'Telegram polling failed for one update and continued',
  );
  assert.deepEqual(logger.errorCalls[0]?.meta, {
    error: 'handler failed',
    updateId: 201,
    offsetAdvancedAfterFailure: true,
  });

  const status = getPollingWorkerStatus('telegram');
  assert.equal(status.totalRuns, 1);
  assert.equal(status.totalItemsSeen, 2);
  assert.equal(status.totalItemsProcessed, 1);
  assert.equal(status.totalItemsFailed, 1);
  assert.equal(status.lastError, 'handler failed');
});
