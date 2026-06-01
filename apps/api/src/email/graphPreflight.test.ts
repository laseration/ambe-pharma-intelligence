import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { env } from '../config/env';
import {
  buildGraphMailDryRunMessageSummary,
  createGraphMailDryRunService,
  getGraphMailPreflightStatus,
} from './graphPreflight';

function overrideEnv(context: TestContext, overrides: Partial<typeof env>) {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, env[key as keyof typeof env]]),
  ) as Partial<typeof env>;

  Object.assign(env, overrides);
  context.after(() => {
    Object.assign(env, snapshot);
  });
}

function graphResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test('Graph mail preflight reports missing credentials safely', (t) => {
  overrideEnv(t, {
    microsoftMailTenantId: '',
    microsoftMailClientId: '',
    microsoftMailClientSecret: '',
    microsoftGraphRefreshToken: '',
    microsoftGraphSenderMailbox: '',
    microsoftMailCredentialSource: 'missing',
    emailInboundPollingEnabled: false,
    emailInboundAllowedSenders: [],
    emailInboundSupplierMappings: [],
  });

  const status = getGraphMailPreflightStatus();
  const serialized = JSON.stringify(status);

  assert.equal(status.graphConfigured, false);
  assert.equal(status.mailboxConfigured, false);
  assert.equal(status.credentialSource, 'missing');
  assert.equal(status.credentialMode, 'missing');
  assert.equal(status.dryRunSafe, false);
  assert.equal(status.allowedSenderCount, 0);
  assert.match(status.warnings.join(' '), /not configured/i);
  assert.doesNotMatch(serialized, /secret-value|password-value|access-token/i);
});

test('Graph mail preflight reports dry-run readiness and polling warning', (t) => {
  overrideEnv(t, {
    microsoftMailTenantId: 'tenant-secret',
    microsoftMailClientId: 'client-secret',
    microsoftMailClientSecret: 'client-secret-value',
    microsoftGraphRefreshToken: '',
    microsoftGraphSenderMailbox: 'supplier-intake@example.test',
    microsoftMailCredentialSource: 'mail-specific',
    emailInboundPollingEnabled: true,
    emailInboundAllowedSenders: ['supplier.example'],
    emailInboundSupplierMappings: [
      {
        pattern: 'supplier.example',
        supplierName: 'Supplier Example',
      },
    ],
  });

  const status = getGraphMailPreflightStatus();
  const serialized = JSON.stringify(status);

  assert.equal(status.graphConfigured, true);
  assert.equal(status.mailboxConfigured, true);
  assert.equal(status.mailbox, 'supplier-intake@example.test');
  assert.equal(status.credentialSource, 'mail-specific');
  assert.equal(status.credentialMode, 'client-secret');
  assert.equal(status.pollingEnabled, true);
  assert.equal(status.allowedSenderConfigured, true);
  assert.equal(status.allowedSenderCount, 1);
  assert.equal(status.supplierMappingCount, 1);
  assert.equal(status.dryRunSafe, false);
  assert.match(status.warnings.join(' '), /polling/i);
  assert.doesNotMatch(serialized, /client-secret-value/);
  assert.doesNotMatch(serialized, /tenant-secret/);
});

test('Graph dry-run fails safely before live call when credentials are missing', async (t) => {
  overrideEnv(t, {
    microsoftMailTenantId: '',
    microsoftMailClientId: '',
    microsoftMailClientSecret: '',
    microsoftGraphRefreshToken: '',
    microsoftGraphSenderMailbox: '',
    emailInboundPollingEnabled: false,
  });

  let fetchCalls = 0;
  const service = createGraphMailDryRunService({
    getAccessToken: async () => 'token-should-not-be-used',
    fetchImpl: async () => {
      fetchCalls += 1;
      return graphResponse({ value: [] });
    },
  });

  await assert.rejects(() => service.runDryRun(), /not fully configured/i);
  assert.equal(fetchCalls, 0);
});

