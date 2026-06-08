import assert from 'node:assert/strict';
import test from 'node:test';

import robots from './robots';

test('robots disallows login and dashboard paths', () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = rule.disallow;
  const disallowedPaths = Array.isArray(disallow) ? disallow : [disallow];

  assert.ok(disallowedPaths.includes('/login'));
  assert.ok(disallowedPaths.includes('/dashboard'));
  assert.ok(disallowedPaths.includes('/dashboard/*'));
});
