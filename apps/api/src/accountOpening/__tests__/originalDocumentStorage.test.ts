import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAccountOpeningOriginalDocumentRecord,
  shouldUploadAccountOpeningOriginal,
} from '../originalDocumentStorage';

describe('account-opening original document storage safety', () => {
  it('builds stable idempotency fingerprints from immutable message and attachment identity', () => {
    const first = buildAccountOpeningOriginalDocumentRecord({
      immutableMessageId: 'immutable-message-1',
      internetMessageId: '<internet-1@example.test>',
      graphAttachmentId: 'attachment-1',
      fileName: 'account-opening.pdf',
      mimeType: 'application/pdf',
      sizeBytes: null,
      bytes: Buffer.from('pdf bytes'),
    });
    const replay = buildAccountOpeningOriginalDocumentRecord({
      immutableMessageId: 'immutable-message-1',
      internetMessageId: '<internet-1@example.test>',
      graphAttachmentId: 'attachment-1',
      fileName: 'account-opening.pdf',
      mimeType: 'application/pdf',
      sizeBytes: null,
      bytes: Buffer.from('pdf bytes'),
    });

    assert.equal(first.sourceFingerprint, replay.sourceFingerprint);
    assert.equal(first.sha256, replay.sha256);
    assert.equal(first.uploadStatus, 'PENDING');
  });

  it('refuses upload for mixed or unsafe classifier decisions', () => {
    const decision = shouldUploadAccountOpeningOriginal({
      classifierSafeToRoute: false,
      primaryClass: 'UNKNOWN_OR_AMBIGUOUS',
      conflicts: ['ACCOUNT_OPENING_FORM vs SUPPLIER_PRICE_LIST'],
      uploadEnabled: true,
      hasStorageConfig: true,
    });

    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /requires high-confidence account-opening/i);
  });

  it('allows upload only for configured high-confidence account-opening originals', () => {
    const decision = shouldUploadAccountOpeningOriginal({
      classifierSafeToRoute: true,
      primaryClass: 'ACCOUNT_OPENING_FORM',
      conflicts: [],
      uploadEnabled: true,
      hasStorageConfig: true,
    });

    assert.equal(decision.allowed, true);
    assert.match(decision.reason, /internally uploaded/i);
  });
});
