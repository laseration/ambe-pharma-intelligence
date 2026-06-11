import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Request } from 'express';

import { env } from '../config/env';
import { requireInternalViewerAccess, resolveInternalActor } from './auth';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

test('resolveInternalActor uses explicit actor before internal auth context', () => {
  const request = {
    internalAuth: {
      role: 'operator',
      callerLabel: 'web-review-console',
      auditActorIdentifier: 'internal-operator:web-review-console',
    },
  } as Request;

  const actor = resolveInternalActor(request, {
    actorType: 'USER',
    actorIdentifier: 'operator@example.test',
  });

  assert.deepEqual(actor, {
    actorType: 'USER',
    actorIdentifier: 'operator@example.test',
  });
});

test('resolveInternalActor falls back to internal auth audit actor', () => {
  const request = {
    internalAuth: {
      role: 'operator',
      callerLabel: 'web-review-console',
      auditActorIdentifier: 'internal-operator:web-review-console',
    },
  } as Request;

  const actor = resolveInternalActor(request, {});

  assert.deepEqual(actor, {
    actorType: 'OPERATOR',
    actorIdentifier: 'internal-operator:web-review-console',
  });
});

test('requireInternalViewerAccess authenticates a dedicated viewer API key', (t) => {
  overrideEnv(t, {
    nodeEnv: 'test',
    internalViewerApiKey: 'viewer-secret',
    internalApiKey: 'operator-secret',
    internalAdminApiKey: 'admin-secret',
  });
  const request = {
    header(name: string) {
      const headers: Record<string, string> = {
        'x-internal-api-key': 'viewer-secret',
        'x-internal-caller-name': 'web-dashboard-viewer',
      };
      return headers[name.toLowerCase()];
    },
  } as Request;
  let nextError: unknown;

  requireInternalViewerAccess(request, {} as never, (error?: unknown) => {
    nextError = error;
  });

  assert.equal(nextError, undefined);
  assert.deepEqual(request.internalAuth, {
    role: 'viewer',
    callerLabel: 'web-dashboard-viewer',
    auditActorIdentifier: 'internal-viewer:web-dashboard-viewer',
  });
});
