import assert from 'node:assert/strict';
import { test } from 'node:test';

import { previewRegulatoryIngest } from '../service';

test('preview ingest parses without persisting and returns content hash', () => {
  const result = previewRegulatoryIngest({
    sourceUrl: 'https://www.gov.uk/drug-device-alerts/example',
    title: 'Drug Alert: Amlodipine 5mg tablets - Class 2 Medicines Recall',
    publishedAt: new Date('2026-05-01T00:00:00.000Z'),
    rawText: 'Product: Amlodipine 5mg tablets 28\nClass 2 medicines recall.',
    regulator: 'MHRA',
    category: 'Drug alert',
  });

  assert.equal(result.contentHash.length, 64);
  assert.equal(result.parsed.eventType, 'RECALL');
  assert.equal(result.parsed.severity, 'HIGH');
  assert.match(result.parsed.summary, /Potentially relevant update/);
});
