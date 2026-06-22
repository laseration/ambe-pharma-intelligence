import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_ORGANIZATION_SLUG,
  buildDefaultOrganizationInput,
  type DefaultOrganizationSource,
} from '../defaultOrganization';

const baseSource: DefaultOrganizationSource = {
  legalCompanyName: 'Ambe Medical Group',
  internalEmailDomains: ['ambemedical.com'],
  internalCompanyNames: ['Ambe Medical', 'Ambe Medical Group'],
  alertEmailRecipients: ['ops@ambemedical.com'],
  reviewEmailRecipients: ['review@ambemedical.com'],
  senderMailbox: 'alerts@ambemedical.com',
  telegramInternalChatId: '12345',
  accountOpeningProfile: { legalCompanyName: 'Ambe Medical Group' },
};

test('maps source config onto the default organisation', () => {
  const input = buildDefaultOrganizationInput(baseSource);

  assert.equal(input.slug, DEFAULT_ORGANIZATION_SLUG);
  assert.equal(input.name, 'Ambe Medical Group');
  assert.equal(input.isDefault, true);
  assert.equal(input.status, 'ACTIVE');
  assert.deepEqual(input.internalEmailDomains, ['ambemedical.com']);
  assert.equal(input.senderMailbox, 'alerts@ambemedical.com');
  assert.equal(input.telegramInternalChatId, '12345');
  assert.deepEqual(input.accountOpeningProfile, {
    legalCompanyName: 'Ambe Medical Group',
  });
});

test('name falls back to first internal company name when legal name is blank', () => {
  const input = buildDefaultOrganizationInput({
    ...baseSource,
    legalCompanyName: '   ',
    internalCompanyNames: ['Acme Pharma Ltd'],
  });

  assert.equal(input.name, 'Acme Pharma Ltd');
});

test('blank optional contact fields normalise to null', () => {
  const input = buildDefaultOrganizationInput({
    ...baseSource,
    senderMailbox: '   ',
    telegramInternalChatId: '',
  });

  assert.equal(input.senderMailbox, null);
  assert.equal(input.telegramInternalChatId, null);
});
