import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseRegulatoryUpdate } from '../parser';

test('maps MHRA recall wording to recall event and critical severity', () => {
  const parsed = parseRegulatoryUpdate({
    title: 'Drug Alert: Amlodipine 5mg tablets - Class 1 Medicines Recall',
    category: 'Drug alert',
    rawText: [
      'Product: Amlodipine 5mg tablets 28',
      'Batch number: ABC123',
      'Class 1 medicines recall. Stop supplying and quarantine stock immediately.',
    ].join('\n'),
  });

  assert.equal(parsed.eventType, 'RECALL');
  assert.equal(parsed.severity, 'CRITICAL');
  assert.equal(parsed.affectedProductText, 'Amlodipine 5mg tablets 28');
  assert.equal(parsed.batchNumber, 'ABC123');
  assert.match(parsed.summary, /Potentially relevant update/);
  assert.ok(
    parsed.evidence.evidenceSnippets.some((snippet) =>
      /Class 1/i.test(snippet),
    ),
  );
});

test('maps medicine defect wording and preserves safe evidence wording', () => {
  const parsed = parseRegulatoryUpdate({
    title: 'Medicine defect: Metformin 500mg tablets',
    rawText:
      'Manufacturer: Example Pharma\nMedicine defect reported for Metformin 500mg tablets.',
  });

  assert.equal(parsed.eventType, 'MEDICINE_DEFECT');
  assert.equal(parsed.severity, 'HIGH');
  assert.equal(parsed.manufacturer, 'Example Pharma');
  assert.match(
    parsed.evidence.safetyWording,
    /does not claim legal certainty/i,
  );
});

test('defaults vague regulatory content to other update and medium severity', () => {
  const parsed = parseRegulatoryUpdate({
    title: 'MHRA regulatory update',
    rawText: 'General information for medicine suppliers.',
  });

  assert.equal(parsed.eventType, 'OTHER_REGULATORY_UPDATE');
  assert.equal(parsed.severity, 'MEDIUM');
  assert.ok(parsed.confidence < 80);
});