test('Graph dry-run lists redacted unread summaries without mutating or ingesting', async (t) => {
  overrideEnv(t, {
    microsoftMailTenantId: 'tenant',
    microsoftMailClientId: 'client',
    microsoftMailClientSecret: 'client-secret-value',
    microsoftGraphRefreshToken: '',
    microsoftGraphSenderMailbox: 'supplier-intake@example.test',
    microsoftMailCredentialSource: 'mail-specific',
    emailInboundPollingEnabled: false,
    emailInboundAllowedSenders: ['supplier.example'],
    emailInboundSupplierMappings: [],
    graphUseImmutableIds: true,
  });

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let markReadCalls = 0;
  let ingestCalls = 0;
  const service = createGraphMailDryRunService({
    getAccessToken: async () => 'access-token-secret',
    markMessageRead: async () => {
      markReadCalls += 1;
    },
    ingestInboundEmail: async () => {
      ingestCalls += 1;
      return {
        ignored: false,
        items: [],
      };
    },
    now: () => new Date('2026-06-01T12:00:00.000Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });

      assert.equal(init?.method, 'GET');
      assert.equal(init?.body, undefined);

      if (String(url).includes('/attachments')) {
        assert.match(String(url), /\$select=id/);
        assert.doesNotMatch(String(url), /contentBytes/i);
        return graphResponse({
          value: [{ id: 'attachment-1' }, { id: 'attachment-2' }],
        });
      }

      assert.match(
        String(url),
        /\$select=id,isRead,subject,receivedDateTime,from,sender,hasAttachments/,
      );
      assert.doesNotMatch(String(url), /body/i);
      assert.doesNotMatch(String(url), /internetMessageHeaders/i);

      return graphResponse({
        value: [
          {
            id: 'message-1',
            subject:
              'Supplier quote with a deliberately long subject that should be shortened before display to operators',
            receivedDateTime: '2026-06-01T11:45:00Z',
            from: {
              emailAddress: {
                address: 'alice@supplier.example',
                name: 'Alice Supplier',
              },
            },
            hasAttachments: true,
            body: {
              content: 'this raw body must never appear',
            },
          },
        ],
      });
    },
  });

  const result = await service.runDryRun({ take: 3 });
  const serialized = JSON.stringify(result);

  assert.equal(result.generatedAt, '2026-06-01T12:00:00.000Z');
  assert.equal(result.liveReadOnlyGraphCall, true);
  assert.equal(result.messageCount, 1);
  assert.equal(result.messages[0]?.senderDomain, 'supplier.example');
  assert.equal(result.messages[0]?.senderPreview, '***@supplier.example');
  assert.equal(result.messages[0]?.attachmentCount, 2);
  assert.equal(result.messages[0]?.subjectTruncated, true);
  assert.equal(result.safety.markedRead, false);
  assert.equal(result.safety.ingested, false);
  assert.equal(markReadCalls, 0);
  assert.equal(ingestCalls, 0);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(serialized, /alice@supplier\.example/);
  assert.doesNotMatch(serialized, /Alice Supplier/);
  assert.doesNotMatch(serialized, /raw body/);
  assert.doesNotMatch(serialized, /access-token-secret/);
  assert.doesNotMatch(serialized, /attachment-1/);
});

test('Graph dry-run refuses to run while polling is enabled', async (t) => {
  overrideEnv(t, {
    microsoftMailTenantId: 'tenant',
    microsoftMailClientId: 'client',
    microsoftMailClientSecret: 'client-secret-value',
    microsoftGraphRefreshToken: '',
    microsoftGraphSenderMailbox: 'supplier-intake@example.test',
    emailInboundPollingEnabled: true,
  });

  let fetchCalls = 0;
  const service = createGraphMailDryRunService({
    getAccessToken: async () => 'access-token-secret',
    fetchImpl: async () => {
      fetchCalls += 1;
      return graphResponse({ value: [] });
    },
  });

  await assert.rejects(() => service.runDryRun(), /disable polling/i);
  assert.equal(fetchCalls, 0);
});

test('Graph dry-run message summary redacts sender and never includes body text', () => {
  const summary = buildGraphMailDryRunMessageSummary({
    message: {
      subject: '  Paracetamol offer \n with extra whitespace  ',
      receivedDateTime: '2026-06-01T10:00:00Z',
      from: {
        emailAddress: {
          address: 'pricing@supplier.co.uk',
          name: 'Pricing Team',
        },
      },
      hasAttachments: false,
    },
    messageIndex: 1,
    attachmentCount: 0,
  });

  assert.deepEqual(summary, {
    messageIndex: 1,
    receivedDateTime: '2026-06-01T10:00:00Z',
    senderDomain: 'supplier.co.uk',
    senderPreview: '***@supplier.co.uk',
    subjectPreview: 'Paracetamol offer with extra whitespace',
    subjectTruncated: false,
    hasAttachments: false,
    attachmentCount: 0,
  });
});
