import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { env } from '../../config/env';
import {
  GRAPH_ATTACHMENT_MAX_PAGES,
  GRAPH_INBOX_MAX_PAGES,
  GRAPH_REQUEST_MAX_RETRIES,
  type GraphHttpDeps,
  listAttachments,
  listUnreadInboxMessages,
  markMessageRead,
} from '../polling';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function createWarnLogger() {
  return {
    warnCalls: [] as Array<{ message: string; meta?: Record<string, unknown> }>,
    warn(message: string, meta?: Record<string, unknown>) {
      this.warnCalls.push({ message, meta });
    },
  };
}

function listResponse(value: unknown[], nextLink?: string): Response {
  const payload: Record<string, unknown> = { value };
  if (nextLink) {
    payload['@odata.nextLink'] = nextLink;
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function graphErrorResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code: 'TestError' } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function baseDeps(
  fetchImpl: GraphHttpDeps['fetchImpl'],
  extra?: Partial<GraphHttpDeps>,
): GraphHttpDeps {
  return {
    fetchImpl,
    getAccessToken: async () => 'test-access-token',
    sleep: async () => {},
    logger: createWarnLogger(),
    ...extra,
  };
}

test('inbox polling follows @odata.nextLink across pages, preserving order', async (t) => {
  overrideEnv(t, {
    microsoftGraphSenderMailbox: 'intake@example.test',
    graphUseImmutableIds: false,
  });

  const urls: string[] = [];
  let call = 0;
  const deps = baseDeps(async (url) => {
    urls.push(String(url));
    call += 1;
    if (call === 1) {
      return listResponse(
        [{ id: 'm1' }, { id: 'm2' }],
        'https://graph.microsoft.com/v1.0/inbox-page-2',
      );
    }
    return listResponse([{ id: 'm3' }]);
  });

  const messages = await listUnreadInboxMessages(deps);

  assert.deepEqual(
    messages.map((message) => message.id),
    ['m1', 'm2', 'm3'],
  );
  assert.equal(urls.length, 2);
  assert.match(urls[0] ?? '', /\$top=10/);
  assert.match(urls[0] ?? '', /\$orderby=receivedDateTime asc/);
  assert.equal(urls[1], 'https://graph.microsoft.com/v1.0/inbox-page-2');
});

test('inbox polling stops at the page cap and warns', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  const logger = createWarnLogger();
  let call = 0;
  const deps = baseDeps(
    async () => {
      call += 1;
      // Always returns another page, so only the cap can stop the loop.
      return listResponse(
        [{ id: `m${call}` }],
        `https://graph.microsoft.com/v1.0/inbox-next-${call}`,
      );
    },
    { logger },
  );

  const messages = await listUnreadInboxMessages(deps);

  assert.equal(call, GRAPH_INBOX_MAX_PAGES);
  assert.equal(messages.length, GRAPH_INBOX_MAX_PAGES);
  assert.ok(
    logger.warnCalls.some((entry) => /page cap/i.test(entry.message)),
    'expected a page-cap warning',
  );
});

test('attachment listing follows @odata.nextLink across pages', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  let call = 0;
  const deps = baseDeps(async () => {
    call += 1;
    if (call === 1) {
      return listResponse(
        [{ id: 'a1' }, { id: 'a2' }],
        'https://graph.microsoft.com/v1.0/attachments-page-2',
      );
    }
    return listResponse([{ id: 'a3' }]);
  });

  const attachments = await listAttachments('message-1', deps);

  assert.deepEqual(
    attachments.map((attachment) => attachment.id),
    ['a1', 'a2', 'a3'],
  );
  assert.equal(call, 2);
});

test('429 with Retry-After is retried after honoring the delay, then succeeds', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  const logger = createWarnLogger();
  const slept: number[] = [];
  let call = 0;
  const deps = baseDeps(
    async () => {
      call += 1;
      if (call === 1) {
        return graphErrorResponse(429, { 'retry-after': '1' });
      }
      return listResponse([{ id: 'm1' }]);
    },
    {
      logger,
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
  );

  const messages = await listUnreadInboxMessages(deps);

  assert.deepEqual(
    messages.map((message) => message.id),
    ['m1'],
  );
  assert.equal(call, 2);
  assert.deepEqual(slept, [1000]);
  assert.ok(
    logger.warnCalls.some((entry) => /retr/i.test(entry.message)),
    'expected a retry warning',
  );
});

