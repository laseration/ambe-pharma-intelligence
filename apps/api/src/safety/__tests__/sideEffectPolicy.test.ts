import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSideEffectAuditMetadata,
  getSideEffectPolicy,
} from '../sideEffectPolicy';

test('side-effect policy describes account-opening completed form filing risk', () => {
  const policy = getSideEffectPolicy(
    'ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM',
  );

  assert.equal(policy.requiredRoleCategory, 'operator');
  assert.equal(policy.writesDatabase, true);
  assert.equal(policy.mayUploadToMicrosoftDrive, true);
  assert.equal(policy.mayCreateOrUpdateBuyDecisions, false);
  assert.equal(policy.mayMarkOrderPlaced, false);
  assert.equal(policy.requiresReviewOrApprovalGate, true);
  assert.equal(policy.supplierFacingSendOrSubmitForbidden, true);
});

test('side-effect policy describes review queue buy and ordered actions', () => {
  const approvePolicy = getSideEffectPolicy('REVIEW_QUEUE_APPROVE_TO_BUY');
  const orderedPolicy = getSideEffectPolicy('REVIEW_QUEUE_MARK_ORDERED');

  assert.equal(approvePolicy.mayCreateOrUpdateBuyDecisions, true);
  assert.equal(approvePolicy.mayMarkOrderPlaced, false);
  assert.equal(orderedPolicy.mayCreateOrUpdateBuyDecisions, true);
  assert.equal(orderedPolicy.mayMarkOrderPlaced, true);
  assert.equal(orderedPolicy.supplierFacingSendOrSubmitForbidden, true);
});

test('side-effect audit metadata keeps caller extras and adds policy summary', () => {
  const metadata = buildSideEffectAuditMetadata('EMAIL_REPROCESS_EXECUTE', {
    result: 'UPDATED',
  });

  assert.equal(metadata.result, 'UPDATED');
  assert.equal(metadata.sideEffectOperation, 'EMAIL_REPROCESS_EXECUTE');
  assert.equal(
    (metadata.sideEffectPolicy as { dryRunShouldExist: boolean })
      .dryRunShouldExist,
    true,
  );
});
