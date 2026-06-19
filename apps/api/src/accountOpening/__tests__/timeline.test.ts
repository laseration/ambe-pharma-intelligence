import assert from 'node:assert/strict';
import test from 'node:test';

import { listAccountOpeningCaseTimeline } from '../service';

test('listAccountOpeningCaseTimeline maps events with safe labels + redacted detail', async () => {
  const entries = await listAccountOpeningCaseTimeline('case-1', {
    loadEvents: async () => [
      {
        id: 'ev-1',
        actionType: 'ACCOUNT_OPENING_AUTO_REPLIED',
        actorType: 'SYSTEM',
        actorIdentifier: 'account-opening-auto-reply',
        note: 'Review draft emailed.',
        metadata: {
          status: 'SENT',
          recipient: 'sandeep@ambemedical.com',
          extractedText: 'SECRET-should-not-leak',
        },
        createdAt: new Date('2026-06-19T10:00:00.000Z'),
      },
      {
        id: 'ev-2',
        actionType: 'DOCUMENT_UPLOADED',
        actorType: 'OPERATOR',
        actorIdentifier: 'op-1',
        note: null,
        metadata: {
          fileName: 'form.docx',
          classification: 'ACCOUNT_OPENING_FORM',
          bankAccountNumber: '12345678',
        },
        createdAt: new Date('2026-06-19T09:00:00.000Z'),
      },
    ],
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.label, 'Auto-reply sent to internal reviewer');
  assert.equal(entries[0]?.detail, 'SENT → sandeep@ambemedical.com');
  assert.equal(entries[0]?.occurredAt, '2026-06-19T10:00:00.000Z');
  assert.equal(entries[1]?.label, 'Document uploaded');
  assert.equal(entries[1]?.detail, 'form.docx · ACCOUNT_OPENING_FORM');

  // The raw metadata (extracted text / bank number) must NEVER surface.
  const serialized = JSON.stringify(entries);
  assert.ok(!serialized.includes('SECRET-should-not-leak'));
  assert.ok(!serialized.includes('12345678'));
});

test('listAccountOpeningCaseTimeline returns [] when there are no events', async () => {
  const entries = await listAccountOpeningCaseTimeline('case-x', {
    loadEvents: async () => [],
  });
  assert.deepEqual(entries, []);
});

test('listAccountOpeningCaseTimeline humanises unknown action types', async () => {
  const entries = await listAccountOpeningCaseTimeline('c', {
    loadEvents: async () => [
      {
        id: 'e',
        actionType: 'SOME_NEW_THING',
        actorType: null,
        actorIdentifier: null,
        note: null,
        metadata: null,
        createdAt: new Date('2026-06-19T00:00:00.000Z'),
      },
    ],
  });
  assert.equal(entries[0]?.label, 'Some new thing');
  assert.equal(entries[0]?.detail, null);
});
