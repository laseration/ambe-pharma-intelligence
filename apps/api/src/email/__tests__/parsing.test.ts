import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEmailTextForParsing, parseStructuredPriceEmailBody } from '../parsing';

test('normalizes mojibake currency, odd whitespace, and dash variants for working parse text', () => {
  const result = normalizeEmailTextForParsing(
    'Amlodipine 5mg tabs 28\tÃ‚Â£8.40\r\n•\u00a0Paracetamol 500mg caplets 16 – â‚¬1.25',
  );

  assert.equal(
    result,
    ['Amlodipine 5mg tabs 28 £8.40', 'Paracetamol 500mg caplets 16 - €1.25'].join('\n'),
  );
});

test('clearly structured supplier offer email parses with high confidence', () => {
  const result = parseStructuredPriceEmailBody(
    ['Amlodipine 5mg tabs 28 - Â£8.40', 'Paracetamol 500mg caplets 16 : Â£1.25'].join('\n'),
  );

  assert.equal(result.parsedRows.length, 2);
  assert.equal(result.overallConfidence, 'HIGH');
  assert.equal(result.reviewRecommended, false);
  assert.equal(result.reviewRequired, result.reviewRecommended);
  assert.equal(result.skippedLines.length, 0);
  assert.ok(result.parsedRows[0]);
  assert.equal(result.parsedRows[0].currencyCode, 'GBP');
  assert.equal(result.parsedRows[0].strength, '5mg');
  assert.equal(result.parsedRows[0].rawProductText, 'Amlodipine 5mg tabs 28');
  assert.equal(result.parsedRows[0].productCandidates.normalizedName, 'amlodipine');
});

test('mixed body with some valid lines and prose keeps skipped lines and review-oriented confidence', () => {
  const result = parseStructuredPriceEmailBody(
    ['Amlodipine 5mg tabs 28 - Â£8.40', 'Please call me about the rest of the offer'].join('\n'),
  );

  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.skippedLines.length, 1);
  assert.equal(result.overallConfidence, 'LOW');
  assert.equal(result.reviewRecommended, true);
  assert.equal(result.reviewRequired, result.reviewRecommended);
});

test('messy prose email does not get treated as a trusted structured offer', () => {
  const result = parseStructuredPriceEmailBody(
    ['Hello team,', 'We can maybe do something around 8.40 if volumes work.', 'Please call me.'].join(
      '\n',
    ),
  );

  assert.equal(result.parsedRows.length, 0);
  assert.equal(result.overallConfidence, 'LOW');
  assert.equal(result.reviewRecommended, true);
  assert.equal(result.reviewRequired, result.reviewRecommended);
  assert.ok(result.skippedLines.length >= 1);
});

test('malformed prices are skipped conservatively', () => {
  const result = parseStructuredPriceEmailBody(
    ['Paracetamol 500mg caplets 16 : Â£1,25', 'Metformin 500mg 28 Â£3.10'].join('\n'),
  );

  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.rawProductName, 'Metformin 500mg 28');
  assert.equal(result.skippedLines.length, 1);
  assert.match(result.skippedLines[0]?.reason ?? '', /could not be parsed safely/i);
  assert.equal(result.overallConfidence, 'LOW');
});

test('multiple currencies are handled conservatively', () => {
  const result = parseStructuredPriceEmailBody(
    ['Amlodipine 5mg tabs 28 - Â£8.40', 'Metformin 500mg 28 : $3.10'].join('\n'),
  );

  assert.equal(result.parsedRows.length, 2);
  assert.equal(result.overallConfidence, 'LOW');
  assert.equal(result.reviewRecommended, true);
});

test('weak product text downgrades row confidence', () => {
  const result = parseStructuredPriceEmailBody('Some tablets Â£8.40');

  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.confidence, 'LOW');
  assert.equal(result.overallConfidence, 'LOW');
});


test('deterministic parsing uses normalized working text but preserves raw source body', () => {
  const rawBody = ['Amlodipine 5mg tabs 28 - 8.40 GBP', 'Paracetamol 500mg caplets 16 : 1.25 GBP'].join(
    '\r\n',
  );
  const result = parseStructuredPriceEmailBody(rawBody);

  assert.equal(result.parsedRows.length, 2);
  assert.equal(result.parsedRows[0]?.currencyCode, 'GBP');
  assert.equal(result.rawBodyText, rawBody);
  assert.equal(result.rawBody, rawBody);
});
