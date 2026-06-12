import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDashboardRedirect,
  prepareWebLogin,
  prepareWebLogout,
} from './webAuthFlow';
import { readWebSession, WEB_AUTH_COOKIE_NAME } from './internalWebAuth';

const source = {
  WEB_AUTH_USERNAME: 'pilot.operator',
  WEB_AUTH_PASSWORD: 'local-test-password',
  WEB_AUTH_ROLE: 'operator',
  WEB_AUTH_SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  WEB_AUTH_SESSION_TTL_SECONDS: '60',
  NODE_ENV: 'development',
};

test('web login flow accepts valid pilot credentials and prepares a signed session cookie', async () => {
  const result = await prepareWebLogin({
    username: 'pilot.operator',
    password: 'local-test-password',
    next: '/dashboard/review?status=NEW',
    source,
    now: 1_000_000,
  });

  assert.equal(result.authenticated, true);
  assert.equal(result.redirectTo, '/dashboard/review?status=NEW');
  assert.equal(result.cookie.name, WEB_AUTH_COOKIE_NAME);
  assert.equal(result.cookie.options.httpOnly, true);
  assert.equal(result.cookie.options.secure, false);
  assert.equal(result.cookie.options.maxAge, 60);

  assert.deepEqual(
    await readWebSession(result.cookie.value, source, 1_001_000),
    {
      username: 'pilot.operator',
      role: 'operator',
      expiresAt: 1060,
    },
  );
});

test('web login flow rejects invalid credentials without setting a cookie', async () => {
  const result = await prepareWebLogin({
    username: 'pilot.operator',
    password: 'wrong-password',
    next: '/dashboard/setup',
    source,
    now: 1_000_000,
  });

  assert.deepEqual(result, {
    authenticated: false,
    redirectTo: '/login?error=invalid&next=%2Fdashboard%2Fsetup',
    cookie: null,
  });
});

test('web login flow rejects missing auth configuration without leaking details', async () => {
  const result = await prepareWebLogin({
    username: 'pilot.operator',
    password: 'local-test-password',
    next: '/dashboard',
    source: {},
    now: 1_000_000,
  });

  assert.deepEqual(result, {
    authenticated: false,
    redirectTo: '/login?error=not-configured&next=%2Fdashboard',
    cookie: null,
  });
});

test('web logout flow clears the session cookie and redirects to login', () => {
  assert.deepEqual(prepareWebLogout({ source }), {
    redirectTo: '/login?signedOut=1',
    cookie: {
      name: WEB_AUTH_COOKIE_NAME,
      value: '',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 0,
      },
    },
  });
});

test('dashboard redirects are constrained to dashboard paths', () => {
  assert.equal(normalizeDashboardRedirect(undefined), '/dashboard');
  assert.equal(normalizeDashboardRedirect('/contact'), '/dashboard');
  assert.equal(normalizeDashboardRedirect('https://example.test'), '/dashboard');
  assert.equal(normalizeDashboardRedirect('/dashboard-evil'), '/dashboard');
  assert.equal(
    normalizeDashboardRedirect('/dashboard?tab=setup'),
    '/dashboard?tab=setup',
  );
  assert.equal(
    normalizeDashboardRedirect('/dashboard/trade-enquiries'),
    '/dashboard/trade-enquiries',
  );
});
