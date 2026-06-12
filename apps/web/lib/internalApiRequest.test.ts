import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInternalApiHeaders,
  getInternalApiBaseUrl,
  InternalApiError,
  redactInternalApiSecrets,
  requestInternalJson,
  requestInternalTextFile,
} from './internalApiRequest';
import { WebAuthorisationError } from './authorisation';
import type { WebAuthSession } from './internalWebAuth';

const source = {
  INTERNAL_API_BASE_URL: 'https://internal-api.example.test/api/',
  NEXT_PUBLIC_INTERNAL_API_BASE_URL: '',
  INTERNAL_API_KEY: 'operator-secret-redacted',
  INTERNAL_ADMIN_API_KEY: 'admin-secret-redacted',
  ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN: 'download-secret-redacted',
  DASHBOARD_OPERATOR_TOKEN: '',
};

const operatorSession: WebAuthSession = {
  username: 'pilot.operator',
  role: 'operator',
  expiresAt: 2_000_000_000,
};

const viewerSession: WebAuthSession = {
  username: 'read.only',
  role: 'viewer',
  expiresAt: 2_000_000_000,
};

const adminSession: WebAuthSession = {
  username: 'admin.user',
  role: 'admin',
  expiresAt: 2_000_000_000,
};

test('internal API request helper resolves configured base URL and local defaults', () => {
  assert.equal(
    getInternalApiBaseUrl(source),
    'https://internal-api.example.test/api',
  );
  assert.equal(
    getInternalApiBaseUrl({
      NEXT_PUBLIC_INTERNAL_API_BASE_URL: 'http://127.0.0.1:4001/api/',
    }),
    'http://127.0.0.1:4001/api',
  );
  assert.equal(getInternalApiBaseUrl({}), 'http://127.0.0.1:4000/api');
});

test('internal API request helper requires server-side API URL in production', () => {
  assert.throws(
    () =>
      getInternalApiBaseUrl({
        NODE_ENV: 'production',
        NEXT_PUBLIC_INTERNAL_API_BASE_URL:
          'https://public-api.example.test/api',
      }),
    /INTERNAL_API_BASE_URL is required in production/,
  );
});

test('internal API request helper attaches server credentials and caller label only when configured', () => {
  assert.deepEqual(
    buildInternalApiHeaders({
      callerName: 'web-dashboard',
      requiredCapability: 'dashboard:view',
      actor: operatorSession,
      includeJsonContentType: true,
      source,
    }),
    {
      'x-internal-api-key': 'operator-secret-redacted',
      'x-internal-caller-name': 'web-dashboard',
      'x-internal-web-role': 'operator',
      'x-internal-web-user': 'pilot.operator',
      'content-type': 'application/json',
    },
  );

  assert.deepEqual(
    buildInternalApiHeaders({
      callerName: 'web-dashboard',
      requiredCapability: 'dashboard:view',
      actor: null,
      source: {},
    }),
    {},
  );
});

test('internal API request helper selects least-privilege API key for declared capability', () => {
  const credentialSource = {
    ...source,
    INTERNAL_VIEWER_API_KEY: 'viewer-secret-redacted',
  };

  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-dashboard',
      requiredCapability: 'dashboard:view',
      source: credentialSource,
    })['x-internal-api-key'],
    'viewer-secret-redacted',
  );
  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-inventory',
      requiredCapability: 'inventory:view',
      source: credentialSource,
    })['x-internal-api-key'],
    'viewer-secret-redacted',
  );
  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-customers',
      requiredCapability: 'customers:view',
      source: credentialSource,
    })['x-internal-api-key'],
    'viewer-secret-redacted',
  );
  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-review-console',
      requiredCapability: 'review:view',
      source: credentialSource,
    })['x-internal-api-key'],
    'operator-secret-redacted',
  );
  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-review-console',
      requiredCapability: 'review:manage',
      source: credentialSource,
    })['x-internal-api-key'],
    'operator-secret-redacted',
  );
  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-setup',
      requiredCapability: 'system:admin',
      source: credentialSource,
    })['x-internal-api-key'],
    'admin-secret-redacted',
  );
});

test('internal API request helper preserves existing key fallback without viewer key', () => {
  assert.equal(
    buildInternalApiHeaders({
      callerName: 'web-dashboard',
      requiredCapability: 'dashboard:view',
      source,
    })['x-internal-api-key'],
    'operator-secret-redacted',
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
      requiredCapability: 'review:view',
      session: operatorSession,
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
    'x-internal-web-role': 'operator',
    'x-internal-web-user': 'pilot.operator',
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
    requiredCapability: 'opportunities:manage',
    session: operatorSession,
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
    'x-internal-web-role': 'operator',
    'x-internal-web-user': 'pilot.operator',
    'content-type': 'application/json',
  });
});

