import { randomUUID } from 'node:crypto';

import { createEmailInboundService } from '../email/inbound/service';
import type {
  EmailInboundMessage,
  EmailInboundResult,
} from '../email/inbound/types';
import { db } from '../lib/db';
import {
  listReviewQueueItems,
  type ReviewQueueItem,
} from '../reviewQueue/service';

export const LOCAL_ACCOUNT_OPENING_TEST_SENDER =
  'local-account-opening@example.test';
export const LOCAL_ACCOUNT_OPENING_REVIEW_URL =
  'http://localhost:3000/dashboard/review';

type PersistedAccountOpeningCaseSummary = {
  id: string;
  status: string;
  signingStatement: string;
};

type CreateAccountOpeningTestCaseDependencies = {
  ingestMessage: (message: EmailInboundMessage) => Promise<EmailInboundResult>;
  findCaseByFingerprint: (
    sourceFingerprint: string,
  ) => Promise<PersistedAccountOpeningCaseSummary | null>;
  countBuyDecisions: () => Promise<number>;
  countOfferWorkflowItems: () => Promise<number>;
  listReviewQueueItems: () => Promise<ReviewQueueItem[]>;
};

export type CreateAccountOpeningTestCaseResult = {
  id: string;
  dashboardUrl: string;
  reviewQueueUrl: string;
  status: string;
  signingStatement: string;
  reviewQueueItemFound: boolean;
  buyDecisionCountDelta: number;
  offerWorkflowItemCountDelta: number;
};

export function buildLocalAccountOpeningTestMessage(): EmailInboundMessage {
  const messageId = `<local-account-opening-${randomUUID()}@example.test>`;

  return {
    sourceSystem: 'LOCAL_DEV_ACCOUNT_OPENING_TEST',
    externalMessageId: messageId,
    messageId,
    conversationId: messageId,
    from: LOCAL_ACCOUNT_OPENING_TEST_SENDER,
    fromName: 'Local Account Opening Test',
    subject: 'Account opening form for AMBE LTD test',
    bodyText: [
      'Please complete this account opening form for AMBE LTD t/a AMBE MEDICAL GROUP.',
      'A director signature box is present for review only.',
      'Direct Debit requested: No.',
      'No real bank details are included in this test message.',
    ].join('\n'),
    rawHtml: null,
    receivedAt: new Date(),
    supplierName: null,
    attachments: [],
  };
}

function createDefaultDependencies(): CreateAccountOpeningTestCaseDependencies {
  const service = createEmailInboundService({
    allowedSenders: [LOCAL_ACCOUNT_OPENING_TEST_SENDER],
  });

  return {
    ingestMessage: service.ingestMessage,
    findCaseByFingerprint: (sourceFingerprint) =>
      db.accountOpeningCase.findUnique({
        where: { sourceFingerprint },
        select: {
          id: true,
          status: true,
          signingStatement: true,
        },
      }),
    countBuyDecisions: () => db.buyDecision.count(),
    countOfferWorkflowItems: () => db.offerWorkflowItem.count(),
    listReviewQueueItems,
  };
}

export async function createAccountOpeningTestCase(
  dependencies: CreateAccountOpeningTestCaseDependencies = createDefaultDependencies(),
): Promise<CreateAccountOpeningTestCaseResult> {
  const buyDecisionCountBefore = await dependencies.countBuyDecisions();
  const offerWorkflowItemCountBefore =
    await dependencies.countOfferWorkflowItems();
  const result = await dependencies.ingestMessage(
    buildLocalAccountOpeningTestMessage(),
  );
  const accountOpeningCase = result.items[0]?.accountOpeningCase;

  if (!accountOpeningCase) {
    throw new Error(
      'Local test message did not produce an account-opening case.',
    );
  }

  const persistedCase = await dependencies.findCaseByFingerprint(
    accountOpeningCase.sourceFingerprint,
  );

  if (!persistedCase) {
    throw new Error('Account-opening case was not persisted.');
  }

  const reviewQueueItems = await dependencies.listReviewQueueItems();
  const reviewQueueItemFound = reviewQueueItems.some(
    (item) => item.id === `account-opening-${persistedCase.id}`,
  );
  const buyDecisionCountAfter = await dependencies.countBuyDecisions();
  const offerWorkflowItemCountAfter =
    await dependencies.countOfferWorkflowItems();

  return {
    id: persistedCase.id,
    dashboardUrl: `http://localhost:3000/dashboard/account-opening/${encodeURIComponent(persistedCase.id)}`,
    reviewQueueUrl: LOCAL_ACCOUNT_OPENING_REVIEW_URL,
    status: persistedCase.status,
    signingStatement: persistedCase.signingStatement,
    reviewQueueItemFound,
    buyDecisionCountDelta: buyDecisionCountAfter - buyDecisionCountBefore,
    offerWorkflowItemCountDelta:
      offerWorkflowItemCountAfter - offerWorkflowItemCountBefore,
  };
}

async function main() {
  const result = await createAccountOpeningTestCase();

  console.log('Local account-opening test case created');
  console.log(`AccountOpeningCase id: ${result.id}`);
  console.log(`Status: ${result.status}`);
  console.log(`Signing statement: ${result.signingStatement}`);
  console.log(`Dashboard URL: ${result.dashboardUrl}`);
  console.log(`Review queue URL: ${result.reviewQueueUrl}`);
  console.log(
    `Review queue item found: ${result.reviewQueueItemFound ? 'yes' : 'no'}`,
  );
  console.log(`BuyDecision count delta: ${result.buyDecisionCountDelta}`);
  console.log(
    `OfferWorkflowItem count delta: ${result.offerWorkflowItemCountDelta}`,
  );
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Failed to create account-opening test case.',
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
