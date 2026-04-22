import assert from 'node:assert/strict';
import test from 'node:test';

import { previewEmailBodyParsing } from '../service';

test('email body preview preserves canonical raw body text and compatibility alias', async () => {
  const bodyText = 'Metformin 500mg 28 GBP 3.10';
  const result = await previewEmailBodyParsing(bodyText);

  assert.equal(result.rawBodyText, bodyText);
  assert.equal(result.rawBody, result.rawBodyText);
  assert.ok(result.parsedRows[0]);
  assert.equal(result.parsedRows[0].price, 3.1);
  assert.equal(result.parsedRows[0].confidence, 'MEDIUM');
});
