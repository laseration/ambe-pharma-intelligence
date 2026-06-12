import assert from 'node:assert/strict';
import test from 'node:test';

import sitemap from './sitemap';
import { publicUrl } from './publicSite';

test('sitemap includes only public marketing and trade access routes', () => {
  const urls = sitemap().map((entry) => entry.url);

  assert.deepEqual(urls, [
    publicUrl('/'),
    publicUrl('/about'),
    publicUrl('/services'),
    publicUrl('/comparator-sourcing'),
    publicUrl('/trade-access'),
    publicUrl('/onboarding'),
    publicUrl('/contact'),
  ]);

  assert.equal(
    urls.some((url) => url.includes('/login')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/dashboard')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/dashboard/trade-enquiries')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/open-account')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/compliance')),
    false,
  );
});
