import assert from 'node:assert/strict';
import test from 'node:test';

import { env } from '../../config/env';
import type { NormalizedEmailAttachment } from '../../email/inbound/types';
import {
  autoReplyAccountOpeningForm,
  isInternalAmbeSender,
  masterProfileToDocxValues,
} from '../autoReply';

function docxAttachment(
  overrides: Partial<NormalizedEmailAttachment> = {},
): NormalizedEmailAttachment {
  return {
    fileType: 'UNKNOWN',
    fileName: 'account opening form.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('PK fake docx'),
    size: 12,
    contentId: null,
    disposition: 'attachment',
    graphAttachmentId: null,
    ...overrides,
  };
}

async function withAutoReplyEnabled(fn: () => Promise<void>): Promise<void> {
  const previous = env.accountOpeningAutoReplyEnabled;
  (
    env as { accountOpeningAutoReplyEnabled: boolean }
  ).accountOpeningAutoReplyEnabled = true;
  try {
    await fn();
  } finally {
    (
      env as { accountOpeningAutoReplyEnabled: boolean }
    ).accountOpeningAutoReplyEnabled = previous;
  }
}

const sentDraft = (recipients: string[]) =>
  ({
    fill: { status: 'FILLED_FOR_REVIEW' },
    email: {
      status: 'SENT',
      note: 'ok',
      recipients,
      attachmentNames: [],
      attemptedAt: new Date('2026-06-19T00:00:00.000Z'),
    },
  }) as never;

test('isInternalAmbeSender matches the internal domain only', () => {
  assert.equal(isInternalAmbeSender('sandeep@ambemedical.com'), true);
  assert.equal(isInternalAmbeSender('SANDEEP@AmbeMedical.com'), true);
  assert.equal(isInternalAmbeSender('forms@supplier.co.uk'), false);
  assert.equal(isInternalAmbeSender('not-an-email'), false);
});

test('autoReplyAccountOpeningForm is a no-op when disabled (default)', async () => {
  const result = await autoReplyAccountOpeningForm({
    caseId: 'case-1',
    senderEmail: 'sandeep@ambemedical.com',
    attachments: [docxAttachment()],
  });
  assert.equal(result.status, 'SKIPPED_DISABLED');
});

test('autoReplyAccountOpeningForm never replies to an external sender', async () => {
  await withAutoReplyEnabled(async () => {
    let called = false;
    const result = await autoReplyAccountOpeningForm(
      {
        caseId: 'case-1',
        senderEmail: 'forms@supplier.co.uk',
        attachments: [docxAttachment()],
      },
      {
        emailReviewDraft: async () => {
          called = true;
          return sentDraft(['forms@supplier.co.uk']);
        },
      },
    );
    assert.equal(result.status, 'SKIPPED_EXTERNAL_SENDER');
    assert.equal(called, false, 'must not email an external/supplier sender');
  });
});

test('autoReplyAccountOpeningForm replies to an internal sender and records an audit event', async () => {
  await withAutoReplyEnabled(async () => {
    const calls: Array<{ recipients: string[]; fileName: string }> = [];
    const events: Array<{ caseId: string; status: string }> = [];
    const result = await autoReplyAccountOpeningForm(
      {
        caseId: 'case-1',
        senderEmail: 'sandeep@ambemedical.com',
        attachments: [docxAttachment()],
        supplierName: 'Test Supplier',
      },
      {
        values: { legalCompanyName: 'AMBE LTD' },
        alreadyReplied: async () => false,
        recordReplyEvent: async (e) =>
          void events.push({ caseId: e.caseId, status: e.status }),
        emailReviewDraft: async (input) => {
          calls.push({
            recipients: input.recipients,
            fileName: input.fileName,
          });
          return sentDraft(input.recipients);
        },
      },
    );
    assert.equal(result.status, 'SENT');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.recipients, ['sandeep@ambemedical.com']);
    assert.equal(calls[0]?.fileName, 'account opening form.docx');
    // Audit/idempotency event recorded exactly once on success.
    assert.deepEqual(events, [{ caseId: 'case-1', status: 'SENT' }]);
  });
});

