import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLocalAccountOpeningTestMessage,
  createAccountOpeningTestCase,
  LOCAL_ACCOUNT_OPENING_TEST_SENDER,
} from './createAccountOpeningTestCase';
import type { EmailInboundMessage } from '../email/inbound/types';
import type { ReviewQueueItem } from '../reviewQueue/service';

test('local account-opening test message is fake and contains no bank details', () => {
  const message = buildLocalAccountOpeningTestMessage();

  assert.equal(message.from, LOCAL_ACCOUNT_OPENING_TEST_SENDER);
  assert.equal(message.subject, 'Account opening form for AMBE LTD test');
  assert.match(
    message.bodyText ?? '',
    /Please complete this account opening form/,
  );
  assert.match(message.bodyText ?? '', /No real bank details are included/);
  assert.doesNotMatch(message.bodyText ?? '', /\b\d{8}\b/);
  assert.doesNotMatch(message.bodyText ?? '', /\b\d{2}-\d{2}-\d{2}\b/);
  assert.deepEqual(message.attachments, []);
});

test('script creates a pending account-opening case without buy or purchase workflow side effects', async () => {
  const ingestedMessages: EmailInboundMessage[] = [];
  let lookedUpFingerprint: string | null = null;

  const result = await createAccountOpeningTestCase({
    ingestMessage: async (message) => {
      ingestedMessages.push(message);

      return {
        ignored: false,
        items: [
          {
            processingStatus: 'REVIEW_REQUIRED',
            inferredImportType: null,
            confidence: 'HIGH',
            reason:
              'Account opening form detected - review required before completion/signing.',
            fileType: 'UNKNOWN',
            attachment: {
              fileName: null,
              mimeType: null,
              size: null,
              contentId: null,
              disposition: null,
            },
            email: {
              messageId: message.messageId ?? null,
              from: message.from,
              subject: message.subject ?? null,
              bodyText: message.bodyText ?? '',
            },
            accountOpeningCase: {
              sourceFingerprint: 'test-fingerprint',
            },
          },
        ],
      } as never;
    },
    findCaseByFingerprint: async (sourceFingerprint) => {
      lookedUpFingerprint = sourceFingerprint;

      return {
        id: 'account-case-test',
        status: 'PENDING_REVIEW',
        signingStatement:
          'Aman Dhillon can sign this account-opening form by default.',
      };
    },
    countBuyDecisions: async () => 4,
    countOfferWorkflowItems: async () => 7,
    listReviewQueueItems: async () => [
      {
        id: 'account-opening-account-case-test',
        sourceType: 'ACCOUNT_OPENING',
      } as ReviewQueueItem,
    ],
  });

  assert.equal(ingestedMessages[0]?.from, LOCAL_ACCOUNT_OPENING_TEST_SENDER);
  assert.equal(lookedUpFingerprint, 'test-fingerprint');
  assert.equal(result.id, 'account-case-test');
  assert.equal(result.status, 'PENDING_REVIEW');
  assert.equal(result.reviewQueueItemFound, true);
  assert.equal(result.buyDecisionCountDelta, 0);
  assert.equal(result.offerWorkflowItemCountDelta, 0);
  assert.equal(
    result.signingStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.equal(
    result.dashboardUrl,
    'http://localhost:3000/dashboard/account-opening/account-case-test',
  );
});
