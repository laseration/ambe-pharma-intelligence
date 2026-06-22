import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeNewOrganizationInput } from '../newOrganization';

test('normalises a valid organisation config', () => {
  const input = normalizeNewOrganizationInput({
    slug: 'Acme-Pharma',
    name: '  Acme Pharma Ltd ',
    internalEmailDomains: ['acme.example', '  '],
    alertEmailRecipients: ['ops@acme.example'],
    accountOpeningProfile: { legalCompanyName: 'Acme Pharma Ltd' },
  });

  assert.equal(input.slug, 'acme-pharma');
  assert.equal(input.name, 'Acme Pharma Ltd');
  assert.deepEqual(input.internalEmailDomains, ['acme.example']);
  assert.deepEqual(input.reviewEmailRecipients, []);
  assert.equal(input.senderMailbox, null);
  assert.equal(input.accountOpeningProfile.legalCompanyName, 'Acme Pharma Ltd');
});

test('rejects a missing name', () => {
  assert.throws(() => normalizeNewOrganizationInput({ slug: 'acme' }), /name/);
});

test('rejects an invalid slug', () => {
  assert.throws(
    () => normalizeNewOrganizationInput({ slug: 'Acme Pharma!', name: 'X' }),
    /slug/,
  );
});

test('rejects a non-object config', () => {
  assert.throws(() => normalizeNewOrganizationInput('nope'), /JSON object/);
});

test('rejects a non-string list entry', () => {
  assert.throws(
    () =>
      normalizeNewOrganizationInput({
        slug: 'acme',
        name: 'X',
        internalEmailDomains: [1],
      }),
    /array of strings/,
  );
});
