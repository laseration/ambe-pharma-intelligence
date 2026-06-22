import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { env } from '../../config/env';
import {
  buildActiveOrganizationConfig,
  clearActiveOrganizationConfigCache,
  getActiveAccountOpeningProfileValues,
  getActiveAlertEmailRecipients,
  getActiveInternalCompanyNames,
  getActiveInternalEmailDomains,
  getActiveReviewEmailRecipients,
  loadActiveOrganizationConfig,
} from '../activeOrganizationConfig';

const orgRow = {
  id: 'org_test',
  internalEmailDomains: ['client.example'],
  internalCompanyNames: ['Client Pharma'],
  alertEmailRecipients: ['ops@client.example'],
  reviewEmailRecipients: ['review@client.example'],
  accountOpeningProfile: { legalCompanyName: 'Client Pharma Ltd' },
};

afterEach(() => {
  clearActiveOrganizationConfigCache();
});

test('buildActiveOrganizationConfig coerces JSON lists and profile', () => {
  const config = buildActiveOrganizationConfig(orgRow);

  assert.deepEqual(config.internalEmailDomains, ['client.example']);
  assert.deepEqual(config.alertEmailRecipients, ['ops@client.example']);
  assert.equal(
    config.accountOpeningProfileValues.legalCompanyName,
    'Client Pharma Ltd',
  );
});

test('a malformed list falls back to the env value', () => {
  const config = buildActiveOrganizationConfig({
    ...orgRow,
    internalEmailDomains: 'not-an-array',
  });

  assert.deepEqual(
    config.internalEmailDomains,
    env.emailInboundInternalDomains,
  );
});

test('getters fall back to env while the cache is empty', () => {
  clearActiveOrganizationConfigCache();

  assert.deepEqual(
    getActiveInternalEmailDomains(),
    env.emailInboundInternalDomains,
  );
  assert.deepEqual(
    getActiveInternalCompanyNames(),
    env.emailInboundInternalCompanyNames,
  );
  assert.deepEqual(
    getActiveAlertEmailRecipients(),
    env.internalAlertEmailRecipients,
  );
  assert.deepEqual(
    getActiveReviewEmailRecipients(),
    env.accountOpeningReviewEmailRecipients,
  );
  assert.equal(getActiveAccountOpeningProfileValues(), null);
});

test('getters return organisation values once loaded', async () => {
  await loadActiveOrganizationConfig(orgRow);

  assert.deepEqual(getActiveInternalEmailDomains(), ['client.example']);
  assert.deepEqual(getActiveAlertEmailRecipients(), ['ops@client.example']);
  assert.equal(
    getActiveAccountOpeningProfileValues()?.legalCompanyName,
    'Client Pharma Ltd',
  );
});