test('internal API request helper blocks viewer sessions before operator API actions', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return Response.json({ ok: true });
  };

  await assert.rejects(
    requestInternalJson('/opportunities/opportunity-1/status', {
      callerName: 'web-dashboard',
      requiredCapability: 'opportunities:manage',
      session: viewerSession,
      source,
      fetchImpl,
      init: {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REVIEWED' }),
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof WebAuthorisationError);
      assert.equal(error.status, 403);
      assert.equal(error.capability, 'opportunities:manage');
      return true;
    },
  );
  assert.equal(called, false);
});

test('internal API request helper blocks non-admin sessions before setup API calls', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return Response.json({ item: {} });
  };

  await assert.rejects(
    requestInternalJson('/system/readiness', {
      callerName: 'web-setup-readiness',
      requiredCapability: 'system:admin',
      session: operatorSession,
      source,
      fetchImpl,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WebAuthorisationError);
      assert.equal(error.status, 403);
      assert.equal(error.capability, 'system:admin');
      return true;
    },
  );
  assert.equal(called, false);
});

test('internal API request helper enforces viewer operator admin request matrix', async () => {
  const cases: Array<{
    name: string;
    session: WebAuthSession;
    requiredCapability: Parameters<
      typeof requestInternalJson
    >[1]['requiredCapability'];
    expectedAllowed: boolean;
  }> = [
    {
      name: 'viewer can fetch read-only dashboard data',
      session: viewerSession,
      requiredCapability: 'dashboard:view',
      expectedAllowed: true,
    },
    {
      name: 'viewer cannot submit operator workflow mutations',
      session: viewerSession,
      requiredCapability: 'review:manage',
      expectedAllowed: false,
    },
    {
      name: 'operator can submit operational workflow mutations',
      session: operatorSession,
      requiredCapability: 'review:manage',
      expectedAllowed: true,
    },
    {
      name: 'operator cannot call admin-only setup APIs',
      session: operatorSession,
      requiredCapability: 'system:admin',
      expectedAllowed: false,
    },
    {
      name: 'admin can call admin-only setup APIs',
      session: adminSession,
      requiredCapability: 'system:admin',
      expectedAllowed: true,
    },
  ];

  for (const testCase of cases) {
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;
      return Response.json({ ok: true });
    };

    const request = requestInternalJson('/authz-matrix', {
      callerName: 'web-authz-matrix',
      requiredCapability: testCase.requiredCapability,
      session: testCase.session,
      source,
      fetchImpl,
    });

    if (testCase.expectedAllowed) {
      await request;
      assert.equal(callCount, 1, testCase.name);
    } else {
      await assert.rejects(
        request,
        (error: unknown) => {
          assert.ok(error instanceof WebAuthorisationError, testCase.name);
          assert.equal(error.status, 403, testCase.name);
          assert.equal(
            error.capability,
            testCase.requiredCapability,
            testCase.name,
          );
          return true;
        },
        testCase.name,
      );
      assert.equal(callCount, 0, testCase.name);
    }
  }
});

test('internal API request helper redacts known secrets and live-looking URLs from errors', async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json(
      {
        error:
          'Failed with operator-secret-redacted and postgresql://user:pass@ep-example.eu-west-2.aws.neon.tech/neondb and sk-fake-redaction-canary',
      },
      { status: 500 },
    );

  await assert.rejects(
    requestInternalJson('/unsafe-error', {
      callerName: 'web-dashboard',
      requiredCapability: 'dashboard:view',
      session: operatorSession,
      source,
      fetchImpl,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /operator-secret-redacted/);
      assert.doesNotMatch(error.message, /postgresql:\/\//);
      assert.doesNotMatch(error.message, /sk-fake-redaction-canary/);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});

test('internal API request helper preserves safe diagnostics from standardized API errors', async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json(
      {
        error: {
          message: 'Request validation failed.',
          code: 'VALIDATION_ERROR',
          requestId: 'request-abcdef12',
          nextAction: 'Check the submitted fields and try again.',
        },
      },
      {
        status: 422,
        headers: {
          'x-request-id': 'request-abcdef12',
        },
      },
    );

  await assert.rejects(
    requestInternalJson('/unsafe-error', {
      callerName: 'web-dashboard',
      requiredCapability: 'dashboard:view',
      session: operatorSession,
      source,
      fetchImpl,
    }),
    (error: unknown) => {
      assert.ok(error instanceof InternalApiError);
      assert.equal(error.status, 422);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.requestId, 'request-abcdef12');
      assert.equal(
        error.nextAction,
        'Check the submitted fields and try again.',
      );
      assert.match(error.message, /Request ID: request-abcdef12/);
      assert.match(error.message, /What to check next:/);
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
      requiredCapability: 'account-opening:download',
      session: operatorSession,
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
