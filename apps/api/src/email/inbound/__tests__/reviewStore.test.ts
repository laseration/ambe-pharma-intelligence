import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_EMAIL_REVIEW_ITEMS,
  listStoredEmailReviewItems,
  recordEmailReviewItems,
  resetEmailReviewStore,
} from '../reviewStore';

function buildReviewItem(overrides?: Partial<Parameters<typeof recordEmailReviewItems>[0][number]>) {
  return {
    processingStatus: 'NEEDS_REVIEW' as const,
    inferredImportType: null,
    confidence: 'LOW' as const,
    reason: 'Queued for review.',
    fileType: 'CSV' as const,
    attachment: {
      fileName: 'data.csv',
      mimeType: 'text/csv',
      size: 100,
      contentId: null,
      disposition: null,
    },
    email: {
      messageId: 'email-1',
      from: 'ops@ambe.test',
      subject: 'Data file',
      bodyText: 'Please review.',
    },
    ...overrides,
  };
}

test('newest email review items appear first', () => {
  resetEmailReviewStore();

  recordEmailReviewItems([buildReviewItem({ email: { messageId: 'older', from: 'ops@ambe.test', subject: 'Older', bodyText: 'Older' } })], new Date('2026-04-19T10:00:00.000Z'));
  recordEmailReviewItems([buildReviewItem({ email: { messageId: 'newer', from: 'ops@ambe.test', subject: 'Newer', bodyText: 'Newer' }, attachment: { fileName: 'newer.csv', mimeType: 'text/csv', size: 10, contentId: null, disposition: null } })], new Date('2026-04-19T11:00:00.000Z'));

  const items = listStoredEmailReviewItems();

  assert.equal(items[0]?.email.messageId, 'newer');
  assert.equal(items[1]?.email.messageId, 'older');
});

test('duplicate email review items are updated instead of accumulated', () => {
  resetEmailReviewStore();

  const firstSeen = new Date('2026-04-19T10:00:00.000Z');
  const secondSeen = new Date('2026-04-19T11:00:00.000Z');

  recordEmailReviewItems([buildReviewItem()], firstSeen);
  recordEmailReviewItems([buildReviewItem({ reason: 'Still needs review.' })], secondSeen);

  const items = listStoredEmailReviewItems();

  assert.equal(items.length, 1);
  assert.equal(items[0]?.createdAt.toISOString(), firstSeen.toISOString());
  assert.equal(items[0]?.updatedAt.toISOString(), secondSeen.toISOString());
  assert.equal(items[0]?.reason, 'Still needs review.');
  assert.match(items[0]?.id ?? '', /^email-review-/);
});

test('email review store does not grow without bound', () => {
  resetEmailReviewStore();

  for (let index = 0; index < MAX_EMAIL_REVIEW_ITEMS + 5; index += 1) {
    recordEmailReviewItems(
      [
        buildReviewItem({
          email: {
            messageId: `email-${index}`,
            from: 'ops@ambe.test',
            subject: `File ${index}`,
            bodyText: 'Please review.',
          },
          attachment: {
            fileName: `file-${index}.csv`,
            mimeType: 'text/csv',
            size: index,
            contentId: null,
            disposition: null,
          },
        }),
      ],
      new Date(`2026-04-19T10:${String(index % 60).padStart(2, '0')}:00.000Z`),
    );
  }

  const items = listStoredEmailReviewItems();

  assert.equal(items.length, MAX_EMAIL_REVIEW_ITEMS);
  assert.equal(items.some((item) => item.email.messageId === 'email-0'), false);
});
