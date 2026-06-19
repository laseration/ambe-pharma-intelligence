import assert from 'node:assert/strict';
import test from 'node:test';

import { env } from '../../config/env';
import type { AccountOpeningUnifiedFillResult } from '../formFill';
import {
  buildAccountOpeningReviewEmailBody,
  sendAccountOpeningReviewEmail,
  type AccountOpeningReviewEmailAttachment,
} from '../reviewEmail';

function smallAttachment(): AccountOpeningReviewEmailAttachment {
  return {
    fileName: 'draft.pdf',
    contentType: 'application/pdf',
    content: Buffer.from('pdfbytes'),
  };
}

async function withEmailConfigured(fn: () => Promise<void>): Promise<void> {
  const e = env as Record<string, unknown>;
  const snap = {
    emailAlertsEnabled: e.emailAlertsEnabled,
    microsoftMailTenantId: e.microsoftMailTenantId,
    microsoftMailClientId: e.microsoftMailClientId,
    microsoftMailClientSecret: e.microsoftMailClientSecret,
    microsoftGraphSenderMailbox: e.microsoftGraphSenderMailbox,
  };
  e.emailAlertsEnabled = true;
  e.microsoftMailTenantId = 'tenant';
  e.microsoftMailClientId = 'client';
  e.microsoftMailClientSecret = 'secret';
  e.microsoftGraphSenderMailbox = 'yash@ambemedical.com';
  try {
    await fn();
  } finally {
    Object.assign(e, snap);
  }
}

function fillResult(
  overrides: Partial<AccountOpeningUnifiedFillResult> = {},
): AccountOpeningUnifiedFillResult {
  return {
    format: 'DOCX',
    filledBytes: null,
    filledContentType: null,
    filledFileSuffix: '.docx',
    filledCount: 0,
    blankCount: 0,
    filledFields: [],
    blankFields: [],
    warnings: [],
    ...overrides,
  };
}

test('review email body labels a real fill as a review draft', () => {
  const body = buildAccountOpeningReviewEmailBody(
    'form.docx',
    'Acme Pharma',
    fillResult({
      filledCount: 1,
      filledFields: [
        { section: null, label: 'COMPANY NAME', value: 'AMBE LTD' },
      ],
    }),
  );
  assert.match(body, /REVIEW DRAFT/);
  assert.match(body, /Auto-filled \(1\)/);
  assert.match(body, /COMPANY NAME: AMBE LTD/);
});

test('review email body is honest when nothing was auto-filled', () => {
  const body = buildAccountOpeningReviewEmailBody(
    'form.docx',
    null,
    fillResult({ filledCount: 0 }),
  );
  assert.match(body, /COULD NOT AUTO-FILL/);
  // Must NOT claim it filled anything.
  assert.doesNotMatch(body, /has filled the safe fields/);
  assert.doesNotMatch(body, /Auto-filled \(0\)/);
});

test('sendAccountOpeningReviewEmail skips when outbound email is not configured', async () => {
  const result = await sendAccountOpeningReviewEmail({
    recipients: ['sandeep@ambemedical.com'],
    subject: 's',
    bodyText: 'b',
    attachments: [smallAttachment()],
  });
  assert.equal(result.status, 'SKIPPED_DISABLED');
});

test('sendAccountOpeningReviewEmail requires at least one recipient', async () => {
  await withEmailConfigured(async () => {
    const result = await sendAccountOpeningReviewEmail(
      {
        recipients: [],
        subject: 's',
        bodyText: 'b',
        attachments: [smallAttachment()],
      },
      { getAccessToken: async () => 'tok' },
    );
    assert.equal(result.status, 'NO_RECIPIENTS');
  });
});

test('sendAccountOpeningReviewEmail rejects an oversized attachment', async () => {
  await withEmailConfigured(async () => {
    const big: AccountOpeningReviewEmailAttachment = {
      fileName: 'big.pdf',
      contentType: 'application/pdf',
      content: Buffer.alloc(3 * 1024 * 1024 + 1),
    };
    const result = await sendAccountOpeningReviewEmail(
      {
        recipients: ['sandeep@ambemedical.com'],
        subject: 's',
        bodyText: 'b',
        attachments: [big],
      },
      { getAccessToken: async () => 'tok' },
    );
    assert.equal(result.status, 'ATTACHMENT_TOO_LARGE');
  });
});

test('sendAccountOpeningReviewEmail posts a Graph message and returns SENT', async () => {
  await withEmailConfigured(async () => {
    let captured: { message: Record<string, any> } | null = null;
    const fakeFetch = (async (_url: string, init: { body: string }) => {
      captured = JSON.parse(init.body);
      return { ok: true, status: 202, text: async () => '' };
    }) as unknown as typeof fetch;

    const result = await sendAccountOpeningReviewEmail(
      {
        recipients: ['sandeep@ambemedical.com'],
        subject: 'Subj',
        bodyText: 'Body',
        attachments: [smallAttachment()],
      },
      { getAccessToken: async () => 'tok', fetchImpl: fakeFetch },
    );

    assert.equal(result.status, 'SENT');
    const message = captured!.message;
    assert.equal(message.subject, 'Subj');
    assert.deepEqual(message.toRecipients, [
      { emailAddress: { address: 'sandeep@ambemedical.com' } },
    ]);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].name, 'draft.pdf');
    assert.ok(message.attachments[0].contentBytes.length > 0);
  });
});

test('sendAccountOpeningReviewEmail returns FAILED on a non-2xx Graph response', async () => {
  await withEmailConfigured(async () => {
    const fakeFetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    })) as unknown as typeof fetch;

    const result = await sendAccountOpeningReviewEmail(
      {
        recipients: ['sandeep@ambemedical.com'],
        subject: 's',
        bodyText: 'b',
        attachments: [smallAttachment()],
      },
      { getAccessToken: async () => 'tok', fetchImpl: fakeFetch },
    );
    assert.equal(result.status, 'FAILED');
    assert.match(result.note, /403|Forbidden/);
  });
});

test('review email body warns when most fields were not recognised', () => {
  const blankFields = Array.from({ length: 8 }, (_, i) => ({
    section: null,
    label: `X${i}`,
    reason: 'UNRECOGNISED_FIELD',
  }));
  const body = buildAccountOpeningReviewEmailBody(
    'weird-layout.docx',
    null,
    fillResult({
      filledCount: 2,
      filledFields: [
        { section: null, label: 'COMPANY NAME', value: 'AMBE LTD' },
        { section: null, label: 'VAT NUMBER', value: 'GB1' },
      ],
      blankFields,
    }),
  );
  assert.match(body, /not recognised/);
  assert.match(body, /layout may be non-standard/);
});

test('review email body does not warn on a clean fill', () => {
  const body = buildAccountOpeningReviewEmailBody(
    'form.docx',
    null,
    fillResult({
      filledCount: 5,
      filledFields: Array.from({ length: 5 }, (_, i) => ({
        section: null,
        label: `F${i}`,
        value: 'v',
      })),
      blankFields: [
        { section: null, label: 'SORT CODE', reason: 'POLICY_MUST_STAY_BLANK' },
      ],
    }),
  );
  assert.doesNotMatch(body, /not recognised/);
});
