import assert from 'node:assert/strict';
import test from 'node:test';

import type { AccountOpeningUnifiedFillResult } from '../formFill';
import { buildAccountOpeningReviewEmailBody } from '../reviewEmail';

function fillResult(
  overrides: Partial<AccountOpeningUnifiedFillResult> = {},
): AccountOpeningUnifiedFillResult {
  return {
    format: 'DOCX',
    filledBytes: null,
    filledContentType: null,
    filledFileSuffix: '.docx',
    filledCount: 0,
    blankCount: 0,
    filledFields: [],
    blankFields: [],
    warnings: [],
    ...overrides,
  };
}

test('review email body labels a real fill as a review draft', () => {
  const body = buildAccountOpeningReviewEmailBody(
    'form.docx',
    'Acme Pharma',
    fillResult({
      filledCount: 1,
      filledFields: [
        { section: null, label: 'COMPANY NAME', value: 'AMBE LTD' },
      ],
    }),
  );
  assert.match(body, /REVIEW DRAFT/);
  assert.match(body, /Auto-filled \(1\)/);
  assert.match(body, /COMPANY NAME: AMBE LTD/);
});

test('review email body is honest when nothing was auto-filled', () => {
  const body = buildAccountOpeningReviewEmailBody(
    'form.docx',
    null,
    fillResult({ filledCount: 0 }),
  );
  assert.match(body, /COULD NOT AUTO-FILL/);
  // Must NOT claim it filled anything.
  assert.doesNotMatch(body, /has filled the safe fields/);
  assert.doesNotMatch(body, /Auto-filled \(0\)/);
});
