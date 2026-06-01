import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { env } from '../../config/env';
import { db } from '../../lib/db';
import { listInboundEmailInboxItems } from '../inbound/service';
import { previewEmailBodyParsing } from '../service';

function stubMethod<
  TTarget extends object,
  TKey extends keyof TTarget & string,
>(
  t: TestContext,
  target: TTarget,
  methodName: TKey,
  implementation: TTarget[TKey],
) {
  const original = target[methodName];
  target[methodName] = implementation;
  t.after(() => {
    target[methodName] = original;
  });
}

test('email body preview preserves canonical raw body text and compatibility alias', async () => {
  const bodyText = 'Metformin 500mg 28 GBP 3.10';
  const result = await previewEmailBodyParsing(bodyText, {
    aiOfferParser: {
      parseText: async () => ({
        status: 'disabled',
        reason: 'OpenAI fallback is disabled for this unit test.',
        decision: 'disabled',
      }),
    },
  });

  assert.equal(result.rawBodyText, bodyText);
  assert.equal(result.rawBody, result.rawBodyText);
  assert.ok(result.parsedRows[0]);
  assert.equal(result.parsedRows[0].price, 3.1);
  assert.equal(result.parsedRows[0].confidence, 'MEDIUM');
});

test('email body preview uses injected parser instead of local OpenAI env', async (t) => {
  const previousOpenAiApiKey = env.openAiApiKey;
  const previousOpenAiParserEnabled = env.openAiParserEnabled;
  env.openAiApiKey = 'configured-openai-key-redacted';
  env.openAiParserEnabled = true;
  t.after(() => {
    env.openAiApiKey = previousOpenAiApiKey;
    env.openAiParserEnabled = previousOpenAiParserEnabled;
  });

  let parserCalls = 0;
  const result = await previewEmailBodyParsing(
    'Stock may be available for Metformin around 3.10 GBP.',
    {
      aiOfferParser: {
        parseText: async () => {
          parserCalls += 1;
          return {
            status: 'disabled',
            reason: 'Injected test parser prevents live OpenAI fallback.',
            decision: 'disabled',
          };
        },
      },
    },
  );

  assert.equal(parserCalls, 1);
  assert.equal(result.aiFallbackAttempted, true);
  assert.equal(result.aiFallbackDecision, 'disabled');
  assert.equal(result.aiFallbackUsed, false);
});

test('inbound inbox list supports received-only filter and returns counts', async (t) => {
  let capturedArgs: unknown;

  stubMethod(t, db.inboundEmail, 'findMany', (async (args: unknown) => {
    capturedArgs = args;

    return [
      {
        id: 'email-1',
        fromEmail: 'owner@ambe.test',
        fromName: 'Owner',
        subject: 'Forwarded offer',
        receivedAt: new Date('2026-04-24T10:00:00.000Z'),
        createdAt: new Date('2026-04-24T10:01:00.000Z'),
        processedAt: null,
        processingStatus: 'RECEIVED',
        triageStatus: null,
        parserConfidence: 'LOW',
        reviewReason: null,
        sourceTrustScore: 42,
        structureConfidence: 12,
        businessWorthinessScore: 28,
        _count: {
          documents: 3,
          extractionRuns: 1,
          derivedOffers: 0,
          offerWorkflowItems: 0,
        },
      },
    ];
  }) as unknown as typeof db.inboundEmail.findMany);

  const result = await listInboundEmailInboxItems({
    take: 200,
    status: 'RECEIVED_ONLY',
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.processingStatus, 'RECEIVED');
  assert.equal(result[0]?._count.offerWorkflowItems, 0);
  assert.deepEqual(capturedArgs, {
    where: {
      processingStatus: 'RECEIVED',
      derivedOffers: {
        none: {},
      },
      offerWorkflowItems: {
        none: {},
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
    select: {
      id: true,
      fromEmail: true,
      fromName: true,
      subject: true,
      receivedAt: true,
      createdAt: true,
      processedAt: true,
      processingStatus: true,
      triageStatus: true,
      parserConfidence: true,
      reviewReason: true,
      sourceTrustScore: true,
      structureConfidence: true,
      businessWorthinessScore: true,
      _count: {
        select: {
          documents: true,
          extractionRuns: true,
          derivedOffers: true,
          offerWorkflowItems: true,
        },
      },
    },
  });
});
