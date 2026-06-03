import assert from 'node:assert/strict';
import test from 'node:test';

import {
  redactEmailAddress,
  redactSafeOutputString,
  sanitizeSafeErrorMessage,
  sanitizeSafeOutputRecord,
} from '../redaction';

test('redacts common secret-like strings while preserving safe debugging labels', () => {
  const cases = [
    {
      label: 'postgres URL',
      input:
        'DATABASE_URL=postgresql://fake_user:fake_password@ep-fake.eu-west-2.aws.neon.tech/ambe_ci?sslmode=require',
      forbidden: [
        'postgresql://',
        'fake_user',
        'fake_password',
        'sslmode=require',
      ],
    },
    {
      label: 'bearer token',
      input: 'Authorization: Bearer fake.access.token.canary',
      forbidden: ['fake.access.token.canary'],
    },
    {
      label: 'refresh token',
      input: 'refresh_token=fake-refresh-token-canary',
      forbidden: ['fake-refresh-token-canary'],
    },
    {
      label: 'Microsoft client secret',
      input: 'client_secret=fake-microsoft-client-secret-canary',
      forbidden: ['fake-microsoft-client-secret-canary'],
    },
    {
      label: 'OpenAI-like key',
      input: 'OPENAI_API_KEY=sk-fake-redaction-canary',
      forbidden: ['sk-fake-redaction-canary'],
    },
    {
      label: 'Telegram bot token',
      input: 'TELEGRAM_BOT_TOKEN=bot12345678901234567890:fake-canary',
      forbidden: ['12345678901234567890:fake-canary'],
    },
    {
      label: 'raw body field',
      input: 'bodyText=Supplier email body with private quote content',
      forbidden: ['Supplier email body', 'private quote content'],
    },
    {
      label: 'email address',
      input: 'from=pricing.person@supplier.example',
      forbidden: ['pricing.person@supplier.example'],
    },
  ];

  for (const item of cases) {
    const redacted = redactSafeOutputString(item.input);

    for (const forbidden of item.forbidden) {
      assert.doesNotMatch(
        redacted,
        new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        item.label,
      );
    }

    assert.match(redacted, /\[redacted\]|\*\*\*@|bot\[redacted\]/);
  }
});

test('sanitizes structured diagnostic records without losing useful metadata', () => {
  const sanitized = sanitizeSafeOutputRecord({
    requestId: 'req-123',
    code: 'GRAPH_RATE_LIMITED',
    statusCode: 429,
    nextAction: 'Retry after the configured cooldown.',
    databaseUrl: 'postgresql://fake_user:fake_password@localhost:5432/ambe_ci',
    graphPayload: {
      access_token: 'fake-access-token-canary',
      body: {
        content: 'raw Graph message body',
      },
    },
    telegramPayload: {
      message: {
        text: 'raw Telegram update text',
      },
    },
    attachmentContent: 'raw attachment contents',
    sender: 'buyer.person@customer.example',
  });
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.requestId, 'req-123');
  assert.equal(sanitized.code, 'GRAPH_RATE_LIMITED');
  assert.equal(sanitized.statusCode, 429);
  assert.equal(sanitized.nextAction, 'Retry after the configured cooldown.');
  assert.equal(sanitized.databaseUrl, '[redacted]');
  assert.equal(sanitized.graphPayload, '[redacted]');
  assert.equal(sanitized.telegramPayload, '[redacted]');
  assert.equal(sanitized.attachmentContent, '[redacted]');
  assert.equal(sanitized.sender, '***@customer.example');
  assert.doesNotMatch(serialized, /fake_user|fake_password/);
  assert.doesNotMatch(serialized, /fake-access-token-canary/);
  assert.doesNotMatch(serialized, /raw Graph message body/);
  assert.doesNotMatch(serialized, /raw Telegram update text/);
  assert.doesNotMatch(serialized, /raw attachment contents/);
  assert.doesNotMatch(serialized, /buyer\.person@customer\.example/);
});

test('safe error messages are redacted and bounded for worker and CLI output', () => {
  const error = new Error(
    [
      'Graph failure',
      'Authorization: Bearer fake.access.token.canary',
      'postgresql://fake_user:fake_password@db.example.test/ambe',
      'bodyText=full supplier quote body',
      'x'.repeat(1000),
    ].join(' '),
  );

  const message = sanitizeSafeErrorMessage(error);

  assert.match(message, /Graph failure/);
  assert.ok(message.length <= 500);
  assert.doesNotMatch(message, /fake\.access\.token\.canary/);
  assert.doesNotMatch(message, /postgresql:\/\//);
  assert.doesNotMatch(message, /full supplier quote body/);
});

test('email address redaction keeps only the domain when useful', () => {
  assert.equal(
    redactEmailAddress('Pricing.Person@Supplier.Example'),
    '***@supplier.example',
  );
  assert.equal(redactEmailAddress('not-an-email'), '[redacted-email]');
});
