import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_PARSER_PROMPT_VERSION, createOpenAiOfferParser } from '../service';

function createLogger() {
  return {
    warn: () => undefined,
    error: () => undefined,
  };
}

test('feature-disabled mode skips OpenAI entirely', async () => {
  let called = false;
  const parser = createOpenAiOfferParser({
    enabled: false,
    apiKey: 'test-key',
    fetchImpl: async () => {
      called = true;
      throw new Error('fetch should not run');
    },
    logger: createLogger(),
    model: 'gpt-5.4-mini',
    timeoutMs: 100,
  });

  const result = await parser.parseText({
    rawText: 'Messy offer text',
    source: 'EMAIL_BODY',
  });

  assert.equal(called, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.decision, 'disabled');
});

test('timeout or transport error is handled cleanly', async () => {
  const parser = createOpenAiOfferParser({
    enabled: true,
    apiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('network timeout');
    },
    logger: createLogger(),
    model: 'gpt-5.4-mini',
    timeoutMs: 100,
  });

  const result = await parser.parseText({
    rawText: 'Messy offer text with pricing context that should still attempt fallback.',
    source: 'TELEGRAM_TEXT',
  });

  assert.equal(result.status, 'error');
  assert.equal(result.decision, 'request_failed');
  assert.match(result.reason, /failed|timed out/i);
});

test('null-heavy AI output is rejected as unusable', async () => {
  const parser = createOpenAiOfferParser({
    enabled: true,
    apiKey: 'test-key',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    supplierName: null,
                    offers: [
                      {
                        rawLine: 'Hello there',
                        evidenceText: 'Hello there',
                        productText: null,
                        strength: null,
                        dosageForm: null,
                        packSize: null,
                        price: null,
                        currency: null,
                        availability: null,
                        minimumOrderQuantity: null,
                        manufacturer: null,
                        sourceSegment: 'UNKNOWN',
                        confidence: 'LOW',
                        reason: 'No usable commercial facts.',
                      },
                    ],
                    overallConfidence: 'LOW',
                    reviewRecommended: true,
                    notes: ['Too vague.'],
                  }),
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': 'req-null-heavy',
          },
        },
      ),
    logger: createLogger(),
    model: 'gpt-5.4-mini',
    timeoutMs: 100,
  });

  const result = await parser.parseText({
    rawText: 'Hello there, please review this vague commercial note for a possible offer.',
    source: 'EMAIL_BODY',
  });

  assert.equal(result.status, 'unusable');
  assert.equal(result.decision, 'response_unusable');
  assert.match(result.reason, /unusable/i);
});

test('obvious noisy forwarded text is reduced before AI call', async () => {
  let capturedPrompt = '';
  const parser = createOpenAiOfferParser({
    enabled: true,
    apiKey: 'test-key',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        input: Array<{ content: Array<{ text: string }> }>;
      };
      capturedPrompt = body.input[1]?.content[0]?.text ?? '';
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            supplierName: null,
            offers: [
              {
                rawLine: 'Metformin 500mg 28 3.10 GBP',
                evidenceText: 'Metformin 500mg 28 3.10 GBP',
                productText: 'Metformin 500mg 28',
                strength: '500mg',
                dosageForm: null,
                packSize: '28',
                price: 3.1,
                currency: 'GBP',
                availability: null,
                minimumOrderQuantity: null,
                manufacturer: null,
                sourceSegment: 'BODY_MAIN',
                confidence: 'MEDIUM',
                reason: 'Structured enough.',
              },
            ],
            overallConfidence: 'MEDIUM',
            reviewRecommended: true,
            notes: [],
          }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-reduced' } },
      );
    },
    logger: createLogger(),
    model: 'gpt-5.4-mini',
    timeoutMs: 100,
  });

  const result = await parser.parseText({
    rawText: [
      'Metformin 500mg 28 3.10 GBP',
      '----------',
      'From: Old Thread',
      'Sent: Yesterday',
      'This email is confidential and intended only for the recipient',
    ].join('\n'),
    source: 'EMAIL_BODY',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.decision, 'accepted');
  assert.equal(result.promptVersion, AI_PARSER_PROMPT_VERSION);
  assert.doesNotMatch(capturedPrompt, /From:\sOld Thread/i);
  assert.doesNotMatch(capturedPrompt, /This email is confidential/i);
  assert.doesNotMatch(capturedPrompt, /----------/);
  assert.match(capturedPrompt, /Metformin 500mg 28 3.10 GBP/);
  assert.match(capturedPrompt, /sourceSegment/i);
  assert.match(capturedPrompt, /evidenceText/i);
  assert.match(capturedPrompt, /Few-shot examples/i);
});

test('very short useless text does not trigger AI', async () => {
  let called = false;
  const parser = createOpenAiOfferParser({
    enabled: true,
    apiKey: 'test-key',
    fetchImpl: async () => {
      called = true;
      throw new Error('fetch should not run');
    },
    logger: createLogger(),
    model: 'gpt-5.4-mini',
    timeoutMs: 100,
    minChars: 24,
  });

  const result = await parser.parseText({
    rawText: 'Hi',
    source: 'TELEGRAM_TEXT',
  });

  assert.equal(called, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.decision, 'skipped_too_short');
});
