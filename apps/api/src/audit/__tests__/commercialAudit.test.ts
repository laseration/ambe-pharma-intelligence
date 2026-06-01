import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCommercialAuditMetadata } from '../commercialAudit';

test('commercial audit metadata preserves safe context and redacts sensitive fields', () => {
  const metadata = buildCommercialAuditMetadata(
    {
      entityType: 'BUY_DECISION',
      entityId: 'decision-1',
      action: 'APPROVED',
      approvalStatus: {
        previous: 'PENDING_APPROVAL',
        next: 'APPROVED',
      },
      source: {
        inboundEmailId: 'email-1',
        emailDerivedOfferId: 'offer-1',
        sourceKind: 'STRICT_BODY_MAIN',
      },
      confidence: {
        promotionConfidence: 72,
      },
    },
    {
      sideEffectOperation: 'REVIEW_QUEUE_APPROVE_TO_BUY',
      sourceBlockText: 'Raw supplier email text should not be copied here.',
      nested: {
        accessToken: 'secret-token',
        safeValue: 'kept',
      },
    },
  );

  assert.equal(metadata.sideEffectOperation, 'REVIEW_QUEUE_APPROVE_TO_BUY');
  assert.equal(metadata.sourceBlockText, '[redacted]');
  assert.deepEqual(metadata.nested, {
    accessToken: '[redacted]',
    safeValue: 'kept',
  });
  assert.deepEqual(metadata.commercialAudit, {
    entityType: 'BUY_DECISION',
    entityId: 'decision-1',
    action: 'APPROVED',
    approvalStatus: {
      previous: 'PENDING_APPROVAL',
      next: 'APPROVED',
    },
    source: {
      inboundEmailId: 'email-1',
      emailDerivedOfferId: 'offer-1',
      sourceKind: 'STRICT_BODY_MAIN',
    },
    confidence: {
      promotionConfidence: 72,
    },
  });
});
