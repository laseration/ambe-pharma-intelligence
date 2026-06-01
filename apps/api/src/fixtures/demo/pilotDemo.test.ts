import assert from 'node:assert/strict';
import test from 'node:test';

import { loadPilotDemoFixture, PILOT_DEMO_MARKER } from './pilotDemo';

test('pilot demo fixture is clearly fake and uses stable identifiers', () => {
  const fixture = loadPilotDemoFixture();
  const ids = [
    fixture.user.id,
    fixture.supplier.id,
    fixture.customer.id,
    fixture.products.pending.id,
    fixture.products.completed.id,
    fixture.inboundEmail.id,
    fixture.document.id,
    fixture.extractionRun.id,
    fixture.offers.pending.id,
    fixture.offers.pending.workflowId,
    fixture.offers.completed.id,
    fixture.offers.completed.workflowId,
  ];

  assert.equal(fixture.marker, PILOT_DEMO_MARKER);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith('demo-pilot-')));
  assert.match(fixture.user.email, /@example\.test$/);
  assert.match(fixture.supplier.contactEmail, /@northstar-demo\.example\.test$/);
  assert.match(
    fixture.customer.primaryContactEmail,
    /@citycare-demo\.example\.test$/,
  );
  assert.match(fixture.inboundEmail.rawText, /FAKE DEMO SUPPLIER OFFER/);
  assert.doesNotMatch(fixture.inboundEmail.rawText, /@ambe/i);
});

test('pilot demo fixture keeps pending and completed paths separate', () => {
  const fixture = loadPilotDemoFixture();

  assert.notEqual(
    fixture.offers.pending.offerFingerprint,
    fixture.offers.completed.offerFingerprint,
  );
  assert.notEqual(
    fixture.offers.pending.workflowId,
    fixture.offers.completed.workflowId,
  );
  assert.equal(fixture.offers.pending.priceCandidate, '7.90');
  assert.equal(fixture.offers.completed.priceCandidate, '1.85');
});
