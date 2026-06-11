import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomerContactOpportunitiesPath,
  buildCustomerDetailPath,
  buildCustomerListPath,
} from './customersApiPaths';

test('customers API client builds list query paths with safe filters', () => {
  assert.equal(buildCustomerListPath(), '/customers');
  assert.equal(
    buildCustomerListPath({
      q: '  hospital ',
      activeOnly: true,
      limit: 25,
      page: 3,
    }),
    '/customers?q=hospital&activeOnly=true&limit=25&page=3',
  );
});

test('customers API client omits empty optional query values', () => {
  assert.equal(
    buildCustomerListPath({
      q: '',
      activeOnly: null,
      limit: undefined,
      page: null,
    }),
    '/customers',
  );
});

test('customers API client encodes detail ids and contact-opportunity query paths', () => {
  assert.equal(
    buildCustomerDetailPath('customer/id with spaces'),
    '/customers/customer%2Fid%20with%20spaces',
  );
  assert.equal(
    buildCustomerContactOpportunitiesPath({ limit: 8 }),
    '/customers/contact-opportunities?limit=8',
  );
});
