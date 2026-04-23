import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMedicineName } from '../normalization';

test('normalizes amlodipine tablet variants to the same canonical key', () => {
  const inputs = [
    'Amlodipine 5mg tabs 28',
    'Amlodipine 5 mg tablets x 28',
    'AMLODIPINE 5MG TAB 28',
    'Amlodipine (5 mg) tab. x28',
    'Amlodipine 5mg tablets 28s',
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

test('normalizes safe microgram and pack-size shorthand variants to the same canonical key', () => {
  const inputs = [
    'Folic Acid 400 ug tabs x28',
    'Folic Acid 400mcg tablets 28s',
  ];

  const results = inputs.map((input) => normalizeMedicineName(input));

  for (const result of results) {
    assert.equal(result.normalizedKey, 'folic acid|400mcg|tablet|28');
    assert.equal(result.strength, '400mcg');
    assert.equal(result.formulation, 'tablet');
    assert.equal(result.packSize, '28');
  }
});

test('normalizes common formulation abbreviations conservatively', () => {
  const result = normalizeMedicineName('Vitamin B12 1mg inj. x 10');

  assert.equal(result.normalizedKey, 'vitamin b12|1mg|injection|10');
  assert.equal(result.formulation, 'injection');
  assert.equal(result.strength, '1mg');
  assert.equal(result.packSize, '10');
});

test('normalizes compound liquid suspension variants to the same canonical key', () => {
  const inputs = [
    'Amoxicillin 250mg/5ml oral suspension 100ml',
    'Amoxicillin 250 mg / 5 ml susp 100 ml',
  ];

  const results = inputs.map((input) => normalizeMedicineName(input));

  for (const result of results) {
    assert.equal(result.normalizedKey, 'amoxicillin|250mg/5ml|suspension|100');
    assert.equal(result.strength, '250mg/5ml');
    assert.equal(result.formulation, 'suspension');
    assert.equal(result.packSize, '100');
    assert.equal(result.confidence, 'HIGH');
  }
});

test('normalizes oral solution compound strengths conservatively', () => {
  const inputs = [
    'Morphine Sulfate 1mg/ml oral solution 100ml',
    'Morphine Sulfate 1 mg / ml oral soln 100 ml',
  ];

  const results = inputs.map((input) => normalizeMedicineName(input));

  for (const result of results) {
    assert.equal(result.normalizedKey, 'morphine sulfate|1mg/ml|solution|100');
    assert.equal(result.strength, '1mg/ml');
    assert.equal(result.formulation, 'solution');
    assert.equal(result.packSize, '100');
    assert.equal(result.confidence, 'HIGH');
  }
});

test('extracts compound injection strength without inventing a pack size', () => {
  const result = normalizeMedicineName('Ondansetron 2mg/1ml injection');

  assert.equal(result.normalizedKey, 'ondansetron|2mg/1ml|injection');
  assert.equal(result.strength, '2mg/1ml');
  assert.equal(result.formulation, 'injection');
  assert.equal(result.packSize, null);
  assert.equal(result.confidence, 'HIGH');
});

test('returns explainable output for incomplete names', () => {
  const result = normalizeMedicineName('Aspirin sachets');

  assert.equal(result.confidence, 'MEDIUM');
  assert.equal(result.formulation, 'sachet');
  assert.ok(result.explanation.rulesApplied.includes('built canonical normalized key from base name and extracted attributes'));
  assert.equal(result.explanation.cleanedInput, 'Aspirin sachets');
});
