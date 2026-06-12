import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capabilitiesForRole,
  requireCapability,
  roleHasCapability,
  WebAuthorisationError,
} from './authorisation';
import type { WebAuthSession } from './internalWebAuth';

function session(role: WebAuthSession['role']): WebAuthSession {
  return {
    username: `${role}.user`,
    role,
    expiresAt: 2_000_000_000,
  };
}

test('role capability map keeps viewers read-only and operators away from system admin', () => {
  assert.equal(roleHasCapability('viewer', 'dashboard:view'), true);
  assert.equal(roleHasCapability('viewer', 'inventory:view'), true);
  assert.equal(roleHasCapability('viewer', 'customers:view'), true);
  assert.equal(roleHasCapability('viewer', 'imports:view'), false);
  assert.equal(roleHasCapability('viewer', 'opportunities:manage'), false);
  assert.equal(roleHasCapability('viewer', 'review:manage'), false);
  assert.equal(roleHasCapability('operator', 'review:manage'), true);
  assert.equal(roleHasCapability('operator', 'system:admin'), false);
  assert.equal(roleHasCapability('admin', 'system:admin'), true);
  assert.deepEqual(
    capabilitiesForRole('viewer').includes('account-opening:download'),
    false,
  );
});

const webRoleMatrix: Array<{
  role: WebAuthSession['role'];
  allowed: Parameters<typeof roleHasCapability>[1][];
  denied: Parameters<typeof roleHasCapability>[1][];
}> = [
  {
    role: 'viewer',
    allowed: [
      'dashboard:view',
      'inventory:view',
      'customers:view',
      'opportunities:view',
      'products:view',
      'deals:view',
      'trade-enquiries:view',
    ],
    denied: [
      'opportunities:manage',
      'imports:view',
      'inbox:view',
      'review:view',
      'review:manage',
      'account-opening:view',
      'account-opening:manage',
      'account-opening:download',
      'trade-enquiries:manage',
      'system:admin',
    ],
  },
  {
    role: 'operator',
    allowed: [
      'dashboard:view',
      'inventory:view',
      'customers:view',
      'imports:view',
      'inbox:view',
      'opportunities:view',
      'opportunities:manage',
      'products:view',
      'deals:view',
      'review:view',
      'review:manage',
      'account-opening:view',
      'account-opening:manage',
      'account-opening:download',
      'trade-enquiries:view',
      'trade-enquiries:manage',
    ],
    denied: ['system:admin'],
  },
  {
    role: 'admin',
    allowed: [
      'dashboard:view',
      'inventory:view',
      'customers:view',
      'imports:view',
      'inbox:view',
      'opportunities:view',
      'opportunities:manage',
      'products:view',
      'deals:view',
      'review:view',
      'review:manage',
      'account-opening:view',
      'account-opening:manage',
      'account-opening:download',
      'trade-enquiries:view',
      'trade-enquiries:manage',
      'system:admin',
    ],
    denied: [],
  },
];

test('web role matrix documents viewer operator admin capability boundaries', () => {
  for (const matrixEntry of webRoleMatrix) {
    for (const capability of matrixEntry.allowed) {
      assert.equal(
        roleHasCapability(matrixEntry.role, capability),
        true,
        `${matrixEntry.role} should allow ${capability}`,
      );
    }

    for (const capability of matrixEntry.denied) {
      assert.equal(
        roleHasCapability(matrixEntry.role, capability),
        false,
        `${matrixEntry.role} should deny ${capability}`,
      );
      assert.throws(
        () => requireCapability(session(matrixEntry.role), capability),
        (error: unknown) => {
          assert.ok(error instanceof WebAuthorisationError);
          assert.equal(error.status, 403);
          assert.equal(error.capability, capability);
          return true;
        },
        `${matrixEntry.role} should fail guard for ${capability}`,
      );
    }
  }
});

test('requireCapability returns the session only when the role is allowed', () => {
  const operator = session('operator');

  assert.equal(requireCapability(operator, 'review:manage'), operator);
  assert.throws(
    () => requireCapability(session('viewer'), 'review:manage'),
    (error: unknown) => {
      assert.ok(error instanceof WebAuthorisationError);
      assert.equal(error.status, 403);
      assert.equal(error.capability, 'review:manage');
      return true;
    },
  );
  assert.throws(
    () => requireCapability(null, 'dashboard:view'),
    (error: unknown) => {
      assert.ok(error instanceof WebAuthorisationError);
      assert.equal(error.status, 401);
      assert.equal(error.capability, 'dashboard:view');
      return true;
    },
  );
});
