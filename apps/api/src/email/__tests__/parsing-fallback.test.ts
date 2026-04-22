import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStructuredPriceText } from '../parsing';

test('deterministic high-confidence email body does not call AI fallback', async () => {
  let called = false;
  const rawBody = ['Amlodipine 5mg tabs 28 - Ã‚Â£8.40', 'Paracetamol 500mg caplets 16 : Ã‚Â£1.25'].join(
    '\r\n',
  );

  const result = await parseStructuredPriceText(rawBody, {
    aiOfferParser: {
      parseText: async () => {
        called = true;
        throw new Error('AI fallback should not run for high-confidence deterministic parsing.');
      },
    },
    source: 'EMAIL_BODY',
  });

  assert.equal(called, false);
  assert.equal(result.parsingSource, 'DETERMINISTIC');
  assert.equal(result.aiFallbackAttempted, false);
  assert.equal(result.aiFallbackUsed, false);
  assert.equal(result.overallConfidence, 'HIGH');
  assert.equal(result.rawBodyText, rawBody);
});

test('messy but commercially relevant email body can use AI fallback and return structured output', async () => {
  const bodyText = 'Acme can do Paracetamol 500mg caplets 16 at 1.25 GBP if needed, MOQ 20.';
  const result = await parseStructuredPriceText(bodyText, {
    aiOfferParser: {
      parseText: async () => ({
        status: 'success',
        reason: 'OpenAI fallback parser returned validated structured data.',
        decision: 'accepted',
        requestId: 'req-ai-1',
        promptVersion: 'supplier-offer-v3',
        reducedText: bodyText,
        result: {
          supplierName: 'Acme Pharma',
          offers: [
            {
              rawLine: bodyText,
              evidenceText: 'Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20.',
              productText: 'Paracetamol 500mg caplets 16',
              strength: '500mg',
              dosageForm: 'caplets',
              packSize: '16',
              price: 1.25,
              currency: 'GBP',
              availability: 'if needed',
              minimumOrderQuantity: 20,
              manufacturer: 'Acme',
              sourceSegment: 'BODY_MAIN',
              confidence: 'MEDIUM',
              reason: 'Message states a product, price, currency, and MOQ in one sentence.',
            },
          ],
          overallConfidence: 'MEDIUM',
          reviewRecommended: true,
          notes: ['Messy prose kept review-oriented.'],
        },
      }),
    },
    source: 'EMAIL_BODY',
  });

  assert.equal(result.parsingSource, 'OPENAI_FALLBACK');
  assert.equal(result.aiFallbackAttempted, true);
  assert.equal(result.aiFallbackUsed, true);
  assert.equal(result.aiFallbackDecision, 'accepted');
  assert.equal(result.aiPromptVersion, 'supplier-offer-v3');
  assert.equal(result.supplierName, 'Acme Pharma');
  assert.equal(result.rawBodyText, bodyText);
  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.rawProductText, 'Paracetamol 500mg caplets 16');
  assert.equal(result.parsedRows[0]?.availability, 'if needed');
  assert.equal(result.parsedRows[0]?.minimumOrderQuantity, 20);
  assert.equal(result.parsedRows[0]?.manufacturer, 'Acme');
  assert.equal(result.parsedRows[0]?.sourceSegment, 'BODY_MAIN');
  assert.equal(
    result.parsedRows[0]?.evidenceText,
    'Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20.',
  );
  assert.equal(result.reviewRecommended, true);
  assert.equal(result.overallConfidence, 'MEDIUM');
});

test('unusable AI output falls back safely without crashing', async () => {
  const result = await parseStructuredPriceText('Please send your best offer around 8.40.', {
    aiOfferParser: {
      parseText: async () => ({
        status: 'unusable',
        reason: 'OpenAI fallback parser returned unusable structured data.',
        decision: 'response_unusable',
        issues: ['AI parser output did not contain any offers with both product text and price.'],
        requestId: 'req-ai-2',
        promptVersion: 'supplier-offer-v3',
        reducedText: 'Please send your best offer around 8.40.',
      }),
    },
    source: 'EMAIL_BODY',
  });

  assert.equal(result.parsingSource, 'DETERMINISTIC');
  assert.equal(result.aiFallbackAttempted, true);
  assert.equal(result.aiFallbackUsed, false);
  assert.equal(result.aiFallbackDecision, 'response_unusable');
  assert.match(result.aiFallbackRejectedReason ?? '', /unusable structured data/i);
  assert.equal(result.parsedRows.length, 0);
  assert.equal(result.reviewRecommended, true);
  assert.match(result.notes?.join(' ') ?? '', /unusable structured data/i);
});

test('AI fallback result remains review-oriented when confidence is medium or low', async () => {
  const result = await parseStructuredPriceText('Stock maybe available for Metformin around 3.10 GBP.', {
    aiOfferParser: {
      parseText: async () => ({
        status: 'success',
        reason: 'OpenAI fallback parser returned validated structured data.',
        decision: 'accepted',
        requestId: 'req-ai-3',
        promptVersion: 'supplier-offer-v3',
        reducedText: 'Stock maybe available for Metformin around 3.10 GBP.',
        result: {
          supplierName: null,
          offers: [
            {
              rawLine: 'Stock maybe available for Metformin around 3.10 GBP.',
              evidenceText: 'Metformin around 3.10 GBP',
              productText: 'Metformin',
              strength: null,
              dosageForm: null,
              packSize: null,
              price: 3.1,
              currency: 'GBP',
              availability: 'maybe available',
              minimumOrderQuantity: null,
              manufacturer: null,
              sourceSegment: 'UNKNOWN',
              confidence: 'LOW',
              reason: 'The message is ambiguous and does not clearly specify the pack or formulation.',
            },
          ],
          overallConfidence: 'LOW',
          reviewRecommended: true,
          notes: ['Ambiguous message kept review-first.'],
        },
      }),
    },
    source: 'EMAIL_BODY',
  });

  assert.equal(result.parsingSource, 'OPENAI_FALLBACK');
  assert.equal(result.reviewRecommended, true);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.overallConfidence, 'LOW');
});