test('non-retryable Graph error fails immediately without retrying', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  const slept: number[] = [];
  let call = 0;
  const deps = baseDeps(
    async () => {
      call += 1;
      return graphErrorResponse(403);
    },
    {
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
  );

  await assert.rejects(() => listUnreadInboxMessages(deps), /status 403/);
  assert.equal(call, 1);
  assert.deepEqual(slept, []);
});

test('markMessageRead still issues exactly one PATCH setting isRead to true', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const deps = baseDeps(async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  });

  await markMessageRead('message-9', deps);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, 'PATCH');
  assert.equal(calls[0]?.init?.body, JSON.stringify({ isRead: true }));
  assert.match(calls[0]?.url ?? '', /\/messages\/message-9$/);
});

test('attachment listing stops at the page cap and warns', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  const logger = createWarnLogger();
  let call = 0;
  const deps = baseDeps(
    async () => {
      call += 1;
      // Always returns another page, so only the cap can stop the loop.
      return listResponse(
        [{ id: `a${call}` }],
        `https://graph.microsoft.com/v1.0/attachments-next-${call}`,
      );
    },
    { logger },
  );

  const attachments = await listAttachments('message-cap', deps);

  assert.equal(call, GRAPH_ATTACHMENT_MAX_PAGES);
  assert.equal(attachments.length, GRAPH_ATTACHMENT_MAX_PAGES);
  assert.ok(
    logger.warnCalls.some((entry) => /page cap/i.test(entry.message)),
    'expected an attachment page-cap warning',
  );
});

test('a persistent 429 stops after the retry bound and then throws', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  const slept: number[] = [];
  let call = 0;
  const deps = baseDeps(
    async () => {
      call += 1;
      return graphErrorResponse(429, { 'retry-after': '1' });
    },
    {
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
  );

  await assert.rejects(() => listUnreadInboxMessages(deps), /status 429/);
  // One initial attempt + GRAPH_REQUEST_MAX_RETRIES retries, then it gives up.
  assert.equal(call, GRAPH_REQUEST_MAX_RETRIES + 1);
  assert.equal(slept.length, GRAPH_REQUEST_MAX_RETRIES);
});

test('a non-HTTPS nextLink is rejected without a second fetch or token request', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  let fetchCalls = 0;
  let tokenCalls = 0;
  const deps = baseDeps(
    async () => {
      fetchCalls += 1;
      return listResponse(
        [{ id: 'm1' }],
        'http://graph.microsoft.com/v1.0/inbox-page-2',
      );
    },
    {
      getAccessToken: async () => {
        tokenCalls += 1;
        return 'test-access-token';
      },
    },
  );

  await assert.rejects(
    () => listUnreadInboxMessages(deps),
    /Refusing to call a non-Microsoft-Graph URL/,
  );
  // Only the first (app-built) page is fetched; the unsafe nextLink is not.
  assert.equal(fetchCalls, 1);
  // No access token is requested for the rejected nextLink.
  assert.equal(tokenCalls, 1);
});

test('a nextLink pointing at a foreign host is rejected without a second fetch or token request', async (t) => {
  overrideEnv(t, { microsoftGraphSenderMailbox: 'intake@example.test' });

  let fetchCalls = 0;
  let tokenCalls = 0;
  const deps = baseDeps(
    async () => {
      fetchCalls += 1;
      return listResponse(
        [{ id: 'm1' }],
        'https://evil.example/v1.0/steal-token',
      );
    },
    {
      getAccessToken: async () => {
        tokenCalls += 1;
        return 'test-access-token';
      },
    },
  );

  await assert.rejects(
    () => listUnreadInboxMessages(deps),
    /Refusing to call a non-Microsoft-Graph URL/,
  );
  assert.equal(fetchCalls, 1);
  assert.equal(tokenCalls, 1);
});