test('autoReplyAccountOpeningForm does not reply twice for the same case', async () => {
  await withAutoReplyEnabled(async () => {
    let sendCalled = false;
    let eventRecorded = false;
    const result = await autoReplyAccountOpeningForm(
      {
        caseId: 'case-1',
        senderEmail: 'sandeep@ambemedical.com',
        attachments: [docxAttachment()],
      },
      {
        alreadyReplied: async () => true, // a reply already exists for this case
        recordReplyEvent: async () => {
          eventRecorded = true;
        },
        emailReviewDraft: async () => {
          sendCalled = true;
          return sentDraft(['sandeep@ambemedical.com']);
        },
      },
    );
    assert.equal(result.status, 'SKIPPED_ALREADY_REPLIED');
    assert.equal(
      sendCalled,
      false,
      'must not re-send for an already-replied case',
    );
    assert.equal(eventRecorded, false);
  });
});

test('autoReplyAccountOpeningForm skips when there is no PDF/Word form attached', async () => {
  await withAutoReplyEnabled(async () => {
    const result = await autoReplyAccountOpeningForm(
      {
        caseId: 'case-1',
        senderEmail: 'sandeep@ambemedical.com',
        attachments: [
          docxAttachment({
            fileName: 'price-list.xlsx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
      },
      {
        emailReviewDraft: async () => {
          throw new Error('should not be called when no form is present');
        },
      },
    );
    assert.equal(result.status, 'SKIPPED_NO_FORM');
  });
});

test('masterProfileToDocxValues maps env profile values and drops "To be confirmed"', () => {
  const e = env as Record<string, unknown>;
  const snap = {
    legal: e.accountOpeningProfileLegalCompanyName,
    name: e.accountOpeningProfileMainContactName,
    email: e.accountOpeningProfileMainContactEmail,
  };
  try {
    // Unset profile field => masterProfile yields "To be confirmed" => dropped.
    e.accountOpeningProfileLegalCompanyName = '';
    assert.equal(masterProfileToDocxValues().legalCompanyName, undefined);

    // Populated fields are mapped (main contact => director block).
    e.accountOpeningProfileLegalCompanyName = 'AMBE LTD';
    e.accountOpeningProfileMainContactName = 'Aman Dhillon';
    e.accountOpeningProfileMainContactEmail = 'aman@ambemedical.com';
    const values = masterProfileToDocxValues();
    assert.equal(values.legalCompanyName, 'AMBE LTD');
    assert.equal(values.director?.name, 'Aman Dhillon');
    assert.equal(values.director?.email, 'aman@ambemedical.com');
  } finally {
    e.accountOpeningProfileLegalCompanyName = snap.legal;
    e.accountOpeningProfileMainContactName = snap.name;
    e.accountOpeningProfileMainContactEmail = snap.email;
  }
});

test('masterProfileToDocxValues maps the enriched profile (sales, regulator, dates)', () => {
  const e = env as Record<string, unknown>;
  const keys = [
    'accountOpeningProfileSalesName',
    'accountOpeningProfileSalesEmail',
    'accountOpeningProfileRegulatoryAuthority',
    'accountOpeningProfileDateStartedTrading',
  ];
  const snap = Object.fromEntries(keys.map((k) => [k, e[k]]));
  try {
    e.accountOpeningProfileSalesName = 'Aman Dhillon';
    e.accountOpeningProfileSalesEmail = 'info@ambemedical.com';
    e.accountOpeningProfileRegulatoryAuthority = 'MHRA';
    e.accountOpeningProfileDateStartedTrading = '1999';
    const v = masterProfileToDocxValues();
    assert.equal(v.sales?.name, 'Aman Dhillon');
    assert.equal(v.sales?.email, 'info@ambemedical.com');
    assert.equal(v.regulatoryAuthority, 'MHRA');
    assert.equal(v.dateStartedTrading, '1999');
  } finally {
    for (const k of keys) e[k] = snap[k];
  }
});
