import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWebSessionCookieValue,
  getWebAuthConfig,
  getWebSessionCookieOptions,
  readWebSession,
  verifyWebLogin,
} from './internalWebAuth';

const source = {
  WEB_AUTH_USERNAME: 'pilot.operator',
  WEB_AUTH_PASSWORD: 'local-test-password',
  WEB_AUTH_ROLE: 'admin',
  WEB_AUTH_SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  WEB_AUTH_SESSION_TTL_SECONDS: '60',
  NODE_ENV: 'development',
};

test('web auth config requires credentials and a long session secret', () => {
  assert.deepEqual(getWebAuthConfig({}), { configured: false });
  assert.deepEqual(
    getWebAuthConfig({
      WEB_AUTH_USERNAME: 'pilot.operator',
      WEB_AUTH_PASSWORD: 'local-test-password',
      WEB_AUTH_SESSION_SECRET: 'short',
    }),
    { configured: false },
  );
  assert.deepEqual(getWebAuthConfig(source), {
    configured: true,
    username: 'pilot.operator',
    password: 'local-test-password',
    role: 'admin',
    sessionSecret: 'test-session-secret-that-is-long-enough',
    sessionTtlSeconds: 60,
  });
});

test('web login verifies credentials without exposing which field failed', async () => {
  const missingConfig = await verifyWebLogin({
    username: 'pilot.operator',
    password: 'local-test-password',
    source: {},
  });
  assert.deepEqual(missingConfig, {
    authenticated: false,
    reason: 'not-configured',
  });

  const wrongUsername = await verifyWebLogin({
    username: 'wrong',
    password: 'local-test-password',
    source,
  });
  assert.deepEqual(wrongUsername, {
    authenticated: false,
    reason: 'invalid',
  });

  const wrongPassword = await verifyWebLogin({
    username: 'pilot.operator',
    password: 'wrong',
    source,
  });
  assert.deepEqual(wrongPassword, {
    authenticated: false,
    reason: 'invalid',
  });
});

test('web auth creates readable signed sessions and rejects tampering or expiry', async () => {
  const created = await createWebSessionCookieValue({
    username: 'pilot.operator',
    role: 'operator',
    source,
    now: 1_000_000,
  });

  assert.ok(created);
  assert.equal(created.session.expiresAt, 1060);

  const session = await readWebSession(created.cookieValue, source, 1_001_000);
  assert.deepEqual(session, {
    username: 'pilot.operator',
    role: 'operator',
    expiresAt: 1060,
  });

  assert.equal(
    await readWebSession(`${created.cookieValue}tampered`, source, 1_001_000),
    null,
  );
  assert.equal(await readWebSession(created.cookieValue, source, 1_061_000), null);
});

test('web session cookie options use production secure cookies', () => {
  assert.deepEqual(
    getWebSessionCookieOptions({
      source: { NODE_ENV: 'production' },
      maxAge: 120,
    }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 120,
    },
  );

  assert.equal(
    getWebSessionCookieOptions({ source: { NODE_ENV: 'development' } }).secure,
    false,
  );
});
