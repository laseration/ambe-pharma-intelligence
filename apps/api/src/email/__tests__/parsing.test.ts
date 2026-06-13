import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeEmailTextForParsing,
  parseStructuredPriceEmailBody,
} from '../parsing';

test('normalizes mojibake currency, odd whitespace, and dash variants for working parse text', () => {
  const result = normalizeEmailTextForParsing(
    'Amlodipine 5mg tabs 28\tÃ‚Â£8.40\r\n•\u00a0Paracetamol 500mg caplets 16 – â‚¬1.25',
  );

  assert.equal(
    result,
    [
      'Amlodipine 5mg tabs 28 £8.40',
      'Paracetamol 500mg caplets 16 - €1.25',
    ].join('\n'),
  );
});

test('clearly structured supplier offer email parses with high confidence', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Amlodipine 5mg tabs 28 - Â£8.40',
      'Paracetamol 500mg caplets 16 : Â£1.25',
    ].join('\n'),
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
  assert.equal(
    result.parsedRows[0].productCandidates.normalizedName,
    'amlodipine',
  );
});

test('mixed body with some valid lines and prose keeps skipped lines and review-oriented confidence', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Amlodipine 5mg tabs 28 - Â£8.40',
      'Please call me about the rest of the offer',
    ].join('\n'),
  );

  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.skippedLines.length, 1);
  assert.equal(result.overallConfidence, 'LOW');
  assert.equal(result.reviewRecommended, true);
  assert.equal(result.reviewRequired, result.reviewRecommended);
});

test('messy prose email does not get treated as a trusted structured offer', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Hello team,',
      'We can maybe do something around 8.40 if volumes work.',
      'Please call me.',
    ].join('\n'),
  );

  assert.equal(result.parsedRows.length, 0);
  assert.equal(result.overallConfidence, 'LOW');
  assert.equal(result.reviewRecommended, true);
  assert.equal(result.reviewRequired, result.reviewRecommended);
  assert.ok(result.skippedLines.length >= 1);
});

test('malformed prices are skipped conservatively', () => {
  const result = parseStructuredPriceEmailBody(
    ['Paracetamol 500mg caplets 16 : Â£1,25', 'Metformin 500mg 28 Â£3.10'].join(
      '\n',
    ),
  );

  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.rawProductName, 'Metformin 500mg 28');
  assert.equal(result.skippedLines.length, 1);
  assert.match(
    result.skippedLines[0]?.reason ?? '',
    /could not be parsed safely/i,
  );
  assert.equal(result.overallConfidence, 'LOW');
});

test('multiple currencies are handled conservatively', () => {
  const result = parseStructuredPriceEmailBody(
    ['Amlodipine 5mg tabs 28 - Â£8.40', 'Metformin 500mg 28 : $3.10'].join(
      '\n',
    ),
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
  const rawBody = [
    'Amlodipine 5mg tabs 28 - 8.40 GBP',
    'Paracetamol 500mg caplets 16 : 1.25 GBP',
  ].join('\r\n');
  const result = parseStructuredPriceEmailBody(rawBody);

  assert.equal(result.parsedRows.length, 2);
  assert.equal(result.parsedRows[0]?.currencyCode, 'GBP');
  assert.equal(result.rawBodyText, rawBody);
  assert.equal(result.rawBody, rawBody);
});

// --- Realistic supplier formats (characterization; no parser changes) ---

test('tab-separated supplier list parses each priced product line', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Amlodipine 5mg tabs 28\t8.40 GBP',
      'Metformin 500mg tabs 28\t3.10 GBP',
    ].join('\n'),
  );

  assert.equal(result.parsedRows.length, 2);
  assert.equal(result.parsedRows[0]?.currencyCode, 'GBP');
  assert.equal(result.parsedRows[0]?.strength, '5mg');
});

test('trailing ISO currency code without a symbol is still recognised', () => {
  const result = parseStructuredPriceEmailBody(
    'Ibuprofen 200mg tablets 30 - 0.95 GBP',
  );

  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.currencyCode, 'GBP');
  assert.equal(result.parsedRows[0]?.price, 0.95);
});

