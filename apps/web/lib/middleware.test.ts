import assert from 'node:assert/strict';
import test from 'node:test';

import { NextRequest } from 'next/server';

import { middleware } from '../middleware';
import {
  createWebSessionCookieValue,
  WEB_AUTH_COOKIE_NAME,
} from './internalWebAuth';

const authEnv = {
  WEB_AUTH_USERNAME: 'pilot.operator',
  WEB_AUTH_PASSWORD: 'local-test-password',
  WEB_AUTH_ROLE: 'operator',
  WEB_AUTH_SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  WEB_AUTH_SESSION_TTL_SECONDS: '60',
};

function withAuthEnv<T>(callback: () => Promise<T>): Promise<T> {
  const previous = {
    WEB_AUTH_USERNAME: process.env.WEB_AUTH_USERNAME,
    WEB_AUTH_PASSWORD: process.env.WEB_AUTH_PASSWORD,
    WEB_AUTH_ROLE: process.env.WEB_AUTH_ROLE,
    WEB_AUTH_SESSION_SECRET: process.env.WEB_AUTH_SESSION_SECRET,
    WEB_AUTH_SESSION_TTL_SECONDS: process.env.WEB_AUTH_SESSION_TTL_SECONDS,
  };

  Object.assign(process.env, authEnv);

  return callback().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('dashboard middleware redirects unauthenticated requests to login', async () => {
  await withAuthEnv(async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3000/dashboard/review?status=NEW'),
    );

    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get('location'),
      'http://localhost:3000/?next=%2Fdashboard%2Freview%3Fstatus%3DNEW',
    );
  });
});

test('dashboard middleware allows valid internal web sessions', async () => {
  await withAuthEnv(async () => {
    const session = await createWebSessionCookieValue({
      username: 'pilot.operator',
      role: 'operator',
      source: process.env,
    });

    assert.ok(session);

    const response = await middleware(
      new NextRequest('http://localhost:3000/dashboard', {
        headers: {
          cookie: `${WEB_AUTH_COOKIE_NAME}=${session.cookieValue}`,
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
  });
});
