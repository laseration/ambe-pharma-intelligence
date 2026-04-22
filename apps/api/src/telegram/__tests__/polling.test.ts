import test from 'node:test';
import assert from 'node:assert/strict';

import { TelegramPollingState } from '../polling';

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