test('a polite supplier email still extracts its priced lines and asks for review on the prose', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Hi there,',
      'Please see our offer below:',
      'Amlodipine 5mg tabs 28 - 8.40 GBP',
      'Metformin 500mg tabs 28 - 3.10 GBP',
      'Kind regards,',
      'Supplier Co',
    ].join('\n'),
  );

  assert.equal(result.parsedRows.length, 2);
  // The prose/greeting lines are kept as skipped evidence and the email is
  // flagged for review rather than trusted outright.
  assert.ok(result.skippedLines.length >= 1);
  assert.equal(result.reviewRecommended, true);
});

// --- Trailing-metadata and alternate-delimiter supplier formats ---

test('an @-priced line with a trailing MOQ parses and extracts the MOQ', () => {
  const result = parseStructuredPriceEmailBody(
    'Paracetamol 500mg tablets 30 @ 8.40 GBP MOQ 100',
  );

  assert.equal(result.parsedRows.length, 1);
  const row = result.parsedRows[0];
  assert.ok(row);
  assert.equal(row.price, 8.4);
  assert.equal(row.currencyCode, 'GBP');
  assert.equal(row.strength, '500mg');
  assert.equal(row.minimumOrderQuantity, 100);
  // " @ " is an explicit price separator, so a fully detailed line is trusted.
  assert.equal(row.confidence, 'HIGH');
  assert.equal(result.overallConfidence, 'HIGH');
  assert.equal(result.reviewRecommended, false);
});

test('two @-priced supplier lines in one email both parse with their MOQs', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Paracetamol 500mg tablets 30 @ 8.40 GBP MOQ 100',
      'Ibuprofen 200mg tablets 30 @ 0.95 GBP MOQ 50',
    ].join('\n'),
  );

  assert.equal(result.parsedRows.length, 2);
  assert.equal(result.parsedRows[0]?.minimumOrderQuantity, 100);
  assert.equal(result.parsedRows[1]?.minimumOrderQuantity, 50);
  assert.equal(result.parsedRows[1]?.price, 0.95);
  assert.equal(result.overallConfidence, 'HIGH');
});

test('pipe-delimited supplier line parses product, price, and MOQ', () => {
  const result = parseStructuredPriceEmailBody(
    'Amlodipine 5mg | tablets | 28 | 8.40 GBP | MOQ 100',
  );

  assert.equal(result.parsedRows.length, 1);
  const row = result.parsedRows[0];
  assert.ok(row);
  assert.equal(row.strength, '5mg');
  assert.equal(row.price, 8.4);
  assert.equal(row.currencyCode, 'GBP');
  assert.equal(row.minimumOrderQuantity, 100);
});

test('tab-delimited supplier line with a trailing MOQ parses', () => {
  const result = parseStructuredPriceEmailBody(
    'Metformin 500mg tablets 28\t3.10 GBP\tMOQ 250',
  );

  assert.equal(result.parsedRows.length, 1);
  const row = result.parsedRows[0];
  assert.ok(row);
  assert.equal(row.strength, '500mg');
  assert.equal(row.price, 3.1);
  assert.equal(row.minimumOrderQuantity, 250);
});

test('a polite short email with no real product line still does not parse', () => {
  const result = parseStructuredPriceEmailBody(
    [
      'Hi there,',
      'Just checking in after our call earlier.',
      'Let me know if anything is useful.',
      'Speak soon,',
      'Sam',
    ].join('\n'),
  );

  assert.equal(result.parsedRows.length, 0);
  assert.equal(result.reviewRecommended, true);
});

test('a price with MOQ but no identifiable product stays low confidence and review-safe', () => {
  const result = parseStructuredPriceEmailBody('Item 8.40 GBP MOQ 100');

  // The trailing-metadata path must not bypass product-quality standards.
  assert.notEqual(result.overallConfidence, 'HIGH');
  assert.equal(result.reviewRecommended, true);
  for (const row of result.parsedRows) {
    assert.equal(row.confidence, 'LOW');
  }
});
