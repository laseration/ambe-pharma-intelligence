import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';

import { resolveInternalActor } from './auth';

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
