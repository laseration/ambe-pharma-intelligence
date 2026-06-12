import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../../app';
import { env } from '../../config/env';
import { graphMailDryRunService } from '../../email/graphPreflight';
import type { InternalApiRole } from '../../http/auth';

const apiKeys: Record<InternalApiRole, string> = {
  viewer: 'viewer-test-secret',
  operator: 'operator-test-secret',
  admin: 'admin-test-secret',
};

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function stubMethod<
  TObject extends Record<string, any>,
  TKey extends keyof TObject,
>(
  context: TestContext,
  object: TObject,
  key: TKey,
  replacement: TObject[TKey],
) {
  const original = object[key];
  object[key] = replacement;
  context.after(() => {
    object[key] = original;
  });
}

async function startServer(context: TestContext) {
  const app = createApp();
  const server = app.listen(0);

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function authHeaders(role: InternalApiRole): HeadersInit {
  return {
    'x-internal-api-key': apiKeys[role],
    'x-internal-caller-name': `authz-matrix-${role}`,
  };
}

function jsonRequestInit(
  role: InternalApiRole,
  method: string,
  body: unknown,
): RequestInit {
  return {
    method,
    headers: {
      ...authHeaders(role),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function configureInternalAuth(context: TestContext) {
  overrideEnv(context, {
    nodeEnv: 'test',
    internalViewerApiKey: apiKeys.viewer,
    internalApiKey: apiKeys.operator,
    internalAdminApiKey: apiKeys.admin,
  });
}

test('API route matrix allows all roles to reach intended read-only status routes', async (t) => {
  configureInternalAuth(t);
  const baseUrl = await startServer(t);

  for (const role of [
    'viewer',
    'operator',
    'admin',
  ] satisfies InternalApiRole[]) {
    const response = await fetch(`${baseUrl}/api/system/graph-mail-preflight`, {
      headers: authHeaders(role),
    });

    assert.equal(
      response.status,
      200,
      `${role} should reach read-only Graph preflight status`,
    );
  }
});

test('API route matrix returns safe 401 responses when internal API auth is missing', async (t) => {
  configureInternalAuth(t);
  const baseUrl = await startServer(t);
  const protectedRoutes = [
    '/api/opportunities',
    '/api/trade/buyer-enquiries',
    '/api/system/readiness',
  ];

  for (const path of protectedRoutes) {
    const response = await fetch(`${baseUrl}${path}`);
    const payload = (await response.json()) as {
      error?: { message?: string; code?: string };
    };

    assert.equal(response.status, 401, `missing auth should fail for ${path}`);
    assert.equal(payload.error?.code, 'UNAUTHORIZED');
    assert.equal(
      payload.error?.message,
      'Invalid or missing internal API key.',
    );
  }
});

test('API route matrix denies viewer access to sensitive internal read surfaces', async (t) => {
  configureInternalAuth(t);
  const baseUrl = await startServer(t);
  const sensitiveReadRoutes = [
    '/api/imports/batches',
    '/api/review-queue/workflows',
    '/api/buy-decisions',
    '/api/buy-executions',
    '/api/account-opening/case-1',
    '/api/regulatory/alerts',
  ];

  for (const path of sensitiveReadRoutes) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: authHeaders('viewer'),
    });
    assert.equal(response.status, 403, `viewer should be denied ${path}`);
  }
});

test('API route matrix denies viewer mutations and allows operator/admin past auth', async (t) => {
  configureInternalAuth(t);
  const baseUrl = await startServer(t);
  const operatorRoutes: Array<{
    name: string;
    method: string;
    path: string;
    body?: unknown;
    allowedStatus: number;
  }> = [
    {
      name: 'supplier import upload',
      method: 'POST',
      path: '/api/imports/supplier-price-list',
      allowedStatus: 422,
    },
    {
      name: 'review queue action',
      method: 'PATCH',
      path: '/api/review-queue/workflows/workflow-1',
      body: { action: 'NOT_A_WORKFLOW_ACTION' },
      allowedStatus: 422,
    },
    {
      name: 'buy decision action',
      method: 'PATCH',
      path: '/api/buy-decisions/decision-1',
      body: { action: 'NOT_A_BUY_DECISION_ACTION' },
      allowedStatus: 422,
    },
    {
      name: 'buy execution update',
      method: 'PATCH',
      path: '/api/buy-executions/execution-1',
      body: { fulfillmentStatus: 'NOT_A_FULFILLMENT_STATUS' },
      allowedStatus: 422,
    },
    {
      name: 'account-opening status update',
      method: 'PATCH',
      path: '/api/account-opening/case-1/status',
      body: { action: 'NOT_AN_ACCOUNT_OPENING_ACTION' },
      allowedStatus: 422,
    },
    {
      name: 'regulatory update ingest',
      method: 'POST',
      path: '/api/regulatory/updates/ingest',
      body: {},
      allowedStatus: 422,
    },
    {
      name: 'automation readiness update',
      method: 'PUT',
      path: '/api/automation/readiness',
      body: { globalMode: 'NOT_A_GLOBAL_MODE' },
      allowedStatus: 422,
    },
  ];

  for (const route of operatorRoutes) {
    const viewerInit =
      route.body === undefined
        ? { method: route.method, headers: authHeaders('viewer') }
        : jsonRequestInit('viewer', route.method, route.body);
    const viewerResponse = await fetch(`${baseUrl}${route.path}`, viewerInit);
    assert.equal(
      viewerResponse.status,
      403,
      `viewer should be denied ${route.name}`,
    );

    for (const role of ['operator', 'admin'] satisfies InternalApiRole[]) {
      const init =
        route.body === undefined
          ? { method: route.method, headers: authHeaders(role) }
          : jsonRequestInit(role, route.method, route.body);
      const response = await fetch(`${baseUrl}${route.path}`, init);

      assert.equal(
        response.status,
        route.allowedStatus,
        `${role} should pass auth and reach validation for ${route.name}`,
      );
    }
  }
});

test('API route matrix keeps admin-only routes unavailable to viewer and operator', async (t) => {
  configureInternalAuth(t);
  stubMethod(t, graphMailDryRunService, 'runDryRun', async () => ({
    generatedAt: '2026-06-10T00:00:00.000Z',
    liveReadOnlyGraphCall: true,
    mailbox: 'ops@example.test',
    requestedTake: 1,
    messageCount: 0,
    messages: [],
    safety: {
      markedRead: false,
      ingested: false,
      persistedContent: false,
      downloadedAttachmentContent: false,
      calledOpenAi: false,
      calledTelegram: false,
      sentEmail: false,
    },
  }));

  const baseUrl = await startServer(t);

  for (const role of ['viewer', 'operator'] satisfies InternalApiRole[]) {
    const response = await fetch(
      `${baseUrl}/api/system/graph-mail-dry-run?take=1`,
      {
        headers: authHeaders(role),
      },
    );

    assert.equal(response.status, 403, `${role} should be denied dry-run`);
  }

  const adminResponse = await fetch(
    `${baseUrl}/api/system/graph-mail-dry-run?take=1`,
    {
      headers: authHeaders('admin'),
    },
  );

  assert.equal(adminResponse.status, 200);
});
