import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { env } from '../../config/env';
import {
  getMicrosoftGraphAccessToken,
  resetMicrosoftGraphTokenCacheForTests,
} from '../graph';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function tokenResponse(token: string, expiresIn?: number): Response {
  const payload: Record<string, unknown> = {
    access_token: token,
    token_type: 'Bearer',
  };
  if (expiresIn !== undefined) {
    payload.expires_in = expiresIn;
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CLIENT_SECRET_ENV: Partial<typeof env> = {
  microsoftMailTenantId: 'tenant',
  microsoftMailClientId: 'client',
  microsoftMailClientSecret: 'client-secret-value',
  microsoftGraphRefreshToken: '',
};

test('Graph access token is cached and reused within its lifetime', async (t) => {
  resetMicrosoftGraphTokenCacheForTests();
  t.after(() => resetMicrosoftGraphTokenCacheForTests());
  overrideEnv(t, { ...CLIENT_SECRET_ENV });

  let fetchCalls = 0;
  let nowMs = 1_000_000;
  const deps = {
    fetchImpl: async () => {
      fetchCalls += 1;
      return tokenResponse('token-A', 3600);
    },
    now: () => nowMs,
  };

  const first = await getMicrosoftGraphAccessToken(deps);
  // Comfortably inside the token lifetime: must be served from cache.
  nowMs = 1_000_000 + 1_800_000;
  const second = await getMicrosoftGraphAccessToken(deps);

  assert.equal(first, 'token-A');
  assert.equal(second, 'token-A');
  assert.equal(fetchCalls, 1);
});

test('Graph access token is refreshed after it expires', async (t) => {
  resetMicrosoftGraphTokenCacheForTests();
  t.after(() => resetMicrosoftGraphTokenCacheForTests());
  overrideEnv(t, { ...CLIENT_SECRET_ENV });

  let fetchCalls = 0;
  let nowMs = 1_000_000;
  let tokenToReturn = 'token-A';
  const deps = {
    fetchImpl: async () => {
      fetchCalls += 1;
      return tokenResponse(tokenToReturn, 3600);
    },
    now: () => nowMs,
  };

  const first = await getMicrosoftGraphAccessToken(deps);
  // Past the full token lifetime: the cache is expired and a refresh is forced.
  nowMs = 1_000_000 + 3_600_000 + 1_000;
  tokenToReturn = 'token-B';
  const second = await getMicrosoftGraphAccessToken(deps);

  assert.equal(first, 'token-A');
  assert.equal(second, 'token-B');
  assert.equal(fetchCalls, 2);
});

test('Graph access token falls back to a bounded lifetime when expires_in is absent', async (t) => {
  resetMicrosoftGraphTokenCacheForTests();
  t.after(() => resetMicrosoftGraphTokenCacheForTests());
  overrideEnv(t, { ...CLIENT_SECRET_ENV });

  let fetchCalls = 0;
  let nowMs = 1_000_000;
  const deps = {
    fetchImpl: async () => {
      fetchCalls += 1;
      return tokenResponse('token-A'); // no expires_in
    },
    now: () => nowMs,
  };

  await getMicrosoftGraphAccessToken(deps);
  nowMs = 1_000_000 + 10_000; // within the fallback TTL -> cached
  await getMicrosoftGraphAccessToken(deps);
  assert.equal(fetchCalls, 1);

  nowMs = 1_000_000 + 10 * 60_000; // well past the fallback TTL -> refreshed
  await getMicrosoftGraphAccessToken(deps);
  assert.equal(fetchCalls, 2);
});
