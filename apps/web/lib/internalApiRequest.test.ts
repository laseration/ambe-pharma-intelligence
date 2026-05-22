import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInternalApiHeaders,
  getInternalApiBaseUrl,
  redactInternalApiSecrets,
  requestInternalJson,
  requestInternalTextFile,
} from './internalApiRequest';

const source = {
  INTERNAL_API_BASE_URL: 'https://internal-api.example.test/api/',
  NEXT_PUBLIC_INTERNAL_API_BASE_URL: '',
  INTERNAL_API_KEY: 'operator-secret-redacted',
  INTERNAL_ADMIN_API_KEY: 'admin-secret-redacted',
  ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN: 'download-secret-redacted',
  DASHBOARD_OPERATOR_TOKEN: '',
};

test('internal API request helper resolves configured base URL and safe default', () => {
  assert.equal(
    getInternalApiBaseUrl(source),
    'https://internal-api.example.test/api',
  );
  assert.equal(getInternalApiBaseUrl({}), 'http://127.0.0.1:4000/api');
});

test('internal API request helper attaches server credentials and caller label only when configured', () => {
  assert.deepEqual(
    buildInternalApiHeaders({
      callerName: 'web-dashboard',
      includeJsonContentType: true,
      source,
    }),
    {
      'x-internal-api-key': 'operator-secret-redacted',
      'x-internal-caller-name': 'web-dashboard',
      'content-type': 'application/json',
    },
  );

  assert.deepEqual(
    buildInternalApiHeaders({
      callerName: 'web-dashboard',
      source: {},
    }),
    {},
  );
});

test('internal API request helper builds no-store fetches without real network access', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });

    return Response.json({
      items: [{ id: 'item-1' }],
    });
  };

  const payload = await requestInternalJson<{ items: Array<{ id: string }> }>(
    '/review-queue',
    {
      callerName: 'web-review-console',
      source,
      fetchImpl,
    },
  );

  assert.deepEqual(payload.items, [{ id: 'item-1' }]);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    'https://internal-api.example.test/api/review-queue',
  );
  assert.equal(calls[0]?.init.cache, 'no-store');
  assert.deepEqual(calls[0]?.init.headers, {
    'x-internal-api-key': 'operator-secret-redacted',
    'x-internal-caller-name': 'web-review-console',
  });
});

test('internal API request helper sends JSON content type for body requests', async () => {
  let headers: HeadersInit | undefined;
  const fetchImpl: typeof fetch = async (_url, init) => {
    headers = init?.headers;
    return Response.json({ item: { id: 'updated' } });
  };

  await requestInternalJson('/opportunities/opportunity-1/status', {
    callerName: 'web-dashboard',
    source,
    fetchImpl,
    init: {
      method: 'PATCH',
      body: JSON.stringify({ status: 'REVIEWED' }),
    },
  });

  assert.deepEqual(headers, {
    'x-internal-api-key': 'operator-secret-redacted',
    'x-internal-caller-name': 'web-dashboard',
    'content-type': 'application/json',
  });
});

test('internal API request helper redacts known secrets and live-looking URLs from errors', async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json(
      {
        error:
          'Failed with operator-secret-redacted and postgresql://user:pass@ep-example.eu-west-2.aws.neon.tech/neondb and sk-live-looking-key',
      },
      { status: 500 },
    );

  await assert.rejects(
    requestInternalJson('/unsafe-error', {
      callerName: 'web-dashboard',
      source,
      fetchImpl,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /operator-secret-redacted/);
      assert.doesNotMatch(error.message, /postgresql:\/\//);
      assert.doesNotMatch(error.message, /sk-live-looking-key/);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});

test('internal API file helper preserves safe filename metadata from mocked backend', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('review content', {
      status: 200,
      headers: {
        'content-type': 'text/markdown',
        'content-disposition': 'attachment; filename="review-pack.md"',
      },
    });

  const file = await requestInternalTextFile(
    '/account-opening/case-1/export-pack/review-pack.md',
    {
      callerName: 'web-account-opening-review',
      source,
      fetchImpl,
      fallbackFileName: 'fallback.txt',
      fallbackContentType: 'text/plain',
    },
  );

  assert.deepEqual(file, {
    fileName: 'review-pack.md',
    contentType: 'text/markdown',
    content: 'review content',
  });
});

test('standalone error redaction does not require a fetch response', () => {
  const redacted = redactInternalApiSecrets(
    'authorization bearer admin-secret-redacted x-internal-api-key: operator-secret-redacted',
    source,
  );

  assert.doesNotMatch(redacted, /admin-secret-redacted/);
  assert.doesNotMatch(redacted, /operator-secret-redacted/);
});
