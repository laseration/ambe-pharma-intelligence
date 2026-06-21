import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { env } from '../../config/env';
import { sendPollingFailureAlert } from '../failureAlert';
import type { PollingWorkerSnapshot } from '../status';

function snapshot(
  overrides: Partial<PollingWorkerSnapshot> = {},
): PollingWorkerSnapshot {
  return {
    name: 'email-inbound',
    enabled: true,
    configured: true,
    active: true,
    running: true,
    inFlight: false,
    intervalMs: 60000,
    startedAt: null,
    stoppedAt: null,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastSuccessAt: null,
    lastFailureAt: '2026-06-21T00:00:00.000Z',
    lastErrorAt: null,
    lastError: 'inbox fetch failed',
    consecutiveFailures: 3,
    totalRuns: 3,
    totalItemsSeen: 0,
    totalItemsProcessed: 0,
    totalItemsSkipped: 0,
    totalItemsFailed: 1,
    duplicateItemsSkipped: 0,
    ...overrides,
  };
}

function overrideEnv(t: TestContext, overrides: Partial<typeof env>) {
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;
  Object.assign(env, overrides);
  t.after(() => {
    Object.assign(env, previous);
  });
}

const graphEnv: Partial<typeof env> = {
  emailAlertsEnabled: true,
  internalAlertEmailRecipients: ['ops@ambemedical.com'],
  microsoftMailTenantId: 'tenant',
  microsoftMailClientId: 'client',
  microsoftMailClientSecret: 'secret',
  microsoftGraphRefreshToken: '',
  microsoftGraphSenderMailbox: 'bot@ambemedical.com',
};

test('skips sending when alerts are disabled', async (t) => {
  overrideEnv(t, { emailAlertsEnabled: false });
  let touched = false;
  const result = await sendPollingFailureAlert(snapshot(), {
    getAccessToken: async () => {
      touched = true;
      return 'token';
    },
    fetchImpl: (async () => {
      touched = true;
      return new Response('', { status: 200 });
    }) as never,
  });
  assert.equal(result.status, 'SKIPPED_DISABLED');
  assert.equal(touched, false);
});

test('skips when no internal alert recipients are configured', async (t) => {
  overrideEnv(t, { ...graphEnv, internalAlertEmailRecipients: [] });
  const result = await sendPollingFailureAlert(snapshot(), {
    getAccessToken: async () => 'token',
    fetchImpl: (async () => new Response('', { status: 200 })) as never,
  });
  assert.equal(result.status, 'NO_RECIPIENTS');
});

test('sends a gated alert with safe status fields only', async (t) => {
  overrideEnv(t, graphEnv);
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const result = await sendPollingFailureAlert(snapshot(), {
    getAccessToken: async () => 'token',
    fetchImpl: (async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response('', { status: 202 });
    }) as never,
  });

  assert.equal(result.status, 'SENT');
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /sendMail/);
  const message = (calls[0]!.body as { message: Record<string, unknown> })
    .message;
  assert.match(String(message.subject), /3 consecutive failures/i);
  assert.deepEqual(message.toRecipients, [
    { emailAddress: { address: 'ops@ambemedical.com' } },
  ]);
});

test('reports FAILED on a non-2xx Graph response', async (t) => {
  overrideEnv(t, graphEnv);
  const result = await sendPollingFailureAlert(snapshot(), {
    getAccessToken: async () => 'token',
    fetchImpl: (async () => new Response('nope', { status: 500 })) as never,
  });
  assert.equal(result.status, 'FAILED');
});
