import assert from 'node:assert/strict';
import test from 'node:test';

import { env } from '../../config/env';
import type { NormalizedEmailAttachment } from '../../email/inbound/types';
import {
  autoReplyAccountOpeningForm,
  isInternalAmbeSender,
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

test('autoReplyAccountOpeningForm replies to an internal sender with the filled form', async () => {
  await withAutoReplyEnabled(async () => {
    const calls: Array<{ recipients: string[]; fileName: string }> = [];
    const result = await autoReplyAccountOpeningForm(
      {
        senderEmail: 'sandeep@ambemedical.com',
        attachments: [docxAttachment()],
        supplierName: 'Test Supplier',
      },
      {
        values: { legalCompanyName: 'AMBE LTD' },
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
  });
});

test('autoReplyAccountOpeningForm skips when there is no PDF/Word form attached', async () => {
  await withAutoReplyEnabled(async () => {
    const result = await autoReplyAccountOpeningForm(
      {
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
