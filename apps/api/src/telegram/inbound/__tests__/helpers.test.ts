import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSenderDisplayName,
  extractAttachment,
  inferImportDecision,
  isAllowedTelegramSenderForLists,
} from '../helpers';

test('infers supplier price list import from filename', () => {
  const decision = inferImportDecision({
    fileType: 'CSV',
    fileName: 'supplier-price-list.csv',
    caption: null,
  });

  assert.equal(decision.inferredImportType, 'supplier-price-list');
  assert.equal(decision.processingStatus, 'RECEIVED');
});

test('infers inventory import from caption', () => {
  const decision = inferImportDecision({
    fileType: 'XLSX',
    fileName: 'weekly-data.xlsx',
    caption: 'current stock export',
  });

  assert.equal(decision.inferredImportType, 'inventory');
  assert.equal(decision.processingStatus, 'RECEIVED');
});

test('marks images for review', () => {
  const decision = inferImportDecision({
    fileType: 'IMAGE',
    fileName: 'photo.jpg',
    caption: 'supplier quote',
  });

  assert.equal(decision.inferredImportType, null);
  assert.equal(decision.processingStatus, 'REVIEW_REQUIRED');
});

test('extracts document attachment metadata', () => {
  const attachment = extractAttachment({
    message_id: 1,
    chat: { id: 10, type: 'private' },
    document: {
      file_id: 'file-1',
      file_unique_id: 'unique-1',
      file_name: 'sales.csv',
      mime_type: 'text/csv',
      file_size: 123,
    },
  });

  assert.ok(attachment);
  assert.equal(attachment?.fileType, 'CSV');
  assert.equal(attachment?.telegramFileId, 'file-1');
});

test('builds sender display name from available user fields', () => {
  const name = buildSenderDisplayName({
    message_id: 1,
    chat: { id: 10, type: 'private' },
    from: {
      id: 20,
      first_name: 'Jane',
      last_name: 'Doe',
      username: 'jdoe',
    },
  });

  assert.equal(name, 'Jane Doe @jdoe');
});

test('allows senders present in configured allowlists', () => {
  assert.equal(
    isAllowedTelegramSenderForLists(
      {
        telegramUserId: '123',
        telegramChatId: '999',
      },
      ['123'],
      [],
    ),
    true,
  );

  assert.equal(
    isAllowedTelegramSenderForLists(
      {
        telegramUserId: null,
        telegramChatId: '999',
      },
      [],
      ['999'],
    ),
    true,
  );

  assert.equal(
    isAllowedTelegramSenderForLists(
      {
        telegramUserId: '111',
        telegramChatId: '222',
      },
      ['123'],
      ['999'],
    ),
    false,
  );
});
