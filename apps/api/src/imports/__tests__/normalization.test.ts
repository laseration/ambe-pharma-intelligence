import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMedicineName } from '../normalization';

test('normalizes amlodipine tablet variants to the same canonical key', () => {
  const inputs = [
    'Amlodipine 5mg tabs 28',
    'Amlodipine 5 mg tablets x 28',
    'AMLODIPINE 5MG TAB 28',
  ];

  const results = inputs.map((input) => normalizeMedicineName(input));

  for (const result of results) {
    assert.equal(result.normalizedKey, 'amlodipine|5mg|tablet|28');
    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.formulation, 'tablet');
    assert.equal(result.packSize, '28');
  }
});

test('keeps caplets distinct from tablets', () => {
  const result = normalizeMedicineName('Paracetamol 500mg caplets 16');

  assert.equal(result.normalizedKey, 'paracetamol|500mg|caplet|16');
  assert.equal(result.formulation, 'caplet');
  assert.equal(result.strength, '500mg');
  assert.equal(result.packSize, '16');
});

test('returns explainable output for incomplete names', () => {
  const result = normalizeMedicineName('Aspirin sachets');

  assert.equal(result.confidence, 'LOW');
  assert.ok(result.explanation.rulesApplied.includes('built canonical normalized key from base name and extracted attributes'));
  assert.equal(result.explanation.cleanedInput, 'Aspirin sachets');
});
